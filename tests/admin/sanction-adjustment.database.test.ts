import postgres from 'postgres';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// 07-08 Task 2: adjust_user_sanction (0029) - early lift and duration change through the
// existing lift path, with validation, idempotency, rollback and two-session races.
//
// Harness: concurrency.database.test.ts (committed disposable schema, distinct connections,
// lock-wait barrier via pg_stat_activity, schema dropped in afterAll). Every test creates
// fresh random IDs, so committed state never leaks between tests.
// SQL files are read at module load (collection proves they exist and are non-empty); no
// connection is opened until beforeAll.
const MIGRATIONS = ['0001_init.sql', '0002_studio.sql', '0003_reader.sql', '0004_kb_custom_folders.sql',
  '0005_commerce.sql', '0006_admin_foundation.sql', '0007_admin_operations.sql',
  '0008_sanction_enforcement.sql', '0009_blind_access.sql', '0029_admin_blueprint_completion.sql'] as const;
const MIGRATION_SQL = MIGRATIONS.map((file) => {
  const text = readFileSync(`supabase/migrations/${file}`, 'utf8');
  assert.ok(text.trim().length > 0, `${file} is empty`);
  return { file, text };
});

describe.skipIf(!process.env.SUPABASE_DB_URL)('admin sanction adjustment (PostgreSQL)', () => {
  const schema = `admin_bp_adj_${crypto.randomUUID().replaceAll('-', '')}`;
  let ctl: postgres.Sql;
  const sessions: Session[] = [];

  const ADJ = 'select adjust_user_sanction($1, $2, $3, $4::bigint, $5, $6, $7, $8::timestamptz) as id';
  const OP = 'select moderate_report_group($1, $2, $3, $4, $5::uuid[], $6, $7, $8, $9, $10::timestamptz) as id';

  interface Session {
    sql: postgres.Sql;
    pid: number;
    q: (text: string, params?: unknown[]) => Promise<postgres.Row[]>;
    as: (id: string, role: 'anon' | 'authenticated' | 'service_role') => Promise<void>;
  }
  const run = (sql: postgres.Sql, text: string, params: unknown[] = []) =>
    sql.unsafe(text, params as postgres.ParameterOrJSON<never>[]);
  async function one<T>(text: string, params: unknown[] = []): Promise<T> {
    const rows = await run(ctl, text, params);
    return Object.values(rows[0] as object)[0] as T;
  }
  async function session(): Promise<Session> {
    const sql = postgres(process.env.SUPABASE_DB_URL!, { max: 1, prepare: false });
    await sql.unsafe(`set search_path = ${schema}, public`);
    const [{ pid }] = await sql.unsafe('select pg_backend_pid() as pid');
    const s: Session = {
      sql,
      pid: Number(pid),
      q: (text, params = []) => run(sql, text, params),
      as: async (id, role) => {
        await sql.unsafe('reset role');
        await run(sql, "select set_config('request.jwt.claim.sub', $1, false)", [id]);
        await sql.unsafe(`set role ${role}`);
      },
    };
    sessions.push(s);
    return s;
  }

  type Settled = { ok: true; value: postgres.Row[] } | { ok: false; error: Error };
  function settle(p: Promise<postgres.Row[]>) {
    let done = false;
    const result: Promise<Settled> = p.then(
      (value) => { done = true; return { ok: true as const, value }; },
      (error: Error) => { done = true; return { ok: false as const, error }; });
    return { result, isDone: () => done };
  }
  async function barrier(pid: number, pending: { isDone: () => boolean }) {
    for (let i = 0; i < 300; i++) {
      if (pending.isDone()) return 'done';
      const [row] = await run(ctl, 'select wait_event_type from pg_stat_activity where pid = $1', [pid]);
      if (row?.wait_event_type === 'Lock') return 'blocked';
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`barrier timeout for pid ${pid}`);
  }
  async function race(a: Session, first: [string, unknown[]], b: Session, second: [string, unknown[]],
    finishA: 'commit' | 'rollback' = 'commit') {
    await a.q('begin');
    let firstRows: postgres.Row[];
    try {
      firstRows = await a.q(...first);
    } catch (error) {
      await a.q('rollback');
      throw error;
    }
    const pending = settle(b.q(...second));
    const state = await barrier(b.pid, pending);
    await a.q(finishA);
    return { first: firstRows, state, second: await pending.result };
  }

  const days = (n: number) => one<string>(`select (now() + interval '${n} days')::text`);
  async function fixture() {
    const id = () => crypto.randomUUID();
    const f = { writer: id(), reader: id(), admin1: id(), admin2: id(), work: id(), chapter: id(), chapter2: id() };
    await run(ctl, 'insert into test_users(id) values ($1),($2),($3),($4)', [f.writer, f.reader, f.admin1, f.admin2]);
    await run(ctl, "update profiles set role = 'writer', pen_name = 'W' || left(id::text, 8) where id = $1", [f.writer]);
    await run(ctl, "insert into works(id, owner_id, title) values ($1, $2, '조정 테스트')", [f.work, f.writer]);
    await run(ctl, `insert into chapters(id, work_id, title, content, order_index, is_published)
      values ($1, $3, '1화', 'body', 0, true), ($2, $3, '2화', 'body', 1, true)`, [f.chapter, f.chapter2, f.work]);
    await run(ctl, "select grant_admin($1, 'adjust test', 'vitest'), grant_admin($2, 'adjust test', 'vitest')",
      [f.admin1, f.admin2]);
    return f;
  }
  /** Existing audited write path (as the migration owner): audit row + apply_user_sanction. */
  async function sanction(actor: string, user: string, kind: string, endsAt: string | null = null) {
    const type = { warning: 'user_warn', suspension: 'user_suspend', permanent_suspension: 'user_permanent_suspend' }[kind]!;
    const action = await one<string>(`insert into admin_actions(actor_id, action_type, target_user_id, reason, public_reason)
      values ($1, $2, $3, 'i', 'p') returning id`, [actor, type, user]);
    await run(ctl, "select apply_user_sanction($1, $2, $3, 'p', 'i', $4::timestamptz, $5)", [actor, user, kind, endsAt, action]);
  }
  const seq = (user: string) => one<string>('select coalesce(max(seq), 0)::text from user_sanctions where user_id = $1', [user]);
  const adjArgs = (actor: string, key: string, user: string, expected: string, operation: string,
    endsAt: string | null = null, reason = '내부 조정 사유', publicReason = '공개 조정 사유'): [string, unknown[]] =>
    [ADJ, [actor, key, user, expected, operation, reason, publicReason, endsAt]];
  async function cache(user: string) {
    const [row] = await run(ctl, 'select sanction_kind, sanctioned_until::text as until from profiles where id = $1', [user]);
    return row as unknown as { sanction_kind: string; until: string | null };
  }
  async function snapshot(user: string) {
    const [row] = await run(ctl, `select
      (select count(*)::int from user_sanctions where user_id = $1) as history,
      (select count(*)::int from admin_actions where target_user_id = $1) as audits,
      (select sanction_kind from profiles where id = $1) as kind,
      (select sanctioned_until::text from profiles where id = $1) as until`, [user]);
    return row;
  }

  beforeAll(async () => {
    ctl = postgres(process.env.SUPABASE_DB_URL!, { max: 1, prepare: false });
    try {
      await ctl.unsafe(`
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
        await ctl.unsafe(text
          .replace('create extension if not exists "pgcrypto";', '')
          .replaceAll('auth.users', `${schema}.test_users`)
          .replaceAll('search_path = public', `search_path = ${schema}, public`)
          .replace(/^begin;|^commit;/gm, '')
          .replace(/^notify pgrst.*$/gm, ''));
      }
      await ctl.unsafe('commit');
    } catch (error) {
      await ctl.unsafe('rollback').catch(() => {});
      throw error;
    }
  }, 120_000);

  afterAll(async () => {
    if (!ctl) return;
    try {
      for (const s of sessions) await s.sql.end({ timeout: 5 }).catch(() => {});
      await ctl.unsafe(`drop schema if exists ${schema} cascade`);
      const [{ left }] = await ctl.unsafe('select count(*)::int as left from pg_namespace where nspname = $1', [schema]);
      expect(left).toBe(0);
    } finally {
      await ctl.end();
    }
  }, 120_000);

  let a: Session;
  let b: Session;
  beforeEach(async () => {
    for (const s of sessions.splice(0)) await s.sql.end({ timeout: 5 }).catch(() => {});
    a = await session();
    b = await session();
  });

  it('is executable by service_role only', async () => {
    const f = await fixture();
    for (const role of ['anon', 'authenticated'] as const) {
      await a.as(f.admin1, role);
      await expect(a.q(...adjArgs(f.admin1, crypto.randomUUID(), f.writer, '0', 'lift'))).rejects.toThrow('permission denied');
    }
  });

  it('lifts a timed suspension to none, keeps the warning and records an audited lift', async () => {
    const f = await fixture();
    await sanction(f.admin1, f.writer, 'warning');
    await sanction(f.admin1, f.writer, 'suspension', await days(30));
    await a.as(f.admin1, 'service_role');
    const [{ id }] = await a.q(...adjArgs(f.admin1, crypto.randomUUID(), f.writer, await seq(f.writer), 'lift'));

    expect(await cache(f.writer)).toEqual({ sanction_kind: 'none', until: null });
    expect(await one<boolean>('select user_can_write($1)', [f.writer])).toBe(true);
    expect((await run(ctl, 'select kind from user_sanctions where user_id = $1 order by seq', [f.writer])).map((r) => r.kind))
      .toEqual(['warning', 'suspension', 'lift']);
    const [audit] = await run(ctl, 'select action_type, reason, public_reason, metadata, idempotency_key is not null as keyed from admin_actions where id = $1', [id]);
    expect(audit).toMatchObject({ action_type: 'user_sanction_lift', reason: '내부 조정 사유', public_reason: '공개 조정 사유',
      keyed: true, metadata: { operation: 'lift', previous_kind: 'suspension', new_kind: 'none', new_ends_at: null } });
    const [lift] = await run(ctl, "select internal_note, public_reason, admin_action_id from user_sanctions where user_id = $1 and kind = 'lift'", [f.writer]);
    expect(lift).toEqual({ internal_note: '내부 조정 사유', public_reason: '공개 조정 사유', admin_action_id: id });
  });

  it('lifts a permanent suspension', async () => {
    const f = await fixture();
    await sanction(f.admin1, f.writer, 'permanent_suspension');
    await a.as(f.admin1, 'service_role');
    await a.q(...adjArgs(f.admin1, crypto.randomUUID(), f.writer, await seq(f.writer), 'lift'));
    expect(await cache(f.writer)).toEqual({ sanction_kind: 'none', until: null });
  });

  it('shortens 30 days to 1 day and extends 1 day to 7 days exactly, via lift + new suspension', async () => {
    const f = await fixture();
    await sanction(f.admin1, f.reader, 'suspension', await days(30));
    const oneDay = await days(1);
    await a.as(f.admin1, 'service_role');
    const [{ id }] = await a.q(...adjArgs(f.admin1, crypto.randomUUID(), f.reader, await seq(f.reader), 'change_duration', oneDay));
    expect(await one<boolean>('select sanctioned_until = $2::timestamptz from profiles where id = $1', [f.reader, oneDay])).toBe(true);
    expect((await cache(f.reader)).sanction_kind).toBe('suspension');

    const audits = await run(ctl, `select id, action_type, idempotency_key is not null as keyed, metadata
      from admin_actions where target_user_id = $1 and metadata ? 'change_id' order by action_type`, [f.reader]);
    expect(audits.map((x) => [x.action_type, x.keyed])).toEqual([['user_sanction_lift', true], ['user_suspend', false]]);
    expect(audits[0].id).toBe(id);
    expect(audits[1].metadata).toMatchObject({ operation: 'change_duration', lift_action_id: id,
      change_id: audits[0].metadata.change_id, previous_kind: 'suspension' });

    const sevenDays = await days(7);
    await a.q(...adjArgs(f.admin1, crypto.randomUUID(), f.reader, await seq(f.reader), 'change_duration', sevenDays));
    expect(await one<boolean>('select sanctioned_until = $2::timestamptz from profiles where id = $1', [f.reader, sevenDays])).toBe(true);
    expect((await run(ctl, 'select kind from user_sanctions where user_id = $1 order by seq', [f.reader])).map((r) => r.kind))
      .toEqual(['suspension', 'lift', 'suspension', 'lift', 'suspension']);
  });

  it('turns a permanent suspension into a timed one explicitly', async () => {
    const f = await fixture();
    await sanction(f.admin1, f.writer, 'permanent_suspension');
    const until = await days(7);
    await a.as(f.admin1, 'service_role');
    const [{ id }] = await a.q(...adjArgs(f.admin1, crypto.randomUUID(), f.writer, await seq(f.writer), 'change_duration', until));
    expect((await cache(f.writer)).sanction_kind).toBe('suspension');
    expect(await one<boolean>('select sanctioned_until = $2::timestamptz from profiles where id = $1', [f.writer, until])).toBe(true);
    expect(await one<string>("select metadata->>'previous_kind' from admin_actions where id = $1", [id])).toBe('permanent_suspension');
  });

  it('rejects invalid requests without touching history, audit or cache', async () => {
    const f = await fixture();
    await sanction(f.admin1, f.writer, 'suspension', await days(30));
    await sanction(f.admin1, f.reader, 'warning');
    const expected = await seq(f.writer);
    const before = await snapshot(f.writer);
    const past = await one<string>("select (now() - interval '1 hour')::text");
    const until = await days(1);
    await a.as(f.admin1, 'service_role');
    const k = () => crypto.randomUUID();
    const cases: [[string, unknown[]], string][] = [
      [adjArgs(f.admin1, k(), f.writer, expected, 'lift', null, '   '), 'reason_required'],
      [adjArgs(f.admin1, k(), f.writer, expected, 'lift', null, 'i', ' '), 'reason_required'],
      [adjArgs(f.admin1, k(), f.writer, expected, 'change_duration', past), 'invalid_sanction_expiry'],
      [adjArgs(f.admin1, k(), f.writer, expected, 'change_duration', null), 'invalid_sanction_expiry'],
      [adjArgs(f.admin1, k(), f.writer, expected, 'lift', until), 'invalid_sanction_expiry'],
      [adjArgs(f.admin1, k(), f.writer, expected, 'shorten', until), 'invalid_action'],
      [adjArgs(f.admin1, k(), f.writer, String(BigInt(expected) - BigInt(1)), 'lift'), 'stale_target'],
      [adjArgs(f.admin1, k(), f.writer, '999999999', 'lift'), 'stale_target'],
      [adjArgs(f.admin1, k(), f.reader, await seq(f.reader), 'lift'), 'no_active_sanction'],
      [adjArgs(f.reader, k(), f.writer, expected, 'lift'), 'actor_not_admin'],
      [adjArgs(f.admin1, k(), f.admin1, expected, 'lift'), 'self_sanction_forbidden'],
    ];
    for (const [args, message] of cases) await expect(a.q(...args)).rejects.toThrow(message);
    expect(await snapshot(f.writer)).toEqual(before);

    await run(ctl, "select revoke_admin($1, 'left', 'vitest')", [f.admin2]);
    await b.as(f.admin2, 'service_role');
    await expect(b.q(...adjArgs(f.admin2, k(), f.writer, expected, 'lift'))).rejects.toThrow('actor_not_admin');

    // An expired suspension (DB time) is not a current sanction.
    const [{ endsAt }] = await run(ctl, "select (now() + interval '2 seconds')::text as \"endsAt\"");
    await sanction(f.admin1, f.reader, 'suspension', endsAt as string);
    await new Promise((r) => setTimeout(r, 2500));
    await expect(a.q(...adjArgs(f.admin1, k(), f.reader, await seq(f.reader), 'lift'))).rejects.toThrow('no_active_sanction');
    expect(await snapshot(f.writer)).toEqual(before);
  });

  it('rolls back the lift when the replacement suspension fails mid-transaction', async () => {
    const f = await fixture();
    await sanction(f.admin1, f.writer, 'suspension', await days(30));
    const before = await snapshot(f.writer);
    const expected = await seq(f.writer);
    await a.q('begin');
    await a.q(`create function ${schema}.fail_replacement() returns trigger language plpgsql as $$
      begin if new.kind = 'suspension' then raise exception 'replacement_failed'; end if; return new; end; $$`);
    await a.q(`create trigger fail_replacement before insert on ${schema}.user_sanctions
      for each row execute function ${schema}.fail_replacement()`);
    await a.as(f.admin1, 'service_role');
    await expect(a.q(...adjArgs(f.admin1, crypto.randomUUID(), f.writer, expected, 'change_duration', await days(1))))
      .rejects.toThrow('replacement_failed');
    await a.q('rollback');
    expect(await snapshot(f.writer)).toEqual(before);
  });

  it('replays the same key and payload and rejects the same key with any different payload', async () => {
    const f = await fixture();
    await sanction(f.admin1, f.writer, 'suspension', await days(30));
    await sanction(f.admin1, f.reader, 'suspension', await days(30));
    const expected = await seq(f.writer);
    const until = await days(3);
    const key = crypto.randomUUID();
    await a.as(f.admin1, 'service_role');
    const [{ id }] = await a.q(...adjArgs(f.admin1, key, f.writer, expected, 'change_duration', until, '  내부  ', ' 공개 '));
    const after = await snapshot(f.writer);
    // Retry (stale expected seq by now) with identical trimmed payload returns the first action.
    const [{ id: again }] = await a.q(...adjArgs(f.admin1, key, f.writer, expected, 'change_duration', until, '내부', '공개'));
    expect(again).toBe(id);
    expect(await snapshot(f.writer)).toEqual(after);

    const conflicts: [string, unknown[]][] = [
      adjArgs(f.admin1, key, f.writer, expected, 'change_duration', until, '다른 내부', '공개'),
      adjArgs(f.admin1, key, f.writer, expected, 'change_duration', until, '내부', '다른 공개'),
      adjArgs(f.admin1, key, f.writer, expected, 'change_duration', await days(4), '내부', '공개'),
      adjArgs(f.admin1, key, f.reader, expected, 'change_duration', until, '내부', '공개'),
      adjArgs(f.admin1, key, f.writer, expected, 'lift', null, '내부', '공개'),
      adjArgs(f.admin1, key, f.writer, String(BigInt(expected) + BigInt(1)), 'change_duration', until, '내부', '공개'),
    ];
    for (const args of conflicts) await expect(a.q(...args)).rejects.toThrow('idempotency_conflict');
    expect(await snapshot(f.writer)).toEqual(after);
  });

  it('lets one of two concurrent adjustments with different keys win; the other is stale', async () => {
    const f = await fixture();
    await sanction(f.admin1, f.writer, 'suspension', await days(30));
    const expected = await seq(f.writer);
    await a.as(f.admin1, 'service_role');
    await b.as(f.admin2, 'service_role');
    const out = await race(a, adjArgs(f.admin1, crypto.randomUUID(), f.writer, expected, 'change_duration', await days(1)),
      b, adjArgs(f.admin2, crypto.randomUUID(), f.writer, expected, 'lift'));
    expect(out.state).toBe('blocked');
    expect(!out.second.ok && out.second.error.message).toContain('stale_target');
    expect((await cache(f.writer)).sanction_kind).toBe('suspension');
    expect(await one<number>("select count(*)::int from user_sanctions where user_id = $1 and kind = 'lift'", [f.writer])).toBe(1);
  });

  it('records a concurrent retry with the same key exactly once', async () => {
    const f = await fixture();
    await sanction(f.admin1, f.writer, 'suspension', await days(30));
    const expected = await seq(f.writer);
    const key = crypto.randomUUID();
    await a.as(f.admin1, 'service_role');
    await b.as(f.admin1, 'service_role');
    const out = await race(a, adjArgs(f.admin1, key, f.writer, expected, 'lift'), b, adjArgs(f.admin1, key, f.writer, expected, 'lift'));
    expect(out.state).toBe('blocked');
    expect(out.second.ok && out.second.value[0].id).toBe(out.first[0].id);
    expect(await one<number>('select count(*)::int from admin_actions where idempotency_key = $1', [key])).toBe(1);
    expect(await one<number>("select count(*)::int from user_sanctions where user_id = $1 and kind = 'lift'", [f.writer])).toBe(1);
  });

  it('serializes a report-driven suspension and an adjustment on the profile lock', async () => {
    const f = await fixture();
    await sanction(f.admin1, f.writer, 'suspension', await days(30));
    const expected = await seq(f.writer);
    const r1 = await one<string>(`insert into reports(reporter_id, work_id, chapter_id, reason_category)
      values ($1, $2, $3, '스팸/광고') returning id`, [f.reader, f.work, f.chapter]);
    const v = await one<string>('select moderation_target_version($1, $2)', [f.work, f.chapter]);
    const longer = await days(60);
    await a.as(f.admin1, 'service_role');
    await b.as(f.admin2, 'service_role');
    // The new report suspension commits first, so the adjustment's expected seq is stale.
    const out = await race(a, [OP, [f.admin1, crypto.randomUUID(), f.work, f.chapter, [r1], v, 'suspend', 'i', 'p', longer]],
      b, adjArgs(f.admin2, crypto.randomUUID(), f.writer, expected, 'change_duration', await days(1)));
    expect(out.state).toBe('blocked');
    expect(!out.second.ok && out.second.error.message).toContain('stale_target');
    expect(await one<boolean>('select sanctioned_until = $2::timestamptz from profiles where id = $1', [f.writer, longer])).toBe(true);

    // Reverse order: adjustment holds the lock, the report suspension waits and then applies on top.
    const r2 = await one<string>(`insert into reports(reporter_id, work_id, chapter_id, reason_category)
      values ($1, $2, $3, '기타') returning id`, [f.reader, f.work, f.chapter2]);
    const v2 = await one<string>('select moderation_target_version($1, $2)', [f.work, f.chapter2]);
    const shortUntil = await days(2);
    const reportUntil = await days(5);
    const out2 = await race(a, adjArgs(f.admin1, crypto.randomUUID(), f.writer, await seq(f.writer), 'change_duration', shortUntil),
      b, [OP, [f.admin2, crypto.randomUUID(), f.work, f.chapter2, [r2], v2, 'suspend', 'i', 'p', reportUntil]]);
    expect(out2.state).toBe('blocked');
    expect(out2.second.ok).toBe(true);
    expect(await one<boolean>('select sanctioned_until = $2::timestamptz from profiles where id = $1', [f.writer, reportUntil])).toBe(true);
  });

  it('keeps the original state while the holder is open and after it rolls back', async () => {
    const f = await fixture();
    await sanction(f.admin1, f.writer, 'suspension', await days(30));
    const before = await snapshot(f.writer);
    const expected = await seq(f.writer);
    await a.as(f.admin1, 'service_role');
    await b.as(f.admin2, 'service_role');
    await a.q('begin');
    await a.q(...adjArgs(f.admin1, crypto.randomUUID(), f.writer, expected, 'lift'));
    expect(await snapshot(f.writer)).toEqual(before); // uncommitted lift invisible to others
    await a.q('rollback');
    expect(await snapshot(f.writer)).toEqual(before);

    const out = await race(a, adjArgs(f.admin1, crypto.randomUUID(), f.writer, expected, 'lift'),
      b, adjArgs(f.admin2, crypto.randomUUID(), f.writer, expected, 'change_duration', await days(1)), 'rollback');
    expect(out.state).toBe('blocked');
    expect(out.second.ok).toBe(true);
    expect((await cache(f.writer)).sanction_kind).toBe('suspension');
    expect(await one<number>("select count(*)::int from user_sanctions where user_id = $1 and kind = 'lift'", [f.writer])).toBe(1);
  });
});
