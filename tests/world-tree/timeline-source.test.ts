import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 18-03 static contract for supabase/migrations/0035_world_tree_timeline.sql.
 * Text checks only: they pin the 0034 clone signature, grants, the auth -> ownership -> lock ->
 * validation -> apply order and guard coverage. They are NOT runtime proof —
 * timeline.database.test.ts (run by 18-12) is.
 */
const DIR = 'supabase/migrations';
const MIGRATION = `${DIR}/0035_world_tree_timeline.sql`;

function load(file: string): string {
  const raw = readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
  return raw
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}
const flat = load(MIGRATION);
const branching = load(`${DIR}/0034_world_tree_branching.sql`);

/** Body of `create or replace function <name>(` up to the closing `$$;`. */
function body(name: string): string {
  const start = flat.indexOf(`create or replace function ${name}(`);
  expect(start, `function ${name}`).toBeGreaterThanOrEqual(0);
  const open = flat.indexOf('$$', start);
  const close = flat.indexOf('$$;', open + 2);
  return flat.slice(start, close);
}
function order(text: string, ...needles: string[]) {
  let at = -1;
  for (const needle of needles) {
    const next = text.indexOf(needle, at + 1);
    expect(next, `"${needle}" after position ${at}`).toBeGreaterThan(at);
    at = next;
  }
}

describe('0035 placement and wrapping', () => {
  it('is wrapped in a transaction and reloads the PostgREST schema', () => {
    expect(flat.trim().startsWith('begin;')).toBe(true);
    expect(flat.trim().endsWith('commit;')).toBe(true);
    expect(flat).toContain("notify pgrst, 'reload schema'");
  });

  it('creates no tables and does not redefine 0033/0034 RPCs', () => {
    expect(flat).not.toMatch(/create table/);
    for (const owned of ['begin_world_branch', 'confirm_world_branch', 'get_world_branch_diff', 'soft_delete_world_branch',
      'world_tree_assert_branch_eligible', 'get_world_branch_eligibility', 'world_work_reader_visible']) {
      expect(flat).not.toContain(`function ${owned}(`);
    }
  });

  it('is the only migration defining the timeline RPCs', () => {
    for (const file of readdirSync(DIR).filter((f) => f.endsWith('.sql') && f !== '0035_world_tree_timeline.sql')) {
      const text = readFileSync(`${DIR}/${file}`, 'utf8').toLowerCase();
      for (const fn of ['save_world_timeline', 'ensure_world_tree']) {
        expect(text.includes(`function ${fn}(`), `${file} defines ${fn}`).toBe(false);
      }
    }
  });

  it('contains no eligibility threshold numbers (owned by 18-13 / 0033)', () => {
    expect(flat).not.toMatch(/\b(50|200|20)\b/);
  });
});

describe('clone_world_branch_timeline completes the 0034 contract', () => {
  it('replaces the 0034 placeholder with exactly the same signature', () => {
    expect(branching).toContain('create function clone_world_branch_timeline(p_branch_id uuid, p_fork_era_id uuid) returns void');
    expect(flat).toContain('create or replace function clone_world_branch_timeline(p_branch_id uuid, p_fork_era_id uuid) returns void');
    expect(branching).toContain('perform clone_world_branch_timeline(v_branch.id, p_era_id)');
    expect(flat).not.toContain('world_tree_timeline_not_ready');
  });

  it('is internal only: SECURITY DEFINER, no grant to any API role', () => {
    expect(body('clone_world_branch_timeline')).toContain('security definer set search_path = public');
    expect(flat).toContain('revoke all on function clone_world_branch_timeline(uuid, uuid) from public, anon, authenticated, service_role;');
    expect(flat).not.toMatch(/grant execute on function clone_world_branch_timeline/);
  });

  it('accepts only the stored fork of the direct parent line and never re-clones', () => {
    const b = body('clone_world_branch_timeline');
    order(b,
      "v_branch.kind = 'trunk'",
      'v_branch.fork_era_id is distinct from p_fork_era_id',
      'v_fork.branch_id <> v_branch.parent_branch_id',
      "raise exception 'world_timeline_already_cloned'");
  });

  it('copies parent eras up to the fork as inherited rows, then opens the first independent era', () => {
    const b = body('clone_world_branch_timeline');
    order(b,
      "set_config('world_tree.timeline_clone', p_branch_id::text, true)",
      'e.branch_id = v_branch.parent_branch_id and e.deleted_at is null and e.position <= v_fork.position',
      'insert into world_eras (branch_id, source_era_id, position, name, year_label, memo, inherited)',
      'values (p_branch_id, r.id, v_next, r.name, r.year_label, null, true)',
      'insert into world_era_placements',
      "set_config('world_tree.timeline_clone', '', true)",
      "values (p_branch_id, v_next, '분기 이후', false)",
      'values (p_branch_id, v_own_era, v_branch.work_id, 0, false)');
    // Copied placements are re-densified and the first one is never concurrent.
    expect(b).toContain('x.concurrent_with_prev and x.rn > 1');
    expect(b).toContain('w.deleted_at is null and not w.is_branch_draft');
  });
});

