import { describe, it, expect, afterAll } from 'vitest';
import { pgPool, adminClient, createTestUser, deleteTestUser } from '../helpers/db';
import { softDeleteAccount, isAccountActive } from '../../lib/auth/account';

describe('softDeleteAccount', () => {
  const sql = pgPool();
  const admin = adminClient();
  const users: string[] = [];

  afterAll(async () => {
    for (const id of users) {
      await sql`delete from profiles where id = ${id}`.catch(() => {});
      await deleteTestUser(id).catch(() => {});
    }
    await sql.end();
  });

  it('clears personal info and BYOK keys, soft-deletes auth, leaving wallet/ledger untouched', async () => {
    const user = await createTestUser();
    users.push(user.id);

    await sql`update profiles set role = 'writer', pen_name = ${'삭제테스트'}, pen_name_bio = ${'삭제되어야 하는 소개글'} where id = ${user.id}`;
    await sql`select apply_wallet_delta(${user.id}::uuid, 30::bigint, 'test_grant', 'pre-delete', 'test')`;
    const registered = await admin.rpc('register_byok_key', { p_owner: user.id, p_provider: 'openai', p_plaintext: 'sk-test-delete-1234', p_hint: '1234', p_models: ['gpt-4o-mini'] });
    expect(registered.error).toBeNull();
    const [{ secret_id }] = await sql`select secret_id from byok_keys where owner_id = ${user.id}`;

    const result = await softDeleteAccount(admin, user.id);
    expect(result).toBeUndefined();

    const [profile] = await sql`select * from profiles where id = ${user.id}`;
    expect(profile.deleted_at).not.toBeNull();
    expect(profile.pen_name_bio).toBeNull();
    expect(profile.pen_name).toBeNull();
    expect(profile.role).toBe('writer');

    expect(await sql`select 1 from byok_keys where owner_id = ${user.id}`).toHaveLength(0);
    expect(await sql`select 1 from vault.secrets where id = ${secret_id}`).toHaveLength(0);

    const [wallet] = await sql`select balance from wallets where id = ${user.id}`;
    expect(Number(wallet.balance)).toBe(30);
    const ledger = await sql`select * from ledger_entries where wallet_id = ${user.id}`;
    expect(ledger.length).toBe(1);
    expect(Number(ledger[0].delta)).toBe(30);

    expect(await sql`select 1 from auth.identities where user_id = ${user.id}`).toHaveLength(0);
    const [authUser] = await sql`select email, deleted_at from auth.users where id = ${user.id}`;
    expect(authUser.deleted_at).not.toBeNull();
    expect(authUser.email).not.toBe(user.email);
  });

  it('lets the same email sign up again as a brand-new account (BUG-01)', async () => {
    const user = await createTestUser();
    users.push(user.id);
    await softDeleteAccount(admin, user.id);

    const again = await createTestUser(user.email!);
    users.push(again.id);
    expect(again.id).not.toBe(user.id);
    const [fresh] = await sql`select deleted_at, pen_name from profiles where id = ${again.id}`;
    expect(fresh.deleted_at).toBeNull();
    expect(fresh.pen_name).toBeNull();
    const [wallet] = await sql`select balance from wallets where id = ${again.id}`;
    expect(Number(wallet.balance)).toBe(0);
  });

  it('is idempotent: re-running on an already-deleted account does not throw or move deleted_at', async () => {
    const user = await createTestUser();
    users.push(user.id);

    await softDeleteAccount(admin, user.id);
    const [firstPass] = await sql`select deleted_at from profiles where id = ${user.id}`;

    await expect(softDeleteAccount(admin, user.id)).resolves.toBeUndefined();
    const [secondPass] = await sql`select deleted_at from profiles where id = ${user.id}`;

    expect(firstPass.deleted_at.getTime()).toBe(secondPass.deleted_at.getTime());
  });

  it('completes a legacy half-deleted account (deleted_at set, auth still live)', async () => {
    const user = await createTestUser();
    users.push(user.id);
    await sql`update profiles set deleted_at = now() where id = ${user.id}`;

    await softDeleteAccount(admin, user.id);

    expect(await sql`select 1 from auth.identities where user_id = ${user.id}`).toHaveLength(0);
    const [authUser] = await sql`select deleted_at from auth.users where id = ${user.id}`;
    expect(authUser.deleted_at).not.toBeNull();
  });

  it('throws when the profile does not exist so the caller can report the failure', async () => {
    await expect(softDeleteAccount(admin, crypto.randomUUID())).rejects.toBeTruthy();
  });
});

describe('isAccountActive', () => {
  it('returns true when deleted_at is null', () => {
    expect(isAccountActive({ deleted_at: null })).toBe(true);
  });

  it('returns false when deleted_at is a timestamp', () => {
    expect(isAccountActive({ deleted_at: new Date().toISOString() })).toBe(false);
  });
});
