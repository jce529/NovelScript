import { describe, it, expect, afterAll } from 'vitest';
import { adminClient, anonClient, createTestUser, deleteTestUser } from '../helpers/db';
import { incrementChapterView } from '../../lib/reader/views';

describe('incrementChapterView (D-09: unconditional, no per-user dedup)', () => {
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

  it('increments view_count by exactly 1 on a published chapter, called anonymously', async () => {
    const { chapterId } = await createWorkWithPublishedAndUnpublishedChapter();

    await incrementChapterView(anonClient(), { chapterId });

    const { data } = await admin.from('chapters').select('view_count').eq('id', chapterId).single();
    expect(data!.view_count).toBe(1);
  });

  it('increments by 2 total when called twice in a row (no per-user dedup)', async () => {
    const { chapterId } = await createWorkWithPublishedAndUnpublishedChapter();

    await incrementChapterView(anonClient(), { chapterId });
    await incrementChapterView(anonClient(), { chapterId });

    const { data } = await admin.from('chapters').select('view_count').eq('id', chapterId).single();
    expect(data!.view_count).toBe(2);
  });

  it('does not throw and does not change view_count for an unpublished chapter', async () => {
    const { unpublishedChapterId } = await createWorkWithPublishedAndUnpublishedChapter();

    await expect(incrementChapterView(anonClient(), { chapterId: unpublishedChapterId })).resolves.toBeUndefined();

    const { data } = await admin.from('chapters').select('view_count').eq('id', unpublishedChapterId).single();
    expect(data!.view_count).toBe(0);
  });
});
