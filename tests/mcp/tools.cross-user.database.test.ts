import { randomBytes, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertDisposableRef } from '../helpers/disposable-ref';
import {
  callTool, cleanupMcpOAuth, createWriter, issueMcpToken, secondsLeft,
  type IssuedToken, type McpToolCallResult, type Writer,
} from '../helpers/mcp-oauth';

/**
 * 13-05 MCP-02/03/04/09: every registered read tool, called through the real /mcp route with
 * real Supabase OAuth tokens on a disposable project (0037 -> 0038 -> 0039 applied).
 * - Writer B's token, given writer A's IDs, never returns a single character of A's data:
 *   lists contain only B's rows, searches over B's own work find none of A's documents, and
 *   single reads / bundles answer "missing" (bundles list A's node IDs only as missing).
 * - No error response carries a raw SQL / PostgREST message.
 * - A token issued before its grant is revoked is rejected at the auth step by every tool.
 * SUPABASE_DB_URL marks this file for vitest's serialized db project. Fixtures are inserted
 * through a direct superuser connection so RLS does not shape them. This suite never applies
 * migrations and never prints tokens or response bodies.
 */
const dbUrl = process.env.SUPABASE_DB_URL;
const ready = Boolean(process.env.MCP_DISPOSABLE_PROJECT_REF?.trim() && dbUrl
  && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  && process.env.SUPABASE_SERVICE_ROLE_KEY);

const MISSING = '요청한 항목을 찾을 수 없습니다.';
/** Every message the common runtime and the tools may return; anything else would be a leak. */
const ALLOWED_ERRORS = [
  MISSING,
  '인증 정보를 확인할 수 없습니다.',
  '읽기 권한이 필요합니다.',
  '입력값을 확인해주세요.',
  '데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.',
];
/** Fragments of PostgREST / Postgres errors that must never cross the tool boundary. */
const SQL_LEAK = /PGRST|permission denied|violates|relation "|column "|syntax error|42501|42P01|row-level security|JWT/i;
const READ_TOOLS = [
  'whoami', 'list_works', 'list_chapters', 'get_chapter', 'search_kb', 'get_kb_document', 'get_writing_context',
] as const;

type Page = { items: Array<{ id: string }>; nextOffset: number | null };
type Bundle = {
  systemInstruction: string; userContext: string;
  manifest: { includedDocuments: Array<{ id: string }>; missingNodeIds: string[]; work: { id: string } };
};

