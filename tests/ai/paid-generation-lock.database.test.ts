import { afterAll, describe, expect, it } from 'vitest';
import { createTestUser, deleteTestUser, pgPool, anonClient, adminClient } from '../helpers/db';

// BUG-06 (Phase 8): independent connections against committed state, so the lease really races.
describe.skipIf(!process.env.SUPABASE_DB_URL)('ai_generation_locks lease RPCs', () => {
  const sql = pgPool(6);
  const users: string[] = [];

  afterAll(async () => {
    await sql.end();
    for (const id of users) await deleteTestUser(id).catch(() => {});
  });

  async function wallet() {
    const user = await createTestUser();
    users.push(user.id);
    await sql`insert into wallets (id, balance) values (${user.id}, 100) on conflict (id) do nothing`;
    return user.id;
  }

  const acquire = (walletId: string, token: string, ttl = 60) =>
    sql`select acquire_ai_generation_lock(${walletId}::uuid, ${token}::uuid, ${ttl}::int) as ok`.then((r) => r[0].ok as boolean);
  const release = (walletId: string, token: string) =>
    sql`select release_ai_generation_lock(${walletId}::uuid, ${token}::uuid) as ok`.then((r) => r[0].ok as boolean);

  it('lets exactly one of many concurrent acquirers hold the lease', async () => {
    const id = await wallet();
    const results = await Promise.all(Array.from({ length: 5 }, () => acquire(id, crypto.randomUUID())));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('does not block other wallets', async () => {
    const a = await wallet();
    const b = await wallet();
    expect(await Promise.all([acquire(a, crypto.randomUUID()), acquire(b, crypto.randomUUID())])).toEqual([true, true]);
  });

  it('frees the wallet after release and ignores a wrong token', async () => {
    const id = await wallet();
    const owner = crypto.randomUUID();
    expect(await acquire(id, owner)).toBe(true);
    expect(await release(id, crypto.randomUUID())).toBe(false);
    expect(await acquire(id, crypto.randomUUID())).toBe(false);
    expect(await release(id, owner)).toBe(true);
    expect(await acquire(id, crypto.randomUUID())).toBe(true);
  });

  it('takes over an expired lease and the old owner cannot release the new one', async () => {
    const id = await wallet();
    const oldOwner = crypto.randomUUID();
    const newOwner = crypto.randomUUID();
    expect(await acquire(id, oldOwner)).toBe(true);
    await sql`update ai_generation_locks set expires_at = now() - interval '1 second' where wallet_id = ${id}`;
    expect(await acquire(id, newOwner)).toBe(true);
    expect(await release(id, oldOwner)).toBe(false);
    expect(await acquire(id, crypto.randomUUID())).toBe(false);
    expect(await release(id, newOwner)).toBe(true);
  });

  it('rejects invalid arguments', async () => {
    const id = await wallet();
    await expect(acquire(id, crypto.randomUUID(), 0)).rejects.toThrow(/invalid_lock_arguments/);
  });

  it('is not callable by anon or authenticated roles', async () => {
    const id = await wallet();
    for (const role of ['anon', 'authenticated']) {
      await expect(sql.begin(async (tx) => {
        await tx.unsafe(`set local role ${role}`);
        await tx`select acquire_ai_generation_lock(${id}::uuid, ${crypto.randomUUID()}::uuid, 60)`;
      })).rejects.toThrow(/permission denied/);
    }
    // Through the public API as well.
    const { error } = await anonClient().rpc('acquire_ai_generation_lock', {
      p_wallet_id: id, p_owner_token: crypto.randomUUID(), p_ttl_seconds: 60,
    });
    expect(error).not.toBeNull();
  });

  it('is callable by the service role through the API', async () => {
    const id = await wallet();
    const token = crypto.randomUUID();
    const admin = adminClient();
    const { data, error } = await admin.rpc('acquire_ai_generation_lock', { p_wallet_id: id, p_owner_token: token, p_ttl_seconds: 60 });
    expect(error).toBeNull();
    expect(data).toBe(true);
    const { data: released } = await admin.rpc('release_ai_generation_lock', { p_wallet_id: id, p_owner_token: token });
    expect(released).toBe(true);
  });
});
