import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { config as proxyConfig } from '@/proxy';

// Unit-only route contract. @supabase/supabase-js is replaced by a fake, so no request
// leaves the process. The real verifyMcpToken + withMcpAuth + whoami run end to end.
const ORIGIN = 'https://app.example.test';
const SUPABASE_URL = 'https://unit-ref.supabase.test';
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER_USER = '22222222-2222-4222-8222-222222222222';
const CLIENT = '33333333-3333-4333-8333-333333333333';
const SESSION = '44444444-4444-4444-8444-444444444444';
const TOKEN = 'unit.header.token';
const METADATA_URL = `${ORIGIN}/.well-known/oauth-protected-resource/mcp`;
const WORK = '55555555-5555-4555-8555-555555555555';
const CHAPTER = '66666666-6666-4666-8666-666666666666';
const NODE = '77777777-7777-4777-8777-777777777777';
/** Phase 13 read tools registered next to whoami, with valid arguments for each. */
const READ_TOOLS = [
  'list_works', 'list_chapters', 'get_chapter', 'search_kb', 'get_kb_document', 'get_writing_context',
] as const;
const TOOL_ARGS: Record<(typeof READ_TOOLS)[number], Record<string, unknown>> = {
  list_works: {},
  list_chapters: { workId: WORK },
  get_chapter: { workId: WORK, chapterId: CHAPTER },
  search_kb: { workId: WORK, query: '' },
  get_kb_document: { workId: WORK, nodeId: NODE },
  get_writing_context: { workId: WORK, chapterId: CHAPTER, nodeIds: [NODE] },
};
/** Phase 14 proposal tools (14-02): pending rows only, through the 0041 RPCs. */
const WRITE_TOOLS = ['save_draft', 'propose_kb_document'] as const;
const WRITE_ARGS: Record<(typeof WRITE_TOOLS)[number], Record<string, unknown>> = {
  save_draft: { workId: WORK, chapterId: CHAPTER, content: '초안 본문' },
  propose_kb_document: { mode: 'edit', workId: WORK, nodeId: NODE, content: '수정안' },
};
const PROPOSAL = '88888888-8888-4888-8888-888888888888';

const fake = vi.hoisted(() => ({
  claims: null as Record<string, unknown> | null,
  rpc: { data: null as unknown, error: null as unknown },
  // Answer of every non-authorization RPC (the proposal tools' 0041 calls).
  writeRpc: { data: null as unknown, error: null as unknown },
  createClient: [] as Array<{ url: string; key: string; authorization?: string }>,
  rpcCalls: [] as Array<{ fn: string; args: unknown }>,
  // Result of every PostgREST table query a tool makes through the per-call data client.
  query: { data: null as unknown, error: null as unknown },
  fromCalls: [] as string[],
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: (url: string, key: string, options?: { global?: { headers?: Record<string, string> } }) => {
    fake.createClient.push({ url, key, authorization: options?.global?.headers?.Authorization });
    // Chainable, thenable query builder: any filter/order/range call returns itself and
    // awaiting it (or maybeSingle()) yields fake.query.
    const builder: Record<string, unknown> = new Proxy({}, {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
            Promise.resolve(fake.query).then(resolve, reject);
        }
        if (prop === 'maybeSingle' || prop === 'single') return async () => fake.query;
        return () => builder;
      },
    });
    return {
      from: (table: string) => {
        fake.fromCalls.push(table);
        return builder;
      },
      auth: {
        getClaims: async () => (fake.claims
          ? { data: { claims: fake.claims }, error: null }
          : { data: null, error: new Error('Invalid JWT') }),
      },
      rpc: async (fn: string, args?: unknown) => {
        fake.rpcCalls.push({ fn, args });
        return fn === 'mcp_authorize_call' ? fake.rpc : fake.writeRpc;
      },
    };
  },
}));

function liveClaims(overrides: Record<string, unknown> = {}) {
  return {
    iss: `${SUPABASE_URL}/auth/v1`, sub: USER, aud: 'authenticated', role: 'authenticated',
    client_id: CLIENT, session_id: SESSION, exp: Math.floor(Date.now() / 1000) + 3600, ...overrides,
  };
}

