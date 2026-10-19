import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { WORLD_TREE_ELIGIBILITY } from '@/lib/world-tree/eligibility';

/**
 * 18-03 timeline DB suite (WTREE-01/02/03/04). Real PostgreSQL, isolated schema, one connection,
 * outer rollback (nothing is committed). Opt-in: runs only with SUPABASE_DB_URL under
 * `--project db`; the live run belongs to 18-12. Not executed by 18-03.
 *
 * Covers: ensure_world_tree idempotency, clone at confirm (inherited copies up to the fork,
 * nested branches use the direct parent, parent edits never propagate), save_world_timeline
 * validation (name, dense order, first concurrent, memo, inherited tamper/omission, era
 * deletion, cross-world / duplicate works, new fruit), swaps under deferred uniqueness and the
 * trigger guards on direct writes.
 */
const MIGRATIONS = ['0001_init.sql', '0002_studio.sql', '0003_reader.sql', '0004_kb_custom_folders.sql',
  '0005_commerce.sql', '0006_admin_foundation.sql', '0007_admin_operations.sql',
  '0008_sanction_enforcement.sql', '0009_blind_access.sql', '0012_template_category_folders.sql',
  '0022_template_readonly_backfill.sql', '0023_template_policy_guards.sql',
  '0032_world_tree_schema.sql', '0033_world_tree_eligibility.sql', '0034_world_tree_branching.sql',
  '0035_world_tree_timeline.sql'];

const writer = '13000000-0000-4000-8000-000000000001';
const otherWriter = '13000000-0000-4000-8000-000000000002';
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
type EraIn = { id: string | null; position: number; name: string; yearLabel: string | null; memo: string | null };
type PlacementIn = { eraId: string; workId: string; orderIndex: number; concurrentWithPrev: boolean; relationLabel: string | null };

