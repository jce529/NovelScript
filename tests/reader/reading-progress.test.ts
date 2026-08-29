import { describe, it, expect, afterAll } from 'vitest';
import { adminClient, createTestUser, deleteTestUser } from '../helpers/db';
import { upsertReadingProgress, getReadingProgress, listRecentlyRead } from '../../lib/reader/progress';

describe('reading progress (D-14/D-15: one row per user+work, chapter-level granularity)', () => {
  const admin = adminClient();
  const users: string[] = [];

  afterAll(async () => {
    for (const id of users) {
      await deleteTestUser(id).catch(() => {});
    }
  });

  async function createReader() {
    const reader = await createTestUser();
    users.push(reader.id);
    return reader;
  }

  async function createWorkWithChapters(chapterCount: number) {
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

    const chapterIds: string[] = [];
    for (let i = 0; i < chapterCount; i++) {
      const { data: chapter, error: chErr } = await admin
        .from('chapters')
        .insert({ work_id: workId as string, title: `${i + 1}화`, order_index: i })
        .select('id')
        .single();
      if (chErr) throw chErr;
      await admin.from('chapters').update({ is_published: true }).eq('id', chapter!.id);
      chapterIds.push(chapter!.id as string);
    }

    return { workId: workId as string, chapterIds };
  }

  it('upsertReadingProgress creates a row readable by getReadingProgress', async () => {
    const reader = await createReader();
    const { workId, chapterIds } = await createWorkWithChapters(1);

    await upsertReadingProgress(admin, { userId: reader.id, workId, chapterId: chapterIds[0] });

    const progress = await getReadingProgress(admin, { userId: reader.id, workId });
    expect(progress).toEqual({ chapterId: chapterIds[0] });
  });

  it('upsertReadingProgress updates the existing row in place for the same user+work', async () => {
    const reader = await createReader();
    const { workId, chapterIds } = await createWorkWithChapters(2);

    await upsertReadingProgress(admin, { userId: reader.id, workId, chapterId: chapterIds[0] });
    await upsertReadingProgress(admin, { userId: reader.id, workId, chapterId: chapterIds[1] });

    const progress = await getReadingProgress(admin, { userId: reader.id, workId });
    expect(progress).toEqual({ chapterId: chapterIds[1] });

    const { data: rows } = await admin
      .from('reading_progress')
      .select('chapter_id')
      .eq('user_id', reader.id)
      .eq('work_id', workId);
    expect(rows).toHaveLength(1);
  });

  it('getReadingProgress returns null when there is no prior progress', async () => {
    const reader = await createReader();
    const { workId } = await createWorkWithChapters(1);

    const progress = await getReadingProgress(admin, { userId: reader.id, workId });
    expect(progress).toBeNull();
  });

  it('listRecentlyRead returns entries ordered by updatedAt descending with full shape', async () => {
    const reader = await createReader();
    const workA = await createWorkWithChapters(1);
    const workB = await createWorkWithChapters(1);

    await upsertReadingProgress(admin, { userId: reader.id, workId: workA.workId, chapterId: workA.chapterIds[0] });
    await new Promise((resolve) => setTimeout(resolve, 20));
    await upsertReadingProgress(admin, { userId: reader.id, workId: workB.workId, chapterId: workB.chapterIds[0] });

    const list = await listRecentlyRead(admin, { userId: reader.id, limit: 10 });

    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list[0].workId).toBe(workB.workId);
    expect(list[1].workId).toBe(workA.workId);
    expect(list[0]).toEqual(
      expect.objectContaining({
        workId: workB.workId,
        workTitle: expect.any(String),
        coverImageUrl: null,
        chapterId: workB.chapterIds[0],
        chapterTitle: expect.any(String),
        chapterOrderIndex: 0,
        updatedAt: expect.any(String),
      })
    );
  });

  it('listRecentlyRead respects the limit parameter, returning the most recently updated', async () => {
    const reader = await createReader();
    const workA = await createWorkWithChapters(1);
    const workB = await createWorkWithChapters(1);
    const workC = await createWorkWithChapters(1);

    await upsertReadingProgress(admin, { userId: reader.id, workId: workA.workId, chapterId: workA.chapterIds[0] });
    await new Promise((resolve) => setTimeout(resolve, 20));
    await upsertReadingProgress(admin, { userId: reader.id, workId: workB.workId, chapterId: workB.chapterIds[0] });
    await new Promise((resolve) => setTimeout(resolve, 20));
    await upsertReadingProgress(admin, { userId: reader.id, workId: workC.workId, chapterId: workC.chapterIds[0] });

    const list = await listRecentlyRead(admin, { userId: reader.id, limit: 2 });

    expect(list).toHaveLength(2);
    expect(list[0].workId).toBe(workC.workId);
    expect(list[1].workId).toBe(workB.workId);
  });
});
