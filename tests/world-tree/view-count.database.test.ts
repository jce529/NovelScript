import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * 18-04 view-count DB suite (WTREE-08 author self-view exclusion). Real PostgreSQL, isolated
 * schema, one connection, outer rollback. Opt-in: runs only with SUPABASE_DB_URL under
 * `--project db`; the live run belongs to 18-12. Not executed by 18-04.
 *
 * 0036 is applied AFTER a pre-existing view_count is seeded, so the suite proves the migration
 * keeps historical counts (no reset / estimated subtraction) and reports its cutoff.
 * Not claimed: an anonymous (signed-out) author open cannot be identified and still counts.
 */
const BEFORE = ['0001_init.sql', '0002_studio.sql', '0003_reader.sql', '0004_kb_custom_folders.sql',
  '0005_commerce.sql', '0006_admin_foundation.sql', '0007_admin_operations.sql',
  '0008_sanction_enforcement.sql', '0009_blind_access.sql', '0012_template_category_folders.sql',
  '0022_template_readonly_backfill.sql', '0023_template_policy_guards.sql',
  '0032_world_tree_schema.sql', '0033_world_tree_eligibility.sql', '0034_world_tree_branching.sql',
  '0035_world_tree_timeline.sql'];
const UNDER_TEST = '0036_world_tree_reader_visibility.sql';

function migrationSql(file: string, schema: string): string {
  return readFileSync(`supabase/migrations/${file}`, 'utf8')
    .replace('create extension if not exists "pgcrypto";', '')
    .replaceAll('auth.users', `${schema}.test_users`)
    .replaceAll('search_path = public', `search_path = ${schema}, public`)
    .replaceAll('public.world_tree_eligibility_body', `${schema}.world_tree_eligibility_body`)
    .replace(/^begin;|^commit;/gm, '');
}

const author = '15000000-0000-4000-8000-000000000001';
const otherWriter = '15000000-0000-4000-8000-000000000002';
const reader = '15000000-0000-4000-8000-000000000003';
const admin = '15000000-0000-4000-8000-000000000004';
const legacyWork = '25000000-0000-4000-8000-000000000001';
const legacyChapter = '35000000-0000-4000-8000-000000000001';
const root = '25000000-0000-4000-8000-000000000002';
const child = '25000000-0000-4000-8000-000000000003';
const draft = '25000000-0000-4000-8000-000000000004';

type Role = 'anon' | 'authenticated';

