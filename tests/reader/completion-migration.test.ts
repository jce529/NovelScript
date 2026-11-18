import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
  ACTIVE_TIME_SLACK_MS,
  COMPLETION_SCROLL_RATIO,
  END_SENTINEL_VISIBLE_MS,
  MINIMUM_READING_FLOOR_MS,
  MINIMUM_READING_RATIO,
  MIN_SAMPLE_READERS,
  READING_CHARS_PER_MINUTE,
  minimumReadingMs,
} from '../../lib/reader/completion';

// Static (no DB connection) contract checks for 0053_reader_completion_config.sql (26-01, RDATA-02).
// Real PostgreSQL behaviour lives in tests/reader/completion.database.test.ts (manual gate only).

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8').replaceAll('\r', '');
/** SQL without `--` comments, so contract checks are not satisfied by prose. */
const code = (sql: string) => sql.split('\n').map((line) => line.replace(/--.*$/, '')).join('\n');

const MIGRATION = 'supabase/migrations/0053_reader_completion_config.sql';
const sql = code(read(MIGRATION));

function fnBody(name: string): string {
  const match = sql.match(new RegExp(`create or replace function ${name}\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$;`));
  if (!match) throw new Error(`function ${name} not found in 0053`);
  return match[1];
}
function fnHeader(name: string): string {
  const match = sql.match(new RegExp(`create or replace function ${name}\\(([\\s\\S]*?)\\$\\$`));
  if (!match) throw new Error(`function ${name} not found in 0053`);
  return match[1];
}

/**
 * Evaluates the SQL minimum-time expression in JS with exact integer (BigInt) arithmetic so the
 * fixture comparison does not depend on float rounding. Mirrors
 * greatest(F, ceil(greatest(coalesce(c, 0), 0)::numeric * 60000 * R / CPM))::bigint.
 */
function sqlMinimumReadingMs(chars: number, floor: number, ratio: number, cpm: number): number {
  // ratio is a decimal literal like 0.5 -> scale it to an integer fraction.
  const scale = 10_000;
  const num = BigInt(Math.max(chars, 0)) * BigInt(60_000) * BigInt(Math.round(ratio * scale));
  const den = BigInt(cpm) * BigInt(scale);
  const ceil = (num + den - BigInt(1)) / den;
  return Math.max(floor, Number(ceil));
}

describe('0053 file placement and scope', () => {
  it('uses only the reserved 0053 number, one transaction, schema reload', () => {
    const files = readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.startsWith('0053_'));
    expect(files).toEqual(['0053_reader_completion_config.sql']);
    expect(sql.trimStart().startsWith('begin;')).toBe(true);
    expect(sql).toMatch(/notify pgrst, 'reload schema';\s*commit;\s*$/);
  });

  it('adds no table, column, policy or profiles change and replaces no 0024/0039/0052 helper function', () => {
    expect(sql).not.toMatch(/create table|alter table|create policy|drop policy|create (materialized )?view/i);
    for (const existing of [
      'open_chapter_reading', 'save_chapter_reading', 'assert_chapter_reading_access', 'chapter_reading_snapshot',
      'get_chapter_access_state', 'user_can_write', 'current_user_can_write', 'can_view', 'read_chapter_content',
      'user_is_verified', 'mcp_reject_oauth_caller',
    ]) {
      expect(sql).not.toMatch(new RegExp(`create (or replace )?function (public\\.)?${existing}\\(`));
      expect(sql).not.toMatch(new RegExp(`drop function[^;]*\\b${existing}\\b`));
    }
    // No metric/ranking aggregation RPC in 26-01 (reserved for 26-02).
    expect(sql).not.toMatch(/work_reading_metrics|work_chapter_metrics|chapter_dropoff/i);
  });

  it('never grants direct table writes or char_count', () => {
    expect(sql).not.toMatch(/grant[^;]*on (table )?chapter_reading_state/i);
    expect(sql).not.toMatch(/grant[^;]*char_count/i);
    expect(sql).not.toMatch(/grant[^;]*on (table )?chapters\b/i);
  });
});

