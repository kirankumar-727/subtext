import type { Database } from "@subtext/supabase/database.types";

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

export type SourceType = Database["public"]["Enums"]["source_type"];
export type MediaProcessingStatus = Database["public"]["Enums"]["media_processing_status"];

export type TagItem = {
  id: string;
  name: string;
  slug: string;
};

export type SourceItem = {
  id: string;
  title: string;
  author_text: string | null;
  source_type: SourceType;
  url: string | null;
};

export type MediaItem = {
  id: string;
  original_filename: string;
  default_alt_text: string | null;
  default_caption: string | null;
  credit_text: string | null;
  processing_status: MediaProcessingStatus;
  created_at: string;
  publicUrl: string | null;
  width: number | null;
  height: number | null;
};
