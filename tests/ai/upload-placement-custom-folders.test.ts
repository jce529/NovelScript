import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getWorkKbNodes: vi.fn(),
  validateTargetFolder: vi.fn(),
  createNode: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/kb/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/kb/actions')>()),
  getWorkKbNodes: mocks.getWorkKbNodes,
  validateTargetFolder: mocks.validateTargetFolder,
  createNode: mocks.createNode,
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { importClassifiedFilesAction, loadPlacementTreeAction } from '../../app/studio/[workId]/chapters/[chapterId]/actions';

const WORK = '11111111-1111-4111-8111-111111111111';
const CUSTOM_FOLDER = '22222222-2222-4222-8222-222222222222';
const PERSON_FOLDER = '33333333-3333-4333-8333-333333333333';

function node(id: string, category: string, nodeType: 'folder' | 'file' = 'folder') {
  return { id, parent_id: null, name: id, node_type: nodeType, category, is_locked: false, scope: 'work' as const };
}

/** from().select().eq()... .maybeSingle() resolves the folder row whose id was filtered. */
function supabaseWithFolders(rows: Record<string, { category: string; node_type: string }>) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => {
      let id = '';
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (column: string, value: string) => { if (column === 'id') id = value; return chain; },
        is: () => chain,
        maybeSingle: async () => ({ data: rows[id] ?? null }),
      };
      return chain;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.validateTargetFolder.mockResolvedValue({ ok: true });
  mocks.createNode.mockResolvedValue({ ok: true, nodeId: 'new-node' });
});

describe('업로드 배치 트리의 직접 만든 폴더', () => {
  it('카테고리 폴더와 함께 직접 만든 폴더(custom)도 트리에 돌려준다', async () => {
    mocks.createClient.mockResolvedValue(supabaseWithFolders({}));
    mocks.getWorkKbNodes.mockResolvedValue([
      node('p', '인물'), node('c', 'custom'), node('ch', '회차'), node('t', 'template'),
    ]);
    const tree = await loadPlacementTreeAction(WORK);
    expect(tree?.map((n) => n.id).sort()).toEqual(['c', 'p']);
  });

  it('직접 만든 폴더에 배치한 파일을 저장한다 (카테고리 후보 검증은 건너뜀)', async () => {
    mocks.createClient.mockResolvedValue(supabaseWithFolders({ [CUSTOM_FOLDER]: { category: 'custom', node_type: 'folder' } }));
    const result = await importClassifiedFilesAction({ workId: WORK, files: [{ name: '메모.md', content: 'x', targetFolderId: CUSTOM_FOLDER }] });
    expect(result).toMatchObject({ ok: true, failed: [] });
    expect(mocks.validateTargetFolder).not.toHaveBeenCalled();
    expect(mocks.createNode).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      parentId: CUSTOM_FOLDER, category: 'custom', nodeType: 'file', name: '메모', initialContent: 'x',
    }));
  });

  it('카테고리 폴더는 기존처럼 후보 검증을 거친다', async () => {
    mocks.createClient.mockResolvedValue(supabaseWithFolders({ [PERSON_FOLDER]: { category: '인물', node_type: 'folder' } }));
    await importClassifiedFilesAction({ workId: WORK, files: [{ name: 'a.md', content: 'x', targetFolderId: PERSON_FOLDER }] });
    expect(mocks.validateTargetFolder).toHaveBeenCalledTimes(1);
  });

  it('폴더가 아니거나 허용되지 않은 영역이면 저장하지 않는다', async () => {
    mocks.createClient.mockResolvedValue(supabaseWithFolders({ [CUSTOM_FOLDER]: { category: '회차', node_type: 'folder' } }));
    const result = await importClassifiedFilesAction({ workId: WORK, files: [{ name: 'a.md', content: 'x', targetFolderId: CUSTOM_FOLDER }] });
    expect(result).toMatchObject({ ok: true, created: [], failed: [{ fileName: 'a.md' }] });
    expect(mocks.createNode).not.toHaveBeenCalled();
  });
});
