import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { McpServer, type AuthInfo } from '@modelcontextprotocol/server';
import { z } from 'zod';
import * as mentions from '@/lib/ai/mentions';
import { registerKbTools } from '@/lib/mcp/tools/kb';
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
const ABSENT = '88888888-8888-4888-8888-888888888888';
const BEARER = 'unit-caller-bearer';
const SECRET = `SELECT token FROM kb_nodes; SQL 42501 ${BEARER}`;
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const id = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
type Row = Record<string, unknown>;
type Response = { data: unknown; error: unknown };
type Call = { table: string; columns?: string; filters: [string, string, unknown][]; orders: string[]; range?: [number, number]; single?: boolean };

function context(userId = USER, grantScopes = ['read']): McpToolContext {
  const info: AuthInfo = { token: BEARER, clientId: OTHER, scopes: ['read'], extra: { userId, sessionId: SESSION, grantScopes } };
  return { http: { authInfo: info } };
}
function node(nodeId = NODE, extras: Row = {}): Row {
  return { id: nodeId, name: '설정', category: 'custom', content: '설정 본문 [[연결]]',
    owner_id: USER, work_id: WORK, scope: 'work', node_type: 'file', deleted_at: null, ...extras };
}
function safeError(result: McpToolResult) {
  expect(result.isError).toBe(true);
  expect(result.content).toHaveLength(1);
  expect(result.content[0].text).toMatch(/[가-힣]/);
  expect(JSON.stringify(result)).not.toMatch(/SELECT|kb_nodes|SQL|42501|unit-caller-bearer/);
}
function payload(result: McpToolResult) {
  expect(result.isError).not.toBe(true);
  return JSON.parse(result.content[0].text);
}

// Interpret SQL LIKE escapes rather than using includes(): missing wildcard
// escaping must expand the results and fail the injection regression tests.
function like(value: unknown, pattern: string): boolean {
  let regex = '^';
  const literal = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '\\' && i + 1 < pattern.length) regex += literal(pattern[++i]);
    // PostgREST also accepts * as an alias for the LIKE % wildcard.
    else regex += c === '%' || c === '*' ? '.*' : c === '_' ? '.' : literal(c);
  }
  return new RegExp(`${regex}$`, 'isu').test(String(value ?? ''));
}
function tools() {
  const rows: Record<string, Row[]> = {
    works: [{ id: WORK, owner_id: USER, deleted_at: null }, { id: FOREIGN, owner_id: OTHER, deleted_at: null }],
    kb_nodes: [node(), node(SHARED, { scope: 'account_template', work_id: null, name: '공유 설정', category: 'template' })],
  };
  const calls: Call[] = [];
  let fault: ((call: Call, index: number) => Response | Error | undefined) | undefined;
  const from = vi.fn((table: string) => {
    const call: Call = { table, filters: [], orders: [] };
    calls.push(call);
    const execute = (): Response => {
      const failure = fault?.(call, calls.indexOf(call));
      if (failure instanceof Error) throw failure;
      if (failure) return failure;
      let result = (rows[table] ?? []).filter((row) => call.filters.every(([op, key, value]) =>
        op === 'in' ? (value as unknown[]).includes(row[key]) : op === 'ilike' ? like(row[key], value as string) : row[key] === value));
      result = [...result].sort((a, b) => {
        for (const key of call.orders) {
          const compared = String(a[key]).localeCompare(String(b[key]));
          if (compared) return compared;
        }
        return 0;
      });
      if (call.range) result = result.slice(call.range[0], call.range[1] + 1);
      const columns = call.columns!.split(',').map((s) => s.trim());
      const projected = result.map((row) => Object.fromEntries(columns.map((key) => [key, row[key]])));
      return { data: call.single ? projected[0] ?? null : projected, error: null };
    };
    const query = {
      select(columns: string) { call.columns = columns; return query; },
      eq(key: string, value: unknown) { call.filters.push(['eq', key, value]); return query; },
      is(key: string, value: unknown) { call.filters.push(['is', key, value]); return query; },
      in(key: string, value: unknown[]) { call.filters.push(['in', key, value]); return query; },
      ilike(key: string, value: string) { call.filters.push(['ilike', key, value]); return query; },
      order(key: string) { call.orders.push(key); return query; },
      limit(count: number) { call.range = [0, count - 1]; return query; },
      range(start: number, end: number) { call.range = [start, end]; return query; },
      async maybeSingle() { call.single = true; return execute(); },
      then(resolve: (value: Response) => unknown, reject: (reason: unknown) => unknown) {
        return Promise.resolve().then(execute).then(resolve, reject);
      },
    };
    return query;
  });
  fake.createClient.mockReturnValue({ from });
  const registered = new Map<string, { config: { title: string; inputSchema: z.ZodType; annotations: unknown }; run: (input: unknown, ctx: McpToolContext) => Promise<McpToolResult> }>();
  const server = new McpServer({ name: 'unit-kb', version: '1' });
  const original = server.registerTool.bind(server);
  vi.spyOn(server, 'registerTool').mockImplementation((...args: Parameters<typeof original>) => {
    const [name, config, run] = args;
    registered.set(name, { config, run } as unknown as NonNullable<ReturnType<typeof registered.get>>);
    return original(...args);
  });
  registerKbTools(server);
  const call = (name: string, args: unknown, ctx = context()) => registered.get(name)!.run(args, ctx);
  const search = (query = '', extra: Row = {}, ctx = context()) => call('search_kb', { workId: WORK, query, ...extra }, ctx);
  return { rows, calls, from, registered, call, search, setFault: (fn: NonNullable<typeof fault>) => { fault = fn; } };
}

