import { describe, it, expect, afterAll } from 'vitest';
import { adminClient, createTestUser, deleteTestUser } from '../helpers/db';
import { getPublicChapter, listPublicChapters } from '../../lib/chapters/actions';

describe('paid-chapter content-leak guard (Pitfall 3 regression)', () => {
  const admin = adminClient();
  const users: string[] = [];

  afterAll(async () => {
    for (const id of users) {
      await deleteTestUser(id).catch(() => {});
    }
  });

  async function createOwnerWithWork() {
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
    return { ownerId: owner.id, workId: workId as string };
  }

  async function insertChapter(
    workId: string,
    input: { title: string; orderIndex: number; content?: string; published?: boolean; priceTier?: number | null }
  ) {
    const { data, error } = await admin
      .from('chapters')
      .insert({
        work_id: workId,
        title: input.title,
        order_index: input.orderIndex,
        content: input.content ?? '',
      })
      .select('id')
      .single();
    if (error) throw error;
    if (input.published) {
      await admin
        .from('chapters')
        .update({ is_published: true, price_tier: input.priceTier ?? null, published_at: new Date().toISOString() })
        .eq('id', data!.id);
    }
    return data!.id as string;
  }

  it('getPublicChapter never returns content for a published PAID chapter', async () => {
    const { workId } = await createOwnerWithWork();
    const chapterId = await insertChapter(workId, {
      title: '유료 1화',
      orderIndex: 0,
      content: '유료 본문 - 절대 노출되면 안 됨',
      published: true,
      priceTier: 30,
    });

    const result = await getPublicChapter(admin, { chapterId });

    expect(result).not.toBeNull();
    expect(result!.content).toBeNull();
    expect(result!.locked).toBe(true);
  });

  it('listPublicChapters returns both free and paid rows, but the paid row has no content field at all', async () => {
    const { workId } = await createOwnerWithWork();
    await insertChapter(workId, {
      title: '무료 1화',
      orderIndex: 0,
      content: '무료 본문',
      published: true,
      priceTier: null,
    });
    await insertChapter(workId, {
      title: '유료 2화',
      orderIndex: 1,
      content: '유료 본문 - 절대 노출되면 안 됨',
      published: true,
      priceTier: 30,
    });

    const result = await listPublicChapters(admin, { workId });

    expect(result.length).toBe(2);
    const paidRow = result.find((r) => r.locked === true);
    const freeRow = result.find((r) => r.locked === false);
    expect(paidRow).toBeDefined();
    expect(freeRow).toBeDefined();
    expect('content' in paidRow!).toBe(false);
  });
});
