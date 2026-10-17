/**
 * Static source checks for 0032_world_tree_schema.sql (18-01).
 * These inspect SQL text only — they are NOT proof that RLS/privileges behave at runtime.
 * The live-DB proof (anon/other-user SELECT denial, RPC-only writes) belongs to 18-12.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const DIR = 'supabase/migrations';
const FILE = `${DIR}/0032_world_tree_schema.sql`;
const raw = readFileSync(FILE, 'utf8');
/** SQL without line comments, whitespace collapsed, lower-cased. */
const sql = raw
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')
  .replace(/\s+/g, ' ')
  .toLowerCase();

const NEW_TABLES = ['world_branches', 'world_branch_docs', 'world_eras', 'world_era_placements', 'world_branch_notices'];

function tableBody(name: string): string {
  const start = sql.indexOf(`create table if not exists ${name} (`);
  expect(start, `create table ${name}`).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf(');', start);
  return sql.slice(start, end);
}

describe('0032 file placement', () => {
  it('is the only migration that creates world-tree tables', () => {
    const others = readdirSync(DIR).filter((f) => f.endsWith('.sql') && f !== '0032_world_tree_schema.sql');
    for (const file of others) {
      const text = readFileSync(`${DIR}/${file}`, 'utf8').toLowerCase();
      for (const table of NEW_TABLES) expect(text.includes(`create table if not exists ${table} `), `${file}`).toBe(false);
    }
  });

  it('is wrapped in a transaction', () => {
    expect(sql.trim().startsWith('begin;')).toBe(true);
    expect(sql.trim().endsWith('commit;')).toBe(true);
  });

  it('does not recreate or drop existing schema', () => {
    for (const table of ['works', 'chapters', 'kb_nodes', 'profiles']) {
      expect(sql).not.toMatch(new RegExp(`create table (if not exists )?${table} `));
      expect(sql).not.toMatch(new RegExp(`drop table (if exists )?${table}\\b`));
    }
    expect(sql).not.toContain('alter table profiles');
    expect(sql).not.toContain('drop table');
  });

  it('has no per-connection visibility toggle or second publish flag', () => {
    expect(sql).not.toContain('connection_public');
    expect(sql).not.toMatch(/add column if not exists is_published/);
  });
});

describe('columns on existing tables', () => {
  it('adds works.is_branch_draft default false and kb_nodes.inherited_from_node_id', () => {
    expect(sql).toContain('alter table works add column if not exists is_branch_draft boolean not null default false');
    expect(sql).toContain('alter table kb_nodes add column if not exists inherited_from_node_id uuid references kb_nodes(id)');
  });

  it('guards RPC-managed columns against direct anon/authenticated writes', () => {
    expect(sql).toMatch(/create or replace function guard_world_tree_rpc_columns\(\)/);
    expect(sql).toMatch(/current_user not in \('anon', 'authenticated'\)/);
    expect(sql).toMatch(/create trigger works_guard_world_tree_columns before insert or update on works/);
    expect(sql).toMatch(/create trigger kb_nodes_guard_world_tree_columns before insert or update on kb_nodes/);
  });
});

describe('world_branches', () => {
  const body = () => tableBody('world_branches');

  it('has the planned columns', () => {
    for (const col of ['root_work_id', 'work_id uuid not null unique', 'owner_id', 'parent_branch_id', 'kind', 'status', 'fork_era_id', 'confirmed_at', 'deleted_at']) {
      expect(body()).toContain(col);
    }
    expect(body()).toContain("kind in ('trunk', 'if', 'expand')");
    expect(body()).toContain("status in ('draft', 'confirmed')");
  });

  it('represents the root as a trunk row and caps depth at 32', () => {
    expect(body()).toContain("kind = 'trunk' and parent_branch_id is null and work_id = root_work_id");
    expect(body()).toContain('depth between 0 and 32');
    expect(sql).toContain("create unique index if not exists world_branches_one_trunk on world_branches (root_work_id) where kind = 'trunk'");
  });

  it('adds the circular fork_era_id FK only after world_eras exists', () => {
    const erasAt = sql.indexOf('create table if not exists world_eras (');
    const fkAt = sql.indexOf('add constraint world_branches_fork_era_fk foreign key (fork_era_id) references world_eras(id)');
    expect(erasAt).toBeGreaterThan(0);
    expect(fkAt).toBeGreaterThan(erasAt);
    expect(body()).not.toContain('references world_eras');
  });

  it('integrity trigger checks parent, owner, writer role, depth, cycle and immutability', () => {
    const fnStart = sql.indexOf('create or replace function guard_world_branch_integrity()');
    const fn = sql.slice(fnStart, sql.indexOf('$$;', sql.indexOf('$$', fnStart) + 2));
    expect(fn).toContain("v_parent.status <> 'confirmed'");
    expect(fn).toContain('v_parent.root_work_id <> new.root_work_id');
    expect(fn).toContain('v_parent.owner_id <> new.owner_id');
    expect(fn).toContain("p.role = 'writer'");
    expect(fn).toContain('world_branch_depth_exceeded');
    expect(fn).toContain('world_branch_cycle');
    expect(fn).toContain('world_branch_structure_immutable');
    expect(fn).toContain('world_branch_fork_era_invalid');
    expect(sql).toMatch(/create trigger world_branches_guard_integrity before insert or update on world_branches/);
  });
});

