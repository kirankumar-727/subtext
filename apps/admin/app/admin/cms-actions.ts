"use server";

import { deriveContentMetrics, slugify } from "@subtext/content";
import { createSupabaseServerClient } from "@subtext/supabase/server";
import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/authorization";
import { isSupportedImageUpload, mediaUploadRequestSchema, safeFilename } from "@/lib/cms/media";
import type { MediaItem, SourceItem, SourceType, StoryDraftInput, TagItem } from "@/lib/cms/types";
import type { ImportPreview } from "@/lib/cms/story-package-import";
import { dispatchPublishingWorker } from "@/lib/publishing/dispatch";
import { processMediaAsset } from "@/lib/cms/media-processing";
import {
  createCategorySchema,
  createPillarSchema,
  createStorySchema,
  initialSlug,
  sourceSchema,
  storyDraftSchema,
  tagInputSchema,
  updateCategorySchema,
  updatePillarSchema,
  updateTagSchema,
} from "@/lib/cms/validation";

async function readCurrentDraftForConflict(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  articleId: string,
): Promise<StoryDraftInput | null> {
  const { data: article, error: articleError } = await supabase
    .from("articles")
    .select("row_version,canonical_slug,primary_pillar_id,category_id,current_draft_revision_id")
    .eq("id", articleId)
    .maybeSingle();

  if (articleError || !article?.current_draft_revision_id) return null;

  const revisionId = article.current_draft_revision_id;
  const [revisionResult, tagsResult, citationsResult, mediaResult] = await Promise.all([
    supabase
      .from("article_revisions")
      .select("title,dek,body_markdown,seo_title,seo_description")
      .eq("id", revisionId)
      .maybeSingle(),
    supabase.from("article_tags").select("tag_id").eq("article_id", articleId),
    supabase
      .from("citations")
      .select("source_id,ordinal")
      .eq("revision_id", revisionId)
      .order("ordinal"),
    supabase
      .from("article_media")
      .select("media_asset_id,role,position")
      .eq("revision_id", revisionId)
      .order("position"),
  ]);

  if (
    revisionResult.error ||
    tagsResult.error ||
    citationsResult.error ||
    mediaResult.error ||
    !revisionResult.data
  ) {
    return null;
  }

  const currentDraft = {
    articleId,
    rowVersion: Number(article.row_version),
    title: revisionResult.data.title,
    slug: article.canonical_slug,
    excerpt: revisionResult.data.dek ?? "",
    markdown: revisionResult.data.body_markdown,
    pillarId: article.primary_pillar_id,
    categoryId: article.category_id,
    tagIds: (tagsResult.data ?? []).map((row) => row.tag_id),
    sourceIds: (citationsResult.data ?? []).map((row) => row.source_id),
    coverMediaAssetId:
      (mediaResult.data ?? []).find((row) => row.role === "hero")?.media_asset_id ?? null,
    mediaAssetIds: (mediaResult.data ?? []).map((row) => row.media_asset_id),
    seoTitle: revisionResult.data.seo_title ?? "",
    seoDescription: revisionResult.data.seo_description ?? "",
  };
  const parsed = storyDraftSchema.safeParse(currentDraft);
  return parsed.success ? parsed.data : null;
}

function sourceFingerprint(source: z.infer<typeof sourceSchema>) {
  return createHash("sha256")
    .update(
      [source.title, source.authorText ?? "", source.url ?? "", source.doi ?? ""]
        .map((value) => value.toLowerCase())
        .join("\n"),
    )
    .digest("hex");
}