describe('ensure_world_tree', () => {
  it('is SECURITY DEFINER, closed to anon/service_role, granted to authenticated', () => {
    expect(body('ensure_world_tree')).toContain('security definer set search_path = public');
    expect(flat).toContain('revoke all on function ensure_world_tree(uuid) from public, anon, service_role;');
    expect(flat).toContain('grant execute on function ensure_world_tree(uuid) to authenticated;');
  });

  it('checks auth, ownership and locks before creating the trunk, first era and placement', () => {
    const b = body('ensure_world_tree');
    order(b,
      'v_uid := world_tree_require_writer()',
      "raise exception 'world_tree_forbidden'",
      'perform world_tree_lock_root_then(p_work_id)',
      'for update of b',
      "values (p_work_id, p_work_id, v_uid, null, 'trunk', 'confirmed', null, 0, now())",
      "values (v_branch.id, 0, '1기')",
      'insert into world_era_placements');
    expect(b).toContain('v_work.is_branch_draft');
    // A plain fruit placed on another line cannot become a world of its own.
    expect(b).toContain("raise exception 'world_timeline_duplicate_work'");
  });
});

describe('save_world_timeline', () => {
  const b = () => body('save_world_timeline');

  it('takes (branch, eras, placements) as jsonb and is granted to authenticated only', () => {
    expect(flat).toContain('create or replace function save_world_timeline(p_branch_id uuid, p_eras jsonb, p_placements jsonb) returns jsonb');
    expect(b()).toContain('security definer set search_path = public');
    expect(flat).toContain('revoke all on function save_world_timeline(uuid, jsonb, jsonb) from public, anon, service_role;');
    expect(flat).toContain('grant execute on function save_world_timeline(uuid, jsonb, jsonb) to authenticated;');
  });

  it('runs auth -> ownership -> root/parent/branch locks -> validation -> apply', () => {
    order(b(),
      'v_uid := world_tree_require_writer()',
      'v_branch.owner_id <> v_uid',
      'perform world_tree_lock_root_then(v_parent_work)',
      'for update of w',
      'for update of b',
      "v_branch.status <> 'confirmed'",
      "raise exception 'world_timeline_input_invalid'",
      "raise exception 'world_timeline_era_name_required'",
      "raise exception 'world_timeline_order_invalid'",
      "raise exception 'world_timeline_inherited_locked'",
      "raise exception 'world_timeline_memo_not_allowed'",
      "raise exception 'world_timeline_era_invalid'",
      "raise exception 'world_timeline_duplicate_work'",
      "raise exception 'world_timeline_first_concurrent'",
      "raise exception 'world_timeline_inherited_locked'",
      "raise exception 'world_timeline_work_not_placeable'",
      "raise exception 'world_timeline_branch_work_required'",
      "raise exception 'world_timeline_duplicate_work'",
      "raise exception 'world_timeline_fork_era_in_use'",
      "raise exception 'world_timeline_era_not_empty'",
      'update world_eras e set position = x.position',
      'insert into world_eras (id, branch_id, position, name, year_label, memo, inherited)',
      'update world_era_placements p set deleted_at = now()',
      'update world_era_placements p set era_id = x.era_id',
      'insert into world_era_placements (branch_id, era_id, work_id, order_index, concurrent_with_prev, relation_label)',
      'update world_eras e set deleted_at = now()',
      'set constraints world_eras_live_position_excl, world_era_placements_live_order_excl immediate');
  });

  it('accepts only the documented payload keys', () => {
    expect(b()).toContain("k not in ('id', 'position', 'name', 'yearlabel', 'memo')");
    expect(b()).toContain("k not in ('eraid', 'workid', 'orderindex', 'concurrentwithprev', 'relationlabel')");
  });

  it('requires the full inherited span unchanged and keeps independent eras after it', () => {
    expect(b()).toContain('e.inherited and e.deleted_at is null and not exists');
    expect(b()).toContain('x.memo is null');
    expect(b()).toContain('x.position <= v_last_inherited');
    // inherited placements must match exactly in both directions
    expect(b().match(/ except /g)?.length).toBe(2);
  });

  it('allows memo only on child branches and only on non-inherited eras', () => {
    expect(b()).toContain("v_branch.kind = 'trunk' and exists (select 1 from jsonb_to_recordset(v_eras) as x(memo text) where x.memo is not null)");
  });

  it('places only the branch work or plain live works of the caller, one line per work', () => {
    expect(b()).toContain('w.owner_id = v_uid and w.deleted_at is null and not w.is_branch_draft');
    expect(b()).toContain('b.root_work_id <> v_branch.root_work_id or not e.inherited');
  });
});