describe.skipIf(!ready)('MCP read tools: two-user OAuth isolation and revocation', () => {
  let sql: ReturnType<typeof postgres>;
  let writerA: Writer;
  let writerB: Writer;
  let aTok: IssuedToken;
  let bTok: IssuedToken;
  const clientIds: string[] = [];
  // A unique marker inside every piece of A's text. B's responses must never contain it.
  const secret = `ASECRET${randomBytes(6).toString('hex')}`;
  const own = `BOWN${randomBytes(6).toString('hex')}`;
  const f = Object.fromEntries([
    'wA', 'cDraft', 'cPaid', 'cPub', 'kAfolder', 'kAwork', 'kAacctFolder', 'kAacct',
    'wB', 'cB', 'kBfolder', 'kBwork', 'kBacctFolder', 'kBacct',
  ].map((key) => [key, randomUUID()])) as Record<string, string>;
  const aIds = () => [f.wA, f.cDraft, f.cPaid, f.cPub, f.kAfolder, f.kAwork, f.kAacctFolder, f.kAacct];
  const query = (text: string, params: unknown[] = []) =>
    sql.unsafe(text, params as postgres.ParameterOrJSON<never>[]);

  /** No A text and no SQL error text anywhere in the raw HTTP body. */
  function expectNoLeak(result: McpToolCallResult, label: string) {
    expect(result.raw.includes(secret), `${label} leaks A text`).toBe(false);
    expect(SQL_LEAK.test(result.raw), `${label} leaks a SQL error`).toBe(false);
  }
  /** A tool-level "missing" answer that also does not echo any of A's IDs. */
  function expectMissing(result: McpToolCallResult, label: string) {
    expect(result.status, label).toBe(200);
    expect(result.jsonRpcError, label).toBe(false);
    expect(result.isError, label).toBe(true);
    expect(result.text, label).toBe(MISSING);
    expectNoLeak(result, label);
    for (const id of aIds()) expect(result.raw.includes(id), `${label} echoes an A id`).toBe(false);
  }
  function expectOk(result: McpToolCallResult, label: string) {
    expect(result.status, label).toBe(200);
    expect(result.isError, `${label}: ${result.isError ? result.text : ''}`).toBe(false);
  }

  beforeAll(async () => {
    assertDisposableRef();
    process.env.MCP_PUBLIC_ORIGIN ??= 'http://localhost:3000';
    sql = postgres(dbUrl!, { max: 1, prepare: false });
    writerA = await createWriter();
    writerB = await createWriter();
    aTok = await issueMcpToken(writerA, { clientName: 'mcp-test-tools-A' });
    bTok = await issueMcpToken(writerB, { clientName: 'mcp-test-tools-B' });
    clientIds.push(aTok.clientId, bTok.clientId);
    for (const token of [aTok, bTok]) expect(secondsLeft(token.claims)).toBeGreaterThan(300);

    await query(`insert into public.works (id, owner_id, title, synopsis, genre) values
      ($1, $3, $5, $5, null), ($2, $4, $6, null, null)`,
    [f.wA, f.wB, writerA.id, writerB.id, `work ${secret}`, `work ${own}`]);
    await query(`insert into public.chapters
      (id, work_id, title, content, order_index, is_published, price_tier, published_at) values
      ($1, $5, $6, $7, 1, false, null, null),
      ($2, $5, $6, $8, 2, true, 30, now()),
      ($3, $5, $6, $9, 3, true, null, now()),
      ($4, $10, $11, $11, 1, true, null, now())`,
    [f.cDraft, f.cPaid, f.cPub, f.cB, f.wA, `chapter ${secret}`,
      `draft body ${secret}`, `paid body ${secret}`, `public body ${secret}`, f.wB, `body ${own}`]);
    // Work folders + files, account-shared folders + files, for both writers.
    await query(`insert into public.kb_nodes
      (id, owner_id, work_id, scope, parent_id, node_type, category, is_locked, name, content) values
      ($1, $9, $11, 'work', null, 'folder', '인물', false, 'A people', null),
      ($2, $9, $11, 'work', $1, 'file', '인물', false, $13, $13),
      ($3, $9, null, 'account_template', null, 'folder', 'custom', false, 'A shared', null),
      ($4, $9, null, 'account_template', $3, 'file', 'custom', false, $14, $14),
      ($5, $10, $12, 'work', null, 'folder', '인물', false, 'B people', null),
      ($6, $10, $12, 'work', $5, 'file', '인물', false, $15, $15),
      ($7, $10, null, 'account_template', null, 'folder', 'custom', false, 'B shared', null),
      ($8, $10, null, 'account_template', $7, 'file', 'custom', false, $16, $16)`,
    [f.kAfolder, f.kAwork, f.kAacctFolder, f.kAacct, f.kBfolder, f.kBwork, f.kBacctFolder, f.kBacct,
      writerA.id, writerB.id, f.wA, f.wB,
      `A work doc ${secret}`, `A shared doc ${secret}`, `B work doc ${own}`, `B shared doc ${own}`]);
    await query('insert into public.work_ai_instructions (work_id, instruction) values ($1, $2), ($3, $4)',
      [f.wA, `A rule ${secret}`, f.wB, `B rule ${own}`]);
  }, 180_000);

  afterAll(async () => {
    try {
      if (sql) {
        const owners = [writerA?.id, writerB?.id].filter(Boolean);
        const owned = owners.length
          ? await query('select id from public.works where owner_id = any($1::uuid[])', [owners])
          : [];
        const works = [...new Set([f.wA, f.wB, ...owned.map((row) => row.id as string)])];
        await query('delete from public.work_ai_instructions where work_id = any($1::uuid[])', [works]);
        await query('delete from public.chapters where work_id = any($1::uuid[])', [works]);
        // Files before folders (parent_id references).
        await query("delete from public.kb_nodes where owner_id = any($1::uuid[]) and node_type = 'file'", [owners]);
        await query('delete from public.kb_nodes where owner_id = any($1::uuid[])', [owners]);
        await query('delete from public.works where id = any($1::uuid[])', [works]);
        await sql.end();
      }
    } finally {
      await cleanupMcpOAuth(clientIds, [writerA, writerB].filter(Boolean));
    }
  }, 180_000);

  describe('fixtures are reachable by their owners (negative results below are meaningful)', () => {
    it("A's token reads A's work, every chapter state, both document scopes and the bundle", async () => {
      const works = await callTool(aTok.accessToken, 'list_works');
      expectOk(works, 'A list_works');
      expect((works.data as Page).items.map((row) => row.id)).toEqual([f.wA]);
      const chapters = await callTool(aTok.accessToken, 'list_chapters', { workId: f.wA });
      expectOk(chapters, 'A list_chapters');
      expect((chapters.data as Page).items.map((row) => row.id)).toEqual([f.cDraft, f.cPaid, f.cPub]);
      for (const chapterId of [f.cDraft, f.cPaid, f.cPub]) {
        const chapter = await callTool(aTok.accessToken, 'get_chapter', { workId: f.wA, chapterId });
        expectOk(chapter, 'A get_chapter');
        expect((chapter.data as { content: string }).content).toContain(secret);
      }
      const search = await callTool(aTok.accessToken, 'search_kb', { workId: f.wA, query: secret });
      expectOk(search, 'A search_kb');
      expect((search.data as Page).items.map((row) => row.id).sort()).toEqual([f.kAwork, f.kAacct].sort());
      for (const nodeId of [f.kAwork, f.kAacct]) {
        const doc = await callTool(aTok.accessToken, 'get_kb_document', { workId: f.wA, nodeId });
        expectOk(doc, 'A get_kb_document');
        expect((doc.data as { content: string }).content).toContain(secret);
      }
      const bundle = await callTool(aTok.accessToken, 'get_writing_context', {
        workId: f.wA, chapterId: f.cDraft, nodeIds: [f.kAwork, f.kAacct],
      });
      expectOk(bundle, 'A get_writing_context');
      const manifest = (bundle.data as Bundle).manifest;
      expect(manifest.includedDocuments.map((doc) => doc.id)).toEqual([f.kAwork, f.kAacct]);
      expect(manifest.missingNodeIds).toEqual([]);
    });

    it("B's token reads B's own work, chapter and documents", async () => {
      const works = await callTool(bTok.accessToken, 'list_works');
      expectOk(works, 'B list_works');
      expect((works.data as Page).items.map((row) => row.id)).toEqual([f.wB]);
      const chapter = await callTool(bTok.accessToken, 'get_chapter', { workId: f.wB, chapterId: f.cB });
      expectOk(chapter, 'B get_chapter');
      expect((chapter.data as { content: string }).content).toContain(own);
      const search = await callTool(bTok.accessToken, 'search_kb', { workId: f.wB, query: own });
      expectOk(search, 'B search_kb');
      expect((search.data as Page).items.map((row) => row.id).sort()).toEqual([f.kBwork, f.kBacct].sort());
    });
  });

  describe("B's token with A's IDs", () => {
    it('whoami still resolves to B, even with A injected as an argument', async () => {
      const plain = await callTool(bTok.accessToken, 'whoami');
      expectOk(plain, 'B whoami');
      expect(plain.data).toEqual({ userId: writerB.id });
      const injected = await callTool(bTok.accessToken, 'whoami', { userId: writerA.id });
      expect(injected.raw.includes(writerA.id)).toBe(false);
      if (!injected.isError) expect(injected.data).toEqual({ userId: writerB.id });
    });

    it('list_works lists only B (no A row, no A text, any page)', async () => {
      for (const args of [{}, { offset: 0, limit: 50 }, { offset: 1, limit: 50 }]) {
        const result = await callTool(bTok.accessToken, 'list_works', args);
        expectOk(result, 'B list_works');
        expectNoLeak(result, 'B list_works');
        const ids = (result.data as Page).items.map((row) => row.id);
        expect(ids).not.toContain(f.wA);
        expect(ids.every((id) => id === f.wB)).toBe(true);
      }
    });

    it("list_chapters on A's work is missing", async () => {
      expectMissing(await callTool(bTok.accessToken, 'list_chapters', { workId: f.wA }), 'B list_chapters(A)');
      expectMissing(await callTool(bTok.accessToken, 'list_chapters', { workId: f.wA, offset: 0, limit: 50 }), 'B list_chapters(A, page)');
    });

    it("get_chapter on A's draft, paid and public chapters is missing, also under B's own work ID", async () => {
      for (const chapterId of [f.cDraft, f.cPaid, f.cPub]) {
        expectMissing(await callTool(bTok.accessToken, 'get_chapter', { workId: f.wA, chapterId }), 'B get_chapter(A work)');
        expectMissing(await callTool(bTok.accessToken, 'get_chapter', { workId: f.wB, chapterId }), 'B get_chapter(B work, A chapter)');
        expectMissing(await callTool(bTok.accessToken, 'get_chapter', {
          workId: f.wA, chapterId, offset: 0, maxChars: 50000,
        }), 'B get_chapter(A, max)');
      }
    });

    it("search_kb on A's work is missing; on B's work it finds none of A's documents", async () => {
      for (const q of ['', secret, 'A', 'doc']) {
        expectMissing(await callTool(bTok.accessToken, 'search_kb', { workId: f.wA, query: q }), 'B search_kb(A work)');
      }
      const bySecret = await callTool(bTok.accessToken, 'search_kb', { workId: f.wB, query: secret });
      expectOk(bySecret, 'B search_kb(B work, A text)');
      expectNoLeak(bySecret, 'B search_kb(B work, A text)');
      expect(bySecret.data).toMatchObject({ items: [], nextOffset: null });
      // Listing everything B can see must not include either of A's documents.
      // Page through the whole listing (new accounts may carry seeded shared templates).
      const ids: string[] = [];
      for (let offset: number | null = 0; offset !== null;) {
        const all = await callTool(bTok.accessToken, 'search_kb', { workId: f.wB, query: '', offset, limit: 50 });
        expectOk(all, 'B search_kb(B work, all)');
        expectNoLeak(all, 'B search_kb(B work, all)');
        ids.push(...(all.data as Page).items.map((row) => row.id));
        offset = (all.data as Page).nextOffset;
      }
      for (const id of [f.kAwork, f.kAacct, f.kAfolder, f.kAacctFolder]) expect(ids).not.toContain(id);
      expect(ids).toEqual(expect.arrayContaining([f.kBwork, f.kBacct]));
    });

    it("get_kb_document on A's work file and A's shared file is missing under either work ID", async () => {
      for (const workId of [f.wA, f.wB]) {
        for (const nodeId of [f.kAwork, f.kAacct, f.kAfolder, f.kAacctFolder]) {
          expectMissing(await callTool(bTok.accessToken, 'get_kb_document', { workId, nodeId }), 'B get_kb_document');
        }
      }
    });

    it("get_writing_context on A's work or chapter is missing", async () => {
      for (const [workId, chapterId] of [[f.wA, f.cDraft], [f.wA, f.cPaid], [f.wB, f.cDraft], [f.wA, f.cB]]) {
        expectMissing(await callTool(bTok.accessToken, 'get_writing_context', { workId, chapterId, nodeIds: [] }),
          'B get_writing_context(A)');
        expectMissing(await callTool(bTok.accessToken, 'get_writing_context', {
          workId, chapterId, nodeIds: [f.kAwork, f.kAacct],
        }), 'B get_writing_context(A, A nodes)');
      }
    });

    it("a bundle mixing B's nodes with A's lists A's documents only as missing IDs", async () => {
      const result = await callTool(bTok.accessToken, 'get_writing_context', {
        workId: f.wB, chapterId: f.cB, nodeIds: [f.kBacct, f.kAwork, f.kBwork, f.kAacct, f.kAfolder],
      });
      expectOk(result, 'B mixed bundle');
      expectNoLeak(result, 'B mixed bundle');
      const bundle = result.data as Bundle;
      expect(bundle.manifest.work.id).toBe(f.wB);
      expect(bundle.manifest.includedDocuments.map((doc) => doc.id)).toEqual([f.kBacct, f.kBwork]);
      expect(bundle.manifest.missingNodeIds).toEqual([f.kAwork, f.kAacct, f.kAfolder]);
      expect(bundle.userContext).toContain(own);
      // A's instruction, chapter body and document names stay out of every field.
      for (const text of [bundle.systemInstruction, bundle.userContext]) expect(text.includes(secret)).toBe(false);
    });
  });

  it('a token issued before its grant is revoked is rejected at the auth step by every tool', async () => {
    const before = await issueMcpToken(writerB, { clientName: 'mcp-test-tools-B-revoke' });
    clientIds.push(before.clientId);
    expectOk(await callTool(before.accessToken, 'list_works'), 'B pre-revoke list_works');
    expect((await writerB.browser.rpc('mcp_disconnect', { p_client_id: before.clientId })).error).toBeNull();
    expect(secondsLeft(before.claims)).toBeGreaterThan(0);
    const args: Record<(typeof READ_TOOLS)[number], Record<string, unknown>> = {
      whoami: {},
      list_works: {},
      list_chapters: { workId: f.wB },
      get_chapter: { workId: f.wB, chapterId: f.cB },
      search_kb: { workId: f.wB, query: '' },
      get_kb_document: { workId: f.wB, nodeId: f.kBwork },
      get_writing_context: { workId: f.wB, chapterId: f.cB, nodeIds: [f.kBwork] },
    };
    for (const name of READ_TOOLS) {
      const result = await callTool(before.accessToken, name, args[name]);
      expect(result.status, name).toBe(401);
      expect(result.challenge ?? '', name).toMatch(/^Bearer /);
      expect(result.raw.includes(own), `${name} leaks after revoke`).toBe(false);
      expect(result.raw.includes(writerB.id), `${name} leaks identity after revoke`).toBe(false);
    }
    // The other, still-granted B client keeps working.
    expectOk(await callTool(bTok.accessToken, 'list_works'), 'B other client after revoke');
  }, 120_000);

  it('every error text a tool returned in this suite is one of the fixed runtime messages', async () => {
    const samples = await Promise.all([
      callTool(bTok.accessToken, 'list_chapters', { workId: f.wA }),
      callTool(bTok.accessToken, 'get_chapter', { workId: f.wA, chapterId: f.cDraft }),
      callTool(bTok.accessToken, 'search_kb', { workId: f.wA, query: secret }),
      callTool(bTok.accessToken, 'get_kb_document', { workId: f.wB, nodeId: f.kAacct }),
      callTool(bTok.accessToken, 'get_writing_context', { workId: f.wA, chapterId: f.cDraft, nodeIds: [] }),
    ]);
    for (const result of samples) {
      expect(result.isError).toBe(true);
      expect(ALLOWED_ERRORS).toContain(result.text);
      expectNoLeak(result, 'error sample');
    }
  });
});
