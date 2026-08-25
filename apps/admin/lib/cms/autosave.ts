import type { StoryDraftInput } from "./types";
import { storyDraftSchema } from "./validation";

export const AUTOSAVE_DELAY_MS = 1600;

type RecoverableDraft = {
  draft: StoryDraftInput;
  baseRowVersion: number;
};

export function serializeDraftContent(draft: StoryDraftInput): string {
  return JSON.stringify({
    articleId: draft.articleId,
    title: draft.title,
    slug: draft.slug,
    excerpt: draft.excerpt,
    markdown: draft.markdown,
    pillarId: draft.pillarId,
    categoryId: draft.categoryId,
    tagIds: draft.tagIds,
    sourceIds: draft.sourceIds,
    coverMediaAssetId: draft.coverMediaAssetId,
    seoTitle: draft.seoTitle,
    seoDescription: draft.seoDescription,
  });
}

export function rebaseDraftOntoServer(
  local: StoryDraftInput,
  server: StoryDraftInput,
): StoryDraftInput {
  if (local.articleId !== server.articleId) {
    throw new Error("Cannot rebase drafts belonging to different stories");
  }
  return { ...local, rowVersion: server.rowVersion };
}

export function shouldRecoverLocalDraft(
  recovered: unknown,
  serverRowVersion: number,
  expectedArticleId: string,
): recovered is RecoverableDraft {
  if (!Number.isInteger(serverRowVersion) || serverRowVersion < 1) return false;
  if (!recovered || typeof recovered !== "object") return false;

  const candidate = recovered as {
    draft?: unknown;
    baseRowVersion?: unknown;
  };
  if (candidate.baseRowVersion !== serverRowVersion) return false;

  const parsed = storyDraftSchema.safeParse(candidate.draft);
  return (
    parsed.success &&
    parsed.data.rowVersion === serverRowVersion &&
    parsed.data.articleId === expectedArticleId
  );
}
