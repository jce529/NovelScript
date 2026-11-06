import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * 18 BUG-02 (0050): the public read policies of 0036 call a nested SECURITY DEFINER helper per row,
 * which made the anonymous home feed exceed the statement timeout at a few hundred published works.
 * 0050 flattens the helper into one query, gives chapters a one-lookup helper and adds a partial
 * index. This suite pins the behavior: the new predicates answer exactly like the 0036 definition for
 * every combination, the policy bodies stay flat, and the index exists. Real PostgreSQL, isolated
 * schema, outer rollback. Opt-in: runs only with SUPABASE_DB_URL under `--project db`.
 */
const MIGRATIONS = ['0001_init.sql', '0002_studio.sql', '0003_reader.sql', '0004_kb_custom_folders.sql',
  '0005_commerce.sql', '0006_admin_foundation.sql', '0007_admin_operations.sql',
  '0008_sanction_enforcement.sql', '0009_blind_access.sql', '0012_template_category_folders.sql',
  '0022_template_readonly_backfill.sql', '0023_template_policy_guards.sql',
  '0032_world_tree_schema.sql', '0033_world_tree_eligibility.sql', '0034_world_tree_branching.sql',
  '0035_world_tree_timeline.sql', '0036_world_tree_reader_visibility.sql',
  '0050_feed_public_read_cost.sql'];

function migrationSql(file: string, schema: string): string {
  return readFileSync(`supabase/migrations/${file}`, 'utf8')
    .replace('create extension if not exists "pgcrypto";', '')
    .replaceAll('auth.users', `${schema}.test_users`)
    .replaceAll('search_path = public', `search_path = ${schema}, public`)
    .replaceAll('public.world_tree_eligibility_body', `${schema}.world_tree_eligibility_body`)
    .replace(/^begin;|^commit;/gm, '');
}

const owner = '15000000-0000-4000-8000-000000000001';
type Role = 'anon' | 'authenticated';

