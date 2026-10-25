import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanupMcpOAuth, createWriter, decodeClaims, issueMcpToken, type Writer,
} from '../helpers/mcp-oauth';

/**
 * 12-06 only: real OAuth/browser bearer REST checks against a disposable Supabase
 * project after 0037/0038 are applied. beforeAll creates its own test writer and issues a
 * real OAuth token plus that writer's browser session token; afterAll deletes them.
 * SUPABASE_DB_URL marks the serialized db project. This suite never applies migrations.
 */
const SHARED_PROJECT_REF_PREFIX = 'ymudwg';
const ref = process.env.MCP_DISPOSABLE_PROJECT_REF?.trim();
const dbUrl = process.env.SUPABASE_DB_URL;
const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ready = Boolean(ref && dbUrl && apiUrl && anonKey && process.env.SUPABASE_SERVICE_ROLE_KEY);
const tables = [
  'wallets', 'ledger_entries', 'byok_keys', 'byok_validation_log',
  'orders', 'order_items', 'entitlements', 'payment_orders',
  'mcp_connections', 'ai_usage',
] as const;

type Claims = { sub: string; client_id?: string; session_id?: string };

describe.skipIf(!ready)(
  'MCP sensitive REST RLS on disposable Supabase', () => {
    let sql: ReturnType<typeof postgres>;
    let oauth: Claims;
    let oauthToken: string;
    let browserToken: string;
    let writer: Writer;
    const clientIds: string[] = [];
    const query = (text: string, params: unknown[] = []) =>
      sql.unsafe(text, params as postgres.ParameterOrJSON<never>[]);

    async function rest(table: string, bearer: string) {
      const response = await fetch(`${apiUrl}/rest/v1/${table}?select=*`, {
        headers: { apikey: anonKey!, Authorization: `Bearer ${bearer}` },
      });
      // Do not print response bodies: they can contain account data.
      return { status: response.status, rows: response.status === 200 ? await response.json() as unknown[] : null };
    }

    beforeAll(async () => {
      const apiRef = new URL(apiUrl!).hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1];
      const pg = new URL(dbUrl!);
      if (!ref || ref !== apiRef || !(`${pg.hostname} ${decodeURIComponent(pg.username)}`.includes(ref))) {
        throw new Error('MCP disposable ref must match both Supabase API and DB URLs');
      }
      if (ref.startsWith(SHARED_PROJECT_REF_PREFIX)) throw new Error('Refusing to run on the shared Supabase project');
      process.env.MCP_PUBLIC_ORIGIN ??= 'http://localhost:3000';
      writer = await createWriter();
      const issued = await issueMcpToken(writer);
      clientIds.push(issued.clientId);
      const browserSession = (await writer.browser.auth.getSession()).data.session;
      if (!browserSession) throw new Error('Expected a live browser session for the test writer');
      oauthToken = issued.accessToken;
      browserToken = browserSession.access_token;
      oauth = decodeClaims(oauthToken);
      const browser = decodeClaims(browserToken);
      if (!oauth.sub || !oauth.client_id || !oauth.session_id || browser.sub !== oauth.sub || browser.client_id) {
        throw new Error('Expected one OAuth token and one browser token for the same writer');
      }
      sql = postgres(dbUrl!, { max: 1, prepare: false });
    });
    afterAll(async () => {
      try { if (sql) await sql.end(); } finally {
        if (writer) await cleanupMcpOAuth(clientIds, [writer]);
      }
    });

    it('has RESTRICTIVE client_id policy on every sensitive table', async () => {
      const rows = await query(`select p.tablename, p.permissive, p.cmd, p.qual, p.with_check
        from pg_policies p where p.schemaname = 'public' and p.policyname = 'oauth_browser_only'
          and p.tablename = any($1::text[])`, [tables]);
      expect(rows).toHaveLength(tables.length); // 12-06 requires skipped 0.
      for (const table of tables) {
        const policy = rows.find((row) => row.tablename === table);
        expect(policy, table).toMatchObject({ permissive: 'RESTRICTIVE', cmd: 'ALL' });
        expect(String(policy!.qual)).toContain('client_id');
        expect(String(policy!.qual)).toContain('IS NULL');
        expect(String(policy!.with_check)).toContain('client_id');
        expect(String(policy!.with_check)).toContain('IS NULL');
      }
    });

    it('blocks the same writer OAuth bearer over REST while preserving browser owner reads', async () => {
      for (const table of tables) {
        const result = await rest(table, oauthToken);
        expect([200, 403], `${table}: unexpected status ${result.status}`).toContain(result.status);
        if (result.status === 200) expect(result.rows, table).toEqual([]);
      }
      const browserWallet = await rest('wallets', browserToken);
      expect(browserWallet.status).toBe(200);
      expect(browserWallet.rows?.some((row) => (row as { id?: string }).id === oauth.sub)).toBe(true);
    });

    it('keeps service role internal reads and blocks OAuth direct writes', async () => {
      // SET ROLE simulates PostgREST's authenticated JWT context on the same DB.
      await query('begin');
      try {
        await query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(oauth)]);
        await query("select set_config('request.jwt.claim.sub', $1, true)", [oauth.sub]);
        await query('set local role authenticated');
        const blocked = await query('select id from public.wallets where id = $1::uuid', [oauth.sub]);
        expect(blocked).toHaveLength(0);
        await query('set local role service_role');
        const internal = await query('select id from public.wallets where id = $1::uuid', [oauth.sub]);
        expect(internal).toHaveLength(1);
      } finally {
        await query('rollback');
      }
      const before = await rest('wallets', browserToken);
      const ownWallet = before.rows?.find((row) => (row as { id?: string }).id === oauth.sub) as
        | { balance: number }
        | undefined;
      expect(ownWallet).toBeDefined();
      const response = await fetch(`${apiUrl}/rest/v1/wallets?id=eq.${oauth.sub}`, {
        method: 'PATCH',
        headers: {
          apikey: anonKey!, Authorization: `Bearer ${oauthToken}`,
          'Content-Type': 'application/json', Prefer: 'return=representation',
        },
        body: JSON.stringify({ balance: ownWallet!.balance }),
      });
      expect([403, 405, 200]).toContain(response.status);
      if (response.status === 200) expect(await response.json()).toEqual([]);
      const after = await rest('wallets', browserToken);
      expect(after.rows?.find((row) => (row as { id?: string }).id === oauth.sub)).toEqual(ownWallet);
    });
  },
);