export async function createStory(formData: FormData) {
  await requireAdmin();
  const input = createStorySchema.parse({
    title: formData.get("title"),
    pillarId: formData.get("pillarId"),
  });
  const markdown = `# ${input.title}\n\n`;
  const metrics = deriveContentMetrics(markdown);
  const supabase = await createSupabaseServerClient();
  let slug = initialSlug(input.title);
  const { data: existingSlug } = await supabase
    .from("articles")
    .select("id")
    .eq("canonical_slug", slug)
    .maybeSingle();
  if (existingSlug) slug = `${slug}-${randomUUID().slice(0, 8)}`;

  const { data, error } = await supabase.rpc("create_story_draft", {
    p_title: input.title,
    p_slug: slug,
    p_excerpt: "",
    p_body_markdown: markdown,
    p_body_plain_text: metrics.bodyPlainText,
    p_pillar_id: input.pillarId,
    p_category_id: null,
    p_word_count: metrics.wordCount,
    p_reading_time_minutes: metrics.readingTimeMinutes,
  });

  if (error || !data?.[0]) {
    throw new Error("Unable to create story");
  }

  redirect(`/admin/stories/${data[0].article_id}`);
}

export async function saveStoryDraft(input: StoryDraftInput) {
  await requireAdmin();
  const draft = storyDraftSchema.parse(input);
  const metrics = deriveContentMetrics(draft.markdown);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("save_story_draft_with_media", {
    p_article_id: draft.articleId,
    p_expected_row_version: draft.rowVersion,
    p_title: draft.title,
    p_slug: draft.slug,
    p_excerpt: draft.excerpt,
    p_body_markdown: draft.markdown,
    p_body_plain_text: metrics.bodyPlainText,
    p_pillar_id: draft.pillarId,
    p_category_id: draft.categoryId,
    p_tag_ids: draft.tagIds,
    p_source_ids: draft.sourceIds,
    p_cover_media_asset_id: draft.coverMediaAssetId,
    p_media_asset_ids: draft.mediaAssetIds,
    p_seo_title: draft.seoTitle,
    p_seo_description: draft.seoDescription,
    p_word_count: metrics.wordCount,
    p_reading_time_minutes: metrics.readingTimeMinutes,
  });

  if (error || !data?.[0]) {
    if (error?.code === "40001") {
      return {
        ok: false as const,
        code: "conflict" as const,
        message:
          "This story changed in another session. Review the current server draft before saving.",
        currentDraft: await readCurrentDraftForConflict(supabase, draft.articleId),
      };
    }

    return {
      ok: false as const,
      code: "save_failed" as const,
      message: "Draft could not be saved.",
    };
  }

  revalidatePath(`/admin/stories/${draft.articleId}`);
  revalidatePath("/admin/stories");
  return { ok: true as const, value: data[0] };
}

const publicationSchema = z.object({
  articleId: z.uuid(),
  action: z.enum(["publish", "republish", "rollback", "unpublish"]),
  targetRevisionId: z.uuid().nullable(),
});

export async function requestStoryPublication(input: z.infer<typeof publicationSchema>) {
  await requireAdmin();
  const request = publicationSchema.parse(input);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("request_story_publication", {
    p_article_id: request.articleId,
    p_action: request.action,
    p_target_revision_id: request.targetRevisionId,
    p_idempotency_key: randomUUID(),
  });
  if (error || !data?.[0]) {
    return {
      ok: false as const,
      message:
        error?.code === "23514"
          ? "Publication request failed validation. Check required media, citations, rights, and SEO metadata."
          : "Publication request could not be queued.",
    };
  }
  revalidatePath(`/admin/stories/${request.articleId}`);
  revalidatePath("/admin/stories");
  after(async () => {
    await dispatchPublishingWorker();
  });
  return { ok: true as const, value: data[0] };
}

export async function createTag(input: { name: string; description?: string | undefined }) {
  await requireAdmin();
  const parsed = tagInputSchema.parse(input);
  const slug = slugify(parsed.name);
  if (!slug) throw new Error("Invalid tag name");
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("tags")
    .insert({
      name: parsed.name,
      slug,
      description: parsed.description || null,
      is_active: true,
    })
    .select("id,name,slug")
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: existing } = await supabase
        .from("tags")
        .select("id,name,slug")
        .eq("name", parsed.name)
        .single();
      if (existing) {
        return { ok: true as const, tag: existing as TagItem };
      }
    }
    throw new Error("Unable to create tag");
  }

  revalidatePath("/admin/stories");
  revalidatePath("/admin/tags");
  return { ok: true as const, tag: data as TagItem };
}

