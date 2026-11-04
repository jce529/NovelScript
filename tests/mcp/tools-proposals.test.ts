import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { McpServer, type AuthInfo } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { PROPOSAL_MESSAGE, registerProposalTools } from '@/lib/mcp/tools/proposals';
import { MCP_WRITE_ERROR_MESSAGES, type McpToolContext, type McpToolResult } from '@/lib/mcp/tool-runtime';

/**
 * 14-02 proposal tool contract (unit, no network): strict inputs, propose_draft scope, the
 * 0041 RPC call shape, safe error mapping and the pending response with reviewUrl.
 */
const fake = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: fake.createClient }));

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SESSION = '33333333-3333-4333-8333-333333333333';
const WORK = '44444444-4444-4444-8444-444444444444';
const CHAPTER = '55555555-5555-4555-8555-555555555555';
const NODE = '66666666-6666-4666-8666-666666666666';
const PROPOSAL = '77777777-7777-4777-8777-777777777777';
const OLD = '88888888-8888-4888-8888-888888888888';
const BEARER = 'unit-caller-bearer';
const EXPIRES = '2026-12-04T00:00:00+00:00';
const LEAK = /SELECT|mcp_proposals|SQL|42501|P0001|unit-caller-bearer|mcp_|violates|permission/;

type Rpc = { fn: string; args: Record<string, unknown> };
type Registered = { config: { title: string; description: string; inputSchema: z.ZodType; annotations: unknown }; run: (input: unknown, ctx: McpToolContext) => Promise<McpToolResult> };

function context(grantScopes: string[] = ['read', 'propose_draft']): McpToolContext {
  const info: AuthInfo = { token: BEARER, clientId: OTHER, scopes: grantScopes, extra: { userId: USER, sessionId: SESSION, grantScopes } };
  return { http: { authInfo: info } };
}

function setup(answer: (call: Rpc) => { data: unknown; error: unknown } = () => ({
  data: { id: PROPOSAL, status: 'pending', expires_at: EXPIRES, superseded_id: null }, error: null,
})) {
  const calls: Rpc[] = [];
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args });
    return answer({ fn, args });
  });
  const from = vi.fn(() => { throw new Error('proposal tools must not touch tables directly'); });
  fake.createClient.mockReturnValue({ rpc, from });
  const registered = new Map<string, Registered>();
  const server = new McpServer({ name: 'unit-proposals', version: '1' });
  const original = server.registerTool.bind(server);
  vi.spyOn(server, 'registerTool').mockImplementation((...args: Parameters<typeof original>) => {
    const [name, config, run] = args;
    registered.set(name, { config, run } as unknown as Registered);
    return original(...args);
  });
  registerProposalTools(server);
  const call = (name: string, args: unknown, ctx = context()) => registered.get(name)!.run(args, ctx);
  return { calls, rpc, from, registered, call, server };
}