let requestId = 0;
function rpcRequest(method: string, params: Record<string, unknown> = {}, init: { token?: string; headers?: Record<string, string> } = {}) {
  return new Request(`${ORIGIN}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18',
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
      ...init.headers,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }),
  });
}

type RpcResult = {
  tools?: Array<{ name: string; annotations?: Record<string, unknown>; inputSchema?: { properties?: Record<string, unknown>; additionalProperties?: unknown } }>;
  content?: Array<{ type: string; text: string }>;
  isError?: boolean;
};

async function jsonRpcBody(response: Response): Promise<{ result?: RpcResult; error?: unknown }> {
  const text = await response.text();
  if ((response.headers.get('content-type') ?? '').includes('text/event-stream')) {
    const data = text.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim());
    return JSON.parse(data.at(-1) ?? '{}');
  }
  return JSON.parse(text);
}

async function loadRoute() {
  return import('@/app/mcp/route');
}

function expectChallenge(response: Response) {
  expect(response.status).toBe(401);
  const challenge = response.headers.get('www-authenticate') ?? '';
  expect(challenge).toMatch(/^Bearer /);
  // Full URL, built from the configured origin (not /mcp/.well-known/... and not x-forwarded-*).
  expect(challenge).toContain(`resource_metadata="${METADATA_URL}"`);
  // No requiredScopes: a scope challenge would make Claude request scopes Supabase rejects.
  expect(challenge).not.toMatch(/scope=/);
}

describe('/mcp route authentication', () => {
  beforeEach(() => {
    vi.stubEnv('MCP_PUBLIC_ORIGIN', ORIGIN);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-unit');
    fake.claims = liveClaims();
    fake.rpc = { data: [{ out_user_id: USER, out_scopes: ['read', 'propose_draft'] }], error: null };
    fake.createClient = [];
    fake.rpcCalls = [];
    fake.writeRpc = { data: null, error: null };
    fake.query = { data: null, error: null };
    fake.fromCalls = [];
  });
  afterEach(() => vi.unstubAllEnvs());

  it('answers token-less POST and GET with 401 + PRM link, before any Supabase call', async () => {
    const { POST, GET } = await loadRoute();
    const post = await POST(rpcRequest('tools/call', { name: 'whoami', arguments: {} }));
    expectChallenge(post);
    expect(await post.text()).not.toContain(USER);
    const get = await GET(new Request(`${ORIGIN}/mcp`, { headers: { accept: 'text/event-stream' } }));
    expectChallenge(get);
    expect(fake.createClient).toEqual([]);
    expect(fake.rpcCalls).toEqual([]);
  });

  it('ignores x-forwarded-* when building resource_metadata', async () => {
    const { POST } = await loadRoute();
    const response = await POST(rpcRequest('tools/list', {}, {
      headers: { 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https', forwarded: 'host=evil.example;proto=https' },
    }));
    expectChallenge(response);
    expect(response.headers.get('www-authenticate')).not.toContain('evil.example');
  });

  it('rejects a non-bearer Authorization header', async () => {
    const { POST } = await loadRoute();
    const response = await POST(new Request(`${ORIGIN}/mcp`, {
      method: 'POST',
      headers: { authorization: `Basic ${TOKEN}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    }));
    expectChallenge(response);
  });

  it('rejects a browser session token (no client_id) without calling the grant RPC', async () => {
    fake.claims = liveClaims({ client_id: undefined });
    const { POST } = await loadRoute();
    const response = await POST(rpcRequest('tools/call', { name: 'whoami', arguments: {} }, { token: TOKEN }));
    expectChallenge(response);
    expect(fake.rpcCalls).toEqual([]);
  });

  it('rejects a signature-valid token whose grant is gone (RPC 0 rows) or the RPC fails', async () => {
    const { POST } = await loadRoute();
    fake.rpc = { data: [], error: null };
    const revoked = await POST(rpcRequest('tools/call', { name: 'whoami', arguments: {} }, { token: TOKEN }));
    expectChallenge(revoked);
    expect(await revoked.text()).not.toContain(USER);

    fake.rpc = { data: null, error: { message: 'connection refused' } };
    const outage = await POST(rpcRequest('tools/call', { name: 'whoami', arguments: {} }, { token: TOKEN }));
    expectChallenge(outage);
  });

  it('verifies with the caller bearer and the anon key, calling mcp_authorize_call without arguments', async () => {
    const { POST } = await loadRoute();
    const response = await POST(rpcRequest('tools/list', {}, { token: TOKEN }));
    expect(response.status).toBe(200);
    expect(fake.createClient).toEqual([{ url: SUPABASE_URL, key: 'anon-unit', authorization: `Bearer ${TOKEN}` }]);
    expect(fake.rpcCalls).toEqual([{ fn: 'mcp_authorize_call', args: undefined }]);
  });

  it('lists exactly seven read tools and two proposal tools with exact annotations and closed input schemas', async () => {
    const { POST } = await loadRoute();
    const body = await jsonRpcBody(await POST(rpcRequest('tools/list', {}, { token: TOKEN })));
    const tools = body.result?.tools ?? [];
    expect(tools).toHaveLength(9);
    expect(tools.map((tool) => tool.name).sort()).toEqual([...READ_TOOLS, ...WRITE_TOOLS, 'whoami'].sort());
    for (const tool of tools) {
      const write = (WRITE_TOOLS as readonly string[]).includes(tool.name);
      expect(tool.annotations, tool.name).toEqual({
        readOnlyHint: !write, destructiveHint: false, idempotentHint: true, openWorldHint: false,
      });
      const schema = tool.inputSchema as { additionalProperties?: unknown; oneOf?: Array<{ additionalProperties?: unknown }>; anyOf?: Array<{ additionalProperties?: unknown }> };
      const variants = schema.oneOf ?? schema.anyOf ?? [schema];
      for (const variant of variants) expect(variant.additionalProperties, tool.name).toBe(false);
    }
    const whoami = tools.find((tool) => tool.name === 'whoami');
    expect(Object.keys(whoami?.inputSchema?.properties ?? {})).toEqual([]);
  });

  it('runs no Phase 13 tool without a bearer or after the grant is gone', async () => {
    const { POST } = await loadRoute();
    for (const name of READ_TOOLS) {
      const anonymous = await POST(rpcRequest('tools/call', { name, arguments: TOOL_ARGS[name] }));
      expectChallenge(anonymous);
    }
    expect(fake.createClient).toEqual([]);
    fake.rpc = { data: [], error: null };
    for (const name of READ_TOOLS) {
      const revoked = await POST(rpcRequest('tools/call', { name, arguments: TOOL_ARGS[name] }, { token: TOKEN }));
      expectChallenge(revoked);
    }
    expect(fake.fromCalls).toEqual([]);
  });

  it('runs no proposal tool without a bearer or after the grant is gone', async () => {
    const { POST } = await loadRoute();
    for (const name of WRITE_TOOLS) expectChallenge(await POST(rpcRequest('tools/call', { name, arguments: WRITE_ARGS[name] })));
    expect(fake.createClient).toEqual([]);
    fake.rpc = { data: [], error: null };
    for (const name of WRITE_TOOLS) {
      expectChallenge(await POST(rpcRequest('tools/call', { name, arguments: WRITE_ARGS[name] }, { token: TOKEN })));
    }
    expect(fake.rpcCalls.every((call) => call.fn === 'mcp_authorize_call')).toBe(true);
  });

  it('refuses proposal tools for a read-only grant without calling a proposal RPC', async () => {
    fake.rpc = { data: [{ out_user_id: USER, out_scopes: ['read'] }], error: null };
    const { POST } = await loadRoute();
    for (const name of WRITE_TOOLS) {
      const body = await jsonRpcBody(await POST(rpcRequest('tools/call', { name, arguments: WRITE_ARGS[name] }, { token: TOKEN })));
      expect(body.result?.isError, name).toBe(true);
    }
    expect(fake.rpcCalls.every((call) => call.fn === 'mcp_authorize_call')).toBe(true);
  });

  it('saves a proposal through the route and returns the review link from the configured origin', async () => {
    fake.writeRpc = { data: { id: PROPOSAL, status: 'pending', expires_at: '2026-12-04T00:00:00+00:00', superseded_id: null }, error: null };
    const { POST } = await loadRoute();
    const body = await jsonRpcBody(await POST(rpcRequest('tools/call', { name: 'save_draft', arguments: WRITE_ARGS.save_draft }, {
      token: TOKEN, headers: { 'x-forwarded-host': 'evil.example' },
    })));
    expect(body.result?.isError).not.toBe(true);
    const saved = JSON.parse(body.result?.content?.[0]?.text ?? 'null');
    expect(saved).toMatchObject({ proposalId: PROPOSAL, status: 'pending', reviewUrl: `${ORIGIN}/studio/${WORK}/review/${PROPOSAL}` });
    expect(fake.rpcCalls.at(-1)).toEqual({
      fn: 'mcp_propose_chapter_draft', args: { p_work_id: WORK, p_chapter_id: CHAPTER, p_content: '초안 본문' },
    });
  });

  it('never forwards a raw SQL error from a proposal tool to the client', async () => {
    const { POST } = await loadRoute();
    const secret = 'relation "public.mcp_proposals" permission denied for SECRET_COLUMN';
    fake.writeRpc = { data: null, error: { message: secret, code: '42501', details: secret, hint: secret } };
    for (const name of WRITE_TOOLS) {
      const response = await POST(rpcRequest('tools/call', { name, arguments: WRITE_ARGS[name] }, { token: TOKEN }));
      expect(response.status).toBe(200);
      const raw = await response.text();
      expect(raw, name).not.toContain('SECRET_COLUMN');
      expect(raw, name).not.toContain('42501');
      expect(raw, name).toContain('isError');
    }
  });

  it('never forwards a raw SQL error from a tool to the client', async () => {
    const { POST } = await loadRoute();
    const secret = 'relation "public.works" permission denied for SECRET_COLUMN';
    fake.query = { data: null, error: { message: secret, code: '42501', details: secret, hint: secret } };
    for (const name of READ_TOOLS) {
      const response = await POST(rpcRequest('tools/call', { name, arguments: TOOL_ARGS[name] }, { token: TOKEN }));
      expect(response.status).toBe(200);
      const raw = await response.text();
      expect(raw, name).not.toContain('SECRET_COLUMN');
      expect(raw, name).not.toContain('42501');
      expect(raw, name).toContain('isError');
    }
    expect(fake.fromCalls.length).toBeGreaterThan(0);
  });

  it('whoami returns only the token owner ID', async () => {
    const { POST } = await loadRoute();
    const body = await jsonRpcBody(await POST(rpcRequest('tools/call', { name: 'whoami', arguments: {} }, { token: TOKEN })));
    expect(body.result?.isError).not.toBe(true);
    expect(JSON.parse(body.result?.content?.[0]?.text ?? 'null')).toEqual({ userId: USER });
  });

  it('whoami cannot be pointed at another user through arguments', async () => {
    const { POST } = await loadRoute();
    const body = await jsonRpcBody(await POST(rpcRequest('tools/call', {
      name: 'whoami', arguments: { userId: OTHER_USER },
    }, { token: TOKEN })));
    expect(JSON.stringify(body)).not.toContain(OTHER_USER);
    const text = body.result?.content?.[0]?.text as string | undefined;
    if (text && !body.result?.isError) expect(JSON.parse(text)).toEqual({ userId: USER });
    else expect(body.result?.isError === true || body.error !== undefined).toBe(true);
  });

  it('fails closed with 503 when MCP_PUBLIC_ORIGIN is missing (no header-derived origin)', async () => {
    vi.stubEnv('MCP_PUBLIC_ORIGIN', '');
    const { POST } = await loadRoute();
    const response = await POST(rpcRequest('tools/call', { name: 'whoami', arguments: {} }, {
      token: TOKEN, headers: { 'x-forwarded-host': 'evil.example' },
    }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(USER);
    expect(fake.rpcCalls).toEqual([]);
  });
});

