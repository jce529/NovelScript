import { createHash, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { assertDisposableRef } from './disposable-ref';
import {
  cleanupMcpOAuth, createWriter, decodeClaims, issueMcpToken,
  type IssuedToken, type Writer,
} from './mcp-oauth';

/**
 * Shared fixture for the 14-01 proposal DB suites (disposable Supabase only, 0037 -> 0038 ->
 * 0039 -> 0041 applied). Fixtures are inserted over a superuser Postgres connection so RLS
 * does not shape them; proposals are only ever created through the bearer RPCs over REST.
 * Never prints tokens, URLs or response bodies.
 */
export const proposalEnvReady = Boolean(process.env.MCP_DISPOSABLE_PROJECT_REF?.trim()
  && process.env.SUPABASE_DB_URL && process.env.NEXT_PUBLIC_SUPABASE_URL
  && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);

export const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

export type RestResult = { status: number; json: unknown; message: string | null };

export type ProposalFixture = {
  sql: ReturnType<typeof postgres>;
  query: (text: string, params?: unknown[]) => Promise<postgres.RowList<postgres.Row[]>>;
  writerA: Writer; writerB: Writer;
  aTok: IssuedToken; aTok2: IssuedToken; bTok: IssuedToken;
  aBrowser: string; bBrowser: string;
  clientIds: string[];
  rest: (method: string, path: string, bearer: string, body?: unknown) => Promise<RestResult>;
  rpc: (fn: string, bearer: string, body: Record<string, unknown>) => Promise<RestResult>;
  /** Runs `fn` as PostgREST would for `claims` (role authenticated), then rolls back. `before` runs as superuser first. */
  asClaims: <T>(claims: Record<string, unknown>, fn: () => Promise<T>, before?: () => Promise<void>) => Promise<T>;
  /** SQL statement outcome inside a transaction, isolated by a savepoint. */
  outcome: (text: string, params?: unknown[]) => Promise<{ code: string; message: string; rows: unknown[] }>;
  cleanup: () => Promise<void>;
};

export async function setupProposalFixture(label: string): Promise<ProposalFixture> {
  assertDisposableRef();
  const dbUrl = process.env.SUPABASE_DB_URL!;
  const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  process.env.MCP_PUBLIC_ORIGIN ??= 'http://localhost:3000';
  const sql = postgres(dbUrl, { max: 1, prepare: false });
  const query = (text: string, params: unknown[] = []) =>
    sql.unsafe(text, params as postgres.ParameterOrJSON<never>[]);

  const writerA = await createWriter();
  const writerB = await createWriter();
  const clientIds: string[] = [];
  const aTok = await issueMcpToken(writerA, { clientName: `mcp-test-${label}-A` });
  clientIds.push(aTok.clientId);
  const aTok2 = await issueMcpToken(writerA, { clientName: `mcp-test-${label}-A2` });
  clientIds.push(aTok2.clientId);
  const bTok = await issueMcpToken(writerB, { clientName: `mcp-test-${label}-B` });
  clientIds.push(bTok.clientId);
  const browserToken = async (writer: Writer) => {
    const session = (await writer.browser.auth.getSession()).data.session;
    if (!session) throw new Error('Expected a live browser session');
    return session.access_token;
  };
  const aBrowser = await browserToken(writerA);
  const bBrowser = await browserToken(writerB);
  if (decodeClaims(aBrowser).client_id || !aTok.claims.client_id) throw new Error('token kinds mismatch');

  async function rest(method: string, path: string, bearer: string, body?: unknown): Promise<RestResult> {
    const response = await fetch(`${apiUrl}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: anonKey, Authorization: `Bearer ${bearer}`,
        'Content-Type': 'application/json', Prefer: 'return=representation',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed: unknown = null;
    try { parsed = text ? JSON.parse(text) as unknown : null; } catch { parsed = null; }
    if (response.ok) return { status: response.status, json: parsed, message: null };
    const message = (parsed as { message?: string } | null)?.message ?? null;
    return { status: response.status, json: null, message };
  }
  const rpc = (fn: string, bearer: string, body: Record<string, unknown>) => rest('POST', `rpc/${fn}`, bearer, body);

  async function asClaims<T>(claims: Record<string, unknown>, fn: () => Promise<T>, before?: () => Promise<void>): Promise<T> {
    await query('begin');
    try {
      if (before) await before();
      await query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
      await query("select set_config('request.jwt.claim.sub', $1, true)", [String(claims.sub)]);
      await query('set local role authenticated');
      return await fn();
    } finally {
      await query('rollback');
    }
  }
  async function outcome(text: string, params: unknown[] = []) {
    await query('savepoint probe');
    try {
      const rows = await query(text, params);
      await query('release savepoint probe');
      return { code: 'ok', message: '', rows: [...rows] as unknown[] };
    } catch (error) {
      await query('rollback to savepoint probe');
      const { code, message } = error as { code?: string; message?: string };
      return { code: code ?? 'unknown', message: message ?? '', rows: [] };
    }
  }

  async function cleanup() {
    try {
      const owners = [writerA.id, writerB.id];
      const works = await query('select id from public.works where owner_id = any($1::uuid[])', [owners]);
      const workIds = works.map((row) => row.id as string);
      await query('begin');
      // Locked fixture nodes cannot be hard-deleted through the guard triggers.
      await query('set local session_replication_role = replica');
      await query('delete from public.mcp_proposals where owner_id = any($1::uuid[])', [owners]);
      await query('delete from public.work_ai_instructions where work_id = any($1::uuid[])', [workIds]);
      await query('delete from public.chapters where work_id = any($1::uuid[])', [workIds]);
      await query('delete from public.kb_nodes where owner_id = any($1::uuid[])', [owners]);
      await query('delete from public.works where id = any($1::uuid[])', [workIds]);
      await query('commit');
      await sql.end();
    } finally {
      await cleanupMcpOAuth(clientIds, [writerA, writerB]);
    }
  }

  return {
    sql, query, writerA, writerB, aTok, aTok2, bTok, aBrowser, bBrowser, clientIds,
    rest, rpc, asClaims, outcome, cleanup,
  };
}

/** Inserts a work (no structural folders) and returns its id. */
export async function insertWork(fx: ProposalFixture, ownerId: string, title: string, deleted = false) {
  const id = randomUUID();
  await fx.query('insert into public.works (id, owner_id, title, deleted_at) values ($1, $2, $3, $4)',
    [id, ownerId, title, deleted ? new Date().toISOString() : null]);
  return id;
}

export async function insertChapter(
  fx: ProposalFixture, workId: string, content: string,
  options: { orderIndex?: number; published?: boolean; deleted?: boolean } = {},
) {
  const id = randomUUID();
  const published = options.published ?? false;
  await fx.query(`insert into public.chapters (id, work_id, title, content, order_index, is_published, published_at, deleted_at)
    values ($1, $2, $3, $4, $5, $6, $7, $8)`,
  [id, workId, `ch ${options.orderIndex ?? 1}`, content, options.orderIndex ?? 1, published,
    published ? new Date().toISOString() : null, options.deleted ? new Date().toISOString() : null]);
  return id;
}

export async function insertKbNode(
  fx: ProposalFixture,
  row: {
    ownerId: string; workId: string | null; scope?: 'work' | 'account_template'; parentId?: string | null;
    nodeType?: 'file' | 'folder'; category: string; name: string; content?: string | null;
    locked?: boolean; deleted?: boolean;
  },
) {
  const id = randomUUID();
  await fx.query(`insert into public.kb_nodes
      (id, owner_id, work_id, scope, parent_id, node_type, category, is_locked, name, content, deleted_at)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
  [id, row.ownerId, row.workId, row.scope ?? 'work', row.parentId ?? null, row.nodeType ?? 'file', row.category,
    row.locked ?? false, row.name, row.content ?? null, row.deleted ? new Date().toISOString() : null]);
  return id;
}
