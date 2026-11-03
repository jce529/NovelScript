import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { McpServer, type AuthInfo } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { createMcpDbClient } from '@/lib/mcp/db-client';
import { withMcpReadTool, type McpToolContext } from '@/lib/mcp/tool-runtime';
import { registerWorkTools } from '@/lib/mcp/tools/works';

const fake = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: fake.createClient }));

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SESSION = '33333333-3333-4333-8333-333333333333';
const BEARER = 'unit-caller-bearer';
const URL = 'https://unit-ref.supabase.test';
const SENSITIVE = 'SELECT secret FROM chapters; SQL 42501 permission denied';

function auth(overrides: Partial<AuthInfo> = {}): AuthInfo {
  return {
    token: BEARER, clientId: OTHER, scopes: ['read'],
    extra: { userId: USER, sessionId: SESSION, grantScopes: ['read'] }, ...overrides,
  };
}
function context(info: AuthInfo = auth()): McpToolContext {
  return { http: { authInfo: info } };
}
function expectSafeError(result: { isError?: boolean; content: { text: string }[] }) {
  expect(result.isError).toBe(true);
  expect(result.content).toHaveLength(1);
  expect(result.content[0].text).toMatch(/[가-힣]/);
  expect(JSON.stringify(result)).not.toMatch(/SELECT|chapters|SQL|42501|permission|unit-caller-bearer/);
}

