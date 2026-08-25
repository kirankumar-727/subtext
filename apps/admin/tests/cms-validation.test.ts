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
import type { StoryDraftInput } from "@/lib/cms/types";
import { sourceSchema, storyDraftSchema, tagInputSchema } from "@/lib/cms/validation";

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