describe.skipIf(!process.env.SUPABASE_DB_URL)('world-tree author self-view exclusion (PostgreSQL)', () => {
  const sql = postgres(process.env.SUPABASE_DB_URL!, { max: 1, prepare: false });
  const schema = `wtree_views_${crypto.randomUUID().replaceAll('-', '')}`;
  const exec = (text: string, params: unknown[] = []) => sql.unsafe(text, params as postgres.ParameterOrJSON<never>[]);

  async function scalar<T>(text: string, params: unknown[] = []): Promise<T> {
    const rows = await exec(text, params);
    return Object.values(rows[0] as object)[0] as T;
  }
  async function as(id: string, role: Role = 'authenticated') {
    await exec('reset role');
    await exec("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    await exec(`set role ${role}`);
  }
  async function asOwner() {
    await exec('reset role');
    await exec("select set_config('request.jwt.claim.sub', '', false)");
  }
  async function open(chapterId: string, sub = '', role: Role = 'anon') {
    await as(sub, role);
    await exec('select increment_chapter_view($1)', [chapterId]);
    await asOwner();
  }
  async function views(chapterId: string) {
    return scalar<number>('select view_count from chapters where id = $1', [chapterId]);
  }
  async function chapter(workId: string, published = true) {
    return scalar<string>(`insert into chapters(work_id, title, content, order_index, is_published)
      values ($1, '1화', '', 1, $2) returning id`, [workId, published]);
  }
  /** Real audited sanction path (same as tests/admin/blueprint-queries.database.test.ts). */
  async function suspend(userId: string) {
    await asOwner();
    const action = await scalar<string>(`insert into admin_actions(actor_id, action_type, target_user_id, reason, public_reason)
      values ($1, 'user_suspend', $2, 'internal', 'public') returning id`, [admin, userId]);
    await exec("select apply_user_sanction($1, $2, 'suspension', 'public', 'internal note', now() + interval '1 day', $3)",
      [admin, userId, action]);
  }

  beforeAll(async () => {
    await exec('begin');
    await exec(`
      create schema ${schema};
      set search_path = ${schema}, public;
      create table ${schema}.test_users(id uuid primary key);
      grant usage on schema ${schema} to anon, authenticated, service_role;
      alter default privileges in schema ${schema} grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema ${schema} grant all on sequences to anon, authenticated, service_role;
      alter default privileges in schema ${schema} grant execute on functions to anon, authenticated, service_role;
    `);
    for (const file of BEFORE) await exec(migrationSql(file, schema));
    // Pre-0036 history: a count that mixes author and reader opens.
    await exec('insert into test_users(id) values ($1),($2),($3),($4)', [author, otherWriter, reader, admin]);
    await exec("update profiles set role = 'writer', pen_name = 'W' || right(id::text, 4) where id in ($1, $2, $3)",
      [author, otherWriter, admin]);
    await exec("insert into admin_users(user_id, granted_by_label, grant_reason) values ($1, 'test', 'test admin')", [admin]);
    await exec("insert into works(id, owner_id, title) values ($1, $2, 'Legacy')", [legacyWork, author]);
    await exec(`insert into chapters(id, work_id, title, content, order_index, is_published, view_count)
      values ($1, $2, '1화', '', 1, true, 7)`, [legacyChapter, legacyWork]);
    await exec(migrationSql(UNDER_TEST, schema));
  });
  afterAll(async () => {
    try { await exec('rollback'); } finally { await sql.end(); }
  });
  beforeEach(async () => {
    await exec('savepoint fixture');
    await asOwner();
    await exec(`insert into works(id, owner_id, title) values ($1, $4, 'Root'), ($2, $4, 'Child'), ($3, $4, 'Draft')`,
      [root, child, draft, author]);
    await exec('update works set is_branch_draft = true where id = $1', [draft]);
    const trunk = await scalar<string>(`insert into world_branches(root_work_id, work_id, owner_id, kind, status, confirmed_at)
      values ($1, $1, $2, 'trunk', 'confirmed', now()) returning id`, [root, author]);
    await exec(`insert into world_branches(root_work_id, work_id, owner_id, parent_branch_id, kind, status, confirmed_at)
      values ($1, $2, $3, $4, 'if', 'confirmed', now())`, [root, child, author, trunk]);
  });
  afterEach(async () => { await exec('rollback to savepoint fixture; reset role'); });

  it('keeps historical counts untouched and reports the cutoff in the metric baseline', async () => {
    expect(await views(legacyChapter)).toBe(7);
    await as('', 'anon');
    const baseline = await scalar<{ maxTotalViews: number; authorViewsExcludedSince: string }>('select get_world_tree_metric_baseline()');
    await asOwner();
    expect(baseline.maxTotalViews).toBeGreaterThanOrEqual(7);
    const cutoff = Date.parse(baseline.authorViewsExcludedSince);
    expect(Number.isNaN(cutoff)).toBe(false);
    // The cutoff is fixed: a second apply of the guarded block does not move it.
    await exec(migrationSql(UNDER_TEST, schema));
    await as('', 'anon');
    const again = await scalar<{ authorViewsExcludedSince: string }>('select get_world_tree_metric_baseline()');
    await asOwner();
    expect(again.authorViewsExcludedSince).toBe(baseline.authorViewsExcludedSince);
    expect(await views(legacyChapter)).toBe(7);
  });

  it('counts anon and other signed-in readers, skips the signed-in owner on the direct RPC', async () => {
    await open(legacyChapter);
    await open(legacyChapter, reader);
    await open(legacyChapter, otherWriter);
    expect(await views(legacyChapter)).toBe(10);
    await open(legacyChapter, author);
    expect(await views(legacyChapter)).toBe(10);
    // An admin who is not the owner is a normal reader here.
    await open(legacyChapter, admin);
    expect(await views(legacyChapter)).toBe(11);
  });

  it('keeps the suspended-session skip', async () => {
    await suspend(reader);
    await open(legacyChapter, reader);
    expect(await views(legacyChapter)).toBe(7);
  });

  it('does not let a client-supplied user id decide ownership', async () => {
    await as(reader);
    const message = await exec('savepoint s').then(() =>
      exec('select increment_chapter_view($1, $2)', [legacyChapter, author]).then(() => 'ok', (e: { message: string }) => e.message));
    await exec('rollback to savepoint s');
    await asOwner();
    expect(message).toContain('does not exist');
    expect(await views(legacyChapter)).toBe(7);
  });

  it('counts a published child of an unpublished parent, never a draft, unpublished or blinded chapter', async () => {
    const childChapter = await chapter(child);
    await chapter(root, false);
    await open(childChapter);
    expect(await views(childChapter)).toBe(1);

    const draftChapter = await chapter(draft);
    const hidden = await chapter(root, false);
    await open(draftChapter);
    await open(hidden);
    expect(await views(draftChapter)).toBe(0);
    expect(await views(hidden)).toBe(0);

    await exec("select moderation_set_blind($1, $2, '사유')", [child, childChapter]);
    await open(childChapter);
    expect(await views(childChapter)).toBe(1);
  });
});
