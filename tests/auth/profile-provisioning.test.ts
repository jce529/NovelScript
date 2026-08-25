import { describe, it, expect, afterAll } from 'vitest';
import { pgPool, createTestUser, deleteTestUser } from '../helpers/db';

describe('Profile Auto-provisioning', () => {
  const sql = pgPool();
  let users: string[] = [];

  afterAll(async () => {
    for (const id of users) {
      await deleteTestUser(id).catch(() => {});
    }
    await sql.end();
  });

  it('automatically provisions a profile and wallet for a new user', async () => {
    const user = await createTestUser();
    users.push(user.id);

    const [profile] = await sql`select * from profiles where id = ${user.id}`;
    
    expect(profile).toBeDefined();
    expect(profile.role).toBe('reader');
    expect(profile.pen_name).toBeNull();
    expect(profile.deleted_at).toBeNull();

    const [wallet] = await sql`select * from wallets where id = ${user.id}`;
    
    expect(wallet).toBeDefined();
    expect(Number(wallet.balance)).toBe(0);
  });
});
