import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Real PostgreSQL, isolated schema and outer rollback (same pattern as the other admin DB
// suites). Exercises 0009 blind precedence through the API roles.
describe.skipIf(!process.env.SUPABASE_DB_URL)('blind access migration (PostgreSQL)', () => {
  const sql = postgres(process.env.SUPABASE_DB_URL!, { max: 1, prepare: false });
  const schema = `blind_test_${crypto.randomUUID().replaceAll('-', '')}`;
  const exec = (query: string) => sql.unsafe(query);
  const query = (text: string, params: unknown[] = []) =>
    sql.unsafe(text, params as postgres.ParameterOrJSON<never>[]);

  const writer = '10000000-0000-4000-8000-000000000001';
  const reader = '10000000-0000-4000-8000-000000000002';
  const other = '10000000-0000-4000-8000-000000000003';
  const work = '20000000-0000-4000-8000-000000000001';
  const otherWork = '20000000-0000-4000-8000-000000000002';
  const freeChapter = '30000000-0000-4000-8000-000000000001';
  const paidChapter = '30000000-0000-4000-8000-000000000002';
  const ownedChapter = '30000000-0000-4000-8000-000000000003';
  const draftChapter = '30000000-0000-4000-8000-000000000004';
  const otherChapter = '30000000-0000-4000-8000-000000000005';

  async function scalar<T>(text: string, params: unknown[] = []): Promise<T> {
    const rows = await query(text, params);
    return Object.values(rows[0] as object)[0] as T;
  }
  async function as(id: string, role: 'authenticated' | 'anon' | 'service_role' = 'authenticated') {
    await exec('reset role');
    await query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    await exec(`set role ${role}`);
  }
  async function asOwner() {
    await exec('reset role');
  }
  async function rejected(action: () => Promise<unknown>, message: string) {
    await exec('savepoint expected_failure');
    await expect(action()).rejects.toThrow(message);
    await exec('rollback to savepoint expected_failure');
  }
  /** Uses the single 0007 blind write path (admin operations wrap it with audit). */
  async function blind(chapter: string | null, reason: string | null = '검토 사유') {
    await asOwner();
    await query('select moderation_set_blind($1, $2, $3)', [work, chapter, reason]);
  }
  const unblind = (chapter: string | null) => blind(chapter, null);
  async function financialSnapshot() {
    await asOwner();
    return scalar<string>(`select md5(concat_ws('|',
      (select string_agg(id::text || coalesce(revoked_at::text, '') || coalesce(expires_at::text, ''), ',' order by id) from entitlements),
      (select string_agg(id::text || status || coalesce(paid_at::text, ''), ',' order by id) from orders),
      (select string_agg(id::text, ',' order by id) from ledger_entries),
      (select string_agg(id::text || balance::text, ',' order by id) from wallets)))`);
  }
  async function state(user: string, chapter: string, workId = work) {
    await as(user, user ? 'authenticated' : 'anon');
    return (await scalar<{ state: string; entitled: boolean; blind_scope: string | null; blind_reason: string | null }>(
      'select get_chapter_access_state($1, $2)', [workId, chapter]));
  }

  beforeAll(async () => {
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
    for (const migration of ['0001_init.sql', '0002_studio.sql', '0003_reader.sql', '0004_kb_custom_folders.sql',
      '0005_commerce.sql', '0006_admin_foundation.sql', '0007_admin_operations.sql',
      '0008_sanction_enforcement.sql', '0009_blind_access.sql']) {
      await exec(readFileSync(`supabase/migrations/${migration}`, 'utf8')
        .replace('create extension if not exists "pgcrypto";', '')
        .replaceAll('auth.users', `${schema}.test_users`)
        .replaceAll('search_path = public', `search_path = ${schema}, public`)
        .replace(/^begin;|^commit;/gm, ''));
    }
  });
  afterAll(async () => {
    try { await exec('rollback'); } finally { await sql.end(); }
  });
  beforeEach(async () => {
    await exec('savepoint fixture');
    await query('insert into test_users(id) values ($1),($2),($3)', [writer, reader, other]);
    await query("update profiles set role = 'writer', pen_name = 'W' || right(id::text, 4) where id in ($1, $2)", [writer, other]);
    await query('update wallets set balance = 500 where id in ($1, $2)', [writer, reader]);
    await query("insert into works(id, owner_id, title) values ($1, $2, 'Work'), ($3, $4, 'Other')",
      [work, writer, otherWork, other]);
    await query(`insert into chapters(id, work_id, title, content, order_index, is_published, price_tier)
      values ($1, $5, 'Free', 'free body', 0, true, null),
             ($2, $5, 'Paid', 'paid body', 1, true, 30),
             ($3, $5, 'Owned', 'owned body', 2, true, 10),
             ($4, $5, 'Draft', 'draft body', 3, false, null)`,
    [freeChapter, paidChapter, ownedChapter, draftChapter, work]);
    await query(`insert into chapters(id, work_id, title, content, order_index, is_published, price_tier)
      values ($1, $2, 'Other', 'other body', 0, true, null)`, [otherChapter, otherWork]);
    await as(reader);
    const order = await scalar<string>('select create_purchase_order($1::uuid[], gen_random_uuid())', [[ownedChapter]]);
    await query('select pay_purchase_order($1)', [order]);
    await asOwner();
  });
  afterEach(async () => { await exec('rollback to savepoint fixture; reset role'); });

  it('reports readable, purchase and entitled state before any blind (control)', async () => {
    expect(await state(reader, freeChapter)).toMatchObject({ state: 'readable', entitled: false, blind_scope: null });
    expect(await state(reader, paidChapter)).toMatchObject({ state: 'purchase_required', entitled: false });
    expect(await state(reader, ownedChapter)).toMatchObject({ state: 'readable', entitled: true });
    expect(await state('', paidChapter)).toMatchObject({ state: 'purchase_required' });
    await as(reader);
    expect(await scalar<string>('select read_chapter_content($1)', [ownedChapter])).toBe('owned body');
  });

  it('blocks a blinded free chapter for anon and readers while keeping its TOC row', async () => {
    await blind(freeChapter);
    for (const user of ['', reader]) {
      await as(user, user ? 'authenticated' : 'anon');
      expect(await scalar<string | null>('select read_chapter_content($1)', [freeChapter])).toBeNull();
      expect(await scalar<boolean>('select can_view($1, $2)', [work, freeChapter])).toBe(false);
      const toc = await query('select chapter_id, allowed, blinded, blind_reason from list_chapter_access($1)', [work]);
      expect(toc).toHaveLength(3);
      expect(toc.find((r) => r.chapter_id === freeChapter)).toMatchObject({ allowed: false, blinded: true, blind_reason: '검토 사유' });
      await as(user, user ? 'authenticated' : 'anon');
      // Metadata stays visible through direct queries; the body column never is.
      expect(await scalar<boolean>('select admin_blinded from chapters where id = $1', [freeChapter])).toBe(true);
      await rejected(() => query('select content from chapters where id = $1', [freeChapter]), 'permission denied');
    }
    expect(await state(reader, freeChapter)).toMatchObject({ state: 'blinded', blind_scope: 'chapter', blind_reason: '검토 사유' });
  });

  it('blocks a blinded owned paid chapter without touching the entitlement, and restores it on unblind', async () => {
    const before = await financialSnapshot();
    await blind(ownedChapter);
    await as(reader);
    expect(await scalar<string | null>('select read_chapter_content($1)', [ownedChapter])).toBeNull();
    expect(await state(reader, ownedChapter)).toMatchObject({ state: 'blinded', entitled: true });
    await as(reader);
    const row = (await query('select allowed, entitled, blinded from list_chapter_access($1) where chapter_id = $2', [work, ownedChapter]))[0];
    expect(row).toMatchObject({ allowed: false, entitled: true, blinded: true });
    // A blind is not an invitation to pay: purchase is refused before any order is created.
    await rejected(() => query('select create_purchase_order($1::uuid[], gen_random_uuid())', [[ownedChapter]]), 'content_blinded');
    expect(await financialSnapshot()).toBe(before);

    await unblind(ownedChapter);
    await as(reader);
    expect(await scalar<string>('select read_chapter_content($1)', [ownedChapter])).toBe('owned body');
    expect(await state(reader, ownedChapter)).toMatchObject({ state: 'readable', entitled: true });
    expect(await financialSnapshot()).toBe(before);
  });

  it('applies a work-wide blind to every chapter, work-wide checks and purchases', async () => {
    await blind(null, '작품 검토');
    await as(reader);
    for (const chapter of [freeChapter, paidChapter, ownedChapter]) {
      expect(await scalar<string | null>('select read_chapter_content($1)', [chapter])).toBeNull();
    }
    expect(await scalar<boolean>('select can_view($1)', [work])).toBe(false);
    const toc = await query('select chapter_id, allowed, blinded, blind_reason from list_chapter_access($1)', [work]);
    expect(toc).toHaveLength(3);
    expect(toc.every((r) => r.blinded && !r.allowed && r.blind_reason === '작품 검토')).toBe(true);
    expect(await state(reader, paidChapter)).toMatchObject({ state: 'blinded', blind_scope: 'work', blind_reason: '작품 검토' });
    await as(reader);
    await rejected(() => query('select create_purchase_order($1::uuid[], gen_random_uuid())', [[paidChapter]]), 'content_blinded');
    // Other works are unaffected.
    expect(await scalar<string>('select read_chapter_content($1)', [otherChapter])).toBe('other body');
    await unblind(null);
    await as(reader);
    expect(await scalar<string>('select read_chapter_content($1)', [freeChapter])).toBe('free body');
  });

  it('rejects settlement of an order created before the blind without debit, then settles after unblind', async () => {
    await as(reader);
    const order = await scalar<string>('select create_purchase_order($1::uuid[], gen_random_uuid())', [[paidChapter]]);
    const before = await financialSnapshot();
    await blind(paidChapter);
    await as(reader);
    await rejected(() => query('select pay_purchase_order($1)', [order]), 'content_blinded');
    expect(await financialSnapshot()).toBe(before);
    await asOwner();
    expect(await scalar<string>('select status from orders where id = $1', [order])).toBe('PENDING');
    expect(await scalar<string>('select balance::text from wallets where id = $1', [reader])).toBe('490');

    // Work-wide blind also rejects the pending settlement.
    await unblind(paidChapter);
    await blind(null);
    await as(reader);
    await rejected(() => query('select pay_purchase_order($1)', [order]), 'content_blinded');
    expect(await financialSnapshot()).toBe(before);

    await unblind(null);
    await as(reader);
    await query('select pay_purchase_order($1)', [order]);
    await asOwner();
    expect(await scalar<string>('select balance::text from wallets where id = $1', [reader])).toBe('460');
    expect(await scalar<string>('select status from orders where id = $1', [order])).toBe('PAID');
  });

  it('keeps an already PAID order idempotent after a blind (no second debit)', async () => {
    await as(reader);
    const order = await scalar<string>('select create_purchase_order($1::uuid[], gen_random_uuid())', [[paidChapter]]);
    await query('select pay_purchase_order($1)', [order]);
    const before = await financialSnapshot();
    await blind(paidChapter);
    await as(reader);
    expect(await scalar<string>('select pay_purchase_order($1)', [order])).toBe(order);
    expect(await financialSnapshot()).toBe(before);
  });

  it('keeps owner correction access (published and draft) while viewer state stays blinded', async () => {
    await blind(paidChapter);
    await as(writer);
    expect(await scalar<string>('select read_chapter_content($1)', [paidChapter])).toBe('paid body');
    expect(await scalar<string>('select read_chapter_content($1)', [draftChapter])).toBe('draft body');
    expect(await state(writer, paidChapter)).toMatchObject({ state: 'blinded' });
    // Owners can edit and re-publish, but cannot clear the blind (D-11/D-15).
    await as(writer);
    await query("update chapters set content = 'fixed body', is_published = false where id = $1", [paidChapter]);
    await query('update chapters set is_published = true, published_at = now() where id = $1', [paidChapter]);
    await rejected(() => query('update chapters set admin_blinded = false where id = $1', [paidChapter]), 'permission denied');
    await rejected(() => query('update works set admin_blinded = false where id = $1', [work]), 'permission denied');
    await asOwner();
    expect(await scalar<boolean>('select admin_blinded from chapters where id = $1', [paidChapter])).toBe(true);
    // Non-owners (other writer, anon) get no body; service role reads for moderation remain.
    await as(other);
    expect(await scalar<string | null>('select read_chapter_content($1)', [paidChapter])).toBeNull();
    await as('', 'anon');
    expect(await scalar<string | null>('select read_chapter_content($1)', [draftChapter])).toBeNull();
    await as('', 'service_role');
    expect(await scalar<string>('select content from chapters where id = $1', [paidChapter])).toBe('fixed body');
  });

  it('treats wrong work/chapter pairs, drafts and unknown chapters as unavailable', async () => {
    expect(await state(reader, otherChapter, work)).toMatchObject({ state: 'unavailable', entitled: false });
    expect(await state(reader, freeChapter, otherWork)).toMatchObject({ state: 'unavailable' });
    expect(await state(reader, draftChapter)).toMatchObject({ state: 'unavailable' });
    expect(await state(reader, '30000000-0000-4000-8000-00000000ffff')).toMatchObject({ state: 'unavailable' });
    await as(reader);
    expect(await scalar<boolean>('select can_view($1, $2)', [work, otherChapter])).toBe(false);
    await blind(null);
    // Blinding one work never leaks state across a mismatched pair either.
    expect(await state(reader, otherChapter, work)).toMatchObject({ state: 'unavailable', blind_reason: null });
  });

  it('does not expose the internal entitlement helper to API roles', async () => {
    for (const role of ['anon', 'authenticated'] as const) {
      await as(reader, role);
      await rejected(() => query('select chapter_entitled($1, $2)', [work, ownedChapter]), 'permission denied');
    }
  });
});
