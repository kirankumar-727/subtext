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
export type PublicationAction = Database["public"]["Enums"]["publication_action"];
export type PublicationEventLevel = Database["public"]["Enums"]["publication_event_level"];
export type PublicationJobStatus = Database["public"]["Enums"]["publication_job_status"];

export type SettingsPublicationJob = {
  action: PublicationAction;
  status: PublicationJobStatus;
  attemptCount: number;
  maxAttempts: number;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type SettingsPublicationEvent = {
  level: PublicationEventLevel;
  step: string;
  message: string;
  occurredAt: string;
};

export type SettingsControlCenterData = {
  publication: {
    name: string;
    tagline: string;
    updatedAt: string | null;
  };
  publishing: {
    available: boolean;
    counts: Partial<Record<PublicationJobStatus, number>>;
    latestJob: SettingsPublicationJob | null;
    latestSuccessfulJob: SettingsPublicationJob | null;
    latestFailedJob: SettingsPublicationJob | null;
    latestEvent: SettingsPublicationEvent | null;
  };
  media: {
    available: boolean;
    totalAssets: number | null;
    readyAssets: number | null;
    failedAssets: number | null;
    assetsRequiringRightsReview: number | null;
    publicVariants: number | null;
  };
};

export type SettingsEnvironment = {
  environment: "development" | "preview" | "production";
  appVersion: string;
  siteOrigin: string | null;
};

export type TagItem = {
  id: string;
  name: string;
  slug: string;
};

export type SourceItem = {
  id: string;
  title: string;
  author_text: string | null;
  publisher: string | null;
  source_type: SourceType;
  url: string | null;
  archive_url: string | null;
  isbn: string | null;
  doi: string | null;
};

export type MediaItem = {
  id: string;
  kind: Database["public"]["Enums"]["media_kind"];
  original_filename: string;
  mime_type: string;
  byte_size: number;
  default_alt_text: string | null;
  default_caption: string | null;
  credit_text: string | null;
  rights_status: Database["public"]["Enums"]["media_rights_status"];
  processing_status: MediaProcessingStatus;
  created_at: string;
  publicUrl: string | null;
  width: number | null;
  height: number | null;
};