describe.skipIf(!process.env.SUPABASE_DB_URL)('BUG-02 public read cost (PostgreSQL)', () => {
  const sql = postgres(process.env.SUPABASE_DB_URL!, { max: 1, prepare: false });
  const schema = `bug02_${crypto.randomUUID().replaceAll('-', '')}`;
  const exec = (text: string, params: unknown[] = []) => sql.unsafe(text, params as postgres.ParameterOrJSON<never>[]);
  async function scalar<T>(text: string, params: unknown[] = []): Promise<T> {
    const rows = await exec(text, params);
    return Object.values(rows[0] as object)[0] as T;
  }
  async function as(role: Role | 'owner') {
    await exec('reset role');
    await exec("select set_config('request.jwt.claim.sub', '', false)");
    if (role !== 'owner') await exec(`set role ${role}`);
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
    for (const file of MIGRATIONS) await exec(migrationSql(file, schema));
    await exec('insert into test_users(id) values ($1)', [owner]);
    await exec("update profiles set role = 'writer', pen_name = 'bug02' where id = $1", [owner]);
  });
  afterAll(async () => {
    try { await exec('rollback'); } finally { await sql.end(); }
  });

  // chapter state: none | draft (unpublished) | published | published-deleted
  const CHAPTER_STATES = ['none', 'draft', 'published', 'published-deleted'] as const;
  type Combo = { deleted: boolean; branchDraft: boolean; blinded: boolean; chapter: (typeof CHAPTER_STATES)[number] };
  const combos: Combo[] = [];
  for (const deleted of [false, true]) for (const branchDraft of [false, true]) for (const blinded of [false, true])
    for (const chapter of CHAPTER_STATES) combos.push({ deleted, branchDraft, blinded, chapter });

  /** The 0036 definition, spelled out: reader-visible OR the blinded-notice case. */
  function legacyMetaVisible(c: Combo): boolean {
    const hasPublished = c.chapter === 'published';
    const readerVisible = !c.deleted && !c.branchDraft && !c.blinded && hasPublished;
    const blindedNotice = c.blinded && !c.deleted && !c.branchDraft && hasPublished;
    return readerVisible || blindedNotice;
  }

  async function insertWork(c: Combo, i: number): Promise<string> {
    await as('owner');
    const id = `35000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    await exec('insert into works(id, owner_id, title) values ($1, $2, $3)', [id, owner, `work-${i}`]);
    if (c.branchDraft) await exec('update works set is_branch_draft = true where id = $1', [id]);
    if (c.blinded) await exec('update works set admin_blinded = true where id = $1', [id]);
    if (c.chapter !== 'none') {
      await exec('insert into chapters(work_id, title, content, order_index, is_published) values ($1, $2, $3, 1, $4)',
        [id, 'C1', 'body', c.chapter !== 'draft']);
      if (c.chapter === 'published-deleted') await exec('update chapters set deleted_at = now() where work_id = $1', [id]);
    }
    if (c.deleted) await exec('update works set deleted_at = now() where id = $1', [id]);
    return id;
  }

  it('world_work_public_meta_visible answers exactly like the 0036 definition for every combination', async () => {
    const mismatches: string[] = [];
    for (const [i, c] of combos.entries()) {
      const id = await insertWork(c, i + 1);
      const got = await scalar<boolean>('select world_work_public_meta_visible($1)', [id]);
      if (got !== legacyMetaVisible(c)) mismatches.push(`${JSON.stringify(c)} => ${got}`);
    }
    expect(mismatches).toEqual([]);
  });

  it('works_public_read exposes the same works to anon as the 0036 predicate', async () => {
    const ids = new Map<string, Combo>();
    for (const [i, c] of combos.entries()) ids.set(await insertWork(c, 100 + i), c);
    await as('anon');
    const rows = await exec('select id from works where id = any($1::uuid[])', [[...ids.keys()]]) as unknown as { id: string }[];
    await as('owner');
    const seen = new Set(rows.map((r) => r.id));
    const wrong = [...ids].filter(([id, c]) => seen.has(id) !== legacyMetaVisible(c)).map(([, c]) => JSON.stringify(c));
    expect(wrong).toEqual([]);
  });

  it('chapters_public_read shows a published chapter exactly when its work is not deleted and not a branch draft', async () => {
    const wanted = new Map<string, boolean>();
    for (const [i, c] of combos.entries()) {
      if (c.chapter !== 'published') continue;
      wanted.set(await insertWork(c, 200 + i), !c.deleted && !c.branchDraft);
    }
    await as('anon');
    const rows = await exec('select work_id from chapters where work_id = any($1::uuid[])', [[...wanted.keys()]]) as unknown as { work_id: string }[];
    await as('owner');
    const seen = new Set(rows.map((r) => r.work_id));
    const wrong = [...wanted].filter(([id, visible]) => seen.has(id) !== visible).map(([id]) => id);
    expect(wrong).toEqual([]);
  });

  it('keeps the policy bodies flat: no nested helper call and a one-lookup chapters helper', async () => {
    const meta = await scalar<string>("select pg_get_functiondef('world_work_public_meta_visible(uuid)'::regprocedure)");
    expect(meta).not.toContain('world_work_reader_visible');
    expect(meta).not.toContain('world_work_public_meta_visible(p_work_id');
    const chaptersPolicy = await scalar<string>(`select qual from pg_policies where tablename = 'chapters' and policyname = 'chapters_public_read' and schemaname = $1`, [schema]);
    expect(chaptersPolicy).toContain('world_work_base_visible');
    expect(chaptersPolicy).not.toContain('world_work_public_meta_visible');
    const base = await scalar<string>("select pg_get_functiondef('world_work_base_visible(uuid)'::regprocedure)");
    expect(base).not.toContain('chapters');
  });

  it('adds the partial index for the published-chapter lookup', async () => {
    const def = await scalar<string>(`select indexdef from pg_indexes where schemaname = $1 and indexname = 'chapters_work_published_idx'`, [schema]);
    expect(def).toContain('(work_id)');
    expect(def).toMatch(/is_published/);
    expect(def).toMatch(/deleted_at IS NULL/);
  });

  it('lets anon and authenticated execute the helpers that the policies call', async () => {
    for (const role of ['anon', 'authenticated'] as const) {
      await as(role);
      const visible = await scalar<boolean>('select world_work_base_visible($1)', ['00000000-0000-0000-0000-000000000000']);
      expect(visible).toBe(false);
    }
    await as('owner');
  });
});
