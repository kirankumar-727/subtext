"use server";

import { deriveContentMetrics } from "@subtext/content";
import { createSupabaseServerClient } from "@subtext/supabase/server";
import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import sharp from "sharp";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/authorization";
import type { StoryDraftInput } from "@/lib/cms/types";
import { dispatchPublishingWorker } from "@/lib/publishing/dispatch";
import {
  createStorySchema,
  initialSlug,
  sourceSchema,
  storyDraftSchema,
} from "@/lib/cms/validation";

export async function createStory(formData: FormData) {
  await requireAdmin();
  const input = createStorySchema.parse({
    title: formData.get("title"),
    pillarId: formData.get("pillarId"),
  });
  const markdown = `# ${input.title}\n\n`;
  const metrics = deriveContentMetrics(markdown);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_story_draft", {
    p_title: input.title,
    p_slug: initialSlug(input.title),
    p_excerpt: "",
    p_body_markdown: markdown,
    p_body_plain_text: metrics.bodyPlainText,
    p_pillar_id: input.pillarId,
    p_category_id: null,
    p_word_count: metrics.wordCount,
    p_reading_time_minutes: metrics.readingTimeMinutes,
  });
  if (error || !data?.[0]) throw new Error("Unable to create story");
  redirect(`/admin/stories/${data[0].article_id}`);
}

export async function saveStoryDraft(input: StoryDraftInput) {
  await requireAdmin();
  const draft = storyDraftSchema.parse(input);
  const metrics = deriveContentMetrics(draft.markdown);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("save_story_draft", {
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
    p_seo_title: draft.seoTitle,
    p_seo_description: draft.seoDescription,
    p_word_count: metrics.wordCount,
    p_reading_time_minutes: metrics.readingTimeMinutes,
  });
  if (error || !data?.[0]) {
    return {
      ok: false as const,
      code: error?.code === "40001" ? "conflict" : "save_failed",
      message:
        error?.code === "40001"
          ? "This story changed in another session."
          : "Draft could not be saved.",
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
  if (error || !data?.[0])
    return { ok: false as const, message: "Publication request failed validation." };
  revalidatePath(`/admin/stories/${request.articleId}`);
  revalidatePath("/admin/stories");
  after(async () => {
    await dispatchPublishingWorker();
  });
  return { ok: true as const, value: data[0] };
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
  if (error) throw new Error("Unable to create source");
  revalidatePath("/admin/sources");
}

const mediaInputSchema = z.object({
  altText: z.string().trim().min(1).max(500),
  caption: z.string().trim().max(1000).optional(),
  credit: z.string().trim().max(300).optional(),
  rightsStatus: z.enum([
    "owned",
    "licensed",
    "public_domain",
    "creative_commons",
    "permission_granted",
  ]),
});
const imageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

function safeFilename(name: string) {
  return (
    name
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "image"
  );
}

export async function createMediaUploadIntent(input: {
  filename: string;
  mimeType: string;
  byteSize: number;
  checksumSha256: string;
  altText: string;
  caption?: string;
  credit?: string;
  rightsStatus: string;
}) {
  const admin = await requireAdmin();
  const fields = mediaInputSchema.parse(input);
  if (
    input.byteSize <= 0 ||
    input.byteSize > 25 * 1024 * 1024 ||
    !imageMimeTypes.has(input.mimeType)
  ) {
    throw new Error("Unsupported image");
  }
  if (!/^[0-9a-f]{64}$/.test(input.checksumSha256)) throw new Error("Invalid checksum");
  const id = randomUUID();
  const originalKey = `${id}/original-${safeFilename(input.filename)}`;
  const supabase = await createSupabaseServerClient();
  const { error: assetError } = await supabase.from("media_assets").insert({
    id,
    kind: "image",
    original_filename: input.filename,
    original_storage_key: originalKey,
    checksum_sha256: input.checksumSha256,
    mime_type: input.mimeType,
    byte_size: input.byteSize,
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

export async function finalizeMediaUpload(mediaAssetId: string) {
  await requireAdmin();
  const id = z.uuid().parse(mediaAssetId);
  const supabase = await createSupabaseServerClient();
  const { data: asset, error: assetReadError } = await supabase
    .from("media_assets")
    .select("*")
    .eq("id", id)
    .single();
  if (assetReadError || !asset || asset.processing_status !== "pending")
    throw new Error("Upload is not ready to process");
  const { data: original, error: downloadError } = await supabase.storage
    .from("media-originals")
    .download(asset.original_storage_key);
  if (downloadError || !original) throw new Error("Uploaded original could not be read");
  const bytes = Buffer.from(await original.arrayBuffer());
  if (
    bytes.byteLength !== asset.byte_size ||
    createHash("sha256").update(bytes).digest("hex") !== asset.checksum_sha256
  ) {
    await supabase
      .from("media_assets")
      .update({ processing_status: "failed", processing_error: "Upload integrity check failed" })
      .eq("id", id);
    throw new Error("Upload integrity check failed");
  }
  const image = sharp(bytes, { failOn: "error" }).rotate();
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) throw new Error("Image dimensions could not be read");
  await supabase
    .from("media_assets")
    .update({ processing_status: "processing", width: metadata.width, height: metadata.height })
    .eq("id", id);
  try {
    const widths = [640, 1280, 1920].filter((width) => width <= metadata.width!);
    if (widths.length === 0) widths.push(metadata.width);
    const variants = [];
    for (const width of [...new Set(widths)]) {
      const variantBytes = await image
        .clone()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      const key = `${id}/w${width}.webp`;
      const upload = await supabase.storage
        .from("media-public")
        .upload(key, variantBytes, { contentType: "image/webp", upsert: false });
      if (upload.error) throw upload.error;
      const variantMeta = await sharp(variantBytes).metadata();
      variants.push({
        media_asset_id: id,
        variant_name: `w${width}`,
        storage_key: key,
        mime_type: "image/webp",
        format: "webp",
        width: variantMeta.width ?? width,
        height: variantMeta.height ?? Math.round((metadata.height! / metadata.width!) * width),
        byte_size: variantBytes.byteLength,
        checksum_sha256: createHash("sha256").update(variantBytes).digest("hex"),
        is_public: true,
      });
    }
    const { error: variantsError } = await supabase.from("media_variants").insert(variants);
    if (variantsError) throw variantsError;
    const { error: readyError } = await supabase
      .from("media_assets")
      .update({ processing_status: "ready", processing_error: null })
      .eq("id", id);
    if (readyError) throw readyError;
  } catch {
    await supabase
      .from("media_assets")
      .update({
        processing_status: "failed",
        processing_error: "Deterministic image processing failed",
      })
      .eq("id", id);
    throw new Error("Image processing failed");
  }
  revalidatePath("/admin/media");
  return { ok: true as const };
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
