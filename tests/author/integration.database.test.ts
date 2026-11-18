import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAuthorProfile, getAuthorStats, listAuthorWorks } from '@/lib/author/queries';
import { getAuthorSubscriptionState, listMyAuthorSubscriptions, toggleAuthorSubscription } from '@/lib/author/subscriptions';
import { chapterViewsToRaw, computeWorldTreePopularity } from '@/lib/world-tree/metric-adapter';

// Opt-in integration proof. Keep all migrations and fixtures inside one rollback-only schema.
// No database is contacted unless SUPABASE_DB_URL is explicitly provided by the DB project.
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
const author = uid(1), reader = uid(2), secondReader = uid(3), otherAuthor = uid(4);

function exec(db: Connection, sql: string, params: unknown[] = []) {
  return db.unsafe(sql, params as postgres.ParameterOrJSON<never>[]);
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
function jsonRows(rows: postgres.RowList<postgres.Row[]>) {
  return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) =>
    [key, value instanceof Date ? value.toISOString() : value])));
}

describe.skipIf(!process.env.SUPABASE_DB_URL)('author page SQL → library integration (28-04)', () => {
  let db: postgres.Sql;
  const schema = `author_integration_${crypto.randomUUID().replaceAll('-', '')}`;
  beforeAll(async () => {
    db = postgres(process.env.SUPABASE_DB_URL!, { max: 1, prepare: false });
    await exec(db, 'begin');
    await bootstrap(db, schema);
    await as(db, '', 'service_role');
    for (let n = 1; n <= 4; n++) {
      await exec(db, 'insert into test_users(id) values ($1)', [uid(n)]);
      await exec(db, 'update profiles set pen_name = $2, pen_name_bio = $3 where id = $1',
        [uid(n), `Author-${n}`, n === 1 ? 'Public bio' : null]);
    }
    // Thirteen public works, one private work, and a different author's public global maximum.
    for (let n = 1; n <= 15; n++) {
      const writer = n === 15 ? otherAuthor : author;
      const status = n % 2 === 0 ? 'completed' : 'ongoing';
      await exec(db, `insert into works(id, owner_id, title, synopsis, serial_status, created_at)
        values ($1, $2, $3, 'Public synopsis', $4, $5)`,
      [wid(n), writer, `Work-${n}`, status, `2026-01-${String(n).padStart(2, '0')}T00:00:00Z`]);
      const published = n !== 14;
      for (let chapter = 1; chapter <= 2; chapter++) {
        await exec(db, `insert into chapters(work_id, title, content, order_index, is_published, published_at, view_count)
          values ($1, 'Chapter', 'PRIVATE BODY', $2, $3, $4, $5)`,
        [wid(n), chapter, published, `2026-02-${String(n).padStart(2, '0')}T00:00:00Z`,
          n === 15 ? 200 : chapter === 1 ? n * 10 : n * 5]);
      }
      if (n === 1 || n === 13 || n === 15) {
        for (const liker of [reader, secondReader]) {
          await exec(db, 'insert into work_likes(work_id, user_id) values ($1, $2)', [wid(n), liker]);
        }
      }
    }
    await owner(db);
  });
  afterAll(async () => { if (db) try { await owner(db); await exec(db, 'rollback'); } finally { await db.end(); } });

  async function sql(sqlText: string, params: unknown[] = [], id = '', role: Role = 'anon') {
    await as(db, id, role);
    try { return await exec(db, sqlText, params); } finally { await owner(db); }
  }
  // Minimal PostgREST-shaped bridge: the library still performs its real RPC mapping.
  function client(id = '', role: Role = id ? 'authenticated' : 'anon'): SupabaseClient {
    return {
      auth: { getUser: async () => ({ data: { user: id ? { id } : null }, error: null }) },
      rpc: async (name: string, args: Record<string, unknown> = {}) => {
        const queries: Record<string, [string, unknown[]]> = {
          get_public_author_profile: ['select * from get_public_author_profile($1)', [args.p_author_id]],
          get_public_author_stats: ['select * from get_public_author_stats($1)', [args.p_author_id]],
          list_public_author_works: ['select * from list_public_author_works($1, $2, $3, $4, $5)',
            [args.p_author_id, args.p_status, args.p_sort, args.p_offset, args.p_limit]],
          list_my_author_subscriptions: ['select * from list_my_author_subscriptions()', []],
          toggle_author_subscriptions: ['select toggle_author_subscriptions($1) as value', [args.p_author_id]],
          get_write_access: ['select get_write_access($1) as value', [args.p_user_id]],
        };
        const query = queries[name];
        if (!query) return { data: null, error: { message: 'unknown RPC' } };
        try {
          const rows = jsonRows(await sql(query[0], query[1], id, role));
          return { data: name === 'toggle_author_subscriptions' ? rows[0]?.value
            : name === 'get_write_access' ? rows[0]?.value : rows, error: null };
        } catch (error) { return { data: null, error: { message: (error as Error).message } }; }
      },
      from: (table: string) => {
        const filters: unknown[] = [];
        const builder = {
          select: () => builder,
          eq: (_column: string, value: unknown) => { filters.push(value); return builder; },
          maybeSingle: async () => {
            if (table !== 'author_subscriptions') return { data: null, error: { message: 'unknown table' } };
            const rows = await sql('select notify from author_subscriptions where author_id = $1 and user_id = $2', filters, id, role);
            return { data: rows[0] ?? null, error: null };
          },
        };
        return builder;
      },
    } as unknown as SupabaseClient;
  }

  it('maps anon SQL profile, stats, status filters and 12-item pages into public DTOs', async () => {
    const anon = client();
    expect(await getAuthorProfile(anon, author)).toEqual({ ok: true, profile: {
      authorId: author, penName: 'Author-1', penNameBio: 'Public bio',
    } });
    const stats = await getAuthorStats(anon, author);
    expect(stats).toMatchObject({ ok: true, stats: { workCount: 13, ongoingCount: 7, completedCount: 6 } });
    const first = await listAuthorWorks(anon, author, { sort: 'popular' });
    expect(first).toMatchObject({ ok: true, page: { totalCount: 13, nextOffset: 12 } });
    if (!first.ok) throw new Error('expected first page');
    const last = await listAuthorWorks(anon, author, { sort: 'popular', offset: first.page.nextOffset });
    expect(last).toMatchObject({ ok: true, page: { totalCount: 13, nextOffset: null } });
    if (!last.ok) throw new Error('expected final page');
    const all = [...first.page.items, ...last.page.items];
    expect(new Set(all.map((work) => work.id)).size).toBe(13);
    expect(all.every((work) => !JSON.stringify(work).includes('PRIVATE BODY'))).toBe(true);
    const completed = await listAuthorWorks(anon, author, { status: 'completed' });
    expect(completed).toMatchObject({ ok: true, page: { totalCount: 6, nextOffset: null } });
    if (!completed.ok) throw new Error('expected completed works');
    expect(completed.page.items.every((work) => work.serialStatus === 'completed')).toBe(true);
    expect(await getAuthorProfile(anon, uid(999))).toMatchObject({ ok: false, code: 'not_found' });
  });

  it('shares the feed/world-tree popularity formula across the complete SQL candidate set', async () => {
    const baseline = { maxTotalViews: 400, maxLikeCount: 2 };
    const expected = Array.from({ length: 13 }, (_, index) => {
      const n = index + 1;
      const raw = chapterViewsToRaw([n * 10, n * 5], n === 1 || n === 13 ? 2 : 0);
      return { id: wid(n), score: computeWorldTreePopularity(raw, baseline), created: n };
    }).sort((a, b) => b.score - a.score || b.created - a.created || a.id.localeCompare(b.id));
    const anon = client();
    const first = await listAuthorWorks(anon, author, { sort: 'popular' });
    const second = await listAuthorWorks(anon, author, { sort: 'popular', offset: 12 });
    if (!first.ok || !second.ok) throw new Error('expected ranked pages');
    expect([...first.page.items, ...second.page.items].map(({ id, popularityScore }) => ({ id, score: popularityScore })))
      .toEqual(expected.map(({ id, score }) => ({ id, score })));
    await sql("update works set serial_status = 'completed' where id = $1", [wid(1)], '', 'service_role');
    await sql(`insert into chapters(work_id, title, order_index, is_published, published_at, view_count)
      values ($1, 'New chapter', 3, true, '2026-11-01T00:00:00Z', 30)`, [wid(1)], '', 'service_role');
    expect(await getAuthorStats(anon, author)).toMatchObject({ ok: true, stats: { completedCount: 7, ongoingCount: 6 } });
    const updated = await listAuthorWorks(anon, author);
    expect(updated.ok && updated.page.items[0]).toMatchObject({ id: wid(1), chapterCount: 3, totalViews: 45 });
  });

  it('retains notify=false through SQL, library list and optimistic page state with a 1/0/1 count', async () => {
    const account = client(reader);
    await sql('insert into work_subscriptions(work_id, user_id) values ($1, $2)', [wid(1), reader], '', 'service_role');
    const beforeWorks = await sql('select * from work_subscriptions');
    let createdAt: Date | null = null;
    let lastUpdatedAt: Date | null = null;
    for (const [notify, count] of [[true, 1], [false, 0], [true, 1]] as const) {
      expect(await toggleAuthorSubscription(account, author)).toEqual({ ok: true, notify, subscriberCount: count });
      expect(await getAuthorSubscriptionState(account, author)).toEqual({ ok: true, notify });
      const list = await listMyAuthorSubscriptions(account);
      expect(list).toMatchObject({ ok: true, items: [{ authorId: author, notify }] });
      const [row] = await sql('select created_at, updated_at from author_subscriptions where author_id = $1 and user_id = $2', [author, reader], '', 'service_role');
      if (createdAt) {
        expect(row.created_at).toEqual(createdAt);
        expect(row.updated_at.getTime()).toBeGreaterThan(lastUpdatedAt!.getTime());
      }
      createdAt = row.created_at;
      lastUpdatedAt = row.updated_at;
      expect(await getAuthorStats(client(), author)).toMatchObject({ ok: true, stats: { subscriberCount: count } });
    }
    expect(await sql('select * from work_subscriptions')).toEqual(beforeWorks);
    expect(Number((await sql('select count(*) as total from author_subscriptions'))[0].total)).toBe(1);
    expect(await getAuthorSubscriptionState(client(secondReader), author)).toEqual({ ok: true, notify: false });
  });
});
