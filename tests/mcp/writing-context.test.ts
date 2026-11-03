import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { McpServer, type AuthInfo } from '@modelcontextprotocol/server';
import type { z } from 'zod';
import * as mentions from '@/lib/ai/mentions';
import * as instructions from '@/lib/ai/work-instructions';
import { assembleUserContent, composeSystemInstruction, DEFAULT_STYLE_PRESET, PRESET_INSTRUCTIONS, STYLE_PRESETS } from '@/lib/ai/prompt';
import { CUSTOM_INSTRUCTION_MAX_LENGTH } from '@/lib/ai/regenerate-contract';
import { GENRES } from '@/lib/works/genres';
import { registerWritingContextTools } from '@/lib/mcp/tools/writing-context';
import type { McpToolContext, McpToolResult } from '@/lib/mcp/tool-runtime';

const fake = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: fake.createClient }));
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SESSION = '33333333-3333-4333-8333-333333333333';
const WORK = '44444444-4444-4444-8444-444444444444';
const FOREIGN = '55555555-5555-4555-8555-555555555555';
const NODE = '66666666-6666-4666-8666-666666666666';
const SHARED = '77777777-7777-4777-8777-777777777777';
const CHAPTER = '88888888-8888-4888-8888-888888888888';
const BEARER = 'unit-caller-bearer';
const SECRET = `SELECT token FROM kb_nodes; SQL 42501 ${BEARER}`;
const MISSING = '요청한 항목을 찾을 수 없습니다.';
const FAILED = '데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.';
const TOO_LARGE = '집필 컨텍스트가 100,000자 한도를 초과했습니다. 선택한 문서를 줄여주세요.';
const id = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
type Row = Record<string, unknown>;
type Response = { data: unknown; error: unknown };
type Call = { table: string; columns?: string; filters: [string, string, unknown][]; single?: boolean };

function context(userId = USER, grantScopes = ['read']): McpToolContext {
  const authInfo: AuthInfo = { token: BEARER, clientId: OTHER, scopes: ['read'], extra: { userId, sessionId: SESSION, grantScopes } };
  return { http: { authInfo } };
}
function node(nodeId = NODE, extra: Row = {}): Row {
  return { id: nodeId, name: '설정', category: 'custom', content: '설정 본문 [[연결]] 😀',
    owner_id: USER, work_id: WORK, scope: 'work', node_type: 'file', deleted_at: null, ...extra };
}
function safeError(result: McpToolResult, message?: string) {
  expect(result.isError).toBe(true);
  expect(result.content).toHaveLength(1);
  expect(result.content[0].text).toMatch(/[가-힣]/);
  expect(JSON.stringify(result)).not.toMatch(/SELECT|kb_nodes|SQL|42501|unit-caller-bearer/);
  if (message) expect(result.content[0].text).toBe(message);
}
function payload(result: McpToolResult) {
  expect(result.isError).not.toBe(true);
  return JSON.parse(result.content[0].text);
}

