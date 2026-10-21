import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 18-02 static contract for supabase/migrations/0034_world_tree_branching.sql.
 * Text checks only: they pin the call order (auth -> ownership -> root/source locks -> retry ->
 * assert), the original-parent eligibility target, grants and guard coverage. They are NOT
 * runtime proof — branching.database.test.ts (run by 18-12) is.
 */
const DIR = 'supabase/migrations';
const MIGRATION = `${DIR}/0034_world_tree_branching.sql`;
const raw = readFileSync(MIGRATION, 'utf8').replaceAll('\r\n', '\n');
const code = raw
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n');
const flat = code.replace(/\s+/g, ' ').toLowerCase();

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

describe('0034 placement and wrapping', () => {
  it('is wrapped in a transaction and reloads the PostgREST schema', () => {
    expect(flat.trim().startsWith('begin;')).toBe(true);
    expect(flat.trim().endsWith('commit;')).toBe(true);
    expect(flat).toContain("notify pgrst, 'reload schema'");
  });

  it('creates no tables and does not redefine 0033 eligibility objects', () => {
    expect(flat).not.toMatch(/create table/);
    for (const owned of ['world_work_reader_visible', 'world_tree_evaluate_branch_eligibility',
      'get_world_branch_eligibility', 'world_tree_assert_branch_eligible', 'world_tree_eligibility_thresholds']) {
      expect(flat).not.toContain(`create or replace function ${owned}(`);
      expect(flat).not.toContain(`create function ${owned}(`);
    }
  });

  it('is the only migration defining the branch RPCs', () => {
    for (const file of readdirSync(DIR).filter((f) => f.endsWith('.sql') && f !== '0034_world_tree_branching.sql')) {
      const text = readFileSync(`${DIR}/${file}`, 'utf8').toLowerCase();
      for (const fn of ['begin_world_branch', 'confirm_world_branch', 'get_world_branch_diff', 'soft_delete_world_branch']) {
        expect(text.includes(`function ${fn}(`), `${file} defines ${fn}`).toBe(false);
      }
    }
  });

  it('contains no threshold numbers (rule 22 values live in 18-13 / 0033 only)', () => {
    expect(flat).not.toMatch(/\b(50|200|20)\b/);
  });
});

