import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { McpServer, type AuthInfo } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { PROPOSAL_MESSAGE, registerProposalTools } from '@/lib/mcp/tools/proposals';
import {
  MCP_PATCH_ERROR_MESSAGES, MCP_WRITE_ERROR_MESSAGES, type McpToolContext, type McpToolResult,
} from '@/lib/mcp/tool-runtime';

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

/** 14-13: 읽기 도구의 전체 원문 contentHash(소문자 hex 64자). */
const HASH = '0123456789abcdef'.repeat(4);
const LATEST = 'fedcba9876543210'.repeat(4);
const DRAFT_BASE = { workId: WORK, chapterId: CHAPTER, baseHash: HASH };
const EDIT_BASE = { mode: 'edit', workId: WORK, nodeId: NODE, baseHash: HASH };
const DRAFT = { ...DRAFT_BASE, content: '새 초안 본문' };
const CREATE = { mode: 'create', workId: WORK, category: '인물', name: '새 인물', content: '설정 본문' };
const EDIT = { ...EDIT_BASE, content: '수정 본문' };
const REPLACE = { op: 'replace', find: '옛 문장.', replace: '새 문장.' };
const RANGE = { op: 'replace_range', start_text: '그날 밤', end_text: '끝났다.', replace: '', hint_para: 3 };
const PATCH_DRAFT = { ...DRAFT_BASE, edits: [REPLACE, RANGE] };
const PATCH_EDIT = { ...EDIT_BASE, edits: [REPLACE] };
const replaceAllOf = (content: string) => [{ op: 'replaceAll', content }];

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

  it('tells the AI that a second save_draft adds a draft instead of replacing the first (14-10)', () => {
    const { registered } = setup();
    const description = registered.get('save_draft')!.config.description;
    expect(description).not.toMatch(/대체합니다/);
    expect(description).toMatch(/하나 더/);
    expect(description).toMatch(/같은 내용이면/);
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
    expect(calls).toEqual([{
      fn: 'mcp_propose_chapter_draft',
      args: { p_work_id: WORK, p_chapter_id: CHAPTER, p_base_hash: HASH, p_edits: replaceAllOf('새 초안 본문') },
    }]);
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
    ['missing baseHash', { workId: WORK, chapterId: CHAPTER, content: 'x' }],
    ['short baseHash', { ...DRAFT, baseHash: HASH.slice(1) }],
    ['long baseHash', { ...DRAFT, baseHash: `${HASH}0` }],
    ['uppercase baseHash', { ...DRAFT, baseHash: HASH.toUpperCase() }],
    ['non-hex baseHash', { ...DRAFT, baseHash: 'g'.repeat(64) }],
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
    expect(calls).toEqual([{
      fn: 'mcp_propose_kb_edit', args: { p_work_id: WORK, p_node_id: NODE, p_base_hash: HASH, p_edits: replaceAllOf('수정 본문') },
    }]);
  });

  it('edit mode forwards edits with the base hash to the edit RPC', async () => {
    const { call, calls } = setup();
    payload(await call('propose_kb_document', PATCH_EDIT));
    expect(calls).toEqual([{ fn: 'mcp_propose_kb_edit', args: { p_work_id: WORK, p_node_id: NODE, p_base_hash: HASH, p_edits: [REPLACE] } }]);
  });

  it('create mode keeps the content-only contract (no baseHash, no edits)', async () => {
    const { call, rpc } = setup();
    for (const args of [
      { ...CREATE, baseHash: HASH },
      { ...CREATE, edits: [REPLACE] },
      { mode: 'create', workId: WORK, category: '인물', name: '새 인물', edits: replaceAllOf('x') },
    ]) {
      expect(safeError(await call('propose_kb_document', args))).toBe('입력값을 확인해주세요.');
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it('caps a KB replaceAll at 50000 characters and accepts the boundary', async () => {
    const { call, rpc } = setup();
    payload(await call('propose_kb_document', { ...EDIT_BASE, edits: replaceAllOf('x'.repeat(50000)) }));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(safeError(await call('propose_kb_document', { ...EDIT_BASE, edits: replaceAllOf('x'.repeat(50001)) })))
      .toBe('입력값을 확인해주세요.');
    expect(rpc).toHaveBeenCalledTimes(1);
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
    ['edit without baseHash', { mode: 'edit', workId: WORK, nodeId: NODE, content: '수정 본문' }],
    ['edit with uppercase baseHash', { ...EDIT, baseHash: HASH.toUpperCase() }],
    ['edit with content and edits', { ...EDIT, edits: [REPLACE] }],
    ['edit with neither content nor edits', EDIT_BASE],
    ['edit with empty edits', { ...EDIT_BASE, edits: [] }],
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

describe('14-13 patch input (save_draft edits)', () => {
  it('forwards replace and replace_range edits with the base hash, unchanged and in order', async () => {
    const { call, calls } = setup();
    payload(await call('save_draft', PATCH_DRAFT));
    expect(calls).toEqual([{
      fn: 'mcp_propose_chapter_draft', args: { p_work_id: WORK, p_chapter_id: CHAPTER, p_base_hash: HASH, p_edits: [REPLACE, RANGE] },
    }]);
  });

  it('forwards an explicit replaceAll edit exactly like legacy content', async () => {
    const { call, calls } = setup();
    payload(await call('save_draft', { ...DRAFT_BASE, edits: replaceAllOf('새 초안 본문') }));
    payload(await call('save_draft', DRAFT));
    expect(calls[0]).toEqual(calls[1]);
    expect(calls[0].args.p_edits).toEqual(replaceAllOf('새 초안 본문'));
    expect(calls[0].args).not.toHaveProperty('p_content');
  });

  it('accepts every documented boundary value', async () => {
    const { call, rpc } = setup();
    const edges = [
      { op: 'replace', find: 'x', replace: '' },
      { op: 'replace', find: 'f'.repeat(500), replace: 'r'.repeat(10000), hint_para: 100000 },
      { op: 'replace_range', start_text: 's'.repeat(500), end_text: 'e', replace: 'r'.repeat(10000), hint_para: 1 },
    ];
    for (const edit of edges) payload(await call('save_draft', { ...DRAFT_BASE, edits: [edit] }));
    payload(await call('save_draft', { ...DRAFT_BASE, edits: Array.from({ length: 20 }, (_, i) => ({ op: 'replace', find: `문장${i}`, replace: '' })) }));
    payload(await call('save_draft', { ...DRAFT_BASE, edits: replaceAllOf('x'.repeat(100000)) }));
    expect(rpc).toHaveBeenCalledTimes(5);
  });

  it.each([
    ['content and edits together', { ...DRAFT, edits: [REPLACE] }],
    ['neither content nor edits', DRAFT_BASE],
    ['empty edits', { ...DRAFT_BASE, edits: [] }],
    ['21 edits', { ...DRAFT_BASE, edits: Array.from({ length: 21 }, () => REPLACE) }],
    ['edits not an array', { ...DRAFT_BASE, edits: REPLACE }],
    ['unknown op', { ...DRAFT_BASE, edits: [{ op: 'replace_every', find: 'a', replace: 'b' }] }],
    ['missing op', { ...DRAFT_BASE, edits: [{ find: 'a', replace: 'b' }] }],
    ['extra key in edit', { ...DRAFT_BASE, edits: [{ ...REPLACE, position: 3 }] }],
    ['replace without replace field', { ...DRAFT_BASE, edits: [{ op: 'replace', find: 'a' }] }],
    ['empty find', { ...DRAFT_BASE, edits: [{ ...REPLACE, find: '' }] }],
    ['find over 500', { ...DRAFT_BASE, edits: [{ ...REPLACE, find: 'f'.repeat(501) }] }],
    ['replace over 10000', { ...DRAFT_BASE, edits: [{ ...REPLACE, replace: 'r'.repeat(10001) }] }],
    ['empty start_text', { ...DRAFT_BASE, edits: [{ ...RANGE, start_text: '' }] }],
    ['start_text over 500', { ...DRAFT_BASE, edits: [{ ...RANGE, start_text: 's'.repeat(501) }] }],
    ['empty end_text', { ...DRAFT_BASE, edits: [{ ...RANGE, end_text: '' }] }],
    ['end_text over 500', { ...DRAFT_BASE, edits: [{ ...RANGE, end_text: 'e'.repeat(501) }] }],
    ['range replace over 10000', { ...DRAFT_BASE, edits: [{ ...RANGE, replace: 'r'.repeat(10001) }] }],
    ['range without end_text', { ...DRAFT_BASE, edits: [{ op: 'replace_range', start_text: 'a', replace: '' }] }],
    ['NUL in find', { ...DRAFT_BASE, edits: [{ ...REPLACE, find: 'a\u0000' }] }],
    ['NUL in replace', { ...DRAFT_BASE, edits: [{ ...REPLACE, replace: '\u0000' }] }],
    ['NUL in start_text', { ...DRAFT_BASE, edits: [{ ...RANGE, start_text: '\u0000a' }] }],
    ['NUL in end_text', { ...DRAFT_BASE, edits: [{ ...RANGE, end_text: 'a\u0000b' }] }],
    ['NUL in range replace', { ...DRAFT_BASE, edits: [{ ...RANGE, replace: '\u0000' }] }],
    ['NUL in replaceAll', { ...DRAFT_BASE, edits: replaceAllOf('a\u0000') }],
    ['empty replaceAll', { ...DRAFT_BASE, edits: replaceAllOf('') }],
    ['blank replaceAll', { ...DRAFT_BASE, edits: replaceAllOf('  \n') }],
    ['replaceAll over 100000', { ...DRAFT_BASE, edits: replaceAllOf('x'.repeat(100001)) }],
    ['replaceAll mixed with replace', { ...DRAFT_BASE, edits: [...replaceAllOf('x'), REPLACE] }],
    ['two replaceAll edits', { ...DRAFT_BASE, edits: [...replaceAllOf('x'), ...replaceAllOf('y')] }],
    ['hint_para on replaceAll', { ...DRAFT_BASE, edits: [{ op: 'replaceAll', content: 'x', hint_para: 1 }] }],
    ['hint_para 0', { ...DRAFT_BASE, edits: [{ ...REPLACE, hint_para: 0 }] }],
    ['hint_para 100001', { ...DRAFT_BASE, edits: [{ ...REPLACE, hint_para: 100001 }] }],
    ['fractional hint_para', { ...DRAFT_BASE, edits: [{ ...REPLACE, hint_para: 1.5 }] }],
    ['string hint_para', { ...DRAFT_BASE, edits: [{ ...RANGE, hint_para: '3' }] }],
  ])('rejects %s before any RPC', async (_label, args) => {
    const { call, rpc } = setup();
    expect(safeError(await call('save_draft', args))).toBe('입력값을 확인해주세요.');
    expect(rpc).not.toHaveBeenCalled();
  });

  // 0044 SQL은 length()(코드포인트)로 센다. 도구 한도도 UTF-16이 아니라 코드포인트여야 한다.
  const E = '😀';
  it('counts limits in code points: emoji inputs exactly at each limit pass', async () => {
    const { call, rpc } = setup();
    payload(await call('save_draft', { ...DRAFT_BASE, edits: [{ op: 'replace', find: E.repeat(500), replace: E.repeat(10000) }] }));
    payload(await call('save_draft', { ...DRAFT_BASE, edits: [{ op: 'replace_range', start_text: E.repeat(500), end_text: E.repeat(500), replace: E.repeat(10000) }] }));
    payload(await call('save_draft', { ...DRAFT_BASE, edits: replaceAllOf(E.repeat(100000)) }));
    payload(await call('save_draft', { ...DRAFT_BASE, content: E.repeat(100000) }));
    payload(await call('propose_kb_document', { ...EDIT_BASE, edits: replaceAllOf(E.repeat(50000)) }));
    payload(await call('propose_kb_document', { ...EDIT_BASE, content: E.repeat(50000) }));
    payload(await call('propose_kb_document', { ...CREATE, name: E.repeat(100), content: E.repeat(50000) }));
    expect(rpc).toHaveBeenCalledTimes(7);
  });

  it.each([
    ['find 501 emoji', 'save_draft', { ...DRAFT_BASE, edits: [{ op: 'replace', find: E.repeat(501), replace: '' }] }],
    ['replace 10001 emoji', 'save_draft', { ...DRAFT_BASE, edits: [{ op: 'replace', find: 'a', replace: E.repeat(10001) }] }],
    ['start_text 501 emoji', 'save_draft', { ...DRAFT_BASE, edits: [{ op: 'replace_range', start_text: E.repeat(501), end_text: 'b', replace: '' }] }],
    ['end_text 501 emoji', 'save_draft', { ...DRAFT_BASE, edits: [{ op: 'replace_range', start_text: 'a', end_text: E.repeat(501), replace: '' }] }],
    ['range replace 10001 emoji', 'save_draft', { ...DRAFT_BASE, edits: [{ op: 'replace_range', start_text: 'a', end_text: 'b', replace: E.repeat(10001) }] }],
    ['chapter replaceAll 100001 emoji', 'save_draft', { ...DRAFT_BASE, edits: replaceAllOf(E.repeat(100001)) }],
    ['chapter content 100001 emoji', 'save_draft', { ...DRAFT_BASE, content: E.repeat(100001) }],
    ['kb replaceAll 50001 emoji', 'propose_kb_document', { ...EDIT_BASE, edits: replaceAllOf(E.repeat(50001)) }],
    ['kb content 50001 emoji', 'propose_kb_document', { ...EDIT_BASE, content: E.repeat(50001) }],
    ['kb create 50001 emoji', 'propose_kb_document', { ...CREATE, content: E.repeat(50001) }],
    ['kb create name 101 emoji', 'propose_kb_document', { ...CREATE, name: E.repeat(101) }],
  ])('rejects %s (code point limit + 1) before any RPC', async (_label, tool, args) => {
    const { call, rpc } = setup();
    expect(safeError(await call(tool, args))).toBe('입력값을 확인해주세요.');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('describes every edit field in Korean in the advertised JSON schema', () => {
    const { registered } = setup();
    for (const name of ['save_draft', 'propose_kb_document']) {
      const json = JSON.stringify(z.toJSONSchema(registered.get(name)!.config.inputSchema, { io: 'input' }));
      for (const field of ['baseHash', 'edits', 'find', 'replace', 'start_text', 'end_text', 'hint_para', 'replaceAll']) {
        expect(json, `${name} ${field}`).toContain(field);
      }
      const edits = [...json.matchAll(/"(find|replace|start_text|end_text|content|hint_para|op)":\{[^{}]*?"description":"([^"]*)"/g)];
      expect(edits.length, name).toBeGreaterThan(0);
      for (const [, field, description] of edits) expect(description, `${name}.${field}`).toMatch(/[가-힣]/);
    }
  });

  it('keeps the tool descriptions short and carries the seam check line exactly once', () => {
    const { registered } = setup();
    for (const name of ['save_draft', 'propose_kb_document']) {
      const description = registered.get(name)!.config.description;
      expect(description.split('수정 구간의 앞뒤 문장과 연결되는지 확인').length - 1, name).toBe(1);
      expect(description.split('\n').filter((line) => line.includes('수정 구간의 앞뒤 문장과 연결되는지 확인')), name).toHaveLength(1);
      expect(description.length, name).toBeLessThanOrEqual(400);
    }
  });
});

describe('14-13 bounded success preview', () => {
  const ROW = { id: PROPOSAL, status: 'pending', expires_at: EXPIRES, superseded_id: null };
  const PREVIEW = [
    { editIndex: 0, before: [{ text: '앞 문단', truncated: false }], after: [{ text: '가'.repeat(240), truncated: true }, { text: '뒤', truncated: false }] },
    { editIndex: 1, before: [], after: [] },
  ];

  it('returns the existing fields plus a rebuilt preview', async () => {
    const { call } = setup(() => ({ data: { ...ROW, preview: PREVIEW }, error: null }));
    const body = payload(await call('save_draft', PATCH_DRAFT));
    expect(body).toEqual({
      proposalId: PROPOSAL, status: 'pending', expiresAt: EXPIRES,
      reviewUrl: `https://novelscript.test/studio/${WORK}/review/${PROPOSAL}`, message: PROPOSAL_MESSAGE, preview: PREVIEW,
    });
  });

  it('counts paragraph length in code points (emoji are one character each)', async () => {
    const emoji = [{ editIndex: 0, before: [{ text: '😀'.repeat(240), truncated: true }], after: [] }];
    const { call } = setup(() => ({ data: { ...ROW, preview: emoji }, error: null }));
    expect(payload(await call('save_draft', PATCH_DRAFT)).preview).toEqual(emoji);
  });

  it('never returns the full proposal body or unknown RPC fields', async () => {
    const { call } = setup(() => ({ data: { ...ROW, content: 'FULL_BODY', base_content: 'FULL_BASE', preview: PREVIEW }, error: null }));
    const text = (await call('save_draft', PATCH_DRAFT)).content[0].text;
    expect(text).not.toContain('FULL_BODY');
    expect(text).not.toContain('FULL_BASE');
  });

  it.each([
    ['too many entries', Array.from({ length: 21 }, (_, i) => ({ editIndex: i % 20, before: [], after: [] }))],
    ['three paragraphs before', [{ editIndex: 0, before: [{ text: 'a', truncated: false }, { text: 'b', truncated: false }, { text: 'c', truncated: false }], after: [] }]],
    ['paragraph over 240', [{ editIndex: 0, before: [{ text: 'x'.repeat(241), truncated: true }], after: [] }]],
    ['negative editIndex', [{ editIndex: -1, before: [], after: [] }]],
    ['editIndex 20', [{ editIndex: 20, before: [], after: [] }]],
    ['extra preview key', [{ editIndex: 0, before: [], after: [], token: BEARER }]],
    ['extra paragraph key', [{ editIndex: 0, before: [{ text: 'a', truncated: false, sql: 'SELECT 1' }], after: [] }]],
    ['not an array', 'SELECT secret'],
  ])('drops a malformed preview (%s) but still reports the saved proposal', async (_label, preview) => {
    const { call } = setup(() => ({ data: { ...ROW, preview }, error: null }));
    const body = payload(await call('save_draft', PATCH_DRAFT));
    expect(body.proposalId).toBe(PROPOSAL);
    expect(body).not.toHaveProperty('preview');
    expect(JSON.stringify(body)).not.toMatch(LEAK);
  });

  it('omits preview when the RPC returns none', async () => {
    const { call } = setup();
    expect(payload(await call('save_draft', PATCH_DRAFT))).not.toHaveProperty('preview');
  });
});

describe('14-13 structured patch errors', () => {
  type PatchCase = [string, string, Record<string, unknown>];
  const CANDIDATES = [
    { position: 12, before: '그는 문을 열었다. ', after: ' 바람이 불었다.' },
    { position: 340, before: '😀'.repeat(20), after: '' },
  ];
  const valid: PatchCase[] = [
    ['mcp_patch_stale', 'P0001', { code: 'stale', latestHash: LATEST }],
    ['mcp_patch_no_match', 'P0001', { code: 'no_match', editIndex: 0, reason: 'find' }],
    ['mcp_patch_no_match', 'P0001', { code: 'no_match', editIndex: 19, reason: 'end_text' }],
    ['mcp_patch_ambiguous', 'P0001', { code: 'ambiguous', editIndex: 1, reason: 'start_text', candidates: CANDIDATES }],
    ['mcp_patch_overlap', 'P0001', { code: 'overlap', editIndex: 2, reason: 'not_ascending' }],
    ['mcp_patch_overlap', 'P0001', { code: 'overlap', editIndex: 0, reason: 'range_reversed' }],
    ['mcp_patch_limit', '22023', { code: 'limit', reason: 'result_length' }],
    ['mcp_patch_limit', '22023', { code: 'limit', editIndex: 3, reason: 'delete_length' }],
    ['mcp_patch_invalid', '22023', { code: 'invalid', reason: 'replace_all_mixed' }],
  ];

  function structured(result: McpToolResult) {
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(JSON.stringify(result)).not.toMatch(LEAK);
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;
    expect(MCP_PATCH_ERROR_MESSAGES).toContain(body.message);
    expect(body.message).toMatch(/[가-힣]/);
    return body;
  }

  it.each(valid)('rebuilds %s (%s) into the allowlisted shape', async (message, code, detail) => {
    const { call } = setup(() => ({ data: null, error: { message, code, details: JSON.stringify(detail), hint: 'SELECT secret' } }));
    for (const [name, args] of [['save_draft', PATCH_DRAFT], ['propose_kb_document', PATCH_EDIT]] as const) {
      const { message: text, ...rest } = structured(await call(name, args));
      expect(typeof text).toBe('string');
      expect(rest).toEqual(detail);
    }
  });

  it('gives each patch code its own fixed Korean message', async () => {
    const seen = new Set<unknown>();
    for (const [message, code, detail] of valid) {
      const { call } = setup(() => ({ data: null, error: { message, code, details: JSON.stringify(detail) } }));
      seen.add(structured(await call('save_draft', PATCH_DRAFT)).message);
    }
    expect(seen.size).toBe(6);
    expect(MCP_PATCH_ERROR_MESSAGES).toHaveLength(6);
  });

  const STALE = { code: 'stale', latestHash: LATEST };
  const AMBIG = { code: 'ambiguous', editIndex: 0, reason: 'find', candidates: CANDIDATES };
  it.each([
    ['wrong SQLSTATE', 'mcp_patch_stale', '22023', JSON.stringify(STALE)],
    ['missing SQLSTATE', 'mcp_patch_stale', undefined, JSON.stringify(STALE)],
    ['message with suffix', 'mcp_patch_stale extra', 'P0001', JSON.stringify(STALE)],
    ['prototype message', 'constructor', 'P0001', JSON.stringify(STALE)],
    ['details not JSON', 'mcp_patch_stale', 'P0001', 'SELECT secret FROM mcp_proposals'],
    ['details missing', 'mcp_patch_stale', 'P0001', undefined],
    ['details as object', 'mcp_patch_stale', 'P0001', STALE],
    ['details JSON array', 'mcp_patch_stale', 'P0001', '[]'],
    ['code differs from message', 'mcp_patch_stale', 'P0001', JSON.stringify({ code: 'no_match', editIndex: 0, reason: 'find' })],
    ['stale without latestHash', 'mcp_patch_stale', 'P0001', JSON.stringify({ code: 'stale' })],
    ['uppercase latestHash', 'mcp_patch_stale', 'P0001', JSON.stringify({ code: 'stale', latestHash: LATEST.toUpperCase() })],
    ['short latestHash', 'mcp_patch_stale', 'P0001', JSON.stringify({ code: 'stale', latestHash: LATEST.slice(2) })],
    ['stale with extra token field', 'mcp_patch_stale', 'P0001', JSON.stringify({ ...STALE, token: BEARER })],
    ['stale with editIndex', 'mcp_patch_stale', 'P0001', JSON.stringify({ ...STALE, editIndex: 0 })],
    ['no_match without reason', 'mcp_patch_no_match', 'P0001', JSON.stringify({ code: 'no_match', editIndex: 0 })],
    ['no_match unknown reason', 'mcp_patch_no_match', 'P0001', JSON.stringify({ code: 'no_match', editIndex: 0, reason: 'SELECT 1' })],
    ['no_match with candidates', 'mcp_patch_no_match', 'P0001', JSON.stringify({ code: 'no_match', editIndex: 0, reason: 'find', candidates: CANDIDATES })],
    ['editIndex 20', 'mcp_patch_no_match', 'P0001', JSON.stringify({ code: 'no_match', editIndex: 20, reason: 'find' })],
    ['negative editIndex', 'mcp_patch_no_match', 'P0001', JSON.stringify({ code: 'no_match', editIndex: -1, reason: 'find' })],
    ['fractional editIndex', 'mcp_patch_no_match', 'P0001', JSON.stringify({ code: 'no_match', editIndex: 0.5, reason: 'find' })],
    ['string editIndex', 'mcp_patch_no_match', 'P0001', JSON.stringify({ code: 'no_match', editIndex: '0', reason: 'find' })],
    ['four candidates', 'mcp_patch_ambiguous', 'P0001', JSON.stringify({ ...AMBIG, candidates: [...CANDIDATES, ...CANDIDATES] })],
    ['one candidate', 'mcp_patch_ambiguous', 'P0001', JSON.stringify({ ...AMBIG, candidates: [CANDIDATES[0]] })],
    ['context over 20', 'mcp_patch_ambiguous', 'P0001', JSON.stringify({ ...AMBIG, candidates: [CANDIDATES[0], { position: 2, before: 'x'.repeat(21), after: '' }] })],
    ['after over 20', 'mcp_patch_ambiguous', 'P0001', JSON.stringify({ ...AMBIG, candidates: [CANDIDATES[0], { position: 2, before: '', after: '😀'.repeat(21) }] })],
    ['position 0', 'mcp_patch_ambiguous', 'P0001', JSON.stringify({ ...AMBIG, candidates: [CANDIDATES[0], { position: 0, before: '', after: '' }] })],
    ['fractional position', 'mcp_patch_ambiguous', 'P0001', JSON.stringify({ ...AMBIG, candidates: [CANDIDATES[0], { position: 1.5, before: '', after: '' }] })],
    ['candidate with extra key', 'mcp_patch_ambiguous', 'P0001', JSON.stringify({ ...AMBIG, candidates: [CANDIDATES[0], { position: 2, before: '', after: '', sql: 'SELECT 1' }] })],
    ['NUL in context', 'mcp_patch_ambiguous', 'P0001', JSON.stringify({ ...AMBIG, candidates: [CANDIDATES[0], { position: 2, before: '\u0000', after: '' }] })],
    ['ambiguous without candidates', 'mcp_patch_ambiguous', 'P0001', JSON.stringify({ code: 'ambiguous', editIndex: 0, reason: 'find' })],
    ['overlap unknown reason', 'mcp_patch_overlap', 'P0001', JSON.stringify({ code: 'overlap', editIndex: 0, reason: 'find' })],
    ['limit unknown reason', 'mcp_patch_limit', '22023', JSON.stringify({ code: 'limit', reason: 'stale' })],
    ['invalid with latestHash', 'mcp_patch_invalid', '22023', JSON.stringify({ code: 'invalid', reason: 'malformed', latestHash: LATEST })],
  ])('falls back to the fixed failure for %s', async (_label, message, code, details) => {
    const { call } = setup(() => ({ data: null, error: { message, code, details } }));
    expect(safeError(await call('save_draft', PATCH_DRAFT))).toBe('제안을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.');
  });

  it('keeps the fixed messages for the 0041 codes even with patch-like details', async () => {
    const { call } = setup(() => ({ data: null, error: { message: 'mcp_no_change', code: 'P0001', details: JSON.stringify(STALE) } }));
    expect(safeError(await call('save_draft', PATCH_DRAFT))).toBe('현재 내용과 같아서 저장할 제안이 없습니다.');
  });

  it('does not let read tools or thrown errors reach the structured path', async () => {
    const thrown = setup(() => { throw Object.assign(new Error('mcp_patch_stale'), { code: 'P0001', details: JSON.stringify(STALE) }); });
    safeError(await thrown.call('save_draft', PATCH_DRAFT));
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