function editorialMutationMessage(error: { code?: string } | null, fallback: string) {
  if (error?.code === "23505") return "That name or slug is already in use.";
  if (error?.code === "23503") return "The selected editorial relationship no longer exists.";
  if (error?.code === "23514")
    return "The editorial record does not satisfy the existing database rules.";
  return fallback;
}

export async function createPillar(input: {
  name: string;
  description?: string | undefined;
  sortOrder?: number | undefined;
}) {
  await requireAdmin();
  const parsed = createPillarSchema.parse({
    name: input.name,
    description: input.description,
    sortOrder: input.sortOrder ?? 0,
  });
  const slug = slugify(parsed.name);
  if (!slug) throw new Error("Invalid pillar name");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("pillars")
    .insert({
      name: parsed.name,
      slug,
      description: parsed.description || null,
      sort_order: parsed.sortOrder,
      is_active: true,
    })
    .select("id,name,slug,description,sort_order,is_active,created_at,updated_at")
    .single();
  if (error || !data) {
    return {
      ok: false as const,
      message: editorialMutationMessage(error, "Pillar could not be created."),
    };
  }
  revalidatePath("/admin/pillars");
  revalidatePath("/admin/categories");
  revalidatePath("/admin/stories");
  return { ok: true as const, pillar: data };
}

export async function updatePillar(input: {
  id: string;
  description?: string | undefined;
  sortOrder?: number | undefined;
}) {
  await requireAdmin();
  const parsed = updatePillarSchema.parse({
    id: input.id,
    description: input.description,
    sortOrder: input.sortOrder ?? 0,
  });
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("pillars")
    .update({
      description: parsed.description || null,
      sort_order: parsed.sortOrder,
    })
    .eq("id", parsed.id)
    .select("id,name,slug,description,sort_order,is_active,created_at,updated_at")
    .single();
  if (error || !data) {
    return {
      ok: false as const,
      message: editorialMutationMessage(error, "Pillar could not be updated."),
    };
  }
  revalidatePath("/admin/pillars");
  revalidatePath("/admin/categories");
  revalidatePath("/admin/stories");
  return { ok: true as const, pillar: data };
}

export async function createCategory(input: {
  pillarId: string;
  name: string;
  description?: string | undefined;
  sortOrder?: number | undefined;
}) {
  await requireAdmin();
  const parsed = createCategorySchema.parse({
    pillarId: input.pillarId,
    name: input.name,
    description: input.description,
    sortOrder: input.sortOrder ?? 0,
  });
  const slug = slugify(parsed.name);
  if (!slug) throw new Error("Invalid category name");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("categories")
    .insert({
      pillar_id: parsed.pillarId,
      name: parsed.name,
      slug,
      description: parsed.description || null,
      sort_order: parsed.sortOrder,
      is_active: true,
    })
    .select("id,pillar_id,name,slug,description,sort_order,is_active,created_at,updated_at")
    .single();
  if (error || !data) {
    return {
      ok: false as const,
      message: editorialMutationMessage(error, "Category could not be created."),
    };
  }
  revalidatePath("/admin/categories");
  revalidatePath("/admin/stories");
  return { ok: true as const, category: data };
}

export async function updateCategory(input: {
  id: string;
  description?: string | undefined;
  sortOrder?: number | undefined;
}) {
  await requireAdmin();
  const parsed = updateCategorySchema.parse({
    id: input.id,
    description: input.description,
    sortOrder: input.sortOrder ?? 0,
  });
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("categories")
    .update({
      description: parsed.description || null,
      sort_order: parsed.sortOrder,
    })
    .eq("id", parsed.id)
    .select("id,pillar_id,name,slug,description,sort_order,is_active,created_at,updated_at")
    .single();
  if (error || !data) {
    return {
      ok: false as const,
      message: editorialMutationMessage(error, "Category could not be updated."),
    };
  }
  revalidatePath("/admin/categories");
  revalidatePath("/admin/stories");
  return { ok: true as const, category: data };
}

