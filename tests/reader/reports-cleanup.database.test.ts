import { afterAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { adminClient, createTestUser, deleteTestUser, pgPool } from '../helpers/db';
import { submitReport } from '../../lib/reader/reports';
import { deleteFixtures, deletionBlockers, planCleanup } from '../../scripts/lib/report-fixture-cleanup.mjs';

// BUG-05 (Phase 7): fixtures created through PostgREST/Auth are visible to an independent
// connection, and the cleanup leaves no reports, works or kb nodes behind.
describe.skipIf(!process.env.SUPABASE_DB_URL)('reader report fixture cleanup', () => {
  const admin = adminClient();
  const writer = pgPool(1);
  const reader = pgPool(1);
  const users: string[] = [];

  afterAll(async () => {
    await writer.end();
    await reader.end();
    for (const id of users) await deleteTestUser(id).catch(() => {});
  });

  async function fixture() {
    const owner = await createTestUser();
    const reporter = await createTestUser();
    users.push(owner.id, reporter.id);
    const { data: workId, error } = await admin.rpc('create_work', {
      p_owner_id: owner.id, p_title: 'cleanup fixture', p_synopsis: null, p_cover_image_url: null, p_genre: null,
    });
    if (error) throw error;
    const report = await submitReport(admin, { reporterId: reporter.id, workId: workId as string, chapterId: null, reasonCategory: '스팸/광고' });
    expect(report.ok).toBe(true);
    return { workId: workId as string, reportId: report.reportId!, owner, reporter };
  }

  const counts = (sql: postgres.Sql, ids: { workId: string; reportId: string }) => sql`
    select (select count(*) from reports where id = ${ids.reportId})::int as reports,
           (select count(*) from works where id = ${ids.workId})::int as works,
           (select count(*) from kb_nodes where work_id = ${ids.workId})::int as kb`;

  it('removes the report, work and kb nodes, visible from an independent connection', async () => {
    const f = await fixture();
    const before = (await counts(reader, f))[0];
    expect(before.reports).toBe(1);
    expect(before.works).toBe(1);
    expect(before.kb).toBeGreaterThan(0);

    await deleteFixtures(writer, await planCleanup(writer, { reportIds: [f.reportId], workIds: [f.workId], userIds: [f.owner.id, f.reporter.id] }));
    expect((await counts(reader, f))[0]).toEqual({ reports: 0, works: 0, kb: 0 });

    await deleteTestUser(f.owner.id);
    await deleteTestUser(f.reporter.id);
  });

  it('deleteTestUser surfaces the failure while a report still references the account', async () => {
    const f = await fixture();
    await expect(deleteTestUser(f.reporter.id)).rejects.toBeTruthy();
    await deleteFixtures(writer, await planCleanup(writer, { reportIds: [f.reportId], workIds: [f.workId], userIds: [f.owner.id, f.reporter.id] }));
  });

  it('does not touch another work or report', async () => {
    const a = await fixture();
    const b = await fixture();
    await deleteFixtures(writer, await planCleanup(writer, { reportIds: [a.reportId], workIds: [a.workId], userIds: [] }));
    expect((await counts(reader, b))[0]).toMatchObject({ reports: 1, works: 1 });
    await deleteFixtures(writer, await planCleanup(writer, { reportIds: [b.reportId], workIds: [b.workId], userIds: [] }));
  });
});

describe('deletionBlockers guard', () => {
  const empty = { reportIds: [] as string[], workIds: [] as string[], userIds: [] as string[], reports: [], kbNodes: [], works: [], users: [], audit: [], sanctions: [] };

  it('refuses a plan without explicit ids', () => {
    expect(deletionBlockers(empty)).toContain('no_ids_given');
  });

  it('refuses admin audit links, sanction history and non-test accounts', () => {
    const plan = { ...empty, reportIds: ['r'], reports: [{ id: 'r' }], audit: [{ id: 'a' }], sanctions: [{ id: 's' }], users: [{ id: 'u', email: 'real@example.com' }] };
    expect(deletionBlockers(plan)).toEqual(['admin_audit_linked', 'sanction_history_linked', 'non_test_account']);
  });

  it('refuses report ids that do not exist', () => {
    expect(deletionBlockers({ ...empty, reportIds: ['missing'] })).toContain('unknown_report_id');
  });

  it('accepts a clean plan of test accounts', () => {
    const plan = { ...empty, reportIds: ['r'], reports: [{ id: 'r' }], users: [{ id: 'u', email: 'x@novelscript.test' }] };
    expect(deletionBlockers(plan)).toEqual([]);
  });
});
