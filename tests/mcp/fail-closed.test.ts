import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMcpTokenVerifier,
  getMcpPublicOrigin,
  readMcpAuthExtra,
  type McpUserClient,
} from '@/lib/mcp/auth';

// Unit-only: no network. The user-scoped Supabase client is replaced by a fake so
// every rejection path (D-09/D-10) can be forced deterministically.
const SUPABASE_URL = 'https://unit-ref.supabase.test';
const ISSUER = `${SUPABASE_URL}/auth/v1`;
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER_USER = '22222222-2222-4222-8222-222222222222';
const CLIENT = '33333333-3333-4333-8333-333333333333';
const SESSION = '44444444-4444-4444-8444-444444444444';
const BEARER = 'header.payload.signature';
const NOW = 1_800_000_000;

function claims(overrides: Record<string, unknown> = {}) {
  return {
    iss: ISSUER, sub: USER, aud: 'authenticated', role: 'authenticated',
    client_id: CLIENT, session_id: SESSION, exp: NOW + 3600, iat: NOW - 10,
    ...overrides,
  };
}

type Fake = {
  getClaims?: McpUserClient['getClaims'];
  authorizeCall?: McpUserClient['authorizeCall'];
};

function setup(fake: Fake = {}) {
  const getClaims = vi.fn(fake.getClaims ?? (async () => ({ claims: claims(), error: null })));
  const authorizeCall = vi.fn(fake.authorizeCall ?? (async () => ({
    data: [{ out_user_id: USER, out_scopes: ['read', 'propose_draft'] }], error: null,
  })));
  const createUserClient = vi.fn((bearer: string): McpUserClient => {
    void bearer;
    return { getClaims, authorizeCall };
  });
  const rejected: string[] = [];
  const verify = createMcpTokenVerifier({
    supabaseUrl: SUPABASE_URL,
    anonKey: 'anon-unit',
    createUserClient,
    now: () => NOW,
    onReject: (reason) => rejected.push(reason),
  });
  return { verify, getClaims, authorizeCall, createUserClient, rejected };
}

const request = new Request('https://app.example.test/mcp', { method: 'POST' });

