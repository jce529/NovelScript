import { describe, it, expect, afterAll } from 'vitest';
import { adminClient, anonClient, createTestUser, deleteTestUser } from '../helpers/db';

describe('public read RLS (Pitfall 1/2: RLS silently returns empty arrays, not errors)', () => {
  const admin = adminClient();
  const users: string[] = [];

  afterAll(async () => {
    for (const id of users) {
      await deleteTestUser(id).catch(() => {});
    }
  });

  async function createWorkWithPublishedAndUnpublishedChapter() {
    const owner = await createTestUser();
    users.push(owner.id);

    const { data: workId, error } = await admin.rpc('create_work', {
      p_owner_id: owner.id,
      p_title: '테스트 작품',
      p_synopsis: null,
      p_cover_image_url: null,
      p_genre: null,
    });
    if (error) throw error;

    const { data: publishedChapter, error: pubErr } = await admin
      .from('chapters')
      .insert({ work_id: workId as string, title: '1화', order_index: 1 })
      .select('id')
      .single();
    if (pubErr) throw pubErr;
    await admin.from('chapters').update({ is_published: true }).eq('id', publishedChapter!.id);

    const { data: unpublishedChapter, error: unpubErr } = await admin
      .from('chapters')
      .insert({ work_id: workId as string, title: '2화', order_index: 2 })
      .select('id')
      .single();
    if (unpubErr) throw unpubErr;

    return {
      workId: workId as string,
      chapterId: publishedChapter!.id as string,
      unpublishedChapterId: unpublishedChapter!.id as string,
    };
  }

  it('anonClient can read a published work (proves works_public_read)', async () => {
    const { workId } = await createWorkWithPublishedAndUnpublishedChapter();

    const anon = anonClient();
    const { data, error } = await anon.from('works').select('id').eq('id', workId);

    expect(error).toBeNull();
    expect(data).toEqual([{ id: workId }]);
  });

  it('anonClient can read a published chapter (proves chapters_public_read)', async () => {
    const { chapterId } = await createWorkWithPublishedAndUnpublishedChapter();

    const anon = anonClient();
    const { data, error } = await anon.from('chapters').select('id, is_published').eq('id', chapterId);

    expect(error).toBeNull();
    expect(data).toEqual([{ id: chapterId, is_published: true }]);
  });

  it('anonClient cannot read an unpublished chapter on the same work', async () => {
    const { unpublishedChapterId } = await createWorkWithPublishedAndUnpublishedChapter();

    const anon = anonClient();
    const { data, error } = await anon.from('chapters').select('id').eq('id', unpublishedChapterId);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('anonClient can call increment_chapter_view and it increments view_count', async () => {
    const { chapterId } = await createWorkWithPublishedAndUnpublishedChapter();

    const anon = anonClient();
    const { error: rpcError } = await anon.rpc('increment_chapter_view', { p_chapter_id: chapterId });
    expect(rpcError).toBeNull();

    const { data } = await admin.from('chapters').select('view_count').eq('id', chapterId).single();
    expect(data!.view_count).toBe(1);
  });
});
