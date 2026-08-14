import type { StoryDraftInput } from "./types";

export const AUTOSAVE_DELAY_MS = 1600;

export function serializeDraftContent(draft: StoryDraftInput): string {
  return JSON.stringify({ ...draft, rowVersion: undefined });
}

export function shouldRecoverLocalDraft(
  recovered: { draft: StoryDraftInput; baseRowVersion: number },
  serverRowVersion: number,
): boolean {
  return recovered.baseRowVersion === serverRowVersion && recovered.draft.articleId.length > 0;
}
