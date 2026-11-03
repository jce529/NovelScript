import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertDisposableRef } from '../helpers/disposable-ref';
import {
  cleanupMcpOAuth, createWriter, decodeClaims, issueMcpToken, restRows,
  type IssuedToken, type Writer,
} from '../helpers/mcp-oauth';

/**
 * 13-01 D-17 boundary on a disposable Supabase project with 0037 -> 0038 -> 0039 applied.
 * - Every permanent public table is closed to OAuth bearers (JWT carries client_id),
 *   except works / chapters / kb_nodes / work_ai_instructions, which allow SELECT of the
 *   bearer's own rows while its MCP grant is live, and never DML.
 * - mcp_read_owned_chapter_content(uuid) returns the owner's chapter body in every state.
 * - Browser sessions (no client_id) and anonymous readers keep their behavior.
 * SUPABASE_DB_URL marks this file for vitest's serialized db project. This suite never
 * applies migrations and never prints tokens or response bodies.
 */
const dbUrl = process.env.SUPABASE_DB_URL;
const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ready = Boolean(process.env.MCP_DISPOSABLE_PROJECT_REF?.trim() && dbUrl && apiUrl && anonKey
  && process.env.SUPABASE_SERVICE_ROLE_KEY);

const READ_TABLES = ['works', 'chapters', 'kb_nodes', 'work_ai_instructions'] as const;
/** 13-PLAN-NOTES catalog (40 permanent public tables), confirmed against the disposable DB. */
const EXPECTED_PUBLIC_TABLES = [
  'admin_actions', 'admin_users', 'ai_doc_activation_approvals', 'ai_doc_activation_evidence',
  'ai_doc_plan_decision_log', 'ai_doc_plan_shadow_log', 'ai_generation_locks', 'ai_usage',
  'byok_keys', 'byok_validation_log', 'chapter_reading_state', 'chapters', 'entitlements',
  'kb_nodes', 'kb_template_backfill_copies', 'kb_template_seed_catalog', 'ledger_entries',
  'mcp_connections', 'moderation_review_requests', 'order_items', 'orders', 'payment_orders',
  'payment_topup_tiers', 'profiles', 'publication_notifications', 'reading_progress', 'reports',
  'user_sanctions', 'wallets', 'warning_acknowledgements', 'work_ai_instructions',
  'work_bookmarks', 'work_likes', 'work_subscriptions', 'works', 'world_branch_docs',
  'world_branch_notices', 'world_branches', 'world_era_placements', 'world_eras',
].sort();
const SENSITIVE_0038 = [
  'wallets', 'ledger_entries', 'byok_keys', 'byok_validation_log', 'orders', 'order_items',
  'entitlements', 'payment_orders', 'mcp_connections', 'ai_usage',
];
const BLOCKED_TABLES = EXPECTED_PUBLIC_TABLES.filter((t) => !(READ_TABLES as readonly string[]).includes(t));

type Fixture = {
  wA: string; wA2: string; wAdel: string; wB: string;
  cDraft: string; cPaid: string; cFree: string; cBlind: string; cDeleted: string; cInDeletedWork: string;
  cB: string; kA: string; kAcct: string; kB: string;
};