beforeEach(() => {
  fake.createClient.mockReset().mockReturnValue({ marker: 'caller-scoped-db' });
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', URL);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-unit');
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('bearer-only MCP database client', () => {
  it('uses only the public key and the caller bearer, without session persistence', () => {
    const db = createMcpDbClient(BEARER);
    expect(db).toEqual({ marker: 'caller-scoped-db' });
    expect(fake.createClient).toHaveBeenCalledExactlyOnceWith(URL, 'anon-unit', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${BEARER}` }, fetch: expect.any(Function) },
    });
  });

  it('creates a separate client for each bearer and does not log tokens', () => {
    const log = vi.spyOn(console, 'log');
    const warn = vi.spyOn(console, 'warn');
    const error = vi.spyOn(console, 'error');
    createMcpDbClient(BEARER);
    createMcpDbClient('another-bearer');
    expect(fake.createClient.mock.calls.map((call) => call[2].global.headers.Authorization))
      .toEqual([`Bearer ${BEARER}`, 'Bearer another-bearer']);
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it.each(['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'])('rejects missing %s', (key) => {
    vi.stubEnv(key, '');
    expect(() => createMcpDbClient(BEARER)).toThrow();
    expect(fake.createClient).not.toHaveBeenCalled();
  });

  it.each(['', 'x'.repeat(8193)])('rejects an empty or oversized bearer', (bearer) => {
    expect(() => createMcpDbClient(bearer)).toThrow();
    expect(fake.createClient).not.toHaveBeenCalled();
  });
});

describe('shared MCP read tool boundary', () => {
  const schema = z.strictObject({});

  it.each([{}, { http: {} }, { http: { authInfo: auth({ extra: {} }) } }])(
    'rejects missing or malformed verified identity before touching data (%j)', async (ctx) => {
      const handler = vi.fn();
      expectSafeError(await withMcpReadTool(schema, handler)({}, ctx));
      expect(handler).not.toHaveBeenCalled();
      expect(fake.createClient).not.toHaveBeenCalled();
    },
  );

  it('requires the read grant, even when the outer scopes claim read', async () => {
    const handler = vi.fn();
    const ctx = context(auth({ extra: { userId: USER, sessionId: SESSION, grantScopes: ['propose_draft'] } }));
    expectSafeError(await withMcpReadTool(schema, handler)({}, ctx));
    expect(handler).not.toHaveBeenCalled();
    expect(fake.createClient).not.toHaveBeenCalled();
  });

  it('requires the verified bearer', async () => {
    const handler = vi.fn();
    expectSafeError(await withMcpReadTool(schema, handler)({}, context(auth({ token: '' }))));
    expect(handler).not.toHaveBeenCalled();
    expect(fake.createClient).not.toHaveBeenCalled();
  });

  it('derives the user exclusively from AuthInfo and rejects a userId argument', async () => {
    const handler = vi.fn(async (_input, runtime) => ({ owner: runtime.userId }));
    const run = withMcpReadTool(schema, handler);
    expectSafeError(await run({ userId: OTHER }, context()));
    expect(handler).not.toHaveBeenCalled();
    expect(fake.createClient).not.toHaveBeenCalled();
    const result = await run({}, context());
    expect(result.isError).not.toBe(true);
    expect(JSON.parse(result.content[0].text)).toEqual({ owner: USER });
    expect(handler.mock.calls[0][1].db).toEqual({ marker: 'caller-scoped-db' });
  });

  it.each([new Error(SENSITIVE), { message: SENSITIVE }, SENSITIVE])('sanitizes thrown data errors (%j)', async (error) => {
    const log = vi.spyOn(console, 'error');
    const run = withMcpReadTool(schema, async () => { throw error; });
    expectSafeError(await run({}, context()));
    expect(log).not.toHaveBeenCalled();
  });

  it('sanitizes client construction failure', async () => {
    fake.createClient.mockImplementation(() => { throw new Error(`${SENSITIVE} ${BEARER}`); });
    const handler = vi.fn();
    expectSafeError(await withMcpReadTool(schema, handler)({}, context()));
    expect(handler).not.toHaveBeenCalled();
  });
});

// In-memory PostgREST double: executes predicates/order/range rather than
// returning canned successes, so a missing ownership or deletion filter leaks.
const WORK = '44444444-4444-4444-8444-444444444444';
const FOREIGN_WORK = '55555555-5555-4555-8555-555555555555';
const CHAPTER = '66666666-6666-4666-8666-666666666666';
const ABSENT = '77777777-7777-4777-8777-777777777777';
type Row = Record<string, unknown>;
type QueryCall = { table: string; select?: string; filters: [string, unknown][]; orders: [string, boolean][]; range?: [number, number]; single?: boolean };
type DbResponse = { data: unknown; error: unknown };

function work(id = WORK, owner = USER, extras: Row = {}): Row {
  return { id, owner_id: owner, deleted_at: null, title: '작품', synopsis: null,
    cover_image_url: null, genre: null, created_at: '2026-11-01T00:00:00Z', ...extras };
}
function chapter(id = CHAPTER, workId = WORK, extras: Row = {}): Row {
  return { id, work_id: workId, deleted_at: null, title: '회차', order_index: 0,
    is_published: false, price_tier: null, published_at: null, updated_at: '2026-11-01T00:00:00Z',
    content: '작가의 비공개 본문', admin_blinded: false, ...extras };
}
function database() {
  const rows: Record<string, Row[]> = {
    works: [work(), work(FOREIGN_WORK, OTHER)],
    chapters: [chapter(), chapter(ABSENT, FOREIGN_WORK, { content: '타인 본문' })],
  };
  const calls: QueryCall[] = [];
  const failures = new Map<string, DbResponse | Error>();
  const rpc = vi.fn(async (name: string, args: { p_chapter_id: string }): Promise<DbResponse> => {
    expect(name).toBe('mcp_read_owned_chapter_content');
    expect(Object.keys(args)).toEqual(['p_chapter_id']);
    const failure = failures.get('rpc');
    if (failure instanceof Error) throw failure;
    if (failure) return failure;
    return { data: rows.chapters.find((row) => row.id === args.p_chapter_id)?.content ?? null, error: null };
  });
  const from = vi.fn((table: string) => {
    const call: QueryCall = { table, filters: [], orders: [] };
    calls.push(call);
    const execute = (): DbResponse => {
      const failure = failures.get(`${table}:${call.single ? 'single' : 'list'}`);
      if (failure instanceof Error) throw failure;
      if (failure) return failure;
      let result = (rows[table] ?? []).filter((row) => call.filters.every(([key, value]) => row[key] === value));
      result = result.slice().sort((a, b) => {
        for (const [key, ascending] of call.orders) {
          const cmp = a[key] === b[key] ? 0 : a[key]! < b[key]! ? -1 : 1;
          if (cmp) return ascending ? cmp : -cmp;
        }
        return 0;
      });
      if (call.range) result = result.slice(call.range[0], call.range[1] + 1);
      const columns = call.select?.split(',').map((key) => key.trim()) ?? [];
      const projected = result.map((row) => Object.fromEntries(columns.map((key) => [key, row[key]])));
      return { data: call.single ? projected[0] ?? null : projected, error: null };
    };
    const query = {
      select(columns: string) { call.select = columns; return query; },
      eq(key: string, value: unknown) { call.filters.push([key, value]); return query; },
      is(key: string, value: unknown) { call.filters.push([key, value]); return query; },
      order(key: string, options: { ascending: boolean }) { call.orders.push([key, options.ascending]); return query; },
      range(start: number, end: number) { call.range = [start, end]; return query; },
      async maybeSingle() { call.single = true; return execute(); },
      then(resolve: (value: DbResponse) => unknown, reject: (error: unknown) => unknown) {
        return Promise.resolve().then(execute).then(resolve, reject);
      },
    };
    return query;
  });
  fake.createClient.mockReturnValue({ from, rpc });
  return { rows, calls, failures, from, rpc };
}

function tools() {
  const db = database();
  const registered = new Map<string, {
    config: { title: string; inputSchema: z.ZodType; annotations: Record<string, unknown> };
    run: (args: unknown, ctx: McpToolContext) => Promise<{ isError?: boolean; content: { type: 'text'; text: string }[] }>;
  }>();
  // Register with the real installed SDK too, to verify compatibility without HTTP.
  const server = new McpServer({ name: 'unit-work-tools', version: '1.0.0' });
  const original = server.registerTool.bind(server);
  vi.spyOn(server, 'registerTool').mockImplementation((...args: Parameters<typeof original>) => {
    const [name, config, run] = args;
    registered.set(name, { config, run } as unknown as ReturnType<typeof registered.get> & {});
    return original(...args);
  });
  registerWorkTools(server);
  const call = (name: string, args: unknown = {}, ctx = context()) => registered.get(name)!.run(args, ctx);
  return { ...db, registered, call };
}
function payload(result: { isError?: boolean; content: { text: string }[] }) {
  expect(result.isError).not.toBe(true);
  return JSON.parse(result.content[0].text);
}

describe('MCP owned work tools', () => {
  it('registers exactly three strict read-only tools with titles and four annotations', () => {
    const { registered } = tools();
    expect([...registered.keys()]).toEqual(['list_works', 'list_chapters', 'get_chapter']);
    for (const { config } of registered.values()) {
      expect(config.title.length).toBeGreaterThan(0);
      expect(config.annotations).toEqual({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
    }
  });

  it.each([
    ['list_works', { userId: OTHER }], ['list_chapters', { workId: WORK, userId: OTHER }],
    ['get_chapter', { workId: WORK, chapterId: CHAPTER, userId: OTHER }],
    ['list_works', { limit: 51 }], ['list_works', { limit: 0 }], ['list_works', { offset: -1 }],
    ['list_works', { limit: 1.5 }], ['list_works', { offset: '0' }],
    ['list_chapters', { workId: 'not-a-uuid' }], ['list_chapters', { workId: WORK, limit: 51 }],
    ['list_chapters', { workId: WORK, offset: -1 }], ['list_chapters', {}],
    ['get_chapter', { workId: WORK, chapterId: 'bad' }], ['get_chapter', { workId: 'bad', chapterId: CHAPTER }],
    ['get_chapter', { workId: WORK, chapterId: CHAPTER, maxChars: 50001 }],
    ['get_chapter', { workId: WORK, chapterId: CHAPTER, maxChars: 0 }],
    ['get_chapter', { workId: WORK, chapterId: CHAPTER, offset: -1 }],
    ['get_chapter', { workId: WORK, chapterId: CHAPTER, offset: 0.5 }],
  ])('rejects invalid %s input %j before DB access', async (name, args) => {
    const { call, registered } = tools();
    expect(registered.get(name)!.config.inputSchema.safeParse(args).success).toBe(false);
    expectSafeError(await call(name, args));
    expect(fake.createClient).not.toHaveBeenCalled();
  });

  it.each(['list_works', 'list_chapters', 'get_chapter'])('guards %s with AuthInfo and read grant', async (name) => {
    const { call, from, rpc } = tools();
    const args = { list_works: {}, list_chapters: { workId: WORK }, get_chapter: { workId: WORK, chapterId: CHAPTER } }[name]!;
    expectSafeError(await call(name, args, {}));
    expectSafeError(await call(name, args, context(auth({ extra: { userId: USER, sessionId: SESSION, grantScopes: [] } }))));
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('lists only live owned works, defaulting to 20 with stable database pagination', async () => {
    const { rows, call, calls } = tools();
    rows.works = Array.from({ length: 55 }, (_, i) => work(`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)).reverse();
    rows.works.push(work(FOREIGN_WORK, OTHER), work(ABSENT, USER, { deleted_at: '2026-11-02' }));
    const first = payload(await call('list_works'));
    expect(first).toMatchObject({ offset: 0, limit: 20, nextOffset: 20 });
    expect(first.items).toHaveLength(20);
    expect(first.items.map((row: Row) => row.id)).toEqual(rows.works.slice(35, 55).reverse().map((row) => row.id));
    expect(first.items[0]).toEqual({ id: rows.works[54].id, title: '작품', synopsis: null, coverImageUrl: null, genre: null, createdAt: '2026-11-01T00:00:00Z' });
    const last = payload(await call('list_works', { offset: 50, limit: 50 }));
    expect(last.items).toHaveLength(5);
    expect(last.nextOffset).toBeNull();
    expect(calls[0]).toMatchObject({ filters: [['owner_id', USER], ['deleted_at', null]], orders: [['created_at', false], ['id', true]], range: [0, 20] });
    expect(calls[1].range).toEqual([50, 100]);
  });

  it('orders works by newest date before the id tie-breaker, and supports empty pages', async () => {
    const { rows, call } = tools();
    rows.works.push(work(ABSENT, USER, { created_at: '2026-11-02T00:00:00Z' }));
    expect(payload(await call('list_works')).items.map((row: Row) => row.id)).toEqual([ABSENT, WORK]);
    expect(payload(await call('list_works', { offset: 100 }))).toEqual({ items: [], offset: 100, limit: 20, nextOffset: null });
    rows.works = [];
    expect(payload(await call('list_works')).items).toEqual([]);
  });

  it('lists draft, unpublished, paid and blinded chapters without state filters', async () => {
    const { rows, call, calls } = tools();
    rows.chapters = [
      chapter(CHAPTER, WORK, { order_index: 3 }),
      chapter(ABSENT, WORK, { order_index: 1, is_published: true, price_tier: 100, admin_blinded: true }),
      chapter(FOREIGN_WORK, WORK, { order_index: 2, is_published: false }),
      chapter(OTHER, FOREIGN_WORK), chapter(SESSION, WORK, { deleted_at: '2026-11-02' }),
    ];
    const result = payload(await call('list_chapters', { workId: WORK }));
    expect(result).toMatchObject({ offset: 0, limit: 20, nextOffset: null });
    expect(result.items.map((row: Row) => row.id)).toEqual([ABSENT, FOREIGN_WORK, CHAPTER]);
    expect(result.items[0]).toEqual({ id: ABSENT, workId: WORK, title: '회차', orderIndex: 1,
      isPublished: true, priceTier: 100, publishedAt: null, updatedAt: '2026-11-01T00:00:00Z' });
    expect(calls[1]).toMatchObject({ filters: [['work_id', WORK], ['deleted_at', null]], orders: [['order_index', true], ['id', true]], range: [0, 20] });
    expect(calls[1].select).not.toMatch(/content|\*/);
  });

  it('paginates chapters with stable ties and the same 20/50 limits', async () => {
    const { rows, call } = tools();
    rows.chapters = Array.from({ length: 52 }, (_, i) => chapter(`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)).reverse();
    const first = payload(await call('list_chapters', { workId: WORK }));
    expect(first.items).toHaveLength(20);
    expect(first.nextOffset).toBe(20);
    expect(first.items[0].id).toBe(rows.chapters[51].id);
    const last = payload(await call('list_chapters', { workId: WORK, offset: 50, limit: 50 }));
    expect(last.items.map((row: Row) => row.id)).toEqual(rows.chapters.slice(0, 2).reverse().map((row) => row.id));
    expect(last.nextOffset).toBeNull();
  });

  it('checks work ownership and chapter membership before the owner-only body RPC', async () => {
    const { call, calls, rpc } = tools();
    rpc.mockImplementationOnce(async () => {
      expect(calls).toHaveLength(2);
      expect(calls[0]).toMatchObject({ table: 'works', filters: [['id', WORK], ['owner_id', USER], ['deleted_at', null]], single: true });
      expect(calls[1]).toMatchObject({ table: 'chapters', filters: [['id', CHAPTER], ['work_id', WORK], ['deleted_at', null]], single: true });
      return { data: '비공개 본문', error: null };
    });
    expect(payload(await call('get_chapter', { workId: WORK, chapterId: CHAPTER }))).toEqual({
      id: CHAPTER, workId: WORK, title: '회차', content: '비공개 본문', offset: 0, maxChars: 20000,
      totalChars: 6, nextOffset: null, truncated: false,
    });
    expect(rpc).toHaveBeenCalledExactlyOnceWith('mcp_read_owned_chapter_content', { p_chapter_id: CHAPTER });
  });

  it.each([
    { is_published: false }, { is_published: true, price_tier: 100 }, { admin_blinded: true },
  ])('reads owned chapter bodies irrespective of state %j', async (state) => {
    const { rows, call } = tools();
    Object.assign(rows.chapters[0], state);
    expect(payload(await call('get_chapter', { workId: WORK, chapterId: CHAPTER })).content).toBe('작가의 비공개 본문');
  });

  it('bounds body pages to 20000 by default and 50000 explicitly, returning continuation metadata', async () => {
    const { rows, call } = tools();
    rows.chapters[0].content = '한'.repeat(60001);
    const first = payload(await call('get_chapter', { workId: WORK, chapterId: CHAPTER }));
    expect(first.content).toBe('한'.repeat(20000));
    expect(first).toMatchObject({ totalChars: 60001, nextOffset: 20000, truncated: true });
    const large = payload(await call('get_chapter', { workId: WORK, chapterId: CHAPTER, offset: 1, maxChars: 50000 }));
    expect(large.content).toHaveLength(50000);
    expect(large).toMatchObject({ offset: 1, maxChars: 50000, nextOffset: 50001, truncated: true });
    const last = payload(await call('get_chapter', { workId: WORK, chapterId: CHAPTER, offset: 60000 }));
    expect(last).toMatchObject({ content: '한', totalChars: 60001, nextOffset: null, truncated: false });
    const beyond = payload(await call('get_chapter', { workId: WORK, chapterId: CHAPTER, offset: 70000 }));
    expect(beyond).toMatchObject({ content: '', totalChars: 60001, nextOffset: null, truncated: false });
    rows.chapters[0].content = '';
    expect(payload(await call('get_chapter', { workId: WORK, chapterId: CHAPTER }))).toMatchObject({ content: '', totalChars: 0, nextOffset: null, truncated: false });
  });

  it('never splits a surrogate pair at a page start or end', async () => {
    const { rows, call } = tools();
    rows.chapters[0].content = 'a😀b😀c';
    const read = async (args: Record<string, unknown>) => payload(await call('get_chapter', { workId: WORK, chapterId: CHAPTER, ...args }));
    const first = await read({ maxChars: 2 });
    expect(first).toMatchObject({ content: 'a', offset: 0, nextOffset: 1, truncated: true });
    const second = await read({ offset: first.nextOffset, maxChars: 2 });
    expect(second).toMatchObject({ content: '😀', offset: 1, nextOffset: 3, truncated: true });
    const mid = await read({ offset: 2, maxChars: 3 });
    expect(mid).toMatchObject({ content: '😀b', offset: 1, nextOffset: 4, truncated: true });
    const tiny = await read({ offset: 1, maxChars: 1 });
    expect(tiny).toMatchObject({ content: '😀', offset: 1, nextOffset: 3, truncated: true });
    const pages: string[] = [];
    let offset: number | null = 0;
    while (offset !== null) {
      const page: { content: string; nextOffset: number | null } = await read({ offset, maxChars: 2 });
      pages.push(page.content);
      offset = page.nextOffset;
    }
    expect(pages.join('')).toBe('a😀b😀c');
    for (const page of pages) expect(page).toBe(page.toWellFormed());
  });

  it('makes foreign, cross-work, deleted and absent IDs indistinguishable without calling the body RPC', async () => {
    const { rows, call, rpc } = tools();
    const responses = [
      await call('list_chapters', { workId: FOREIGN_WORK }),
      await call('list_chapters', { workId: ABSENT }),
      await call('get_chapter', { workId: FOREIGN_WORK, chapterId: ABSENT }),
      await call('get_chapter', { workId: WORK, chapterId: ABSENT }),
      await call('get_chapter', { workId: WORK, chapterId: SESSION }),
    ];
    rows.chapters[0].deleted_at = '2026-11-02';
    responses.push(await call('get_chapter', { workId: WORK, chapterId: CHAPTER }));
    rows.works[0].deleted_at = '2026-11-02';
    responses.push(await call('list_chapters', { workId: WORK }), await call('get_chapter', { workId: WORK, chapterId: CHAPTER }));
    for (const result of responses) {
      expectSafeError(result);
      expect(result).toEqual(responses[0]);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it('uses the second verified user when accessing first-user resources', async () => {
    const { call, rpc } = tools();
    const second = context(auth({ token: 'second-bearer', extra: { userId: OTHER, sessionId: SESSION, grantScopes: ['read'] } }));
    expect(payload(await call('list_works', {}, second)).items.map((row: Row) => row.id)).toEqual([FOREIGN_WORK]);
    expectSafeError(await call('list_chapters', { workId: WORK }, second));
    expectSafeError(await call('get_chapter', { workId: WORK, chapterId: CHAPTER }, second));
    expect(rpc).not.toHaveBeenCalled();
    expect(fake.createClient.mock.calls.every((args) => args[2].global.headers.Authorization === 'Bearer second-bearer')).toBe(true);
  });

  it.each([
    ['list_works', 'works:list', {}], ['list_chapters', 'works:single', { workId: WORK }],
    ['list_chapters', 'chapters:list', { workId: WORK }],
    ['get_chapter', 'works:single', { workId: WORK, chapterId: CHAPTER }],
    ['get_chapter', 'chapters:single', { workId: WORK, chapterId: CHAPTER }],
    ['get_chapter', 'rpc', { workId: WORK, chapterId: CHAPTER }],
  ])('fails closed on returned errors, errors alongside rows and thrown failures in %s at %s', async (name, stage, args) => {
    const { call, failures } = tools();
    for (const failure of [
      { data: null, error: { code: '42501', message: SENSITIVE } },
      { data: [], error: { message: SENSITIVE } }, new Error(`${SENSITIVE} ${BEARER}`),
    ]) {
      failures.set(stage, failure);
      expectSafeError(await call(name, args));
    }
  });

  it.each(['list_works', 'list_chapters'])('rejects null or malformed list data in %s instead of treating it as empty', async (name) => {
    const { call, failures } = tools();
    for (const data of [null, {}, 'unexpected']) {
      failures.set(name === 'list_works' ? 'works:list' : 'chapters:list', { data, error: null });
      expectSafeError(await call(name, name === 'list_works' ? {} : { workId: WORK }));
    }
  });

  it('handles missing body identically to missing metadata, and rejects non-text RPC results', async () => {
    const { call, failures } = tools();
    const missing = await call('get_chapter', { workId: WORK, chapterId: SESSION });
    failures.set('rpc', { data: null, error: null });
    expect(await call('get_chapter', { workId: WORK, chapterId: CHAPTER })).toEqual(missing);
    for (const data of [[], {}, 123]) {
      failures.set('rpc', { data, error: null });
      expectSafeError(await call('get_chapter', { workId: WORK, chapterId: CHAPTER }));
    }
  });
});
