import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { renameNode, deleteNode } from '../../lib/kb/actions';
import { adminClient, createTestUser, deleteTestUser } from '../helpers/db';

describe('Locked-folder guard (Pitfall 2) — direct Server Action calls on a fixed structural folder', () => {
  const admin = adminClient();
  let owner: { id: string };
  let workId: string;
  let lockedFolderId: string;
  let lockedFolderOriginalName: string;

  beforeAll(async () => {
    owner = await createTestUser();
    const { data, error } = await admin.rpc('create_work', {
      p_owner_id: owner.id,
      p_title: '테스트 작품 (locked-folder)',
      p_synopsis: null,
      p_cover_image_url: null,
      p_genre: null,
    });
    if (error) throw error;
    workId = data as string;

    const { data: folder } = await admin
      .from('kb_nodes').select('id, name').eq('work_id', workId).eq('category', 'template').eq('node_type', 'folder').single();
    lockedFolderId = folder!.id;
    lockedFolderOriginalName = folder!.name;
  }, 30000);

  afterAll(async () => {
    await deleteTestUser(owner.id);
  });

  it('rejects renameNode called directly with a locked folder\'s real id, not routed through any UI', async () => {
    const result = await renameNode(admin, { ownerId: owner.id, nodeId: lockedFolderId, name: '해킹시도' });
    expect(result).toEqual({ ok: false, error: '기본 폴더는 이름을 바꾸거나 삭제할 수 없어요.' });

    const { data } = await admin.from('kb_nodes').select('name').eq('id', lockedFolderId).single();
    expect(data!.name).toBe(lockedFolderOriginalName);
  });

  it('rejects deleteNode called directly with a locked folder\'s real id', async () => {
    const result = await deleteNode(admin, { ownerId: owner.id, nodeId: lockedFolderId });
    expect(result).toEqual({ ok: false, error: '기본 폴더는 이름을 바꾸거나 삭제할 수 없어요.' });

    const { data } = await admin.from('kb_nodes').select('deleted_at').eq('id', lockedFolderId).single();
    expect(data!.deleted_at).toBeNull();
  });
});