describe('reading_completion_config() single source of truth and SQL minimum reading time parity', () => {
  const cfgBody = fnBody('reading_completion_config');
  const cfgMatch = cfgBody.match(
    /select\s+(\d+)::integer,\s*([\d.]+)::numeric,\s*(\d+)::bigint,\s*([\d.]+)::numeric,\s*(\d+)::integer,\s*(\d+)::bigint,\s*(\d+)::integer;/
  );
  const helper = fnBody('chapter_minimum_reading_ms');

  it('defines reading_completion_config() with the documented output columns and STABLE SQL signature', () => {
    expect(cfgMatch, cfgBody).not.toBeNull();
    expect(fnHeader('reading_completion_config')).toMatch(
      /out chars_per_minute integer,\s*out minimum_reading_ratio numeric,\s*out minimum_reading_floor_ms bigint,\s*out completion_scroll_ratio numeric,\s*out end_sentinel_visible_ms integer,\s*out active_time_slack_ms bigint,\s*out min_sample_readers integer\s*\) returns record\s+language sql stable set search_path = public as/
    );
  });

  it('pins all reading_completion_config() values to match lib/reader/completion.ts', () => {
    const [, cpm, ratio, floor, scrollRatio, endVisibleMs, slackMs, minSampleReaders] = cfgMatch!;
    expect(Number(cpm)).toBe(READING_CHARS_PER_MINUTE);
    expect(Number(ratio)).toBe(MINIMUM_READING_RATIO);
    expect(Number(floor)).toBe(MINIMUM_READING_FLOOR_MS);
    expect(Number(scrollRatio)).toBe(COMPLETION_SCROLL_RATIO);
    expect(Number(endVisibleMs)).toBe(END_SENTINEL_VISIBLE_MS);
    expect(Number(slackMs)).toBe(ACTIVE_TIME_SLACK_MS);
    expect(Number(minSampleReaders)).toBe(MIN_SAMPLE_READERS);
  });

  it('has chapter_minimum_reading_ms read from reading_completion_config() with exact numeric arithmetic', () => {
    expect(fnHeader('chapter_minimum_reading_ms')).toMatch(
      /^p_char_count integer\) returns bigint\s+language sql stable set search_path = public as/
    );
    expect(helper).toMatch(
      /select greatest\(\s*cfg\.minimum_reading_floor_ms,\s*ceil\(\s*greatest\(coalesce\(p_char_count, 0\), 0\)::numeric\s*\*\s*60000\s*\*\s*cfg\.minimum_reading_ratio\s*\/\s*cfg\.chars_per_minute\s*\)\s*\)::bigint\s+from reading_completion_config\(\) cfg;/
    );
    expect(helper).not.toMatch(/1200|30000|0\.5/);
  });

  it.each([0, 1, 1199, 1200, 1201, 2400, 4999, 5000, 5001, 10_000, 123_457])(
    'fixture %i chars: SQL == unit',
    (chars) => {
      const [, cpm, ratio, floor] = cfgMatch!;
      expect(sqlMinimumReadingMs(chars, Number(floor), Number(ratio), Number(cpm))).toBe(minimumReadingMs(chars));
    }
  );

  it('fixture anchors: 5000 -> 125000, 10000 -> 250000, empty -> 30000', () => {
    const [, cpm, ratio, floor] = cfgMatch!;
    const f = (c: number) => sqlMinimumReadingMs(c, Number(floor), Number(ratio), Number(cpm));
    expect([f(5000), f(10_000), f(0)]).toEqual([125_000, 250_000, 30_000]);
  });

  it('both reading_completion_config() and chapter_minimum_reading_ms(integer) are internal (no execute for any API role)', () => {
    expect(sql).toMatch(/revoke all on function reading_completion_config\(\)\s+from public, anon, authenticated, service_role;/);
    expect(sql).toMatch(/revoke all on function chapter_minimum_reading_ms\(integer\)\s+from public, anon, authenticated, service_role;/);
  });
});