describe('verifyMcpToken fail-closed boundary', () => {
  it('accepts a live OAuth token and returns the grant owner, client and grant scopes', async () => {
    const { verify, createUserClient, authorizeCall, rejected } = setup();
    const info = await verify(request, BEARER);
    expect(info).toMatchObject({
      token: BEARER, clientId: CLIENT, scopes: ['read', 'propose_draft'], expiresAt: NOW + 3600,
    });
    expect(readMcpAuthExtra(info)).toEqual({ userId: USER, sessionId: SESSION, grantScopes: ['read', 'propose_draft'] });
    // The RPC runs with the caller's own bearer (no service role) and takes no arguments.
    expect(createUserClient).toHaveBeenCalledWith(BEARER);
    expect(authorizeCall).toHaveBeenCalledTimes(1);
    expect(authorizeCall.mock.calls[0]).toEqual([]);
    expect(rejected).toEqual([]);
  });

  it('rejects a missing or oversized bearer without creating a client', async () => {
    const { verify, createUserClient } = setup();
    expect(await verify(request, undefined)).toBeUndefined();
    expect(await verify(request, '')).toBeUndefined();
    expect(await verify(request, 'x'.repeat(9000))).toBeUndefined();
    expect(createUserClient).not.toHaveBeenCalled();
  });

  it('rejects signature/expiry failures reported by getClaims and never calls the RPC', async () => {
    const { verify, authorizeCall, rejected } = setup({
      getClaims: async () => ({ claims: null, error: new Error('Invalid JWT signature') }),
    });
    expect(await verify(request, BEARER)).toBeUndefined();
    expect(authorizeCall).not.toHaveBeenCalled();
    expect(rejected).toEqual(['claims_invalid']);
  });

  it('rejects a browser session token (no client_id) before the RPC', async () => {
    const { verify, authorizeCall, rejected } = setup({
      getClaims: async () => ({ claims: claims({ client_id: undefined }), error: null }),
    });
    expect(await verify(request, BEARER)).toBeUndefined();
    expect(authorizeCall).not.toHaveBeenCalled();
    expect(rejected).toEqual(['web_session_token']);
  });

  it.each([
    ['missing session_id', { session_id: undefined }],
    ['non-uuid session_id', { session_id: 'session' }],
    ['non-uuid client_id', { client_id: 'claude' }],
    ['missing sub', { sub: undefined }],
    ['foreign issuer', { iss: 'https://evil.example/auth/v1' }],
    ['expired exp', { exp: NOW }],
    ['missing exp', { exp: undefined }],
    ['anon role', { role: 'anon' }],
  ])('rejects %s', async (_label, overrides) => {
    const { verify, authorizeCall } = setup({
      getClaims: async () => ({ claims: claims(overrides), error: null }),
    });
    expect(await verify(request, BEARER)).toBeUndefined();
    expect(authorizeCall).not.toHaveBeenCalled();
  });

  it('rejects when the live grant RPC returns zero rows (revoked, other client, dead session)', async () => {
    const { verify, rejected } = setup({ authorizeCall: async () => ({ data: [], error: null }) });
    expect(await verify(request, BEARER)).toBeUndefined();
    expect(rejected).toEqual(['grant_missing']);
  });

  it('rejects null RPC data', async () => {
    const { verify } = setup({ authorizeCall: async () => ({ data: null, error: null }) });
    expect(await verify(request, BEARER)).toBeUndefined();
  });

  it('rejects an RPC error (DB outage, missing function, permission)', async () => {
    const { verify, rejected } = setup({
      authorizeCall: async () => ({ data: null, error: { code: 'PGRST202', message: 'not found' } }),
    });
    expect(await verify(request, BEARER)).toBeUndefined();
    expect(rejected).toEqual(['rpc_error']);
  });

  it('rejects when the RPC or the claims check throws (network failure, timeout)', async () => {
    const rpcThrows = setup({ authorizeCall: async () => { throw new TypeError('fetch failed'); } });
    expect(await rpcThrows.verify(request, BEARER)).toBeUndefined();
    expect(rpcThrows.rejected).toEqual(['exception']);

    const claimsThrows = setup({ getClaims: async () => { throw new Error('jwks unreachable'); } });
    expect(await claimsThrows.verify(request, BEARER)).toBeUndefined();

    const factoryThrows = createMcpTokenVerifier({
      supabaseUrl: SUPABASE_URL, anonKey: 'anon-unit', now: () => NOW,
      createUserClient: () => { throw new Error('bad config'); },
    });
    expect(await factoryThrows(request, BEARER)).toBeUndefined();
  });

  it('rejects an RPC row for another user, more than one row, or malformed scopes', async () => {
    for (const data of [
      [{ out_user_id: OTHER_USER, out_scopes: ['read', 'propose_draft'] }],
      [{ out_user_id: USER, out_scopes: ['read'] }, { out_user_id: USER, out_scopes: ['read'] }],
      [{ out_user_id: USER, out_scopes: ['admin'] }],
      [{ out_user_id: USER, out_scopes: [] }],
      [{ out_user_id: USER, out_scopes: 'read' }],
      [{ user_id: USER, scopes: ['read'] }],
    ]) {
      const { verify } = setup({ authorizeCall: async () => ({ data, error: null }) });
      expect(await verify(request, BEARER), JSON.stringify(data)).toBeUndefined();
    }
  });

  it('never writes the bearer token into rejection reasons', async () => {
    const { verify, rejected } = setup({
      authorizeCall: async () => { throw new Error(`boom ${BEARER}`); },
    });
    await verify(request, BEARER);
    expect(rejected.join(' ')).not.toContain(BEARER);
  });
});

describe('verifyMcpToken configuration', () => {
  beforeEach(() => vi.unstubAllEnvs());
  afterEach(() => vi.unstubAllEnvs());

  it('fails closed without Supabase URL or anon key', async () => {
    const createUserClient = vi.fn();
    for (const config of [
      { supabaseUrl: undefined, anonKey: 'anon' },
      { supabaseUrl: SUPABASE_URL, anonKey: undefined },
      { supabaseUrl: 'not a url', anonKey: 'anon' },
    ]) {
      const verify = createMcpTokenVerifier({ ...config, createUserClient, now: () => NOW });
      expect(await verify(request, BEARER)).toBeUndefined();
    }
    expect(createUserClient).not.toHaveBeenCalled();
  });

  it('accepts only an https (or loopback http) bare origin for MCP_PUBLIC_ORIGIN', () => {
    vi.stubEnv('MCP_PUBLIC_ORIGIN', 'https://app.example.test/');
    expect(getMcpPublicOrigin()).toBe('https://app.example.test');
    vi.stubEnv('MCP_PUBLIC_ORIGIN', 'http://localhost:3000');
    expect(getMcpPublicOrigin()).toBe('http://localhost:3000');
    for (const bad of ['', 'http://app.example.test', 'https://app.example.test/mcp', 'https://a.test?x=1', 'nope']) {
      vi.stubEnv('MCP_PUBLIC_ORIGIN', bad);
      expect(getMcpPublicOrigin(), bad).toBeNull();
    }
  });
});
