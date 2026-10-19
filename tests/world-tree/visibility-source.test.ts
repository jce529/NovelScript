import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 18-04 static contract for supabase/migrations/0036_world_tree_reader_visibility.sql.
 * Text checks only: they pin that 0036 consumes (never redefines) the 0033 helper, the
 * reader/owner projection split, the stub whitelist, grants and search_path. They are NOT
 * RLS/RPC runtime proof — visibility.database.test.ts / view-count.database.test.ts (run by
 * 18-12) are.
 */
const DIR = 'supabase/migrations';
const FILE = '0036_world_tree_reader_visibility.sql';

function load(file: string): string {
  const raw = readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
  return raw
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}
const flat = load(`${DIR}/${FILE}`);

/** Body of `create or replace function <name>(` up to the closing `$$;`. */
function body(name: string, text = flat): string {
  const start = text.indexOf(`create or replace function ${name}(`);
  expect(start, `function ${name}`).toBeGreaterThanOrEqual(0);
  const open = text.indexOf('$$', start);
  const close = text.indexOf('$$;', open + 2);
  return text.slice(start, close);
}
function order(text: string, ...needles: string[]) {
  let at = -1;
  for (const needle of needles) {
    const next = text.indexOf(needle, at + 1);
    expect(next, `"${needle}" after position ${at}`).toBeGreaterThan(at);
    at = next;
  }
}
/** Every `create [or replace] function` header in the file with its language/security clause. */
function functionHeaders(text = flat): { name: string; header: string }[] {
  const out: { name: string; header: string }[] = [];
  const re = /create (?:or replace )?function (\w+)\(/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const header = text.slice(m.index, text.indexOf(' as ', m.index) + 4);
    out.push({ name: m[1], header });
  }
  return out;
}

const INTERNAL = ['world_tree_reader_projection', 'world_tree_full_projection', 'world_tree_work_metrics',
  'world_tree_branch_diff_count'];

describe('0036 placement and wrapping', () => {
  it('is wrapped in a transaction and reloads the PostgREST schema', () => {
    expect(flat.trim().startsWith('begin;')).toBe(true);
    expect(flat.trim().endsWith('commit;')).toBe(true);
    expect(flat).toContain("notify pgrst, 'reload schema'");
  });

  it('creates no tables, columns or per-connection publish inputs', () => {
    expect(flat).not.toMatch(/create table|alter table|add column/);
    expect(flat).not.toContain('connection_public');
    expect(flat).not.toMatch(/\bupdate world_branches\b|\bupdate world_branch_docs\b|\bupdate world_eras\b|\bupdate world_era_placements\b/);
  });

  it('is the only migration defining the 18-04 RPCs', () => {
    for (const file of readdirSync(DIR).filter((f) => f.endsWith('.sql') && f !== FILE)) {
      const text = readFileSync(`${DIR}/${file}`, 'utf8').toLowerCase();
      for (const fn of ['get_world_tree', 'get_world_tree_metric_baseline', 'mark_branch_notice_read',
        'world_tree_reader_projection', 'world_tree_full_projection']) {
        expect(text, `${file} defines ${fn}`).not.toMatch(new RegExp(`function ${fn}\\(`));
      }
    }
  });
});

