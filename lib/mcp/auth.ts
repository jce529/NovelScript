import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { AuthInfo } from '@modelcontextprotocol/server';

/**
 * MCP bearer verification (D-09, D-10, D-19).
 *
 * Every /mcp request: (1) verify the Supabase OAuth access token's signature and
 * expiry with a client that carries the caller's own bearer, (2) require OAuth
 * identity claims (client_id + session_id), then (3) call `mcp_authorize_call()`
 * with the same bearer so Postgres re-checks the live grant, the Auth session,
 * the Supabase consent and the profile. Anything else, including any error,
 * is a rejection (fail closed). The service-role client is never used here.
 *
 * Grant scopes (`read`/`propose_draft`) are kept on AuthInfo for per-tool checks
 * in later phases. They are NOT enforced through withMcpAuth's scope option: Supabase
 * only issues OIDC scopes, so a scope challenge would break authorization.
 */

export const MCP_GRANT_SCOPES = ['read', 'propose_draft'] as const;
export type McpGrantScope = (typeof MCP_GRANT_SCOPES)[number];

export type McpAuthExtra = { userId: string; sessionId: string; grantScopes: McpGrantScope[] };

export type McpRejectReason =
  | 'config_missing'
  | 'bearer_missing'
  | 'claims_invalid'
  | 'web_session_token'
  | 'rpc_error'
  | 'grant_missing'
  | 'grant_mismatch'
  | 'exception';

/** Narrow seam over the user-scoped Supabase client so the boundary is unit-testable. */
export interface McpUserClient {
  getClaims(): Promise<{ claims: Record<string, unknown> | null; error: unknown }>;
  authorizeCall(): Promise<{ data: unknown; error: unknown }>;
}

const MAX_BEARER_LENGTH = 8192;
const SUPABASE_CALL_TIMEOUT_MS = 5000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);

function timedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const timeout = AbortSignal.timeout(SUPABASE_CALL_TIMEOUT_MS);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(input, { ...init, signal });
}

/** Default factory: anon key + the caller's bearer. RLS and auth.jwt() see the caller. */
function createSupabaseUserClient(supabaseUrl: string, anonKey: string, bearer: string): McpUserClient {
  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${bearer}` }, fetch: timedFetch },
  });
  return {
    async getClaims() {
      const { data, error } = await client.auth.getClaims(bearer);
      return { claims: (data?.claims as Record<string, unknown> | undefined) ?? null, error };
    },
    async authorizeCall() {
      const { data, error } = await client.rpc('mcp_authorize_call');
      return { data, error };
    },
  };
}

function normalizeSupabaseUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Authorization server issuer advertised in PRM and expected in the token `iss`. */
export function getMcpAuthServerIssuer(supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL): string | null {
  const origin = normalizeSupabaseUrl(supabaseUrl);
  return origin ? `${origin}/auth/v1` : null;
}

/**
 * Public origin of this app as typed by the user in Claude (without `/mcp`).
 * Must be configured explicitly: request headers (x-forwarded-*) are not trusted
 * because Next adds them even to local requests (12-01 design input 2).
 */
export function getMcpPublicOrigin(value = process.env.MCP_PUBLIC_ORIGIN): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) return null;
    if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function parseGrantRow(data: unknown, userId: string): McpGrantScope[] | null {
  if (!Array.isArray(data) || data.length !== 1) return null;
  const row = data[0] as { out_user_id?: unknown; out_scopes?: unknown } | null;
  if (!row || row.out_user_id !== userId || !Array.isArray(row.out_scopes) || row.out_scopes.length === 0) return null;
  const scopes = row.out_scopes;
  if (!scopes.every((scope): scope is McpGrantScope => (MCP_GRANT_SCOPES as readonly unknown[]).includes(scope))) {
    return null;
  }
  return [...new Set(scopes)];
}

export type McpTokenVerifierOptions = {
  supabaseUrl: string | undefined;
  anonKey: string | undefined;
  createUserClient?: (bearer: string) => McpUserClient;
  /** Seconds since epoch. */
  now?: () => number;
  /** Receives a reason code only; never the token or claim values. */
  onReject?: (reason: McpRejectReason) => void;
};

export function createMcpTokenVerifier(options: McpTokenVerifierOptions) {
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));
  const onReject = options.onReject ?? (() => {});

  return async function verifyMcpToken(_req: Request, bearer?: string): Promise<AuthInfo | undefined> {
    const reject = (reason: McpRejectReason): undefined => {
      try { onReject(reason); } catch { /* reporting must not change the verdict */ }
      return undefined;
    };
    try {
      const supabaseOrigin = normalizeSupabaseUrl(options.supabaseUrl);
      const issuer = getMcpAuthServerIssuer(options.supabaseUrl);
      if (!supabaseOrigin || !issuer || !options.anonKey) return reject('config_missing');
      if (!bearer || bearer.length > MAX_BEARER_LENGTH) return reject('bearer_missing');

      const client = options.createUserClient
        ? options.createUserClient(bearer)
        : createSupabaseUserClient(supabaseOrigin, options.anonKey, bearer);

      const { claims, error } = await client.getClaims();
      if (error || !claims) return reject('claims_invalid');
      if (claims.client_id === undefined || claims.client_id === null) return reject('web_session_token');
      const { sub, client_id: clientId, session_id: sessionId, exp, iss, role } = claims;
      if (!isUuid(sub) || !isUuid(clientId) || !isUuid(sessionId)) return reject('claims_invalid');
      if (iss !== issuer || role !== 'authenticated') return reject('claims_invalid');
      if (typeof exp !== 'number' || !Number.isFinite(exp) || exp <= now()) return reject('claims_invalid');

      // Live grant check on every call, with the same bearer (D-09).
      const { data, error: rpcError } = await client.authorizeCall();
      if (rpcError) return reject('rpc_error');
      if (!Array.isArray(data) || data.length === 0) return reject('grant_missing');
      const grantScopes = parseGrantRow(data, sub);
      if (!grantScopes) return reject('grant_mismatch');

      const extra: McpAuthExtra = { userId: sub, sessionId, grantScopes };
      return { token: bearer, clientId, scopes: [...grantScopes], expiresAt: exp, extra };
    } catch {
      return reject('exception');
    }
  };
}

/** Typed read of the verified identity inside a tool handler. Null means "not authenticated". */
export function readMcpAuthExtra(authInfo: AuthInfo | undefined): McpAuthExtra | null {
  const extra = authInfo?.extra as Partial<McpAuthExtra> | undefined;
  if (!extra || !isUuid(extra.userId) || !isUuid(extra.sessionId) || !Array.isArray(extra.grantScopes)) return null;
  return { userId: extra.userId, sessionId: extra.sessionId, grantScopes: [...extra.grantScopes] };
}

function logInfrastructureReject(reason: McpRejectReason) {
  // Only infrastructure failures are logged, and only as a reason code.
  if (reason === 'rpc_error' || reason === 'exception' || reason === 'config_missing') {
    console.warn(`[mcp-auth] request rejected: ${reason}`);
  }
}

/** Production verifier. Reads env per call so a missing value fails closed instead of crashing at import. */
export function verifyMcpToken(req: Request, bearer?: string): Promise<AuthInfo | undefined> {
  return createMcpTokenVerifier({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    onReject: logInfrastructureReject,
  })(req, bearer);
}