function safeError(result: McpToolResult) {
  expect(result.isError).toBe(true);
  expect(result.content).toHaveLength(1);
  expect(result.content[0].text).toMatch(/[가-힣]/);
  expect(MCP_WRITE_ERROR_MESSAGES).toContain(result.content[0].text);
  expect(JSON.stringify(result)).not.toMatch(LEAK);
  return result.content[0].text;
}
function payload(result: McpToolResult) {
  expect(result.isError).not.toBe(true);
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

const DRAFT = { workId: WORK, chapterId: CHAPTER, content: '새 초안 본문' };
const CREATE = { mode: 'create', workId: WORK, category: '인물', name: '새 인물', content: '설정 본문' };
const EDIT = { mode: 'edit', workId: WORK, nodeId: NODE, content: '수정 본문' };

beforeEach(() => {
  fake.createClient.mockReset();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://unit.supabase.test');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-unit');
  vi.stubEnv('MCP_PUBLIC_ORIGIN', 'https://novelscript.test');
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network forbidden in unit tests'));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('proposal tool registration', () => {
  it('registers exactly save_draft and propose_kb_document with write annotations', () => {
    const { registered } = setup();
    expect([...registered.keys()].sort()).toEqual(['propose_kb_document', 'save_draft']);
    for (const [name, tool] of registered) {
      expect(tool.config.title.trim(), name).toBeTruthy();
      expect(tool.config.description, name).toMatch(/수락/);
      expect(tool.config.annotations, name).toEqual({ readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false });
    }
  });

  it('advertises object-rooted JSON schemas where every field has a Korean description', () => {
    const { registered } = setup();
    for (const [name, tool] of registered) {
      const json = z.toJSONSchema(tool.config.inputSchema, { io: 'input' }) as Record<string, unknown>;
      const variants = (json.oneOf ?? json.anyOf ?? [json]) as Array<{ type?: string; properties: Record<string, { description?: string }>; additionalProperties?: unknown }>;
      for (const variant of variants) {
        expect(variant.type, name).toBe('object');
        expect(variant.additionalProperties, name).toBe(false);
        for (const [field, schema] of Object.entries(variant.properties)) {
          expect(schema.description, `${name}.${field}`).toMatch(/[가-힣]/);
        }
        expect(Object.keys(variant.properties), name).not.toEqual(expect.arrayContaining(['userId']));
      }
    }
  });
});

describe('save_draft', () => {
  it('calls the chapter draft RPC and returns a pending proposal with reviewUrl and guidance', async () => {
    const { call, calls, from } = setup();
    const body = payload(await call('save_draft', DRAFT));
    expect(calls).toEqual([{ fn: 'mcp_propose_chapter_draft', args: { p_work_id: WORK, p_chapter_id: CHAPTER, p_content: '새 초안 본문' } }]);
    expect(from).not.toHaveBeenCalled();
    expect(body).toEqual({
      proposalId: PROPOSAL, status: 'pending', expiresAt: EXPIRES,
      reviewUrl: `https://novelscript.test/studio/${WORK}/review/${PROPOSAL}`, message: PROPOSAL_MESSAGE,
    });
    expect(PROPOSAL_MESSAGE).toBe('작가가 스튜디오 리뷰 큐에서 수락해야 반영돼요. 본문은 바뀌지 않았어요.');
  });

  it('reports the superseded pending draft', async () => {
    const { call } = setup(() => ({ data: { id: PROPOSAL, status: 'pending', expires_at: EXPIRES, superseded_id: OLD }, error: null }));
    expect(payload(await call('save_draft', DRAFT)).supersededProposalId).toBe(OLD);
  });

  it('uses the bearer-scoped client only', async () => {
    const { call } = setup();
    await call('save_draft', DRAFT);
    expect(fake.createClient).toHaveBeenCalledTimes(1);
    const [, , options] = fake.createClient.mock.calls[0];
    expect(options.global.headers.Authorization).toBe(`Bearer ${BEARER}`);
  });

  it.each([
    ['userId', { ...DRAFT, userId: OTHER }],
    ['ownerId', { ...DRAFT, ownerId: OTHER }],
    ['source', { ...DRAFT, source: 'evil' }],
    ['bad workId', { ...DRAFT, workId: 'x' }],
    ['missing chapterId', { workId: WORK, content: 'x' }],
    ['empty content', { ...DRAFT, content: '' }],
    ['blank content', { ...DRAFT, content: '  \n ' }],
    ['NUL content', { ...DRAFT, content: 'a\u0000b' }],
    ['too long', { ...DRAFT, content: 'x'.repeat(100001) }],
  ])('rejects %s before any RPC', async (_label, args) => {
    const { call, rpc } = setup();
    expect(safeError(await call('save_draft', args))).toBe('입력값을 확인해주세요.');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('accepts exactly 100000 characters', async () => {
    const { call, rpc } = setup();
    payload(await call('save_draft', { ...DRAFT, content: 'x'.repeat(100000) }));
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('refuses a grant without propose_draft before any client is made', async () => {
    const { call, rpc } = setup();
    expect(safeError(await call('save_draft', DRAFT, context(['read'])))).toMatch(/권한/);
    expect(rpc).not.toHaveBeenCalled();
    expect(fake.createClient).not.toHaveBeenCalled();
  });

  it('refuses missing auth info', async () => {
    const { call, rpc } = setup();
    expect(safeError(await call('save_draft', DRAFT, {}))).toBe('인증 정보를 확인할 수 없습니다.');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not write when the public origin is not configured', async () => {
    vi.stubEnv('MCP_PUBLIC_ORIGIN', '');
    const { call, rpc } = setup();
    safeError(await call('save_draft', DRAFT));
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['mcp_not_found', '요청한 항목을 찾을 수 없습니다.'],
    ['mcp_suspended', '계정 이용이 제한되어 제안을 저장할 수 없습니다.'],
    ['mcp_cap_reached', '대기 중인 제안이 너무 많습니다. 스튜디오 리뷰 큐에서 먼저 정리해주세요.'],
    ['mcp_scope_denied', '초안 제안 권한이 없습니다. NovelScript에서 연결을 다시 승인해주세요.'],
    ['mcp_no_change', '현재 내용과 같아서 저장할 제안이 없습니다.'],
  ])('maps %s to a safe Korean message', async (message, expected) => {
    const { call } = setup(() => ({ data: null, error: { message, code: 'P0001', details: 'SELECT secret FROM mcp_proposals' } }));
    expect(safeError(await call('save_draft', DRAFT))).toBe(expected);
  });

  it.each([
    { message: 'live MCP grant required', code: '42501' },
    { message: 'mcp_invalid_content', code: '22023' },
    { message: 'permission denied for table mcp_proposals', code: '42501' },
    { message: 'mcp_not_found extra', code: 'P0001' },
    { message: 'hasOwnProperty' },
  ])('keeps other RPC errors generic: %j', async (error) => {
    const { call } = setup(() => ({ data: null, error }));
    expect(safeError(await call('save_draft', DRAFT))).toBe('제안을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.');
  });

  it('treats a malformed RPC answer and a thrown client error as generic failures', async () => {
    const bad = setup(() => ({ data: { id: 'x', status: 'accepted' }, error: null }));
    safeError(await bad.call('save_draft', DRAFT));
    const thrown = setup(() => { throw new Error('SELECT token FROM mcp_proposals 42501'); });
    safeError(await thrown.call('save_draft', DRAFT));
  });
});

describe('propose_kb_document', () => {
  it('create mode calls the create RPC', async () => {
    const { call, calls } = setup();
    const body = payload(await call('propose_kb_document', CREATE));
    expect(calls).toEqual([{ fn: 'mcp_propose_kb_create', args: { p_work_id: WORK, p_category: '인물', p_name: '새 인물', p_content: '설정 본문' } }]);
    expect(body.reviewUrl).toBe(`https://novelscript.test/studio/${WORK}/review/${PROPOSAL}`);
    expect(body.message).toBe(PROPOSAL_MESSAGE);
  });

  it('edit mode calls the edit RPC', async () => {
    const { call, calls } = setup();
    payload(await call('propose_kb_document', EDIT));
    expect(calls).toEqual([{ fn: 'mcp_propose_kb_edit', args: { p_work_id: WORK, p_node_id: NODE, p_content: '수정 본문' } }]);
  });

  it.each(['인물', '장소', '사건', '세력', '아이템'])('accepts category %s', async (category) => {
    const { call } = setup();
    payload(await call('propose_kb_document', { ...CREATE, category }));
  });

  it.each([
    ['template category', { ...CREATE, category: 'template' }],
    ['회차 category', { ...CREATE, category: '회차' }],
    ['custom category', { ...CREATE, category: 'custom' }],
    ['create with nodeId', { ...CREATE, nodeId: NODE }],
    ['edit with name', { ...EDIT, name: '이름' }],
    ['edit with category', { ...EDIT, category: '인물' }],
    ['no mode', { workId: WORK, nodeId: NODE, content: 'x' }],
    ['unknown mode', { ...EDIT, mode: 'delete' }],
    ['userId', { ...EDIT, userId: OTHER }],
    ['ownerId', { ...CREATE, ownerId: OTHER }],
    ['source', { ...CREATE, source: 'x' }],
    ['empty name', { ...CREATE, name: '' }],
    ['long name', { ...CREATE, name: '가'.repeat(101) }],
    ['NUL name', { ...CREATE, name: 'a\u0000' }],
    ['NUL content', { ...EDIT, content: '\u0000' }],
    ['long content', { ...EDIT, content: 'x'.repeat(50001) }],
    ['blank content', { ...CREATE, content: '   ' }],
  ])('rejects %s before any RPC', async (_label, args) => {
    const { call, rpc } = setup();
    expect(safeError(await call('propose_kb_document', args))).toBe('입력값을 확인해주세요.');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses a read-only grant', async () => {
    const { call, rpc } = setup();
    safeError(await call('propose_kb_document', EDIT, context(['read'])));
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('static boundary', () => {
  it('proposals.ts has no admin client and calls only the 0041 RPCs', () => {
    const source = readFileSync(path.resolve(__dirname, '../../lib/mcp/tools/proposals.ts'), 'utf8');
    expect(source.includes(['create', 'AdminClient'].join(''))).toBe(false);
    expect(source).not.toMatch(/\.from\(/);
    const rpcs = [...source.matchAll(/'(mcp_propose_[a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(rpcs).toEqual(['mcp_propose_chapter_draft', 'mcp_propose_kb_create', 'mcp_propose_kb_edit']);
  });
});
