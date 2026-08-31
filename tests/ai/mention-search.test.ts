import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { searchMentionNodes, quickAddMentionNode, getMentionedNodesContent } from '../../lib/ai/mentions';
import { createNode } from '../../lib/kb/actions';
import { adminClient, createTestUser, deleteTestUser } from '../helpers/db';

describe('lib/ai/mentions.ts — search + quick-add (EDIT-01)', () => {
  const admin = adminClient();
  let owner: { id: string };
  let workId: string;
  let otherWorkId: string;
  let personFolderId: string;

  beforeAll(async () => {
    owner = await createTestUser();
    const { data: work } = await admin.rpc('create_work', {
      p_owner_id: owner.id, p_title: '테스트 작품 (mention-search)', p_synopsis: null, p_cover_image_url: null, p_genre: null,
    });
    workId = work as string;
    const { data: otherWork } = await admin.rpc('create_work', {
      p_owner_id: owner.id, p_title: '다른 작품 (mention-search)', p_synopsis: null, p_cover_image_url: null, p_genre: null,
    });
    otherWorkId = otherWork as string;

    const { data: folder } = await admin
      .from('kb_nodes').select('id').eq('work_id', workId).eq('category', '인물').eq('node_type', 'folder').single();
    personFolderId = folder!.id;

    await createNode(admin, { ownerId: owner.id, workId, parentId: personFolderId, category: '인물', nodeType: 'file', name: '아서' });

    const { data: otherFolder } = await admin
      .from('kb_nodes').select('id').eq('work_id', otherWorkId).eq('category', '인물').eq('node_type', 'folder').single();
    await createNode(admin, { ownerId: owner.id, workId: otherWorkId, parentId: otherFolder!.id, category: '인물', nodeType: 'file', name: '아리아' });
  }, 30000);

  afterAll(async () => {
    await deleteTestUser(owner.id);
  });

  it('finds a KB document by partial name match, scoped to the work, with category included', async () => {
    const results = await searchMentionNodes(admin, { ownerId: owner.id, workId, query: '아' });
    expect(results.some((r) => r.name === '아서' && r.category === '인물')).toBe(true);
  });

  it('never returns a file from a different work, even for the same owner', async () => {
    const results = await searchMentionNodes(admin, { ownerId: owner.id, workId, query: '아' });
    expect(results.some((r) => r.name === '아리아')).toBe(false);
  });

  it('never returns a template-category row', async () => {
    const results = await searchMentionNodes(admin, { ownerId: owner.id, workId, query: '인물' });
    expect(results.every((r) => (r.category as string) !== 'template')).toBe(true);
  });

  it('returns an empty array for a whitespace-only query', async () => {
    const results = await searchMentionNodes(admin, { ownerId: owner.id, workId, query: '   ' });
    expect(results).toEqual([]);
  });

  it('quickAddMentionNode creates a new file in the correct category folder, immediately searchable', async () => {
    const result = await quickAddMentionNode(admin, { ownerId: owner.id, workId, category: '장소', name: '왕도' });
    expect(result.ok).toBe(true);

    const found = await searchMentionNodes(admin, { ownerId: owner.id, workId, query: '왕도' });
    expect(found.some((r) => r.id === result.nodeId && r.category === '장소')).toBe(true);
  });

  it('quickAddMentionNode rejects an empty name with the exact UI-SPEC error copy', async () => {
    const result = await quickAddMentionNode(admin, { ownerId: owner.id, workId, category: '인물', name: '   ' });
    expect(result).toEqual({ ok: false, error: '문서 이름을 입력해주세요.' });
  });
});

describe('lib/ai/mentions.ts — cross-scope search + content resolution (KB-04)', () => {
  const admin = adminClient();
  let owner: { id: string };
  let otherOwner: { id: string };
  let workId: string;
  let sharedFolderId: string;
  let sharedFileId: string;

  beforeAll(async () => {
    owner = await createTestUser();
    otherOwner = await createTestUser();
    const { data: work } = await admin.rpc('create_work', {
      p_owner_id: owner.id, p_title: '테스트 작품 (cross-scope-mention)', p_synopsis: null, p_cover_image_url: null, p_genre: null,
    });
    workId = work as string;

    const { data: folder } = await admin.from('kb_nodes')
      .insert({ owner_id: owner.id, work_id: null, scope: 'account_template', parent_id: null, node_type: 'folder', category: 'custom', is_locked: false, name: '세계관' })
      .select('id').single();
    sharedFolderId = folder!.id;

    const { data: file } = await admin.from('kb_nodes')
      .insert({ owner_id: owner.id, work_id: null, scope: 'account_template', parent_id: sharedFolderId, node_type: 'file', category: 'custom', is_locked: false, name: '왕국연대기', content: '# 왕국 연대기' })
      .select('id').single();
    sharedFileId = file!.id;
  }, 30000);

  afterAll(async () => {
    await deleteTestUser(owner.id);
    await deleteTestUser(otherOwner.id);
  });

  it('searchMentionNodes returns a matching account-shared document alongside work-scoped results, tagged scope=account_template', async () => {
    const results = await searchMentionNodes(admin, { ownerId: owner.id, workId, query: '왕국' });
    expect(results.some((r) => r.id === sharedFileId && r.scope === 'account_template')).toBe(true);
  });

  it("never returns another owner's account-shared documents (D-10 ownership scoping)", async () => {
    const results = await searchMentionNodes(admin, { ownerId: otherOwner.id, workId, query: '왕국' });
    expect(results.some((r) => r.id === sharedFileId)).toBe(false);
  });

  it('getMentionedNodesContent resolves an account-shared node id even though it has work_id=null', async () => {
    const docs = await getMentionedNodesContent(admin, { ownerId: owner.id, workId, nodeIds: [sharedFileId] });
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ id: sharedFileId, content: '# 왕국 연대기' });
  });

  it('getMentionedNodesContent resolves a MIX of work-scoped and account-shared ids in one call', async () => {
    const { data: personFolder } = await admin
      .from('kb_nodes').select('id').eq('work_id', workId).eq('category', '인물').eq('node_type', 'folder').single();
    const workDoc = await createNode(admin, { ownerId: owner.id, workId, parentId: personFolder!.id, category: '인물', nodeType: 'file', name: '혼합조회테스트' });

    const docs = await getMentionedNodesContent(admin, { ownerId: owner.id, workId, nodeIds: [sharedFileId, workDoc.nodeId!] });
    expect(docs.map((d) => d.id).sort()).toEqual([sharedFileId, workDoc.nodeId!].sort());
  });
});
