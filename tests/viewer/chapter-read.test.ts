import { describe, it, expect, afterAll } from 'vitest';
import { adminClient, createTestUser, deleteTestUser } from '../helpers/db';
import { getPublicChapter, listPublicChapters } from '../../lib/chapters/actions';
import { getPublicWork } from '../../lib/works/actions';

describe('getPublicChapter / listPublicChapters / getPublicWork (READ-02)', () => {
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

  it('returns content and locked:false for a published, free chapter', async () => {
    const { workId } = await createOwnerWithWork();
    const chapterId = await insertChapter(workId, {
      title: '1화',
      orderIndex: 0,
      content: '실제 본문 내용입니다.',
      published: true,
      priceTier: null,
    });

    const result = await getPublicChapter(admin, { chapterId });

    expect(result).not.toBeNull();
    expect(result!.content).toBe('실제 본문 내용입니다.');
    expect(result!.locked).toBe(false);
  });

  it('returns null for an unpublished chapter', async () => {
    const { workId } = await createOwnerWithWork();
    const chapterId = await insertChapter(workId, { title: '초안', orderIndex: 0, published: false });

    const result = await getPublicChapter(admin, { chapterId });

    expect(result).toBeNull();
  });

  it('returns null for a soft-deleted chapter', async () => {
    const { workId } = await createOwnerWithWork();
    const chapterId = await insertChapter(workId, { title: '삭제됨', orderIndex: 0, published: true });
    await admin.from('chapters').update({ deleted_at: new Date().toISOString() }).eq('id', chapterId);

    const result = await getPublicChapter(admin, { chapterId });

    expect(result).toBeNull();
  });

  it('listPublicChapters returns only published chapters ordered by orderIndex ascending', async () => {
    const { workId } = await createOwnerWithWork();
    const ch0 = await insertChapter(workId, { title: '1화', orderIndex: 0, published: true });
    const ch1 = await insertChapter(workId, { title: '2화', orderIndex: 1, published: true });
    const ch2 = await insertChapter(workId, { title: '3화', orderIndex: 2, published: true });
    await insertChapter(workId, { title: '미발행 4화', orderIndex: 3, published: false });

    const result = await listPublicChapters(admin, { workId });

    expect(result.map((c) => c.id)).toEqual([ch0, ch1, ch2]);
    expect(result.map((c) => c.orderIndex)).toEqual([0, 1, 2]);
  });

  it('getPublicWork returns a non-deleted work owned by a different user (no ownership gate)', async () => {
    const { workId } = await createOwnerWithWork();

    const result = await getPublicWork(admin, { workId });

    expect(result).not.toBeNull();
    expect(result!.id).toBe(workId);
  });

  it('getPublicWork returns null for a soft-deleted work', async () => {
    const { workId } = await createOwnerWithWork();
    await admin.from('works').update({ deleted_at: new Date().toISOString() }).eq('id', workId);

    const result = await getPublicWork(admin, { workId });

    expect(result).toBeNull();
  });
});
