import postgres from 'postgres';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// 07-08 Task 1: list_report_groups_all, list_sanction_users, get_user_sanction_history (0029).
//
// Real PostgreSQL, isolated schema and outer rollback (operations.database.test.ts harness).
// SQL files are read at module load so `vitest list` proves they exist and are non-empty
// without opening a connection; the connection and migration replay happen in beforeAll only.
const MIGRATIONS = ['0001_init.sql', '0002_studio.sql', '0003_reader.sql', '0004_kb_custom_folders.sql',
  '0005_commerce.sql', '0006_admin_foundation.sql', '0007_admin_operations.sql',
  '0008_sanction_enforcement.sql', '0009_blind_access.sql', '0029_admin_blueprint_completion.sql'] as const;
const MIGRATION_SQL = MIGRATIONS.map((file) => {
  const text = readFileSync(`supabase/migrations/${file}`, 'utf8');
  assert.ok(text.trim().length > 0, `${file} is empty`);
  return { file, text };
});

describe.skipIf(!process.env.SUPABASE_DB_URL)('admin blueprint queries (PostgreSQL)', () => {
  let sql: postgres.Sql;
  const schema = `admin_bp_q_${crypto.randomUUID().replaceAll('-', '')}`;
  const exec = (text: string) => sql.unsafe(text);
  const query = (text: string, params: unknown[] = []) =>
    sql.unsafe(text, params as postgres.ParameterOrJSON<never>[]);

  const writer = '10000000-0000-4000-8000-000000000001';
  const reader = '10000000-0000-4000-8000-000000000002';
  const admin = '10000000-0000-4000-8000-000000000003';
  const reader2 = '10000000-0000-4000-8000-000000000004';
  const outsider = '10000000-0000-4000-8000-000000000005';
  const work = '20000000-0000-4000-8000-000000000001';
  const work2 = '20000000-0000-4000-8000-000000000002';
  const chapter = '30000000-0000-4000-8000-000000000001';
  const chapter2 = '30000000-0000-4000-8000-000000000002';

  async function scalar<T>(text: string, params: unknown[] = []): Promise<T> {
    const rows = await query(text, params);
    return Object.values(rows[0] as object)[0] as T;
  }
  async function as(id: string, role: 'authenticated' | 'anon' | 'service_role' = 'authenticated') {
    await exec('reset role');
    await query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    await exec(`set role ${role}`);
  }
  const asOwner = () => exec('reset role');
  async function rejected(action: () => Promise<unknown>, message: string) {
    await exec('savepoint expected_failure');
    await expect(action()).rejects.toThrow(message);
    await exec('rollback to savepoint expected_failure');
  }
  async function report(reporter: string, workId: string, chapterId: string | null, status = 'open', at?: string) {
    await asOwner();
    return scalar<string>(
      `insert into reports(reporter_id, work_id, chapter_id, reason_category, status, created_at)
       values ($1, $2, $3, '기타', $4, coalesce($5::timestamptz, now())) returning id`,
      [reporter, workId, chapterId, status, at ?? null]);
  }
  /** Writes one sanction through the real audited path (audit row + apply_user_sanction). */
  async function sanction(userId: string, kind: string, endsAt: string | null = null, at?: string) {
    await asOwner();
    const type = { warning: 'user_warn', suspension: 'user_suspend',
      permanent_suspension: 'user_permanent_suspend', lift: 'user_sanction_lift' }[kind]!;
    const action = await scalar<string>(`insert into admin_actions(actor_id, action_type, target_user_id, reason, public_reason)
      values ($1, $2, $3, 'internal', 'public') returning id`, [admin, type, userId]);
    const id = await scalar<string>("select apply_user_sanction($1, $2, $3, 'public', 'internal note', $4::timestamptz, $5)",
      [admin, userId, kind, endsAt, action]);
    if (at) {
      // created_at defaults to the (constant) outer-transaction now(); spread events for ordering checks.
      await exec('alter table user_sanctions disable trigger user_sanctions_append_only');
      await query('update user_sanctions set created_at = $2::timestamptz where id = $1', [id, at]);
      await exec('alter table user_sanctions enable trigger user_sanctions_append_only');
    }
    return id;
  }

  beforeAll(async () => {
    sql = postgres(process.env.SUPABASE_DB_URL!, { max: 1, prepare: false });
    await exec(`
      begin;
      create schema ${schema};
      set search_path = ${schema}, public;
      create table ${schema}.test_users(id uuid primary key);
      grant usage on schema ${schema} to anon, authenticated, service_role;
      alter default privileges in schema ${schema} grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema ${schema} grant all on sequences to anon, authenticated, service_role;
      alter default privileges in schema ${schema} grant execute on functions to anon, authenticated, service_role;
    `);
    for (const { text } of MIGRATION_SQL) {
      await exec(text
        .replace('create extension if not exists "pgcrypto";', '')
        .replaceAll('auth.users', `${schema}.test_users`)
        .replaceAll('search_path = public', `search_path = ${schema}, public`)
        .replace(/^begin;|^commit;/gm, '')
        .replace(/^notify pgrst.*$/gm, ''));
    }
  }, 120_000);
  afterAll(async () => {
    if (!sql) return;
    try { await exec('rollback'); } finally { await sql.end(); }
  });
  beforeEach(async () => {
    await exec('savepoint fixture');
    await query('insert into test_users(id) values ($1),($2),($3),($4),($5)', [writer, reader, admin, reader2, outsider]);
    await query("update profiles set role = 'writer', pen_name = 'Writer' where id = $1", [writer]);
    await query("update profiles set pen_name = 'Reader' where id = $1", [reader]);
    await query("insert into works(id, owner_id, title) values ($1, $2, 'Work'), ($3, $2, 'Second')", [work, writer, work2]);
    await query(`insert into chapters(id, work_id, title, content, order_index, is_published)
      values ($1, $2, 'One', 'body', 0, true), ($3, $2, 'Two', 'body', 1, true)`, [chapter, work, chapter2]);
    await query("select grant_admin($1, 'test grant', 'vitest')", [admin]);
  });
  afterEach(async () => { await exec('rollback to savepoint fixture; reset role'); });

  it('denies the new admin reads to browser roles and keeps internal notes out of their reach', async () => {
    const calls: [string, unknown[]][] = [
      ['select * from list_report_groups_all(25, 0)', []],
      ['select * from list_sanction_users(25, 0)', []],
      ['select * from get_user_sanction_history($1, 25, 0)', [writer]],
      ["select sanction_effective_kind('none', null)", []],
    ];
    for (const role of ['anon', 'authenticated'] as const) {
      await as(admin, role);
      for (const [text, params] of calls) await rejected(() => query(text, params), 'permission denied');
    }
    await as(admin, 'service_role');
    await rejected(() => query("select sanction_effective_kind('none', null)"), 'permission denied');
    expect(await query('select * from list_sanction_users(25, 0)')).toEqual([]);

    // The recipient still reads only the 0006 column grant (no internal_note).
    await sanction(writer, 'warning');
    await as(writer);
    await rejected(() => query('select internal_note from user_sanctions'), 'permission denied');
    expect((await query('select kind from user_sanctions')).map((r) => r.kind)).toEqual(['warning']);
  });

  it('groups every status of one target into a single "all" group with statuses, oldest first', async () => {
    const base = Date.parse('2026-01-01T00:00:00Z');
    const at = (minutes: number) => new Date(base + minutes * 60_000).toISOString();
    const a1 = await report(reader, work, chapter, 'resolved', at(5));
    await report(reader2, work, chapter, 'open', at(20));
    await report(outsider, work, chapter, 'dismissed', at(30));
    const b1 = await report(reader, work, null, 'dismissed', at(1));
    await report(reader, work2, null, 'open', at(3));

    await as(admin, 'service_role');
    const all = await query('select * from list_report_groups_all(25, 0)');
    expect(all.map((g) => [g.work_id, g.chapter_id])).toEqual([[work, null], [work2, null], [work, chapter]]);
    expect(all[2]).toMatchObject({ report_count: 3, reporter_count: 3, anchor_report_id: a1, total_groups: 3,
      statuses: ['dismissed', 'open', 'resolved'], work_title: 'Work', chapter_title: 'One', blinded: false });
    expect(all[0]).toMatchObject({ anchor_report_id: b1, statuses: ['dismissed'], chapter_title: null });

    // Existing per-status RPC is unchanged: no status array and 'all' is still invalid.
    const open = await query("select * from list_report_groups('open', 25, 0)");
    expect(open.map((g) => g.work_id)).toEqual([work2, work]);
    expect(open[0]).not.toHaveProperty('statuses');
    await rejected(() => query("select * from list_report_groups('all', 25, 0)"), 'invalid_status');
    await rejected(() => query('select * from list_report_groups_all(0, 0)'), 'invalid_page');
    await rejected(() => query('select * from list_report_groups_all(25, -1)'), 'invalid_page');
  });

  it('pages 25 target groups without splitting a group and with a stable tie-break', async () => {
    await asOwner();
    // 26 work-level targets with identical timestamps (tie-break on work_id) + one multi-report group.
    const works = Array.from({ length: 26 }, (_, i) => `21000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    for (const id of works) {
      await query("insert into works(id, owner_id, title) values ($1, $2, 'Bulk')", [id, writer]);
      await report(reader, id, null, 'open', '2026-02-01T00:00:00Z');
    }
    await report(reader2, works[25], null, 'resolved', '2026-02-02T00:00:00Z');
    await as(admin, 'service_role');
    const page1 = await query('select * from list_report_groups_all(25, 0)');
    const page2 = await query('select * from list_report_groups_all(25, 25)');
    expect(page1.length).toBe(25);
    expect(page2.length).toBe(1);
    expect([...page1, ...page2].map((g) => g.work_id)).toEqual([...works].sort());
    expect(page2[0]).toMatchObject({ report_count: 2, statuses: ['open', 'resolved'], total_groups: 26 });
  });

  it('lists readers and writers with sanctions, including warning-only users, using DB time', async () => {
    await asOwner();
    const now = await scalar<string>('select now()::text');
    await sanction(reader2, 'warning', null, '2026-03-01T00:00:00Z');
    await sanction(writer, 'suspension', await scalar<string>("select (now() + interval '7 days')::text"));
    await sanction(reader, 'permanent_suspension');

    await as(admin, 'service_role');
    const users = await query('select * from list_sanction_users(25, 0)');
    expect(users.map((u) => [u.user_id, u.role, u.effective_kind])).toEqual([
      [reader, 'reader', 'permanent_suspension'],
      [writer, 'writer', 'suspension'],
      [reader2, 'reader', 'none'],
    ]);
    expect(users[1].sanctioned_until).not.toBeNull();
    expect(users[0]).toMatchObject({ pen_name: 'Reader', sanctioned_until: null, total_users: 3 });
    expect(users.every((u) => typeof u.expected_seq === 'string')).toBe(true);

    // A suspension whose end is exactly DB now() is already over (0008 D-08 rule).
    await asOwner();
    await exec('alter table profiles disable trigger profiles_sanction_cache_guard');
    await query('update profiles set sanctioned_until = $2::timestamptz where id = $1', [writer, now]);
    await exec('alter table profiles enable trigger profiles_sanction_cache_guard');
    await as(admin, 'service_role');
    const [expired] = await query('select * from list_sanction_users(25, 0) where user_id = $1', [writer]);
    expect(expired).toMatchObject({ effective_kind: 'none', sanctioned_until: null });
    // Users without any sanction row are not listed.
    expect(users.map((u) => u.user_id)).not.toContain(outsider);
  });

  it('pages sanction users 25 at a time ordered by latest seq desc then user_id', async () => {
    await asOwner();
    const ids = Array.from({ length: 26 }, (_, i) => `11000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    for (const id of ids) {
      await query('insert into test_users(id) values ($1)', [id]);
      await sanction(id, 'warning');
    }
    await as(admin, 'service_role');
    const page1 = await query('select * from list_sanction_users(25, 0)');
    const page2 = await query('select * from list_sanction_users(25, 25)');
    expect(page1.length).toBe(25);
    expect(page2.length).toBe(1);
    expect([...page1, ...page2].map((u) => u.user_id)).toEqual([...ids].reverse());
    expect(page2[0]).toMatchObject({ total_users: 26 });
    await rejected(() => query('select * from list_sanction_users(102, 0)'), 'invalid_page');
  });

  it('returns the full timeline newest first with internal notes, audit metadata and paging', async () => {
    await sanction(writer, 'warning');
    await sanction(writer, 'suspension', await scalar<string>("select (now() + interval '1 day')::text"));
    await sanction(writer, 'lift');
    await as(admin, 'service_role');
    const history = await query('select * from get_user_sanction_history($1, 25, 0)', [writer]);
    expect(history.map((h) => h.kind)).toEqual(['lift', 'suspension', 'warning']);
    expect(history[0]).toMatchObject({ internal_note: 'internal note', public_reason: 'public', actor_id: admin,
      total_events: 3, metadata: {} });
    expect(typeof history[0].seq).toBe('string');
    const [user] = await query('select * from list_sanction_users(25, 0)');
    expect(user).toMatchObject({ user_id: writer, effective_kind: 'none', expected_seq: history[0].seq });

    const page = await query('select * from get_user_sanction_history($1, 2, 2)', [writer]);
    expect(page.map((h) => h.kind)).toEqual(['warning']);
    expect(await query('select * from get_user_sanction_history($1, 25, 0)', [outsider])).toEqual([]);
    await rejected(() => query('select * from get_user_sanction_history(null, 25, 0)'), 'invalid_arguments');
  });

  it('returns expected_seq as SQL text that preserves a seq above Number.MAX_SAFE_INTEGER', async () => {
    await asOwner();
    expect(await scalar<string>(`select pg_get_function_result('list_sanction_users(integer, integer)'::regprocedure)`))
      .toContain('expected_seq text');
    expect(await scalar<string>(
      `select pg_get_function_result('get_user_sanction_history(uuid, integer, integer)'::regprocedure)`))
      .toContain('seq text');
    await exec('alter table user_sanctions alter column seq restart with 9007199254740993');
    await sanction(writer, 'warning');
    await as(admin, 'service_role');
    const [user] = await query('select * from list_sanction_users(25, 0)');
    expect(user.expected_seq).toBe('9007199254740993');
    const [event] = await query('select * from get_user_sanction_history($1, 25, 0)', [writer]);
    expect(event.seq).toBe('9007199254740993');
    // The decimal string round-trips into a bigint parameter without loss.
    expect(await scalar<string>('select ($1::bigint + 0)::text', [user.expected_seq])).toBe('9007199254740993');
  });
});
