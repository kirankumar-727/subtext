import { describe, expect, it } from "vitest";
import {
  isSupportedImageUpload,
  mediaUploadMetadataSchema,
  mediaUploadRequestSchema,
  safeFilename,
} from "@/lib/cms/media";
import {
  AUTOSAVE_DELAY_MS,
  rebaseDraftOntoServer,
  serializeDraftContent,
  shouldRecoverLocalDraft,
} from "@/lib/cms/autosave";
import type { StoryMediaReadiness, StoryDraftInput } from "@/lib/cms/types";
import {
  buildPublicationReadiness,
  type PublicationReadinessInput,
} from "@/lib/cms/publication-readiness";
import {
  createCategorySchema,
  createPillarSchema,
  sourceSchema,
  storyDraftSchema,
  tagInputSchema,
  updateCategorySchema,
  updatePillarSchema,
  updateTagSchema,
} from "@/lib/cms/validation";

const draft: StoryDraftInput = {
  articleId: "90000000-0000-4000-8000-000000000001",
  rowVersion: 4,
  title: "A Story",
  slug: "a-story",
  excerpt: "Excerpt",
  markdown: "# A Story\n\nCanonical Markdown.",
  pillarId: "90000000-0000-4000-8000-000000000002",
  categoryId: null,
  tagIds: [],
  sourceIds: [],
  coverMediaAssetId: null,
  seoTitle: "",
  seoDescription: "",
};

describe("writer draft validation and recovery", () => {
  it("persists Markdown without converting it to a block tree", () => {
    expect(storyDraftSchema.parse(draft).markdown).toBe(draft.markdown);
    expect(serializeDraftContent(draft)).toContain("Canonical Markdown");
  });
  it("rejects invalid metadata", () => {
    expect(() => storyDraftSchema.parse({ ...draft, slug: "Invalid Slug" })).toThrow();
    expect(() => storyDraftSchema.parse({ ...draft, title: "" })).toThrow();
  });
  it("recovers local content only against the same immutable server version", () => {
    const local = { draft, baseRowVersion: 4 };
    expect(shouldRecoverLocalDraft(local, 4, draft.articleId)).toBe(true);
    expect(shouldRecoverLocalDraft(local, 5, draft.articleId)).toBe(false);
    expect(
      shouldRecoverLocalDraft({ ...local, draft: { ...draft, rowVersion: 3 } }, 4, draft.articleId),
    ).toBe(false);
    expect(
      shouldRecoverLocalDraft(
        { ...local, draft: { ...draft, articleId: "90000000-0000-4000-8000-000000000009" } },
        4,
        draft.articleId,
      ),
    ).toBe(false);
    expect(
      shouldRecoverLocalDraft(
        { ...local, draft: { ...draft, markdown: null } },
        4,
        draft.articleId,
      ),
    ).toBe(false);
    expect(shouldRecoverLocalDraft("not a draft", 4, draft.articleId)).toBe(false);
  });
  it("rebases the local draft only after an explicit conflict decision", () => {
    const server = { ...draft, rowVersion: 9, title: "Server title" };
    const rebased = rebaseDraftOntoServer(draft, server);
    expect(rebased.rowVersion).toBe(9);
    expect(rebased.title).toBe(draft.title);
    expect(rebased.markdown).toBe(draft.markdown);
    expect(() =>
      rebaseDraftOntoServer(draft, {
        ...server,
        articleId: "90000000-0000-4000-8000-000000000009",
      }),
    ).toThrow();
  });
  it("validates tag and source creation inputs", () => {
    expect(tagInputSchema.parse({ name: "New Tag" }).name).toBe("New Tag");
    expect(() => tagInputSchema.parse({ name: " " })).toThrow();
    expect(
      sourceSchema.parse({ sourceType: "website", title: "A source", url: "https://example.com" }),
    ).toMatchObject({ sourceType: "website", title: "A source" });
    expect(() =>
      sourceSchema.parse({ sourceType: "website", title: "A source", url: "not-a-url" }),
    ).toThrow();
  });
  it("accepts only bounded image uploads with a SHA-256 checksum", () => {
    const checksum = "a".repeat(64);
    expect(
      isSupportedImageUpload({ mimeType: "image/webp", byteSize: 1024, checksumSha256: checksum }),
    ).toBe(true);
    expect(
      isSupportedImageUpload({
        mimeType: "image/svg+xml",
        byteSize: 1024,
        checksumSha256: checksum,
      }),
    ).toBe(false);
    expect(
      isSupportedImageUpload({ mimeType: "image/png", byteSize: 1024, checksumSha256: "bad" }),
    ).toBe(false);
    expect(safeFilename("../Café summer photo?.png")).toBe("Cafe-summer-photo-.png");
    expect(() => mediaUploadMetadataSchema.parse({ altText: "", rightsStatus: "owned" })).toThrow();
    expect(() =>
      mediaUploadRequestSchema.parse({
        filename: "",
        mimeType: "image/png",
        byteSize: 1024,
        checksumSha256: checksum,
        altText: "A photo",
        rightsStatus: "owned",
      }),
    ).toThrow();
  });
  it("uses a write-conscious debounce", () => {
    expect(AUTOSAVE_DELAY_MS).toBeGreaterThanOrEqual(1000);
    expect(AUTOSAVE_DELAY_MS).toBeLessThanOrEqual(3000);
  });
});

