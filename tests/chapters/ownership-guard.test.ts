import { describe, it, expect, afterAll } from 'vitest';
import { adminClient, createTestUser, deleteTestUser } from '../helpers/db';
import {
  createChapter,
  publishChapter,
  reorderChapters,
  saveChapterContent,
  unpublishChapter,
} from '../../lib/chapters/actions';

describe('chapters ownership guard (Pitfall 1)', () => {
  const admin = adminClient();
  const users: string[] = [];

  afterAll(async () => {
    for (const id of users) {
      await deleteTestUser(id).catch(() => {});
    }
  });

  async function createOwnerAWithChapter() {
    const owner = await createTestUser();
    users.push(owner.id);
    const other = await createTestUser();
    users.push(other.id);

    const { data: workId, error } = await admin.rpc('create_work', {
      p_owner_id: owner.id,
      p_title: '테스트 작품',
      p_synopsis: null,
      p_cover_image_url: null,
      p_genre: null,
    });
    if (error) throw error;

    const created = await createChapter(admin, { ownerId: owner.id, workId: workId as string, title: '1화' });

    return { ownerId: owner.id, otherOwnerId: other.id, workId: workId as string, chapterId: created.chapterId! };
  }

  it('saveChapterContent rejects a cross-owner attempt without side effects', async () => {
    const { otherOwnerId, chapterId } = await createOwnerAWithChapter();

    const before = await admin.from('chapters').select('content').eq('id', chapterId).single();

    const result = await saveChapterContent(admin, { ownerId: otherOwnerId, chapterId, content: '해킹된 본문' });
    expect(result.ok).toBe(false);

    const after = await admin.from('chapters').select('content').eq('id', chapterId).single();
    expect(after.data!.content).toBe(before.data!.content);
  });

  it('publishChapter rejects a cross-owner attempt without side effects', async () => {
    const { otherOwnerId, chapterId } = await createOwnerAWithChapter();

    const result = await publishChapter(admin, { ownerId: otherOwnerId, chapterId, priceTier: 10 });
    expect(result.ok).toBe(false);

    const { data: row } = await admin.from('chapters').select('is_published, price_tier').eq('id', chapterId).single();
    expect(row.is_published).toBe(false);
    expect(row.price_tier).toBeNull();
  });

  it('unpublishChapter rejects a cross-owner attempt without side effects', async () => {
    const { ownerId, otherOwnerId, chapterId } = await createOwnerAWithChapter();
    await publishChapter(admin, { ownerId, chapterId, priceTier: null });

    const result = await unpublishChapter(admin, { ownerId: otherOwnerId, chapterId });
    expect(result.ok).toBe(false);

    const { data: row } = await admin.from('chapters').select('is_published').eq('id', chapterId).single();
    expect(row.is_published).toBe(true);
  });

  it('reorderChapters rejects a cross-owner attempt without side effects', async () => {
    const { ownerId, otherOwnerId, workId, chapterId } = await createOwnerAWithChapter();
    const second = await createChapter(admin, { ownerId, workId, title: '2화' });

    const { data: before } = await admin.from('chapters').select('id, order_index').eq('work_id', workId);
    const beforeById = new Map(before!.map((r) => [r.id, r.order_index]));

    const result = await reorderChapters(admin, {
      ownerId: otherOwnerId,
      workId,
      orderedIds: [second.chapterId!, chapterId],
    });
    expect(result.ok).toBe(false);

    const { data: after } = await admin.from('chapters').select('id, order_index').eq('work_id', workId);
    const afterById = new Map(after!.map((r) => [r.id, r.order_index]));

    expect(afterById.get(chapterId)).toBe(beforeById.get(chapterId));
    expect(afterById.get(second.chapterId!)).toBe(beforeById.get(second.chapterId!));
  });
});
