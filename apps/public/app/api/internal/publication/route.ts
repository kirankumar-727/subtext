import "server-only";

import { renderMarkdownToHtml } from "@subtext/content";
import { createSupabasePublicServerClient } from "@subtext/supabase/public-server";
import { timingSafeEqual } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { buildRevalidationPlan, verifyProjection } from "@/lib/publication";

const preflightSchema = z.object({
  mode: z.literal("preflight"),
  markdown: z.string().min(1).max(2_000_000),
});
const revalidateSchema = z.object({
  mode: z.literal("revalidate"),
  articleId: z.uuid(),
  action: z.enum(["publish", "republish", "rollback", "unpublish"]),
  canonicalPath: z.string().startsWith("/"),
  pillarSlug: z.string().min(1),
  categorySlug: z.string().nullable(),
  contentChecksum: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
  redirectPaths: z.array(z.string().startsWith("/")).max(100),
});

function authorized(request: Request) {
  const configured = process.env.REVALIDATION_SECRET;
  const provided = request.headers.get("x-subtext-revalidation-secret");
  if (!configured || !provided) return false;
  const expected = Buffer.from(configured);
  const actual = Buffer.from(provided);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function renderSafely(markdown: string) {
  const html = await renderMarkdownToHtml(markdown);
  if (/<script\b|\son[a-z]+\s*=|javascript:/i.test(html))
    throw new Error("Unsafe rendered content");
  return { htmlLength: html.length };
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "forbidden" }, { status: 403 });
  try {
    const raw: unknown = await request.json();
    if (typeof raw === "object" && raw !== null && "mode" in raw && raw.mode === "preflight") {
      const input = preflightSchema.parse(raw);
      return Response.json(
        { ok: true, ...(await renderSafely(input.markdown)) },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const input = revalidateSchema.parse(raw);
    const plan = buildRevalidationPlan({
      articleId: input.articleId,
      canonicalPath: input.canonicalPath,
      pillarSlug: input.pillarSlug,
      categorySlug: input.categorySlug,
      redirectPaths: input.redirectPaths,
    });
    for (const path of plan.paths) revalidatePath(path);
    for (const tag of plan.tags) revalidateTag(tag, "max");

    const supabase = createSupabasePublicServerClient();
    const [articleResult, searchResult] = await Promise.all([
      supabase
        .from("published_articles")
        .select("id,revision_id,canonical_path,content_checksum,body_markdown")
        .eq("id", input.articleId)
        .maybeSingle(),
      supabase
        .from("search_projection")
        .select("article_id,revision_id,canonical_path")
        .eq("article_id", input.articleId)
        .maybeSingle(),
    ]);
    if (articleResult.error || searchResult.error)
      throw new Error("Public projection query failed");

    const projectedArticle =
      articleResult.data?.content_checksum && articleResult.data.canonical_path
        ? {
            content_checksum: articleResult.data.content_checksum,
            canonical_path: articleResult.data.canonical_path,
          }
        : null;
    const projectedSearch = searchResult.data?.canonical_path
      ? { canonical_path: searchResult.data.canonical_path }
      : null;
    if (
      !verifyProjection({
        action: input.action,
        expectedChecksum: input.contentChecksum,
        expectedPath: input.canonicalPath,
        article: projectedArticle,
        search: projectedSearch,
      })
    ) {
      throw new Error("Public projection does not match publication intent");
    }
    if (articleResult.data?.body_markdown) await renderSafely(articleResult.data.body_markdown);

    if (input.redirectPaths.length) {
      const redirects = await supabase
        .from("public_redirects")
        .select("from_path,to_path,http_status")
        .in("from_path", input.redirectPaths);
      if (redirects.error || redirects.data.length !== input.redirectPaths.length)
        throw new Error("Redirect projection is incomplete");
    }

    return Response.json(
      {
        ok: true,
        articleVisible: Boolean(articleResult.data),
        searchVisible: Boolean(searchResult.data),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "publication_verification_failed" },
      { status: 422, headers: { "Cache-Control": "no-store" } },
    );
  }
}
