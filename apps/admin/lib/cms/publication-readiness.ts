import type { MediaProcessingStatus, StoryMediaReadiness } from "@/lib/cms/types";

export type ReadinessCheckState = "pass" | "fail" | "warning" | "info";
export type ReadinessCheckLevel = "error" | "warning" | "info";

export type PublicationReadinessCheck = {
  code: string;
  level: ReadinessCheckLevel;
  state: ReadinessCheckState;
  label: string;
  message: string;
};

export type PublicationReadinessInput = {
  revisionMatchesArticle: boolean;
  title: string;
  slug: string;
  markdown: string;
  pillarId: string | null;
  categoryId: string | null;
  categoryPillarId: string | null;
  categoryIsKnown: boolean;
  seoTitle: string;
  seoDescription: string;
  selectedSourceCount: number;
  publicCitationCount: number;
  media: StoryMediaReadiness[];
  mediaStatusUnavailable: boolean;
};

export type PublicationReadiness = {
  checks: PublicationReadinessCheck[];
  blockingChecks: PublicationReadinessCheck[];
  warningChecks: PublicationReadinessCheck[];
  isReady: boolean;
};

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function mediaNames(media: StoryMediaReadiness[]) {
  return media
    .map((item) => (item.role === "hero" ? "hero image" : `${item.role} media`))
    .join(", ");
}

function mediaWithStatus(media: StoryMediaReadiness[], status: MediaProcessingStatus) {
  return media.filter((item) => item.processingStatus === status);
}

