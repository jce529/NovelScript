import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getMentionedNodesContent, quickAddMentionNode, resolveDefaultCategoryFolder } from '../../lib/ai/mentions';
import { createNode, deleteNode, validateTargetFolder } from '../../lib/kb/actions';
import { adminClient, createTestUser, deleteTestUser } from '../helpers/db';

type FolderRow = { id: string; name: string; parent_id: string | null };

function candidateClient(data: FolderRow[] | null, error: unknown = null) {
  const query: Record<string, unknown> = {};
  for (const method of ['select', 'eq']) query[method] = () => query;
  query.is = () => Promise.resolve({ data, error });
  return { from: () => query } as never;
}

const folderInput = { ownerId: 'owner', workId: 'work', category: '인물' as const };
const root: FolderRow = { id: 'root', name: '인물', parent_id: null };

describe('lib/ai/mentions.ts — getMentionedNodesContent (EDIT-02)', () => {
  const admin = adminClient();
  let owner: { id: string };
  let workId: string;
  let personFolderId: string;

  beforeAll(async () => {
    owner = await createTestUser();
    const { data: work } = await admin.rpc('create_work', {
      p_owner_id: owner.id, p_title: '테스트 작품 (mention-context)', p_synopsis: null, p_cover_image_url: null, p_genre: null,
    });
    workId = work as string;
    const { data: folder } = await admin
      .from('kb_nodes').select('id').eq('work_id', workId).eq('category', '인물').eq('node_type', 'folder').single();
    personFolderId = folder!.id;
  }, 30000);

  afterAll(async () => {
    await deleteTestUser(owner.id);
  });

  it('resolves content for exactly the requested ids, verbatim including inert [[ ]] syntax', async () => {
    const created = await createNode(admin, { ownerId: owner.id, workId, parentId: personFolderId, category: '인물', nodeType: 'file', name: '멘션대상' });
    await admin.from('kb_nodes').update({ content: '[[다른문서]]와 함께 등장한다.' }).eq('id', created.nodeId!);

    const docs = await getMentionedNodesContent(admin, { ownerId: owner.id, workId, nodeIds: [created.nodeId!] });
    expect(docs).toHaveLength(1);
    expect(docs[0].content).toBe('[[다른문서]]와 함께 등장한다.');
    expect(docs[0].category).toBe('인물');
  });

  it('excludes a soft-deleted node even if its stale id is still passed in', async () => {
    const created = await createNode(admin, { ownerId: owner.id, workId, parentId: personFolderId, category: '인물', nodeType: 'file', name: '삭제될멘션' });
    await deleteNode(admin, { ownerId: owner.id, nodeId: created.nodeId! });

    const docs = await getMentionedNodesContent(admin, { ownerId: owner.id, workId, nodeIds: [created.nodeId!] });
    expect(docs).toEqual([]);
  });

  it('returns [] for an empty nodeIds array without erroring', async () => {
    const docs = await getMentionedNodesContent(admin, { ownerId: owner.id, workId, nodeIds: [] });
    expect(docs).toEqual([]);
  });
});

describe('AIDOC-03 folder resolution and save-time validation', () => {
  it('resolves the one explicit root even when nested folders exist', async () => {
    await expect(resolveDefaultCategoryFolder(candidateClient([
      root, { id: 'child', name: '주요', parent_id: 'root' },
    ]), folderInput)).resolves.toEqual({ ok: true, folderId: 'root' });
  });

  it('returns root_duplicate and no id for duplicate roots', async () => {
    await expect(resolveDefaultCategoryFolder(candidateClient([
      root, { id: 'other-root', name: '인물', parent_id: null },
    ]), folderInput)).resolves.toEqual({ ok: false, reason: 'root_duplicate' });
  });

  it('accepts a target with its original candidate version', async () => {
    const result = await validateTargetFolder(candidateClient([root, { id: 'child', name: '주요', parent_id: 'root' }]), {
      ...folderInput, targetFolderId: 'child', expectedVersion: 'root:인물/child:주요',
    });
    expect(result).toMatchObject({ ok: true, folder: { id: 'child' } });
  });

  it.each([
    ['another work', [root]],
    ['soft-deleted target', [root]],
    ['another category', [root]],
  ])('rejects a target absent from the current candidate set (%s)', async (_case, rows) => {
    await expect(validateTargetFolder(candidateClient(rows), {
      ...folderInput, targetFolderId: 'foreign', expectedVersion: 'foreign:Folder',
    })).resolves.toEqual({ ok: false, reason: 'folder_changed', error: '저장 위치가 변경되었어요. 다시 선택해주세요.' });
  });

  it('rejects a target moved under a different parent because its version changed', async () => {
    await expect(validateTargetFolder(candidateClient([
      root, { id: 'moved', name: '이동됨', parent_id: 'root' }, { id: 'target', name: '문서', parent_id: 'moved' },
    ]), { ...folderInput, targetFolderId: 'target', expectedVersion: 'root:인물/target:문서' }))
      .resolves.toEqual({ ok: false, reason: 'folder_changed', error: '저장 위치가 변경되었어요. 다시 선택해주세요.' });
  });

  it('rejects a target orphaned by a deleted ancestor', async () => {
    await expect(validateTargetFolder(candidateClient([
      root, { id: 'target', name: '문서', parent_id: 'deleted-parent' },
    ]), { ...folderInput, targetFolderId: 'target', expectedVersion: 'root:인물/target:문서' }))
      .resolves.toEqual({ ok: false, reason: 'folder_changed', error: '저장 위치가 변경되었어요. 다시 선택해주세요.' });
  });

  it('keeps query_failed distinct from folder_changed', async () => {
    await expect(validateTargetFolder(candidateClient(null, { message: 'offline' }), {
      ...folderInput, targetFolderId: 'target',
    })).resolves.toEqual({ ok: false, reason: 'query_failed', error: '저장 위치를 확인하지 못했어요. 잠시 후 다시 시도해주세요.' });
  });

  it('returns the root_duplicate copy for a duplicate root', async () => {
    await expect(validateTargetFolder(candidateClient([
      root, { id: 'second', name: '인물', parent_id: null },
    ]), { ...folderInput, targetFolderId: 'root' }))
      .resolves.toEqual({ ok: false, reason: 'root_duplicate', error: '이 카테고리의 최상위 폴더에 문제가 있어요. 새로고침 후 다시 시도해주세요.' });
  });

  it('does not create a quick-add node when root resolution reports a duplicate', async () => {
    await expect(quickAddMentionNode(candidateClient([
      root, { id: 'second', name: '인물', parent_id: null },
    ]), { ...folderInput, name: '새 문서' }))
      .resolves.toEqual({ ok: false, error: '이 카테고리의 최상위 폴더에 문제가 있어요. 새로고침 후 다시 시도해주세요.' });
  });
});