describe('RPC signatures and grants', () => {
  const rpcs: Array<[string, string]> = [
    ['begin_world_branch', 'uuid, text, uuid, uuid'],
    ['get_world_branch_diff', 'uuid'],
    ['confirm_world_branch', 'uuid, text, uuid'],
    ['soft_delete_world_branch', 'uuid'],
  ];
  it.each(rpcs)('%s is SECURITY DEFINER, closed to anon/service_role, granted to authenticated', (fn, args) => {
    expect(body(fn)).toContain('security definer set search_path = public');
    expect(flat).toContain(`revoke all on function ${fn}(${args}) from public, anon, service_role;`);
    expect(flat).toContain(`grant execute on function ${fn}(${args}) to authenticated;`);
  });

  it('takes the planned parameters and no eligible/counts/thresholds/visibility input', () => {
    expect(flat).toContain('create or replace function begin_world_branch( p_source_work_id uuid, p_kind text, p_fork_era_id uuid, p_request_id uuid )');
    expect(flat).toContain('create or replace function confirm_world_branch(p_draft_work_id uuid, p_title text, p_era_id uuid)');
    for (const fn of ['begin_world_branch', 'confirm_world_branch']) {
      const head = body(fn).slice(0, body(fn).indexOf(')'));
      expect(head).not.toMatch(/eligib|count|threshold|visible|public|p_added|p_modified|p_deleted/);
    }
  });

  it('keeps every internal helper and trigger function without API grants', () => {
    const internal = flat.match(/create or replace function ([a-z_]+)\(/g)!.map((m) => m.slice(27, -1))
      .filter((fn) => !rpcs.some(([rpc]) => rpc === fn));
    expect(internal.length).toBeGreaterThan(8);
    for (const fn of internal) {
      expect(flat, fn).toMatch(new RegExp(`revoke all on function ${fn}\\([^)]*\\) from public, anon, authenticated, service_role;`));
      expect(flat, fn).not.toMatch(new RegExp(`grant execute on function ${fn}\\(`));
    }
    expect(flat).toContain('revoke all on function clone_world_branch_timeline(uuid, uuid) from public, anon, authenticated, service_role;');
  });
});

describe('begin_world_branch order', () => {
  const b = () => body('begin_world_branch');
  it('auth/writer/write access -> ownership -> root->source lock -> request retry -> assert -> clone', () => {
    order(b(),
      'world_tree_require_writer()',
      "raise exception 'world_tree_forbidden'",
      'world_tree_lock_root_then(p_source_work_id)',
      'where b.request_id = p_request_id',
      'perform world_tree_assert_branch_eligible(p_source_work_id)',
      'create_work(v_uid',
      'is_branch_draft = true',
      'insert into world_branch_docs');
  });
  it('re-derives the caller from auth.uid() and never trusts an owner argument', () => {
    expect(b()).not.toContain('p_owner_id');
    expect(body('world_tree_require_writer')).toContain('auth.uid()');
    order(body('world_tree_require_writer'), "'authentication_required'", "p.role = 'writer'", 'user_can_write(v_uid)');
  });
  it('validates kind and requires a stable request id', () => {
    expect(b()).toContain("p_kind not in ('if', 'expand')");
    expect(b()).toContain("raise exception 'world_branch_request_required'");
    expect(b()).toContain("raise exception 'world_branch_request_conflict'");
  });
  it('seeds the 5 locked defaults from the private canonical catalog and maps structural roots', () => {
    expect(b()).toContain('join kb_template_seed_catalog seed on seed.name = folder.name');
    expect(b()).toContain("if r.category = '회차' then continue;");
    expect(b()).toMatch(/if r\.is_locked then select n\.id into v_new/);
  });
  it('freezes the baseline for setting files only and marks inherited provenance', () => {
    expect(b()).toContain('baseline_name, baseline_category, baseline_content');
    expect(b()).toContain("r.node_type = 'file' and r.category = any(world_tree_setting_categories())");
    expect(b()).toContain('inherited_from_node_id');
    expect(body('world_tree_setting_categories')).toContain("array['인물', '장소', '사건', '세력', '아이템']");
  });
  it('does not copy chapters or manuscripts', () => {
    expect(b()).not.toMatch(/insert into chapters|from chapters/);
  });
});

describe('confirm_world_branch order', () => {
  const c = () => body('confirm_world_branch');
  it('auth -> ownership -> root/parent/draft locks -> confirmed retry -> input -> assert(parent) -> diff', () => {
    order(c(),
      'world_tree_require_writer()',
      "raise exception 'world_tree_forbidden'",
      'world_tree_lock_root_then(v_parent.work_id)',
      'where w.id = p_draft_work_id for update of w',
      'for update of b',
      "if v_branch.status = 'confirmed' then",
      "return jsonb_build_object('work_id', v_branch.work_id, 'branch_id', v_branch.id)",
      "'world_branch_title_required'",
      "'world_branch_era_required'",
      'perform world_tree_assert_branch_eligible(v_parent.work_id)',
      'from world_tree_branch_diff_rows(v_branch.id)');
  });
  it('evaluates the ORIGINAL parent, never the draft copy, and does not swallow branch_ineligible', () => {
    expect(c()).not.toContain('world_tree_assert_branch_eligible(p_draft_work_id)');
    expect(c()).not.toContain('world_tree_assert_branch_eligible(v_branch.work_id)');
    expect(c()).not.toMatch(/exception when/);
    expect(b2()).not.toMatch(/exception when/);
    function b2() { return body('begin_world_branch'); }
  });
  it('enforces If >= 1 change and expand >= 1 addition with zero modifications/deletions', () => {
    expect(c()).toContain("v_branch.kind = 'if' and v_added + v_modified + v_deleted < 1 then raise exception 'world_branch_zero_changes'");
    order(c(), "v_branch.kind = 'expand'", 'v_modified + v_deleted > 0', "'world_branch_inherited_mutation'", 'v_added < 1', "'world_branch_zero_additions'");
  });
  it('snapshots, flips the draft, confirms and links the 0035 timeline in one function', () => {
    order(c(),
      'update world_branch_docs d set snapshot_name',
      'insert into world_branch_docs',
      'is_branch_draft = false',
      "status = 'confirmed'",
      'perform clone_world_branch_timeline(v_branch.id, p_era_id)');
  });
  it('records source changes between begin and confirm as a notice, never as a diff', () => {
    expect(c()).toContain("'source_changed_before_confirm'");
    expect(body('world_tree_branch_diff_rows')).not.toMatch(/s\.content|source_node_id = n\.id/);
  });
  it('requires the fork era on the parent line and matching a stored draft fork', () => {
    expect(c()).toContain("'world_branch_era_mismatch'");
    expect(c()).toContain('e.branch_id = v_branch.parent_branch_id');
  });
});

describe('diff and timeline contract', () => {
  it('compares frozen baseline vs draft and counts only setting files', () => {
    const d = body('world_tree_branch_diff_rows');
    expect(d).toContain('d.baseline_name, d.baseline_category, d.baseline_content');
    expect(d).toContain("n.node_type = 'file'");
    expect(d).toContain('world_tree_setting_categories()');
    for (const kind of ["'added'", "'modified'", "'deleted'", "'unchanged'"]) expect(d).toContain(kind);
  });
  it('the diff RPC never returns document content', () => {
    const g = body('get_world_branch_diff');
    expect(g).not.toMatch(/'content'|snapshot_content|x\.content/);
    expect(g).toContain("'counts'");
    expect(g).toContain("'entries'");
  });
  it('defines clone_world_branch_timeline only when absent and fails closed before 0035', () => {
    expect(flat).toContain("to_regprocedure('clone_world_branch_timeline(uuid, uuid)') is null");
    expect(flat).toContain("raise exception 'world_tree_timeline_not_ready'");
    expect(flat).not.toContain('create or replace function clone_world_branch_timeline');
  });
});

describe('lock order is the same in begin, confirm and delete', () => {
  it('root first, then the work', () => {
    order(body('world_tree_lock_root_then'), 'w.id = v_root for update of w', 'w.id = p_work_id for update of w');
    expect(body('soft_delete_world_branch')).toContain('world_tree_lock_root_then(v_branch.work_id)');
  });
  it('documents the FK KEY SHARE phantom guard instead of claiming SELECT snapshots block', () => {
    expect(raw).toContain('FOR KEY SHARE');
    expect(raw).toContain('A plain SELECT snapshot');
  });
});

describe('KB guards', () => {
  const g = () => body('guard_world_branch_kb');
  it('has no current_user bypass (soft_delete_kb_node is SECURITY DEFINER)', () => {
    expect(g()).not.toContain('current_user');
    expect(flat).toContain('create trigger kb_nodes_guard_world_branch before insert or update or delete on kb_nodes');
  });
  it('blocks every inherited column change and delete in an expand draft', () => {
    expect(g()).toContain("v_branch.kind = 'expand'");
    for (const col of ['name', 'content', 'category', 'parent_id', 'scope', 'work_id', 'owner_id', 'node_type', 'inherited_from_node_id', 'deleted_at']) {
      expect(g()).toContain(`new.${col}`);
    }
    expect(g()).toContain("'world_branch_inherited_immutable'");
  });
  it('freezes a confirmed branch setting KB and blocks cross-work moves', () => {
    expect(g()).toContain("v_branch.status = 'confirmed'");
    expect(g()).toContain("'world_branch_confirmed_immutable'");
    expect(g()).toContain("'world_branch_cross_work_move'");
  });
  it('does not replace the template guards', () => {
    expect(flat).not.toMatch(/guard_kb_template_policy|guard_locked_kb_node|drop trigger if exists kb_nodes_guard_template_policy/);
  });
  it('notifies confirmed children of source changes with dedupe and never updates copies', () => {
    const n = body('world_tree_record_source_notice');
    expect(n).toContain("c.status = 'confirmed'");
    expect(n).toContain('on conflict (branch_id, event_key)');
    expect(flat).toContain('create trigger kb_nodes_notify_world_branch_source after insert or update or delete on kb_nodes');
    expect(body('notify_world_branch_source_change')).not.toMatch(/update kb_nodes/);
  });
  it('makes baseline and snapshot rows immutable', () => {
    const d = body('guard_world_branch_docs_immutable');
    expect(d).toContain('old.snapshotted_at is not null');
    expect(d).toContain("'world_branch_snapshot_immutable'");
    expect(flat).toContain('create trigger world_branch_docs_guard_immutable before update or delete on world_branch_docs');
  });
});

describe('delete guards (WTREE-10)', () => {
  it('blocks soft and hard delete of a branch or work with a live child', () => {
    expect(flat).toContain('create trigger world_branches_guard_children before update or delete on world_branches');
    expect(flat).toContain('create trigger works_guard_world_children before update or delete on works');
    expect(body('guard_world_branch_children')).toContain('world_tree_branch_has_live_children(old.id)');
    expect(body('soft_delete_world_branch')).toContain("raise exception 'world_branch_has_children'");
  });
  it('tombstones the branch row together with any work soft delete', () => {
    expect(flat).toContain('create trigger works_tombstone_world_branch after update of deleted_at on works');
    order(body('soft_delete_world_branch'), 'update world_branches set deleted_at = now()', 'update works set deleted_at = now()');
  });
  it('does not propagate a parent going private to children', () => {
    expect(flat).not.toMatch(/update chapters/);
    expect(flat).not.toMatch(/set parent_branch_id/);
  });
});
