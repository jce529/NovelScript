import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// RFC 9728 metadata contract for /mcp (12-01 S2). Unit-only: no network.
const ORIGIN = 'https://app.example.test';
const SUPABASE_URL = 'https://unit-ref.supabase.test';
const PRM_URL = `${ORIGIN}/.well-known/oauth-protected-resource/mcp`;

async function loadPrm() {
  return import('@/app/.well-known/oauth-protected-resource/mcp/route');
}

describe('/.well-known/oauth-protected-resource/mcp', () => {
  beforeEach(() => {
    vi.stubEnv('MCP_PUBLIC_ORIGIN', ORIGIN);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('publishes resource = full MCP URL and the Supabase Auth issuer first', async () => {
    const { GET } = await loadPrm();
    const response = GET(new Request(PRM_URL));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    const metadata = await response.json();
    expect(metadata.resource).toBe(`${ORIGIN}/mcp`);
    expect(metadata.authorization_servers).toEqual([`${SUPABASE_URL}/auth/v1`]);
    // Supabase only issues OIDC scopes; advertising read/propose_draft would break authorize.
    expect(metadata.scopes_supported ?? []).toEqual([]);
  });

  it('matches the resource_metadata origin used by the /mcp challenge, not request headers', async () => {
    const { GET } = await loadPrm();
    const response = GET(new Request('http://localhost:3000/.well-known/oauth-protected-resource/mcp', {
      headers: { 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https' },
    }));
    const metadata = await response.json();
    expect(metadata.resource).toBe(`${ORIGIN}/mcp`);
    expect(JSON.stringify(metadata)).not.toContain('evil.example');
  });

  it('normalizes a trailing slash in configuration', async () => {
    vi.stubEnv('MCP_PUBLIC_ORIGIN', `${ORIGIN}/`);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', `${SUPABASE_URL}/`);
    const { GET } = await loadPrm();
    const metadata = await GET(new Request(PRM_URL)).json();
    expect(metadata.resource).toBe(`${ORIGIN}/mcp`);
    expect(metadata.authorization_servers).toEqual([`${SUPABASE_URL}/auth/v1`]);
  });

  it('answers the CORS preflight', async () => {
    const { OPTIONS } = await loadPrm();
    const response = OPTIONS();
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('returns 503 instead of guessing when configuration is missing', async () => {
    const { GET } = await loadPrm();
    vi.stubEnv('MCP_PUBLIC_ORIGIN', '');
    expect(GET(new Request(PRM_URL)).status).toBe(503);
    vi.stubEnv('MCP_PUBLIC_ORIGIN', ORIGIN);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    expect(GET(new Request(PRM_URL)).status).toBe(503);
  });
});