describe.skipIf(!process.env.SUPABASE_DB_URL)('world-tree timeline (PostgreSQL)', () => {
  const sql = postgres(process.env.SUPABASE_DB_URL!, { max: 1, prepare: false });
  const schema = `wtree_timeline_${crypto.randomUUID().replaceAll('-', '')}`;
  const exec: Exec = (text, params = []) => sql.unsafe(text, params as postgres.ParameterOrJSON<never>[]);
  let source: string;

  async function as(id: string) {
    await exec('reset role');
    await exec("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    await exec('set role authenticated');
  }
  async function asOwner() {
    await exec('reset role');
    await exec("select set_config('request.jwt.claim.sub', '', false)");
  }
  async function fails(action: () => Promise<unknown>): Promise<string> {
    await exec('savepoint expected_failure');
    try {
      await action();
    } catch (e) {
      await exec('rollback to savepoint expected_failure');
      await asOwner();
      return (e as { message: string }).message;
    }
    await exec('release savepoint expected_failure');
    throw new Error('expected failure');
  }
  async function ensure(work: string, user = writer) {
    await as(user);
    const [row] = await exec('select ensure_world_tree($1) as r', [work]);
    await asOwner();
    return row.r as { branch_id: string; root_work_id: string; created: boolean };
  }
  async function save(branch: string, eras: EraIn[], placements: PlacementIn[], user = writer) {
    await as(user);
    const [row] = await exec('select save_world_timeline($1, $2::jsonb, $3::jsonb) as r',
      [branch, JSON.stringify(eras), JSON.stringify(placements)]);
    await asOwner();
    return row.r as { branch_id: string; eras: { id: string; position: number }[]; placementCount: number };
  }
  async function eras(branch: string) {
    return exec(`select id, position, name, year_label, memo, inherited, source_era_id from world_eras
      where branch_id = $1 and deleted_at is null order by position`, [branch]);
  }
  async function placements(branch: string) {
    return exec(`select era_id, work_id, order_index, concurrent_with_prev, relation_label from world_era_placements
      where branch_id = $1 and deleted_at is null order by era_id, order_index`, [branch]);
  }
  /** The stored timeline as a save payload (what the editor would resend). */
  async function payload(branch: string): Promise<{ eras: EraIn[]; placements: PlacementIn[] }> {
    const e = await eras(branch);
    const p = await placements(branch);
    return {
      eras: e.map((r) => ({ id: r.id, position: r.position, name: r.name, yearLabel: r.year_label, memo: r.memo })),
      placements: p.map((r) => ({ eraId: r.era_id, workId: r.work_id, orderIndex: r.order_index,
        concurrentWithPrev: r.concurrent_with_prev, relationLabel: r.relation_label })),
    };
  }
  async function plainWork(owner = writer, title = 'Fruit') {
    const [{ id }] = await exec('select create_work($1, $2, null, null, null) as id', [owner, title]);
    return id as string;
  }
  /** begin + one added setting doc + confirm at the given parent era. */
  async function branchAt(parentWork: string, forkEra: string) {
    await as(writer);
    const [b] = await exec('select begin_world_branch($1, $2, $3, $4) as r', [parentWork, 'expand', forkEra, crypto.randomUUID()]);
    await asOwner();
    const draft = (b.r as { draft_work_id: string }).draft_work_id;
    await exec(`insert into kb_nodes(owner_id, work_id, scope, parent_id, node_type, category, name, content)
      select $1, $2, 'work', r.id, 'file', '장소', 'new place', 'x' from kb_nodes r
       where r.work_id = $2 and r.parent_id is null and r.category = '장소'`, [writer, draft]);
    await as(writer);
    const [c] = await exec('select confirm_world_branch($1, $2, $3) as r', [draft, 'Child', forkEra]);
    await asOwner();
    return c.r as { work_id: string; branch_id: string };
  }
  /** Published chapters, plus setting docs unless the work already has cloned ones (a confirmed child's KB is frozen). */
  async function makeEligible(work: string, withDocs = true) {
    await exec(`insert into chapters(work_id, title, content, order_index, is_published)
      select $1, 'C' || g, '', g, true from generate_series(1, $2::int) g`, [work, T.minPublishedChapters]);
    if (!withDocs) return;
    const m = T.categoryMinimums;
    const plan: Array<[string, number]> = [['인물', m.인물], ['장소', m.장소], ['사건', m.사건],
      ['세력', T.minSettingDocuments - m.인물 - m.장소 - m.사건]];
    for (const [category, count] of plan) {
      await exec(`insert into kb_nodes(owner_id, work_id, scope, parent_id, node_type, category, name, content)
        select $1, $2, 'work', r.id, 'file', $3, $3 || '-' || g || '-' || $2, $5
          from kb_nodes r, generate_series(1, $4::int) g
         where r.work_id = $2 and r.parent_id is null and r.category = $3`,
      [writer, work, category, count, '가'.repeat(T.minDocumentBodyChars)]);
    }
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
    await exec('insert into test_users(id) values ($1),($2)', [writer, otherWriter]);
    await exec("update profiles set role = 'writer', pen_name = 'W' || right(id::text, 4) where id in ($1, $2)", [writer, otherWriter]);
    source = await plainWork(writer, 'Root');
    await makeEligible(source);
  });
  beforeEach(async () => { await exec('savepoint each_test'); });
  afterEach(async () => { await exec('rollback to savepoint each_test'); await asOwner(); });
  afterAll(async () => {
    await exec('rollback');
    await sql.end();
  });

  describe('ensure_world_tree', () => {
    it('creates the trunk, the first era and the original placement once', async () => {
      const first = await ensure(source);
      expect(first.created).toBe(true);
      expect(first.root_work_id).toBe(source);
      const again = await ensure(source);
      expect(again).toMatchObject({ branch_id: first.branch_id, created: false });
      const e = await eras(first.branch_id);
      expect(e).toHaveLength(1);
      expect(e[0]).toMatchObject({ position: 0, name: '1기', inherited: false, memo: null });
      expect(await placements(first.branch_id)).toEqual([
        expect.objectContaining({ era_id: e[0].id, work_id: source, order_index: 0, concurrent_with_prev: false })]);
    });

    it('rejects someone else\'s work and a work already placed as a fruit elsewhere', async () => {
      expect(await fails(() => ensure(source, otherWriter))).toContain('world_tree_forbidden');
      const trunk = await ensure(source);
      const fruit = await plainWork();
      const p = await payload(trunk.branch_id);
      p.placements.push({ eraId: p.eras[0].id!, workId: fruit, orderIndex: 1, concurrentWithPrev: true, relationLabel: null });
      await save(trunk.branch_id, p.eras, p.placements);
      expect(await fails(() => ensure(fruit))).toContain('world_timeline_duplicate_work');
    });
  });

  describe('clone at confirm (inherited span)', () => {
    it('copies the parent eras up to the fork as inherited and opens 분기 이후 with the new work', async () => {
      const trunk = await ensure(source);
      const p = await payload(trunk.branch_id);
      const second = crypto.randomUUID();
      const third = crypto.randomUUID();
      p.eras.push({ id: second, position: 1, name: '2기', yearLabel: '100년', memo: null },
        { id: third, position: 2, name: '3기', yearLabel: null, memo: null });
      await save(trunk.branch_id, p.eras, p.placements);

      const child = await branchAt(source, second);
      const e = await eras(child.branch_id);
      expect(e.map((r) => [r.name, r.inherited])).toEqual([['1기', true], ['2기', true], ['분기 이후', false]]);
      expect(e[1]).toMatchObject({ source_era_id: second, year_label: '100년', memo: null });
      const own = await placements(child.branch_id);
      expect(own).toContainEqual(expect.objectContaining({ era_id: e[2].id, work_id: child.work_id, order_index: 0 }));
      expect(own).toContainEqual(expect.objectContaining({ era_id: e[0].id, work_id: source }));

      // Parent edits never propagate to the copies.
      const again = await payload(trunk.branch_id);
      again.eras[0].name = '고친 1기';
      await save(trunk.branch_id, again.eras, again.placements);
      expect((await eras(child.branch_id))[0].name).toBe('1기');
    });

    it('a nested branch inherits from its direct parent line', async () => {
      const trunk = await ensure(source);
      const [{ id: trunkEra }] = await eras(trunk.branch_id);
      const child = await branchAt(source, trunkEra);
      await makeEligible(child.work_id, false);
      const childEras = await eras(child.branch_id);
      const grandchild = await branchAt(child.work_id, childEras[1].id);
      const g = await eras(grandchild.branch_id);
      expect(g.map((r) => r.source_era_id)).toEqual([childEras[0].id, childEras[1].id, null]);
    });

    it('rejects a fork era that is not on the parent line', async () => {
      const trunk = await ensure(source);
      const [{ id: trunkEra }] = await eras(trunk.branch_id);
      const child = await branchAt(source, trunkEra);
      const [, childOwn] = await eras(child.branch_id);
      await as(writer);
      const [b] = await exec('select begin_world_branch($1, $2, null, $3) as r', [source, 'if', crypto.randomUUID()]);
      await asOwner();
      const draft = (b.r as { draft_work_id: string }).draft_work_id;
      await exec("update kb_nodes set content = content || '!' where work_id = $1 and category = '인물' and node_type = 'file'", [draft]);
      const message = await fails(async () => {
        await as(writer);
        await exec('select confirm_world_branch($1, $2, $3)', [draft, 'Wrong', childOwn.id]);
      });
      expect(message).toMatch(/world_branch_fork_era_invalid/);
    });
  });

  describe('save_world_timeline validation', () => {
    it('requires names, dense positions/orders and a non-concurrent first work; year is optional', async () => {
      const trunk = await ensure(source);
      const p = await payload(trunk.branch_id);
      expect(await fails(() => save(trunk.branch_id, [{ ...p.eras[0], name: '  ' }], p.placements))).toContain('world_timeline_era_name_required');
      expect(await fails(() => save(trunk.branch_id, [{ ...p.eras[0], position: 1 }], p.placements))).toContain('world_timeline_order_invalid');
      expect(await fails(() => save(trunk.branch_id, p.eras, [{ ...p.placements[0], orderIndex: 1 }]))).toContain('world_timeline_order_invalid');
      expect(await fails(() => save(trunk.branch_id, p.eras, [{ ...p.placements[0], concurrentWithPrev: true }]))).toContain('world_timeline_first_concurrent');
      const saved = await save(trunk.branch_id, [{ ...p.eras[0], yearLabel: '' }], p.placements);
      expect(saved.placementCount).toBe(1);
      expect((await eras(trunk.branch_id))[0].year_label).toBeNull();
    });

    it('rejects a memo on the trunk and on inherited eras, stores it on an independent child era', async () => {
      const trunk = await ensure(source);
      const p = await payload(trunk.branch_id);
      expect(await fails(() => save(trunk.branch_id, [{ ...p.eras[0], memo: '본가지' }], p.placements))).toContain('world_timeline_memo_not_allowed');
      const child = await branchAt(source, p.eras[0].id!);
      const c = await payload(child.branch_id);
      expect(await fails(() => save(child.branch_id, [{ ...c.eras[0], memo: 'x' }, c.eras[1]], c.placements))).toContain('world_timeline_inherited_locked');
      await save(child.branch_id, [c.eras[0], { ...c.eras[1], memo: '본가지 1기 후반에 해당' }], c.placements);
      expect((await eras(child.branch_id))[1].memo).toBe('본가지 1기 후반에 해당');
    });

    it('rejects omitting, changing or adding to the inherited span, and eras before it', async () => {
      const trunk = await ensure(source);
      const [{ id: trunkEra }] = await eras(trunk.branch_id);
      const child = await branchAt(source, trunkEra);
      const c = await payload(child.branch_id);
      const locked = 'world_timeline_inherited_locked';
      expect(await fails(() => save(child.branch_id, [{ ...c.eras[1], position: 0 }],
        c.placements.filter((x) => x.eraId === c.eras[1].id).map((x) => ({ ...x }))))).toMatch(/world_timeline_(inherited_locked|order_invalid)/);
      expect(await fails(() => save(child.branch_id, [{ ...c.eras[0], name: '변경' }, c.eras[1]], c.placements))).toContain(locked);
      expect(await fails(() => save(child.branch_id, c.eras, c.placements.filter((x) => x.eraId !== c.eras[0].id)))).toContain(locked);
      const fruit = await plainWork();
      expect(await fails(() => save(child.branch_id, c.eras, [...c.placements,
        { eraId: c.eras[0].id!, workId: fruit, orderIndex: 1, concurrentWithPrev: false, relationLabel: null }]))).toContain(locked);
      expect(await fails(() => save(child.branch_id,
        [{ id: null, position: 0, name: '앞', yearLabel: null, memo: null }, { ...c.eras[0], position: 1 }, { ...c.eras[1], position: 2 }],
        c.placements))).toContain(locked);
    });

    it('rejects deleting an era that still holds a work or is a live fork point, allows moving first', async () => {
      const trunk = await ensure(source);
      const p = await payload(trunk.branch_id);
      const second = crypto.randomUUID();
      await save(trunk.branch_id, [...p.eras, { id: second, position: 1, name: '2기', yearLabel: null, memo: null }],
        [{ ...p.placements[0], eraId: second }]);
      // era 0 is now empty; deleting era 1 (holds the work) without moving it is rejected
      const now = await payload(trunk.branch_id);
      const fruit = await plainWork();
      await save(trunk.branch_id, now.eras, [...now.placements,
        { eraId: now.eras[0].id!, workId: fruit, orderIndex: 0, concurrentWithPrev: false, relationLabel: null }]);
      const withFruit = await payload(trunk.branch_id);
      expect(await fails(() => save(trunk.branch_id, [{ ...withFruit.eras[1], position: 0 }],
        withFruit.placements.filter((x) => x.workId === source)))).toContain('world_timeline_era_not_empty');
      // moving the fruit out first makes the delete legal
      await save(trunk.branch_id, [{ ...withFruit.eras[1], position: 0 }], [
        { eraId: second, workId: source, orderIndex: 0, concurrentWithPrev: false, relationLabel: null },
        { eraId: second, workId: fruit, orderIndex: 1, concurrentWithPrev: true, relationLabel: null }]);
      expect(await eras(trunk.branch_id)).toHaveLength(1);
      // a live child's fork era cannot be deleted
      const child = await branchAt(source, second);
      const after = await payload(trunk.branch_id);
      const third = crypto.randomUUID();
      expect(child.branch_id).toBeTruthy();
      expect(await fails(() => save(trunk.branch_id, [{ id: third, position: 0, name: '새', yearLabel: null, memo: null }],
        after.placements.map((x) => ({ ...x, eraId: third }))))).toContain('world_timeline_fork_era_in_use');
    });

    it('adds a change-free copy as a new fruit, rejects duplicates, other worlds and other users', async () => {
      const trunk = await ensure(source);
      const p = await payload(trunk.branch_id);
      // a child forked before the fruit exists has no copy of it
      const child = await branchAt(source, p.eras[0].id!);
      const c = await payload(child.branch_id);

      const fruit = await plainWork();
      await save(trunk.branch_id, p.eras, [...p.placements,
        { eraId: p.eras[0].id!, workId: fruit, orderIndex: 1, concurrentWithPrev: true, relationLabel: '같은 시기' }]);
      expect(await placements(trunk.branch_id)).toHaveLength(2);

      // the same fruit on the child line's independent era is a duplicate membership
      expect(await fails(() => save(child.branch_id, c.eras, [...c.placements,
        { eraId: c.eras[1].id!, workId: fruit, orderIndex: 1, concurrentWithPrev: false, relationLabel: null }]))).toContain('world_timeline_duplicate_work');
      // listing the same work twice in one payload is rejected too
      expect(await fails(() => save(trunk.branch_id, p.eras, [...p.placements,
        { eraId: p.eras[0].id!, workId: source, orderIndex: 1, concurrentWithPrev: false, relationLabel: null }]))).toContain('world_timeline_duplicate_work');
      // another branch's work is never placed on this line
      expect(await fails(() => save(trunk.branch_id, p.eras, [...p.placements,
        { eraId: p.eras[0].id!, workId: child.work_id, orderIndex: 1, concurrentWithPrev: false, relationLabel: null }]))).toContain('world_timeline_work_not_placeable');
      // someone else's work / someone else's branch
      const foreign = await plainWork(otherWriter, 'Foreign');
      expect(await fails(() => save(trunk.branch_id, p.eras, [...p.placements,
        { eraId: p.eras[0].id!, workId: foreign, orderIndex: 1, concurrentWithPrev: false, relationLabel: null }]))).toContain('world_tree_forbidden');
      expect(await fails(() => save(trunk.branch_id, p.eras, p.placements, otherWriter))).toContain('world_tree_forbidden');
      // the branch work itself can never be dropped
      expect(await fails(() => save(trunk.branch_id, p.eras, []))).toContain('world_timeline_branch_work_required');
    });

    it('swaps era positions and placement order in one save (deferred uniqueness)', async () => {
      const trunk = await ensure(source);
      const p = await payload(trunk.branch_id);
      const fruit = await plainWork();
      const second = crypto.randomUUID();
      await save(trunk.branch_id, [...p.eras, { id: second, position: 1, name: '2기', yearLabel: null, memo: null }],
        [...p.placements, { eraId: p.eras[0].id!, workId: fruit, orderIndex: 1, concurrentWithPrev: false, relationLabel: null }]);
      await save(trunk.branch_id,
        [{ ...p.eras[0], position: 1 }, { id: second, position: 0, name: '2기', yearLabel: null, memo: null }],
        [{ ...p.placements[0], orderIndex: 1 }, { eraId: p.eras[0].id!, workId: fruit, orderIndex: 0, concurrentWithPrev: false, relationLabel: null }]);
      const e = await eras(trunk.branch_id);
      expect(e.map((r) => r.id)).toEqual([second, p.eras[0].id]);
    });

    it('rejects unknown payload keys and malformed values', async () => {
      const trunk = await ensure(source);
      const p = await payload(trunk.branch_id);
      for (const bad of [
        [{ ...p.eras[0], extra: 1 }],
        [{ ...p.eras[0], position: -1 }],
        [{ ...p.eras[0], position: 0.5 }],
        [{ ...p.eras[0], id: 'not-a-uuid' }],
      ]) {
        expect(await fails(() => save(trunk.branch_id, bad as EraIn[], p.placements))).toContain('world_timeline_input_invalid');
      }
    });
  });

  describe('direct writes and guards', () => {
    it('has no API write path to eras/placements and no caller grant on clone', async () => {
      const trunk = await ensure(source);
      await as(writer);
      expect(await fails(() => exec("update world_eras set name = 'x' where branch_id = $1", [trunk.branch_id]))).toMatch(/permission denied/);
      await as(writer);
      expect(await fails(() => exec('select clone_world_branch_timeline($1, $2)', [trunk.branch_id, trunk.branch_id]))).toMatch(/permission denied/);
    });

    it('binds even the table owner: inherited rows cannot change and new inherited rows cannot be forged', async () => {
      const trunk = await ensure(source);
      const [{ id: trunkEra }] = await eras(trunk.branch_id);
      const child = await branchAt(source, trunkEra);
      const [inherited] = await eras(child.branch_id);
      expect(await fails(() => exec("update world_eras set name = 'x' where id = $1", [inherited.id]))).toContain('world_timeline_inherited_locked');
      expect(await fails(() => exec('update world_eras set deleted_at = now() where id = $1', [inherited.id]))).toContain('world_timeline_inherited_locked');
      expect(await fails(() => exec('update world_era_placements set order_index = 5 where era_id = $1', [inherited.id]))).toContain('world_timeline_inherited_locked');
      expect(await fails(() => exec(`insert into world_eras(branch_id, source_era_id, position, name, inherited)
        values ($1, $2, 9, 'forged', true)`, [child.branch_id, trunkEra]))).toContain('world_timeline_inherited_locked');
    });
  });
});