describe('docs / eras / placements / notices', () => {
  it('world_branch_docs stores mapping, baseline and snapshot', () => {
    const body = tableBody('world_branch_docs');
    for (const col of ['source_node_id', 'copied_node_id', 'baseline_name', 'baseline_category', 'baseline_content', 'snapshot_name', 'snapshot_content', 'change_kind']) {
      expect(body).toContain(col);
    }
  });

  it('world_eras has inherited copies and live position uniqueness', () => {
    const body = tableBody('world_eras');
    for (const col of ['branch_id', 'source_era_id', 'position', 'name', 'year_label', 'memo', 'inherited', 'deleted_at']) expect(body).toContain(col);
    expect(sql).toContain('create unique index if not exists world_eras_live_position on world_eras (branch_id, position) where deleted_at is null');
  });

  it('world_era_placements keeps era on the same branch and allows several fruits per branch', () => {
    const body = tableBody('world_era_placements');
    for (const col of ['branch_id', 'era_id', 'work_id', 'order_index', 'concurrent_with_prev', 'relation_label']) expect(body).toContain(col);
    expect(body).toContain('foreign key (era_id, branch_id) references world_eras(id, branch_id)');
    expect(sql).not.toMatch(/unique index[^;]*world_era_placements \(branch_id\) /);
    expect(sql).toContain('on world_era_placements (branch_id, era_id, order_index) where deleted_at is null');
  });

  it('world_branch_notices dedupes per event', () => {
    const body = tableBody('world_branch_notices');
    for (const col of ['source_work_id', 'branch_id', 'event_key', 'created_at', 'read_at']) expect(body).toContain(col);
    expect(body).toContain('unique (branch_id, event_key)');
  });

  it('same-world trigger is attached to every child table', () => {
    for (const table of ['world_branch_docs', 'world_eras', 'world_era_placements', 'world_branch_notices']) {
      expect(sql).toContain(`before insert or update on ${table} for each row execute function guard_world_tree_same_world()`);
    }
    expect(sql).toContain('world_tree_cross_world');
  });
});

describe('RLS and privileges', () => {
  it('enables RLS with owner-only SELECT policies on every new table', () => {
    for (const table of NEW_TABLES) {
      expect(sql).toContain(`alter table ${table} enable row level security`);
      expect(sql).toMatch(new RegExp(`create policy ${table}_owner_select on ${table} for select to authenticated using`));
    }
  });

  it('creates no permissive write policy and no anon policy on new tables', () => {
    const policies = sql.match(/create policy [^;]*/g) ?? [];
    for (const policy of policies) {
      if (!NEW_TABLES.some((t) => policy.includes(` on ${t} `))) continue;
      expect(policy).not.toContain('to anon');
      if (/for (insert|update|delete|all)/.test(policy)) expect(policy).toContain('as restrictive');
    }
    expect(sql).toContain("array[ 'world_branches', 'world_branch_docs', 'world_eras', 'world_era_placements', 'world_branch_notices' ]");
    expect(sql).toContain('as restrictive for insert with check (current_user_can_write())');
  });

  it('GRANT whitelist: only SELECT to authenticated/service_role on new tables', () => {
    const grants = sql.match(/grant [^;]*;/g) ?? [];
    expect(grants.length).toBe(2);
    for (const grant of grants) {
      expect(grant).toMatch(/^grant select on table /);
      expect(grant).not.toContain('anon');
      expect(grant).not.toContain('is_branch_draft');
      expect(grant).not.toContain('inherited_from_node_id');
      expect(grant).not.toMatch(/\bon (table )?(works|chapters|kb_nodes|profiles)\b/);
    }
    expect(sql).toContain('revoke all on table world_branches, world_branch_docs, world_eras, world_era_placements, world_branch_notices from public, anon, authenticated');
  });

  it('defines no SECURITY DEFINER function (RPCs come in 0033~0036)', () => {
    expect(sql).not.toContain('security definer');
  });
});

describe('public-read draft isolation', () => {
  it('recreates works_public_read with the draft filter', () => {
    expect(sql).toContain('drop policy if exists "works_public_read" on works');
    expect(sql).toContain('create policy "works_public_read" on works for select using (deleted_at is null and not is_branch_draft)');
  });

  it('recreates chapters_public_read with the parent draft condition', () => {
    expect(sql).toContain('drop policy if exists "chapters_public_read" on chapters');
    expect(sql).toMatch(/create policy "chapters_public_read" on chapters for select using \( is_published = true and deleted_at is null and exists \(select 1 from works w where w\.id = chapters\.work_id and not w\.is_branch_draft\) \)/);
  });

  it('preserves owner_all and restrictive sanction policies on existing tables', () => {
    const drops = sql.match(/drop policy if exists [^;]*/g) ?? [];
    for (const drop of drops) {
      expect(drop).not.toContain('owner_all');
      if (/ on (works|chapters|kb_nodes|profiles)\b/.test(drop)) {
        expect(drop).toMatch(/"(works|chapters)_public_read"/);
      }
    }
    expect(sql).not.toMatch(/(works|chapters|kb_nodes)_write_access_/);
  });
});
