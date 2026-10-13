import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Static (no DB connection) contract checks for the Reopen D-10 template migrations.
// Real PostgreSQL execution and re-run proof live in tests/kb/template-policy-migration.test.ts (02-13 gate).

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');
// core.autocrlf may turn LF into CRLF in the working tree; the SQL strips CR (replace(..., chr(13), '')).
const stripCr = (text: string) => text.replaceAll('\r', '');

const CATEGORIES = ['인물', '장소', '사건', '세력', '아이템'] as const;
const backfill = stripCr(read('supabase/migrations/0022_template_readonly_backfill.sql'));
const guards = stripCr(read('supabase/migrations/0023_template_policy_guards.sql'));
/** SQL without `--` comments, so contract checks are not satisfied by prose. */
const code = (sql: string) => sql.split('\n').map((line) => line.replace(/--.*$/, '')).join('\n');

function seedLiteral(category: string): string {
  const pattern = new RegExp(
    `\\('${category}', replace\\(chr\\(65279\\) \\|\\| \\$(\\w+)\\$([\\s\\S]*?)\\$\\1\\$, chr\\(13\\), ''\\)\\)`
  );
  const match = backfill.match(pattern);
  if (!match) throw new Error(`seed literal for ${category} not found in 0022`);
  return '﻿' + match[2];
}

