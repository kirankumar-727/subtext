/**
 * Story Package Import — transaction logic.
 *
 * Maps a validated StoryPackage into the existing SubText CMS
 * (articles, revisions, tags, sources, citations, media, SEO).
 *
 * Transaction safety: all validation happens BEFORE any Supabase writes.
 * If the import fails after partial writes, we clean up.
 */

import "server-only";

import { deriveContentMetrics, slugify } from "@subtext/content";
import { createSupabaseServerClient } from "@subtext/supabase/server";
import { createHash, randomUUID } from "node:crypto";

import { requireAdmin } from "@/lib/auth/authorization";
import type { SourceType } from "@/lib/cms/types";
import type { StoryFrontmatter, StoryPackage } from "./story-package";
import { deriveSlug } from "./story-package";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ImportPreview = {
  title: string;
  slug: string;
  pillarName: string;
  categoryName: string | null;
  authorName: string;
  wordCount: number;
  readingTimeMinutes: number;
  citationCount: number;
  mediaCount: number;
  seoTitle: string;
  seoDescription: string;
  tagNames: string[];
  /** Warnings that don't block import */
  warnings: ImportWarning[];
  /** Errors that block import */
  errors: ImportError[];
  /** Whether the import can proceed */
  canImport: boolean;
};

export type ImportWarning = {
  code: string;
  message: string;
};

export type ImportError = {
  code: string;
  message: string;
};

export type ImportResult =
  | { ok: true; articleId: string; revisionId: string; coverMediaAssetId: string | null }
  | { ok: false; errors: ImportError[] };

// ---------------------------------------------------------------------------
// Preview generation
// ---------------------------------------------------------------------------

/**
 * Generate an import preview from a validated package.
 * This is read-only — it does NOT create any persistent data.
 */
