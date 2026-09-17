import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Real PostgreSQL, isolated schema and outer rollback (same pattern as
// tests/commerce/database.test.ts). Default privileges emulate Supabase's grants on new
// public objects so the migration's explicit revokes are actually exercised.
describe.skipIf(!process.env.SUPABASE_DB_URL)('admin foundation migration (PostgreSQL)', () => {
  const sql = postgres(process.env.SUPABASE_DB_URL!, { max: 1, prepare: false });
  const schema = `admin_test_${crypto.randomUUID().replaceAll('-', '')}`;
  const exec = (query: string) => sql.unsafe(query);
  const query = (text: string, params: unknown[] = []) =>
    sql.unsafe(text, params as postgres.ParameterOrJSON<never>[]);

  const writer = '10000000-0000-4000-8000-000000000001';
  const reader = '10000000-0000-4000-8000-000000000002';
  const admin = '10000000-0000-4000-8000-000000000003';
  const otherWriter = '10000000-0000-4000-8000-000000000004';
  const work = '20000000-0000-4000-8000-000000000001';
  const otherWork = '20000000-0000-4000-8000-000000000002';
  const chapter = '30000000-0000-4000-8000-000000000001';
  const otherChapter = '30000000-0000-4000-8000-000000000002';

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
  async function grantAdmin(id: string) {
    await asOwner();
    return scalar<string>("select grant_admin($1, 'test grant', 'vitest')", [id]);
  }
  async function auditAction(actor: string, target: string, type: string) {
    await asOwner();
    return scalar<string>(
      `insert into admin_actions(actor_id, action_type, target_user_id, reason)
       values ($1, $2, $3, 'audit') returning id`, [actor, type, target]);
  }
  async function sanction(kind: string, endsAt: string | null = null, target = writer) {
    const type = { warning: 'user_warn', suspension: 'user_suspend',
      permanent_suspension: 'user_permanent_suspend', lift: 'user_sanction_lift' }[kind]!;
    const action = await auditAction(admin, target, type);
    await as(admin, 'service_role');
    return scalar<string>(
      'select apply_user_sanction($1, $2, $3, $4, null, $5::timestamptz, $6)',
      [admin, target, kind, `${kind} reason`, endsAt, action]);
  }
  async function cache(id = writer) {
    await asOwner();
    const [row] = await query('select sanction_kind, sanctioned_until from profiles where id = $1', [id]);
    return row as unknown as { sanction_kind: string; sanctioned_until: Date | null };
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
    for (const file of ['0001_init.sql', '0002_studio.sql', '0003_reader.sql',
      '0004_kb_custom_folders.sql', '0005_commerce.sql', '0006_admin_foundation.sql']) {
      await exec(readFileSync(`supabase/migrations/${file}`, 'utf8')
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
    await query('insert into test_users(id) values ($1),($2),($3),($4)', [writer, reader, admin, otherWriter]);
    await query("update profiles set role = 'writer', pen_name = 'W' || right(id::text, 4) where id in ($1, $2)",
      [writer, otherWriter]);
    await query("insert into works(id, owner_id, title) values ($1, $2, 'Work'), ($3, $4, 'Other')",
      [work, writer, otherWork, otherWriter]);
    await query(`insert into chapters(id, work_id, title, content, order_index, is_published)
      values ($1, $2, 'One', 'body', 0, true), ($3, $4, 'Other', 'other body', 0, true)`,
      [chapter, work, otherChapter, otherWork]);
  });
  afterEach(async () => { await exec('rollback to savepoint fixture; reset role'); });

  it('seeds no administrator without an explicitly supplied identity', async () => {
    expect(await scalar<number>('select count(*)::int from admin_users')).toBe(0);
    expect(await scalar<number>('select count(*)::int from admin_actions')).toBe(0);
  });

  it('rejects self-grant through tables and functions for every browser/service role', async () => {
    for (const role of ['anon', 'authenticated', 'service_role'] as const) {
      await as(reader, role);
      await rejected(() => query(
        "insert into admin_users(user_id, granted_by_label, grant_reason) values ($1, 'me', 'me')", [reader]),
        'permission denied');
      await rejected(() => query("select grant_admin($1, 'me', 'me')", [reader]), 'permission denied');
      await rejected(() => query("select revoke_admin($1, 'me', 'me')", [admin]), 'permission denied');
    }
    await as(reader);
    await rejected(() => query('select count(*) from admin_users'), 'permission denied');
    await rejected(() => query('select count(*) from admin_actions'), 'permission denied');
    await rejected(() => query(
      "insert into admin_actions(actor_id, action_type, reason) values ($1, 'user_warn', 'x')", [reader]),
      'permission denied');
  });

  it('records grant/revoke with audit rows and keeps membership history immutable', async () => {
    const first = await grantAdmin(admin);
    await rejected(() => grantAdmin(admin), 'admin_already_active');
    await rejected(() => scalar("select grant_admin($1, 'x', '')", [reader]), 'operator_label_required');
    await rejected(() => scalar("select grant_admin(null, 'x', 'vitest')"), 'explicit_user_id_required');
    await scalar("select revoke_admin($1, 'rotation', 'vitest')", [admin]);
    await rejected(() => scalar("select revoke_admin($1, 'again', 'vitest')", [admin]), 'admin_not_active');
    const second = await grantAdmin(admin);
    expect(second).not.toBe(first);
    expect(await scalar<number>('select count(*)::int from admin_users where user_id = $1', [admin])).toBe(2);
    expect(await scalar<string[]>(
      "select array_agg(action_type order by created_at, action_type) from admin_actions where target_user_id = $1",
      [admin])).toEqual(expect.arrayContaining(['admin_grant', 'admin_revoke']));
    await rejected(() => query('delete from admin_users where id = $1', [first]), 'admin_membership_history_immutable');
    await rejected(() => query("update admin_users set grant_reason = 'x' where id = $1", [first]),
      'admin_membership_history_immutable');
    await rejected(() => query("update admin_actions set reason = 'x'"), 'admin_actions_append_only');
    await rejected(() => query('delete from admin_actions'), 'admin_actions_append_only');
    await as(admin, 'service_role');
    expect(await scalar<number>('select count(*)::int from admin_users where revoked_at is null')).toBe(1);
  });

  it('blocks owner insert/update/upsert of moderation flags but keeps studio edits', async () => {
    await as(writer);
    // Existing editable columns still work.
    await query("update chapters set content = 'edited', updated_at = now() where id = $1", [chapter]);
    await query("update chapters set is_published = false, unpublished_at = now() where id = $1", [chapter]);
    await query("update chapters set is_published = true, price_tier = 30, published_at = now() where id = $1", [chapter]);
    await query('select reorder_chapters($1, $2::uuid[])', [work, [chapter]]);
    await query("update works set title = 'Renamed', synopsis = 's', genre = '판타지' where id = $1", [work]);
    const created = await scalar<string>("select create_work($1, 'New', null, null, null)", [writer]);
    await query("insert into chapters(work_id, title, order_index) values ($1, 'Draft', 0)", [created]);
    expect(await scalar<string>('select read_chapter_content($1)', [chapter])).toBe('edited');

    for (const table of ['works', 'chapters']) {
      const id = table === 'works' ? work : chapter;
      await rejected(() => query(`update ${table} set admin_blinded = false where id = $1`, [id]), 'permission denied');
      await rejected(() => query(`update ${table} set admin_blind_reason = null where id = $1`, [id]), 'permission denied');
    }
    await rejected(() => query(
      "insert into works(owner_id, title, admin_blinded, admin_blind_reason, admin_blinded_at) values ($1, 'x', false, null, null)",
      [writer]), 'permission denied');
    await rejected(() => query(
      "insert into works(id, owner_id, title) values ($1, $2, 'x') on conflict (id) do update set admin_blinded = false",
      [work, writer]), 'permission denied');
    await rejected(() => query(
      "insert into chapters(work_id, title, order_index, admin_blinded) values ($1, 'x', 9, false)", [work]),
      'permission denied');
    await rejected(() => query(
      "insert into chapters(id, work_id, title, order_index) values ($1, $2, 'x', 0) on conflict (id) do update set admin_blind_reason = null",
      [chapter, work]), 'permission denied');
    await rejected(() => query('update chapters set view_count = 999 where id = $1', [chapter]), 'permission denied');
    await rejected(() => query('delete from chapters where id = $1', [chapter]), 'permission denied');

    // Blind set by the privileged path survives an author re-publish.
    await asOwner();
    await query("update chapters set admin_blinded = true, admin_blind_reason = 'r', admin_blinded_at = now() where id = $1", [chapter]);
    await as(writer);
    await query('update chapters set is_published = false where id = $1', [chapter]);
    await query('update chapters set is_published = true where id = $1', [chapter]);
    expect(await scalar<boolean>('select admin_blinded from chapters where id = $1', [chapter])).toBe(true);
    await as('', 'anon');
    expect(await scalar<boolean>('select admin_blinded from chapters where id = $1', [chapter])).toBe(true);
    await rejected(() => query('select content from chapters where id = $1', [chapter]), 'permission denied');
  });

  it('keeps profile edits but protects sanction cache and deletion state from owners', async () => {
    await as(reader);
    await query("update profiles set role = 'writer', pen_name = 'Reader', pen_name_set_at = now() where id = $1", [reader]);
    await rejected(() => query("update profiles set sanction_kind = 'none' where id = $1", [reader]), 'permission denied');
    await rejected(() => query('update profiles set sanctioned_until = null where id = $1', [reader]), 'permission denied');
    await rejected(() => query('update profiles set deleted_at = null where id = $1', [reader]), 'permission denied');
    await rejected(() => query(
      "insert into profiles(id) values ($1) on conflict (id) do update set sanction_kind = 'none'", [reader]),
      'permission denied');
    // Even privileged direct writes cannot bypass the single cache path.
    await as(admin, 'service_role');
    await rejected(() => query("update profiles set sanction_kind = 'permanent_suspension' where id = $1", [reader]),
      'sanction_cache_protected');
    await asOwner();
    await rejected(() => query("update profiles set sanction_kind = 'permanent_suspension' where id = $1", [reader]),
      'sanction_cache_protected');
  });

  it('derives the cache only from history via the locked sanction function', async () => {
    await grantAdmin(admin);
    await as(writer);
    await rejected(() => query(
      "select apply_user_sanction($1, $2, 'warning', 'x', null, null, gen_random_uuid())", [admin, writer]),
      'permission denied');

    const future = new Date(Date.now() + 86_400_000).toISOString();
    const later = new Date(Date.now() + 5 * 86_400_000).toISOString();
    await sanction('suspension', later);
    expect((await cache()).sanction_kind).toBe('suspension');
    await sanction('warning');
    expect((await cache()).sanction_kind).toBe('suspension'); // warning cannot clear
    await sanction('suspension', future);
    expect((await cache()).sanctioned_until?.toISOString()).toBe(later); // shorter cannot shorten
    await sanction('permanent_suspension');
    expect(await cache()).toEqual({ sanction_kind: 'permanent_suspension', sanctioned_until: null });
    await sanction('warning');
    expect((await cache()).sanction_kind).toBe('permanent_suspension');
    await sanction('lift');
    expect(await cache()).toEqual({ sanction_kind: 'none', sanctioned_until: null });
    expect(await scalar<number>('select count(*)::int from user_sanctions where user_id = $1', [writer])).toBe(6);

    await rejected(() => sanction('suspension', new Date(Date.now() - 86_400_000).toISOString()), 'invalid_sanction_expiry');
    await rejected(() => sanction('suspension', null), 'invalid_sanction_expiry');
    await rejected(() => sanction('permanent_suspension', future), 'invalid_sanction_expiry');
    await rejected(() => sanction('warning', null, admin), 'self_sanction_forbidden');
    const wrongAudit = await auditAction(admin, writer, 'user_warn');
    await as(admin, 'service_role');
    await rejected(() => query(
      "select apply_user_sanction($1, $2, 'permanent_suspension', 'x', null, null, $3)", [admin, writer, wrongAudit]),
      'audit_action_mismatch');
    await asOwner();
    await rejected(() => query("update user_sanctions set public_reason = 'x'"), 'user_sanctions_append_only');

    await scalar("select revoke_admin($1, 'left', 'vitest')", [admin]);
    await rejected(() => sanction('warning'), 'actor_not_admin');
  });

  it('lets only the recipient acknowledge a warning', async () => {
    await grantAdmin(admin);
    const warning = await sanction('warning');
    const suspension = await sanction('suspension', new Date(Date.now() + 86_400_000).toISOString());
    await as(reader);
    await rejected(() => scalar('select acknowledge_warning($1)', [warning]), 'warning_not_found');
    await rejected(() => query('insert into warning_acknowledgements(sanction_id, user_id) values ($1, $2)', [warning, reader]),
      'permission denied');
    await as(writer);
    await rejected(() => scalar('select acknowledge_warning($1)', [suspension]), 'warning_not_found');
    expect(await scalar<boolean>('select acknowledge_warning($1)', [warning])).toBe(true);
    expect(await scalar<boolean>('select acknowledge_warning($1)', [warning])).toBe(true);
    expect(await scalar<number>('select count(*)::int from warning_acknowledgements')).toBe(1);
    expect(await scalar<number>('select count(*)::int from user_sanctions')).toBe(2);
    await rejected(() => query('select internal_note from user_sanctions'), 'permission denied');
    expect((await cache()).sanction_kind).toBe('suspension');
  });

  it('enforces review request ownership, target integrity and one open request per target', async () => {
    await asOwner();
    await query("update works set admin_blinded = true, admin_blind_reason = 'r', admin_blinded_at = now() where id = $1", [work]);
    await query("update chapters set admin_blinded = true, admin_blind_reason = 'r', admin_blinded_at = now() where id in ($1, $2)",
      [chapter, otherChapter]);

    await as(writer);
    await query('insert into moderation_review_requests(requester_id, work_id) values ($1, $2)', [writer, work]);
    await query('insert into moderation_review_requests(requester_id, work_id, chapter_id) values ($1, $2, $3)',
      [writer, work, chapter]);
    await rejected(() => query('insert into moderation_review_requests(requester_id, work_id) values ($1, $2)',
      [writer, work]), 'moderation_review_requests_open_work');
    await rejected(() => query('insert into moderation_review_requests(requester_id, work_id, chapter_id) values ($1, $2, $3)',
      [writer, work, chapter]), 'moderation_review_requests_open_chapter');
    // Cross-work target: chapter from another work under this writer's work ID.
    await rejected(() => query('insert into moderation_review_requests(requester_id, work_id, chapter_id) values ($1, $2, $3)',
      [writer, work, otherChapter]), 'violates');
    // Someone else's work, or a request filed in another user's name.
    await rejected(() => query('insert into moderation_review_requests(requester_id, work_id) values ($1, $2)',
      [writer, otherWork]), 'row-level security');
    await rejected(() => query('insert into moderation_review_requests(requester_id, work_id) values ($1, $2)',
      [otherWriter, otherWork]), 'row-level security');
    await rejected(() => query(
      "insert into moderation_review_requests(requester_id, work_id, status, resolved_at, resolved_by) values ($1, $2, 'unblinded', now(), $1)",
      [writer, work]), 'permission denied');
    await rejected(() => query("update moderation_review_requests set status = 'unblinded'"), 'permission denied');

    // Unblinded target cannot be requested.
    await asOwner();
    await query("update chapters set admin_blinded = false, admin_blind_reason = null, admin_blinded_at = null where id = $1", [chapter]);
    await query("update moderation_review_requests set status = 'maintained', resolved_at = now(), resolved_by = $1", [admin]);
    await as(writer);
    await rejected(() => query('insert into moderation_review_requests(requester_id, work_id, chapter_id) values ($1, $2, $3)',
      [writer, work, chapter]), 'row-level security');
    // Resolved requests free the target for a new work-level request.
    await query('insert into moderation_review_requests(requester_id, work_id) values ($1, $2)', [writer, work]);

    // Direct owner-role database check of the same integrity rule, independent of RLS.
    await asOwner();
    await rejected(() => query('insert into moderation_review_requests(requester_id, work_id, chapter_id) values ($1, $2, $3)',
      [writer, work, otherChapter]), 'foreign key');
    await as(otherWriter);
    expect(await scalar<number>('select count(*)::int from moderation_review_requests')).toBe(0);
  });

  it('keeps reports reporter-scoped with the existing category check', async () => {
    await as(reader);
    await query("insert into reports(reporter_id, work_id, chapter_id, reason_category) values ($1, $2, $3, '스팸/광고')",
      [reader, work, chapter]);
    await rejected(() => query("insert into reports(reporter_id, work_id, reason_category) values ($1, $2, 'unknown')",
      [reader, work]), 'check constraint');
    await as(writer);
    expect(await scalar<number>('select count(*)::int from reports')).toBe(0);
    await as(reader);
    expect(await scalar<number>('select count(*)::int from reports')).toBe(1);
  });
});
