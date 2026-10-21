import postgres from 'postgres';
import { existsSync, readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { WORLD_TREE_ELIGIBILITY } from '@/lib/world-tree/eligibility';

/**
 * 18-02 branching DB suite (WTREE-03/04/05/10). Real PostgreSQL, isolated schema.
 * Opt-in: runs only with SUPABASE_DB_URL under `--project db`; the live run belongs to 18-12.
 *
 *  - "branching (PostgreSQL)" uses one connection and an outer rollback (nothing is committed).
 *  - "branching races (PostgreSQL)" needs two sessions, so its isolated schema must be committed.
 *    It additionally requires WTREE_BRANCH_RACE_SCHEMA_COMMIT=1 and drops the schema afterwards.
 *
 * Eligibility boundary values are NOT repeated here (18-14 eligibility.database owns them); this
 * suite only checks that begin / first confirm call the assert on the original parent and keep
 * its detail. Until 0035 exists, clone_world_branch_timeline is replaced by a no-op in the
 * isolated schema only (production 0034 fails closed with world_tree_timeline_not_ready).
 */
const MIGRATIONS = ['0001_init.sql', '0002_studio.sql', '0003_reader.sql', '0004_kb_custom_folders.sql',
  '0005_commerce.sql', '0006_admin_foundation.sql', '0007_admin_operations.sql',
  '0008_sanction_enforcement.sql', '0009_blind_access.sql', '0012_template_category_folders.sql',
  '0022_template_readonly_backfill.sql', '0023_template_policy_guards.sql',
  '0032_world_tree_schema.sql', '0033_world_tree_eligibility.sql', '0034_world_tree_branching.sql'];
const TIMELINE = 'supabase/migrations/0035_world_tree_timeline.sql';

const writer = '12000000-0000-4000-8000-000000000001';
const otherWriter = '12000000-0000-4000-8000-000000000002';
const reader = '12000000-0000-4000-8000-000000000003';
const suspended = '12000000-0000-4000-8000-000000000004';
const T = WORLD_TREE_ELIGIBILITY;

function migrationSql(file: string, schema: string): string {
  return readFileSync(`supabase/migrations/${file}`, 'utf8')
    .replace('create extension if not exists "pgcrypto";', '')
    .replaceAll('auth.users', `${schema}.test_users`)
    .replaceAll('search_path = public', `search_path = ${schema}, public`)
    .replaceAll('public.world_tree_eligibility_body', `${schema}.world_tree_eligibility_body`)
    .replace(/^begin;|^commit;/gm, '');
}

type Exec = (text: string, params?: unknown[]) => Promise<postgres.RowList<postgres.Row[]>>;

async function install(exec: Exec, schema: string) {
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
  if (existsSync(TIMELINE)) {
    await exec(migrationSql('0035_world_tree_timeline.sql', schema));
  } else {
    await exec(`create or replace function clone_world_branch_timeline(p_branch_id uuid, p_fork_era_id uuid) returns void
      language plpgsql security definer set search_path = ${schema}, public as $$ begin perform 1; end; $$;
      revoke all on function clone_world_branch_timeline(uuid, uuid) from public, anon, authenticated, service_role;`);
  }
}

/** Users, an eligible source work (create_work folders, chapters, docs) and a trunk era. */
async function seedWorld(exec: Exec): Promise<{ source: string; era: string; personRoot: string }> {
  await exec('reset role');
  await exec('insert into test_users(id) values ($1),($2),($3),($4)', [writer, otherWriter, reader, suspended]);
  await exec("update profiles set role = 'writer', pen_name = 'W' || right(id::text, 4) where id in ($1, $2, $3)",
    [writer, otherWriter, suspended]);
  await exec("select set_config('app.sanction_cache_writer', 'on', true)");
  await exec("update profiles set sanction_kind = 'suspension', sanctioned_until = now() + interval '1 day' where id = $1", [suspended]);
  await exec("select set_config('app.sanction_cache_writer', '', true)");

  const [{ id: source }] = await exec("select create_work($1, 'Root', null, null, null) as id", [writer]);
  await exec(`insert into chapters(work_id, title, content, order_index, is_published)
    select $1, 'C' || g, '', g, true from generate_series(1, $2::int) g`, [source, T.minPublishedChapters]);
  const m = T.categoryMinimums;
  const plan: Array<[string, number]> = [['인물', m.인물], ['장소', m.장소], ['사건', m.사건],
    ['세력', T.minSettingDocuments - m.인물 - m.장소 - m.사건]];
  for (const [category, count] of plan) {
    await exec(`insert into kb_nodes(owner_id, work_id, scope, parent_id, node_type, category, name, content)
      select $1, $2, 'work', r.id, 'file', $3, $3 || '-' || g, $5
        from kb_nodes r, generate_series(1, $4::int) g
       where r.work_id = $2 and r.parent_id is null and r.category = $3`,
    [writer, source, category, count, '가'.repeat(T.minDocumentBodyChars)]);
  }
  const [{ id: personRoot }] = await exec(
    "select id from kb_nodes where work_id = $1 and parent_id is null and category = '인물'", [source]);
  // Trunk + first era (0035 ensure_world_tree will own this; inserted directly for the suite).
  const [{ id: trunk }] = await exec(`insert into world_branches(root_work_id, work_id, owner_id, kind, status, confirmed_at, depth)
    values ($1, $1, $2, 'trunk', 'confirmed', now(), 0) returning id`, [source, writer]);
  const [{ id: era }] = await exec("insert into world_eras(branch_id, position, name) values ($1, 0, '1기') returning id", [trunk]);
  return { source: source as string, era: era as string, personRoot: personRoot as string };
}

describe.skipIf(!process.env.SUPABASE_DB_URL)('world-tree branching (PostgreSQL)', () => {
  const sql = postgres(process.env.SUPABASE_DB_URL!, { max: 1, prepare: false });
  const schema = `wtree_branch_${crypto.randomUUID().replaceAll('-', '')}`;
  const exec: Exec = (text, params = []) => sql.unsafe(text, params as postgres.ParameterOrJSON<never>[]);
  let world: { source: string; era: string; personRoot: string };

  async function as(id: string, role: 'authenticated' | 'anon' = 'authenticated') {
    await exec('reset role');
    await exec("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    await exec(`set role ${role}`);
  }
  async function asOwner() {
    await exec('reset role');
    await exec("select set_config('request.jwt.claim.sub', '', false)");
  }
  async function fails(action: () => Promise<unknown>): Promise<{ message: string; detail: unknown }> {
    await exec('savepoint expected_failure');
    try {
      await action();
    } catch (e) {
      await exec('rollback to savepoint expected_failure');
      const err = e as { message: string; detail?: string };
      let detail: unknown = null;
      try { detail = err.detail ? JSON.parse(err.detail) : null; } catch { detail = err.detail; }
      await asOwner();
      return { message: err.message, detail };
    }
    await exec('release savepoint expected_failure');
    throw new Error('expected failure');
  }
  async function begin(kind: 'if' | 'expand', requestId = crypto.randomUUID(), user = writer, source = world.source) {
    await as(user);
    const [row] = await exec('select begin_world_branch($1, $2, null, $3) as r', [source, kind, requestId]);
    await asOwner();
    return (row.r as { draft_work_id: string }).draft_work_id;
  }
  async function confirm(draft: string, title = 'Branch', era = world.era, user = writer) {
    await as(user);
    const [row] = await exec('select confirm_world_branch($1, $2, $3) as r', [draft, title, era]);
    await asOwner();
    return row.r as { work_id: string; branch_id: string };
  }
  async function diff(draft: string, user = writer) {
    await as(user);
    const [row] = await exec('select get_world_branch_diff($1) as r', [draft]);
    await asOwner();
    return row.r as { counts: { added: number; modified: number; deleted: number }; entries: Array<Record<string, unknown>> };
  }
  async function copiedDoc(draft: string) {
    const [row] = await exec(`select id, name, content from kb_nodes
      where work_id = $1 and node_type = 'file' and category = '인물' and inherited_from_node_id is not null
      order by name limit 1`, [draft]);
    return row as { id: string; name: string; content: string };
  }
  async function addDoc(workId: string, name = 'New person') {
    await as(writer);
    await exec(`insert into kb_nodes(owner_id, work_id, scope, parent_id, node_type, category, name, content)
      select $1, $2, 'work', r.id, 'file', '인물', $3, 'body'
        from kb_nodes r where r.work_id = $2 and r.parent_id is null and r.category = '인물'`, [writer, workId, name]);
    await asOwner();
  }

  beforeAll(async () => {
    await exec('begin');
    await install(exec, schema);
  });
  afterAll(async () => {
    try { await exec('rollback'); } finally { await sql.end(); }
  });
  beforeEach(async () => {
    await exec('savepoint fixture');
    world = await seedWorld(exec);
  });
  afterEach(async () => { await exec('rollback to savepoint fixture; reset role'); });

  describe('begin', () => {
    it('creates a hidden draft through create_work, seeds locked defaults and clones settings with a frozen baseline', async () => {
      const draft = await begin('if');
      const [w] = await exec('select is_branch_draft, title from works where id = $1', [draft]);
      expect(w).toMatchObject({ is_branch_draft: true, title: 'Root' });
      const [b] = await exec("select kind, status, depth from world_branches where work_id = $1", [draft]);
      expect(b).toMatchObject({ kind: 'if', status: 'draft', depth: 1 });
      const [seeds] = await exec("select count(*)::int as n from kb_nodes where work_id = $1 and node_type = 'file' and category = 'template' and is_locked", [draft]);
      expect(seeds.n).toBe(5);
      const [roots] = await exec('select count(*)::int as n from kb_nodes where work_id = $1 and parent_id is null and deleted_at is null', [draft]);
      expect(roots.n).toBe(7); // create_work roots, never duplicated by the clone
      const [copies] = await exec("select count(*)::int as n from kb_nodes where work_id = $1 and node_type = 'file' and inherited_from_node_id is not null", [draft]);
      expect(copies.n).toBe(T.minSettingDocuments);
      const [baseline] = await exec('select count(*)::int as n from world_branch_docs d join world_branches b on b.id = d.branch_id where b.work_id = $1 and d.baseline_content is not null', [draft]);
      expect(baseline.n).toBe(T.minSettingDocuments);
      const [chapters] = await exec('select count(*)::int as n from chapters where work_id = $1', [draft]);
      expect(chapters.n).toBe(0);
      expect((await diff(draft)).counts).toEqual({ added: 0, modified: 0, deleted: 0 });
    });

    it('returns the same draft for a retried request id and rejects a conflicting reuse', async () => {
      const request = crypto.randomUUID();
      const first = await begin('if', request);
      expect(await begin('if', request)).toBe(first);
      expect((await fails(() => begin('expand', request))).message).toContain('world_branch_request_conflict');
    });

    it('rejects another writer, a reader, a suspended writer and anon', async () => {
      expect((await fails(() => begin('if', undefined, otherWriter))).message).toContain('world_tree_forbidden');
      expect((await fails(() => begin('if', undefined, reader))).message).toContain('writer_required');
      expect((await fails(() => begin('if', undefined, suspended))).message).toContain('write_access_denied');
      await as('', 'anon');
      const anon = await fails(() => exec('select begin_world_branch($1, $2, null, $3)', [world.source, 'if', crypto.randomUUID()]));
      expect(anon.message).toMatch(/permission denied|authentication_required/);
    });

    it('has no forged eligible/counts parameter and keeps the branch_ineligible detail', async () => {
      await as(writer);
      const forged = await fails(() => exec('select begin_world_branch($1, $2, null, $3, true)', [world.source, 'if', crypto.randomUUID()]));
      expect(forged.message).toMatch(/does not exist/);
      await exec("update chapters set is_published = false where work_id = $1", [world.source]);
      const hidden = await fails(() => begin('if'));
      expect(hidden.message).toContain('branch_ineligible');
      expect(hidden.detail).toEqual({ unmetReasons: ['parent_not_visible'] });
    });

    it('rejects a blinded source as parent_not_visible', async () => {
      await exec('select moderation_set_blind($1, null, $2)', [world.source, '검토']);
      expect((await fails(() => begin('expand'))).detail).toEqual({ unmetReasons: ['parent_not_visible'] });
    });
  });

  describe('confirm', () => {
    it('If: zero changes is rejected; one change confirms atomically; retries return the same result', async () => {
      const draft = await begin('if');
      expect((await fails(() => confirm(draft))).message).toContain('world_branch_zero_changes');
      const doc = await copiedDoc(draft);
      await as(writer);
      await exec("update kb_nodes set content = 'changed' where id = $1", [doc.id]);
      await asOwner();
      expect((await diff(draft)).counts).toEqual({ added: 0, modified: 1, deleted: 0 });
      const result = await confirm(draft, '  If 이야기 ');
      expect(result.work_id).toBe(draft);
      const [w] = await exec('select is_branch_draft, title from works where id = $1', [draft]);
      expect(w).toMatchObject({ is_branch_draft: false, title: 'If 이야기' });
      const [snap] = await exec("select count(*)::int as n from world_branch_docs where branch_id = $1 and change_kind = 'modified'", [result.branch_id]);
      expect(snap.n).toBe(1);
      // eligibility dropping afterwards never creates a second branch
      await exec("update chapters set is_published = false where work_id = $1", [world.source]);
      expect(await confirm(draft, 'other title')).toEqual(result);
      const [count] = await exec('select count(*)::int as n from world_branches where work_id = $1', [draft]);
      expect(count.n).toBe(1);
    });

    it('re-evaluates the ORIGINAL parent and rolls back on unpublish / blind / document shrink', async () => {
      const draft = await begin('if');
      await addDoc(draft);
      await exec("update chapters set is_published = false where work_id = $1", [world.source]);
      expect((await fails(() => confirm(draft))).detail).toEqual({ unmetReasons: ['parent_not_visible'] });
      await exec("update chapters set is_published = true where work_id = $1", [world.source]);
      await exec('select moderation_set_blind($1, null, $2)', [world.source, '검토']);
      expect((await fails(() => confirm(draft))).detail).toEqual({ unmetReasons: ['parent_not_visible'] });
      await exec('select moderation_set_blind($1, null, null)', [world.source]);
      await exec("update kb_nodes set deleted_at = now() where work_id = $1 and category = '세력' and node_type = 'file'", [world.source]);
      const shrink = await fails(() => confirm(draft));
      expect(shrink.message).toContain('branch_ineligible');
      expect((shrink.detail as { unmetReasons: string[] }).unmetReasons).toContain('qualifying_documents_insufficient');
      const [b] = await exec('select status from world_branches where work_id = $1', [draft]);
      expect(b.status).toBe('draft');
    });

    it('expand: inherited rows are immutable through every path; zero additions rejected; one addition confirms', async () => {
      const draft = await begin('expand');
      const doc = await copiedDoc(draft);
      await as(writer);
      expect((await fails(() => exec("update kb_nodes set content = 'x' where id = $1", [doc.id]))).message).toContain('world_branch_inherited_immutable');
      await as(writer);
      expect((await fails(() => exec("update kb_nodes set name = 'renamed' where id = $1", [doc.id]))).message).toContain('world_branch_inherited_immutable');
      await as(writer);
      expect((await fails(() => exec('select soft_delete_kb_node($1, $2)', [doc.id, writer]))).message).toContain('world_branch_inherited_immutable');
      await as(writer);
      expect((await fails(() => exec('delete from kb_nodes where id = $1', [doc.id]))).message).toContain('world_branch_inherited_immutable');
      await as(writer);
      expect((await fails(() => exec('update kb_nodes set work_id = $2 where id = $1', [doc.id, world.source]))).message)
        .toMatch(/world_branch_cross_work_move|world_branch_inherited_immutable/);
      expect((await fails(() => confirm(draft))).message).toContain('world_branch_zero_additions');
      await addDoc(draft);
      const result = await confirm(draft, 'Expand');
      expect((await diff(draft)).counts).toEqual({ added: 1, modified: 0, deleted: 0 });
      // confirmed setting KB is frozen
      await as(writer);
      expect((await fails(() => exec("update kb_nodes set content = 'late' where work_id = $1 and name = 'New person'", [draft]))).message)
        .toContain('world_branch_confirmed_immutable');
      expect(result.branch_id).toBeTruthy();
    });

    it('source edits between begin and confirm are a notice, not an author change; later edits notify with dedupe', async () => {
      const draft = await begin('if');
      const doc = await copiedDoc(draft);
      await as(writer);
      await exec("update kb_nodes set content = 'author' where id = $1", [doc.id]);
      await exec("update kb_nodes set content = 'source edit' || content where work_id = $1 and node_type = 'file' and category = '장소'", [world.source]);
      await asOwner();
      expect((await diff(draft)).counts).toEqual({ added: 0, modified: 1, deleted: 0 });
      const result = await confirm(draft);
      const notices = await exec('select event_key from world_branch_notices where branch_id = $1', [result.branch_id]);
      expect(notices.map((n) => n.event_key)).toContain('source_changed_before_confirm');
      const [src] = await exec("select id from kb_nodes where work_id = $1 and node_type = 'file' and category = '사건' order by name limit 1", [world.source]);
      await as(writer);
      await exec("update kb_nodes set content = 'v2' where id = $1", [src.id]);
      await exec("update kb_nodes set content = 'v3' where id = $1", [src.id]);
      await asOwner();
      const [n] = await exec('select count(*)::int as n from world_branch_notices where branch_id = $1 and event_key = $2', [result.branch_id, `source_kb:${src.id}`]);
      expect(n.n).toBe(1);
      const [copy] = await exec('select content from kb_nodes where inherited_from_node_id = $1', [src.id]);
      expect(copy.content).not.toBe('v3');
    });

    it('a confirmed child can branch again under the same rules', async () => {
      const draft = await begin('if');
      await addDoc(draft);
      await confirm(draft);
      await exec(`insert into chapters(work_id, title, content, order_index, is_published)
        select $1, 'C' || g, '', g, true from generate_series(1, $2::int) g`, [draft, T.minPublishedChapters]);
      const [b] = await exec('select id from world_branches where work_id = $1', [draft]);
      // 0035: independent eras only come after the inherited span cloned at confirm.
      await exec(`insert into world_eras(branch_id, position, name)
        select $1, coalesce(max(position), -1) + 1, '가지 1기' from world_eras where branch_id = $1`, [b.id]);
      const grandchild = await begin('expand', undefined, writer, draft);
      const [g] = await exec('select parent_branch_id, depth from world_branches where work_id = $1', [grandchild]);
      expect(g).toMatchObject({ parent_branch_id: b.id, depth: 2 });
    });
  });

  describe('diff RPC and direct writes', () => {
    it('is owner-only and never returns content', async () => {
      const draft = await begin('if');
      await addDoc(draft);
      const d = await diff(draft);
      for (const entry of d.entries) expect(Object.keys(entry).sort()).toEqual(['category', 'changeKind', 'draftNodeId', 'name', 'sourceNodeId']);
      expect((await fails(() => diff(draft, otherWriter))).message).toContain('world_tree_forbidden');
    });

    it('rejects direct writes to branches, baselines and snapshots', async () => {
      const draft = await begin('if');
      await as(writer);
      expect((await fails(() => exec("update world_branches set status = 'confirmed' where work_id = $1", [draft]))).message).toMatch(/permission denied/);
      await as(writer);
      expect((await fails(() => exec("update world_branch_docs set baseline_content = 'x'"))).message).toMatch(/permission denied/);
      expect((await fails(() => exec("update world_branch_docs set baseline_content = 'x'"))).message).toContain('world_branch_snapshot_immutable');
    });
  });

  describe('delete guards (WTREE-10)', () => {
    it('blocks deleting a parent branch/work with a live child through every path; allows it once the child is gone', async () => {
      const draft = await begin('if');
      const [trunk] = await exec('select id from world_branches where work_id = $1', [world.source]);
      await as(writer);
      expect((await fails(() => exec('select soft_delete_world_branch($1)', [trunk.id]))).message).toContain('world_branch_has_children');
      await as(writer);
      expect((await fails(() => exec('update works set deleted_at = now() where id = $1', [world.source]))).message).toContain('world_branch_has_children');
      expect((await fails(() => exec('delete from works where id = $1', [world.source]))).message).toContain('world_branch_has_children');
      const [child] = await exec('select id from world_branches where work_id = $1', [draft]);
      await as(writer);
      await exec('select soft_delete_world_branch($1)', [child.id]);
      await asOwner();
      const [w] = await exec('select deleted_at is not null as gone from works where id = $1', [draft]);
      expect(w.gone).toBe(true);
      // works_owner_all's USING also gates the new row, so an owner-role soft delete is an RLS
      // error by design; the guard trigger itself is exercised as the table owner.
      await asOwner();
      await exec('update works set deleted_at = now() where id = $1', [world.source]);
      const [t] = await exec('select deleted_at is not null as gone from world_branches where id = $1', [trunk.id]);
      expect(t.gone).toBe(true);
    });

    it('a parent going private never changes the child chapters, snapshot or parent link', async () => {
      const draft = await begin('if');
      await addDoc(draft);
      const result = await confirm(draft);
      await exec("insert into chapters(work_id, title, content, order_index, is_published) values ($1, 'c1', '', 0, true)", [draft]);
      const before = await exec('select (select parent_branch_id from world_branches where id = $1) as p, (select count(*) from world_branch_docs where branch_id = $1) as s, (select bool_and(is_published) from chapters where work_id = $2) as pub', [result.branch_id, draft]);
      await exec("update chapters set is_published = false where work_id = $1", [world.source]);
      const after = await exec('select (select parent_branch_id from world_branches where id = $1) as p, (select count(*) from world_branch_docs where branch_id = $1) as s, (select bool_and(is_published) from chapters where work_id = $2) as pub', [result.branch_id, draft]);
      expect(after).toEqual(before);
    });
  });
});

/**
 * Two-session races. The isolated schema is committed (two connections cannot share an
 * uncommitted schema) and dropped in afterAll. Lock waits are observed with lock_timeout.
 */
describe.skipIf(!process.env.SUPABASE_DB_URL || process.env.WTREE_BRANCH_RACE_SCHEMA_COMMIT !== '1')(
  'world-tree branching races (PostgreSQL)', () => {
    const sql = postgres(process.env.SUPABASE_DB_URL!, { max: 3, prepare: false });
    const schema = `wtree_race_${crypto.randomUUID().replaceAll('-', '')}`;
    let a: postgres.ReservedSql;
    let b: postgres.ReservedSql;
    const on = (c: postgres.ReservedSql): Exec => (text, params = []) => c.unsafe(text, params as postgres.ParameterOrJSON<never>[]);
    let world: { source: string; era: string; personRoot: string };

    async function session(c: postgres.ReservedSql, user: string) {
      await c.unsafe(`set search_path = ${schema}, public`);
      await c.unsafe("select set_config('request.jwt.claim.sub', $1, false)", [user]);
      await c.unsafe('set role authenticated');
    }

    beforeAll(async () => {
      a = await sql.reserve();
      b = await sql.reserve();
      await a.unsafe('begin');
      await install(on(a), schema);
      world = await seedWorld(on(a));
      await a.unsafe('commit');
    });
    afterAll(async () => {
      try {
        await a?.unsafe('rollback').catch(() => undefined);
        await b?.unsafe('rollback').catch(() => undefined);
        await a?.unsafe('reset role');
        await a?.unsafe(`drop schema if exists ${schema} cascade`);
      } finally {
        a?.release();
        b?.release();
        await sql.end();
      }
    });

    it('a chapter/KB insert into the source waits while begin holds the source lock (phantom guard)', async () => {
      await session(a, writer);
      await session(b, writer);
      await a.unsafe('begin');
      await a.unsafe('select begin_world_branch($1, $2, null, $3)', [world.source, 'if', crypto.randomUUID()]);
      await b.unsafe("set lock_timeout = '300ms'");
      await expect(b.unsafe(`insert into kb_nodes(owner_id, work_id, scope, parent_id, node_type, category, name, content)
        values ($1, $2, 'work', $3, 'file', '인물', 'phantom', 'x')`, [writer, world.source, world.personRoot])).rejects.toThrow(/lock timeout/);
      await a.unsafe('rollback');
      await b.unsafe("set lock_timeout = 0");
    });

    it('deleting the parent while a child begin is open waits, then fails with world_branch_has_children', async () => {
      await session(a, writer);
      await session(b, writer);
      await a.unsafe('begin');
      await a.unsafe('select begin_world_branch($1, $2, null, $3)', [world.source, 'if', crypto.randomUUID()]);
      const pending = b.unsafe('update works set deleted_at = now() where id = $1', [world.source]);
      await new Promise((resolve) => setTimeout(resolve, 200));
      await a.unsafe('commit');
      await expect(pending).rejects.toThrow(/world_branch_has_children/);
    });

    it('concurrent confirms of one draft return the same result and snapshot once', async () => {
      await session(a, writer);
      const [row] = await a.unsafe('select begin_world_branch($1, $2, null, $3) as r', [world.source, 'expand', crypto.randomUUID()]);
      const draft = (row.r as { draft_work_id: string }).draft_work_id;
      await a.unsafe(`insert into kb_nodes(owner_id, work_id, scope, parent_id, node_type, category, name, content)
        select $1, $2, 'work', r.id, 'file', '장소', 'race place', 'x' from kb_nodes r
         where r.work_id = $2 and r.parent_id is null and r.category = '장소'`, [writer, draft]);
      await session(b, writer);
      await a.unsafe('begin');
      const first = await a.unsafe('select confirm_world_branch($1, $2, $3) as r', [draft, 'Race', world.era]);
      const second = b.unsafe('select confirm_world_branch($1, $2, $3) as r', [draft, 'Race', world.era]);
      await new Promise((resolve) => setTimeout(resolve, 200));
      await a.unsafe('commit');
      expect((await second)[0].r).toEqual(first[0].r);
      const [snap] = await a.unsafe("select count(*)::int as n from world_branch_docs d join world_branches w on w.id = d.branch_id where w.work_id = $1 and d.change_kind = 'added'", [draft]);
      expect(snap.n).toBe(1);
    });

    it('eligibility dropping concurrently with confirm: whichever commits first wins, never both', async () => {
      await session(a, writer);
      const [row] = await a.unsafe('select begin_world_branch($1, $2, null, $3) as r', [world.source, 'if', crypto.randomUUID()]);
      const draft = (row.r as { draft_work_id: string }).draft_work_id;
      await a.unsafe(`update kb_nodes set content = 'changed' where work_id = $1 and inherited_from_node_id is not null
        and id = (select id from kb_nodes where work_id = $1 and inherited_from_node_id is not null order by id limit 1)`, [draft]);
      await session(b, writer);
      await b.unsafe('begin');
      await b.unsafe('update chapters set is_published = false where work_id = $1', [world.source]);
      const confirmCall = a.unsafe('select confirm_world_branch($1, $2, $3)', [draft, 'Race', world.era]);
      await new Promise((resolve) => setTimeout(resolve, 200));
      await b.unsafe('commit');
      await expect(confirmCall).rejects.toThrow(/branch_ineligible/);
      await b.unsafe('update chapters set is_published = true where work_id = $1', [world.source]);
    });
  });
