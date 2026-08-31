import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { adminClient, createTestUser, deleteTestUser } from '../helpers/db';

describe('회차-folder guard trigger (D-04: no generic KB file nodes under a 회차-category folder)', () => {
  const admin = adminClient();
  let owner: { id: string };
  let workId: string;
  let chapterRootId: string;

  beforeAll(async () => {
    owner = await createTestUser();
    const { data } = await admin.rpc('create_work', {
      p_owner_id: owner.id, p_title: '테스트 작품 (chapter-folder-guard)', p_synopsis: null, p_cover_image_url: null, p_genre: null,
    });
    workId = data as string;
    const { data: folder } = await admin
      .from('kb_nodes').select('id').eq('work_id', workId).eq('category', '회차').eq('node_type', 'folder').single();
    chapterRootId = folder!.id;
  }, 30000);

  afterAll(async () => { await deleteTestUser(owner.id); });

  it('rejects inserting a generic KB file node directly under the 회차 root with chapter_folder_no_kb_files', async () => {
    const { error } = await admin.from('kb_nodes').insert({
      owner_id: owner.id, work_id: workId, scope: 'work', parent_id: chapterRootId,
      node_type: 'file', category: '회차', is_locked: false, name: '실수로 만든 문서', content: '',
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain('chapter_folder_no_kb_files');
  });

  it('allows creating a custom sub-folder under 회차 for organizing episodes (folders are not blocked, only files)', async () => {
    const { error, data } = await admin.from('kb_nodes').insert({
      owner_id: owner.id, work_id: workId, scope: 'work', parent_id: chapterRootId,
      node_type: 'folder', category: '회차', is_locked: false, name: '1부',
    }).select('id').single();
    expect(error).toBeNull();
    expect(data!.id).toBeTruthy();
  });
});
