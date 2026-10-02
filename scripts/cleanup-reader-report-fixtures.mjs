// One-off cleanup of historical reader-report test fixtures (BUG-05).
// Dry-run by default; deletes only with --execute and only the ids passed explicitly.
//   node scripts/cleanup-reader-report-fixtures.mjs --reports a,b --works c --users d,e
//   node scripts/cleanup-reader-report-fixtures.mjs ... --execute --expect-db <host substring>
import postgres from 'postgres';
import { deleteFixtures, deletionBlockers, planCleanup } from './lib/report-fixture-cleanup.mjs';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const list = (name) => (flag(name) ?? '').split(',').map((s) => s.trim()).filter(Boolean);

if (args.includes('--help')) {
  console.log('usage: cleanup-reader-report-fixtures.mjs --reports ids --works ids --users ids [--execute --expect-db <host>]');
  process.exit(0);
}
const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('SUPABASE_DB_URL is not set');
  process.exit(2);
}
const host = new URL(url).host;
const execute = args.includes('--execute');
if (execute && !(flag('expect-db') && host.includes(flag('expect-db')))) {
  console.error(`refusing to delete: --expect-db must match the connected host (${host})`);
  process.exit(2);
}

const sql = postgres(url, { max: 1, prepare: false });
try {
  const plan = await planCleanup(sql, { reportIds: list('reports'), workIds: list('works'), userIds: list('users') });
  console.log(`database host: ${host}`);
  console.log(JSON.stringify({
    reports: plan.reports.length, kbNodes: plan.kbNodes.length, works: plan.works.length,
    users: plan.users.map((u) => u.email), auditLinked: plan.audit.length, sanctionsLinked: plan.sanctions.length,
  }, null, 2));
  const blockers = deletionBlockers(plan);
  if (blockers.length) {
    console.error(`blocked: ${blockers.join(', ')}`);
    process.exitCode = 1;
  } else if (!execute) {
    console.log('dry-run only. Re-run with --execute --expect-db <host> to delete the rows above.');
  } else {
    await deleteFixtures(sql, plan);
    console.log('deleted. Auth users must be removed separately (auth.admin.deleteUser).');
  }
} finally {
  await sql.end();
}