export async function updateTag(input: { id: string; description?: string | undefined }) {
  await requireAdmin();
  const parsed = updateTagSchema.parse(input);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tags")
    .update({ description: parsed.description || null })
    .eq("id", parsed.id)
    .select("id,name,slug,description,is_active,created_at,updated_at")
    .single();
  if (error || !data) {
    return {
      ok: false as const,
      message: editorialMutationMessage(error, "Tag could not be updated."),
    };
  }
  revalidatePath("/admin/tags");
  revalidatePath("/admin/stories");
  return { ok: true as const, tag: data };
}

export async function createSourceInline(input: {
  sourceType: SourceType;
  title: string;
  authorText?: string | undefined;
  publisher?: string | undefined;
  url?: string | undefined;
  archiveUrl?: string | undefined;
  isbn?: string | undefined;
  doi?: string | undefined;
}) {
  const admin = await requireAdmin();
  const source = sourceSchema.parse(input);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("sources")
    .insert({
      source_type: source.sourceType,
      title: source.title,
      author_text: source.authorText || null,
      publisher: source.publisher || null,
      url: source.url || null,
      archive_url: source.archiveUrl || null,
      isbn: source.isbn || null,
      doi: source.doi || null,
      created_by: admin.userId,
    })
    .select("id,title,author_text,publisher,source_type,url,archive_url,isbn,doi")
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: existing } = await supabase
        .from("sources")
        .select("id,title,author_text,publisher,source_type,url,archive_url,isbn,doi")
        .eq("source_fingerprint", sourceFingerprint(source))
        .maybeSingle();
      if (existing) {
        return { ok: true as const, source: existing as SourceItem };
      }
    }
    throw new Error("Unable to create source");
  }
  revalidatePath("/admin/sources");
  revalidatePath("/admin/stories");
  return { ok: true as const, source: data as SourceItem };
}

export async function createSource(formData: FormData) {
  const admin = await requireAdmin();
  const source = sourceSchema.parse({
    sourceType: formData.get("sourceType"),
    title: formData.get("title"),
    authorText: formData.get("authorText"),
    publisher: formData.get("publisher"),
    url: formData.get("url"),
    archiveUrl: formData.get("archiveUrl"),
    isbn: formData.get("isbn"),
    doi: formData.get("doi"),
  });
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("sources").insert({
    source_type: source.sourceType,
    title: source.title,
    author_text: source.authorText || null,
    publisher: source.publisher || null,
    url: source.url || null,
    archive_url: source.archiveUrl || null,
    isbn: source.isbn || null,
    doi: source.doi || null,
    created_by: admin.userId,
  });
  if (error) {
    if (error.code === "23505") {
      const { data: existing } = await supabase
        .from("sources")
        .select("id")
        .eq("source_fingerprint", sourceFingerprint(source))
        .maybeSingle();
      if (existing) return;
    }
    throw new Error("Unable to create source");
  }
  revalidatePath("/admin/sources");
}

