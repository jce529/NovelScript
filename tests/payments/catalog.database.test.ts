import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Real PostgreSQL, isolated schema and outer rollback (same pattern as
// tests/admin/foundation.database.test.ts). Applies 0016 -> 0027 into a throwaway
// schema with every `public.` reference rewritten, so the shared public schema is
// never written. Skips without SUPABASE_DB_URL; a skip is NOT a pass (05-07 Task 1
// owns the live run).
describe.skipIf(!process.env.SUPABASE_DB_URL)('payment top-up tiers migration (PostgreSQL)', () => {
  const sql = postgres(process.env.SUPABASE_DB_URL!, { max: 1, prepare: false });
  const schema = `pay_tiers_test_${crypto.randomUUID().replaceAll('-', '')}`;
  const exec = (query: string) => sql.unsafe(query);
  const query = (text: string, params: unknown[] = []) =>
    sql.unsafe(text, params as postgres.ParameterOrJSON<never>[]);

  const buyer = '50000000-0000-4000-8000-000000000001';
  const legacyOrder = 'ns_legacy_snapshot_order_0001';
  const legacyTimestamp = '2026-09-01T00:00:00.000Z';

  const apply = (file: string) => exec(readFileSync(`supabase/migrations/${file}`, 'utf8')
    .replaceAll('public.', `${schema}.`)
    .replace(/^begin;|^commit;/gm, '')
    .replace("notify pgrst, 'reload schema';", ''));

  async function scalar<T>(text: string, params: unknown[] = []): Promise<T> {
    const rows = await query(text, params);
    return Object.values(rows[0] as object)[0] as T;
  }
  async function as(role: 'authenticated' | 'anon' | 'service_role') {
    await exec('reset role');
    await query("select set_config('request.jwt.claim.sub', $1, false)", [buyer]);
    await exec(`set role ${role}`);
  }
  async function rejected(action: () => Promise<unknown>, message: string) {
    await exec('savepoint expected_failure');
    await expect(action()).rejects.toThrow(message);
    await exec('rollback to savepoint expected_failure');
  }

  beforeAll(async () => {
    await exec(`
      begin;
      create schema ${schema};
      set search_path = ${schema}, public;
      create table ${schema}.profiles(id uuid primary key);
      grant usage on schema ${schema} to anon, authenticated, service_role;
      alter default privileges in schema ${schema} grant all on tables to anon, authenticated, service_role;
    `);
    await apply('0016_payments.sql');
    await query('insert into profiles(id) values ($1)', [buyer]);
    // Pre-0027 order with a historical snapshot that differs from today's price.
    await query(`insert into payment_orders(order_id, user_id, tier_id, amount_krw, token_amount, credited_at)
      values ($1, $2, 't300', 2900, 300, $3::timestamptz)`, [legacyOrder, buyer, legacyTimestamp]);
    await apply('0027_payment_topup_tiers.sql');
  });
  afterAll(async () => {
    try { await exec('rollback'); } finally { await sql.end(); }
  });
  beforeEach(async () => { await exec('savepoint fixture'); });
  afterEach(async () => { await exec('rollback to savepoint fixture; reset role'); });

  it('seeds exactly the four current bundles in order', async () => {
    const rows = await query('select id, tokens::int as tokens, price_krw, is_active, label from payment_topup_tiers order by sort_order, id');
    expect(rows.map((row) => ({ ...row }))).toEqual([
      { id: 't100', tokens: 100, price_krw: 1000, is_active: true, label: null },
      { id: 't300', tokens: 300, price_krw: 2850, is_active: true, label: null },
      { id: 't550', tokens: 550, price_krw: 5000, is_active: true, label: null },
      { id: 't1000', tokens: 1000, price_krw: 9000, is_active: true, label: null },
    ]);
  });

  it('preserves the pre-existing order snapshot and timestamps', async () => {
    const [row] = await query('select tier_id, amount_krw, token_amount::int as token_amount, credited_at from payment_orders where order_id = $1', [legacyOrder]);
    expect({ ...row, credited_at: (row.credited_at as Date).toISOString() }).toEqual({
      tier_id: 't300', amount_krw: 2900, token_amount: 300, credited_at: legacyTimestamp,
    });
    await as('service_role');
    await query("update payment_topup_tiers set price_krw = 3100, tokens = 320 where id = 't300'");
    await exec('reset role');
    expect(await scalar<number>('select amount_krw from payment_orders where order_id = $1', [legacyOrder])).toBe(2900);
  });

  it('accepts orders for a newly added bundle and rejects unregistered IDs via FK', async () => {
    await query("insert into payment_topup_tiers(id, tokens, price_krw, sort_order, label) values ('evt_autumn', 1200, 9900, 50, '가을 한정')");
    await query(`insert into payment_orders(order_id, user_id, tier_id, amount_krw, token_amount)
      values ('ns_new_bundle_order_001', $1, 'evt_autumn', 9900, 1200)`, [buyer]);
    await rejected(() => query(`insert into payment_orders(order_id, user_id, tier_id, amount_krw, token_amount)
      values ('ns_unknown_tier_order_01', $1, 't999', 1000, 100)`, [buyer]), 'foreign key');
    await rejected(() => query("delete from payment_topup_tiers where id = 'evt_autumn'"), 'foreign key');
    await rejected(() => query("update payment_topup_tiers set id = 'evt_renamed' where id = 'evt_autumn'"), 'foreign key');
  });

  it('rejects invalid prices, tokens, IDs, labels and windows', async () => {
    await rejected(() => query("insert into payment_topup_tiers(id, tokens, price_krw) values ('neg_price', 10, -1)"), 'check constraint');
    await rejected(() => query("insert into payment_topup_tiers(id, tokens, price_krw) values ('zero_tok', 0, 100)"), 'check constraint');
    await rejected(() => query("insert into payment_topup_tiers(id, tokens, price_krw) values ('huge_tok', 9007199254740992, 100)"), 'check constraint');
    await rejected(() => query("insert into payment_topup_tiers(id, tokens, price_krw) values ('bad id', 10, 100)"), 'check constraint');
    await rejected(() => query(`insert into payment_topup_tiers(id, tokens, price_krw, label) values ('long_label', 10, 100, repeat('x', 81))`), 'check constraint');
    await rejected(() => query(`insert into payment_topup_tiers(id, tokens, price_krw, starts_at, ends_at)
      values ('bad_sale', 10, 100, now(), now() - interval '1 day')`), 'check constraint');
    await rejected(() => query(`insert into payment_topup_tiers(id, tokens, price_krw, label, label_starts_at, label_ends_at)
      values ('bad_label', 10, 100, 'x', now(), now())`), 'check constraint');
  });

  it('denies anon/authenticated reads and writes but lets service_role operate', async () => {
    for (const role of ['anon', 'authenticated'] as const) {
      await as(role);
      await rejected(() => query('select count(*) from payment_topup_tiers'), 'permission denied');
      await rejected(() => query("insert into payment_topup_tiers(id, tokens, price_krw) values ('self_made', 1000000, 1)"), 'permission denied');
      await rejected(() => query("update payment_topup_tiers set price_krw = 1 where id = 't100'"), 'permission denied');
      await rejected(() => query("delete from payment_topup_tiers where id = 't100'"), 'permission denied');
    }
    await as('service_role');
    await query("insert into payment_topup_tiers(id, tokens, price_krw, sort_order) values ('ops_bundle', 2000, 17000, 60)");
    await query("update payment_topup_tiers set label = '이벤트', label_ends_at = now() + interval '7 days' where id = 'ops_bundle'");
    expect(await scalar<number>('select count(*)::int from payment_topup_tiers')).toBe(5);
    await query("delete from payment_topup_tiers where id = 'ops_bundle'");
  });
});
