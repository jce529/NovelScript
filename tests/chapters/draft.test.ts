import { describe, it, expect, afterAll } from 'vitest';
import { adminClient, createTestUser, deleteTestUser } from '../helpers/db';
import { createChapter } from '../../lib/chapters/actions';

describe('createChapter (CONT-01)', () => {
  const admin = adminClient();
  const users: string[] = [];

  afterAll(async () => {
    for (const id of users) {
      await deleteTestUser(id).catch(() => {});
    }
  });

  async function createOwnerWithWork() {
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
    return { ownerId: user.id, workId: workId as string };
  }

  it('creates a draft chapter with content = "", is_published = false, price_tier = null, order_index = 0 (first chapter)', async () => {
    const { ownerId, workId } = await createOwnerWithWork();

    const result = await createChapter(admin, { ownerId, workId, title: '1화' });
    expect(result.ok).toBe(true);
    expect(result.chapterId).toBeTruthy();

    const { data: row } = await admin.from('chapters').select('*').eq('id', result.chapterId!).single();
    expect(row.content).toBe('');
    expect(row.is_published).toBe(false);
    expect(row.price_tier).toBeNull();
    expect(row.order_index).toBe(0);
  });

  it('assigns order_index = current max + 1 for subsequent chapters in the same work', async () => {
    const { ownerId, workId } = await createOwnerWithWork();

    const first = await createChapter(admin, { ownerId, workId, title: '1화' });
    const second = await createChapter(admin, { ownerId, workId, title: '2화' });
    const third = await createChapter(admin, { ownerId, workId, title: '3화' });

    const { data: rows } = await admin
      .from('chapters')
      .select('id, order_index')
      .in('id', [first.chapterId!, second.chapterId!, third.chapterId!]);
    const byId = new Map(rows!.map((r) => [r.id, r.order_index]));

    expect(byId.get(first.chapterId!)).toBe(0);
    expect(byId.get(second.chapterId!)).toBe(1);
    expect(byId.get(third.chapterId!)).toBe(2);
  });

  it('rejects an empty/whitespace title and creates no row', async () => {
    const { ownerId, workId } = await createOwnerWithWork();

    const before = await admin.from('chapters').select('id', { count: 'exact', head: true }).eq('work_id', workId);

    const empty = await createChapter(admin, { ownerId, workId, title: '' });
    expect(empty.ok).toBe(false);

    const whitespace = await createChapter(admin, { ownerId, workId, title: '   ' });
    expect(whitespace.ok).toBe(false);

    const after = await admin.from('chapters').select('id', { count: 'exact', head: true }).eq('work_id', workId);
    expect(after.count).toBe(before.count);
  });
});
