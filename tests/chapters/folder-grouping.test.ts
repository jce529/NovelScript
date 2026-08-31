import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createChapter } from '../../lib/chapters/actions';
import { createNode, deleteNode } from '../../lib/kb/actions';
import { adminClient, createTestUser, deleteTestUser } from '../helpers/db';

describe('Chapter/회차-folder grouping (D-05/D-06, integration)', () => {
  const admin = adminClient();
  let owner: { id: string };
  let workId: string;
  let chapterRootId: string;
  let arcFolderId: string;

  beforeAll(async () => {
    owner = await createTestUser();
    const { data } = await admin.rpc('create_work', {
      p_owner_id: owner.id, p_title: '테스트 작품 (folder-grouping)', p_synopsis: null, p_cover_image_url: null, p_genre: null,
    });
    workId = data as string;
    const { data: root } = await admin
      .from('kb_nodes').select('id').eq('work_id', workId).eq('category', '회차').eq('node_type', 'folder').is('parent_id', null).single();
    chapterRootId = root!.id;

    const arc = await createNode(admin, { ownerId: owner.id, workId, parentId: chapterRootId, category: '회차', nodeType: 'folder', name: '1부' });
    arcFolderId = arc.nodeId!;
  }, 30000);

  afterAll(async () => { await deleteTestUser(owner.id); });

  it('creates a chapter with no folderId (folder_id stays null = 회차 root)', async () => {
    const result = await createChapter(admin, { ownerId: owner.id, workId, title: '프롤로그' });
    expect(result.ok).toBe(true);
    const { data } = await admin.from('chapters').select('folder_id').eq('id', result.chapterId!).single();
    expect(data!.folder_id).toBeNull();
  });

  it('creates a chapter inside a valid 회차 sub-folder', async () => {
    const result = await createChapter(admin, { ownerId: owner.id, workId, title: '1화', folderId: arcFolderId });
    expect(result.ok).toBe(true);
    const { data } = await admin.from('chapters').select('folder_id').eq('id', result.chapterId!).single();
    expect(data!.folder_id).toBe(arcFolderId);
  });

  it('rejects a folderId that is not a 회차-category folder in this work', async () => {
    const { data: personFolder } = await admin
      .from('kb_nodes').select('id').eq('work_id', workId).eq('category', '인물').eq('node_type', 'folder').single();
    const result = await createChapter(admin, { ownerId: owner.id, workId, title: '잘못된폴더', folderId: personFolder!.id });
    expect(result).toEqual({ ok: false, error: '선택한 폴더를 찾을 수 없어요. 새로고침 후 다시 시도해주세요.' });
  });

  it('nulls out folder_id (not deletes/orphans) chapters when their 회차 sub-folder is deleted', async () => {
    const tempArc = await createNode(admin, { ownerId: owner.id, workId, parentId: chapterRootId, category: '회차', nodeType: 'folder', name: '삭제될아크' });
    const chapter = await createChapter(admin, { ownerId: owner.id, workId, title: '2화', folderId: tempArc.nodeId! });
    expect(chapter.ok).toBe(true);

    const deleted = await deleteNode(admin, { ownerId: owner.id, nodeId: tempArc.nodeId! });
    expect(deleted.ok).toBe(true);

    const { data } = await admin.from('chapters').select('folder_id, deleted_at').eq('id', chapter.chapterId!).single();
    expect(data!.folder_id).toBeNull();
    expect(data!.deleted_at).toBeNull();
  });
});
