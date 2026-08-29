import { describe, it, expect, afterAll } from 'vitest';
import { adminClient, createTestUser, deleteTestUser } from '../helpers/db';
import { toggleLike, getLikeState, getLikeCount } from '../../lib/reader/likes';

describe('likes (D-08)', () => {
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

  it('toggling for a user with no existing row inserts one and returns liked: true', async () => {
    const workId = await createWork();
    const reader = await createTestUser();
    users.push(reader.id);

    const result = await toggleLike(admin, { workId, userId: reader.id });
    expect(result).toEqual({ liked: true });
  });

  it('toggling again for the SAME user+work deletes the row and returns liked: false', async () => {
    const workId = await createWork();
    const reader = await createTestUser();
    users.push(reader.id);

    await toggleLike(admin, { workId, userId: reader.id });
    const second = await toggleLike(admin, { workId, userId: reader.id });
    expect(second).toEqual({ liked: false });
  });

  it('getLikeState returns false with no row, true after toggling once', async () => {
    const workId = await createWork();
    const reader = await createTestUser();
    users.push(reader.id);

    expect(await getLikeState(admin, { workId, userId: reader.id })).toBe(false);
    await toggleLike(admin, { workId, userId: reader.id });
    expect(await getLikeState(admin, { workId, userId: reader.id })).toBe(true);
  });

  it('getLikeCount reflects the number of distinct users who liked the work', async () => {
    const workId = await createWork();
    const readerA = await createTestUser();
    users.push(readerA.id);
    const readerB = await createTestUser();
    users.push(readerB.id);

    await toggleLike(admin, { workId, userId: readerA.id });
    await toggleLike(admin, { workId, userId: readerB.id });
    expect(await getLikeCount(admin, { workId })).toBe(2);

    await toggleLike(admin, { workId, userId: readerA.id });
    expect(await getLikeCount(admin, { workId })).toBe(1);
  });
});