export async function createMediaUploadIntent(input: {
  filename: string;
  mimeType: string;
  byteSize: number;
  checksumSha256: string;
  altText: string;
  caption?: string | undefined;
  credit?: string | undefined;
  rightsStatus: string;
}) {
  const admin = await requireAdmin();
  const fields = mediaUploadRequestSchema.parse(input);
  if (!isSupportedImageUpload(fields)) throw new Error("Unsupported image or checksum");
  const id = randomUUID();
  const originalKey = `${id}/original-${safeFilename(fields.filename)}`;
  const supabase = await createSupabaseServerClient();
  const { error: assetError } = await supabase.from("media_assets").insert({
    id,
    kind: "image",
    original_filename: fields.filename,
    original_storage_key: originalKey,
    checksum_sha256: fields.checksumSha256,
    mime_type: fields.mimeType,
    byte_size: fields.byteSize,
    default_alt_text: fields.altText,
    default_caption: fields.caption || null,
    credit_text: fields.credit || null,
    rights_status: fields.rightsStatus,
    processing_status: "pending",
    uploaded_by: admin.userId,
  });
  if (assetError) throw new Error("Media metadata could not be created");
  const { data, error } = await supabase.storage
    .from("media-originals")
    .createSignedUploadUrl(originalKey, { upsert: false });
  if (error || !data?.signedUrl || !data.token) {
    await supabase.from("media_assets").delete().eq("id", id);
    throw new Error("Upload could not be initialized");
  }
  return { id, path: originalKey, token: data.token };
}

export async function finalizeMediaUpload(
  mediaAssetId: string,
): Promise<{ ok: true; media: MediaItem }> {
  await requireAdmin();
  const id = z.uuid().parse(mediaAssetId);
  const supabase = await createSupabaseServerClient();
  const media = await processMediaAsset(supabase, id);

  revalidatePath("/admin/media");
  revalidatePath("/admin/stories");

  return { ok: true as const, media };
}

export async function updateSiteSettings(formData: FormData) {
  const admin = await requireAdmin();
  const brandName = z.string().trim().min(1).max(100).parse(formData.get("brandName"));
  const tagline = z.string().trim().min(1).max(200).parse(formData.get("tagline"));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("site_settings").upsert([
    {
      key: "brand.name",
      value: brandName,
      is_public: true,
      description: "Public publication name.",
      updated_by: admin.userId,
    },
    {
      key: "brand.tagline",
      value: tagline,
      is_public: true,
      description: "Public brand philosophy.",
      updated_by: admin.userId,
    },
  ]);
  if (error) throw new Error("Settings could not be saved");
  revalidatePath("/admin/settings");
}

// ---------------------------------------------------------------------------
// Story lifecycle
// ---------------------------------------------------------------------------

const deleteStorySchema = z.object({
  articleId: z.uuid(),
});

export async function deleteStoryDraft(input: { articleId: string }) {
  await requireAdmin();
  const { articleId } = deleteStorySchema.parse(input);
  const supabase = await createSupabaseServerClient();

  // Verify the story exists and is NOT published
  const { data: article, error: readError } = await supabase
    .from("articles")
    .select("id,status,published_revision_id")
    .eq("id", articleId)
    .single();

  if (readError || !article) {
    return { ok: false as const, message: "Story not found." };
  }

  if (article.status === "published") {
    return {
      ok: false as const,
      message: "A published story cannot be deleted. Unpublish it first, then delete.",
    };
  }

  if (
    article.status === "publishing" ||
    article.status === "scheduled" ||
    article.status === "published_pending_verification"
  ) {
    return {
      ok: false as const,
      message:
        "This story is currently in the publication pipeline. Cancel or wait for it to finish, then delete.",
    };
  }

  // Archive the story (soft delete)
  const { error: updateError } = await supabase
    .from("articles")
    .update({
      status: "archived",
      archived_at: new Date().toISOString(),
    })
    .eq("id", articleId);

  if (updateError) {
    return { ok: false as const, message: "Story could not be deleted." };
  }

  revalidatePath("/admin/stories");
  revalidatePath(`/admin/stories/${articleId}`);
  return { ok: true as const };
}

export async function validateStoryPackage(
  zipBytes: Uint8Array,
): Promise<
  | {
      ok: true;
      preview: ImportPreview;
      packageJson: string;
    }
  | {
      ok: false;
      errors: Array<{ code: string; level: "error" | "warning"; message: string }>;
      warnings: Array<{ code: string; level: "error" | "warning"; message: string }>;
    }
