import { describe, it, expect, afterAll } from 'vitest';
import { pgPool, adminClient, createTestUser, deleteTestUser } from '../helpers/db';
import { softDeleteAccount, isAccountActive } from '../../lib/auth/account';

describe('softDeleteAccount', () => {
  const sql = pgPool();
  const admin = adminClient();
  let users: string[] = [];

  afterAll(async () => {
    for (const id of users) {
      await deleteTestUser(id).catch(() => {});
    }
    await sql.end();
  });

  it('sets deleted_at and nulls pen_name_bio, leaving wallet/ledger untouched', async () => {
    const user = await createTestUser();
    users.push(user.id);

    // Give the account a writer profile with a bio and a non-zero wallet balance
    // with a ledger entry, so we can prove neither is touched by deletion.
    await sql`update profiles set role = 'writer', pen_name = ${'삭제테스트'}, pen_name_bio = ${'삭제되면 안되는 소개글'} where id = ${user.id}`;
    await sql`select apply_wallet_delta(${user.id}::uuid, 30::bigint, 'test_grant', 'pre-delete', 'test')`;

    const result = await softDeleteAccount(admin, user.id);
    expect(result).toBeUndefined();

    const [profile] = await sql`select * from profiles where id = ${user.id}`;
    expect(profile.deleted_at).not.toBeNull();
    expect(profile.pen_name_bio).toBeNull();
    // Pen name itself is not part of the required soft-delete scope; deleted_at gates access.
    expect(profile.role).toBe('writer');

    const [wallet] = await sql`select balance from wallets where id = ${user.id}`;
    expect(Number(wallet.balance)).toBe(30);

    const ledger = await sql`select * from ledger_entries where wallet_id = ${user.id}`;
    expect(ledger.length).toBe(1);
    expect(Number(ledger[0].delta)).toBe(30);
  });

  it('is a no-op (does not throw, does not touch updated_at path twice) on an already-deleted account', async () => {
    const user = await createTestUser();
    users.push(user.id);

    await softDeleteAccount(admin, user.id);
    const [firstPass] = await sql`select deleted_at from profiles where id = ${user.id}`;

    await softDeleteAccount(admin, user.id);
    const [secondPass] = await sql`select deleted_at from profiles where id = ${user.id}`;

    expect(firstPass.deleted_at.getTime()).toBe(secondPass.deleted_at.getTime());
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
