import { describe, it, expect, afterAll } from 'vitest';
import { adminClient, createTestUser, deleteTestUser } from '../helpers/db';
import { createChapter, publishChapter, saveChapterContent, unpublishChapter } from '../../lib/chapters/actions';

describe('saveChapterContent / unpublishChapter (CONT-03, D-21, D-22)', () => {
  const admin = adminClient();
  const users: string[] = [];

  afterAll(async () => {
    for (const id of users) {
      await deleteTestUser(id).catch(() => {});
    }
  });

  async function createOwnerWithChapter() {
    const user = await createTestUser();
    users.push(user.id);
    const { data: workId, error } = await admin.rpc('create_work', {
      p_owner_id: user.id,
      p_title: '테스트 작품',
      p_synopsis: null,
      p_cover_image_url: null,
      p_genre: null,
    });
    if (error) throw error;
    const created = await createChapter(admin, { ownerId: user.id, workId: workId as string, title: '1화' });
    return { ownerId: user.id, workId: workId as string, chapterId: created.chapterId! };
  }

  it('D-21: editing content on an already-published chapter succeeds and is readable immediately, is_published stays true', async () => {
    const { ownerId, chapterId } = await createOwnerWithChapter();

    const published = await publishChapter(admin, { ownerId, chapterId, priceTier: null });
    expect(published.ok).toBe(true);

    const edit = await saveChapterContent(admin, { ownerId, chapterId, content: '수정된 본문 내용' });
    expect(edit.ok).toBe(true);

    const { data: row } = await admin.from('chapters').select('content, is_published').eq('id', chapterId).single();
    expect(row.content).toBe('수정된 본문 내용');
    expect(row.is_published).toBe(true);
  });

  it('saveChapterContent updates content/updated_at without touching is_published/price_tier', async () => {
    const { ownerId, chapterId } = await createOwnerWithChapter();

    const edit = await saveChapterContent(admin, { ownerId, chapterId, content: '초안 본문' });
    expect(edit.ok).toBe(true);

    const { data: row } = await admin.from('chapters').select('content, is_published, price_tier').eq('id', chapterId).single();
    expect(row.content).toBe('초안 본문');
    expect(row.is_published).toBe(false);
    expect(row.price_tier).toBeNull();
  });

  it('D-22: unpublishChapter sets is_published = false, unpublished_at non-null, and leaves content byte-for-byte unchanged', async () => {
    const { ownerId, chapterId } = await createOwnerWithChapter();

    await publishChapter(admin, { ownerId, chapterId, priceTier: 50 });
    await saveChapterContent(admin, { ownerId, chapterId, content: '변하면 안 되는 본문' });

    const before = await admin.from('chapters').select('content').eq('id', chapterId).single();

    const result = await unpublishChapter(admin, { ownerId, chapterId });
    expect(result.ok).toBe(true);

    const { data: row } = await admin.from('chapters').select('content, is_published, unpublished_at').eq('id', chapterId).single();
    expect(row.is_published).toBe(false);
    expect(row.unpublished_at).not.toBeNull();
    expect(row.content).toBe(before.data!.content);
  });
});