> {
  await requireAdmin();

  const { parseStoryPackage } = await import("@/lib/cms/story-package");
  const { generateImportPreview } = await import("@/lib/cms/story-package-import");

  const result = await parseStoryPackage(zipBytes);

  if (!result.ok) {
    return { ok: false, errors: result.errors, warnings: result.warnings };
  }

  const preview = await generateImportPreview(result.pkg);

  // Serialize text-only metadata for the import step.
  // Binary image data is NOT included — the client will re-send the
  // original ZIP bytes alongside this packageJson for the import step.
  const packageJson = JSON.stringify({
    storyMarkdown: result.pkg.storyMarkdown,
    frontmatter: result.pkg.frontmatter,
    imageMeta: result.pkg.images.map((img) => ({
      archivePath: img.archivePath,
      extension: img.extension,
    })),
    sources: result.pkg.sources,
    metadataFiles: result.pkg.metadataFiles,
    allPaths: result.pkg.allPaths,
    parsedSources: result.pkg.parsedSources,
    imageMetadata: result.pkg.imageMetadata,
  });

  return { ok: true, preview, packageJson };
}

export async function importStoryPackage(
  packageJson: string,
  zipBytes: Uint8Array,
): Promise<
  | { ok: true; articleId: string; coverMediaAssetId: string | null }
  | { ok: false; errors: Array<{ code: string; message: string }> }
> {
  await requireAdmin();

  const { parseStoryPackage } = await import("@/lib/cms/story-package");
  const { executeStoryImport } = await import("@/lib/cms/story-package-import");

  // Re-parse the ZIP to extract image binary data.
  // This avoids round-tripping base64 image bytes through the server-action response.
  const parseResult = await parseStoryPackage(zipBytes);
  if (!parseResult.ok) {
    return {
      ok: false,
      errors: parseResult.errors.map((e) => ({
        code: e.code,
        message: e.message,
      })),
    };
  }

  // Deserialize the text-only metadata
  const raw = JSON.parse(packageJson) as {
    storyMarkdown: string;
    frontmatter: Record<string, unknown>;
    imageMeta: Array<{ archivePath: string; extension: string }>;
    sources: Array<{ archivePath: string; text: string }>;
    metadataFiles: Record<string, string>;
    allPaths: string[];
    parsedSources: Array<{
      ordinal: number;
      title: string;
      author: string | null;
      url: string | null;
      isbn: string | null;
      doi: string | null;
      publisher: string | null;
      sourceType: string;
    }>;
    imageMetadata: Array<{
      filename: string;
      altText: string | null;
      caption: string | null;
      credit: string | null;
      rightsStatus: string;
      role: string | null;
    }>;
  };

  // Reconstruct the package using re-parsed image data from the ZIP
  const parsedImagesByPath = new Map(
    parseResult.pkg.images.map((img) => [img.archivePath, img]),
  );

  const pkg = {
    storyMarkdown: raw.storyMarkdown,
    frontmatter: raw.frontmatter,
    images: raw.imageMeta.map((meta) => {
      const parsed = parsedImagesByPath.get(meta.archivePath);
      return {
        archivePath: meta.archivePath,
        data: parsed?.data ?? new Uint8Array(0),
        extension: meta.extension,
      };
    }),
    sources: raw.sources,
    metadataFiles: raw.metadataFiles,
    allPaths: raw.allPaths,
    parsedSources: parseResult.pkg.parsedSources,
    imageMetadata: parseResult.pkg.imageMetadata,
  };

  const result = await executeStoryImport(pkg);

  if (result.ok) {
    revalidatePath("/admin/stories");
    revalidatePath(`/admin/stories/${result.articleId}`);
    return {
      ok: true,
      articleId: result.articleId,
      coverMediaAssetId: result.coverMediaAssetId,
    };
  }

  return { ok: false, errors: result.errors };
}
