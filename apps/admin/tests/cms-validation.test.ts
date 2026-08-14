import { describe, expect, it } from "vitest";
import {
  AUTOSAVE_DELAY_MS,
  serializeDraftContent,
  shouldRecoverLocalDraft,
} from "@/lib/cms/autosave";
import type { StoryDraftInput } from "@/lib/cms/types";
import { storyDraftSchema } from "@/lib/cms/validation";

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
    expect(shouldRecoverLocalDraft(local, 4)).toBe(true);
    expect(shouldRecoverLocalDraft(local, 5)).toBe(false);
  });
  it("uses a write-conscious debounce", () => {
    expect(AUTOSAVE_DELAY_MS).toBeGreaterThanOrEqual(1000);
    expect(AUTOSAVE_DELAY_MS).toBeLessThanOrEqual(3000);
  });
});