// Real predicates and column projection: dropping a boundary must leak data and fail a test.
function tools() {
  const rows: Record<string, Row[]> = {
    works: [{ id: WORK, owner_id: USER, deleted_at: null, title: '작품', genre: '판타지', admin_blinded: true },
      { id: FOREIGN, owner_id: OTHER, deleted_at: null, title: '다른 작품', genre: null }],
    chapters: [{ id: CHAPTER, work_id: WORK, title: '회차', deleted_at: null, content: '회차 전체\n본문 😀', is_published: false, price_tier: 100, admin_blinded: true }],
    kb_nodes: [node(), node(SHARED, { name: '공유 설정', scope: 'account_template', work_id: null, category: 'template', content: '공유 본문 [[보존]] 🚀' })],
    work_ai_instructions: [{ work_id: WORK, instruction: '  저장 작품 지시  ' }],
  };
  const calls: Call[] = [];
  let fault: ((call: Call) => Response | Error | undefined) | undefined;
  function intercept(call: Call): Response | undefined {
    const response = fault?.(call);
    if (response instanceof Error) throw response;
    return response;
  }
  const from = vi.fn((table: string) => {
    const call: Call = { table, filters: [] };
    calls.push(call);
    const execute = (): Response => {
      const failure = intercept(call);
      if (failure) return failure;
      const selected = (rows[table] ?? []).filter((row) => call.filters.every(([op, key, value]) =>
        op === 'in' ? (value as unknown[]).includes(row[key]) : row[key] === value));
      const columns = call.columns!.split(',').map((key) => key.trim());
      const data = selected.map((row) => Object.fromEntries(columns.map((key) => [key, row[key]])));
      return { data: call.single ? data[0] ?? null : data, error: null };
    };
    const query = {
      select(columns: string) { call.columns = columns; return query; },
      eq(key: string, value: unknown) { call.filters.push(['eq', key, value]); return query; },
      is(key: string, value: unknown) { call.filters.push(['is', key, value]); return query; },
      in(key: string, values: unknown[]) { call.filters.push(['in', key, values]); return query; },
      async maybeSingle() { call.single = true; return execute(); },
      then(resolve: (value: Response) => unknown, reject: (reason: unknown) => unknown) {
        return Promise.resolve().then(execute).then(resolve, reject);
      },
    };
    return query;
  });
  const rpc = vi.fn(async (name: string, args: { p_chapter_id: string }) => {
    const call: Call = { table: '$rpc', columns: name, filters: [] };
    calls.push(call);
    const failure = intercept(call);
    if (failure) return failure;
    if (name !== 'mcp_read_owned_chapter_content') throw new Error('Unexpected RPC');
    return { data: rows.chapters.find((row) => row.id === args.p_chapter_id)?.content ?? null, error: null };
  });
  fake.createClient.mockReturnValue({ from, rpc });
  const registered = new Map<string, { config: { title: string; inputSchema: z.ZodType; annotations: unknown }; run: (input: unknown, ctx: McpToolContext) => Promise<McpToolResult> }>();
  const server = new McpServer({ name: 'unit-writing-context', version: '1' });
  const original = server.registerTool.bind(server);
  vi.spyOn(server, 'registerTool').mockImplementation((...args: Parameters<typeof original>) => {
    const [name, config, run] = args;
    registered.set(name, { config, run } as unknown as NonNullable<ReturnType<typeof registered.get>>);
    return original(...args);
  });
  registerWritingContextTools(server);
  const invoke = (input: unknown, ctx = context()) => registered.get('get_writing_context')!.run(input, ctx);
  const read = (extra: Row = {}, ctx = context()) => invoke({ workId: WORK, chapterId: CHAPTER, nodeIds: [NODE, SHARED], ...extra }, ctx);
  return { rows, calls, from, rpc, registered, invoke, read, setFault: (fn: NonNullable<typeof fault>) => { fault = fn; } };
}

