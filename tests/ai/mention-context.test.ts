import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getMentionedNodesContent } from '../../lib/ai/mentions';
import { createNode, deleteNode } from '../../lib/kb/actions';
import { adminClient, createTestUser, deleteTestUser } from '../helpers/db';

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