describe('complete_chapter RPC contract', () => {
  it('signature: (work, chapter, session) -> jsonb, SECURITY DEFINER, fixed search_path', () => {
    expect(fnHeader('complete_chapter')).toMatch(
      /^p_work_id uuid, p_chapter_id uuid, p_session_id uuid\)\s+returns jsonb\s+language plpgsql security definer set search_path = public as/
    );
  });

  it('accepts no caller-supplied active time, char count, completion time or user id', () => {
    expect(fnHeader('complete_chapter')).not.toMatch(/p_active|p_char|p_completed|p_user|p_scroll|p_end/);
  });

  it('execute: revoked from PUBLIC/anon/service_role, granted to authenticated only', () => {
    expect(sql).toMatch(/revoke all on function complete_chapter\(uuid, uuid, uuid\)\s+from public, anon, authenticated, service_role;/);
    const grants = [...sql.matchAll(/grant execute on function ([^;]*);/g)].map((g) => g[1]);
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatch(/^complete_chapter\(uuid, uuid, uuid\)\s+to authenticated$/);
  });

  const body = fnBody('complete_chapter');

  it('pins perform public.mcp_reject_oauth_caller() as the very first executable statement in begin..end', () => {
    const afterBegin = body.split(/\bbegin\b/)[1] ?? '';
    expect(afterBegin.trimStart().startsWith('perform public.mcp_reject_oauth_caller();')).toBe(true);
  });

  it('preserves the 0052 user_is_verified(v_user) gate that skips completion recording for unverified accounts', () => {
    expect(body).toMatch(
      /if not public\.user_is_verified\(v_user\) then\s+return chapter_reading_snapshot\(v_row\);\s+end if;/
    );
  });

  it('runs OAuth guard first, then shared 0024 gate, char_count read, row lock, verified gate, and config read in order', () => {
    const order = [
      /perform public\.mcp_reject_oauth_caller\(\);/,
      /v_user := assert_chapter_reading_access\(p_work_id, p_chapter_id\);/,
      /if p_session_id is null then raise exception 'invalid_input'/,
      /select c\.char_count into v_char_count from chapters c\s+where c\.id = p_chapter_id and c\.work_id = p_work_id;/,
      /from chapter_reading_state\s+where user_id = v_user and chapter_id = p_chapter_id\s+for update;/,
      /if not public\.user_is_verified\(v_user\) then\s+return chapter_reading_snapshot\(v_row\);\s+end if;/,
      /select \* into v_cfg from reading_completion_config\(\);/,
    ].map((re) => body.search(re));
    expect(order.every((i) => i >= 0), String(order)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('missing row -> zero snapshot; already complete or other session -> unchanged snapshot', () => {
    expect(body).toMatch(/for update;\s+if not found then\s+return jsonb_build_object\([\s\S]*?'sessionId', null/);
    expect(body).toMatch(
      /if v_row\.completed_at is not null or v_row\.session_id is distinct from p_session_id then\s+return chapter_reading_snapshot\(v_row\);/
    );
  });

  it('judges only stored values against reading_completion_config() boundaries (inclusive, no hardcoded literals)', () => {
    expect(body).toMatch(/select \* into v_cfg from reading_completion_config\(\);/);
    expect(body).toMatch(
      /v_limit_ms := floor\(extract\(epoch from \(now\(\) - v_row\.session_started_at\)\) \* 1000\)::bigint \+ v_cfg\.active_time_slack_ms;/
    );
    expect(body).toMatch(/v_row\.max_scroll_ratio >= v_cfg\.completion_scroll_ratio\b/);
    expect(body).toMatch(/v_row\.end_visible_ms >= v_cfg\.end_sentinel_visible_ms\b/);
    expect(body).toMatch(/v_row\.active_ms >= chapter_minimum_reading_ms\(v_char_count\)/);
    expect(body).toMatch(/v_row\.session_active_ms <= v_limit_ms/);
    expect(body).not.toMatch(/0\.98|5000|1200|30000/);
  });

  it('writes only completed_at = coalesce(completed_at, now()) and never touches active time', () => {
    const update = body.match(/update chapter_reading_state set([\s\S]*?)where/)?.[1] ?? '';
    expect(update).toMatch(/completed_at = coalesce\(completed_at, now\(\)\)/);
    expect(update).not.toMatch(/active_ms|scroll_ratio|end_visible_ms|last_sequence|session_/);
    expect([...body.matchAll(/update chapter_reading_state/g)]).toHaveLength(1);
    expect(body).not.toMatch(/insert into|reading_progress|delete from|profiles/);
  });

  it('returns the ChapterReadingState snapshot (no user id / char count leak)', () => {
    expect(body).toMatch(/return chapter_reading_snapshot\(v_row\);\s*end;\s*$/);
    expect(body).not.toMatch(/'userId'|'charCount'/);
  });
});

