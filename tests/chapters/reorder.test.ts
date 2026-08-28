import { describe, it, expect, afterAll } from 'vitest';
import { adminClient, createTestUser, deleteTestUser } from '../helpers/db';
import { createChapter, reorderChapters } from '../../lib/chapters/actions';

describe('reorderChapters (D-17, deferred unique constraint)', () => {
  const admin = adminClient();
  const users: string[] = [];

  afterAll(async () => {
    for (const id of users) {
      await deleteTestUser(id).catch(() => {});
    }
  });

  async function createOwnerWithThreeChapters() {
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

    const c1 = await createChapter(admin, { ownerId: user.id, workId: workId as string, title: '1화' });
    const c2 = await createChapter(admin, { ownerId: user.id, workId: workId as string, title: '2화' });
    const c3 = await createChapter(admin, { ownerId: user.id, workId: workId as string, title: '3화' });

    return {
      ownerId: user.id,
      workId: workId as string,
      c1: c1.chapterId!,
      c2: c2.chapterId!,
      c3: c3.chapterId!,
    };
  }

  it('resequences a 3-chapter cyclic swap [c3, c1, c2] -> c3=0, c1=1, c2=2, passing through a momentary shared order_index', async () => {
    const { ownerId, workId, c1, c2, c3 } = await createOwnerWithThreeChapters();

    const result = await reorderChapters(admin, { ownerId, workId, orderedIds: [c3, c1, c2] });
    expect(result.ok).toBe(true);

    const { data: rows } = await admin.from('chapters').select('id, order_index').eq('work_id', workId);
    const byId = new Map(rows!.map((r) => [r.id, r.order_index]));

    expect(byId.get(c3)).toBe(0);
    expect(byId.get(c1)).toBe(1);
    expect(byId.get(c2)).toBe(2);
  });

  it('rejects reorder for a workId not owned by ownerId, leaving the actual order unchanged', async () => {
    const { workId, c1, c2, c3 } = await createOwnerWithThreeChapters();
    const otherUser = await createTestUser();
    users.push(otherUser.id);

    const { data: before } = await admin.from('chapters').select('id, order_index').eq('work_id', workId);
    const beforeById = new Map(before!.map((r) => [r.id, r.order_index]));

    const result = await reorderChapters(admin, { ownerId: otherUser.id, workId, orderedIds: [c3, c2, c1] });
    expect(result.ok).toBe(false);

    const { data: after } = await admin.from('chapters').select('id, order_index').eq('work_id', workId);
    const afterById = new Map(after!.map((r) => [r.id, r.order_index]));

    expect(afterById.get(c1)).toBe(beforeById.get(c1));
    expect(afterById.get(c2)).toBe(beforeById.get(c2));
    expect(afterById.get(c3)).toBe(beforeById.get(c3));
  });
});