describe('order uniqueness and guards', () => {
  it('replaces the 0032 partial unique indexes with deferrable exclusion constraints', () => {
    expect(flat).toContain('drop index if exists world_eras_live_position;');
    expect(flat).toContain('drop index if exists world_era_placements_live_order;');
    expect(flat).toContain('add constraint world_eras_live_position_excl exclude using btree (branch_id with =, position with =) where (deleted_at is null) deferrable initially deferred;');
    expect(flat).toContain('add constraint world_era_placements_live_order_excl exclude using btree (branch_id with =, era_id with =, order_index with =) where (deleted_at is null) deferrable initially deferred;');
  });

  it('guards eras and placements on every write path (no current_user bypass)', () => {
    expect(flat).toContain('create trigger world_eras_guard_timeline before insert or update or delete on world_eras for each row execute function guard_world_era_rules();');
    expect(flat).toContain('create trigger world_era_placements_guard_timeline before insert or update or delete on world_era_placements for each row execute function guard_world_era_placement_rules();');
    for (const fn of ['guard_world_era_rules', 'guard_world_era_placement_rules']) {
      expect(body(fn)).not.toContain('current_user');
      expect(body(fn)).toContain("raise exception 'world_timeline_inherited_locked'");
      expect(body(fn)).toContain('world_timeline_clone_active(new.branch_id)');
    }
    expect(body('guard_world_era_rules')).toContain("v_kind not in ('if', 'expand')");
  });

  it('keeps the 0032 same-world checks and admits plain same-owner works as fruits', () => {
    const g = body('guard_world_tree_same_world');
    for (const table of ['world_era_placements', 'world_branch_notices', 'world_branch_docs', 'world_eras']) {
      expect(g).toContain(`tg_table_name = '${table}'`);
    }
    expect(g).toContain('w.owner_id = v_branch.owner_id and w.deleted_at is null and not w.is_branch_draft');
  });

  it('keeps every helper closed to API roles', () => {
    for (const sig of ['world_timeline_is_uuid(text)', 'world_timeline_is_index(jsonb)',
      'world_timeline_is_optional_text(jsonb, integer)', 'world_timeline_clone_active(uuid)',
      'guard_world_era_rules()', 'guard_world_era_placement_rules()']) {
      expect(flat).toContain(`revoke all on function ${sig} from public, anon, authenticated, service_role;`);
    }
  });
});
