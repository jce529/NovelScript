import { describe, it, expect, afterAll } from 'vitest';
import { adminClient, createTestUser, deleteTestUser } from '../helpers/db';
import { upgradeToWriter } from '../../lib/auth/writer';

describe('upgradeToWriter', () => {
  const supabase = adminClient();
  let users: string[] = [];

  afterAll(async () => {
    for (const id of users) {
      await deleteTestUser(id).catch(() => {});
    }
  });

  it('flips a reader account to writer and sets pen_name/pen_name_bio/pen_name_set_at', async () => {
    const user = await createTestUser();
    users.push(user.id);

    const result = await upgradeToWriter(supabase, {
      userId: user.id,
      penName: '테스트작가',
      bio: '안녕하세요',
    });

    expect(result.ok).toBe(true);

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, pen_name, pen_name_bio, pen_name_set_at')
      .eq('id', user.id)
      .single();

    expect(profile?.role).toBe('writer');
    expect(profile?.pen_name).toBe('테스트작가');
    expect(profile?.pen_name_bio).toBe('안녕하세요');
    expect(profile?.pen_name_set_at).not.toBeNull();
  });

  it('rejects a second conversion attempt on an already-writer account', async () => {
    const user = await createTestUser();
    users.push(user.id);

    const first = await upgradeToWriter(supabase, { userId: user.id, penName: '첫필명' });
    expect(first.ok).toBe(true);

    const second = await upgradeToWriter(supabase, { userId: user.id, penName: '두번째필명' });
    expect(second.ok).toBe(false);

    const { data: profile } = await supabase
      .from('profiles')
      .select('pen_name')
      .eq('id', user.id)
      .single();

    // Pen name from the first (successful) conversion must be unchanged.
    expect(profile?.pen_name).toBe('첫필명');
  });

  it('rejects pen names shorter than 2 or longer than 20 characters', async () => {
    const user = await createTestUser();
    users.push(user.id);

    const tooShort = await upgradeToWriter(supabase, { userId: user.id, penName: 'a' });
    expect(tooShort.ok).toBe(false);

    const tooLong = await upgradeToWriter(supabase, {
      userId: user.id,
      penName: 'a'.repeat(21),
    });
    expect(tooLong.ok).toBe(false);
  });

  it('allows exactly one of two concurrent same-pen-name-different-case submissions to succeed (D-05)', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    users.push(userA.id, userB.id);

    const sharedPenName = `동시성테스트${Date.now()}`;

    const [resultA, resultB] = await Promise.all([
      upgradeToWriter(supabase, { userId: userA.id, penName: sharedPenName.toLowerCase() }),
      upgradeToWriter(supabase, { userId: userB.id, penName: sharedPenName.toUpperCase() }),
    ]);

    const results = [resultA, resultB];
    const succeeded = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);

    expect(succeeded.length).toBe(1);
    expect(failed.length).toBe(1);
    expect(failed[0].error).toBeDefined();
  });
});
