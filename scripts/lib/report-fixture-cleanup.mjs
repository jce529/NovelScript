// BUG-05 (Phase 7): guarded cleanup of reader-report test fixtures. Shared by the vitest helper
// and scripts/cleanup-reader-report-fixtures.mjs. Only explicitly listed ids are ever touched.

export const TEST_EMAIL_SUFFIX = '@novelscript.test';

/**
 * Collects the rows tied to the listed ids so a dry-run can print exactly what would be deleted.
 * @param {import('postgres').Sql} sql
 * @param {{ reportIds?: string[], workIds?: string[], userIds?: string[] }} ids
 */
export async function planCleanup(sql, { reportIds = /** @type {string[]} */ ([]), workIds = /** @type {string[]} */ ([]), userIds = /** @type {string[]} */ ([]) }) {
  const reports = reportIds.length || workIds.length
    ? await sql`select id, work_id, reporter_id from reports where id = any(${reportIds}::uuid[]) or work_id = any(${workIds}::uuid[])`
    : [];
  const kbNodes = workIds.length ? await sql`select id from kb_nodes where work_id = any(${workIds}::uuid[])` : [];
  // Locked nodes (create_work's structure folders) cannot be hard-deleted: guard_kb_template_policy (0023) rejects it.
  const lockedNodes = workIds.length ? await sql`select id, work_id, name from kb_nodes where work_id = any(${workIds}::uuid[]) and is_locked` : [];
  // Confirmed non-trunk branches freeze their setting KB (0034 world_branch_confirmed_immutable).
  const confirmedBranches = workIds.length ? await sql`select id, work_id from world_branches where work_id = any(${workIds}::uuid[]) and kind <> 'trunk' and status = 'confirmed' and deleted_at is null` : [];
  const works = workIds.length ? await sql`select id, owner_id, title from works where id = any(${workIds}::uuid[])` : [];
  const users = userIds.length ? await sql`select id, email from auth.users where id = any(${userIds}::uuid[])` : [];
  const audit = workIds.length || userIds.length || reportIds.length
    ? await sql`select id from admin_actions where target_work_id = any(${workIds}::uuid[]) or target_user_id = any(${userIds}::uuid[]) or report_ids && ${reportIds}::uuid[]`
    : [];
  const sanctions = userIds.length ? await sql`select id from user_sanctions where user_id = any(${userIds}::uuid[])` : [];
  return { reportIds, workIds, userIds, reports, kbNodes, lockedNodes, confirmedBranches, works, users, audit, sanctions };
}

/** Returns the reasons deletion must be refused (empty = safe). */
export function deletionBlockers(plan) {
  const blockers = [];
  if (!plan.reportIds.length && !plan.workIds.length && !plan.userIds.length) blockers.push('no_ids_given');
  if (plan.audit.length) blockers.push('admin_audit_linked');
  if (plan.sanctions.length) blockers.push('sanction_history_linked');
  // Never worked around (no trigger disable / GUC bypass): the 0023/0034 invariants stay intact, so such works are refused up front.
  if (plan.lockedNodes?.length) blockers.push('locked_kb_nodes');
  if (plan.confirmedBranches?.length) blockers.push('confirmed_world_branch');
  if (plan.users.some((u) => !String(u.email ?? '').endsWith(TEST_EMAIL_SUFFIX))) blockers.push('non_test_account');
  const foundReportIds = new Set(plan.reports.map((r) => r.id));
  if (plan.reportIds.some((id) => !foundReportIds.has(id))) blockers.push('unknown_report_id');
  return blockers;
}

/** Deletes in FK order inside one transaction. Throws when anything is refused or left behind. */
export async function deleteFixtures(sql, plan) {
  const blockers = deletionBlockers(plan);
  if (blockers.length) throw new Error(`cleanup_refused:${blockers.join(',')}`);
  await sql.begin(async (tx) => {
    await tx`delete from reports where id = any(${plan.reportIds}::uuid[]) or work_id = any(${plan.workIds}::uuid[])`;
    if (plan.workIds.length) {
      await tx`delete from kb_nodes where work_id = any(${plan.workIds}::uuid[])`;
      await tx`delete from works where id = any(${plan.workIds}::uuid[])`;
    }
  });
  const left = await sql`
    select (select count(*) from reports where id = any(${plan.reportIds}::uuid[]) or work_id = any(${plan.workIds}::uuid[]))::int as reports,
           (select count(*) from works where id = any(${plan.workIds}::uuid[]))::int as works,
           (select count(*) from kb_nodes where work_id = any(${plan.workIds}::uuid[]))::int as kb`;
  if (left[0].reports || left[0].works || left[0].kb) throw new Error(`cleanup_incomplete:${JSON.stringify(left[0])}`);
}