export function buildPublicationReadiness(input: PublicationReadinessInput): PublicationReadiness {
  const placedMedia = input.media;
  const noMediaMessage = "No placed media; media checks do not apply to this draft.";
  const checks: PublicationReadinessCheck[] = [
    {
      code: "revision_mismatch",
      level: "error",
      state: input.revisionMatchesArticle ? "pass" : "fail",
      label: "Draft revision",
      message: input.revisionMatchesArticle
        ? "The current draft revision belongs to this article."
        : "Save or refresh the story before publishing so the target revision is attached to this article.",
    },
    {
      code: "media_status_unavailable",
      level: "error",
      state: input.mediaStatusUnavailable ? "fail" : "pass",
      label: "Media status",
      message: input.mediaStatusUnavailable
        ? "The selected media status could not be verified. Refresh the story before publishing."
        : "The status of every selected media asset is available.",
    },
    {
      code: "title_missing",
      level: "error",
      state: input.title.trim() ? "pass" : "fail",
      label: "Story title",
      message: input.title.trim() ? "A story title is present." : "Add a title before publishing.",
    },
    {
      code: "slug_missing",
      level: "error",
      state: slugPattern.test(input.slug.trim()) ? "pass" : "fail",
      label: "Canonical slug",
      message: slugPattern.test(input.slug.trim())
        ? "The canonical slug is valid."
        : "Use lowercase letters, numbers, and single hyphens for the canonical slug.",
    },
    {
      code: "pillar_missing",
      level: "error",
      state: input.pillarId ? "pass" : "fail",
      label: "Editorial pillar",
      message: input.pillarId
        ? "An editorial pillar is selected."
        : "Select an editorial pillar before publishing.",
    },
    {
      code: "body_missing",
      level: "error",
      state: input.markdown.trim() ? "pass" : "fail",
      label: "Canonical Markdown",
      message: input.markdown.trim()
        ? "The story has canonical Markdown content."
        : "Add story content before publishing.",
    },
    {
      code: "category_pillar_mismatch",
      level: "error",
      state:
        !input.categoryId || (input.categoryIsKnown && input.categoryPillarId === input.pillarId)
          ? "pass"
          : "fail",
      label: "Category belongs to pillar",
      message: !input.categoryId
        ? "No category selected; category is optional."
        : input.categoryIsKnown && input.categoryPillarId === input.pillarId
          ? "The selected category belongs to the selected pillar."
          : "Choose a category from the selected pillar before publishing.",
    },
    {
      code: "media_not_ready",
      level: "error",
      state: input.mediaStatusUnavailable
        ? "info"
        : !placedMedia.length || !placedMedia.some((item) => item.processingStatus !== "ready")
          ? "pass"
          : "fail",
      label: "Media processing",
      message: input.mediaStatusUnavailable
        ? "Media checks are waiting for a fresh asset status."
        : !placedMedia.length
          ? noMediaMessage
          : !placedMedia.some((item) => item.processingStatus !== "ready")
            ? "All placed media has finished processing."
            : mediaWithStatus(placedMedia, "pending").length
              ? `Media processing is still pending for ${mediaNames(mediaWithStatus(placedMedia, "pending"))}. Wait for processing to finish, or choose a ready asset. Draft saves remain available.`
              : mediaWithStatus(placedMedia, "processing").length
                ? `Media is still being processed for ${mediaNames(mediaWithStatus(placedMedia, "processing"))}. Wait for derivatives to finish; draft saves remain available.`
                : `Media processing failed for ${mediaNames(placedMedia.filter((item) => item.processingStatus === "failed"))}. Retry processing or choose a ready asset. Draft saves remain available.`,
    },
    {
      code: "media_rights_unresolved",
      level: "error",
      state:
        !placedMedia.length ||
        !placedMedia.some((item) => ["unknown", "restricted"].includes(item.rightsStatus))
          ? "pass"
          : "fail",
      label: "Media rights",
      message: !placedMedia.length
        ? noMediaMessage
        : !placedMedia.some((item) => ["unknown", "restricted"].includes(item.rightsStatus))
          ? "Rights are cleared for every placed asset."
          : `Resolve rights for ${mediaNames(placedMedia.filter((item) => ["unknown", "restricted"].includes(item.rightsStatus)))} before publishing.`,
    },
    {
      code: "image_alt_missing",
      level: "error",
      state:
        !placedMedia.length ||
        !placedMedia.some(
          (item) =>
            item.kind === "image" && !(item.placementAltText ?? item.defaultAltText ?? "").trim(),
        )
          ? "pass"
          : "fail",
      label: "Image alternative text",
      message: !placedMedia.length
        ? noMediaMessage
        : !placedMedia.some(
              (item) =>
                item.kind === "image" &&
                !(item.placementAltText ?? item.defaultAltText ?? "").trim(),
            )
          ? "Every placed image has alternative text."
          : `Add alternative text to ${mediaNames(placedMedia.filter((item) => item.kind === "image" && !(item.placementAltText ?? item.defaultAltText ?? "").trim()))}.`,
    },
    {
      code: "public_variant_missing",
      level: "error",
      state:
        !placedMedia.length || !placedMedia.some((item) => !item.hasPublicVariant)
          ? "pass"
          : "fail",
      label: "Public media derivative",
      message: !placedMedia.length
        ? noMediaMessage
        : !placedMedia.some((item) => !item.hasPublicVariant)
          ? "Every placed asset has a public derivative."
          : `Generate a public derivative for ${mediaNames(placedMedia.filter((item) => !item.hasPublicVariant))} before publishing.`,
    },
    {
      code: "citations_missing",
      level: "warning",
      state: input.selectedSourceCount || input.publicCitationCount ? "pass" : "warning",
      label: "Public citation",
      message: input.selectedSourceCount
        ? input.publicCitationCount
          ? `${input.publicCitationCount} public citation${input.publicCitationCount === 1 ? "" : "s"} is attached.`
          : "A source is selected and will be snapshotted as a public citation when this draft is saved."
        : input.publicCitationCount
          ? `${input.publicCitationCount} public citation${input.publicCitationCount === 1 ? "" : "s"} is attached.`
          : "Research-driven stories should include at least one public citation. Add a source in the inspector.",
    },
    {
      code: "seo_description_missing",
      level: "warning",
      state: input.seoDescription.trim() ? "pass" : "warning",
      label: "SEO description",
      message: input.seoDescription.trim()
        ? "An explicit SEO description is present."
        : "An explicit SEO description is recommended; add one in SEO & Social Metadata.",
    },
    {
      code: "hero_media_optional",
      level: "info",
      state: placedMedia.some((item) => item.role === "hero") ? "pass" : "info",
      label: "Hero media",
      message: placedMedia.some((item) => item.role === "hero")
        ? "A hero asset is selected and included in the media checks above."
        : "No hero asset is selected. The current publication validator does not require one.",
    },
    {
      code: "seo_title_optional",
      level: "info",
      state: input.seoTitle.trim() ? "pass" : "info",
      label: "SEO title",
      message: input.seoTitle.trim()
        ? "An explicit SEO title is present."
        : "No explicit SEO title; the public metadata path can use its existing title fallback.",
    },
  ];

  const blockingChecks = checks.filter(
    (check) => check.level === "error" && check.state === "fail",
  );
  const warningChecks = checks.filter(
    (check) => check.level === "warning" && check.state === "warning",
  );

  return {
    checks,
    blockingChecks,
    warningChecks,
    isReady: blockingChecks.length === 0,
  };
}
