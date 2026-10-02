import { afterAll, describe, expect, it } from 'vitest';
import { adminClient, createTestUser, deleteTestUser, deleteTestUserStrict, pgPool } from '../helpers/db';
import { submitReport } from '../../lib/reader/reports';
import { deleteFixtures, planCleanup } from '../../scripts/lib/report-fixture-cleanup.mjs';
import { deleteUatAccounts, planUatCleanup, uatBlockers } from '../../scripts/lib/uat-account-cleanup.mjs';

// Phase 9 BUG-01 against the real schema: accounts with ledger/report rows cannot be deleted
// through the Auth API; the cleanup removes only what it owns and leaves everyone else alone.
describe.skipIf(!process.env.SUPABASE_DB_URL)('UAT account cleanup (database)', () => {
  const admin = adminClient();
  const writer = pgPool(1);
  const reader = pgPool(1);
  const leftovers: string[] = [];

  afterAll(async () => {
    await writer.end();
    await reader.end();
    for (const id of leftovers) await deleteTestUser(id);
  });

  async function accountWithLedger() {
    const user = await createTestUser();
    leftovers.push(user.id);
    const { error } = await admin.rpc('apply_wallet_delta', {
      p_wallet_id: user.id, p_delta: 5, p_reference_type: 'uat_cleanup_test', p_reference_id: crypto.randomUUID(), p_reason: 'fixture',
    });
    if (error) throw error;
    return user;
  }

  const target = (u: { id: string; email?: string }) => ({ ids: [u.id], emails: [u.email!.toLowerCase()] });
  const accountCount = async (id: string) =>
    (await reader`select count(*)::int as n from auth.users where id = ${id}`)[0].n as number;

  it('reproduces the stuck account, then removes it with its ledger rows', async () => {
    const user = await accountWithLedger();
    await expect(deleteTestUserStrict(user.id)).rejects.toBeTruthy();
    expect(await accountCount(user.id)).toBe(1);

    const plan = await planUatCleanup(writer, target(user));
    expect(uatBlockers(plan, { expectCount: 1 })).toEqual([]);
    expect(plan.references).toContainEqual(expect.objectContaining({ table: 'ledger_entries', column: 'wallet_id' }));
    await deleteUatAccounts(writer, admin, plan, { expectCount: 1 });

    expect(await accountCount(user.id)).toBe(0);
    expect((await reader`select count(*)::int as n from ledger_entries where wallet_id = ${user.id}`)[0].n).toBe(0);
    expect((await reader`select count(*)::int as n from wallets where id = ${user.id}`)[0].n).toBe(0);
  });

  it('removes a reporter whose report rows block the Auth deletion, and keeps other accounts', async () => {
    const owner = await createTestUser();
    const reporter = await createTestUser();
    const bystander = await accountWithLedger();
    leftovers.push(owner.id, reporter.id);
    const { data: workId, error } = await admin.rpc('create_work', {
      p_owner_id: owner.id, p_title: 'uat cleanup', p_synopsis: null, p_cover_image_url: null, p_genre: null,
    });
    if (error) throw error;
    const report = await submitReport(admin, { reporterId: reporter.id, workId: workId as string, chapterId: null, reasonCategory: '스팸/광고' });
    expect(report.ok).toBe(true);

    const plan = await planUatCleanup(writer, target(reporter));
    expect(uatBlockers(plan, { expectCount: 1 })).toEqual([]);
    await deleteUatAccounts(writer, admin, plan, { expectCount: 1 });
    expect(await accountCount(reporter.id)).toBe(0);
    expect(await accountCount(bystander.id)).toBe(1);
    expect((await reader`select count(*)::int as n from ledger_entries where wallet_id = ${bystander.id}`)[0].n).toBe(1);

    // The report fixtures themselves are cleaned by the BUG-05 helper, then the owner goes.
    await deleteFixtures(writer, await planCleanup(writer, { reportIds: [], workIds: [workId as string], userIds: [owner.id] }));
    await deleteTestUserStrict(owner.id);
    const stuck = await planUatCleanup(writer, target(bystander));
    await deleteUatAccounts(writer, admin, stuck, { expectCount: 1 });
  });

  it('refuses to delete an account that still owns a work, without touching anything', async () => {
    const owner = await createTestUser();
    leftovers.push(owner.id);
    const { data: workId, error } = await admin.rpc('create_work', {
      p_owner_id: owner.id, p_title: 'owned work', p_synopsis: null, p_cover_image_url: null, p_genre: null,
    });
    if (error) throw error;

    const plan = await planUatCleanup(writer, target(owner));
    expect(uatBlockers(plan, { expectCount: 1 })).toContain('unhandled_reference:works.owner_id(1)');
    await expect(deleteUatAccounts(writer, admin, plan, { expectCount: 1 })).rejects.toThrow(/cleanup_refused/);
    expect(await accountCount(owner.id)).toBe(1);

    await deleteFixtures(writer, await planCleanup(writer, { reportIds: [], workIds: [workId as string], userIds: [owner.id] }));
    await deleteTestUserStrict(owner.id);
  });

  it('is idempotent: a second run on an already-removed account is blocked, not destructive', async () => {
    const user = await accountWithLedger();
    await deleteUatAccounts(writer, admin, await planUatCleanup(writer, target(user)), { expectCount: 1 });
    const again = await planUatCleanup(writer, target(user));
    expect(uatBlockers(again, { expectCount: 1 })).toContain('found_0_expected_1');
  });
});
