import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it } from 'vitest';

// Real PostgreSQL engine in-process: no shared Supabase data or credentials.
describe('commerce migrations and authorization (PostgreSQL)', () => {
  let db: PGlite;
  const owner = '10000000-0000-4000-8000-000000000001';
  const reader = '10000000-0000-4000-8000-000000000002';
  const other = '10000000-0000-4000-8000-000000000003';
  const work = '20000000-0000-4000-8000-000000000001';
  const paid = '30000000-0000-4000-8000-000000000001';
  const free = '30000000-0000-4000-8000-000000000002';
  const second = '30000000-0000-4000-8000-000000000003';
  const key = '40000000-0000-4000-8000-000000000001';
  async function scalar<T>(query: string, params: unknown[] = []): Promise<T> {
    const result = await db.query(query, params);
    return Object.values(result.rows[0] as object)[0] as T;
  }
  async function asUser(id: string, role = 'authenticated') {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    await db.exec(`set role ${role}`);
  }
  const createOrder = (ids = [paid], requestKey = key) => scalar<string>(
    'select create_purchase_order($1::uuid[], $2::uuid)', [ids, requestKey]);
  const pay = (id: string) => scalar('select pay_purchase_order($1::uuid)', [id]);
  const canRead = (chapter: string | null = paid) => scalar<boolean>(
    'select can_view($1::uuid, $2::uuid)', [work, chapter]);

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth, public to anon, authenticated, service_role;
      grant execute on function auth.uid() to anon, authenticated, service_role;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    `);
    for (const file of ['0001_init.sql', '0002_studio.sql', '0003_reader.sql', '0004_kb_custom_folders.sql', '0005_commerce.sql']) {
      // gen_random_uuid is built into PostgreSQL; PGlite does not bundle pgcrypto.
      await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8')
        .replace('create extension if not exists "pgcrypto";', ''));
    }
  });
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => {
    await db.exec('begin');
    await db.query('insert into auth.users(id) values ($1),($2),($3)', [owner, reader, other]);
    await db.query("insert into works(id, owner_id, title) values ($1,$2,'Work')", [work, owner]);
    await db.query(`insert into chapters(id,work_id,title,content,order_index,is_published,price_tier)
      values ($1,$4,'Paid','secret',0,true,30), ($2,$4,'Free','free text',1,true,null),
        ($3,$4,'Second','second secret',2,true,50)`, [paid, free, second, work]);
    await db.query('update wallets set balance = 100 where id = $1', [reader]);
    await asUser(reader);
  });
  afterEach(async () => { await db.exec('rollback; reset role'); });

  it('keeps grants sparse and allows free content without an account', async () => {
    expect(await scalar('select count(*)::int from entitlements')).toBe(0);
    await asUser('', 'anon');
    expect(await canRead(free)).toBe(true);
    expect(await canRead()).toBe(false);
    expect(await scalar('select read_chapter_content($1)', [free])).toBe('free text');
    expect(await scalar('select read_chapter_content($1)', [paid])).toBeNull();
  });

  it('does not grant pending orders; snapshots prices; pays multiple items atomically', async () => {
    const id = await createOrder([paid, second]);
    expect(await canRead()).toBe(false);
    await db.exec('reset role');
    await db.query('update chapters set price_tier = 100 where id = $1', [paid]);
    await asUser(reader);
    await pay(id);
    expect(await scalar('select total_amount::int from orders where id = $1', [id])).toBe(80);
    expect(await scalar('select balance::int from wallets where id = $1', [reader])).toBe(20);
    expect(await scalar('select count(*)::int from entitlements')).toBe(2);
    expect(await canRead()).toBe(true);
    expect(await canRead(null)).toBe(false);
    expect(await scalar('select read_chapter_content($1)', [paid])).toBe('secret');
  });

  it('retries creation and settlement without another charge or grant', async () => {
    const id = await createOrder();
    expect(await createOrder()).toBe(id);
    await pay(id);
    await pay(id);
    expect(await createOrder()).toBe(id);
    expect(await scalar('select balance::int from wallets where id = $1', [reader])).toBe(70);
    expect(await scalar('select count(*)::int from entitlements')).toBe(1);
  });

  // Savepoints allow checking the persisted state after an expected SQL error.
  async function rejected(action: () => Promise<unknown>, message: string) {
    await db.exec('savepoint expected_failure');
    await expect(action()).rejects.toThrow(message);
    await db.exec('rollback to savepoint expected_failure');
  }

  it('rolls back debit and PAID when entitlement insertion fails', async () => {
    const id = await createOrder();
    await db.exec(`reset role;
      create function test_reject_grant() returns trigger language plpgsql as
        $$ begin raise exception 'grant_failed'; end $$;
      create trigger test_reject_grant before insert on entitlements
        for each row execute function test_reject_grant();`);
    await asUser(reader);
    await rejected(() => pay(id), 'grant_failed');
    expect(await scalar('select status from orders where id=$1', [id])).toBe('PENDING');
    expect(await scalar('select balance::int from wallets where id=$1', [reader])).toBe(100);
    expect(await scalar('select count(*)::int from ledger_entries')).toBe(0);
  });

  it('leaves insufficient-balance orders pending and grants nothing', async () => {
    const id = await createOrder();
    await db.exec('reset role');
    await db.query('update wallets set balance=0 where id=$1', [reader]);
    await asUser(reader);
    await rejected(() => pay(id), 'insufficient balance');
    expect(await scalar('select status from orders where id=$1', [id])).toBe('PENDING');
    expect(await scalar('select count(*)::int from entitlements')).toBe(0);
  });

  it('rejects cross-user payment and hides order history', async () => {
    const id = await createOrder();
    await asUser(other);
    expect(await scalar('select count(*)::int from orders')).toBe(0);
    expect(await scalar('select count(*)::int from order_items')).toBe(0);
    await rejected(() => pay(id), 'order_not_found');
    expect(await canRead()).toBe(false);
  });

  it('blocks direct paid content access, forged grants and wallet minting', async () => {
    expect(await scalar('select count(id)::int from chapters')).toBe(3);
    await rejected(() => db.query('select content from chapters where id=$1', [paid]), 'permission denied');
    await rejected(() => db.query("insert into entitlements(user_id,work_id,entitlement_type,source_type,source_id) values($1,$2,'PERMANENT','PROMOTION','fake')", [reader, work]), 'permission denied');
    await rejected(() => db.query("select apply_wallet_delta($1,100,'fake','fake','fake')", [reader]), 'permission denied');
  });

  it('supports work-wide grants, time boundaries and independent revocation', async () => {
    await db.exec('reset role');
    await db.query(`insert into entitlements(user_id,work_id,entitlement_type,starts_at,expires_at,source_type,source_id)
      values($1,$2,'RENTAL',now()+interval '1 hour',now()+interval '2 hours','PROMOTION','promo')`, [reader, work]);
    await asUser(reader);
    expect(await canRead()).toBe(false);
    await db.exec("reset role; update entitlements set starts_at=now()-interval '1 hour', expires_at=now()");
    await asUser(reader);
    expect(await canRead()).toBe(false);
    await db.exec('reset role; update entitlements set starts_at=now(), expires_at=null');
    await asUser(reader);
    expect(await canRead(null)).toBe(true);
    expect(await canRead(second)).toBe(true);
    await db.exec('reset role; update entitlements set revoked_at=now()');
    await asUser(reader);
    expect(await canRead()).toBe(false);
  });

  it('preserves owner draft reads but prevents readers and deleted accounts', async () => {
    await db.exec('reset role');
    await db.query('update chapters set is_published=false where id=$1', [paid]);
    await asUser(owner);
    expect(await scalar('select read_chapter_content($1)', [paid])).toBe('secret');
    await asUser(reader);
    expect(await scalar('select read_chapter_content($1)', [paid])).toBeNull();
    await db.exec('reset role');
    await db.query('update profiles set deleted_at=now() where id=$1', [reader]);
    await asUser(reader);
    await rejected(() => createOrder(), 'authentication_required');
  });

  it('rejects mismatched retry payloads, duplicate targets and competing orders', async () => {
    const id = await createOrder();
    await rejected(() => createOrder([second]), 'idempotency_conflict');
    await rejected(() => createOrder([paid, paid]), 'invalid_items');
    const competing = await createOrder([paid], crypto.randomUUID());
    await pay(id);
    await rejected(() => pay(competing), 'content_unavailable_or_owned');
    expect(await scalar('select balance::int from wallets where id=$1', [reader])).toBe(70);
  });
});
