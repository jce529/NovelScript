import { describe, it, expect, vi, beforeEach } from 'vitest';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';

const getClaimsMock = vi.fn().mockResolvedValue({ data: { claims: null }, error: null });

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({ auth: { getClaims: getClaimsMock } })),
}));

import { proxy, config } from '../../proxy';

describe('proxy.ts session refresh (AUTH-03)', () => {
  beforeEach(() => {
    getClaimsMock.mockClear();
  });

  it('matcher excludes static assets and favicon', () => {
    expect(unstable_doesMiddlewareMatch({ config, url: '/_next/static/chunk.js' })).toBe(false);
    expect(unstable_doesMiddlewareMatch({ config, url: '/favicon.ico' })).toBe(false);
  });

  it('matcher matches ordinary app routes', () => {
    expect(unstable_doesMiddlewareMatch({ config, url: '/account' })).toBe(true);
    expect(unstable_doesMiddlewareMatch({ config, url: '/login' })).toBe(true);
  });

  it('calls supabase.auth.getClaims() exactly once per request to refresh the session', async () => {
    const request = {
      cookies: { getAll: () => [], set: vi.fn() },
      nextUrl: new URL('http://localhost:3000/account'),
    } as any;

    const response = await proxy(request);
    expect(getClaimsMock).toHaveBeenCalledTimes(1);
    expect(response).toBeDefined();
  });
});
