import { describe, it, expect, afterAll } from 'vitest';
import { pgPool, createTestUser, deleteTestUser } from '../helpers/db';

describe('Wallet Ledger Concurrency', () => {
  const sql = pgPool(5);
  let users: string[] = [];

  afterAll(async () => {
    for (const id of users) {
      await deleteTestUser(id).catch(() => {});
    }
    await sql.end();
  });

  async function createWalletUser() {
    const user = await createTestUser();
    users.push(user.id);
    return user.id;
  }

  it('handles 100 concurrent positive deltas on one wallet without losing updates', async () => {
    const walletId = await createWalletUser();

    // 100 concurrent +10 calls
    const n = 100;
    const delta = 10;
    
    await Promise.all(
      Array.from({ length: n }).map((_, i) =>
        sql`select apply_wallet_delta(${walletId}::uuid, ${delta}::bigint, 'test_grant', ${'ref-' + i}, 'concurrency test')`
      )
    );

    const [wallet] = await sql`select balance from wallets where id = ${walletId}`;
    const [ledger] = await sql`select sum(delta) as total_delta from ledger_entries where wallet_id = ${walletId}`;

    expect(Number(wallet.balance)).toBe(n * delta);
    expect(Number(ledger.total_delta)).toBe(n * delta);
  });

  it('prevents a debit that would result in a negative balance', async () => {
    const walletId = await createWalletUser();

    // Give 50
    await sql`select apply_wallet_delta(${walletId}::uuid, 50::bigint, 'test_grant', 'init', 'test')`;

    // Try to debit 60
    await expect(
      sql`select apply_wallet_delta(${walletId}::uuid, -60::bigint, 'test_debit', 'too_large', 'test')`
    ).rejects.toThrow('insufficient balance');

    // Balance remains 50
    const [wallet] = await sql`select balance from wallets where id = ${walletId}`;
    expect(Number(wallet.balance)).toBe(50);
  });

  it('is idempotent for the same reference key', async () => {
    const walletId = await createWalletUser();

    // Apply +20 with a specific ref
    const res1 = await sql`select apply_wallet_delta(${walletId}::uuid, 20::bigint, 'test_grant', 'idem-1', 'first apply')`;
    expect(Number(res1[0].apply_wallet_delta)).toBe(20);

    // Apply +20 AGAIN with the SAME ref
    const res2 = await sql`select apply_wallet_delta(${walletId}::uuid, 20::bigint, 'test_grant', 'idem-1', 'second apply')`;
    expect(Number(res2[0].apply_wallet_delta)).toBe(20); // balance is still 20

    const [wallet] = await sql`select balance from wallets where id = ${walletId}`;
    expect(Number(wallet.balance)).toBe(20);

    // Only one ledger entry
    const ledger = await sql`select count(*) as count from ledger_entries where wallet_id = ${walletId}`;
    expect(Number(ledger[0].count)).toBe(1);
  });

  it('handles concurrent operations on multiple wallets accurately', async () => {
    const walletA = await createWalletUser();
    const walletB = await createWalletUser();

    const m = 30;
    const deltaA = 10;
    const deltaB = 5;

    const opsA = Array.from({ length: m }).map((_, i) =>
      sql`select apply_wallet_delta(${walletA}::uuid, ${deltaA}::bigint, 'test_grant', ${'ref-a-' + i}, 'test a')`
    );

    const opsB = Array.from({ length: m }).map((_, i) =>
      sql`select apply_wallet_delta(${walletB}::uuid, ${deltaB}::bigint, 'test_grant', ${'ref-b-' + i}, 'test b')`
    );

    // Interleave and execute concurrently
    const allOps = [...opsA, ...opsB].sort(() => Math.random() - 0.5);
    await Promise.all(allOps);

    const [finalA] = await sql`select balance from wallets where id = ${walletA}`;
    const [finalB] = await sql`select balance from wallets where id = ${walletB}`;

    expect(Number(finalA.balance)).toBe(m * deltaA);
    expect(Number(finalB.balance)).toBe(m * deltaB);
  });
});
