import { createClient } from "npm:@supabase/supabase-js@2.112.2";
import {
  isRetryableWorkerError,
  validatePublicationSnapshot,
} from "../_shared/publishing-policy.ts";

class WorkerError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    message: string,
  ) {
    super(message);
  }
}
function required(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
function workerAuthorized(request: Request) {
  const expected = Deno.env.get("PUBLISHING_WORKER_SECRET") ?? "";
  const actual = request.headers.get("x-subtext-worker-secret") ?? "";
  if (!expected || expected.length !== actual.length) return false;
  let different = 0;
  for (let i = 0; i < expected.length; i++)
    different |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
  return different === 0;
}

function supabaseSecretKey() {
  const localFallback = Deno.env.get("SUPABASE_SECRET_KEY");
  if (localFallback) return localFallback;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>;
    if (keys.default) return keys.default;
  } catch {
    // Invalid platform configuration fails closed below.
  }
  throw new Error("Missing Supabase secret key configuration");
}

const supabase = createClient(required("SUPABASE_URL"), supabaseSecretKey(), {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const publicationApi = new URL(
  "/api/internal/publication",
  required("PUBLICATION_API_URL"),
).toString();
const revalidationSecret = required("REVALIDATION_SECRET");

async function event(
  jobId: string,
  step: string,
  level: "info" | "warning" | "error",
  message: string,
  details: Record<string, unknown> | null = null,
) {
  await supabase.rpc("append_publication_event", {
    p_job_id: jobId,
    p_step: step,
    p_level: level,
    p_message: message,
    p_details: details,
  });
}
async function publicApi(body: Record<string, unknown>) {
  let response: Response;
  try {
    response = await fetch(publicationApi, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-subtext-revalidation-secret": revalidationSecret,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new WorkerError("public_api_network", true, "Public application request failed");
  }
  if (!response.ok)
    throw new WorkerError(
      response.status === 422 ? "render_rejected" : "public_api_failure",
      isRetryableWorkerError("public_api_failure", response.status),
      `Public application returned ${response.status}`,
    );
  return response.json();
}

async function snapshot(job: any) {
  const articleResult = await supabase
    .from("articles")
    .select(
      "id,canonical_slug,canonical_path,primary_pillar_id,category_id,current_draft_revision_id,published_revision_id",
    )
    .eq("id", job.article_id)
    .maybeSingle();
  if (articleResult.error) throw articleResult.error;
  const article = articleResult.data;
  if (job.action === "unpublish") return { action: job.action, article };
  const revisionResult = await supabase
    .from("article_revisions")
    .select("id,article_id,title,body_markdown,seo_description,content_checksum")
    .eq("id", job.target_revision_id)
    .maybeSingle();
  const [pillarResult, categoryResult, citationResult, mediaRelationResult] = await Promise.all([
    article
      ? supabase.from("pillars").select("id").eq("id", article.primary_pillar_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    article?.category_id
      ? supabase
          .from("categories")
          .select("id,pillar_id")
          .eq("id", article.category_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("citations")
      .select("source_id,is_public")
      .eq("revision_id", job.target_revision_id),
    supabase
      .from("article_media")
      .select("media_asset_id")
      .eq("revision_id", job.target_revision_id),
  ]);
  for (const result of [
    revisionResult,
    pillarResult,
    categoryResult,
    citationResult,
    mediaRelationResult,
  ])
    if (result.error) throw result.error;
  const sourceIds = [...new Set((citationResult.data ?? []).map((item: any) => item.source_id))];
  const mediaAssetIds = (mediaRelationResult.data ?? []).map((item: any) => item.media_asset_id);
  const [sourcesResult, mediaResult, variantsResult] = await Promise.all([
    sourceIds.length
      ? supabase.from("sources").select("id").in("id", sourceIds)
      : Promise.resolve({ data: [], error: null }),
    mediaAssetIds.length
      ? supabase
          .from("media_assets")
          .select("id,processing_status,rights_status,original_storage_key")
          .in("id", mediaAssetIds)
      : Promise.resolve({ data: [], error: null }),
    mediaAssetIds.length
      ? supabase
          .from("media_variants")
          .select("media_asset_id")
          .in("media_asset_id", mediaAssetIds)
          .eq("is_public", true)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [sourcesResult, mediaResult, variantsResult])
    if (result.error) throw result.error;
  return {
    action: job.action,
    article,
    revision: revisionResult.data,
    expectedChecksum: job.expected_content_checksum,
    pillar: pillarResult.data,
    category: categoryResult.data,
    citations: citationResult.data ?? [],
    sourceIds: (sourcesResult.data ?? []).map((item: any) => item.id),
    media: mediaResult.data ?? [],
    mediaAssetIds,
    publicVariantAssetIds: (variantsResult.data ?? []).map((item: any) => item.media_asset_id),
  };
}

async function processJob(job: any, workerId: string) {
  try {
    await event(job.id, "processing_started", "info", "Publication processing started.", {
      attempt: job.attempt_count,
      status: job.status,
    });
    let commit: any;
    if (job.status === "processing") {
      const data = await snapshot(job);
      const issues = validatePublicationSnapshot(data as any);
      if (issues.length) {
        await event(job.id, "validation_failed", "error", "Publication validation failed.", {
          issues,
        });
        throw new WorkerError("validation_failed", false, "Validation failed");
      }
      await event(job.id, "validation_passed", "info", "Revision and media validation passed.");
      if (job.action !== "unpublish")
        await publicApi({ mode: "preflight", markdown: (data as any).revision.body_markdown });
      const committed = await supabase.rpc("commit_publication_job", {
        p_job_id: job.id,
        p_worker_id: workerId,
      });
      if (committed.error || !committed.data?.[0])
        throw committed.error ?? new Error("Commit returned no result");
      commit = committed.data[0];
    } else {
      const article = await supabase
        .from("articles")
        .select("id,canonical_path,primary_pillar_id,category_id")
        .eq("id", job.article_id)
        .single();
      if (article.error) throw article.error;
      const pillar = await supabase
        .from("pillars")
        .select("slug")
        .eq("id", article.data.primary_pillar_id)
        .single();
      const category = article.data.category_id
        ? await supabase
            .from("categories")
            .select("slug")
            .eq("id", article.data.category_id)
            .single()
        : { data: null, error: null };
      commit = {
        article_id: article.data.id,
        publication_action: job.action,
        canonical_path: article.data.canonical_path,
        pillar_slug: pillar.data?.slug,
        category_slug: category.data?.slug ?? null,
        content_checksum: job.expected_content_checksum,
        target_revision_id: job.target_revision_id,
        already_committed: true,
      };
    }
    if (job.status !== "verifying") {
      const verifying = await supabase.rpc("mark_publication_job_verifying", {
        p_job_id: job.id,
        p_worker_id: workerId,
      });
      if (verifying.error) throw verifying.error;
    }
    await supabase.rpc("extend_publication_job_lease", {
      p_job_id: job.id,
      p_worker_id: workerId,
      p_lease_seconds: 120,
    });
    const redirectResult = await supabase
      .from("redirects")
      .select("from_path")
      .eq("article_id", job.article_id)
      .eq("is_active", true);
    if (redirectResult.error) throw redirectResult.error;
    const verification = await publicApi({
      mode: "revalidate",
      articleId: commit.article_id,
      action: commit.publication_action,
      canonicalPath: commit.canonical_path,
      pillarSlug: commit.pillar_slug,
      categorySlug: commit.category_slug,
      contentChecksum: commit.content_checksum,
      redirectPaths: (redirectResult.data ?? []).map((item: any) => item.from_path),
    });
    await event(
      job.id,
      "cache_revalidated",
      "info",
      "Public routes, sitemap, and RSS were revalidated.",
    );
    await event(job.id, "search_verified", "info", "Search projection consistency verified.");
    const succeeded = await supabase.rpc("succeed_publication_job", {
      p_job_id: job.id,
      p_worker_id: workerId,
      p_details: verification,
    });
    if (succeeded.error) throw succeeded.error;
    return { id: job.id, status: "succeeded" };
  } catch (error) {
    const code = error instanceof WorkerError ? error.code : "worker_failure";
    const retryable = error instanceof WorkerError ? error.retryable : true;
    await supabase.rpc("fail_publication_job", {
      p_job_id: job.id,
      p_worker_id: workerId,
      p_error_code: code,
      p_error_detail: { message: error instanceof Error ? error.message : "Unknown worker error" },
      p_retryable: retryable,
    });
    return { id: job.id, status: retryable ? "retry_scheduled" : "failed" };
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST")
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  if (!workerAuthorized(request)) return Response.json({ error: "forbidden" }, { status: 403 });
  const workerId = `edge-${crypto.randomUUID()}`;
  const claimed = await supabase.rpc("claim_publication_jobs", {
    claiming_worker_id: workerId,
    batch_size: 3,
    lease_seconds: 120,
  });
  if (claimed.error) return Response.json({ error: "claim_failed" }, { status: 503 });
  const results = [];
  for (const job of claimed.data ?? []) results.push(await processJob(job, workerId));
  return Response.json(
    { claimed: results.length, results },
    { headers: { "Cache-Control": "no-store" } },
  );
});
