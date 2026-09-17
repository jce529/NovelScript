import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Real two-session races against the applied 0006-0009 SQL (07-07).
//
// Unlike the other admin DB suites (one connection, outer rollback), cross-session
// visibility needs committed state: the migrations are loaded into a disposable schema
// that is committed, every race uses distinct connections, and afterAll drops the schema.
//
// Barrier: session A runs a command inside an open transaction (holding its row/advisory
// locks). Session B starts the competing command, and the control connection polls
// pg_stat_activity until B is waiting on a lock. Only then does A commit or roll back.
describe.skipIf(!process.env.SUPABASE_DB_URL)('admin moderation races (PostgreSQL, two sessions)', () => {
  const url = process.env.SUPABASE_DB_URL!;
  const schema = `admin_race_${crypto.randomUUID().replaceAll('-', '')}`;
  const ctl = postgres(url, { max: 1, prepare: false });
  const sessions: Session[] = [];

  const OP = 'select moderate_report_group($1, $2, $3, $4, $5::uuid[], $6, $7, $8, $9, $10::timestamptz) as id';

  interface Session {
    sql: postgres.Sql;
    pid: number;
    q: (text: string, params?: unknown[]) => Promise<postgres.Row[]>;
    as: (id: string, role: 'authenticated' | 'service_role') => Promise<void>;
  }

  const run = (sql: postgres.Sql, text: string, params: unknown[] = []) =>
    sql.unsafe(text, params as postgres.ParameterOrJSON<never>[]);
  async function one<T>(text: string, params: unknown[] = []): Promise<T> {
    const rows = await run(ctl, text, params);
    return Object.values(rows[0] as object)[0] as T;
  }

  async function session(): Promise<Session> {
    const sql = postgres(url, { max: 1, prepare: false });
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

  /** Resolves 'blocked' once pid waits on a lock, or 'done' if the call finished without waiting. */
  async function barrier(pid: number, pending: { isDone: () => boolean }) {
    for (let i = 0; i < 300; i++) {
      if (pending.isDone()) return 'done';
      const [row] = await run(ctl, 'select wait_event_type from pg_stat_activity where pid = $1', [pid]);
      if (row?.wait_event_type === 'Lock') return 'blocked';
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`barrier timeout for pid ${pid}`);
  }

  /** A holds the first command open; B must be lock-blocked before A finishes. */
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

  const reason = '운영 검토 사유';
  const publicReason = '운영 정책 위반';

  async function fixture() {
    const id = () => crypto.randomUUID();
    const f = {
      writer: id(), reader: id(), reader2: id(), admin1: id(), admin2: id(),
      work: id(), chapter: id(), chapter2: id(), paid: id(),
    };
    await run(ctl, 'insert into test_users(id) values ($1),($2),($3),($4),($5)',
      [f.writer, f.reader, f.reader2, f.admin1, f.admin2]);
    await run(ctl, "update profiles set role = 'writer', pen_name = 'W' || left(id::text, 8) where id = $1", [f.writer]);
    await run(ctl, 'update wallets set balance = 500 where id = $1', [f.reader]);
    await run(ctl, "insert into works(id, owner_id, title) values ($1, $2, '경쟁 테스트 작품')", [f.work, f.writer]);
    await run(ctl, `insert into chapters(id, work_id, title, content, order_index, is_published, price_tier)
      values ($1, $4, '1화', 'body one', 0, true, null),
             ($2, $4, '2화', 'body two', 1, true, null),
             ($3, $4, '유료', 'paid body', 2, true, 30)`, [f.chapter, f.chapter2, f.paid, f.work]);
    await run(ctl, "select grant_admin($1, 'race test', 'vitest'), grant_admin($2, 'race test', 'vitest')",
      [f.admin1, f.admin2]);
    return f;
  }
  async function report(reporter: string, work: string, chapter: string | null) {
    return one<string>(`insert into reports(reporter_id, work_id, chapter_id, reason_category)
      values ($1, $2, $3, '스팸/광고') returning id`, [reporter, work, chapter]);
  }
  const version = (work: string, chapter: string | null) =>
    one<string>('select moderation_target_version($1, $2)', [work, chapter]);
  const opArgs = (actor: string, key: string, work: string, chapter: string | null, ids: string[], expected: string,
    action: string, endsAt: string | null = null): [string, unknown[]] =>
    [OP, [actor, key, work, chapter, ids, expected, action,
      action === 'resolve' || action === 'dismiss' ? null : reason,
      action === 'resolve' || action === 'dismiss' ? null : publicReason, endsAt]];

  beforeAll(async () => {
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
      for (const file of ['0001_init.sql', '0002_studio.sql', '0003_reader.sql', '0004_kb_custom_folders.sql',
        '0005_commerce.sql', '0006_admin_foundation.sql', '0007_admin_operations.sql',
        '0008_sanction_enforcement.sql', '0009_blind_access.sql']) {
        await ctl.unsafe(readFileSync(`supabase/migrations/${file}`, 'utf8')
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

  it('lets exactly one of two competing resolutions win; the loser gets stale_target', async () => {
    const f = await fixture();
    const r1 = await report(f.reader, f.work, f.chapter);
    const r2 = await report(f.reader2, f.work, f.chapter);
    const v = await version(f.work, f.chapter);
    await a.as(f.admin1, 'service_role');
    await b.as(f.admin2, 'service_role');

    const out = await race(a, opArgs(f.admin1, crypto.randomUUID(), f.work, f.chapter, [r1, r2], v, 'resolve'),
      b, opArgs(f.admin2, crypto.randomUUID(), f.work, f.chapter, [r1, r2], v, 'dismiss'));

    expect(out.state).toBe('blocked');
    expect(out.second.ok).toBe(false);
    expect(!out.second.ok && out.second.error.message).toContain('stale_target');
    const rows = await run(ctl, 'select status, resolved_by from reports where id = any($1::uuid[])', [[r1, r2]]);
    expect(rows).toEqual([{ status: 'resolved', resolved_by: f.admin1 }, { status: 'resolved', resolved_by: f.admin1 }]);
    expect(await one<number>('select count(*)::int from admin_actions where target_work_id = $1', [f.work])).toBe(1);
  });

  it('keeps a report that arrives during review open and outside the committed action', async () => {
    const f = await fixture();
    const r1 = await report(f.reader, f.work, f.chapter);
    const v = await version(f.work, f.chapter);
    await a.as(f.admin1, 'service_role');
    await b.as(f.reader2, 'authenticated');

    const out = await race(a, opArgs(f.admin1, crypto.randomUUID(), f.work, f.chapter, [r1], v, 'resolve'),
      b, [`insert into reports(reporter_id, work_id, chapter_id, reason_category)
        values ($1, $2, $3, '기타')`, [f.reader2, f.work, f.chapter]]);

    // The FK key-share on works/chapters conflicts with the command's FOR UPDATE, so the
    // insert either waits for the command or (if it won the lock) lands first; both commit.
    expect(['blocked', 'done']).toContain(out.state);
    expect(out.second.ok).toBe(true);
    const actionId = out.first[0].id as string;
    const late = await one<string>('select id from reports where reporter_id = $1 and work_id = $2', [f.reader2, f.work]);
    expect(await one<string>('select status from reports where id = $1', [r1])).toBe('resolved');
    expect(await one<string>('select status from reports where id = $1', [late])).toBe('open');
    expect(await one<string[]>('select report_ids from admin_actions where id = $1', [actionId])).toEqual([r1]);

    // The late report is still actionable after a refresh (new version), not with the old one.
    await b.as(f.admin2, 'service_role');
    await expect(b.q(...opArgs(f.admin2, crypto.randomUUID(), f.work, f.chapter, [late], v, 'dismiss')))
      .rejects.toThrow('stale_target');
    await b.q(...opArgs(f.admin2, crypto.randomUUID(), f.work, f.chapter, [late], await version(f.work, f.chapter), 'dismiss'));
    expect(await one<string>('select status from reports where id = $1', [late])).toBe('dismissed');
  });

  it('serializes a duplicate retry on the idempotency key and returns the recorded action', async () => {
    const f = await fixture();
    const r1 = await report(f.reader, f.work, f.chapter);
    const v = await version(f.work, f.chapter);
    const key = crypto.randomUUID();
    await a.as(f.admin1, 'service_role');
    await b.as(f.admin1, 'service_role');

    const out = await race(a, opArgs(f.admin1, key, f.work, f.chapter, [r1], v, 'blind'),
      b, opArgs(f.admin1, key, f.work, f.chapter, [r1], v, 'blind'));

    expect(out.state).toBe('blocked');
    expect(out.second.ok && out.second.value[0].id).toBe(out.first[0].id);
    expect(await one<number>('select count(*)::int from admin_actions where idempotency_key = $1', [key])).toBe(1);
    expect(await one<boolean>('select admin_blinded from chapters where id = $1', [f.chapter])).toBe(true);
    await expect(b.q(...opArgs(f.admin1, key, f.work, f.chapter, [r1], v, 'dismiss'))).rejects.toThrow('idempotency_conflict');
  });

  it('rolls back the whole command when the holder aborts, so the retry applies exactly once', async () => {
    const f = await fixture();
    const r1 = await report(f.reader, f.work, f.chapter);
    const v = await version(f.work, f.chapter);
    const key = crypto.randomUUID();
    await a.as(f.admin1, 'service_role');
    await b.as(f.admin1, 'service_role');

    const held = await race(a, opArgs(f.admin1, key, f.work, f.chapter, [r1], v, 'warn'),
      b, opArgs(f.admin1, key, f.work, f.chapter, [r1], v, 'warn'), 'rollback');
    expect(held.state).toBe('blocked');
    expect(held.second.ok).toBe(true);
    expect(await one<number>('select count(*)::int from admin_actions where idempotency_key = $1', [key])).toBe(1);
    expect(await one<number>("select count(*)::int from user_sanctions where user_id = $1 and kind = 'warning'", [f.writer])).toBe(1);
    expect(await one<string>('select status from reports where id = $1', [r1])).toBe('resolved');
  });

  for (const order of [['warn', 'suspend'], ['suspend', 'warn']] as const) {
    it(`keeps the suspension cache when ${order[0]} and ${order[1]} race on one author`, async () => {
      const f = await fixture();
      const rw = await report(f.reader, f.work, f.chapter);
      const rs = await report(f.reader, f.work, f.chapter2);
      const endsAt = await one<string>("select (now() + interval '7 days')::text");
      const args = (action: 'warn' | 'suspend', actor: string, s: Session) => {
        void s;
        return action === 'warn'
          ? opArgs(actor, crypto.randomUUID(), f.work, f.chapter, [rw], vw, 'warn')
          : opArgs(actor, crypto.randomUUID(), f.work, f.chapter2, [rs], vs, 'suspend', endsAt);
      };
      const vw = await version(f.work, f.chapter);
      const vs = await version(f.work, f.chapter2);
      await a.as(f.admin1, 'service_role');
      await b.as(f.admin2, 'service_role');

      const out = await race(a, args(order[0], f.admin1, a), b, args(order[1], f.admin2, b));

      expect(out.state).toBe('blocked');
      expect(out.second.ok).toBe(true);
      const [profile] = await run(ctl,
        "select sanction_kind, sanctioned_until = $2::timestamptz as until_matches from profiles where id = $1",
        [f.writer, endsAt]);
      expect(profile).toEqual({ sanction_kind: 'suspension', until_matches: true });
      expect(await run(ctl, 'select kind from user_sanctions where user_id = $1 order by kind', [f.writer]))
        .toEqual([{ kind: 'suspension' }, { kind: 'warning' }]);
      expect(await one<number>(`select count(*)::int from admin_actions a join user_sanctions s on s.admin_action_id = a.id
        where a.target_user_id = $1`, [f.writer])).toBe(2);
      expect(await one<boolean>('select user_can_write($1)', [f.writer])).toBe(false);
    });
  }

  it('lets a payment that holds the content lock finish before a blind: one debit, entitlement kept', async () => {
    const f = await fixture();
    const r1 = await report(f.reader2, f.work, f.paid);
    await b.as(f.reader, 'authenticated');
    const [{ id: order }] = await b.q('select create_purchase_order($1::uuid[], gen_random_uuid()) as id', [[f.paid]]);
    const v = await version(f.work, f.paid);
    await a.as(f.reader, 'authenticated');
    await b.as(f.admin1, 'service_role');

    const out = await race(a, ['select pay_purchase_order($1) as id', [order]],
      b, opArgs(f.admin1, crypto.randomUUID(), f.work, f.paid, [r1], v, 'blind'));

    expect(out.state).toBe('blocked');
    expect(out.second.ok).toBe(true);
    expect(await one<string>('select balance::text from wallets where id = $1', [f.reader])).toBe('470');
    expect(await one<number>('select count(*)::int from ledger_entries where wallet_id = $1 and reference_id = $2',
      [f.reader, order])).toBe(1);
    expect(await one<string>('select status from orders where id = $1', [order])).toBe('PAID');
    expect(await one<number>('select count(*)::int from entitlements where user_id = $1 and revoked_at is null',
      [f.reader])).toBe(1);
    await a.as(f.reader, 'authenticated');
    const [{ s }] = await a.q('select get_chapter_access_state($1, $2) as s', [f.work, f.paid]);
    expect(s).toMatchObject({ state: 'blinded', entitled: true, blind_scope: 'chapter' });
    // Retry of the settled order after the blind: no second debit.
    await a.q('select pay_purchase_order($1)', [order]);
    expect(await one<string>('select balance::text from wallets where id = $1', [f.reader])).toBe('470');
  });

  it('rejects a payment that waits behind a committed blind with no debit or entitlement', async () => {
    const f = await fixture();
    const r1 = await report(f.reader2, f.work, f.paid);
    await b.as(f.reader, 'authenticated');
    const [{ id: order }] = await b.q('select create_purchase_order($1::uuid[], gen_random_uuid()) as id', [[f.paid]]);
    const v = await version(f.work, f.paid);
    await a.as(f.admin1, 'service_role');

    const out = await race(a, opArgs(f.admin1, crypto.randomUUID(), f.work, f.paid, [r1], v, 'blind'),
      b, ['select pay_purchase_order($1) as id', [order]]);

    expect(out.state).toBe('blocked');
    expect(!out.second.ok && out.second.error.message).toContain('content_blinded');
    expect(await one<string>('select balance::text from wallets where id = $1', [f.reader])).toBe('500');
    expect(await one<number>('select count(*)::int from ledger_entries where wallet_id = $1', [f.reader])).toBe(0);
    expect(await one<string>('select status from orders where id = $1', [order])).toBe('PENDING');
    expect(await one<number>('select count(*)::int from entitlements where user_id = $1', [f.reader])).toBe(0);
    expect(await one<number>("select count(*)::int from admin_actions where action_type = 'chapter_blind' and target_chapter_id = $1",
      [f.paid])).toBe(1);
  });
});