beforeEach(() => {
  fake.createClient.mockReset();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://unit.supabase.test');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-unit');
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network forbidden in unit tests'));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('get_writing_context boundary', () => {
  it('registers exactly one titled tool with four read annotations', () => {
    const { registered } = tools();
    expect([...registered.keys()]).toEqual(['get_writing_context']);
    const { config } = registered.get('get_writing_context')!;
    expect(config.title.length).toBeGreaterThan(0);
    expect(config.annotations).toEqual({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
  });

  it.each([
    { workId: 'bad' }, { chapterId: 'bad' }, { nodeIds: ['bad'] }, { nodeIds: 'bad' }, { nodeIds: Array(21).fill(NODE) },
    { userId: USER }, { ownerId: USER }, { workSystemInstruction: 'override' }, { genre: 'override' },
    { presetLevel: 'bad' }, { presetLevel: 'toString' }, { styleId: 'bad' }, { styleId: '__proto__' },
    { customInstruction: 1 }, { customInstruction: 'x'.repeat(CUSTOM_INSTRUCTION_MAX_LENGTH + 1) },
    { includeAppResponseProtocol: 'false' }, { includeAppResponseProtocol: null },
  ])('rejects invalid or extra arguments %j before data access', async (extra) => {
    const { read, from, rpc } = tools();
    safeError(await read(extra));
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(['workId', 'chapterId', 'nodeIds'])('requires %s', async (key) => {
    const { invoke, from } = tools();
    const input: Row = { workId: WORK, chapterId: CHAPTER, nodeIds: [] };
    delete input[key];
    safeError(await invoke(input));
    expect(from).not.toHaveBeenCalled();
  });

  it('requires verified identity, bearer and read grant', async () => {
    const { read, from } = tools();
    safeError(await read({}, {}));
    safeError(await read({}, context(USER, [])));
    const ctx = context();
    ctx.http!.authInfo!.token = '';
    safeError(await read({}, ctx));
    expect(from).not.toHaveBeenCalled();
  });

  it.each(['foreign', 'deleted', 'absent'])('blocks %s works before reading anything else', async (kind) => {
    const { rows, calls, read, rpc } = tools();
    if (kind === 'foreign') rows.works[0].owner_id = OTHER;
    if (kind === 'deleted') rows.works[0].deleted_at = 'deleted';
    if (kind === 'absent') rows.works = [];
    safeError(await read(), MISSING);
    expect(calls.map((call) => call.table)).toEqual(['works']);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(['wrong-work', 'deleted', 'absent'])('blocks %s chapters before body RPC', async (kind) => {
    const { rows, read, rpc } = tools();
    if (kind === 'wrong-work') rows.chapters[0].work_id = FOREIGN;
    if (kind === 'deleted') rows.chapters[0].deleted_at = 'deleted';
    if (kind === 'absent') rows.chapters = [];
    safeError(await read(), MISSING);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('uses the dedicated body RPC without filtering publication, price or blind flags', async () => {
    const { read, rpc, calls, rows } = tools();
    const result = payload(await read());
    expect(result.userContext).toContain(rows.chapters[0].content);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('mcp_read_owned_chapter_content', { p_chapter_id: CHAPTER });
    for (const field of ['is_published', 'price_tier', 'admin_blinded']) {
      expect(calls.flatMap((call) => call.filters.map((f) => f[1]))).not.toContain(field);
    }
    expect(calls.filter((call) => call.table === 'chapters').every((call) => !call.columns?.includes('content'))).toBe(true);
  });

  it('isolates the reverse user direction and shares the same missing response', async () => {
    const { rows, read } = tools();
    safeError(await read({}, context(OTHER)), MISSING);
    rows.chapters[0].work_id = FOREIGN;
    rows.kb_nodes.push(node(id(1), { owner_id: OTHER, work_id: FOREIGN, content: 'B only' }));
    const result = payload(await read({ workId: FOREIGN, nodeIds: [NODE, SHARED, id(1)] }, context(OTHER)));
    expect(result.userContext).toContain('B only');
    expect(result.userContext).not.toContain('설정 본문');
    expect(result.userContext).not.toContain('공유 본문');
    expect(result.manifest.missingNodeIds).toEqual([NODE, SHARED]);
  });
});

describe('writing bundle composition', () => {
  it('uses app defaults, stored work instruction and genre with explicit provenance', async () => {
    const mention = vi.spyOn(mentions, 'getMentionedNodesContent');
    const instruction = vi.spyOn(instructions, 'getWorkSystemInstruction');
    const { read } = tools();
    const result = payload(await read());
    expect(result.systemInstruction).toBe(composeSystemInstruction({ presetLevel: 'intermediate', styleId: DEFAULT_STYLE_PRESET,
      genre: '판타지', workSystemInstruction: '  저장 작품 지시  ', includeAppResponseProtocol: false }));
    expect(result.systemInstruction).not.toMatch(/\[REPLY\]|\[DRAFT\]|\[DOCUMENT\]/);
    expect(result.userContext).not.toContain('가장 마지막 작가 메시지');
    expect(result.manifest).toMatchObject({
      work: { id: WORK, title: '작품' }, chapter: { id: CHAPTER, workId: WORK, title: '회차' }, missingNodeIds: [],
      settings: {
        presetLevel: { value: 'intermediate', source: 'default' }, styleId: { value: DEFAULT_STYLE_PRESET, source: 'default' },
        genre: { value: '판타지', source: 'stored' }, includeAppResponseProtocol: { value: false, source: 'default' },
        customInstruction: { value: null, source: 'default' }, workSystemInstruction: { value: '저장 작품 지시', applied: true, source: 'stored' },
      },
    });
    expect(mention).toHaveBeenCalledExactlyOnceWith(expect.anything(), { ownerId: USER, workId: WORK, nodeIds: [NODE, SHARED] });
    expect(instruction).toHaveBeenCalledExactlyOnceWith(expect.anything(), { ownerId: USER, workId: WORK });
    expect(JSON.stringify(result.manifest)).not.toMatch(/회차 전체|설정 본문|공유 본문/);
    expect(result.systemInstruction).not.toMatch(/회차 전체|설정 본문|공유 본문/);
    expect(result.manifest.totalChars).toBe(JSON.stringify(result).length);
  });

  for (const presetLevel of Object.keys(PRESET_INSTRUCTIONS) as (keyof typeof PRESET_INSTRUCTIONS)[]) {
    for (const styleId of Object.keys(STYLE_PRESETS) as (keyof typeof STYLE_PRESETS)[]) {
      it(`matches direct app assembly exactly with protocol enabled: ${presetLevel}/${styleId}`, async () => {
        const { read, rows } = tools();
        const result = payload(await read({ presetLevel, styleId, customInstruction: '  직접 지시  ', includeAppResponseProtocol: true, nodeIds: [SHARED, NODE] }));
        expect(result.systemInstruction).toBe(composeSystemInstruction({ presetLevel, styleId, genre: '판타지',
          workSystemInstruction: '  저장 작품 지시  ', customInstruction: '  직접 지시  ' }));
        expect(result.userContext).toBe(assembleUserContent({ mentionedDocs: [rows.kb_nodes[1], rows.kb_nodes[0]] as never,
          precedingText: rows.chapters[0].content as string, chatHistory: [] }));
        expect(result.manifest.settings).toMatchObject({
          presetLevel: { value: presetLevel, source: 'arg' }, styleId: { value: styleId, source: 'arg' },
          includeAppResponseProtocol: { value: true, source: 'arg' },
          customInstruction: { value: presetLevel === 'freeform' ? '직접 지시' : null, source: presetLevel === 'freeform' ? 'arg' : 'default' },
          workSystemInstruction: { value: presetLevel === 'beginner' ? null : '저장 작품 지시', applied: presetLevel !== 'beginner', source: 'stored' },
        });
      });
    }
  }

  it('uses the default genre only for null storage and accepts an empty chapter and node list', async () => {
    const { rows, read, calls } = tools();
    rows.works[0].genre = null;
    rows.chapters[0].content = '';
    rows.work_ai_instructions = [];
    const result = payload(await read({ nodeIds: [] }));
    expect(result.userContext).toBe(assembleUserContent({ mentionedDocs: [], precedingText: '', chatHistory: [], includeAppResponseProtocol: false }));
    expect(result.manifest.settings.genre).toEqual({ value: GENRES[0], source: 'default' });
    expect(result.manifest.settings.workSystemInstruction).toEqual({ value: null, applied: false, source: 'stored' });
    expect(result.manifest.includedDocuments).toEqual([]);
    expect(calls.some((call) => call.table === 'kb_nodes')).toBe(false);
  });

  it('deduplicates requested IDs in request order and reports all missing IDs without a reason', async () => {
    const { rows, read, calls } = tools();
    rows.kb_nodes.push(node(id(1), { node_type: 'folder', content: 'secret folder' }), node(id(2), { owner_id: OTHER, content: 'secret foreign' }),
      node(id(3), { work_id: FOREIGN, content: 'secret work' }), node(id(4), { deleted_at: 'deleted', content: 'secret deleted' }),
      node(id(5), { scope: 'invalid', content: 'secret scope' }), node(id(6), { scope: 'account_template', work_id: null, owner_id: OTHER, content: 'secret shared' }));
    const missing = Array.from({ length: 7 }, (_, i) => id(i + 1));
    const result = payload(await read({ nodeIds: [SHARED, ...missing, NODE, SHARED, id(1)] }));
    expect(result.manifest.includedDocuments).toEqual([
      { id: SHARED, name: '공유 설정', category: 'template', scope: 'account_template' },
      { id: NODE, name: '설정', category: 'custom', scope: 'work' },
    ]);
    expect(result.manifest.missingNodeIds).toEqual(missing);
    expect(result.userContext.indexOf('공유 본문')).toBeLessThan(result.userContext.indexOf('설정 본문'));
    expect(result.userContext.match(/설정 본문/g)).toHaveLength(1);
    expect(result.userContext).toContain('[[보존]] 🚀');
    expect(result.userContext).not.toContain('secret');
    for (const call of calls.filter((call) => call.table === 'kb_nodes')) {
      expect(call.filters).toEqual(expect.arrayContaining([['eq', 'owner_id', USER], ['eq', 'node_type', 'file'], ['is', 'deleted_at', null]]));
      expect(call.filters).toContainEqual(['eq', 'scope', call.filters.some((f) => f[1] === 'work_id') ? 'work' : 'account_template']);
    }
    for (const call of calls.filter((call) => call.table === 'kb_nodes' && call.columns?.includes('content'))) {
      const ids = call.filters.find((f) => f[0] === 'in' && f[1] === 'id')![2] as string[];
      expect(ids.every((value) => value === NODE || value === SHARED)).toBe(true);
    }
  });

  it.each(['', '   ', 'x'.repeat(CUSTOM_INSTRUCTION_MAX_LENGTH)].map((value) => ({ value, length: value.length })))('applies only nonblank freeform custom instructions within the app limit (length $length)', async ({ value: customInstruction }) => {
    const { read } = tools();
    const result = payload(await read({ presetLevel: 'freeform', customInstruction }));
    expect(result.systemInstruction).toBe(composeSystemInstruction({ presetLevel: 'freeform', styleId: DEFAULT_STYLE_PRESET,
      genre: '판타지', customInstruction, workSystemInstruction: '  저장 작품 지시  ', includeAppResponseProtocol: false }));
  });
});

describe('writing context failure handling and size', () => {
  it.each(['works', 'chapters', '$rpc', 'work_ai_instructions', 'metadata-work', 'metadata-shared', 'content-work', 'content-shared'])
    ('sanitizes %s query errors, thrown errors and malformed results', async (stage) => {
      for (const mode of ['error', 'throw', 'malformed']) {
        const { read, rows, setFault } = tools();
        setFault((call) => {
          const actual = call.table !== 'kb_nodes' ? call.table
            : `${call.columns?.includes('content') ? 'content' : 'metadata'}-${call.filters.some((f) => f[1] === 'scope' && f[2] === 'account_template') ? 'shared' : 'work'}`;
          if (actual !== stage) return;
          const validRows = (rows[call.table] ?? []).filter((row) => call.filters.every(([op, key, value]) =>
            op === 'in' ? (value as unknown[]).includes(row[key]) : row[key] === value));
          const columns = call.columns?.split(',').map((key) => key.trim()) ?? [];
          const projected = validRows.map((row) => Object.fromEntries(columns.map((key) => [key, row[key]])));
          const valid = call.table === '$rpc' ? rows.chapters[0].content : call.single ? projected[0] ?? null : projected;
          return mode === 'throw' ? new Error(SECRET) : mode === 'error' ? { data: valid, error: { message: SECRET } }
            : { data: call.single || call.table === '$rpc' ? {} : [{}], error: null };
        });
        safeError(await read(), FAILED);
      }
    });

  it('does not swallow instruction ownership lookup failure even for beginner', async () => {
    const { read, setFault } = tools();
    setFault((call) => call.table === 'works' && call.columns === 'id' ? { data: { id: WORK }, error: { message: SECRET } } : undefined);
    safeError(await read({ presetLevel: 'beginner' }), FAILED);
  });

  it.each(['metadata-work', 'metadata-shared', 'content-work', 'content-shared'])('rejects null list at %s', async (stage) => {
    const { read, setFault } = tools();
    setFault((call) => {
      if (call.table !== 'kb_nodes') return;
      const actual = `${call.columns?.includes('content') ? 'content' : 'metadata'}-${call.filters.some((f) => f[1] === 'scope' && f[2] === 'account_template') ? 'shared' : 'work'}`;
      if (actual === stage) return { data: null, error: null };
    });
    safeError(await read(), FAILED);
  });

  it('treats null body RPC as missing, not empty content', async () => {
    const { read, setFault } = tools();
    setFault((call) => call.table === '$rpc' ? { data: null, error: null } : undefined);
    safeError(await read(), MISSING);
  });

  it.each([{ node_type: 'folder' }, { scope: 'invalid' }, { owner_id: OTHER }, { work_id: FOREIGN }, { deleted_at: 'deleted' }])
    ('rechecks content boundaries after metadata lookup (%j)', async (change) => {
      const { rows, read, setFault } = tools();
      setFault((call) => {
        if (call.table === 'kb_nodes' && call.columns?.includes('content')) Object.assign(rows.kb_nodes[0], change);
        return undefined;
      });
      const result = payload(await read());
      expect(result.manifest.missingNodeIds).toEqual([NODE]);
      expect(result.userContext).not.toContain('설정 본문');
    });

  it('counts the entire serialized bundle in UTF-16 and accepts exactly 100,000 units', async () => {
    const { rows, read } = tools();
    rows.chapters[0].content = '';
    const initial = payload(await read({ nodeIds: [] }));
    // The totalChars field itself grows from four to six digits at the boundary.
    rows.chapters[0].content = '가'.repeat(100000 - initial.manifest.totalChars - (6 - String(initial.manifest.totalChars).length));
    const result = await read({ nodeIds: [] });
    expect(payload(result).manifest.totalChars).toBe(100000);
    expect(result.content[0].text.length).toBe(100000);
    rows.chapters[0].content += '가';
    safeError(await read({ nodeIds: [] }), TOO_LARGE);
  });

  it('rejects a combined chapter and documents overflow, including surrogate pairs, without truncating', async () => {
    const { rows, read } = tools();
    rows.chapters[0].content = '😀'.repeat(24000);
    rows.kb_nodes[0].content = '🚀'.repeat(26000);
    safeError(await read(), TOO_LARGE);
    rows.chapters[0].content = '😀';
    rows.kb_nodes[0].content = '🚀';
    const result = payload(await read());
    expect(result.userContext).toContain('😀');
    expect(result.userContext).toContain('🚀');
    expect(result.manifest.totalChars).toBe(JSON.stringify(result).length);
  });
});
