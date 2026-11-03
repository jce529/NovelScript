import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, createTestUser, deleteTestUser, signedInClient } from './db';

/**
 * Real Supabase OAuth 2.1 flow for the 12-06 disposable-project gate:
 * DCR -> /authorize (PKCE S256) -> consent as the signed-in writer (mcp_connect +
 * approveAuthorization, the same order as the consent Server Action) -> /token.
 * Then the issued access token is sent to the real /mcp route handler.
 *
 * Never print tokens, codes or verifiers. Thrown errors carry HTTP status only.
 * Only the disposable project may be used; see assertDisposableSupabase().
 */

/** Prefix of the shared (non-disposable) project ref. A match always fails the suite. */
const SHARED_PROJECT_REF_PREFIX = 'ymudwg';
const REDIRECT_URI = 'https://claude.ai/api/mcp/auth_callback';
const REDIRECT_HOST = 'claude.ai';

export type Claims = { sub: string; client_id?: string; session_id?: string; exp: number; iss?: string };

export type Writer = { id: string; email: string; browser: SupabaseClient };
export type IssuedToken = { accessToken: string; clientId: string; clientName: string; claims: Claims };

export function decodeClaims(token: string): Claims {
  return JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as Claims;
}

/** Same guard the DB suites inline: env ref must match API and DB URL and must not be the shared project. */
export function assertDisposableSupabase(): { ref: string; apiUrl: string; anonKey: string } {
  const ref = process.env.MCP_DISPOSABLE_PROJECT_REF?.trim();
  const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!ref || !apiUrl || !anonKey || !dbUrl) throw new Error('MCP disposable project env is incomplete');
  const apiRef = new URL(apiUrl).hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1];
  const pg = new URL(dbUrl);
  if (ref !== apiRef || !`${pg.hostname} ${decodeURIComponent(pg.username)}`.includes(ref)) {
    throw new Error('MCP disposable ref must match both Supabase API and DB URLs');
  }
  if (ref.startsWith(SHARED_PROJECT_REF_PREFIX)) throw new Error('Refusing to run MCP OAuth tests on the shared project');
  return { ref, apiUrl: new URL(apiUrl).origin, anonKey };
}

type AsMetadata = { authorization_endpoint: string; token_endpoint: string; registration_endpoint: string };
let metadataCache: AsMetadata | null = null;

async function authServerMetadata(): Promise<AsMetadata> {
  if (metadataCache) return metadataCache;
  const { apiUrl } = assertDisposableSupabase();
  for (const url of [
    `${apiUrl}/.well-known/oauth-authorization-server/auth/v1`,
    `${apiUrl}/auth/v1/.well-known/oauth-authorization-server`,
  ]) {
    const response = await fetch(url);
    if (!response.ok) continue;
    const body = (await response.json()) as Partial<AsMetadata>;
    if (body.authorization_endpoint && body.token_endpoint && body.registration_endpoint) {
      metadataCache = body as AsMetadata;
      return metadataCache;
    }
  }
  throw new Error('Supabase OAuth server metadata not found (is the OAuth server enabled with DCR?)');
}

/** Dynamic Client Registration, like Claude does on every (re)connect (12-01 S4/S10). */
export async function registerClient(clientName: string): Promise<string> {
  const { anonKey } = assertDisposableSupabase();
  const { registration_endpoint } = await authServerMetadata();
  const response = await fetch(registration_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: anonKey },
    body: JSON.stringify({
      client_name: clientName,
      redirect_uris: [REDIRECT_URI],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    }),
  });
  if (!response.ok) throw new Error(`DCR failed with HTTP ${response.status}`);
  const body = (await response.json()) as { client_id?: string };
  if (!body.client_id) throw new Error('DCR response has no client_id');
  return body.client_id;
}

/** Disposable writer with a real browser session (auth.sessions row, client_id null). */
export async function createWriter(): Promise<Writer> {
  assertDisposableSupabase();
  const user = await createTestUser();
  const suffix = user.id.replace(/-/g, '').slice(0, 10);
  const { error } = await adminClient().from('profiles')
    .update({ role: 'writer', pen_name: `mcp${suffix}`, deleted_at: null }).eq('id', user.id);
  if (error) throw new Error(`writer profile update failed (${error.code ?? 'unknown'})`);
  const browser = await signedInClient(user);
  return { id: user.id, email: user.email!, browser };
}

function pkcePair() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

/**
 * Full code + PKCE + token exchange for `writer`.
 * - `clientId`: reuse an already registered client instead of registering a new one.
 * - `connect: false`: approve at Supabase but skip our mcp_connect grant row.
 */
