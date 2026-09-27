import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  listCategoryFolderCandidates: vi.fn(),
  validateTargetFolder: vi.fn(),
  quickAddMentionNode: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/kb/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/kb/actions')>()),
  listCategoryFolderCandidates: mocks.listCategoryFolderCandidates,
  validateTargetFolder: mocks.validateTargetFolder,
}));
vi.mock('@/lib/ai/mentions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/mentions')>()),
  quickAddMentionNode: mocks.quickAddMentionNode,
}));

import { FOLDER_COPY, type FolderCandidate, type FolderCandidatesResult } from '../../lib/kb/actions';
import { QUICK_ADD_FOLDER_LOAD_FAILED, initialQuickAddFoldersState, quickAddFoldersReducer } from '../../app/studio/[workId]/chapters/[chapterId]/ai-panel/quick-add-folders';
import { listCategoryFoldersAction, quickAddMentionAction } from '../../app/studio/[workId]/chapters/[chapterId]/actions';

const root: FolderCandidate = { id: 'root', name: '인물', isRoot: true, path: '', version: 'root:인물' };
const child: FolderCandidate = { id: 'child', name: '하위', isRoot: false, path: '하위', version: 'root:인물/child:하위' };
const okResult: FolderCandidatesResult = { status: 'ok', root, candidates: [root, child] };

describe('quickAddFoldersReducer', () => {
  it('ignores a late response from a previous category request', () => {
    const requested = quickAddFoldersReducer(
      quickAddFoldersReducer(initialQuickAddFoldersState, { type: 'request', seq: 1 }),
      { type: 'request', seq: 2 },
    );
    const stale = quickAddFoldersReducer(requested, { type: 'loaded', seq: 1, result: okResult });
    expect(stale).toEqual(requested);
    expect(stale).toMatchObject({ seq: 2, loading: true, canSubmit: false });
  });

  it('selects the root by default and allows submit when loading succeeds', () => {
    const state = quickAddFoldersReducer(
      { ...initialQuickAddFoldersState, seq: 2 },
      { type: 'loaded', seq: 2, result: okResult },
    );
    expect(state).toMatchObject({ selectedFolderId: 'root', selectedVersion: root.version, canSubmit: true, loading: false });
  });

  it('blocks submit and shows the root duplicate copy', () => {
    const state = quickAddFoldersReducer(
      { ...initialQuickAddFoldersState, seq: 1 },
      { type: 'loaded', seq: 1, result: { status: 'root_duplicate' } },
    );
    expect(state.canSubmit).toBe(false);
    expect(state.message).toBe(FOLDER_COPY.root_duplicate);
  });

  it.each([
    ['query failure result', { type: 'loaded', seq: 1, result: { status: 'query_failed' } } as const],
    ['thrown action', { type: 'failed', seq: 1 } as const],
  ])('%s allows server fallback while explaining the lookup failure', (_, action) => {
    const state = quickAddFoldersReducer({ ...initialQuickAddFoldersState, seq: 1 }, action);
    expect(state).toMatchObject({ canSubmit: true, selectedFolderId: undefined, message: QUICK_ADD_FOLDER_LOAD_FAILED });
  });
});

describe('quick-add server actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'owner-1' } } }) } });
    mocks.quickAddMentionNode.mockResolvedValue({ ok: true, nodeId: 'new-node' });
    mocks.validateTargetFolder.mockResolvedValue({ ok: true, folder: root });
  });

  it('lists folders scoped to the signed-in owner', async () => {
    mocks.listCategoryFolderCandidates.mockResolvedValue(okResult);
    await expect(listCategoryFoldersAction('work-1', '인물')).resolves.toEqual(okResult);
    expect(mocks.listCategoryFolderCandidates).toHaveBeenCalledWith(expect.anything(), { ownerId: 'owner-1', workId: 'work-1', category: '인물' });
  });

  it('validates folder ownership and version before creating in the chosen destination', async () => {
    await quickAddMentionAction('work-1', '인물', '아리아', 'child', 'root:인물/child:하위');
    expect(mocks.validateTargetFolder).toHaveBeenCalledWith(expect.anything(), {
      ownerId: 'owner-1', workId: 'work-1', category: '인물', targetFolderId: 'child', expectedVersion: 'root:인물/child:하위',
    });
    expect(mocks.quickAddMentionNode).toHaveBeenCalledWith(expect.anything(), {
      ownerId: 'owner-1', workId: 'work-1', category: '인물', name: '아리아', targetFolderId: 'child',
    });
  });

  it('returns validation errors without creating a node', async () => {
    mocks.validateTargetFolder.mockResolvedValue({ ok: false, error: FOLDER_COPY.folder_changed });
    await expect(quickAddMentionAction('work-1', '인물', '아리아', 'foreign', 'v1')).resolves.toEqual({ ok: false, error: FOLDER_COPY.folder_changed });
    expect(mocks.quickAddMentionNode).not.toHaveBeenCalled();
  });

  it('returns the same folder-changed error when the selected version is stale', async () => {
    mocks.validateTargetFolder.mockResolvedValue({ ok: false, error: FOLDER_COPY.folder_changed });
    await expect(quickAddMentionAction('work-1', '인물', '아리아', 'child', 'stale-version')).resolves.toEqual({ ok: false, error: FOLDER_COPY.folder_changed });
    expect(mocks.quickAddMentionNode).not.toHaveBeenCalled();
  });

  it('preserves the default-root behavior when no destination is supplied', async () => {
    await quickAddMentionAction('work-1', '인물', '아리아');
    expect(mocks.validateTargetFolder).not.toHaveBeenCalled();
    expect(mocks.quickAddMentionNode).toHaveBeenCalledWith(expect.anything(), {
      ownerId: 'owner-1', workId: 'work-1', category: '인물', name: '아리아', targetFolderId: undefined,
    });
  });
});
