/**
 * Pure helpers shared by the KB and chapter editor pages (plan 02-12).
 *
 * The pages stay thin: every guard that decides whether a mutation may run lives here so it can be
 * exercised in the node test environment with mocked Server Actions.
 */
import type { EditorAction, EditorState } from '@/lib/studio/editor-state';

export type SaveResult = { ok: boolean; error?: string };
export type SaveOutcome = 'skipped' | 'saved' | 'failed';

export interface PerformSaveInput {
  state: EditorState;
  /** Locked default template / file: never mutates. */
  readOnly: boolean;
  requestId: string;
  dispatch: (action: EditorAction) => void;
  /** The Server Action wrapper (receives the submitted snapshot). */
  save: (content: string) => Promise<SaveResult>;
  onSuccess?: () => void;
  onFailure?: (message: string) => void;
}

export const SAVE_FAILURE_COPY = '저장하지 못했어요. 잠시 후 다시 시도해주세요.';

/**
 * Click-time save: records the submitted snapshot via `save-start`, calls the action once, then
 * reports the outcome against the same resourceKey/requestId so a late answer for another resource
 * (or a superseded request) is ignored by the reducer. Content typed while saving stays dirty.
 */
export async function performSave(input: PerformSaveInput): Promise<SaveOutcome> {
  const { state, readOnly, requestId, dispatch, save } = input;
  if (readOnly) return 'skipped';
  if (state.resourceKey === null) return 'skipped';
  if (state.pendingRequestId !== null) return 'skipped';
  if (state.currentContent === state.savedContent) return 'skipped';

  const resourceKey = state.resourceKey;
  const snapshot = state.currentContent;
  dispatch({ type: 'save-start', requestId });
  let result: SaveResult;
  try {
    result = await save(snapshot);
  } catch {
    result = { ok: false, error: SAVE_FAILURE_COPY };
  }
  if (result.ok) {
    dispatch({ type: 'save-success', resourceKey, requestId });
    input.onSuccess?.();
    return 'saved';
  }
  const message = result.error ?? SAVE_FAILURE_COPY;
  dispatch({ type: 'save-failure', resourceKey, requestId, error: message });
  input.onFailure?.(message);
  return 'failed';
}

/** Single entry for every body change (typing, AI insert, mention replace). Read-only drops it. */
export function applyEdit(
  readOnly: boolean,
  resourceKey: string,
  content: string,
  dispatch: (action: EditorAction) => void
): boolean {
  if (readOnly) return false;
  dispatch({ type: 'edit', resourceKey, content });
  return true;
}

/** Insert text at [start,end) of the current body; used by AI insertion at the live cursor. */
export function spliceAtSelection(current: string, text: string, start: number | null, end: number | null): string {
  if (start === null || end === null) return current + text;
  return current.slice(0, start) + text + current.slice(end);
}
