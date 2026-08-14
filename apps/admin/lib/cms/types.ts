export type SaveState = "idle" | "unsaved" | "saving" | "saved" | "error";

export type StoryDraftInput = {
  articleId: string;
  rowVersion: number;
  title: string;
  slug: string;
  excerpt: string;
  markdown: string;
  pillarId: string;
  categoryId: string | null;
  tagIds: string[];
  sourceIds: string[];
  coverMediaAssetId: string | null;
  seoTitle: string;
  seoDescription: string;
};

export type StoryDraftResult = {
  articleId: string;
  revisionId: string;
  rowVersion: number;
  savedAt: string;
};