describe("publication readiness guidance", () => {
  const media: StoryMediaReadiness = {
    mediaAssetId: "90000000-0000-4000-8000-000000000010",
    role: "hero",
    placementAltText: "A restored archive",
    kind: "image",
    processingStatus: "ready",
    rightsStatus: "owned",
    defaultAltText: "An archive",
    hasPublicVariant: true,
  };

  const readyInput: PublicationReadinessInput = {
    revisionMatchesArticle: true,
    title: "A considered story",
    slug: "a-considered-story",
    markdown: "# A considered story\n\nBody.",
    pillarId: "90000000-0000-4000-8000-000000000011",
    categoryId: "90000000-0000-4000-8000-000000000012",
    categoryPillarId: "90000000-0000-4000-8000-000000000011",
    categoryIsKnown: true,
    seoTitle: "A considered story",
    seoDescription: "A useful description.",
    selectedSourceCount: 1,
    publicCitationCount: 1,
    media: [media],
    mediaStatusUnavailable: false,
  };

  it("keeps warnings visible without treating them as blocking", () => {
    const result = buildPublicationReadiness({
      ...readyInput,
      selectedSourceCount: 0,
      publicCitationCount: 0,
      seoDescription: "",
    });

    expect(result.isReady).toBe(true);
    expect(result.blockingChecks).toHaveLength(0);
    expect(result.warningChecks.map((check) => check.code)).toEqual([
      "citations_missing",
      "seo_description_missing",
    ]);
  });

  it("explains pending media without changing draft-save behavior", () => {
    const result = buildPublicationReadiness({
      ...readyInput,
      media: [{ ...media, processingStatus: "pending" }],
    });
    const mediaCheck = result.checks.find((check) => check.code === "media_not_ready");

    expect(result.isReady).toBe(false);
    expect(result.blockingChecks.map((check) => check.code)).toContain("media_not_ready");
    expect(mediaCheck?.message).toContain("Draft saves remain available");
  });

  it("surfaces the existing category relationship condition", () => {
    const result = buildPublicationReadiness({
      ...readyInput,
      categoryPillarId: "90000000-0000-4000-8000-000000000099",
    });

    expect(result.blockingChecks.map((check) => check.code)).toContain("category_pillar_mismatch");
  });

  it("does not call a draft without an attached revision ready", () => {
    const result = buildPublicationReadiness({
      ...readyInput,
      revisionMatchesArticle: false,
    });

    expect(result.isReady).toBe(false);
    expect(result.blockingChecks.map((check) => check.code)).toContain("revision_mismatch");
  });
});

describe("editorial structure validation", () => {
  const id = "90000000-0000-4000-8000-000000000020";

  it("bounds the safe taxonomy mutation fields", () => {
    expect(createPillarSchema.parse({ name: "History", sortOrder: 2 })).toMatchObject({
      name: "History",
      sortOrder: 2,
    });
    expect(
      createCategorySchema.parse({ pillarId: id, name: "Archives", sortOrder: 1 }),
    ).toMatchObject({
      pillarId: id,
      name: "Archives",
    });
    expect(updatePillarSchema.parse({ id, description: "Context", sortOrder: 0 })).toMatchObject({
      id,
      description: "Context",
    });
    expect(updateCategorySchema.parse({ id, description: "Context", sortOrder: 0 })).toMatchObject({
      id,
    });
    expect(updateTagSchema.parse({ id, description: "Context" })).toMatchObject({ id });
  });

  it("rejects invalid IDs and negative editorial order", () => {
    expect(() =>
      createCategorySchema.parse({ pillarId: "not-a-uuid", name: "Archives" }),
    ).toThrow();
    expect(() => createPillarSchema.parse({ name: "History", sortOrder: -1 })).toThrow();
    expect(() => updateTagSchema.parse({ id: "not-a-uuid", description: "Context" })).toThrow();
  });
});
