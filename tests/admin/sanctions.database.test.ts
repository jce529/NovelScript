import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Real PostgreSQL, isolated schema and outer rollback (same pattern as
// tests/admin/foundation.database.test.ts). Exercises 0008 through the API roles.
describe.skipIf(!process.env.SUPABASE_DB_URL)('sanction enforcement migration (PostgreSQL)', () => {
  const sql = postgres(process.env.SUPABASE_DB_URL!, { max: 1, prepare: false });
  const schema = `sanction_test_${crypto.randomUUID().replaceAll('-', '')}`;
  const exec = (query: string) => sql.unsafe(query);
  const query = (text: string, params: unknown[] = []) =>
    sql.unsafe(text, params as postgres.ParameterOrJSON<never>[]);

  const writer = '10000000-0000-4000-8000-000000000001';
  const reader = '10000000-0000-4000-8000-000000000002';
  const admin = '10000000-0000-4000-8000-000000000003';
  const bystander = '10000000-0000-4000-8000-000000000004';
  const work = '20000000-0000-4000-8000-000000000001';
  const freeChapter = '30000000-0000-4000-8000-000000000001';
  const paidChapter = '30000000-0000-4000-8000-000000000002';
  const ownedChapter = '30000000-0000-4000-8000-000000000003';
  const folder = '40000000-0000-4000-8000-000000000001';
  const file = '40000000-0000-4000-8000-000000000002';

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
  async function sanction(kind: string, target: string, endsAt: string | null = null) {
    const type = { warning: 'user_warn', suspension: 'user_suspend',
      permanent_suspension: 'user_permanent_suspend', lift: 'user_sanction_lift' }[kind]!;
    await asOwner();
    const action = await scalar<string>(
      `insert into admin_actions(actor_id, action_type, target_user_id, reason)
       values ($1, $2, $3, 'audit') returning id`, [admin, type, target]);
    await as(admin, 'service_role');
    return scalar<string>('select apply_user_sanction($1, $2, $3, $4, null, $5::timestamptz, $6)',
      [admin, target, kind, `${kind} reason`, endsAt, action]);
  }
  /** Simulates the passage of DB time by moving the cached expiry through the single cache gate. */
  async function moveExpiry(target: string, expression: string) {
    await asOwner();
    await exec("select set_config('app.sanction_cache_writer', 'on', true)");
    await query(`update profiles set sanctioned_until = ${expression} where id = $1`, [target]);
    await exec("select set_config('app.sanction_cache_writer', '', true)");
  }
  /** Categories that report denial as "zero rows affected"; all others must raise. */
  const UPDATE_CATEGORY = /update|save|publish|reorder|rename|upgrade/;
  const future = () => new Date(Date.now() + 86_400_000).toISOString();

  /** Every direct browser-role mutation category; each must fail while suspended. */
  function writeAttempts(user: string): [string, () => Promise<unknown>][] {
    return [
      ['work insert', () => query("insert into works(owner_id, title) values ($1, 'x')", [user])],
      ['create_work rpc', () => query("select create_work($1, 'x', null, null, null)", [user])],
      ['work update', () => query("update works set title = 'y' where id = $1 returning id", [work])],
      ['chapter insert', () => query("insert into chapters(work_id, title, order_index) values ($1, 'x', 9)", [work])],
      ['chapter save', () => query("update chapters set content = 'z' where id = $1 returning id", [freeChapter])],
      ['chapter publish', () => query('update chapters set is_published = true, published_at = now() where id = $1 returning id', [ownedChapter])],
      ['chapter unpublish', () => query('update chapters set is_published = false where id = $1 returning id', [freeChapter])],
      ['chapter reorder', async () => {
        await query('select reorder_chapters($1, $2::uuid[])', [work, [ownedChapter, freeChapter, paidChapter]]);
        await exec('reset role');
        return query('select id from chapters where id = $1 and order_index = 0', [ownedChapter]);
      }],
      ['kb file insert', () => query("insert into kb_nodes(owner_id, work_id, scope, parent_id, node_type, category, name) values ($1, $2, 'work', $3, 'file', 'custom', 'n2')", [user, work, folder])],
      ['kb folder insert', () => query("insert into kb_nodes(owner_id, work_id, scope, node_type, category, name) values ($1, $2, 'work', 'folder', 'custom', 'f2')", [user, work])],
      ['kb rename', () => query("update kb_nodes set name = 'renamed' where id = $1 returning id", [file])],
      ['kb save', () => query("update kb_nodes set content = 'c' where id = $1 returning id", [file])],
      ['kb delete rpc', () => query('select soft_delete_kb_node($1, $2)', [file, user])],
      ['account template root', () => query('select ensure_account_template_root($1)', [user])],
      ['writer upgrade', () => query("update profiles set role = 'writer', pen_name = 'Upgraded' where id = $1 returning id", [user])],
      ['report', () => query("insert into reports(reporter_id, work_id, reason_category) values ($1, $2, '스팸/광고')", [user, work])],
      ['like', () => query('insert into work_likes(work_id, user_id) values ($1, $2)', [work, user])],
      ['bookmark', () => query('insert into work_bookmarks(work_id, user_id) values ($1, $2)', [work, user])],
      ['subscription', () => query('insert into work_subscriptions(work_id, user_id) values ($1, $2)', [work, user])],
      ['progress upsert', () => query(
        'insert into reading_progress(user_id, work_id, chapter_id) values ($1, $2, $3) on conflict (user_id, work_id) do update set chapter_id = excluded.chapter_id',
        [user, work, freeChapter])],
      ['purchase order', () => query('select create_purchase_order($1::uuid[], gen_random_uuid())', [[paidChapter]])],
    ];
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
      '0005_commerce.sql', '0006_admin_foundation.sql', '0007_admin_operations.sql', '0008_sanction_enforcement.sql']) {
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
    await query('insert into test_users(id) values ($1),($2),($3),($4)', [writer, reader, admin, bystander]);
    await query("update profiles set role = 'writer', pen_name = 'W' || right(id::text, 4) where id = $1", [writer]);
    await query('update wallets set balance = 500 where id in ($1, $2, $3)', [writer, reader, bystander]);
    await query("insert into works(id, owner_id, title) values ($1, $2, 'Work')", [work, writer]);
    await query(`insert into chapters(id, work_id, title, content, order_index, is_published, price_tier)
      values ($1, $4, 'Free', 'free body', 0, true, null),
             ($2, $4, 'Paid', 'paid body', 1, true, 30),
             ($3, $4, 'Owned', 'owned body', 2, true, 10)`, [freeChapter, paidChapter, ownedChapter, work]);
    await query(`insert into kb_nodes(id, owner_id, work_id, scope, node_type, category, name)
      values ($1, $2, $3, 'work', 'folder', 'custom', 'folder')`, [folder, writer, work]);
    await query(`insert into kb_nodes(id, owner_id, work_id, scope, parent_id, node_type, category, name, content)
      values ($1, $2, $3, 'work', $4, 'file', 'custom', 'file', 'kb body')`, [file, writer, work, folder]);
    await query('select grant_admin($1, $2, $3)', [admin, 'test grant', 'vitest']);
    // Purchase history made before any sanction, via the normal paid path.
    for (const user of [writer, reader]) {
      await as(user);
      const order = await scalar<string>('select create_purchase_order($1::uuid[], gen_random_uuid())', [[ownedChapter]]);
      await query('select pay_purchase_order($1)', [order]);
    }
    await asOwner();
  });
  afterEach(async () => { await exec('rollback to savepoint fixture; reset role'); });

  it('allows every write category for an unsanctioned user (control)', async () => {
    for (const [name, attempt] of writeAttempts(writer)) {
      await as(writer);
      await exec('savepoint control');
      try {
        const rows = await attempt();
        if (Array.isArray(rows) && rows.length === 0 && UPDATE_CATEGORY.test(name)) {
          throw new Error('affected no rows');
        }
      } catch (error) {
        throw new Error(`${name} failed for an unsanctioned user: ${(error as Error).message}`);
      } finally {
        await exec('rollback to savepoint control');
      }
    }
  });

  it('denies every direct write category during an active timed suspension', async () => {
    await sanction('suspension', writer, future());
    for (const [name, attempt] of writeAttempts(writer)) {
      await as(writer);
      await exec('savepoint denied');
      let failed = false;
      try {
        const rows = await attempt() as unknown[];
        // UPDATE/DELETE under a USING restriction silently affect zero rows instead of erroring.
        failed = UPDATE_CATEGORY.test(name) && Array.isArray(rows) && rows.length === 0;
      } catch (error) {
        failed = /row-level security|write_access_denied/.test((error as Error).message);
        if (!failed) throw new Error(`${name} failed for the wrong reason: ${(error as Error).message}`);
      } finally {
        await exec('rollback to savepoint denied');
      }
      expect(failed, name).toBe(true);
    }
    await asOwner();
    expect(await scalar<string>('select title from works where id = $1', [work])).toBe('Work');
    expect(await scalar<string>('select content from chapters where id = $1', [freeChapter])).toBe('free body');
    expect(await scalar<string>('select content from kb_nodes where id = $1', [file])).toBe('kb body');
    expect(await scalar<boolean>('select deleted_at is null from kb_nodes where id = $1', [file])).toBe(true);
  });

  it('denies payment of an order created before suspension and never charges', async () => {
    await as(reader);
    const order = await scalar<string>('select create_purchase_order($1::uuid[], gen_random_uuid())', [[paidChapter]]);
    await sanction('suspension', reader, future());
    await as(reader);
    await rejected(() => query('select pay_purchase_order($1)', [order]), 'write_access_denied');
    expect(await scalar<string>('select balance::text from wallets where id = $1', [reader])).toBe('490');
    expect(await scalar<string>('select status from orders where id = $1', [order])).toBe('PENDING');
  });

  it('keeps entitled, free and wallet reads for a suspended reader and skips bookkeeping silently', async () => {
    await as(reader);
    await query('insert into work_likes(work_id, user_id) values ($1, $2)', [work, reader]);
    await sanction('permanent_suspension', reader);
    await as(reader);
    expect(await scalar<string>('select read_chapter_content($1)', [freeChapter])).toBe('free body');
    expect(await scalar<string>('select read_chapter_content($1)', [ownedChapter])).toBe('owned body');
    expect(await scalar<string | null>('select read_chapter_content($1)', [paidChapter])).toBeNull();
    expect(await scalar<boolean>('select can_view($1, $2)', [work, ownedChapter])).toBe(true);
    expect(await scalar<string>('select balance::text from wallets where id = $1', [reader])).toBe('490');
    expect(await scalar<number>('select count(*)::int from ledger_entries')).toBe(1);
    expect(await scalar<number>('select count(*)::int from entitlements')).toBe(1);
    expect(await scalar<number>('select count(*)::int from orders')).toBe(1);
    expect(await scalar<number>('select count(*)::int from chapters where work_id = $1', [work])).toBe(3);
    expect(await scalar<number>('select count(*)::int from work_likes where user_id = $1', [reader])).toBe(1);

    // View counting is skipped (no error); anonymous opens still count.
    await query('select increment_chapter_view($1)', [freeChapter]);
    await as('', 'anon');
    await query('select increment_chapter_view($1)', [freeChapter]);
    await asOwner();
    expect(await scalar<number>('select view_count from chapters where id = $1', [freeChapter])).toBe(1);

    // Un-toggling an existing like is a delete and is denied as well (zero rows affected).
    await as(reader);
    expect(await query('delete from work_likes where user_id = $1 returning work_id', [reader])).toHaveLength(0);
    expect(await scalar<number>('select count(*)::int from work_likes where user_id = $1', [reader])).toBe(1);
    expect(await scalar<{ can_write: boolean; reason: string }>('select get_write_access($1)', [reader]))
      .toMatchObject({ can_write: false, reason: 'permanent_suspension' });
  });

  it('never hides a suspended author\'s published works from readers', async () => {
    await sanction('permanent_suspension', writer);
    await as('', 'anon');
    expect(await scalar<number>('select count(*)::int from works where id = $1', [work])).toBe(1);
    expect(await scalar<number>('select count(*)::int from chapters where work_id = $1 and is_published', [work])).toBe(3);
    expect(await scalar<string>('select read_chapter_content($1)', [freeChapter])).toBe('free body');
    await as(bystander);
    expect(await scalar<number>('select count(*)::int from list_chapter_access($1) where allowed', [work])).toBe(1);
    // The suspended owner still reads their own drafts and KB.
    await as(writer);
    expect(await scalar<string>('select read_chapter_content($1)', [paidChapter])).toBe('paid body');
    expect(await scalar<string>('select content from kb_nodes where id = $1', [file])).toBe('kb body');
  });

  it('expires timed suspensions at DB time without a cleanup job; equality means expired', async () => {
    await sanction('suspension', writer, future());
    await as(writer);
    await rejected(() => query("insert into work_likes(work_id, user_id) values ($1, $2)", [work, writer]), 'row-level security');

    await moveExpiry(writer, "now() + interval '1 second'");
    await as(writer);
    await rejected(() => query("insert into work_likes(work_id, user_id) values ($1, $2)", [work, writer]), 'row-level security');

    await moveExpiry(writer, 'now()');
    await as(writer);
    expect(await scalar<{ can_write: boolean }>('select get_write_access($1)', [writer])).toMatchObject({ can_write: true });
    await query('insert into work_likes(work_id, user_id) values ($1, $2)', [work, writer]);
    // Cache still records the (expired) suspension: nothing had to clean it up.
    await asOwner();
    expect(await scalar<string>('select sanction_kind from profiles where id = $1', [writer])).toBe('suspension');
  });

  it('keeps permanent suspension distinct and only lifts through history', async () => {
    await sanction('permanent_suspension', writer);
    await asOwner();
    expect(await scalar<string | null>('select sanctioned_until from profiles where id = $1', [writer])).toBeNull();
    await as(writer);
    await rejected(() => query("insert into works(owner_id, title) values ($1, 'x')", [writer]), 'row-level security');
    await sanction('suspension', writer, future());
    await as(writer);
    expect(await scalar<{ reason: string }>('select get_write_access($1)', [writer])).toMatchObject({ reason: 'permanent_suspension' });
    await sanction('lift', writer);
    await as(writer);
    await query("insert into works(owner_id, title) values ($1, 'after lift')", [writer]);
  });

  it('lets a suspended recipient acknowledge a warning without clearing the suspension', async () => {
    const warning = await sanction('warning', writer);
    await sanction('suspension', writer, future());
    const later = await sanction('warning', writer);
    await as(writer);
    expect(await scalar<boolean>('select acknowledge_warning($1)', [warning])).toBe(true);
    expect(await scalar<boolean>('select acknowledge_warning($1)', [later])).toBe(true);
    await asOwner();
    expect(await scalar<number>('select count(*)::int from warning_acknowledgements')).toBe(2);
    expect(await scalar<string>('select sanction_kind from profiles where id = $1', [writer])).toBe('suspension');
    expect(await scalar<number>('select count(*)::int from user_sanctions where user_id = $1', [writer])).toBe(3);
    await as(writer);
    await rejected(() => query("insert into works(owner_id, title) values ($1, 'x')", [writer]), 'row-level security');
  });

  it('keeps self-deletion available without touching sanctions or financial history', async () => {
    await sanction('permanent_suspension', reader);
    await asOwner();
    const before = await scalar<string>(
      `select md5(string_agg(x, '|')) from (
         select (select json_agg(s order by seq)::text from user_sanctions s) x
         union all select (select json_agg(l order by id)::text from ledger_entries l)
         union all select (select json_agg(w order by id)::text from wallets w)
         union all select (select json_agg(e order by id)::text from entitlements e)) t`);
    // softDeleteAccount uses the service-role client.
    await as(reader, 'service_role');
    await query('update profiles set pen_name_bio = null, deleted_at = now() where id = $1 and deleted_at is null', [reader]);
    await asOwner();
    expect(await scalar<boolean>('select deleted_at is not null from profiles where id = $1', [reader])).toBe(true);
    expect(await scalar<string>('select sanction_kind from profiles where id = $1', [reader])).toBe('permanent_suspension');
    expect(await scalar<string>(
      `select md5(string_agg(x, '|')) from (
         select (select json_agg(s order by seq)::text from user_sanctions s) x
         union all select (select json_agg(l order by id)::text from ledger_entries l)
         union all select (select json_agg(w order by id)::text from wallets w)
         union all select (select json_agg(e order by id)::text from entitlements e)) t`)).toBe(before);
  });

  it('scopes the write-access RPCs: no cross-user probing, no cross-owner KB delete, anon excluded', async () => {
    await sanction('suspension', writer, future());
    await as(reader);
    expect(await scalar<{ reason: string }>('select get_write_access($1)', [writer])).toMatchObject({ reason: 'forbidden' });
    await rejected(() => query('select user_can_write($1)', [writer]), 'permission denied');
    await as(bystander);
    await rejected(() => query('select soft_delete_kb_node($1, $2)', [file, writer]), 'write_access_denied');
    await as('', 'anon');
    await rejected(() => query('select soft_delete_kb_node($1, $2)', [file, writer]), 'permission denied');
    await rejected(() => query('select get_write_access($1)', [writer]), 'permission denied');
    // The service role asks about the session-derived user.
    await as('', 'service_role');
    expect(await scalar<{ can_write: boolean; reason: string }>('select get_write_access($1)', [writer]))
      .toMatchObject({ can_write: false, reason: 'suspended' });
    expect(await scalar<{ can_write: boolean }>('select get_write_access($1)', [reader])).toMatchObject({ can_write: true });
    await rejected(() => query('select soft_delete_kb_node($1, $2)', [file, writer]), 'write_access_denied');
    // Deleted profiles cannot write either.
    await asOwner();
    await query('update profiles set deleted_at = now() where id = $1', [bystander]);
    await as(bystander);
    await rejected(() => query('insert into work_likes(work_id, user_id) values ($1, $2)', [work, bystander]), 'row-level security');
  });

  it('declares restrictive policies for every guarded table and command', async () => {
    await asOwner();
    const rows = await query(`select tablename, cmd from pg_policies
      where schemaname = $1 and permissive = 'RESTRICTIVE' and policyname like '%_write_access_%'`, [schema]);
    const got = new Set((rows as unknown as { tablename: string; cmd: string }[]).map(r => `${r.tablename}:${r.cmd}`));
    for (const table of ['works', 'chapters', 'kb_nodes', 'profiles', 'work_likes', 'work_bookmarks',
      'work_subscriptions', 'reading_progress', 'reports', 'moderation_review_requests']) {
      for (const cmd of ['INSERT', 'UPDATE', 'DELETE']) expect(got.has(`${table}:${cmd}`), `${table}:${cmd}`).toBe(true);
    }
    // No SELECT restriction was added.
    expect([...got].some(entry => entry.endsWith(':SELECT'))).toBe(false);
  });
});
