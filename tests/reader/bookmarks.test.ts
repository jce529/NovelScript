import { describe, it, expect, afterAll } from 'vitest';
import { adminClient, createTestUser, deleteTestUser } from '../helpers/db';
import { toggleBookmark, getBookmarkState } from '../../lib/reader/bookmarks';

describe('bookmarks (READ-08/D-19)', () => {
  const admin = adminClient();
  const users: string[] = [];

  afterAll(async () => {
    for (const id of users) {
      await deleteTestUser(id).catch(() => {});
    }
  });

  async function createWork() {
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
    return workId as string;
  }

  it('toggling for a user with no existing row inserts one and returns bookmarked: true', async () => {
    const workId = await createWork();
    const reader = await createTestUser();
    users.push(reader.id);

    const result = await toggleBookmark(admin, { workId, userId: reader.id });
    expect(result).toEqual({ bookmarked: true });
  });

  it('toggling again for the SAME user+work deletes the row and returns bookmarked: false', async () => {
    const workId = await createWork();
    const reader = await createTestUser();
    users.push(reader.id);

    await toggleBookmark(admin, { workId, userId: reader.id });
    const second = await toggleBookmark(admin, { workId, userId: reader.id });
    expect(second).toEqual({ bookmarked: false });
  });

  it('getBookmarkState returns false with no row, true after toggling once', async () => {
    const workId = await createWork();
    const reader = await createTestUser();
    users.push(reader.id);

    expect(await getBookmarkState(admin, { workId, userId: reader.id })).toBe(false);
    await toggleBookmark(admin, { workId, userId: reader.id });
    expect(await getBookmarkState(admin, { workId, userId: reader.id })).toBe(true);
  });
});
