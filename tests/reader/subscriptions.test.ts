import { describe, it, expect, afterAll } from 'vitest';
import { adminClient, createTestUser, deleteTestUser } from '../helpers/db';
import { toggleSubscription, getSubscriptionState } from '../../lib/reader/subscriptions';

describe('subscriptions (READ-07/D-18)', () => {
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

  it('toggling for a user with no existing row inserts one and returns subscribed: true', async () => {
    const workId = await createWork();
    const reader = await createTestUser();
    users.push(reader.id);

    const result = await toggleSubscription(admin, { workId, userId: reader.id });
    expect(result).toEqual({ subscribed: true });
  });

  it('toggling again for the SAME user+work deletes the row and returns subscribed: false', async () => {
    const workId = await createWork();
    const reader = await createTestUser();
    users.push(reader.id);

    await toggleSubscription(admin, { workId, userId: reader.id });
    const second = await toggleSubscription(admin, { workId, userId: reader.id });
    expect(second).toEqual({ subscribed: false });
  });

  it('getSubscriptionState returns false with no row, true after toggling once', async () => {
    const workId = await createWork();
    const reader = await createTestUser();
    users.push(reader.id);

    expect(await getSubscriptionState(admin, { workId, userId: reader.id })).toBe(false);
    await toggleSubscription(admin, { workId, userId: reader.id });
    expect(await getSubscriptionState(admin, { workId, userId: reader.id })).toBe(true);
  });
});