export async function generateImportPreview(
  pkg: StoryPackage,
): Promise<ImportPreview> {
  const fm = pkg.frontmatter as StoryFrontmatter;
  const errors: ImportError[] = [];
  const warnings: ImportWarning[] = [];

  // Re-derive content metrics from the body
  const metrics = deriveContentMetrics(pkg.storyMarkdown);

  // Resolve pillar
  const supabase = await createSupabaseServerClient();
  const { data: pillars } = await supabase
    .from("pillars")
    .select("id,name,slug")
    .eq("is_active", true);

  let pillarId: string | null = null;
  let pillarName = fm.pillar;
  if (typeof fm.pillar === "string") {
    const pillarSlug = slugify(fm.pillar);
    const match = (pillars ?? []).find(
      (p) => p.slug === pillarSlug || p.name.toLowerCase() === fm.pillar.toLowerCase(),
    );
    if (match) {
      pillarId = match.id;
      pillarName = match.name;
    } else {
      errors.push({
        code: "pillar_not_found",
        message: `The pillar "${fm.pillar}" does not exist in SubText. Create it before importing.`,
      });
    }
  }

  // Resolve category
  let categoryName: string | null = null;
  if (fm.category && pillarId) {
    const { data: categories } = await supabase
      .from("categories")
      .select("id,name,slug,pillar_id")
      .eq("is_active", true);
    const categorySlug = slugify(fm.category);
    const match = (categories ?? []).find(
      (c) =>
        c.pillar_id === pillarId &&
        (c.slug === categorySlug || c.name.toLowerCase() === fm.category!.toLowerCase()),
    );
    if (match) {
      categoryName = match.name;
    } else {
      warnings.push({
        code: "category_not_found",
        message: `The category "${fm.category}" was not found under pillar "${String(pillarName)}". The story will be imported without a category.`,
      });
    }
  }

  // Check slug uniqueness
  const slug = deriveSlug(fm);
  const { data: existingSlug } = await supabase
    .from("articles")
    .select("id")
    .eq("canonical_slug", slug)
    .maybeSingle();
  if (existingSlug) {
    warnings.push({
      code: "slug_collision",
      message: `The slug "${slug}" is already in use. A unique suffix will be added during import.`,
    });
  }

  // Check tags
  if (fm.tags && fm.tags.length > 0) {
    const { data: existingTags } = await supabase
      .from("tags")
      .select("id,name,slug")
      .eq("is_active", true);
    const existingTagSlugs = new Set((existingTags ?? []).map((t) => t.slug));
    for (const tagName of fm.tags) {
      const tagSlug = slugify(tagName);
      if (!existingTagSlugs.has(tagSlug)) {
        warnings.push({
          code: "tag_will_be_created",
          message: `The tag "${tagName}" does not exist and will be created.`,
        });
      }
    }
  }

  // Check image rights (from frontmatter images array)
  if (fm.images) {
    for (const img of fm.images) {
      if (img.rights === "pending" || img.rights === "unknown") {
        warnings.push({
          code: "image_rights_unresolved",
          message: `Image "${img.file}" has unresolved rights (${img.rights}). Publication will be blocked until rights are resolved.`,
        });
      }
    }
  }
  // Check image rights (from metadata/media.md when no frontmatter images array)
  if (!fm.images && pkg.images.length > 0 && pkg.imageMetadata.length > 0) {
    for (const meta of pkg.imageMetadata) {
      if (meta.rightsStatus === "pending" || meta.rightsStatus === "unknown") {
        warnings.push({
          code: "image_rights_unresolved",
          message: `Image "${meta.filename}" has unresolved rights (${meta.rightsStatus}) from metadata/media.md. Publication will be blocked until rights are resolved.`,
        });
      }
    }
  }

  // Citation count: prefer frontmatter citations, fall back to parsed sources.md
  const citationCount = fm.citations?.length ?? pkg.parsedSources.length ?? 0;
  // Media count: prefer frontmatter images, fall back to discovered images
  const mediaCount = fm.images?.length ?? pkg.images.length ?? 0;

  return {
    title: fm.title,
    slug,
    pillarName: typeof pillarName === "string" ? pillarName : String(pillarName),
    categoryName,
    authorName: fm.author,
    wordCount: metrics.wordCount,
    readingTimeMinutes: metrics.readingTimeMinutes,
    citationCount,
    mediaCount,
    seoTitle: fm.seo_title ?? fm.title,
    seoDescription: fm.seo_description ?? fm.excerpt ?? "",
    tagNames: fm.tags ?? [],
    warnings,
    errors,
    canImport: errors.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Import execution
// ---------------------------------------------------------------------------

/**
 * Execute the import: create article, revision, tags, sources, citations,
 * media records.
 *
 * Returns the article ID if successful.
 * Cleans up on failure.
 */
export async function executeStoryImport(
  pkg: StoryPackage,
): Promise<ImportResult> {
  const admin = await requireAdmin();
  const fm = pkg.frontmatter as StoryFrontmatter;
  const supabase = await createSupabaseServerClient();

  const errors: ImportError[] = [];

  // --- Re-validate pillar ---
  const pillarSlug = slugify(fm.pillar);
  const { data: pillar } = await supabase
    .from("pillars")
    .select("id")
    .eq("is_active", true)
    .or(`slug.eq.${pillarSlug},name.ilike.${fm.pillar}`)
    .maybeSingle();

  if (!pillar) {
    return {
      ok: false,
      errors: [
        {
          code: "pillar_not_found",
          message: `Pillar "${fm.pillar}" does not exist.`,
        },
      ],
    };
  }

  // --- Resolve category ---
  let categoryId: string | null = null;
  if (fm.category) {
    const categorySlug = slugify(fm.category);
    const { data: category } = await supabase
      .from("categories")
      .select("id")
      .eq("is_active", true)
      .eq("pillar_id", pillar.id)
      .or(`slug.eq.${categorySlug},name.ilike.${fm.category}`)
      .maybeSingle();
    if (category) {
      categoryId = category.id;
    }
  }

  // --- Derive slug (with collision handling) ---
  let slug = deriveSlug(fm);
  const { data: existingSlug } = await supabase
    .from("articles")
    .select("id")
    .eq("canonical_slug", slug)
    .maybeSingle();
  if (existingSlug) {
    slug = `${slug}-${randomUUID().slice(0, 8)}`;
  }

  // --- Compute metrics ---
  const metrics = deriveContentMetrics(pkg.storyMarkdown);

  // --- Prepare article data for RPC ---
  const seoTitle = fm.seo_title ?? "";
  const seoDescription = fm.seo_description ?? fm.excerpt ?? "";
  const excerpt = fm.excerpt ?? "";

  // --- Create the story draft via existing RPC ---
  const { data: storyResult, error: storyError } = await supabase.rpc(
    "create_story_draft",
    {
      p_title: fm.title,
      p_slug: slug,
      p_excerpt: excerpt,
      p_body_markdown: pkg.storyMarkdown,
      p_body_plain_text: metrics.bodyPlainText,
      p_pillar_id: pillar.id,
      p_category_id: categoryId,
      p_word_count: metrics.wordCount,
      p_reading_time_minutes: metrics.readingTimeMinutes,
    },
  );

  if (storyError || !storyResult?.[0]) {
    return {
      ok: false,
      errors: [
        {
          code: "story_creation_failed",
          message: "The story could not be created in the database.",
        },
      ],
    };
  }

  const articleId = storyResult[0].article_id as string;
  const rowVersion = storyResult[0].row_version as number;

  // Track created resources for cleanup on failure
  const createdTagIds: string[] = [];
  const createdSourceIds: string[] = [];
  const createdMediaAssetIds: string[] = [];
  // Track successfully created media for linking to the revision
  type MediaPlacementEntry = {
    mediaAssetId: string;
    altText: string;
    caption: string | null;
    credit: string | null;
    isCover: boolean;
  };
  const mediaPlacements: MediaPlacementEntry[] = [];

  try {
    // --- Create/reconcile tags ---
    const tagIds: string[] = [];
    if (fm.tags && fm.tags.length > 0) {
      for (const tagName of fm.tags) {
        const tagSlug = slugify(tagName);
        // Try to find existing tag
        const { data: existingTag } = await supabase
          .from("tags")
          .select("id")
          .eq("slug", tagSlug)
          .maybeSingle();

        if (existingTag) {
          tagIds.push(existingTag.id);
        } else {
          // Create new tag
          const { data: newTag, error: tagError } = await supabase
            .from("tags")
            .insert({
              name: tagName,
              slug: tagSlug,
              is_active: true,
            })
            .select("id")
            .single();

          if (tagError || !newTag) {
            errors.push({
              code: "tag_creation_failed",
              message: `Failed to create tag "${tagName}".`,
            });
            continue;
          }
          createdTagIds.push(newTag.id);
          tagIds.push(newTag.id);
        }
      }
    }

    // --- Create sources and collect source IDs ---
    const sourceIds: string[] = [];

    // Build the list of citations to import: prefer frontmatter citations,
    // fall back to parsed sources from sources.md footnote registry.
    type CitationInput = {
      source: string;
      author?: string | undefined;
      url?: string | undefined;
      doi?: string | undefined;
      type?: string | undefined;
      isbn?: string | undefined;
      publisher?: string | undefined;
      archive_url?: string | undefined;
    };
    let citationsToImport: CitationInput[] = [];

    if (fm.citations && fm.citations.length > 0) {
      citationsToImport = fm.citations.map((c) => ({
        source: c.source,
        author: c.author,
        url: c.url,
        doi: c.doi,
        type: c.type,
        isbn: c.isbn,
        publisher: c.publisher,
        archive_url: c.archive_url,
      }));
    } else if (pkg.parsedSources.length > 0) {
      citationsToImport = pkg.parsedSources.map((ps) => ({
        source: ps.title,
        author: ps.author ?? undefined,
        url: ps.url ?? undefined,
        doi: ps.doi ?? undefined,
        type: ps.sourceType,
        isbn: ps.isbn ?? undefined,
        publisher: ps.publisher ?? undefined,
      }));
    }

    for (const citation of citationsToImport) {
      const sourceType: SourceType = (citation.type as SourceType) ?? "other";

      // Check for existing source by fingerprint
      const fingerprint = createHash("sha256")
        .update(
          [
            citation.source,
            citation.author ?? "",
            citation.url ?? "",
            citation.doi ?? "",
          ]
            .map((v) => v.toLowerCase())
            .join("\n"),
        )
        .digest("hex");

      const { data: existingSource } = await supabase
        .from("sources")
        .select("id")
        .eq("source_fingerprint", fingerprint)
        .maybeSingle();

      if (existingSource) {
        sourceIds.push(existingSource.id);
      } else {
        const { data: newSource, error: sourceError } = await supabase
          .from("sources")
          .insert({
            source_type: sourceType,
            title: citation.source,
            author_text: citation.author || null,
            publisher: citation.publisher || null,
            url: citation.url || null,
            archive_url: citation.archive_url || null,
            isbn: citation.isbn || null,
            doi: citation.doi || null,
            created_by: admin.userId,
          })
          .select("id")
          .single();

        if (sourceError || !newSource) {
          errors.push({
            code: "source_creation_failed",
            message: `Failed to create source "${citation.source}".`,
          });
          continue;
        }
        createdSourceIds.push(newSource.id);
        sourceIds.push(newSource.id);
      }
    }

    // --- Update the draft with tags, sources, SEO metadata ---
    const { data: saveResult, error: saveError } = await supabase.rpc("save_story_draft", {
      p_article_id: articleId,
      p_expected_row_version: rowVersion,
      p_title: fm.title,
      p_slug: slug,
      p_excerpt: excerpt,
      p_body_markdown: pkg.storyMarkdown,
      p_body_plain_text: metrics.bodyPlainText,
      p_pillar_id: pillar.id,
      p_category_id: categoryId,
      p_tag_ids: tagIds,
      p_source_ids: sourceIds,
      p_cover_media_asset_id: null,
      p_seo_title: seoTitle,
      p_seo_description: seoDescription,
      p_word_count: metrics.wordCount,
      p_reading_time_minutes: metrics.readingTimeMinutes,
      p_citation_options: [],
      p_media_placements: [],
    });

    if (saveError || !saveResult?.[0]) {
      errors.push({
        code: "draft_save_failed",
        message: "Failed to save imported draft metadata.",
      });
      throw new Error("Draft save failed");
    }

    // save_story_draft creates a new revision that supersedes the initial one.
    // This is the current draft revision that media should be linked to.
    const currentRevisionId = saveResult[0].revision_id as string;

    // --- Create media asset records ---
    // Images are stored but not processed yet (they need user to verify rights)
    for (const img of pkg.images) {
      // Resolve image metadata from frontmatter images[] or from metadata/media.md
      const frontmatterImage = fm.images?.find(
        (fi) => `images/${fi.file}` === img.archivePath,
      );
      const mediaMdMeta = pkg.imageMetadata.find(
        (m) => img.archivePath === `images/${m.filename}` || img.archivePath.endsWith(`/${m.filename}`),
      );

      // Skip images that have neither frontmatter metadata nor media.md metadata
      // UNLESS the frontmatter has no images array at all (in which case we
      // import everything from images/)
      if (!frontmatterImage && fm.images && !mediaMdMeta) continue;

      const filename = frontmatterImage?.file ?? img.archivePath.replace("images/", "");
      const altText = frontmatterImage?.alt ?? mediaMdMeta?.altText ?? filename;
      const caption = frontmatterImage?.caption ?? mediaMdMeta?.caption ?? null;
      const credit = frontmatterImage?.credit ?? mediaMdMeta?.credit ?? null;
      const rawRights = frontmatterImage?.rights ?? mediaMdMeta?.rightsStatus ?? "unknown";

      // Determine rights status — map "pending"/"unknown" to "unknown"
      let rightsStatus = rawRights;
      if (rightsStatus === "pending" || rightsStatus === "unknown") {
        rightsStatus = "unknown";
      }

      const mediaAssetId = randomUUID();
      const checksumSha256 = createHash("sha256")
        .update(Buffer.from(img.data))
        .digest("hex");

      // Detect mime type from extension
      const mimeMap: Record<string, string> = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".avif": "image/avif",
        ".gif": "image/gif",
      };
      const mimeType = mimeMap[img.extension] ?? "application/octet-stream";

      const originalKey = `${mediaAssetId}/original-${safeFilename(filename)}`;

      // Upload original to storage
      const { error: uploadError } = await supabase.storage
        .from("media-originals")
        .upload(originalKey, Buffer.from(img.data), {
          contentType: mimeType,
          upsert: false,
        });

      if (uploadError) {
        errors.push({
          code: "media_upload_failed",
          message: `Failed to upload image "${filename}".`,
        });
        continue;
      }

      // Create media asset record
      const { error: assetError } = await supabase
        .from("media_assets")
        .insert({
          id: mediaAssetId,
          kind: "image",
          original_filename: filename,
          original_storage_key: originalKey,
          checksum_sha256: checksumSha256,
          mime_type: mimeType,
          byte_size: img.data.byteLength,
          default_alt_text: altText,
          default_caption: caption,
          credit_text: credit,
          rights_status: rightsStatus as "unknown" | "owned" | "licensed" | "public_domain" | "creative_commons" | "permission_granted" | "restricted",
          processing_status: "pending",
          uploaded_by: admin.userId,
        });

      if (assetError) {
        // Clean up uploaded file
        await supabase.storage.from("media-originals").remove([originalKey]);
        errors.push({
          code: "media_record_failed",
          message: `Failed to create media record for "${filename}".`,
        });
        continue;
      }

      createdMediaAssetIds.push(mediaAssetId);

      // Track this media for linking to the revision.
      // We do NOT assign hero/cover here: imported media is pending, and the
      // user must process it in the media library before assigning as cover.
      // The intended cover reference is preserved for the editor to suggest.
      const coverRef = typeof fm.cover === "string" ? fm.cover : null;
      const isCover =
        coverRef === img.archivePath ||
        coverRef === filename ||
        coverRef === `images/${filename}`;

      mediaPlacements.push({
        mediaAssetId,
        altText,
        caption,
        credit,
        isCover,
      });
    }

    // --- Link media to the current draft revision ---
    // Insert article_media records using the existing revision-media model.
    // All imported images are placed as 'inline' — the user assigns hero
    // after processing. The cover reference is preserved in the placement
    // metadata so the editor can suggest it.
    if (mediaPlacements.length > 0) {
      const articleMediaRecords = mediaPlacements.map((entry, index) => ({
        revision_id: currentRevisionId,
        media_asset_id: entry.mediaAssetId,
        role: "inline" as const,
        position: index,
        alt_text: entry.altText,
        caption: entry.caption,
        credit_override: entry.credit,
      }));

      const { error: linkError } = await supabase
        .from("article_media")
        .insert(articleMediaRecords);

      if (linkError) {
        errors.push({
          code: "media_link_failed",
          message: "Failed to associate imported images with the story revision.",
        });
        throw new Error("Media linking failed");
      }
    }

    // If there were critical errors, clean up
    if (errors.length > 0) {
      throw new Error("Import had critical errors");
    }

    // Return the current revision ID (from save_story_draft, not the initial one)
    // and the intended cover media asset ID (null if no cover reference found).
    const coverEntry = mediaPlacements.find((p) => p.isCover);
    return {
      ok: true,
      articleId,
      revisionId: currentRevisionId,
      coverMediaAssetId: coverEntry?.mediaAssetId ?? null,
    };
  } catch {
    // --- Cleanup on failure ---
    //
    // Safety constraints that limit cleanup:
    // - article_media rows are immutable (prevent_update_or_delete trigger).
    //   Media assets linked via article_media cannot be deleted because
    //   media_assets.id has ON DELETE RESTRICT from article_media.
    // - citations rows are immutable. Sources linked via citations cannot be
    //   deleted because sources.id has ON DELETE RESTRICT from citations.
    // - Tags are reusable entities; leaving newly created tags is harmless.
    //
    // Strategy: attempt cleanup of each resource. Supabase returns an error
    // when a FK/trigger blocks deletion, which we accept silently. The article
    // remains as an unpublished draft that the admin can manage or archive.

    // Attempt to remove media storage files and asset records.
    // Assets already linked via article_media will fail silently.
    for (const mediaAssetId of createdMediaAssetIds) {
      const { data: asset } = await supabase
        .from("media_assets")
        .select("original_storage_key")
        .eq("id", mediaAssetId)
        .maybeSingle();
      if (asset?.original_storage_key) {
        await supabase.storage
          .from("media-originals")
          .remove([asset.original_storage_key]);
      }
      // Will fail silently if article_media references this asset (ON DELETE RESTRICT)
      await supabase.from("media_assets").delete().eq("id", mediaAssetId);
    }

    // Attempt to remove newly created sources.
    // Sources already referenced by citations will fail silently (ON DELETE RESTRICT).
    for (const sourceId of createdSourceIds) {
      await supabase.from("sources").delete().eq("id", sourceId);
    }

    // Tags: newly created tags are left as-is. They are reusable editorial
    // entities and do not create incorrect relationships when orphaned.

    // Article and revision: left as an unpublished draft. The admin can
    // archive it via the existing delete flow. Hard deletion is impossible
    // because article_revisions has ON DELETE RESTRICT from articles and
    // the immutable trigger prevents revision deletion.

    return { ok: false, errors };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeFilename(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^\.+/, "")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "image";
}
