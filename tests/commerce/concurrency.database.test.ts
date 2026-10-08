import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

// Real multi-session purchase races against the applied 0005-0017 SQL (Phase 6 UAT).
//
// The other commerce DB suites use one connection inside an outer rollback, so they cannot
// prove cross-session behavior. Here the migrations are loaded into a disposable schema that is
// committed, every racer is its own PostgreSQL backend, and afterAll drops the schema.
describe.skipIf(!process.env.SUPABASE_DB_URL)('paid chapter purchase races (PostgreSQL, independent sessions)', () => {
  const url = process.env.SUPABASE_DB_URL!;
  const schema = `commerce_race_${crypto.randomUUID().replaceAll('-', '')}`;
  const ctl = postgres(url, { max: 1, prepare: false });
  let sessions: postgres.Sql[] = [];

  const author = '10000000-0000-4000-8000-000000000001';
  const buyer = '10000000-0000-4000-8000-000000000002';
  const author2 = '10000000-0000-4000-8000-000000000003';
  const buyer2 = '10000000-0000-4000-8000-000000000004';
  const work = '20000000-0000-4000-8000-000000000001';
  const work2 = '20000000-0000-4000-8000-000000000002';
  const c30 = '30000000-0000-4000-8000-000000000001'; // author, 30 tokens
  const c10 = '30000000-0000-4000-8000-000000000002'; // author, 10 tokens
  const c50 = '30000000-0000-4000-8000-000000000003'; // author2, 50 tokens

  const q = (text: string, params: unknown[] = []) => ctl.unsafe(text, params as postgres.ParameterOrJSON<never>[]);
  const balance = async (id: string) => (await q('select balance::int as b from wallets where id = $1', [id]))[0].b as number;
  const count = async (text: string, params: unknown[] = []) => (await q(text, params))[0].n as number;

  async function session(userId: string) {
    const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {}, connection: { search_path: `${schema}, public` } });
    sessions.push(sql);
    await sql.unsafe('set role authenticated');
    await sql.unsafe("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
    return sql;
  }

  async function buy(sql: postgres.Sql, chapterIds: string[], key = crypto.randomUUID()) {
    try {
      const [order] = await sql.unsafe('select create_purchase_order($1::uuid[], $2::uuid) as id', [chapterIds, key]);
      await sql.unsafe('select pay_purchase_order($1::uuid)', [order.id]);
      return { ok: true as const, error: '' };
    } catch (error) {
      return { ok: false as const, error: (error as Error).message };
    }
  }

  async function reset(balances: Record<string, number>) {
    await q('delete from entitlements');
    await q('delete from order_items');
    await q('delete from orders');
    for (const id of [author, author2, buyer, buyer2]) await q('update wallets set balance = $2 where id = $1', [id, balances[id] ?? 0]);
  }

  beforeAll(async () => {
    await q(`create schema ${schema}; set search_path = ${schema}, public;
      create table ${schema}.test_users(id uuid primary key);
      grant usage on schema ${schema} to anon, authenticated, service_role;`);
    const files = ['0001_init', '0002_studio', '0003_reader', '0004_kb_custom_folders', '0005_commerce',
      '0006_admin_foundation', '0007_admin_operations', '0008_sanction_enforcement', '0009_blind_access', '0017_author_settlement'];
    for (const file of files) {
      if (file === '0005_commerce') {
        await q(`grant all on all tables in schema ${schema} to anon, authenticated, service_role;
          grant all on all sequences in schema ${schema} to anon, authenticated, service_role;`);
      }
      await q(readFileSync(`supabase/migrations/${file}.sql`, 'utf8')
        .replace('create extension if not exists "pgcrypto";', '')
        .replaceAll('auth.users', `${schema}.test_users`)
        .replaceAll('search_path = public', `search_path = ${schema}, public`)
        .replace(/^begin;|^commit;/gm, ''));
    }
    await q(`set search_path = ${schema}, public`);
    await q('insert into test_users(id) values ($1),($2),($3),($4)', [author, buyer, author2, buyer2]);
    await q("insert into works(id, owner_id, title) values ($1,$3,'A'),($2,$4,'B')", [work, work2, author, author2]);
    await q(`insert into chapters(id,work_id,title,content,order_index,is_published,price_tier)
      values ($1,$4,'c30','x',0,true,30), ($2,$4,'c10','x',1,true,10), ($3,$5,'c50','x',0,true,50)`, [c30, c10, c50, work, work2]);
  });

  // The pooler caps concurrent sessions, so release every racer between tests.
  afterEach(async () => {
    const open = sessions;
    sessions = [];
    await Promise.all(open.map((sql) => sql.end({ timeout: 2 }).catch(() => {})));
  });

  afterAll(async () => {
    const open = sessions;
    sessions = [];
    await Promise.all(open.map((sql) => sql.end({ timeout: 2 }).catch(() => {})));
    try { await q(`drop schema if exists ${schema} cascade`); } finally { await ctl.end(); }
  });

  it('lets only one of two sessions buy the same chapter with different idempotency keys', async () => {
    await reset({ [buyer]: 200 });
    const [a, b] = await Promise.all([session(buyer), session(buyer)]);
    const results = await Promise.all([buy(a, [c30]), buy(b, [c30])]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)?.error).toMatch(/content_unavailable_or_owned/);
    expect(await balance(buyer)).toBe(170);
    expect(await balance(author)).toBe(27);
    expect(await count('select count(*)::int as n from entitlements where user_id = $1', [buyer])).toBe(1);
  });

  it('settles once when two sessions race with the same idempotency key', async () => {
    await reset({ [buyer]: 200 });
    const key = crypto.randomUUID();
    const [a, b] = await Promise.all([session(buyer), session(buyer)]);
    const results = await Promise.all([buy(a, [c30], key), buy(b, [c30], key)]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(await balance(buyer)).toBe(170);
    expect(await balance(author)).toBe(27);
  });

  it('settles one order once when two sessions pay it concurrently', async () => {
    await reset({ [buyer]: 200 });
    const before = await count("select count(*)::int as n from ledger_entries where reference_type = 'CONTENT_SALE'");
    const [a, b] = await Promise.all([session(buyer), session(buyer)]);
    const [order] = await a.unsafe('select create_purchase_order($1::uuid[], $2::uuid) as id', [[c30], crypto.randomUUID()]);
    const paid = await Promise.allSettled([
      a.unsafe('select pay_purchase_order($1::uuid)', [order.id]),
      b.unsafe('select pay_purchase_order($1::uuid)', [order.id]),
    ]);
    expect(paid.every((p) => p.status === 'fulfilled')).toBe(true);
    expect(await balance(buyer)).toBe(170);
    expect(await balance(author)).toBe(27);
    expect(await count("select count(*)::int as n from ledger_entries where reference_type = 'CONTENT_SALE'")).toBe(before + 1);
  });

  it('never overspends when two sessions race for chapters the balance cannot both cover', async () => {
    await reset({ [buyer]: 40 });
    const [a, b] = await Promise.all([session(buyer), session(buyer)]);
    const results = await Promise.all([buy(a, [c30]), buy(b, [c50])]); // 30 + 50 > 40
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)?.error).toMatch(/insufficient balance/);
    expect(await balance(buyer)).toBe(10);
  });

  it('does not deadlock when two buyers order the same two authors in opposite order', async () => {
    await reset({ [buyer]: 200, [buyer2]: 200 });
    const [a, b] = await Promise.all([session(buyer), session(buyer2)]);
    const results = await Promise.all([buy(a, [c30, c50]), buy(b, [c50, c30])]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(await balance(author)).toBe(54);
    expect(await balance(author2)).toBe(90);
    expect(await balance(buyer)).toBe(120);
    expect(await balance(buyer2)).toBe(120);
  });

  it('lets exactly one of eight sessions buy the same chapter', async () => {
    await reset({ [buyer]: 200 });
    const many = await Promise.all(Array.from({ length: 8 }, () => session(buyer)));
    const results = await Promise.all(many.map((sql) => buy(sql, [c30])));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await balance(buyer)).toBe(170);
    expect(await count('select count(*)::int as n from entitlements where user_id = $1', [buyer])).toBe(1);
  });
});