export async function issueMcpToken(
  writer: Writer,
  options: { clientName?: string; clientId?: string; connect?: boolean } = {},
): Promise<IssuedToken> {
  const { anonKey } = assertDisposableSupabase();
  const meta = await authServerMetadata();
  const clientName = options.clientName ?? `mcp-test-${randomBytes(4).toString('hex')}`;
  const clientId = options.clientId ?? await registerClient(clientName);
  const { verifier, challenge } = pkcePair();
  const state = randomBytes(16).toString('base64url');
  const resource = `${process.env.MCP_PUBLIC_ORIGIN ?? 'http://localhost:3000'}/mcp`;

  const authorize = new URL(meta.authorization_endpoint);
  for (const [key, value] of Object.entries({
    response_type: 'code', client_id: clientId, redirect_uri: REDIRECT_URI, scope: 'openid email',
    code_challenge: challenge, code_challenge_method: 'S256', state, resource,
  })) authorize.searchParams.set(key, value);
  const redirect = await fetch(authorize, { redirect: 'manual', headers: { apikey: anonKey } });
  const consentLocation = redirect.headers.get('location');
  if (redirect.status < 300 || redirect.status >= 400 || !consentLocation) {
    throw new Error(`authorize did not redirect to consent (HTTP ${redirect.status})`);
  }
  const authorizationId = new URL(consentLocation, meta.authorization_endpoint).searchParams.get('authorization_id');
  if (!authorizationId) throw new Error('consent redirect has no authorization_id');

  const details = await writer.browser.auth.oauth.getAuthorizationDetails(authorizationId);
  if (details.error || !details.data || !('authorization_id' in details.data)) {
    throw new Error('authorization details unavailable or already consented');
  }
  if (details.data.client.id !== clientId) throw new Error('authorization client mismatch');
  if (options.connect !== false) {
    const { error } = await writer.browser.rpc('mcp_connect', {
      p_client_id: clientId, p_client_name: clientName, p_redirect_host: REDIRECT_HOST,
      p_scopes: ['read', 'propose_draft'],
    });
    if (error) throw new Error(`mcp_connect failed (${error.code ?? 'unknown'})`);
  }
  const approved = await writer.browser.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true });
  if (approved.error || !approved.data?.redirect_url) throw new Error('approveAuthorization failed');
  const callback = new URL(approved.data.redirect_url);
  if (callback.searchParams.get('state') !== state) throw new Error('state mismatch on callback');
  const code = callback.searchParams.get('code');
  if (!code) throw new Error('callback has no authorization code');

  const tokenResponse = await fetch(meta.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', apikey: anonKey },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI,
      client_id: clientId, code_verifier: verifier, resource,
    }),
  });
  if (!tokenResponse.ok) throw new Error(`token exchange failed with HTTP ${tokenResponse.status}`);
  const tokens = (await tokenResponse.json()) as { access_token?: string };
  if (!tokens.access_token) throw new Error('token response has no access_token');
  const claims = decodeClaims(tokens.access_token);
  if (claims.sub !== writer.id || claims.client_id !== clientId || !claims.session_id) {
    throw new Error('issued token does not carry the expected OAuth identity');
  }
  return { accessToken: tokens.access_token, clientId, clientName, claims };
}

export type McpCallResult = { status: number; userId: string | null; isError: boolean; challenge: string | null };

/**
 * Result of any tools/call through the real route. `raw` is the whole HTTP response body and
 * `text` the first content item; callers assert on them but must never print them.
 * `jsonRpcError` is set when the call failed at the protocol level (e.g. unknown tool).
 */
export type McpToolCallResult = {
  status: number; isError: boolean; challenge: string | null;
  raw: string; text: string | null; data: unknown; jsonRpcError: boolean;
};

/** Calls the real /mcp route handler (verifyMcpToken + live RPC) with tools/call `name`. */
export async function callTool(
  accessToken: string, name: string, args: Record<string, unknown> = {},
): Promise<McpToolCallResult> {
  const { POST } = await import('@/app/mcp/route');
  const origin = process.env.MCP_PUBLIC_ORIGIN ?? 'http://localhost:3000';
  const response = await POST(new Request(`${origin}/mcp`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  }));
  const challenge = response.headers.get('www-authenticate');
  const raw = await response.text();
  if (response.status !== 200) {
    return { status: response.status, isError: true, challenge, raw, text: null, data: null, jsonRpcError: false };
  }
  const payload = (response.headers.get('content-type') ?? '').includes('text/event-stream')
    ? raw.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).at(-1) ?? '{}'
    : raw;
  const body = JSON.parse(payload) as { result?: { isError?: boolean; content?: Array<{ text?: string }> }; error?: unknown };
  const isError = body.result?.isError === true || !body.result;
  const text = body.result?.content?.[0]?.text ?? null;
  let data: unknown = null;
  if (!isError && text !== null) data = JSON.parse(text);
  return { status: response.status, isError, challenge, raw, text, data, jsonRpcError: body.error !== undefined };
}

/** Calls the real /mcp route handler (verifyMcpToken + live RPC) with tools/call whoami. */
export async function callWhoami(accessToken: string, args: Record<string, unknown> = {}): Promise<McpCallResult> {
  const result = await callTool(accessToken, 'whoami', args);
  const userId = result.isError ? null : (result.data as { userId?: string } | null)?.userId ?? null;
  return { status: result.status, userId, isError: result.isError, challenge: result.challenge };
}

/** REST read with an arbitrary bearer. Returns status and row count only (bodies may hold account data). */
export async function restRows(table: string, query: string, bearer: string): Promise<{ status: number; rows: unknown[] | null }> {
  const { apiUrl, anonKey } = assertDisposableSupabase();
  const response = await fetch(`${apiUrl}/rest/v1/${table}?${query}`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${bearer}` },
  });
  return { status: response.status, rows: response.status === 200 ? (await response.json()) as unknown[] : null };
}

export function secondsLeft(claims: Claims): number {
  return claims.exp - Math.floor(Date.now() / 1000);
}

/** Best-effort cleanup of DCR clients and writers created by a suite. */
export async function cleanupMcpOAuth(clientIds: string[], writers: Writer[]) {
  const admin = adminClient();
  for (const clientId of clientIds) {
    try { await admin.auth.admin.oauth.deleteClient(clientId); } catch { /* best effort */ }
  }
  for (const writer of writers) {
    try { await writer.browser.auth.signOut(); } catch { /* best effort */ }
    await deleteTestUser(writer.id);
  }
}
