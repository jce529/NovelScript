import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/0015_author_settlement.sql', 'utf8');

// Static guards that run without a database: they pin the invariants the DB test proves live.
describe('0015 author settlement migration (static)', () => {
  it('keeps the provisional 90/10 rate in exactly one adjustable place', () => {
    expect(migration.match(/\b9000\b/g)).toHaveLength(1);
    expect(migration).toMatch(/settlement_author_rate_bps\(\) returns integer[\s\S]*select 9000/);
  });
  it('snapshots the split on order_items and requires author + platform = price', () => {
    expect(migration).toContain('author_amount + platform_fee = price');
  });
  it('credits authors through the idempotent ledger inside the same RPC as the buyer debit', () => {
    const body = migration.slice(migration.indexOf('create or replace function pay_purchase_order'));
    expect(body.indexOf("'CONTENT_ORDER'")).toBeGreaterThan(0);
    expect(body.indexOf("'CONTENT_SALE'")).toBeGreaterThan(body.indexOf("'CONTENT_ORDER'"));
    expect(body.indexOf("set status = 'PAID'")).toBeGreaterThan(body.indexOf("'CONTENT_SALE'"));
  });
  it('locks buyer and author wallets in id order to avoid cross-purchase deadlocks', () => {
    expect(migration).toMatch(/from wallets[\s\S]*order by id for update/);
  });
});

describe.skipIf(!process.env.SUPABASE_DB_URL)('author settlement (PostgreSQL)', () => {
  const sql = postgres(process.env.SUPABASE_DB_URL!, { max: 1, prepare: false });
  const schema = `settle_test_${crypto.randomUUID().replaceAll('-', '')}`;
  const exec = (q: string) => sql.unsafe(q);
  const query = (q: string, p: unknown[] = []) => sql.unsafe(q, p as postgres.ParameterOrJSON<never>[]);
  const author = '10000000-0000-4000-8000-000000000001';
  const buyer = '10000000-0000-4000-8000-000000000002';
  const author2 = '10000000-0000-4000-8000-000000000003';
  const work = '20000000-0000-4000-8000-000000000001';
  const work2 = '20000000-0000-4000-8000-000000000002';
  const c1 = '30000000-0000-4000-8000-000000000001';
  const c2 = '30000000-0000-4000-8000-000000000002';
  const c3 = '30000000-0000-4000-8000-000000000003';
  const key = '40000000-0000-4000-8000-000000000001';
  async function asUser(id: string) {
    await exec('reset role');
    await query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    await exec('set role authenticated');
  }
  async function balance(id: string) {
    await exec('reset role');
    const [row] = await query('select balance::int as b from wallets where id = $1', [id]);
    await asUser(buyer);
    return row.b as number;
  }
  async function buy(ids: string[]) {
    const [o] = await query('select create_purchase_order($1::uuid[], $2::uuid) as id', [ids, key]);
    await query('select pay_purchase_order($1::uuid)', [o.id]);
    return o.id as string;
  }

  beforeAll(async () => {
    await exec(`begin; create schema ${schema}; set search_path = ${schema}, public;
      create table ${schema}.test_users(id uuid primary key);
      grant usage on schema ${schema} to anon, authenticated, service_role;`);
    const files = ['0001_init', '0002_studio', '0003_reader', '0004_kb_custom_folders', '0005_commerce',
      '0006_admin_foundation', '0007_admin_operations', '0008_sanction_enforcement', '0009_blind_access', '0015_author_settlement'];
    for (const file of files) {
      if (file === '0005_commerce') {
        await exec(`grant all on all tables in schema ${schema} to anon, authenticated, service_role;
          grant all on all sequences in schema ${schema} to anon, authenticated, service_role;`);
      }
      await exec(readFileSync(`supabase/migrations/${file}.sql`, 'utf8')
        .replace('create extension if not exists "pgcrypto";', '')
        .replaceAll('auth.users', `${schema}.test_users`)
        .replaceAll('search_path = public', `search_path = ${schema}, public`)
        .replace(/^begin;|^commit;/gm, ''));
    }
  });
  afterAll(async () => { try { await exec('rollback'); } finally { await sql.end(); } });
  beforeEach(async () => {
    await exec('savepoint fixture');
    await query('insert into test_users(id) values ($1),($2),($3)', [author, buyer, author2]);
    await query("insert into works(id, owner_id, title) values ($1,$3,'A'),($2,$4,'B')", [work, work2, author, author2]);
    await query(`insert into chapters(id,work_id,title,content,order_index,is_published,price_tier)
      values ($1,$4,'c1','x',0,true,30), ($2,$4,'c2','x',1,true,3), ($3,$5,'c3','x',0,true,50)`, [c1, c2, c3, work, work2]);
    await query('update wallets set balance = 200 where id = $1', [buyer]);
    await asUser(buyer);
  });
  afterEach(async () => { await exec('rollback to savepoint fixture; reset role'); });

  it('debits the buyer, credits the author 90%, and snapshots the split', async () => {
    const order = await buy([c1]);
    expect(await balance(buyer)).toBe(170);
    expect(await balance(author)).toBe(27);
    await exec('reset role');
    const [item] = await query('select author_id, author_rate_bps, author_amount::int a, platform_fee::int f from order_items where order_id = $1', [order]);
    expect(item).toMatchObject({ author_id: author, author_rate_bps: 9000, a: 27, f: 3 });
  });
  it('rounds the author share down so author + platform always equals the price', async () => {
    const order = await buy([c2]); // price 3 -> author 2, platform 1
    expect(await balance(author)).toBe(2);
    await exec('reset role');
    const [item] = await query('select author_amount::int a, platform_fee::int f from order_items where order_id = $1', [order]);
    expect(item).toMatchObject({ a: 2, f: 1 });
  });
  it('aggregates one credit per author across a multi-author order', async () => {
    await buy([c1, c2, c3]);
    expect(await balance(buyer)).toBe(200 - 83);
    expect(await balance(author)).toBe(27 + 2);
    expect(await balance(author2)).toBe(45);
    await exec('reset role');
    const [{ n }] = await query("select count(*)::int n from ledger_entries where reference_type = 'CONTENT_SALE'");
    expect(n).toBe(2);
  });
  it('does not credit the author again when settlement is retried', async () => {
    const order = await buy([c1]);
    await query('select pay_purchase_order($1::uuid)', [order]);
    expect(await balance(buyer)).toBe(170);
    expect(await balance(author)).toBe(27);
  });
  it('credits nobody when the buyer cannot afford the order', async () => {
    await exec('reset role');
    await query('update wallets set balance = 10 where id = $1', [buyer]);
    await asUser(buyer);
    await expect(buy([c1])).rejects.toThrow(/insufficient balance/);
    expect(await balance(author)).toBe(0);
  });
});
