import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { chapterViewsToRaw, computeWorldTreePopularity } from '@/lib/world-tree/metric-adapter';

/**
 * 28-01 / APAGE-01..03: opt-in real PostgreSQL proof, explicitly skipped without SUPABASE_DB_URL.
 * Written only in this execution: no DB migration/test has been run. Boundary tests use an
 * outer rollback; races alone need a committed, uniquely named schema visible to two sessions.
 * Their teardown drops only that schema. No Auth API, public-schema writes or network helpers.
 * Requires a privileged test connection able to SET ROLE and existing Supabase API roles/auth.uid.
 */
const MIGRATIONS = [
  '0001_init.sql', '0002_studio.sql', '0003_reader.sql', '0004_kb_custom_folders.sql',
  '0005_commerce.sql', '0006_admin_foundation.sql', '0007_admin_operations.sql',
  '0008_sanction_enforcement.sql', '0009_blind_access.sql', '0012_template_category_folders.sql',
  '0019_reader_atomic_toggle.sql', '0022_template_readonly_backfill.sql', '0023_template_policy_guards.sql',
  '0032_world_tree_schema.sql', '0033_world_tree_eligibility.sql',
  '0056_works_serial_status.sql', '0057_author_subscriptions.sql',
];
type Connection = Pick<postgres.Sql, 'unsafe'>;
type Role = 'anon' | 'authenticated' | 'service_role';
const uid = (n: number) => `28000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const wid = (n: number) => `28100000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const author = uid(1), reader = uid(2), other = uid(3), globalAuthor = uid(4);
const noName = uid(5), deletedAuthor = uid(6), emptyAuthor = uid(7), privateAuthor = uid(8);