describe.skipIf(!ready)('MCP D-17 read boundary on disposable Supabase (0039)', () => {
  let sql: ReturnType<typeof postgres>;
  let writerA: Writer;
  let writerB: Writer;
  let aTok: IssuedToken;
  let bTok: IssuedToken;
  let aBrowser: string;
  const clientIds: string[] = [];
  const f = {} as Fixture;
  const query = (text: string, params: unknown[] = []) =>
    sql.unsafe(text, params as postgres.ParameterOrJSON<never>[]);

  async function rest(method: string, path: string, bearer: string, body?: unknown) {
    const response = await fetch(`${apiUrl}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: anonKey!, Authorization: `Bearer ${bearer}`,
        'Content-Type': 'application/json', Prefer: 'return=representation',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, json: response.ok && text ? JSON.parse(text) as unknown : null };
  }
  const ids = (rows: unknown[] | null) => (rows ?? []).map((row) => (row as { id: string }).id);
  const readChapter = (bearer: string, chapterId: string) =>
    rest('POST', 'rpc/mcp_read_owned_chapter_content', bearer, { p_chapter_id: chapterId });

  /** Runs `fn` as PostgREST would for `claims` (role authenticated), then rolls back. */
  async function asClaims<T>(claims: Record<string, unknown>, fn: () => Promise<T>): Promise<T> {
    await query('begin');
    try {
      await query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
      await query("select set_config('request.jwt.claim.sub', $1, true)", [String(claims.sub)]);
      await query('set local role authenticated');
      return await fn();
    } finally {
      await query('rollback');
    }
  }
  /** Row count visible to the current role, or 'denied' on a privilege error. */
  async function visibleCount(table: string): Promise<number | 'denied'> {
    await query('savepoint probe');
    try {
      const rows = await query(`select count(*)::int as n from public.${table}`);
      await query('release savepoint probe');
      return rows[0].n as number;
    } catch (error) {
      await query('rollback to savepoint probe');
      if ((error as { code?: string }).code === '42501') return 'denied';
      throw error;
    }
  }

  beforeAll(async () => {
    assertDisposableRef();
    process.env.MCP_PUBLIC_ORIGIN ??= 'http://localhost:3000';
    sql = postgres(dbUrl!, { max: 1, prepare: false });
    writerA = await createWriter();
    writerB = await createWriter();
    aTok = await issueMcpToken(writerA, { clientName: 'mcp-test-read-A' });
    bTok = await issueMcpToken(writerB, { clientName: 'mcp-test-read-B' });
    clientIds.push(aTok.clientId, bTok.clientId);
    const session = (await writerA.browser.auth.getSession()).data.session;
    if (!session) throw new Error('Expected a live browser session for writer A');
    aBrowser = session.access_token;
    if (decodeClaims(aBrowser).client_id || !aTok.claims.client_id) throw new Error('token kinds mismatch');

    Object.assign(f, Object.fromEntries([
      'wA', 'wA2', 'wAdel', 'wB', 'cDraft', 'cPaid', 'cFree', 'cBlind', 'cDeleted', 'cInDeletedWork',
      'cB', 'kA', 'kAcct', 'kB',
    ].map((key) => [key, randomUUID()])));
    // Fixtures are inserted directly (superuser connection) so RLS does not shape them.
    await query(`insert into public.works (id, owner_id, title, deleted_at) values
      ($1, $5, 'mcp read A', null), ($2, $5, 'mcp read A2', null),
      ($3, $5, 'mcp read A deleted', now()), ($4, $6, 'mcp read B', null)`,
    [f.wA, f.wA2, f.wAdel, f.wB, writerA.id, writerB.id]);
    await query(`insert into public.chapters
      (id, work_id, title, content, order_index, is_published, price_tier, published_at,
       admin_blinded, admin_blind_reason, admin_blinded_at, deleted_at) values
      ($1, $7, 'draft', 'body-draft', 1, false, null, null, false, null, null, null),
      ($2, $7, 'paid', 'body-paid', 2, true, 30, now(), false, null, null, null),
      ($3, $7, 'free', 'body-free', 3, true, null, now(), false, null, null, null),
      ($4, $7, 'blind', 'body-blind', 4, true, null, now(), true, 'test blind', now(), null),
      ($5, $7, 'deleted', 'body-deleted', 5, false, null, null, false, null, null, now()),
      ($6, $8, 'in deleted work', 'body-in-deleted-work', 1, false, null, null, false, null, null, null),
      ($9, $10, 'B public', 'body-B', 1, true, null, now(), false, null, null, null)`,
    [f.cDraft, f.cPaid, f.cFree, f.cBlind, f.cDeleted, f.cInDeletedWork, f.wA, f.wAdel, f.cB, f.wB]);
    await query(`insert into public.kb_nodes (id, owner_id, work_id, scope, parent_id, node_type, category, is_locked, name) values
      ($1, $4, $5, 'work', null, 'folder', '인물', false, 'A people'),
      ($2, $4, null, 'account_template', null, 'folder', 'custom', false, 'A shared'),
      ($3, $6, $7, 'work', null, 'folder', '인물', false, 'B people')`,
    [f.kA, f.kAcct, f.kB, writerA.id, f.wA, writerB.id, f.wB]);
    await query(`insert into public.work_ai_instructions (work_id, instruction) values ($1, 'A rule'), ($2, 'B rule')`,
      [f.wA, f.wB]);
    await query('insert into public.work_likes (work_id, user_id) values ($1, $2)', [f.wB, writerB.id]);
  }, 180_000);

  afterAll(async () => {
    try {
      if (sql) {
        const owners = [writerA?.id, writerB?.id].filter(Boolean);
        // Include any work owned by the test writers (e.g. an OAuth insert that slipped through).
        const owned = owners.length
          ? await query('select id from public.works where owner_id = any($1::uuid[])', [owners])
          : [];
        const works = [...new Set([f.wA, f.wA2, f.wAdel, f.wB, ...owned.map((row) => row.id as string)])].filter(Boolean);
        await query('delete from public.work_likes where work_id = any($1::uuid[]) or user_id = any($2::uuid[])', [works, owners]);
        await query('delete from public.work_ai_instructions where work_id = any($1::uuid[])', [works]);
        await query('delete from public.chapters where work_id = any($1::uuid[])', [works]);
        await query('delete from public.kb_nodes where owner_id = any($1::uuid[])', [owners]);
        await query('delete from public.works where id = any($1::uuid[])', [works]);
        await sql.end();
      }
    } finally {
      await cleanupMcpOAuth(clientIds, [writerA, writerB].filter(Boolean));
    }
  }, 180_000);

  describe('catalog', () => {
    it('classifies every permanent public table (40) into blocked or owner-read', async () => {
      const tables = await query(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relpersistence = 'p' order by 1`);
      expect(tables.map((row) => row.relname as string).sort()).toEqual(EXPECTED_PUBLIC_TABLES);
      expect(BLOCKED_TABLES).toHaveLength(36);
      for (const table of SENSITIVE_0038) expect(BLOCKED_TABLES).toContain(table);

      const policies = await query(`select tablename, policyname, permissive, cmd, roles::text as roles, qual, with_check
        from pg_policies where schemaname = 'public'
          and (policyname = 'oauth_browser_only' or policyname like 'mcp_oauth_%')`);
      for (const table of BLOCKED_TABLES) {
        const policy = policies.find((p) => p.tablename === table && p.policyname === 'oauth_browser_only');
        expect(policy, table).toMatchObject({ permissive: 'RESTRICTIVE', cmd: 'ALL', roles: '{authenticated}' });
        expect(String(policy!.qual), table).toMatch(/client_id[\s\S]*IS NULL/);
        expect(String(policy!.with_check), table).toMatch(/client_id[\s\S]*IS NULL/);
        expect(policies.some((p) => p.tablename === table && String(p.policyname).startsWith('mcp_oauth_')), table).toBe(false);
      }
      for (const table of READ_TABLES) {
        const mine = policies.filter((p) => p.tablename === table);
        expect(mine.some((p) => p.policyname === 'oauth_browser_only'), table).toBe(false);
        const select = mine.find((p) => p.policyname === 'mcp_oauth_owner_select');
        expect(select, table).toMatchObject({ permissive: 'RESTRICTIVE', cmd: 'SELECT', roles: '{authenticated}' });
        expect(String(select!.qual), table).toContain('mcp_grant_is_live()');
        expect(String(select!.qual), table).toContain('auth.uid()');
        expect(String(select!.qual), table).toMatch(/client_id[\s\S]*IS NULL/);
        for (const [name, cmd] of [['mcp_oauth_no_insert', 'INSERT'], ['mcp_oauth_no_update', 'UPDATE'], ['mcp_oauth_no_delete', 'DELETE']]) {
          const policy = mine.find((p) => p.policyname === name);
          expect(policy, `${table}.${name}`).toMatchObject({ permissive: 'RESTRICTIVE', cmd, roles: '{authenticated}' });
          expect(`${policy!.qual ?? ''} ${policy!.with_check ?? ''}`, `${table}.${name}`).toMatch(/client_id[\s\S]*IS NULL/);
          expect(`${policy!.qual ?? ''} ${policy!.with_check ?? ''}`, `${table}.${name}`).not.toContain('mcp_grant_is_live');
        }
      }
    });

    it('locks down the grant helper and the owner chapter RPC', async () => {
      const rows = await query(`select p.proname, p.prosecdef, p.provolatile, coalesce(p.proconfig, array[]::text[]) as config,
          p.prosrc, p.proacl::text as acl,
          has_function_privilege('anon', p.oid, 'execute') as anon_exec,
          has_function_privilege('authenticated', p.oid, 'execute') as auth_exec,
          has_function_privilege('service_role', p.oid, 'execute') as service_exec
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in ('mcp_grant_is_live', 'mcp_read_owned_chapter_content')`);
      expect(rows).toHaveLength(2);
      for (const fn of rows) {
        expect(fn.prosecdef, fn.proname).toBe(true);
        expect(fn.provolatile, fn.proname).toBe('s');
        expect(fn.config, fn.proname).toContain('search_path=""');
        expect(fn.anon_exec, fn.proname).toBe(false);
        expect(fn.auth_exec, fn.proname).toBe(true);
        expect(fn.service_exec, fn.proname).toBe(false);
        // No PUBLIC (empty grantee) entry in the ACL.
        expect(String(fn.acl), fn.proname).not.toMatch(/[{,]=X/);
      }
      const rpc = rows.find((fn) => fn.proname === 'mcp_read_owned_chapter_content')!;
      expect(rpc.prosrc).not.toContain('can_view');
      expect(rpc.prosrc).toContain('mcp_grant_is_live()');
      expect(rpc.prosrc).toContain('owner_id');
      expect(rpc.prosrc).toMatch(/c\.deleted_at is null/);
      expect(rpc.prosrc).toMatch(/w\.deleted_at is null/);
    });
  });

  describe('blocked tables', () => {
    it('OAuth claims see 0 rows (or are denied) on all 36 blocked tables while browser claims see own rows', async () => {
      const oauthClaims = { ...aTok.claims, role: 'authenticated' };
      const browserClaims = { ...decodeClaims(aBrowser), role: 'authenticated' };
      const oauthCounts = await asClaims(oauthClaims, async () => {
        const counts: Record<string, number | 'denied'> = {};
        for (const table of BLOCKED_TABLES) counts[table] = await visibleCount(table);
        return counts;
      });
      for (const table of BLOCKED_TABLES) {
        expect([0, 'denied'], `${table}: ${oauthCounts[table]}`).toContain(oauthCounts[table]);
      }
      const browserCounts = await asClaims(browserClaims, async () => ({
        profiles: await visibleCount('profiles'),
        mcp_connections: await visibleCount('mcp_connections'),
        work_likes: await visibleCount('work_likes'),
      }));
      expect(browserCounts.profiles).toBeGreaterThan(0);
      expect(browserCounts.mcp_connections).toBeGreaterThan(0);
      expect(browserCounts.work_likes).toBeGreaterThan(0);
    });

    it('OAuth REST reads and writes on blocked tables are refused; the browser path still works', async () => {
      for (const table of BLOCKED_TABLES) {
        const result = await restRows(table, 'select=*', aTok.accessToken);
        expect([200, 401, 403], `${table}: ${result.status}`).toContain(result.status);
        if (result.status === 200) expect(result.rows, table).toEqual([]);
      }
      expect((await restRows('profiles', `id=eq.${writerA.id}&select=id`, aBrowser)).rows).toHaveLength(1);
      expect((await restRows('work_likes', `work_id=eq.${f.wB}&select=user_id`, aBrowser)).rows).toHaveLength(1);

      const like = await rest('POST', 'work_likes', aTok.accessToken, { work_id: f.wB, user_id: writerA.id });
      expect([401, 403]).toContain(like.status);
      const before = await query('select pen_name from public.profiles where id = $1', [writerA.id]);
      const patch = await rest('PATCH', `profiles?id=eq.${writerA.id}`, aTok.accessToken, { pen_name: 'oauthchanged' });
      expect([200, 401, 403]).toContain(patch.status);
      if (patch.status === 200) expect(patch.json).toEqual([]);
      expect(await query('select pen_name from public.profiles where id = $1', [writerA.id])).toEqual(before);
      expect(await query('select 1 from public.work_likes where work_id = $1 and user_id = $2', [f.wB, writerA.id])).toHaveLength(0);

      // Browser regression: the same writer's browser session can still like and unlike.
      const browserLike = await rest('POST', 'work_likes', aBrowser, { work_id: f.wB, user_id: writerA.id });
      expect(browserLike.status).toBe(201);
      const browserUnlike = await rest('DELETE', `work_likes?work_id=eq.${f.wB}&user_id=eq.${writerA.id}`, aBrowser);
      expect(browserUnlike.status).toBe(200);
      expect(browserUnlike.json).toHaveLength(1);
    });
  });

  describe('four read tables', () => {
    it('live OAuth reads only its own works, chapters, kb_nodes and work instructions', async () => {
      const works = await restRows('works', 'select=id,owner_id', aTok.accessToken);
      expect(works.status).toBe(200);
      expect(ids(works.rows)).toEqual(expect.arrayContaining([f.wA, f.wA2]));
      expect(ids(works.rows)).not.toContain(f.wB);
      expect((works.rows ?? []).every((row) => (row as { owner_id: string }).owner_id === writerA.id)).toBe(true);

      const chapters = await restRows('chapters', `work_id=eq.${f.wA}&select=id`, aTok.accessToken);
      expect(chapters.status).toBe(200);
      expect(ids(chapters.rows)).toEqual(expect.arrayContaining([f.cDraft, f.cPaid, f.cFree, f.cBlind]));

      const kb = await restRows('kb_nodes', 'select=id,owner_id', aTok.accessToken);
      expect(kb.status).toBe(200);
      expect(ids(kb.rows)).toEqual(expect.arrayContaining([f.kA, f.kAcct]));
      expect(ids(kb.rows)).not.toContain(f.kB);
      expect((kb.rows ?? []).every((row) => (row as { owner_id: string }).owner_id === writerA.id)).toBe(true);

      const instructions = await restRows('work_ai_instructions', 'select=work_id', aTok.accessToken);
      expect(instructions.status).toBe(200);
      expect((instructions.rows ?? []).map((row) => (row as { work_id: string }).work_id)).toEqual([f.wA]);

      // Column grant is unchanged: the body is not readable over REST.
      expect([401, 403]).toContain((await restRows('chapters', `id=eq.${f.cDraft}&select=content`, aTok.accessToken)).status);
    });

    it("hides other writers' public works and chapters from OAuth even though browsers and anon see them", async () => {
      const browserChapter = await restRows('chapters', `id=eq.${f.cB}&select=id`, aBrowser);
      expect(ids(browserChapter.rows)).toEqual([f.cB]); // precondition: B's chapter is public
      const anonChapter = await restRows('chapters', `id=eq.${f.cB}&select=id`, anonKey!);
      expect(ids(anonChapter.rows)).toEqual([f.cB]);
      expect(ids((await restRows('works', `id=eq.${f.wB}&select=id`, aBrowser)).rows)).toEqual([f.wB]);

      for (const [table, q] of [
        ['works', `id=eq.${f.wB}&select=id`],
        ['chapters', `id=eq.${f.cB}&select=id`],
        ['chapters', `work_id=eq.${f.wB}&select=id`],
        ['kb_nodes', `id=eq.${f.kB}&select=id`],
        ['work_ai_instructions', `work_id=eq.${f.wB}&select=work_id`],
      ] as const) {
        const result = await restRows(table, q, aTok.accessToken);
        expect(result.status, `${table}?${q}`).toBe(200);
        expect(result.rows, `${table}?${q}`).toEqual([]);
      }
      // And the reverse direction: B's OAuth token cannot see A's rows.
      for (const [table, q] of [
        ['works', `id=eq.${f.wA}&select=id`],
        ['chapters', `id=eq.${f.cFree}&select=id`],
        ['kb_nodes', `owner_id=eq.${writerA.id}&select=id`],
        ['work_ai_instructions', `work_id=eq.${f.wA}&select=work_id`],
      ] as const) {
        expect((await restRows(table, q, bTok.accessToken)).rows, `${table}?${q}`).toEqual([]);
      }
    });

    it('refuses OAuth INSERT, UPDATE and DELETE on all four tables and leaves rows unchanged', async () => {
      const snapshot = async () => ({
        works: await query('select id, title from public.works where owner_id = $1 order by id', [writerA.id]),
        chapters: await query('select id, title from public.chapters where work_id = any($1::uuid[]) order by id', [[f.wA, f.wA2]]),
        kb: await query('select id, name, deleted_at from public.kb_nodes where owner_id = $1 order by id', [writerA.id]),
        instructions: await query('select work_id, instruction from public.work_ai_instructions where work_id = any($1::uuid[]) order by work_id', [[f.wA, f.wA2]]),
      });
      const before = await snapshot();
      const denied = (status: number, json: unknown) => {
        expect([401, 403, 404, 405, 200, 204]).toContain(status);
        if (status === 200) expect(json).toEqual([]);
      };
      const writes: Array<[string, string, unknown?]> = [
        ['POST', 'works', { owner_id: writerA.id, title: 'oauth insert' }],
        ['PATCH', `works?id=eq.${f.wA}`, { title: 'oauth update' }],
        ['DELETE', `works?id=eq.${f.wA2}`],
        // chapters: return only granted columns, so a 403 can only come from the write itself.
        ['POST', 'chapters?select=id', { work_id: f.wA2, title: 'oauth insert', content: 'x', order_index: 1 }],
        ['PATCH', `chapters?id=eq.${f.cDraft}&select=id`, { title: 'oauth update' }],
        ['DELETE', `chapters?id=eq.${f.cDraft}&select=id`],
        ['POST', 'kb_nodes', { owner_id: writerA.id, work_id: f.wA2, scope: 'work', node_type: 'folder', category: '장소', name: 'oauth insert' }],
        ['PATCH', `kb_nodes?id=eq.${f.kA}`, { name: 'oauth update' }],
        ['DELETE', `kb_nodes?id=eq.${f.kAcct}`],
        ['POST', 'work_ai_instructions', { work_id: f.wA2, instruction: 'oauth insert' }],
        ['PATCH', `work_ai_instructions?work_id=eq.${f.wA}`, { instruction: 'oauth update' }],
        ['DELETE', `work_ai_instructions?work_id=eq.${f.wA}`],
      ];
      for (const [method, path, body] of writes) {
        const result = await rest(method, path, aTok.accessToken, body);
        expect(result.status, `${method} ${path}`).not.toBe(201);
        denied(result.status, result.json);
      }
      expect(await snapshot()).toEqual(before);

      // SQL level: inserts violate the restrictive policy; updates/deletes match no rows.
      await asClaims({ ...aTok.claims, role: 'authenticated' }, async () => {
        await query('savepoint ins');
        await expect(query("insert into public.work_ai_instructions (work_id, instruction) values ($1, 'x')", [f.wA2]))
          .rejects.toMatchObject({ code: '42501' });
        await query('rollback to savepoint ins');
        expect(await query("update public.kb_nodes set name = 'x' where id = $1 returning id", [f.kA])).toHaveLength(0);
        expect(await query('delete from public.work_ai_instructions where work_id = $1 returning work_id', [f.wA])).toHaveLength(0);
        expect(await query('select id from public.works where id = $1', [f.wA])).toHaveLength(1);
      });
    });

    it('browser session keeps owner reads and writes on the four tables', async () => {
      expect(ids((await restRows('works', `id=eq.${f.wA}&select=id`, aBrowser)).rows)).toEqual([f.wA]);
      expect(ids((await restRows('chapters', `id=eq.${f.cDraft}&select=id`, aBrowser)).rows)).toEqual([f.cDraft]);
      expect(ids((await restRows('kb_nodes', `id=eq.${f.kAcct}&select=id`, aBrowser)).rows)).toEqual([f.kAcct]);
      expect((await restRows('work_ai_instructions', `work_id=eq.${f.wA}&select=work_id`, aBrowser)).rows).toHaveLength(1);

      // Representation limited to granted columns (content has no column SELECT grant).
      const rename = await rest('PATCH', `chapters?id=eq.${f.cDraft}&select=id`, aBrowser, { title: 'draft renamed' });
      expect(rename.status).toBe(200);
      expect(rename.json).toHaveLength(1);
      const insert = await rest('POST', 'work_ai_instructions', aBrowser, { work_id: f.wA2, instruction: 'browser rule' });
      expect(insert.status).toBe(201);
      const remove = await rest('DELETE', `work_ai_instructions?work_id=eq.${f.wA2}`, aBrowser);
      expect(remove.status).toBe(200);
      expect(remove.json).toHaveLength(1);
      const node = await rest('PATCH', `kb_nodes?id=eq.${f.kA}`, aBrowser, { name: 'A people renamed' });
      expect(node.status).toBe(200);
      expect(node.json).toHaveLength(1);
      await query("update public.chapters set title = 'draft' where id = $1", [f.cDraft]);
      await query("update public.kb_nodes set name = 'A people' where id = $1", [f.kA]);
    });
  });

  describe('grant liveness', () => {
    it('stops the same unexpired token right after mcp_disconnect, revokeGrant, or with no grant row', async () => {
      const disconnected = await issueMcpToken(writerA, { clientName: 'mcp-test-read-A-disc' });
      const revoked = await issueMcpToken(writerA, { clientName: 'mcp-test-read-A-revoke' });
      const noGrant = await issueMcpToken(writerA, { clientName: 'mcp-test-read-A-none', connect: false });
      clientIds.push(disconnected.clientId, revoked.clientId, noGrant.clientId);
      for (const token of [disconnected, revoked]) {
        expect(ids((await restRows('works', `id=eq.${f.wA}&select=id`, token.accessToken)).rows)).toEqual([f.wA]);
        expect((await readChapter(token.accessToken, f.cDraft)).json).toBe('body-draft');
      }

      expect((await writerA.browser.rpc('mcp_disconnect', { p_client_id: disconnected.clientId })).error).toBeNull();
      expect((await writerA.browser.auth.oauth.revokeGrant({ clientId: revoked.clientId })).error).toBeNull();

      for (const token of [disconnected, revoked, noGrant]) {
        expect(token.claims.exp * 1000).toBeGreaterThan(Date.now());
        for (const [table, q] of [
          ['works', `id=eq.${f.wA}&select=id`],
          ['chapters', `work_id=eq.${f.wA}&select=id`],
          ['kb_nodes', `owner_id=eq.${writerA.id}&select=id`],
          ['work_ai_instructions', `work_id=eq.${f.wA}&select=work_id`],
        ] as const) {
          const result = await restRows(table, q, token.accessToken);
          expect([200, 401, 403], `${table}: ${result.status}`).toContain(result.status);
          if (result.status === 200) expect(result.rows, `${table}?${q}`).toEqual([]);
        }
        const body = await readChapter(token.accessToken, f.cDraft);
        expect(body.status).not.toBe(200);
        expect(body.json).toBeNull();
      }
      // The original live token is unaffected.
      expect(ids((await restRows('works', `id=eq.${f.wA}&select=id`, aTok.accessToken)).rows)).toEqual([f.wA]);
    }, 180_000);
  });

  describe('mcp_read_owned_chapter_content', () => {
    it('returns the owner body for draft, paid, free and blinded chapters', async () => {
      for (const [chapter, body] of [
        [f.cDraft, 'body-draft'], [f.cPaid, 'body-paid'], [f.cFree, 'body-free'], [f.cBlind, 'body-blind'],
      ] as const) {
        const result = await readChapter(aTok.accessToken, chapter);
        expect(result.status, body).toBe(200);
        expect(result.json, body).toBe(body);
      }
    });

    it("returns null for another writer's public chapter, deleted chapters, deleted works and unknown ids", async () => {
      for (const chapter of [f.cB, f.cDeleted, f.cInDeletedWork, randomUUID()]) {
        const result = await readChapter(aTok.accessToken, chapter);
        expect(result.status).toBe(200);
        expect(result.json).toBeNull();
      }
      const cross = await readChapter(bTok.accessToken, f.cDraft);
      expect(cross.status).toBe(200);
      expect(cross.json).toBeNull();
    });

    it('refuses browser sessions and anonymous callers', async () => {
      const browser = await readChapter(aBrowser, f.cDraft);
      expect([401, 403]).toContain(browser.status);
      expect(browser.json).toBeNull();
      const anon = await readChapter(anonKey!, f.cDraft);
      expect([401, 403, 404]).toContain(anon.status);
      expect(anon.json).toBeNull();
    });
  });
});
