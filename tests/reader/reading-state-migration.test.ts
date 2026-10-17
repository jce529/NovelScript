import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

// Static (no DB connection) contract checks for 0024_chapter_reading_state.sql (03-11, READ-04).
// Real PostgreSQL application, RLS and RPC behaviour live in tests/reader/reading-state.database.test.ts
// and are executed only by the 03-19 checkpoint.

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8').replaceAll('\r', '');
/** SQL without `--` comments, so contract checks are not satisfied by prose. */
const code = (sql: string) => sql.split('\n').map((line) => line.replace(/--.*$/, '')).join('\n');

const MIGRATION = 'supabase/migrations/0024_chapter_reading_state.sql';
const raw = read(MIGRATION);
const sql = code(raw);

/** Body of `create or replace function <name>(...) ... $$ ... $$;` */
function fnBody(name: string): string {
  const match = sql.match(new RegExp(`create or replace function ${name}\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$;`));
  if (!match) throw new Error(`function ${name} not found in 0024`);
  return match[1];
}
function fnHeader(name: string): string {
  const match = sql.match(new RegExp(`create or replace function ${name}\\(([\\s\\S]*?)\\$\\$`));
  if (!match) throw new Error(`function ${name} not found in 0024`);
  return match[1];
}

describe('plain-text premise for chapters.char_count', () => {
  it('studio saves the Textarea string verbatim into chapters.content', () => {
    const actions = read('lib/chapters/actions.ts');
    expect(actions).toMatch(/export async function saveChapterContent/);
    expect(actions).toMatch(/from\('chapters'\)\.update\(\{ content, updated_at:/);
    const editor = read('app/studio/[workId]/chapters/[chapterId]/page.tsx');
    expect(editor).toMatch(/<Textarea[\s\S]*?onChange=\{\(e\) => onEdit\(e\.target\.value\)\}/);
    expect(editor).not.toMatch(/dangerouslySetInnerHTML|contentEditable|JSON\.stringify\(\s*editor/);
  });

  it('adds a whitespace-stripped stored generated char_count and never grants it', () => {
    expect(sql).toMatch(
      /alter table chapters add column if not exists char_count integer\s+generated always as \(char_length\(regexp_replace\(content, '\\s', '', 'g'\)\)\) stored;/
    );
    expect(sql).toMatch(/revoke select \(char_count\) on chapters from anon, authenticated;/);
    expect(sql).not.toMatch(/grant[^;]*char_count/i);
    expect(sql).not.toMatch(/grant[^;]*\bcontent\b/i);
    expect(sql).not.toMatch(/grant\s+select[^;]*on (table )?chapters\b/i);
  });
});

describe('0024 file placement and scope', () => {
  it('uses only the reserved 0024 number and runs in one transaction with a schema reload', () => {
    const files = readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.startsWith('0024_'));
    expect(files).toEqual(['0024_chapter_reading_state.sql']);
    expect(sql.trimStart().startsWith('begin;')).toBe(true);
    expect(sql).toMatch(/notify pgrst, 'reload schema';\s*commit;\s*$/);
  });

  it('does not touch profiles, existing functions or the original 0008 guard list', () => {
    expect(sql).not.toMatch(/alter table profiles/i);
    for (const existing of [
      'can_view', 'read_chapter_content', 'get_chapter_access_state', 'list_chapter_access',
      'user_can_write', 'current_user_can_write', 'increment_chapter_view', 'chapter_entitled',
    ]) {
      expect(sql).not.toMatch(new RegExp(`create (or replace )?function ${existing}\\(`));
      expect(sql).not.toMatch(new RegExp(`drop function[^;]*\\b${existing}\\b`));
    }
    expect(read('supabase/migrations/0008_sanction_enforcement.sql')).not.toMatch(/chapter_reading_state/);
    expect(read('supabase/migrations/0003_reader.sql')).not.toMatch(/chapter_reading_state/);
  });
});

describe('chapter_reading_state table', () => {
  const table = sql.match(/create table if not exists chapter_reading_state \(([\s\S]*?)\n\);/)?.[1] ?? '';

  it('has the (user_id, chapter_id) key, work FK and chapter/work pairing', () => {
    expect(table).toMatch(/user_id uuid not null references profiles\(id\)/);
    expect(table).toMatch(/work_id uuid not null references works\(id\)/);
    expect(table).toMatch(/primary key \(user_id, chapter_id\)/);
    expect(table).toMatch(/foreign key \(chapter_id, work_id\) references chapters\(id, work_id\)/);
  });

  it('declares the position, active-time and session bookkeeping columns with bounds', () => {
    expect(table).toMatch(/opened_at timestamptz not null default now\(\)/);
    expect(table).toMatch(/last_seen_at timestamptz not null default now\(\)/);
    expect(table).toMatch(/scroll_ratio numeric\(5,4\) not null default 0 check \(scroll_ratio between 0 and 1\)/);
    expect(table).toMatch(/max_scroll_ratio numeric\(5,4\) not null default 0 check \(max_scroll_ratio between 0 and 1\)/);
    expect(table).toMatch(/active_ms bigint not null default 0 check \(active_ms >= 0\)/);
    expect(table).toMatch(/completed_at timestamptz,/);
    expect(table).toMatch(/session_id uuid not null/);
    expect(table).toMatch(/session_started_at timestamptz not null/);
    expect(table).toMatch(/session_active_ms bigint not null default 0 check \(session_active_ms >= 0\)/);
    expect(table).toMatch(/last_sequence bigint not null default 0 check \(last_sequence >= 0\)/);
    expect(table).toMatch(/end_visible_ms integer not null default 0 check \(end_visible_ms >= 0\)/);
  });

  it('is owner-SELECT only: RLS on, no permissive write policy, DML revoked', () => {
    expect(sql).toMatch(/alter table chapter_reading_state enable row level security;/);
    expect(sql).toMatch(
      /create policy chapter_reading_state_owner_select on chapter_reading_state for select\s+to authenticated using \(user_id = auth\.uid\(\)\);/
    );
    const policies = [...sql.matchAll(/create policy (\w+) on chapter_reading_state\s+([^;]*);/g)];
    for (const [, name, rest] of policies) {
      if (name === 'chapter_reading_state_owner_select') continue;
      expect(rest, name).toMatch(/^as restrictive for (insert|update|delete)/);
    }
    expect(sql).not.toMatch(/for (all|insert|update|delete)[^;]*user_id = auth\.uid\(\)/);
    expect(sql).toMatch(/revoke all on table chapter_reading_state from public, anon, authenticated;/);
    expect(sql).toMatch(/grant select on table chapter_reading_state to authenticated;/);
    expect(sql).not.toMatch(/grant[^;]*(insert|update|delete|all)[^;]*on (table )?chapter_reading_state/i);
    expect(sql).not.toMatch(/grant[^;]*on (table )?chapter_reading_state to[^;]*anon/i);
  });

  it('adds the three 0008-style restrictive guards for the new table only', () => {
    expect(sql).toMatch(/chapter_reading_state_write_access_insert on chapter_reading_state\s+as restrictive for insert with check \(current_user_can_write\(\)\)/);
    expect(sql).toMatch(/chapter_reading_state_write_access_update on chapter_reading_state\s+as restrictive for update using \(current_user_can_write\(\)\) with check \(current_user_can_write\(\)\)/);
    expect(sql).toMatch(/chapter_reading_state_write_access_delete on chapter_reading_state\s+as restrictive for delete using \(current_user_can_write\(\)\)/);
    const guarded = [...sql.matchAll(/as restrictive for \w+/g)];
    expect(guarded).toHaveLength(3);
    expect(sql).not.toMatch(/create policy \w+ on (?!chapter_reading_state)\w+/);
  });
});

describe('RPC contract', () => {
  it('open/save have the interface signatures, SECURITY DEFINER and a fixed search_path', () => {
    expect(fnHeader('open_chapter_reading')).toMatch(/^p_work_id uuid, p_chapter_id uuid, p_session_id uuid\)\s+returns jsonb\s+language plpgsql security definer set search_path = public as/);
    expect(fnHeader('save_chapter_reading')).toMatch(
      /^\s*p_work_id uuid, p_chapter_id uuid, p_session_id uuid, p_sequence bigint,\s+p_scroll_ratio numeric, p_session_active_ms bigint, p_end_visible_ms integer\)\s+returns jsonb\s+language plpgsql security definer set search_path = public as/
    );
    expect(fnHeader('assert_chapter_reading_access')).toMatch(/security definer set search_path = public/);
  });

  it('execute is revoked from PUBLIC/anon and granted to authenticated only', () => {
    const sigs = 'open_chapter_reading\\(uuid, uuid, uuid\\),\\s+save_chapter_reading\\(uuid, uuid, uuid, bigint, numeric, bigint, integer\\)';
    expect(sql).toMatch(new RegExp(`revoke all on function ${sigs}\\s+from public, anon, authenticated, service_role;`));
    expect(sql).toMatch(new RegExp(`grant execute on function ${sigs}\\s+to authenticated;`));
    const grants = [...sql.matchAll(/grant execute on function ([^;]*);/g)].map((m) => m[1]);
    expect(grants).toHaveLength(1);
    expect(grants[0]).not.toMatch(/anon|public|service_role/);
    expect(sql).toMatch(/revoke all on function chapter_reading_snapshot\(chapter_reading_state\)\s+from public, anon, authenticated, service_role;/);
    expect(sql).toMatch(/revoke all on function assert_chapter_reading_access\(uuid, uuid\)\s+from public, anon, authenticated, service_role;/);
  });

  it('shared gate: auth.uid, non-deleted profile lock, write access, real work pairing, existing access state', () => {
    const gate = fnBody('assert_chapter_reading_access');
    const order = [
      /v_user uuid := auth\.uid\(\);/,
      /if v_user is null then raise exception 'authentication_required'/,
      /from profiles where id = v_user and deleted_at is null for share;/,
      /if not user_can_write\(v_user\) then raise exception 'write_access_denied'/,
      /where c\.id = p_chapter_id and w\.id = p_work_id\s+for share of c, w;/,
      /get_chapter_access_state\(p_work_id, p_chapter_id\)->>'state' is distinct from 'readable'/,
    ].map((re) => gate.search(re));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const open = fnBody('open_chapter_reading');
    const save = fnBody('save_chapter_reading');
    expect(open).toMatch(/v_user := assert_chapter_reading_access\(p_work_id, p_chapter_id\);/);
    expect(save).toMatch(/v_user := assert_chapter_reading_access\(p_work_id, p_chapter_id\);/);
  });

  it('open: keeps first opened_at, resets only for a new session, moves the pointer in the same call', () => {
    const open = fnBody('open_chapter_reading');
    const conflict = open.match(/on conflict \(user_id, chapter_id\) do update set([\s\S]*?)returning \* into v_row;/)?.[1] ?? '';
    expect(conflict).not.toMatch(/opened_at/);
    expect(conflict).toMatch(/session_started_at = case when s\.session_id = excluded\.session_id\s+then s\.session_started_at else now\(\) end/);
    expect(conflict).toMatch(/session_active_ms = case when s\.session_id = excluded\.session_id\s+then s\.session_active_ms else 0 end/);
    expect(conflict).toMatch(/last_sequence = case when s\.session_id = excluded\.session_id\s+then s\.last_sequence else 0 end/);
    expect(conflict).not.toMatch(/\bactive_ms = |scroll_ratio|completed_at/);
    expect(open).toMatch(/insert into reading_progress \(user_id, work_id, chapter_id, updated_at\)[\s\S]*on conflict \(user_id, work_id\) do update set\s+chapter_id = excluded\.chapter_id/);
  });

  it('save: session match + strictly larger sequence, monotonic session time, elapsed+5000ms cap', () => {
    const save = fnBody('save_chapter_reading');
    expect(save).toMatch(/if v_row\.session_id is distinct from p_session_id or p_sequence <= v_row\.last_sequence then\s+return chapter_reading_snapshot\(v_row\);/);
    expect(save).toMatch(/if p_session_active_ms < v_row\.session_active_ms then\s+return chapter_reading_snapshot\(v_row\);/);
    expect(save).toMatch(/v_limit_ms := floor\(extract\(epoch from \(now\(\) - v_row\.session_started_at\)\) \* 1000\)::bigint \+ 5000;/);
    expect(save).toMatch(/if p_session_active_ms > v_limit_ms then raise exception 'active_time_exceeds_elapsed'/);
    expect(save).toMatch(/scroll_ratio = v_ratio,/);
    expect(save).toMatch(/max_scroll_ratio = greatest\(max_scroll_ratio, v_ratio\)/);
    expect(save).toMatch(/active_ms = active_ms \+ greatest\(p_session_active_ms - session_active_ms, 0\)/);
    expect(save).toMatch(/when p_end_visible_ms is not null and p_end_visible_ms >= 0 and p_end_visible_ms <= v_limit_ms/);
    expect(save).toMatch(/for update;\s+if not found then\s+return jsonb_build_object\(/);
  });

  it('save never moves reading_progress; neither RPC writes completed_at', () => {
    expect(fnBody('save_chapter_reading')).not.toMatch(/reading_progress/);
    for (const name of ['open_chapter_reading', 'save_chapter_reading']) {
      expect(fnBody(name)).not.toMatch(/completed_at\s*=/);
    }
    expect(sql).not.toMatch(/complete_chapter/);
  });

  it('snapshot keys match the ChapterReadingState DTO and leak no user id or char count', () => {
    const snap = fnBody('chapter_reading_snapshot');
    for (const key of ['chapterId', 'workId', 'scrollRatio', 'maxScrollRatio', 'activeMs', 'completedAt',
      'sessionId', 'sessionActiveMs', 'lastSequence']) {
      expect(snap).toContain(`'${key}'`);
    }
    expect(snap).not.toMatch(/user_id|userId|char_count|charCount/);
    // RPC inputs carry neither a user id, a completion timestamp nor a char count.
    for (const name of ['open_chapter_reading', 'save_chapter_reading']) {
      expect(fnHeader(name)).not.toMatch(/p_user|p_completed|p_char/);
    }
  });
});
