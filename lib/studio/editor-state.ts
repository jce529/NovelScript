/**
 * Pure save-state contract for the studio editors (Phase 2 reopen gap, plan 02-11).
 *
 * The status is derived from real save-request outcomes only: a "saving" status exists solely while
 * a save request is in flight; publish/unpublish/AI isPending flags never feed this reducer.
 * No React, DOM or persistence here — callers dispatch events around their Server Action calls.
 */

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'failed';

export interface EditorState {
  resourceKey: string | null;
  currentContent: string;
  savedContent: string;
  pendingRequestId: string | null;
  /** Snapshot of the content sent with the in-flight request. */
  submittedContent: string | null;
  error: string | null;
}

export type EditorAction =
  | { type: 'load'; resourceKey: string; content: string }
  | { type: 'edit'; content: string; resourceKey?: string }
  | { type: 'save-start'; requestId: string }
  | { type: 'save-success'; resourceKey: string; requestId: string }
  | { type: 'save-failure'; resourceKey: string; requestId: string; error: string };

export function createEditorState(): EditorState {
  return {
    resourceKey: null,
    currentContent: '',
    savedContent: '',
    pendingRequestId: null,
    submittedContent: null,
    error: null,
  };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'load':
      // Resource switch: drops any in-flight request so its late answer is ignored.
      return {
        resourceKey: action.resourceKey,
        currentContent: action.content,
        savedContent: action.content,
        pendingRequestId: null,
        submittedContent: null,
        error: null,
      };
    case 'edit': {
      if (action.resourceKey !== undefined && action.resourceKey !== state.resourceKey) return state;
      if (action.content === state.currentContent) return state;
      return { ...state, currentContent: action.content };
    }
    case 'save-start': {
      if (state.pendingRequestId !== null) return state;
      if (state.currentContent === state.savedContent) return state;
      return {
        ...state,
        pendingRequestId: action.requestId,
        submittedContent: state.currentContent,
        error: null,
      };
    }
    case 'save-success': {
      if (action.resourceKey !== state.resourceKey) return state;
      if (action.requestId !== state.pendingRequestId || state.submittedContent === null) return state;
      return {
        ...state,
        savedContent: state.submittedContent,
        pendingRequestId: null,
        submittedContent: null,
        error: null,
      };
    }
    case 'save-failure': {
      if (action.resourceKey !== state.resourceKey) return state;
      if (action.requestId !== state.pendingRequestId) return state;
      return { ...state, pendingRequestId: null, submittedContent: null, error: action.error };
    }
    default:
      return state;
  }
}

export function selectSaveStatus(state: EditorState): SaveStatus {
  if (state.pendingRequestId !== null) return 'saving';
  if (state.error !== null) return 'failed';
  return state.currentContent === state.savedContent ? 'saved' : 'dirty';
}

const SAVE_STATUS_COPY: Record<SaveStatus, string> = {
  saved: '저장됨',
  dirty: '저장 안 됨',
  saving: '저장 중',
  failed: '저장 실패',
};

export function saveStatusCopy(status: SaveStatus, readOnly = false): string {
  return readOnly ? '읽기 전용' : SAVE_STATUS_COPY[status];
}
