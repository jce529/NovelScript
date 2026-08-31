import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFolder, renameNode, deleteNode } from '../../lib/kb/actions';
import { adminClient, createTestUser, deleteTestUser } from '../helpers/db';

describe('KB-03: custom folder creation (integration, lib/kb/actions.ts)', () => {
  const admin = adminClient();
  let owner: { id: string };
  let workId: string;
  let personFolderId: string;

  beforeAll(async () => {
    owner = await createTestUser();
    const { data } = await admin.rpc('create_work', {
      p_owner_id: owner.id, p_title: '테스트 작품 (custom-folder)', p_synopsis: null, p_cover_image_url: null, p_genre: null,
    });
    workId = data as string;
    const { data: folder } = await admin
      .from('kb_nodes').select('id').eq('work_id', workId).eq('category', '인물').eq('node_type', 'folder').single();
    personFolderId = folder!.id;
  }, 30000);

  afterAll(async () => { await deleteTestUser(owner.id); });

  it('creates a new top-level custom folder directly under the work root with category="custom"', async () => {
    const result = await createFolder(admin, { ownerId: owner.id, workId, scope: 'work', parentId: null, name: '설정' });
    expect(result.ok).toBe(true);
    const { data } = await admin.from('kb_nodes').select('category, is_locked, parent_id').eq('id', result.nodeId!).single();
    expect(data).toEqual({ category: 'custom', is_locked: false, parent_id: null });
  });

  it('creates a new top-level custom folder under the account-shared root (scope=account_template, work_id=null)', async () => {
    const result = await createFolder(admin, { ownerId: owner.id, workId: null, scope: 'account_template', parentId: null, name: '세계관' });
    expect(result.ok).toBe(true);
    const { data } = await admin.from('kb_nodes').select('category, work_id, scope').eq('id', result.nodeId!).single();
    expect(data).toEqual({ category: 'custom', work_id: null, scope: 'account_template' });
  });

  it("creates a nested folder that inherits the parent '인물' folder's category, never trusting a client value", async () => {
    const result = await createFolder(admin, { ownerId: owner.id, workId, scope: 'work', parentId: personFolderId, name: '주요인물' });
    expect(result.ok).toBe(true);
    const { data } = await admin.from('kb_nodes').select('category').eq('id', result.nodeId!).single();
    expect(data!.category).toBe('인물');
  });

  it('rejects an empty folder name', async () => {
    const result = await createFolder(admin, { ownerId: owner.id, workId, scope: 'work', parentId: null, name: '   ' });
    expect(result).toEqual({ ok: false, error: '이름을 입력해주세요.' });
  });

  it('rejects a parentId that does not belong to the caller (defense-in-depth, Pitfall 2)', async () => {
    const otherOwner = await createTestUser();
    const { data: otherWork } = await admin.rpc('create_work', {
      p_owner_id: otherOwner.id, p_title: '다른 사용자 작품', p_synopsis: null, p_cover_image_url: null, p_genre: null,
    });
    const { data: otherFolder } = await admin
      .from('kb_nodes').select('id').eq('work_id', otherWork).eq('category', '인물').eq('node_type', 'folder').single();

    const result = await createFolder(admin, { ownerId: owner.id, workId, scope: 'work', parentId: otherFolder!.id, name: '침입시도' });
    expect(result).toEqual({ ok: false, error: '상위 폴더를 찾을 수 없어요.' });
    await deleteTestUser(otherOwner.id);
  });

  it('a custom folder is never locked and can be freely renamed and deleted', async () => {
    const created = await createFolder(admin, { ownerId: owner.id, workId, scope: 'work', parentId: null, name: '삭제될폴더' });
    const renamed = await renameNode(admin, { ownerId: owner.id, nodeId: created.nodeId!, name: '이름바뀐폴더' });
    expect(renamed.ok).toBe(true);
    const deleted = await deleteNode(admin, { ownerId: owner.id, nodeId: created.nodeId! });
    expect(deleted.ok).toBe(true);
  });
});
