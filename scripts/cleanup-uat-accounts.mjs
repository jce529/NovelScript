// Removes disposable UAT accounts (Phase 9 BUG-01). Test projects only; dry-run by default.
//   node scripts/cleanup-uat-accounts.mjs --ids a,b --emails x@novelscript.test,y@novelscript.test --expect-count 2
//   ... --execute --expect-db <host substring>   (actually deletes)
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { deleteUatAccounts, hostMatches, parseCleanupArgs, planUatCleanup, uatBlockers } from './lib/uat-account-cleanup.mjs';

const argv = process.argv.slice(2);
if (argv.includes('--help')) {
  console.log('usage: cleanup-uat-accounts.mjs --ids uuid,.. --emails email,.. --expect-count N [--execute --expect-db <host>]');
  process.exit(0);
}
const parsed = parseCleanupArgs(argv);
if (!parsed.ok) {
  console.error(`invalid arguments: ${parsed.errors.join(', ')}`);
  process.exit(2);
}
const { options } = parsed;
const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('SUPABASE_DB_URL is not set');
  process.exit(2);
}
const host = new URL(url).host;
if (options.execute && !hostMatches(host, options.expectDb)) {
  console.error(`refusing to delete: --expect-db must match the connected host (${host})`);
  process.exit(2);
}

const sql = postgres(url, { max: 1, prepare: false });
try {
  const plan = await planUatCleanup(sql, options);
  const blockers = uatBlockers(plan, options);
  console.log(`database host: ${host}`);
  console.log(JSON.stringify({ accounts: plan.users, references: plan.references, blockers }, null, 2));
  if (blockers.length) {
    process.exitCode = 1;
  } else if (!options.execute) {
    console.log('dry-run only. Re-run with --execute --expect-db <host> after the list above is approved.');
  } else {
    const authAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const results = await deleteUatAccounts(sql, authAdmin, plan, options);
    console.log(JSON.stringify(results, null, 2));
  }
} finally {
  await sql.end();
}
