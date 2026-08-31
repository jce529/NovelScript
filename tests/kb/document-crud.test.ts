import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createNode, renameNode, deleteNode, saveNodeContent, getWorkKbNodes } from '../../lib/kb/actions';
import { readCanonicalSeed } from '../../lib/kb/templates';
import { adminClient, createTestUser, deleteTestUser } from '../helpers/db';

describe('KB node CRUD (integration, lib/kb/actions.ts)', () => {
  const admin = adminClient();
  let owner: { id: string };
  let workId: string;
  let personFolderId: string;
  let eventFolderId: string;

  beforeAll(async () => {
    owner = await createTestUser();
    const { data, error } = await admin.rpc('create_work', {
      p_owner_id: owner.id,
      p_title: '테스트 작품 (document-crud)',
      p_synopsis: null,
      p_cover_image_url: null,
      p_genre: null,
    });
    if (error) throw error;
    workId = data as string;

    const { data: personFolder } = await admin
      .from('kb_nodes').select('id').eq('work_id', workId).eq('category', '인물').eq('node_type', 'folder').single();
    personFolderId = personFolder!.id;

    const { data: eventFolder } = await admin
      .from('kb_nodes').select('id').eq('work_id', workId).eq('category', '사건').eq('node_type', 'folder').single();
    eventFolderId = eventFolder!.id;
  }, 30000);

  afterAll(async () => {
    await deleteTestUser(owner.id);
  });

  it('creates a 인물 document seeded from the canonical template with the title substituted', async () => {
    const result = await createNode(admin, {
      ownerId: owner.id, workId, parentId: personFolderId, category: '인물', nodeType: 'file', name: '아서',
    });
    expect(result.ok).toBe(true);

    const { data } = await admin.from('kb_nodes').select('content').eq('id', result.nodeId!).single();
    expect(data!.content).toContain('아서');
    expect(data!.content).not.toContain('<% tp.file.title %>');
  });

  it('creates a 사건 document unchanged from the canonical file (no title placeholder to substitute — Pitfall 3)', async () => {
    const canonical = await readCanonicalSeed('사건');
    const result = await createNode(admin, {
      ownerId: owner.id, workId, parentId: eventFolderId, category: '사건', nodeType: 'file', name: '전쟁의 시작',
    });
    expect(result.ok).toBe(true);

    const { data } = await admin.from('kb_nodes').select('content').eq('id', result.nodeId!).single();
    expect(data!.content).toBe(canonical);
  });

  it('rejects a sibling name collision under the same parent with the exact UI-SPEC copy', async () => {
    const first = await createNode(admin, {
      ownerId: owner.id, workId, parentId: personFolderId, category: '인물', nodeType: 'file', name: '중복이름',
    });
    expect(first.ok).toBe(true);

    const second = await createNode(admin, {
      ownerId: owner.id, workId, parentId: personFolderId, category: '인물', nodeType: 'file', name: '중복이름',
    });
    expect(second).toEqual({ ok: false, error: '이미 같은 이름의 파일/폴더가 있어요. 다른 이름을 사용해주세요.' });
  });

  it('renames a non-locked file', async () => {
    const created = await createNode(admin, {
      ownerId: owner.id, workId, parentId: personFolderId, category: '인물', nodeType: 'file', name: '이름바꾸기전',
    });
    const renamed = await renameNode(admin, { ownerId: owner.id, nodeId: created.nodeId!, name: '이름바꾼후' });
    expect(renamed.ok).toBe(true);

    const { data } = await admin.from('kb_nodes').select('name').eq('id', created.nodeId!).single();
    expect(data!.name).toBe('이름바꾼후');
  });

  it('soft-deletes a non-locked file and excludes it from a subsequent getWorkKbNodes call', async () => {
    const created = await createNode(admin, {
      ownerId: owner.id, workId, parentId: personFolderId, category: '인물', nodeType: 'file', name: '삭제될문서',
    });
    const deleted = await deleteNode(admin, { ownerId: owner.id, nodeId: created.nodeId! });
    expect(deleted.ok).toBe(true);

    const { data } = await admin.from('kb_nodes').select('deleted_at').eq('id', created.nodeId!).single();
    expect(data!.deleted_at).not.toBeNull();

    const tree = await getWorkKbNodes(admin, { ownerId: owner.id, workId });
    expect(tree.some((n) => n.id === created.nodeId)).toBe(false);
  });

  it('saves updated content via saveNodeContent', async () => {
    const created = await createNode(admin, {
      ownerId: owner.id, workId, parentId: personFolderId, category: '인물', nodeType: 'file', name: '내용수정문서',
    });
    const saved = await saveNodeContent(admin, { ownerId: owner.id, nodeId: created.nodeId!, content: '수정된 내용' });
    expect(saved.ok).toBe(true);

    const { data } = await admin.from('kb_nodes').select('content').eq('id', created.nodeId!).single();
    expect(data!.content).toBe('수정된 내용');
  });
});
