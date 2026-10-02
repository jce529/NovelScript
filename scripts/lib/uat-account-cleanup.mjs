// Phase 9 BUG-01: guarded cleanup of disposable UAT accounts that cannot be deleted through the
// Auth API because ledger_entries / reports reference them without ON DELETE CASCADE.
// Only exact (id, email) pairs given on the command line are ever touched; anything referencing
// them that this tool does not know how to clean makes it stop instead of guessing.

export const TEST_EMAIL_SUFFIX = '@novelscript.test';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Child rows this tool deletes itself, FK-children first. Everything else must have 0 rows. */
const OWNED_CHILDREN = [
  { table: 'ledger_entries', column: 'wallet_id' },
  { table: 'reports', column: 'reporter_id' },
];

/** Pure CLI parsing/validation. Returns { ok, errors, options }. */
export function parseCleanupArgs(argv) {
  const get = (name) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const list = (name) => (get(name) ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const options = {
    ids: list('ids'),
    emails: list('emails').map((e) => e.toLowerCase()),
    expectCount: get('expect-count') === undefined ? null : Number(get('expect-count')),
    expectDb: get('expect-db') ?? null,
    execute: argv.includes('--execute'),
  };
  const errors = [];
  if (!options.ids.length) errors.push('ids_required');
  if (options.ids.some((id) => !UUID.test(id))) errors.push('invalid_uuid');
  if (options.emails.length !== options.ids.length) errors.push('ids_emails_mismatch');
  if (options.emails.some((e) => !e.endsWith(TEST_EMAIL_SUFFIX))) errors.push('non_test_email');
  if (options.expectCount === null || !Number.isInteger(options.expectCount)) errors.push('expect_count_required');
  else if (options.expectCount !== options.ids.length) errors.push('expect_count_mismatch');
  if (options.execute && !options.expectDb) errors.push('expect_db_required_for_execute');
  return { ok: errors.length === 0, errors, options };
}

/** Pure: the connected host must contain the operator-supplied marker before anything is deleted. */
export function hostMatches(host, expectDb) {
  return Boolean(expectDb) && host.includes(expectDb);
}

function quoteIdent(name) {
  return `"${String(name).replaceAll('"', '""')}"`;
}

/** Looks up the accounts and counts every FK reference to them (catalog-driven, nothing assumed). */
export async function planUatCleanup(sql, { ids, emails }) {
  const users = await sql`select id, lower(email) as email from auth.users where id = any(${ids}::uuid[])`;
  const fks = await sql`
    select c.conrelid::regclass::text as tbl, a.attname as col, c.confdeltype as del
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.contype = 'f' and c.confrelid in ('public.profiles'::regclass, 'public.wallets'::regclass)`;
  const references = [];
  for (const fk of fks) {
    const rows = await sql.unsafe(`select count(*)::int as n from ${fk.tbl} where ${quoteIdent(fk.col)} = any($1::uuid[])`, [ids]);
    if (rows[0].n > 0) {
      references.push({
        table: fk.tbl.replaceAll('"', '').replace(/^public\./, ''),
        column: fk.col,
        count: rows[0].n,
        cascades: fk.del === 'c',
      });
    }
  }
  return { ids, emails, users, references };
}

/** Pure: reasons the cleanup must not run (empty = safe). */
export function uatBlockers(plan, { expectCount }) {
  const blockers = [];
  if (plan.users.length !== expectCount) blockers.push(`found_${plan.users.length}_expected_${expectCount}`);
  const found = new Map(plan.users.map((u) => [u.id.toLowerCase(), u.email]));
  plan.ids.forEach((id, i) => {
    const email = found.get(id.toLowerCase());
    if (email !== undefined && email !== plan.emails[i]) blockers.push(`email_mismatch:${id}`);
  });
  if (plan.users.some((u) => !String(u.email ?? '').endsWith(TEST_EMAIL_SUFFIX))) blockers.push('non_test_account');
  const owned = new Set(OWNED_CHILDREN.map((c) => `${c.table}.${c.column}`));
  for (const ref of plan.references) {
    if (ref.cascades || owned.has(`${ref.table}.${ref.column}`)) continue;
    blockers.push(`unhandled_reference:${ref.table}.${ref.column}(${ref.count})`);
  }
  return blockers;
}

/**
 * Deletes owned child rows in one DB transaction, then the Auth users (which cascades the profile
 * and wallet). Throws on any Auth error; returns per-account results so the same list can be retried.
 */
export async function deleteUatAccounts(sql, authAdmin, plan, { expectCount }) {
  const blockers = uatBlockers(plan, { expectCount });
  if (blockers.length) throw new Error(`cleanup_refused:${blockers.join(',')}`);
  await sql.begin(async (tx) => {
    for (const { table, column } of OWNED_CHILDREN) {
      await tx.unsafe(`delete from ${quoteIdent(table)} where ${quoteIdent(column)} = any($1::uuid[])`, [plan.ids]);
    }
  });
  const results = [];
  for (const user of plan.users) {
    const { error } = await authAdmin.auth.admin.deleteUser(user.id, false);
    results.push({ id: user.id, email: user.email, deleted: !error, error: error ? error.message : null });
  }
  const failed = results.filter((r) => !r.deleted);
  if (failed.length) throw Object.assign(new Error(`auth_delete_failed:${failed.map((f) => f.id).join(',')}`), { results });
  const left = await sql`select count(*)::int as n from auth.users where id = any(${plan.ids}::uuid[])`;
  if (left[0].n) throw Object.assign(new Error(`accounts_remaining:${left[0].n}`), { results });
  return results;
}