describe('proxy matcher', () => {
  const matches = (url: string) => unstable_doesMiddlewareMatch({ config: proxyConfig, url });

  it('skips the cookie proxy for the MCP endpoint and its protected resource metadata', () => {
    expect(matches('/mcp')).toBe(false);
    expect(matches('/.well-known/oauth-protected-resource/mcp')).toBe(false);
    expect(matches('/mcp/')).toBe(false);
    expect(matches('/.well-known/oauth-protected-resource/mcp/')).toBe(false);
  });

  it('does not over-match look-alike or nested paths (they keep the cookie proxy)', () => {
    expect(matches('/mcp-foo')).toBe(true);
    expect(matches('/mcpxyz')).toBe(true);
    expect(matches('/mcp/extra')).toBe(true);
    expect(matches('/.well-known/oauth-protected-resource')).toBe(true);
    expect(matches('/.well-known/oauth-protected-resource-evil')).toBe(true);
    expect(matches('/.well-known/oauth-protected-resource/mcp/extra')).toBe(true);
    expect(matches('/.well-known/oauth-protected-resource/other')).toBe(true);
  });

  it('keeps refreshing cookies on the consent screen and look-alike paths', () => {
    expect(matches('/oauth/consent')).toBe(true);
    expect(matches('/oauth/consent?authorization_id=abc')).toBe(true);
    expect(matches('/mcpx')).toBe(true);
    expect(matches('/studio/settings/mcp-connections')).toBe(true);
    expect(matches('/studio')).toBe(true);
    expect(matches('/')).toBe(true);
  });

  it('keeps the existing exclusions', () => {
    expect(matches('/api/payments/toss/webhook')).toBe(false);
    expect(matches('/api/payments/toss/confirm')).toBe(true);
    expect(matches('/_next/static/chunk.js')).toBe(false);
    expect(matches('/favicon.ico')).toBe(false);
    expect(matches('/logo.png')).toBe(false);
  });
});