describe('shared visibility helper is consumed, never redefined (18-14 owns it)', () => {
  it('does not create, replace, grant or revoke world_work_reader_visible', () => {
    expect(flat).not.toMatch(/function world_work_reader_visible\(/);
    expect(flat).not.toMatch(/(grant|revoke)[^;]*world_work_reader_visible/);
  });

  it('does not redefine any 0033/0034/0035 function', () => {
    for (const owned of ['world_tree_evaluate_branch_eligibility', 'get_world_branch_eligibility',
      'world_tree_assert_branch_eligible', 'begin_world_branch', 'confirm_world_branch', 'soft_delete_world_branch',
      'get_world_branch_diff', 'world_tree_require_writer', 'ensure_world_tree', 'save_world_timeline',
      'clone_world_branch_timeline']) {
      expect(flat).not.toContain(`function ${owned}(`);
    }
  });

  it('adds no branching threshold to reader visibility', () => {
    expect(flat).not.toContain('world_tree_eligibility_thresholds');
    expect(flat).not.toContain('world_tree_assert_branch_eligible');
    expect(flat).not.toMatch(/\b50\b/);
  });

  it('decides reader entry and every node by the helper on the work itself', () => {
    const reader = body('world_tree_reader_projection');
    order(reader, 'not world_work_reader_visible(p_work_id)', "return v_unavailable");
    expect(reader).toContain('world_work_reader_visible(b.work_id) as visible');
    // The root is resolved internally but never required to be visible.
    expect(reader).not.toMatch(/world_work_reader_visible\(v_root\)/);
    expect(reader).not.toContain('parent_branch_id is null and');
  });
});

describe('get_world_tree audience decision', () => {
  const entry = body('get_world_tree');

  it('has the planned signature and is security definer with search_path=public', () => {
    expect(flat).toContain('create or replace function get_world_tree(p_work_id uuid, p_reader_preview boolean default false) returns jsonb');
    expect(entry).toContain('security definer set search_path = public');
  });

  it('derives owner/admin from auth.uid() with a live profile and an active admin membership', () => {
    expect(entry).toContain('v_uid uuid := auth.uid()');
    expect(entry).toContain('p.id = v_uid and p.deleted_at is null');
    expect(entry).toContain('admin_users a where a.user_id = v_uid and a.revoked_at is null');
    expect(entry).toContain('v_owner = v_uid');
    // No client-provided role or owner id.
    expect(entry).not.toMatch(/p_owner_id|p_user_id|p_audience|p_mode/);
  });

  it('allows reader preview for owner/admin only and serves it from the DB reader projection', () => {
    order(entry, 'if v_preview and not (v_is_owner or v_is_admin) then', "'unavailable'",
      'if (v_is_owner or v_is_admin) and not v_preview then', 'world_tree_full_projection(',
      'return world_tree_reader_projection(p_work_id)');
  });

  it('grants the reader RPCs to anon/authenticated only and closes the internals', () => {
    expect(flat).toContain('revoke all on function get_world_tree(uuid, boolean) from public, service_role');
    expect(flat).toContain('grant execute on function get_world_tree(uuid, boolean) to anon, authenticated');
    expect(flat).toContain('revoke all on function get_world_tree_metric_baseline() from public, service_role');
    expect(flat).toContain('grant execute on function get_world_tree_metric_baseline() to anon, authenticated');
    for (const fn of INTERNAL) {
      expect(flat).toMatch(new RegExp(`revoke all on function ${fn}\\([^)]*\\) from public, anon, authenticated, service_role`));
      expect(flat).not.toMatch(new RegExp(`grant execute on function ${fn}\\(`));
    }
    expect(flat).toContain('revoke all on function world_tree_author_view_cutoff() from public, anon, authenticated, service_role');
  });

  it('sets search_path=public on every security definer function', () => {
    const headers = functionHeaders().filter((h) => h.header.includes('security definer'));
    expect(headers.length).toBeGreaterThanOrEqual(7);
    for (const h of headers) expect(h.header, h.name).toContain('set search_path = public');
  });
});

describe('reader projection (rule 23 broken branch)', () => {
  const reader = body('world_tree_reader_projection');

  it('keeps visible works first and then walks their ancestor paths only', () => {
    order(reader, 'with recursive tree as', 'kept as (', 'from tree t where t.visible', 'union',
      'join kept k on t.id = k.parent_branch_id', 'keyed as (', "t.id in (select k.id from kept k)");
    expect(reader).toContain("b.deleted_at is null and b.status = 'confirmed'");
  });

  it('builds stubs from the 4-field whitelist only', () => {
    const start = reader.indexOf("'nodetype', 'broken'");
    expect(start).toBeGreaterThan(0);
    const stub = reader.slice(start, reader.indexOf('end order by r.ord', start));
    const keys = [...stub.matchAll(/'(\w+)',/g)].map((m) => m[1]).filter((k) => k !== 'broken');
    expect(keys).toEqual(['nodetype', 'nodekey', 'parentnodekey', 'positionhint']);
    for (const banned of ['work_id', 'title', 'cover', 'metrics', 'diff', 'era', 'chapter']) {
      expect(stub).not.toContain(banned);
    }
  });

  it('never selects a title or cover for a stub row', () => {
    expect(reader).toContain('left join works w on r.visible and w.id = r.work_id');
    expect(reader).not.toContain('cover_image_url');
  });

  it('replaces DB ids with per-response keys in every reader key field', () => {
    expect(reader).toContain("'key', 'n' || k.ord");
    expect(reader).toContain("'parentnodekey', coalesce(to_jsonb(p.key), 'null'::jsonb)");
    expect(reader).toContain("'key', 'e' || (x.rn - 1)");
    expect(reader).not.toMatch(/'(branchid|parentbranchid|rootworkid|ownerid|sourceeraid|forkeraid|memo|content|parentid)'/);
  });

  it('fails closed on a broken structure and on a missing focus', () => {
    order(reader, 'r.parent_id is null) <> 1', 'not exists (select 1 from jsonb_to_recordset(v_rows) p(id uuid) where p.id = r.parent_id)',
      'r.work_id = p_work_id and r.visible', 'return v_unavailable');
  });

  it('exposes eras of visible lines only, without source refs or memos', () => {
    order(reader, 'join world_eras e on e.branch_id = r.id and e.deleted_at is null', 'where r.visible');
    expect(reader).not.toContain('source_era_id');
    expect(reader).not.toContain('e.memo');
  });

  it('re-densifies visible placements so hidden fruits are not implied', () => {
    expect(reader).toContain('row_number() over (partition by pl.era_id order by pl.order_index, pl.id) as dense');
    expect(reader).toContain('y.prev_order is not distinct from y.order_index - 1');
    expect(reader).not.toContain('relation_label');
  });

  it('uses the requested published work title as the header', () => {
    order(reader, 'select w.title into v_title from works w where w.id = p_work_id', "'header', jsonb_build_object('title', v_title)");
    expect(reader).not.toMatch(/where w\.id = v_root/);
  });

  it('returns no setting content anywhere', () => {
    expect(flat).not.toMatch(/\bcontent\b/);
    expect(flat).not.toContain('kb_nodes');
    expect(flat).not.toContain('snapshot_');
    expect(flat).not.toContain('baseline_');
  });
});

describe('owner/admin full projection', () => {
  const full = body('world_tree_full_projection');

  it('accepts only owner/admin audiences and refuses deleted works', () => {
    order(full, "if p_audience not in ('owner', 'admin') then", 'return v_unavailable',
      'v_work.deleted_at is not null', 'return v_unavailable');
  });

  it('returns real ancestry and publish facts with the owner DTO keys only', () => {
    for (const key of ['branchid', 'workid', 'parentbranchid', 'title', 'kind', 'status', 'ispublished', 'readervisible',
      'forkeraid', 'diffcount', 'metrics', 'sourceeraid', 'relationlabel']) {
      expect(full).toContain(`'${key}'`);
    }
    expect(full).toContain('world_work_reader_visible(b.work_id)');
  });
});

describe('metrics baseline and notices', () => {
  it('computes the global baseline from reader-visible works only and reports the cutoff', () => {
    const baseline = body('get_world_tree_metric_baseline');
    order(baseline, 'from works w', 'where world_work_reader_visible(w.id)');
    expect(baseline).toContain("'authorviewsexcludedsince', world_tree_author_view_cutoff()");
    expect(baseline).toContain('c.is_published and c.deleted_at is null');
  });

  it('fixes the cutoff once at the first apply', () => {
    order(flat, "where p.proname = 'world_tree_author_view_cutoff'", 'create function world_tree_author_view_cutoff()',
      "format('select %l::timestamptz', now())");
  });

  it('mark_branch_notice_read re-checks writer access and ownership and only sets read_at', () => {
    const fn = body('mark_branch_notice_read');
    order(fn, 'v_uid := world_tree_require_writer()', 'update world_branch_notices n',
      'set read_at = coalesce(n.read_at, now())', 'b.owner_id = v_uid', "raise exception 'world_tree_forbidden'");
    expect(fn).not.toMatch(/set [^;]*(event_key|branch_id|source_work_id)\s*=/);
    expect(flat).toContain('revoke all on function mark_branch_notice_read(uuid) from public, anon, service_role');
    expect(flat).toContain('grant execute on function mark_branch_notice_read(uuid) to authenticated');
  });
});

describe('WTREE-09 stays out of scope', () => {
  it('leaves only the progress note', () => {
    const raw = readFileSync(`${DIR}/${FILE}`, 'utf8');
    expect(raw).toMatch(/WTREE-09 note/);
    expect(flat).not.toMatch(/reading_progress|chapter_reading_state/);
  });
});