beforeEach(() => {
  fake.createClient.mockReset();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://unit.supabase.test');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-unit');
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network forbidden in unit tests'));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('search_kb', () => {
  it('registers a strict read-only titled search tool', () => {
    const { registered } = tools();
    const config = registered.get('search_kb')!.config;
    expect(config.title.length).toBeGreaterThan(0);
    expect(config.annotations).toEqual({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
  });

  it.each([{ userId: OTHER }, { workId: 'bad' }, { query: 1 }, { query: 'x'.repeat(201) }, { limit: 0 }, { limit: 51 }, { limit: 1.5 }, { offset: -1 }, { offset: '0' }, { offset: Number.MAX_SAFE_INTEGER }])('rejects invalid input %j before data access', async (extra) => {
    const { search, from } = tools();
    safeError(await search('', extra));
    expect(from).not.toHaveBeenCalled();
  });

  it('requires query and workId', async () => {
    const { call, from } = tools();
    safeError(await call('search_kb', { workId: WORK }));
    safeError(await call('search_kb', { query: '' }));
    expect(from).not.toHaveBeenCalled();
  });

  it('requires verified identity and a read grant', async () => {
    const { search, from } = tools();
    safeError(await search('', {}, {}));
    safeError(await search('', {}, context(USER, [])));
    expect(from).not.toHaveBeenCalled();
  });

  it.each(['foreign', 'deleted', 'absent'])('verifies the work first (%s)', async (kind) => {
    const { rows, search, calls } = tools();
    if (kind === 'foreign') rows.works[0].owner_id = OTHER;
    if (kind === 'deleted') rows.works[0].deleted_at = 'deleted';
    if (kind === 'absent') rows.works = [];
    const result = await search();
    safeError(result);
    expect(result.content[0].text).toBe('요청한 항목을 찾을 수 없습니다.');
    expect(calls.map((c) => c.table)).toEqual(['works']);
  });

  it('lists only live file nodes in the owned work and owner account space', async () => {
    const { rows, search, calls } = tools();
    rows.kb_nodes.push(node(id(1), { owner_id: OTHER }), node(id(2), { owner_id: OTHER, scope: 'account_template', work_id: null }),
      node(id(3), { work_id: FOREIGN }), node(id(4), { node_type: 'folder' }), node(id(5), { deleted_at: 'deleted' }),
      node(id(6), { scope: 'invalid' }), node(id(7), { scope: 'account_template', work_id: null, node_type: 'folder' }));
    const result = payload(await search('  '));
    expect(result).toMatchObject({ offset: 0, limit: 20, nextOffset: null });
    expect(result.items.map((n: Row) => n.id).sort()).toEqual([NODE, SHARED].sort());
    expect(result.items.find((n: Row) => n.id === NODE)).toEqual({ id: NODE, name: '설정', scope: 'work', category: 'custom', matchedIn: [], snippet: '설정 본문 [[연결]]' });
    for (const c of calls.filter((c) => c.table === 'kb_nodes')) {
      expect(c.filters).toEqual(expect.arrayContaining([['eq', 'owner_id', USER], ['eq', 'node_type', 'file'], ['is', 'deleted_at', null]]));
      expect(c.filters).toContainEqual(['eq', 'scope', c.filters.some((f) => f[1] === 'work_id') ? 'work' : 'account_template']);
    }
  });

  it('reuses title search, merges body matches by ID and returns match context', async () => {
    const spy = vi.spyOn(mentions, 'searchMentionNodes');
    const { rows, search } = tools();
    rows.kb_nodes = [node(NODE, { name: 'needle title', content: 'needle body' }), node(SHARED, { name: 'shared', content: 'prefix needle suffix', scope: 'account_template', work_id: null }), node(id(1), { name: 'needle only', content: 'other' })];
    const result = payload(await search(' needle '));
    expect(spy).toHaveBeenCalled();
    expect(result.items).toHaveLength(3);
    expect(result.items.find((n: Row) => n.id === NODE).matchedIn).toEqual(['title', 'body']);
    expect(result.items.find((n: Row) => n.id === SHARED)).toMatchObject({ matchedIn: ['body'], snippet: expect.stringContaining('needle') });
    expect(result.items.find((n: Row) => n.id === id(1)).matchedIn).toEqual(['title']);
    expect(JSON.stringify(result)).not.toMatch(/owner_id|work_id|deleted_at/);
  });

  it.each(['%', '_', '\\', ',', '(', ')', 'x),owner_id.eq.other', 'a\\%_b', 'a*b'])('treats %j literally in both title and body filters', async (query) => {
    const { rows, search, calls } = tools();
    rows.kb_nodes = [node(NODE, { name: `title ${query}`, content: 'other' }), node(SHARED, { name: 'other', content: `body ${query}` }), node(id(1), { name: 'unrelated aZZb', content: 'unrelated aZZb' })];
    const result = payload(await search(query));
    expect(result.items.map((n: Row) => n.id).sort()).toEqual([NODE, SHARED].sort());
    expect(calls.some((c) => c.filters.some(([op]) => op === 'or'))).toBe(false);
  });

  it('searches the title of work template files within the allowed file scope', async () => {
    const { rows, search } = tools();
    rows.kb_nodes = [node(NODE, { name: 'template needle', category: 'template', content: 'unrelated' })];
    expect(payload(await search('needle')).items).toEqual([
      { id: NODE, name: 'template needle', category: 'template', scope: 'work', matchedIn: ['title'], snippet: 'template needle' },
    ]);
  });

  it.each(['', 'needle'])('reads body/list DB pages beyond 100 and bounds snippets around matches (%j)', async (query) => {
    const { rows, search, calls } = tools();
    rows.kb_nodes = Array.from({ length: 205 }, (_, i) => node(id(i), { name: 'same', content: `${'앞'.repeat(400)}needle${'뒤'.repeat(400)}` })).reverse();
    const result = payload(await search(query, { offset: 190, limit: 20 }));
    expect(result.items.map((n: Row) => n.id)).toEqual(Array.from({ length: 15 }, (_, i) => id(i + 190)));
    expect(result.nextOffset).toBeNull();
    expect(result.items[0].snippet.length).toBeLessThanOrEqual(240);
    if (query) expect(result.items[0].snippet).toContain('needle');
    expect(calls.some((c) => c.range?.[0] === 200)).toBe(true);
  });

  it.each(['', 'needle'])('paginates beyond the mention helper 20-row cap, with stable name and ID ties (%j)', async (query) => {
    const { rows, search } = tools();
    rows.kb_nodes = Array.from({ length: 65 }, (_, i) => node(id(i), { name: 'needle', content: 'body' })).reverse();
    rows.kb_nodes.push(node(SHARED, { name: 'needle', scope: 'account_template', work_id: null, content: 'body' }));
    const first = payload(await search(query));
    expect(first.items.map((n: Row) => n.id)).toEqual(Array.from({ length: 20 }, (_, i) => id(i)));
    expect(first.nextOffset).toBe(20);
    const last = payload(await search(query, { offset: 50, limit: 50 }));
    expect(last.items.map((n: Row) => n.id)).toEqual([...Array.from({ length: 15 }, (_, i) => id(i + 50)), SHARED]);
    expect(last).toMatchObject({ offset: 50, limit: 50, nextOffset: null });
    expect(payload(await search(query, { offset: 100 })).items).toEqual([]);
  });

  it('enforces ownership in the reverse user direction too', async () => {
    const { rows, search } = tools();
    rows.kb_nodes.push(node(id(1), { owner_id: OTHER, work_id: FOREIGN }), node(id(2), { owner_id: OTHER, scope: 'account_template', work_id: null }));
    const result = payload(await search('', { workId: FOREIGN }, context(OTHER)));
    expect(result.items.map((n: Row) => n.id).sort()).toEqual([id(1), id(2)]);
  });

  it.each(['work', 'title-work', 'title-shared', 'body-work', 'body-shared', 'empty-work', 'empty-shared'])('fails closed for %s errors, even with returned rows', async (stage) => {
    for (const mode of ['error', 'throw', 'null', 'malformed']) {
      const { search, setFault } = tools();
      setFault((c) => {
        const scope = c.filters.find((f) => f[1] === 'scope')?.[2] === 'account_template' ? 'shared' : 'work';
        const field = c.filters.find((f) => f[0] === 'ilike')?.[1];
        const actual = c.table === 'works' ? 'work' : `${field === 'name' ? 'title' : field === 'content' ? 'body' : 'empty'}-${scope}`;
        if (actual !== stage) return;
        return mode === 'throw' ? new Error(SECRET) : mode === 'error' ? { data: [node()], error: { message: SECRET } } : { data: mode === 'null' ? null : [{}], error: null };
      });
      safeError(await search(stage.startsWith('empty') ? '' : '설정'));
    }
  });
});

describe('get_kb_document', () => {
  it('registers exactly two strict read-only tools with titles', () => {
    const { registered } = tools();
    expect([...registered.keys()]).toEqual(['search_kb', 'get_kb_document']);
    for (const { config } of registered.values()) {
      expect(config.title.length).toBeGreaterThan(0);
      expect(config.annotations).toEqual({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
      expect(config.inputSchema.safeParse({ workId: WORK, nodeId: NODE, userId: USER }).success).toBe(false);
    }
  });

  it.each([{ nodeId: 'bad' }, { workId: 'bad' }, { userId: OTHER }, { offset: -1 }, { offset: 0.5 }, { offset: Number.MAX_SAFE_INTEGER }, { maxChars: 0 }, { maxChars: 50001 }, { maxChars: 1.5 }, { maxChars: '20' }])('rejects invalid input %j before data access', async (extra) => {
    const { call, from } = tools();
    safeError(await call('get_kb_document', { workId: WORK, nodeId: NODE, ...extra }));
    expect(from).not.toHaveBeenCalled();
  });

  it('requires nodeId and workId and enforces identity and read grant', async () => {
    const { call, from } = tools();
    safeError(await call('get_kb_document', { workId: WORK }));
    safeError(await call('get_kb_document', { nodeId: NODE }));
    safeError(await call('get_kb_document', { workId: WORK, nodeId: NODE }, {}));
    safeError(await call('get_kb_document', { workId: WORK, nodeId: NODE }, context(USER, [])));
    expect(from).not.toHaveBeenCalled();
  });

  it.each([NODE, SHARED])('reuses one-ID mention content for %s and preserves wiki links', async (nodeId) => {
    const spy = vi.spyOn(mentions, 'getMentionedNodesContent');
    const { call, calls } = tools();
    const result = payload(await call('get_kb_document', { workId: WORK, nodeId }));
    expect(spy).toHaveBeenCalledExactlyOnceWith(expect.anything(), { ownerId: USER, workId: WORK, nodeIds: [nodeId] });
    expect(result).toEqual({ id: nodeId, workId: WORK, name: nodeId === NODE ? '설정' : '공유 설정',
      scope: nodeId === NODE ? 'work' : 'account_template', category: nodeId === NODE ? 'custom' : 'template',
      content: '설정 본문 [[연결]]', offset: 0, maxChars: 20000, totalChars: 12, nextOffset: null, truncated: false,
      contentHash: sha('설정 본문 [[연결]]') });
    for (const c of calls.filter((c) => c.table === 'kb_nodes')) {
      expect(c.filters).toEqual(expect.arrayContaining([['eq', 'owner_id', USER], ['eq', 'node_type', 'file'], ['is', 'deleted_at', null]]));
      expect(c.filters).toContainEqual(['eq', 'scope', c.filters.some((f) => f[1] === 'work_id') ? 'work' : 'account_template']);
    }
  });

  it.each(['folder', 'deleted', 'foreign', 'foreign-shared', 'wrong-work', 'wrong-scope', 'absent'])('returns the identical missing response for %s without reading content', async (kind) => {
    const spy = vi.spyOn(mentions, 'getMentionedNodesContent');
    const { call, rows } = tools();
    const target = rows.kb_nodes[0];
    if (kind === 'folder') target.node_type = 'folder';
    if (kind === 'deleted') target.deleted_at = 'deleted';
    if (kind === 'foreign') target.owner_id = OTHER;
    if (kind === 'foreign-shared') Object.assign(target, { owner_id: OTHER, scope: 'account_template', work_id: null });
    if (kind === 'wrong-work') target.work_id = FOREIGN;
    if (kind === 'wrong-scope') target.scope = 'invalid';
    if (kind === 'absent') rows.kb_nodes = [];
    const result = await call('get_kb_document', { workId: WORK, nodeId: NODE });
    expect(result).toEqual({ isError: true, content: [{ type: 'text', text: '요청한 항목을 찾을 수 없습니다.' }] });
    expect(spy).not.toHaveBeenCalled();
  });

  it.each(['foreign', 'deleted', 'absent'])('verifies the work before reading even account shared content (%s)', async (kind) => {
    const { call, rows, calls } = tools();
    if (kind === 'foreign') rows.works[0].owner_id = OTHER;
    if (kind === 'deleted') rows.works[0].deleted_at = 'deleted';
    if (kind === 'absent') rows.works = [];
    const result = await call('get_kb_document', { workId: WORK, nodeId: SHARED });
    expect(result.content[0].text).toBe('요청한 항목을 찾을 수 없습니다.');
    expect(result.isError).toBe(true);
    expect(calls.map((c) => c.table)).toEqual(['works']);
  });

  it('returns caller B files and hides caller A files in the reverse direction', async () => {
    const { call, rows } = tools();
    rows.kb_nodes.push(node(id(1), { owner_id: OTHER, work_id: FOREIGN, content: 'B only' }));
    expect(payload(await call('get_kb_document', { workId: FOREIGN, nodeId: id(1) }, context(OTHER))).content).toBe('B only');
    const denied = await call('get_kb_document', { workId: FOREIGN, nodeId: NODE }, context(OTHER));
    safeError(denied);
    expect(denied.content[0].text).toBe('요청한 항목을 찾을 수 없습니다.');
  });

  it('paginates long bodies with defaults, maximum, continuation and beyond-end offsets', async () => {
    const { rows, call } = tools();
    const content = '가'.repeat(60001);
    rows.kb_nodes[0].content = content;
    const read = (extra: Row = {}) => call('get_kb_document', { workId: WORK, nodeId: NODE, ...extra });
    expect(payload(await read())).toMatchObject({ content: content.slice(0, 20000), offset: 0, maxChars: 20000, totalChars: 60001, nextOffset: 20000, truncated: true });
    expect(payload(await read({ offset: 10000, maxChars: 50000 }))).toMatchObject({ content: content.slice(10000, 60000), nextOffset: 60000, truncated: true });
    expect(payload(await read({ offset: 60000 }))).toMatchObject({ content: '가', nextOffset: null, truncated: false });
    for (const offset of [60001, 70000]) expect(payload(await read({ offset }))).toMatchObject({ content: '', offset, nextOffset: null, truncated: false });
  });

  it.each([
    ['한글', '가'.repeat(60001)], ['CRLF', 'a\r\nb\r\n\r\nc'], ['CR/LF 혼합', 'a\rb\nc\r\n'],
    ['이모지', 'A😀B🚀C'], ['빈 본문', ''], ['NFD', '\u1100\u1161 e\u0301'],
  ])('contentHash는 정규화 없는 전체 원문의 SHA-256이며 페이지와 무관하다 (%s)', async (_label, content) => {
    const { call, rows } = tools();
    rows.kb_nodes[0].content = content;
    const expected = sha(content);
    expect(expected).toMatch(/^[0-9a-f]{64}$/);
    const total = content.length;
    for (const args of [{}, { offset: 0, maxChars: 1 }, { offset: Math.floor(total / 2), maxChars: 3 }, { offset: Math.max(0, total - 1), maxChars: 5 }, { offset: total + 10 }]) {
      expect(payload(await call('get_kb_document', { workId: WORK, nodeId: NODE, ...args })).contentHash).toBe(expected);
    }
  });

  it('KB content가 null이면 빈 문자열의 해시를 반환한다', async () => {
    const { call, rows } = tools();
    rows.kb_nodes[0].content = null;
    expect(payload(await call('get_kb_document', { workId: WORK, nodeId: NODE })).contentHash).toBe(sha(''));
  });

  it('계정 공유 파일도 같은 해시 규칙을 따르고 접근 불가 파일은 해시를 노출하지 않는다', async () => {
    const { call, rows } = tools();
    rows.kb_nodes[1].content = '공유\r\n본문';
    expect(payload(await call('get_kb_document', { workId: WORK, nodeId: SHARED })).contentHash).toBe(sha('공유\r\n본문'));
    rows.kb_nodes[0].owner_id = OTHER;
    const denied = await call('get_kb_document', { workId: WORK, nodeId: NODE });
    expect(denied.isError).toBe(true);
    expect(JSON.stringify(denied)).not.toMatch(/contentHash|[0-9a-f]{64}/);
  });

  it.each(['', null])('returns a genuine empty document for %j content', async (content) => {
    const { call, rows } = tools();
    rows.kb_nodes[0].content = content;
    expect(payload(await call('get_kb_document', { workId: WORK, nodeId: NODE }))).toMatchObject({ content: '', totalChars: 0, nextOffset: null, truncated: false });
  });

  it.each([
    [0, 2, 'A', 0, 1], [1, 1, '😀', 1, 3], [2, 1, '😀', 1, 3],
    [2, 2, '😀', 1, 3], [4, 1, '🚀', 4, 6], [5, 1, '🚀', 4, 6], [6, 1, 'C', 6, null],
    [0, 7, 'A😀B🚀C', 0, null],
  ])('keeps emoji pairs intact at offset %i/maxChars %i', async (offset, maxChars, content, actualOffset, nextOffset) => {
    const { call, rows } = tools();
    rows.kb_nodes[0].content = 'A😀B🚀C';
    expect(payload(await call('get_kb_document', { workId: WORK, nodeId: NODE, offset, maxChars })))
      .toMatchObject({ content, offset: actualOffset, maxChars, totalChars: 7, nextOffset, truncated: nextOffset !== null });
  });

  it.each(['work', 'metadata-work', 'metadata-shared', 'content-work', 'content-shared'])('fails closed at %s on DB errors or malformed results', async (stage) => {
    for (const mode of ['error', 'throw', 'null', 'malformed']) {
      const { call, setFault } = tools();
      setFault((c) => {
        const scope = c.filters.find((f) => f[1] === 'scope')?.[2] === 'account_template' ? 'shared' : 'work';
        const actual = c.table === 'works' ? 'work' : `${c.columns?.split(',').some((v) => v.trim() === 'content') ? 'content' : 'metadata'}-${scope}`;
        if (stage !== actual) return;
        return mode === 'throw' ? new Error(SECRET) : mode === 'error' ? { data: c.single ? node() : [node()], error: { message: SECRET } }
          : { data: mode === 'null' ? null : c.single ? {} : [{}], error: null };
      });
      const result = await call('get_kb_document', { workId: WORK, nodeId: stage.endsWith('shared') ? SHARED : NODE });
      safeError(result);
      if (mode === 'error' || mode === 'throw') expect(result.content[0].text).toBe('데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    }
  });

  it.each([{ docs: [] }, { docs: [{ id: ABSENT, name: 'wrong', category: 'custom', content: 'secret' }] }, { docs: [null] }])('rejects missing or mismatched content helper IDs (%j)', async ({ docs }) => {
    const { call } = tools();
    vi.spyOn(mentions, 'getMentionedNodesContent').mockResolvedValue(docs as never);
    safeError(await call('get_kb_document', { workId: WORK, nodeId: NODE }));
  });

  it('rechecks file/scope/deletion on the actual content queries after metadata lookup', async () => {
    for (const change of [{ node_type: 'folder' }, { scope: 'invalid' }, { deleted_at: 'deleted' }, { owner_id: OTHER }, { work_id: FOREIGN }]) {
      const { call, rows, setFault } = tools();
      setFault((c) => {
        if (c.columns?.split(',').some((v) => v.trim() === 'content')) Object.assign(rows.kb_nodes[0], change);
        return undefined;
      });
      const result = await call('get_kb_document', { workId: WORK, nodeId: NODE });
      expect(result).toEqual({ isError: true, content: [{ type: 'text', text: '요청한 항목을 찾을 수 없습니다.' }] });
    }
  });
});