function exec(db: Connection, text: string, params: unknown[] = []) {
  return db.unsafe(text, params as postgres.ParameterOrJSON<never>[]);
}
async function scalar<T>(db: Connection, text: string, params: unknown[] = []): Promise<T> {
  const rows = await exec(db, text, params);
  return Object.values(rows[0])[0] as T;
}
async function as(db: Connection, id: string, role: Role = 'authenticated') {
  await exec(db, 'reset role');
  await exec(db, "select set_config('request.jwt.claim.sub', $1, false)", [id]);
  await exec(db, "select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: id, role })]);
  await exec(db, `set role ${role}`);
}
async function owner(db: Connection) {
  await exec(db, 'reset role');
  await exec(db, "select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '{}', false)");
}
function migrationSql(file: string, schema: string) {
  return readFileSync(`supabase/migrations/${file}`, 'utf8')
    .replace('create extension if not exists "pgcrypto";', '')
    .replaceAll('auth.users', `${schema}.test_users`)
    .replaceAll('search_path = public', `search_path = ${schema}, public`)
    .replaceAll('public.', `${schema}.`)
    .replace(/^begin;|^commit;|^notify pgrst,.*$/gm, '');
}
async function bootstrap(db: Connection, schema: string) {
  await exec(db, `create schema ${schema}; set search_path = ${schema}, public;
    create table ${schema}.test_users(id uuid primary key);
    grant usage on schema ${schema} to anon, authenticated, service_role;
    alter default privileges in schema ${schema} grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema ${schema} grant all on sequences to anon, authenticated, service_role;
    alter default privileges in schema ${schema} grant execute on functions to anon, authenticated, service_role;`);
  for (const migration of MIGRATIONS) await exec(db, migrationSql(migration, schema));
}
async function seed(db: Connection) {
  // All fixtures are made as the service role, not the role used for assertions.
  await as(db, '', 'service_role');
  for (let n = 1; n <= 8; n++) {
    await exec(db, 'insert into test_users(id) values ($1)', [uid(n)]);
    await exec(db, "update profiles set pen_name = $2, pen_name_bio = 'Public bio' where id = $1", [uid(n), `Author-${n}`]);
  }
  await exec(db, 'update profiles set pen_name = null where id = $1', [noName]);
  await exec(db, 'update profiles set deleted_at = now() where id = $1', [deletedAuthor]);
  for (const [n, writer] of [[1, author], [100, globalAuthor], [101, noName], [102, deletedAuthor], [103, privateAuthor]] as const) {
    await exec(db, `insert into works(id, owner_id, title, synopsis, created_at)
      values ($1, $2, $3, 'Public synopsis', '2026-01-01T00:00:00Z')`, [wid(n), writer, `Work-${n}`]);
    await exec(db, `insert into chapters(work_id, title, content, order_index, is_published, published_at, view_count)
      values ($1, 'Chapter', 'PRIVATE BODY', 1, $2, '2026-01-02T00:00:00Z', 0)`, [wid(n), n !== 103]);
  }
  await owner(db);
}

describe.skipIf(!process.env.SUPABASE_DB_URL)('author subscriptions: PostgreSQL boundaries (28-01)', () => {
  let db: postgres.Sql;
  const schema = `author_boundary_${crypto.randomUUID().replaceAll('-', '')}`;

  beforeAll(async () => {
    db = postgres(process.env.SUPABASE_DB_URL!, { max: 1, prepare: false });
    await exec(db, 'begin');
    await bootstrap(db, schema);
  });
  afterAll(async () => {
    if (db) try { await exec(db, 'rollback'); } finally { await db.end(); }
  });
  beforeEach(async () => { await exec(db, 'savepoint fixture'); await seed(db); });
  afterEach(async () => { await exec(db, 'rollback to savepoint fixture'); await owner(db); });

  async function rows(text: string, params: unknown[] = [], id = '', role: Role = 'anon') {
    await as(db, id, role);
    try { return await exec(db, text, params); } finally { await owner(db); }
  }
  async function fails(text: string, params: unknown[] = [], id = reader, role: Role = 'authenticated') {
    await exec(db, 'savepoint expected_failure');
    let message: string | undefined;
    try { await as(db, id, role); await exec(db, text, params); }
    catch (error) { message = (error as Error).message; }
    finally { await exec(db, 'rollback to savepoint expected_failure'); await owner(db); }
    expect(message, 'expected a rejected SQL call').toBeDefined();
    return message!;
  }
  const toggle = (id = reader, target = author) =>
    rows('select toggle_author_subscriptions($1) as notify', [target], id, 'authenticated');
  const stats = () => rows('select * from get_public_author_stats($1)', [author]);
  const list = (status = 'all', sort = 'updated', offset = 0, limit = 12) =>
    rows('select * from list_public_author_works($1, $2, $3, $4, $5)', [author, status, sort, offset, limit]);

  it('allows anon and authenticated reads with exactly the public profile whitelist', async () => {
    for (const [id, role] of [['', 'anon'], [reader, 'authenticated']] as const) {
      expect(await rows('select * from get_public_author_profile($1)', [author], id, role))
        .toEqual([{ pen_name: 'Author-1', pen_name_bio: 'Public bio' }]);
      expect(await rows('select * from profiles where id = $1', [author], id, role)).toEqual([]);
    }
    const [work] = await list();
    expect(Object.keys(work).sort()).toEqual([
      'id', 'title', 'synopsis', 'cover_image_url', 'genre', 'serial_status', 'created_at',
      'latest_published_at', 'chapter_count', 'total_views', 'like_count', 'ctr', 'popularity_score',
    ].sort());
    expect(JSON.stringify(work)).not.toMatch(/owner_id|PRIVATE BODY|sanction|deleted_at|email|role/);
  });

  it('returns the same absence for missing, deleted, unnamed, private-only and zero-work authors', async () => {
    for (const id of [uid(999), deletedAuthor, noName, emptyAuthor, privateAuthor, null]) {
      for (const [sub, role] of [['', 'anon'], [reader, 'authenticated']] as const) {
        expect(await rows('select * from get_public_author_profile($1)', [id], sub, role)).toEqual([]);
        expect(await rows('select * from get_public_author_stats($1)', [id], sub, role)).toEqual([]);
        expect(await rows('select * from list_public_author_works($1)', [id], sub, role)).toEqual([]);
      }
    }
    await exec(db, "update profiles set pen_name = '   ' where id = $1", [author]);
    expect(await list()).toEqual([]);
  });

  it('excludes unpublished/deleted chapters and draft, blinded, deleted or unpublished works consistently', async () => {
    await as(db, '', 'service_role');
    for (let n = 2; n <= 7; n++) {
      await exec(db, `insert into works(id, owner_id, title, serial_status, is_branch_draft,
        admin_blinded, admin_blind_reason, admin_blinded_at, deleted_at)
        values ($1, $2, 'Visibility', $3, $4, $5, case when $5 then 'Test blind' end,
          case when $5 then now() end, case when $6 then now() end)`,
      [wid(n), author, n === 2 ? 'completed' : 'ongoing', n === 3, n === 4, n === 5]);
      await exec(db, `insert into chapters(work_id, title, order_index, is_published, deleted_at, published_at)
        values ($1, 'C', 1, $2, case when $3 then now() end, '2026-02-01T00:00:00Z')`, [wid(n), n !== 6, n === 7]);
    }
    await exec(db, `insert into chapters(work_id, title, order_index, is_published, deleted_at, published_at, view_count)
      values ($1, 'Draft', 2, false, null, '2099-01-01T00:00:00Z', 999999),
             ($1, 'Deleted', 3, true, now(), '2099-01-02T00:00:00Z', 999999)`, [wid(1)]);
    await owner(db);
    const [counts] = await stats();
    expect(Number(counts.work_count)).toBe(2);
    expect(Number(counts.ongoing_count) + Number(counts.completed_count)).toBe(2);
    expect(Number(counts.completed_count)).toBe(1);
    expect((await list('ongoing')).map((w) => w.id)).toEqual([wid(1)]);
    expect((await list('completed')).map((w) => w.id)).toEqual([wid(2)]);
    const [work] = await list('ongoing');
    expect(Number(work.chapter_count)).toBe(1);
    expect(Number(work.total_views)).toBe(0);
    expect(new Date(work.latest_published_at).toISOString()).toBe('2026-01-02T00:00:00.000Z');
  });

  it('ranks ALL candidates against the public GLOBAL baseline before taking 12, matching the adapter', async () => {
    await as(db, '', 'service_role');
    const inputs: { id: string; views: number[]; likes: number; created: string; status: string }[] = [];
    // Late candidate 15 must win; rows 2/3 tie on score AND creation time (id decides).
    for (let n = 1; n <= 15; n++) {
      const views = n === 15 ? [100, 100] : n === 14 ? [-10, 5, 10] : n === 13 ? [0, 10] : [10, 5];
      const likes = n === 15 ? 3 : n === 3 ? 0 : n % 2;
      const created = n === 3 ? '2026-01-02T00:00:00Z' : `2026-01-${String(n).padStart(2, '0')}T00:00:00Z`;
      const status = n % 2 === 0 ? 'completed' : 'ongoing';
      inputs.push({ id: wid(n), views, likes, created, status });
      await exec(db, `insert into works(id, owner_id, title, created_at, serial_status)
        values ($1, $2, 'Rank', $3, $4) on conflict (id) do update set created_at = $3, serial_status = $4`,
      [wid(n), author, created, status]);
      await exec(db, 'delete from chapters where work_id = $1', [wid(n)]);
      // Insert reverse physical order: metrics must follow order_index, not insertion order.
      for (let i = views.length - 1; i >= 0; i--) {
        await exec(db, `insert into chapters(work_id, title, order_index, is_published, published_at, view_count)
          values ($1, 'C', $2, true, '2026-02-01T00:00:00Z'::timestamptz + $3::int * interval '1 day', $4)`,
        [wid(n), i + 1, 16 - n, views[i]]);
      }
      for (let i = 1; i <= likes; i++) await exec(db, 'insert into work_likes(work_id, user_id) values ($1, $2)', [wid(n), uid(i)]);
    }
    // Other author's public work sets BOTH maxima. Private huge values must not change them.
    await exec(db, 'update chapters set view_count = 1000 where work_id = $1', [wid(100)]);
    for (let i = 1; i <= 4; i++) await exec(db, 'insert into work_likes(work_id, user_id) values ($1, $2)', [wid(100), uid(i)]);
    await exec(db, 'update chapters set view_count = 999999 where work_id = $1', [wid(103)]);
    for (let i = 1; i <= 8; i++) await exec(db, 'insert into work_likes(work_id, user_id) values ($1, $2)', [wid(103), uid(i)]);
    await owner(db);
    const expected = inputs.map((row) => ({ ...row, raw: chapterViewsToRaw(row.views, row.likes),
      score: computeWorldTreePopularity(chapterViewsToRaw(row.views, row.likes), { maxTotalViews: 1000, maxLikeCount: 4 }),
    })).sort((a, b) => b.score - a.score || b.created.localeCompare(a.created) || a.id.localeCompare(b.id));
    const first = await list('all', 'popular', 0, 999);
    const second = await list('all', 'popular', 12);
    expect(first).toHaveLength(12);
    expect(second).toHaveLength(3);
    const all = [...first, ...second];
    expect(all.map((row) => row.id)).toEqual(expected.map((row) => row.id));
    expect(first[0].id).toBe(wid(15));
    expect(new Set(all.map((row) => row.id)).size).toBe(15);
    all.forEach((row, i) => {
      expect(Number(row.total_views)).toBe(expected[i].raw.totalViews);
      expect(Number(row.like_count)).toBe(expected[i].raw.likeCount);
      expect(Number(row.ctr)).toBeCloseTo(expected[i].raw.ctr);
      expect(row.popularity_score).toBe(expected[i].score);
    });
    const completed = await list('completed', 'popular');
    expect(completed.map((row) => row.id)).toEqual(expected.filter((row) => row.status === 'completed').map((row) => row.id));
    for (const row of completed) expect(row.popularity_score).toBe(all.find((w) => w.id === row.id)!.popularity_score);
    const newOrder = [...inputs].sort((a, b) => b.created.localeCompare(a.created) || a.id.localeCompare(b.id));
    expect([...(await list('all', 'new')), ...(await list('all', 'new', 12))].map((row) => row.id)).toEqual(newOrder.map((row) => row.id));
    // Publication dates deliberately reverse creation order.
    expect([...(await list()), ...(await list('all', 'updated', 12))].map((row) => row.id)).toEqual(inputs.map((row) => row.id));
  });

  it('handles zero metrics, invalid filters, null/default inputs and nonnegative bounded pagination', async () => {
    expect((await list())[0].popularity_score).toBe(0);
    expect(await list('all', 'new', 0, 0)).toEqual([]);
    expect(await list('all', 'new', -10, -1)).toEqual([]);
    expect(await rows('select * from list_public_author_works($1, $2, $3, null, null)', [author, 'all', 'new'])).toHaveLength(1);
    for (const [status, sort] of [['invalid', 'new'], ['all', 'invalid'], [null, 'updated'], ['all', null]]) {
      expect(await fails('select * from list_public_author_works($1, $2, $3)', [author, status, sort])).toContain('invalid_input');
    }
  });

  it('keeps notify=false rows and their subscription date, and counts only notify=true in real time', async () => {
    expect(await toggle()).toEqual([{ notify: true }]);
    const initial = await rows('select * from list_my_author_subscriptions()', [], reader, 'authenticated');
    expect(Object.keys(initial[0]).sort()).toEqual(['authorId', 'penName', 'notify', 'subscribedAt'].sort());
    expect(Number((await stats())[0].subscriber_count)).toBe(1);
    await toggle(other);
    expect(Number((await stats())[0].subscriber_count)).toBe(2);
    expect(await toggle()).toEqual([{ notify: false }]);
    const off = await rows('select * from list_my_author_subscriptions()', [], reader, 'authenticated');
    expect(off).toEqual([{ ...initial[0], notify: false }]);
    expect(Number((await stats())[0].subscriber_count)).toBe(1);
    expect(Number(await scalar(db, 'select count(*) from author_subscriptions'))).toBe(2);
    expect(await toggle()).toEqual([{ notify: true }]);
    expect(Number((await stats())[0].subscriber_count)).toBe(2);
  });

  it('retains a private/deleted author in my list with a NULL public name', async () => {
    await toggle();
    await exec(db, "update works set admin_blinded = true, admin_blind_reason = 'Test blind', admin_blinded_at = now() where owner_id = $1", [author]);
    expect(await rows('select * from list_my_author_subscriptions()', [], reader, 'authenticated'))
      .toEqual([{ authorId: author, penName: null, notify: true, subscribedAt: expect.any(Date) }]);
    await exec(db, 'update profiles set deleted_at = now() where id = $1', [author]);
    expect((await rows('select * from list_my_author_subscriptions()', [], reader, 'authenticated'))[0].penName).toBeNull();
  });

  it('blocks anon, missing identities, self-subscription, suspended/deleted callers and unavailable authors', async () => {
    expect(await fails('select toggle_author_subscriptions($1)', [author], '', 'anon')).toContain('permission denied');
    expect(await fails('select list_my_author_subscriptions()', [], '', 'anon')).toContain('permission denied');
    expect(await fails('select toggle_author_subscriptions($1)', [author], '')).toContain('write_access_denied');
    expect(await fails('select list_my_author_subscriptions()', [], '')).toContain('authentication_required');
    expect(await fails('select toggle_author_subscriptions($1)', [author], author)).toContain('self_subscription_forbidden');
    for (const id of [noName, deletedAuthor, emptyAuthor, privateAuthor, uid(999), null]) {
      expect(await fails('select toggle_author_subscriptions($1)', [id])).toContain('author_unavailable');
    }
    for (const kind of ['suspension', 'permanent_suspension']) {
      await exec(db, "select set_config('app.sanction_cache_writer', 'on', true)");
      await exec(db, `update profiles set sanction_kind = $2,
        sanctioned_until = case when $2 = 'suspension' then now() + interval '1 day' end where id = $1`, [reader, kind]);
      await exec(db, "select set_config('app.sanction_cache_writer', '', true)");
      expect(await fails('select toggle_author_subscriptions($1)', [author])).toContain('write_access_denied');
    }
    expect(await fails('select toggle_author_subscriptions($1)', [author], deletedAuthor)).toContain('write_access_denied');
    expect(Number(await scalar(db, 'select count(*) from author_subscriptions'))).toBe(0);
  });

  it('exposes only my rows via RLS and refuses direct writes even on my own row', async () => {
    await toggle();
    await toggle(other, globalAuthor);
    expect((await rows('select * from author_subscriptions', [], reader, 'authenticated')).map((row) => row.user_id)).toEqual([reader]);
    expect((await rows('select * from list_my_author_subscriptions()', [], other, 'authenticated')).map((row) => row.authorId)).toEqual([globalAuthor]);
    expect(await fails('select * from author_subscriptions', [], '', 'anon')).toContain('permission denied');
    for (const statement of [
      'insert into author_subscriptions(author_id, user_id) values ($1, $2)',
      'update author_subscriptions set notify = false where author_id = $1 and user_id = $2',
      'delete from author_subscriptions where author_id = $1 and user_id = $2',
    ]) expect(await fails(statement, [author, reader])).toContain('permission denied');
    expect(await fails('select toggle_author_subscriptions($1, $2)', [author, other])).toContain('does not exist');
    expect(await fails('insert into author_subscriptions(author_id, user_id) values ($1, $1)', [author], '', 'service_role')).toContain('check constraint');
  });

  it('keeps work notification subscriptions independent in both directions', async () => {
    await as(db, '', 'service_role');
    await exec(db, 'insert into work_subscriptions(work_id, user_id) values ($1, $2)', [wid(1), reader]);
    await owner(db);
    const before = await exec(db, 'select * from work_subscriptions');
    await toggle(); await toggle();
    expect(await exec(db, 'select * from work_subscriptions')).toEqual(before);
    expect(await rows('select toggle_work_subscriptions($1) as state', [wid(1)], reader, 'authenticated')).toEqual([{ state: false }]);
    expect((await rows('select * from list_my_author_subscriptions()', [], reader, 'authenticated'))[0].notify).toBe(false);
  });

  it('pins every new definer search_path and limits function grants to the intended API roles', async () => {
    const functions = await exec(db, `select p.proname, p.prosecdef, p.proconfig,
      has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
      has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = $1 and p.proname in ('get_public_author_profile', 'get_public_author_stats',
        'list_public_author_works', 'list_my_author_subscriptions', 'toggle_author_subscriptions')`, [schema]);
    expect(functions).toHaveLength(5);
    for (const fn of functions) {
      expect(fn.prosecdef).toBe(true);
      expect(fn.proconfig).toEqual(['search_path=""']);
      expect(fn.authenticated_execute).toBe(true);
      expect(fn.service_execute).toBe(false);
      expect(fn.anon_execute).toBe(!['list_my_author_subscriptions', 'toggle_author_subscriptions'].includes(fn.proname));
    }
  });
});

describe.skipIf(!process.env.SUPABASE_DB_URL)('author subscriptions: independent-session races (28-01)', () => {
  let db: postgres.Sql;
  const schema = `author_race_${crypto.randomUUID().replaceAll('-', '')}`;
  beforeAll(async () => {
    db = postgres(process.env.SUPABASE_DB_URL!, { max: 1, prepare: false });
    // Commit only isolated test schema/fixtures so the two other sessions can see them.
    await db.begin(async (tx) => { await bootstrap(tx, schema); await seed(tx); });
  });
  afterAll(async () => {
    if (db) try { await owner(db); await exec(db, `drop schema if exists ${schema} cascade`); }
    finally { await db.end(); }
  });
  beforeEach(async () => {
    await exec(db, `set search_path = ${schema}, public`);
    await as(db, '', 'service_role');
    await exec(db, 'delete from author_subscriptions');
    await owner(db);
  });

  it.each([false, true])('serializes two real connections, preserving the row (initial notify=%s)', async (initial) => {
    if (initial) {
      await as(db, reader);
      expect(await scalar(db, 'select toggle_author_subscriptions($1)', [author])).toBe(true);
      await owner(db);
    }
    const clients = [0, 1].map(() => postgres(process.env.SUPABASE_DB_URL!, { max: 1, prepare: false }));
    let ready = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const calls = clients.map((client) => client.begin(async (tx) => {
      await exec(tx, `set local search_path = ${schema}, public; set local statement_timeout = '10s'`);
      await as(tx, reader);
      const pid = await scalar<number>(tx, 'select pg_backend_pid()');
      if (++ready === 2) release();
      await gate;
      const state = await scalar<boolean>(tx, 'select toggle_author_subscriptions($1)', [author]);
      return { pid, state };
    }));
    try {
      const results = await Promise.all(calls);
      expect(new Set(results.map((r) => r.pid)).size).toBe(2);
      expect(results.map((r) => r.state).sort()).toEqual([false, true]);
      const rows = await exec(db, 'select notify, created_at, updated_at from author_subscriptions where author_id = $1 and user_id = $2', [author, reader]);
      expect(rows).toHaveLength(1);
      expect(rows[0].notify).toBe(initial);
      expect(rows[0].updated_at.getTime()).toBeGreaterThanOrEqual(rows[0].created_at.getTime());
    } finally {
      release();
      await Promise.allSettled(calls);
      await Promise.all(clients.map((client) => client.end()));
    }
  });
});
