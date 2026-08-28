import { describe, it, expect, afterAll } from 'vitest';
import { adminClient, createTestUser, deleteTestUser } from '../helpers/db';
import { createChapter, publishChapter } from '../../lib/chapters/actions';

describe('publishChapter (CONT-02)', () => {
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

  it('publishes as free: is_published = true, price_tier = null, published_at set', async () => {
    const { ownerId, chapterId } = await createOwnerWithChapter();

    const result = await publishChapter(admin, { ownerId, chapterId, priceTier: null });
    expect(result.ok).toBe(true);

    const { data: row } = await admin.from('chapters').select('*').eq('id', chapterId).single();
    expect(row.is_published).toBe(true);
    expect(row.price_tier).toBeNull();
    expect(row.published_at).not.toBeNull();
  });

  it('publishes as paid at a fixed tier: is_published = true, price_tier = 30', async () => {
    const { ownerId, chapterId } = await createOwnerWithChapter();

    const result = await publishChapter(admin, { ownerId, chapterId, priceTier: 30 });
    expect(result.ok).toBe(true);

    const { data: row } = await admin.from('chapters').select('*').eq('id', chapterId).single();
    expect(row.is_published).toBe(true);
    expect(row.price_tier).toBe(30);
  });

  it('rejects a non-fixed-tier price (25) before it ever reaches the DB CHECK constraint', async () => {
    const { ownerId, chapterId } = await createOwnerWithChapter();

    const result = await publishChapter(admin, { ownerId, chapterId, priceTier: 25 });
    expect(result.ok).toBe(false);

    const { data: row } = await admin.from('chapters').select('is_published, price_tier').eq('id', chapterId).single();
    expect(row.is_published).toBe(false);
    expect(row.price_tier).toBeNull();
  });
});
