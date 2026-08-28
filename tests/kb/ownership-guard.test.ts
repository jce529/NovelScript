import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createNode, renameNode, deleteNode, saveNodeContent } from '../../lib/kb/actions';
import { adminClient, createTestUser, deleteTestUser } from '../helpers/db';

describe('KB ownership guard (Pitfall 1) — kb_nodes half of the ownership-guard requirement', () => {
  const admin = adminClient();
  let userA: { id: string };
  let userB: { id: string };
  let workAId: string;
  let victimNodeId: string;
  let originalContent: string;
  const ORIGINAL_NAME = '작가A의문서';

  beforeAll(async () => {
    userA = await createTestUser();
    userB = await createTestUser();

    const { data, error } = await admin.rpc('create_work', {
      p_owner_id: userA.id,
      p_title: '테스트 작품 (ownership-guard)',
      p_synopsis: null,
      p_cover_image_url: null,
      p_genre: null,
    });
    if (error) throw error;
    workAId = data as string;

    const { data: personFolder } = await admin
      .from('kb_nodes').select('id').eq('work_id', workAId).eq('category', '인물').eq('node_type', 'folder').single();

    const created = await createNode(admin, {
      ownerId: userA.id, workId: workAId, parentId: personFolder!.id, category: '인물', nodeType: 'file', name: ORIGINAL_NAME,
    });
    if (!created.ok) throw new Error(created.error);
    victimNodeId = created.nodeId!;

    const { data: row } = await admin.from('kb_nodes').select('content').eq('id', victimNodeId).single();
    originalContent = row!.content;
  }, 30000);

  afterAll(async () => {
    await deleteTestUser(userA.id);
    await deleteTestUser(userB.id);
  });

  it('rejects renameNode attempted by a different owner and leaves the victim row unchanged', async () => {
    const result = await renameNode(admin, { ownerId: userB.id, nodeId: victimNodeId, name: '탈취시도' });
    expect(result.ok).toBe(false);

    const { data } = await admin.from('kb_nodes').select('name').eq('id', victimNodeId).single();
    expect(data!.name).toBe(ORIGINAL_NAME);
  });

  it('rejects deleteNode attempted by a different owner and leaves the victim row unchanged', async () => {
    const result = await deleteNode(admin, { ownerId: userB.id, nodeId: victimNodeId });
    expect(result.ok).toBe(false);

    const { data } = await admin.from('kb_nodes').select('deleted_at').eq('id', victimNodeId).single();
    expect(data!.deleted_at).toBeNull();
  });

  it('rejects saveNodeContent attempted by a different owner and leaves the victim row unchanged', async () => {
    const result = await saveNodeContent(admin, { ownerId: userB.id, nodeId: victimNodeId, content: '탈취된 내용' });
    expect(result.ok).toBe(false);

    const { data } = await admin.from('kb_nodes').select('content').eq('id', victimNodeId).single();
    expect(data!.content).toBe(originalContent);
  });
});