describe('0022_template_readonly_backfill.sql canonical seed catalog', () => {
  it.each(CATEGORIES)('%s seed literal is byte-for-byte the docs/Template original (BOM, YAML, Templater kept)', (category) => {
    const original = stripCr(read(`docs/Template/${category} 템플릿.md`));
    expect(seedLiteral(category)).toBe(original);
  });

  it('keeps raw Templater placeholders exactly as written (no title substitution)', () => {
    expect(seedLiteral('인물')).toContain('<% tp.file.title %>');
    expect(seedLiteral('사건')).not.toContain('<% tp.file.title %>');
  });

  it('catalog and provenance tables are private (RLS on, no grants to anon/authenticated)', () => {
    const sql = code(backfill);
    expect(sql).toMatch(/create table if not exists kb_template_seed_catalog/);
    expect(sql).toMatch(/alter table kb_template_seed_catalog enable row level security;/);
    expect(sql).toMatch(/revoke all on table kb_template_seed_catalog from public, anon, authenticated;/);
    expect(sql).toMatch(/create table if not exists kb_template_backfill_copies \(\s*original_id uuid primary key references kb_nodes\(id\),\s*copy_id uuid not null unique references kb_nodes\(id\)/);
    expect(sql).toMatch(/alter table kb_template_backfill_copies enable row level security;/);
    expect(sql).toMatch(/revoke all on table kb_template_backfill_copies from public, anon, authenticated;/);
    expect(sql).not.toMatch(/grant\s+[^;]*kb_template_(seed_catalog|backfill_copies)/i);
  });

  it('runs inside one transaction under an exclusive table lock, and is re-run safe', () => {
    const sql = code(backfill).trim();
    expect(sql.startsWith('begin;')).toBe(true);
    expect(sql.endsWith('commit;')).toBe(true);
    expect(sql.indexOf('lock table kb_nodes in exclusive mode;')).toBeGreaterThan(sql.indexOf('begin;'));
    expect(sql).toMatch(/on conflict \(name\) do update/);
    // a second run never copies the same original twice
    expect(sql).toMatch(/exists \(select 1 from kb_template_backfill_copies where original_id = r\.id\)/);
    expect(sql).toMatch(/not exists \(\s*select 1 from kb_nodes existing/);
  });

  it('preserves edited defaults as an unlocked "{카테고리} 사본" in the same folder, then restores and locks the original', () => {
    const sql = code(backfill);
    const copyInsert = sql.indexOf("values (r.owner_id, r.work_id, r.scope, r.parent_id, 'file', 'template', false, v_name, r.content)");
    const provenance = sql.indexOf('insert into kb_template_backfill_copies (original_id, copy_id)');
    const restore = sql.indexOf('update kb_nodes set content = r.canonical, is_locked = true');
    expect(copyInsert).toBeGreaterThan(-1);
    expect(provenance).toBeGreaterThan(copyInsert);
    expect(restore).toBeGreaterThan(provenance);
    expect(sql).toContain("v_base := r.name || ' 사본';");
    expect(sql).toContain("v_name := v_base || ' ' || v_n;");
    // only the default candidate (name = its category folder) is treated as a default; moved/renamed files are not guessed
    expect(sql).toMatch(/and file\.name = folder\.name/);
    expect(sql).toMatch(/file\.deleted_at is null/);
  });

  it('never bypasses guards with disabled triggers or session settings', () => {
    const sql = code(backfill);
    expect(sql).not.toMatch(/disable trigger/i);
    expect(sql).not.toMatch(/set_config|current_setting|session_replication_role/i);
    expect(sql).not.toMatch(/\bprofiles\b/);
  });
});

describe('0023_template_policy_guards.sql name uniqueness and DB guards', () => {
  const sql = code(guards);

  it('runs inside one transaction under an exclusive table lock', () => {
    const trimmed = sql.trim();
    expect(trimmed.startsWith('begin;')).toBe(true);
    expect(trimmed.endsWith('commit;')).toBe(true);
    expect(sql).toContain('lock table kb_nodes in exclusive mode;');
  });

  it('adds an area-scoped (owner + work) unique index on trimmed template names, without parent or category in the key', () => {
    const index = sql.match(/create unique index if not exists kb_nodes_template_area_name_unique\s+on kb_nodes \(([^)]*\)[^)]*\)[^)]*)\)\s+where ([^;]+);/);
    expect(index).not.toBeNull();
    const [, key, predicate] = index!;
    expect(key.replace(/\s+/g, ' ')).toBe("owner_id, coalesce(work_id, '00000000-0000-0000-0000-000000000000'::uuid), btrim(name)");
    expect(key).not.toMatch(/parent_id|category/);
    expect(predicate.replace(/\s+/g, ' ').trim()).toBe("node_type = 'file' and category = 'template' and deleted_at is null");
  });

  it('resolves existing collisions deterministically before creating the index (keeps first by locked, created_at, id)', () => {
    expect(sql.indexOf('order by owner_id, coalesce(work_id, c_zero), is_locked desc, created_at, id'))
      .toBeLessThan(sql.indexOf('create unique index if not exists kb_nodes_template_area_name_unique'));
    expect(sql).toContain("v_name := v_key || ' (' || v_n || ')';");
    expect(sql).toMatch(/raise exception 'duplicate_default_templates/);
  });

  it('reserves the five default names and guards locked defaults, unlocks, deletes and spoofed parents', () => {
    expect(sql).toContain("c_reserved constant text[] := array['인물','장소','사건','세력','아이템'];");
    for (const code of ['locked_node_immutable', 'locked_template_immutable', 'invalid_template_seed',
      'template_name_reserved', 'template_parent_invalid', 'template_owner_invalid']) {
      expect(sql).toContain(`raise exception '${code}'`);
    }
    expect(sql).toMatch(/NEW\.is_locked is not true/);
    expect(sql).toMatch(/select content into v_canonical from kb_template_seed_catalog where name = v_parent\.name;/);
    expect(sql).toMatch(/v_uid uuid := auth\.uid\(\);/);
    expect(sql).toMatch(/create trigger kb_nodes_guard_template_policy before insert or update or delete on kb_nodes/);
  });

  it('the security-definer guard is trigger-only, pins search_path and is not executable by clients; no GUC bypass', () => {
    expect(sql).toMatch(/create or replace function guard_kb_template_policy\(\) returns trigger\s+language plpgsql security definer set search_path = public, pg_temp/);
    expect(sql).toMatch(/revoke all on function guard_kb_template_policy\(\) from public, anon, authenticated;/);
    // every security definer function in this file returns trigger (no callable RPC)
    const definers = [...sql.matchAll(/create or replace function (\w+)\(([^)]*)\) returns (\w+)\s+language plpgsql security definer/g)];
    expect(definers.length).toBeGreaterThan(0);
    expect(definers.every((m) => m[3] === 'trigger')).toBe(true);
    expect(sql).not.toMatch(/set_config|current_setting|session_replication_role|disable trigger/i);
    expect(sql).not.toMatch(/\bprofiles\b/);
    expect(sql).not.toMatch(/grant\s/i);
  });
});
