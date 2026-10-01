import { FOLDER_COPY } from '@/lib/kb/folder-copy';
import type { FolderCandidate, FolderCandidatesResult } from '@/lib/kb/actions';

export const QUICK_ADD_FOLDER_LOAD_FAILED = '폴더 목록을 불러오지 못했어요. 최상위 폴더에 저장돼요.';

export interface QuickAddFoldersState {
  seq: number;
  loading: boolean;
  folders: FolderCandidate[];
  selectedFolderId: string | undefined;
  selectedVersion: string | undefined;
  message: string | null;
  canSubmit: boolean;
}

export type QuickAddFoldersAction =
  | { type: 'request'; seq: number }
  | { type: 'loaded'; seq: number; result: FolderCandidatesResult }
  | { type: 'failed'; seq: number }
  | { type: 'select'; folderId: string };

export const initialQuickAddFoldersState: QuickAddFoldersState = {
  seq: 0,
  loading: true,
  folders: [],
  selectedFolderId: undefined,
  selectedVersion: undefined,
  message: null,
  canSubmit: false,
};

export function quickAddFoldersReducer(s: QuickAddFoldersState, a: QuickAddFoldersAction): QuickAddFoldersState {
  switch (a.type) {
    case 'request':
      return { ...initialQuickAddFoldersState, seq: a.seq };
    case 'loaded':
    case 'failed': {
      if (a.seq !== s.seq) return s;
      if (a.type === 'failed' || a.result.status === 'query_failed') {
        return { ...s, loading: false, folders: [], selectedFolderId: undefined, selectedVersion: undefined, message: QUICK_ADD_FOLDER_LOAD_FAILED, canSubmit: true };
      }
      if (a.result.status !== 'ok') {
        return { ...s, loading: false, folders: [], selectedFolderId: undefined, selectedVersion: undefined, message: FOLDER_COPY[a.result.status], canSubmit: false };
      }
      return { ...s, loading: false, folders: a.result.candidates, selectedFolderId: a.result.root.id, selectedVersion: a.result.root.version, message: null, canSubmit: true };
    }
    case 'select': {
      const folder = s.folders.find((candidate) => candidate.id === a.folderId);
      return folder ? { ...s, selectedFolderId: folder.id, selectedVersion: folder.version } : s;
    }
  }
}
