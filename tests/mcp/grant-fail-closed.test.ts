import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 13-01 (D-09/D-10): the grant lookup itself is made to fail by mocking the Supabase
 * client that the PRODUCTION verifier builds (default factory, not an injected seam),
 * and every failure mode must end in "not authenticated". Unit only: no network, no DB.
 * fail-closed.test.ts covers the injected-seam paths; this file covers the real factory
 * wiring (rpc name, caller bearer) plus fault injection on the grant RPC.
 */
const supabase = vi.hoisted(() => ({
  rpc: vi.fn(),
  getClaims: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: supabase.createClient,
}));

import { verifyMcpToken } from '@/lib/mcp/auth';

const SUPABASE_URL = 'https://unit-ref.supabase.test';
const USER = '11111111-1111-4111-8111-111111111111';
const CLIENT = '33333333-3333-4333-8333-333333333333';
const SESSION = '44444444-4444-4444-8444-444444444444';
const BEARER = 'header.payload.signature';
const request = new Request('https://app.example.test/mcp', { method: 'POST' });

function liveClaims() {
  return {
    iss: `${SUPABASE_URL}/auth/v1`, sub: USER, aud: 'authenticated', role: 'authenticated',
    client_id: CLIENT, session_id: SESSION, exp: Math.floor(Date.now() / 1000) + 3600,
  };
}

describe('grant lookup failure fails closed (production verifier)', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-unit');
    supabase.getClaims.mockResolvedValue({ data: { claims: liveClaims() }, error: null });
    supabase.createClient.mockImplementation(() => ({
      auth: { getClaims: supabase.getClaims },
      rpc: supabase.rpc,
    }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('control: a live grant row authenticates, using the caller bearer and mcp_authorize_call', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ out_user_id: USER, out_scopes: ['read', 'propose_draft'] }], error: null });
    const info = await verifyMcpToken(request, BEARER);
    expect(info).toMatchObject({ clientId: CLIENT, extra: { userId: USER } });
    expect(supabase.rpc).toHaveBeenCalledWith('mcp_authorize_call');
    const [url, key, options] = supabase.createClient.mock.calls[0];
    expect(url).toBe(SUPABASE_URL);
    expect(key).toBe('anon-unit');
    expect(options.global.headers.Authorization).toBe(`Bearer ${BEARER}`);
  });

  it.each([
    ['PostgREST error (DB outage)', () => supabase.rpc.mockResolvedValue({ data: null, error: { code: '08006', message: 'connection failure' } })],
    ['permission denied on the RPC', () => supabase.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' } })],
    ['function missing', () => supabase.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'not found' } })],
    ['network rejection', () => supabase.rpc.mockRejectedValue(new TypeError('fetch failed'))],
    ['timeout abort', () => supabase.rpc.mockRejectedValue(new DOMException('aborted', 'TimeoutError'))],
    ['synchronous throw', () => supabase.rpc.mockImplementation(() => { throw new Error('boom'); })],
    ['error together with a row', () => supabase.rpc.mockResolvedValue({
      data: [{ out_user_id: USER, out_scopes: ['read', 'propose_draft'] }], error: { code: '57014', message: 'canceled' },
    })],
    ['undefined result', () => supabase.rpc.mockResolvedValue(undefined)],
  ])('denies when the grant lookup fails: %s', async (_label, inject) => {
    inject();
    expect(await verifyMcpToken(request, BEARER)).toBeUndefined();
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });

  it('denies when the client cannot even be created', async () => {
    supabase.createClient.mockImplementation(() => { throw new Error('bad config'); });
    expect(await verifyMcpToken(request, BEARER)).toBeUndefined();
  });

  it('does not cache an allow: a failure after a success still denies the same bearer', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: [{ out_user_id: USER, out_scopes: ['read', 'propose_draft'] }], error: null });
    expect(await verifyMcpToken(request, BEARER)).toBeDefined();
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { code: '08006', message: 'down' } });
    expect(await verifyMcpToken(request, BEARER)).toBeUndefined();
    expect(supabase.rpc).toHaveBeenCalledTimes(2);
  });

  it('logs only a reason code on infrastructure failure, never the bearer', async () => {
    supabase.rpc.mockRejectedValue(new Error(`boom ${BEARER}`));
    expect(await verifyMcpToken(request, BEARER)).toBeUndefined();
    const logged = (console.warn as unknown as ReturnType<typeof vi.fn>).mock.calls.flat().join(' ');
    expect(logged).toContain('exception');
    expect(logged).not.toContain(BEARER);
  });
});
