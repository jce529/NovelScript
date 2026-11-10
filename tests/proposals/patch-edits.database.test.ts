import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { assertDisposableRef } from '../helpers/disposable-ref';
import {
  insertChapter, insertKbNode, insertWork, proposalEnvReady, setupProposalFixture, sha256,
  type ProposalFixture,
} from '../helpers/proposals-db';
import { McpPatchError, mcpRpcError } from '@/lib/mcp/tool-runtime';

/**
 * 14-13 (0044): 패치 형식 제안 RPC. mcp_propose_chapter_draft / mcp_propose_kb_edit 는
 * (p_work_id, p_*_id, p_base_hash, p_edits) 로 바뀌고, 원본 행을 잠근 같은 트랜잭션에서 raw 원문 해시를
 * 먼저 대조한 뒤 원본의 LF 사본에서 리터럴 유일 일치로 replace / replace_range / replaceAll 을 적용한다.
 * 실패는 정확한 message·SQLSTATE·JSON DETAIL 로만 돌려주고 행을 만들지 않는다. 원본은 바뀌지 않는다.
 * 일회용 프로젝트에서만 실행한다(SUPABASE_DB_URL 표식 → 직렬 db 프로젝트). 비밀·본문을 출력하지 않는다.
 */
const ready = proposalEnvReady && Boolean(process.env.SUPABASE_DB_URL);

type Paragraph = { text: string; truncated: boolean };
type Preview = { editIndex: number; before: Paragraph[]; after: Paragraph[] };
type Proposed = { id: string; status: string; expires_at: string; superseded_id: string | null; preview?: Preview[] };
type Full = { status: number; json: unknown; code: string | null; message: string | null; rawDetails: string | null; details: unknown };

describe.skipIf(!ready)('patch edits in the propose RPCs (0044)', () => {
  let fx: ProposalFixture;
  let wA: string; let wB: string; let wCap: string;
  let folder: string;
  const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  /** PostgREST RPC 호출. 오류의 code/message/details(JSON 문자열)를 그대로 받는다. */
  async function call(fn: string, bearer: string, body: Record<string, unknown>): Promise<Full> {
    const response = await fetch(`${apiUrl}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    let parsed: Record<string, unknown> | null = null;
    try { parsed = text ? JSON.parse(text) as Record<string, unknown> : null; } catch { parsed = null; }
    if (response.ok) return { status: response.status, json: parsed, code: null, message: null, rawDetails: null, details: null };
    const rawDetails = typeof parsed?.details === 'string' ? parsed.details : null;
    let details: unknown = null;
    if (rawDetails) { try { details = JSON.parse(rawDetails); } catch { details = rawDetails; } }
    return {
      status: response.status, json: null, code: (parsed?.code as string) ?? null,
      message: (parsed?.message as string) ?? null, rawDetails, details,
    };
  }
  const chapterPatch = (chapterId: string, baseHash: string | null, edits: unknown, bearer = fx.aTok.accessToken, workId = wA) =>
    call('mcp_propose_chapter_draft', bearer, { p_work_id: workId, p_chapter_id: chapterId, p_base_hash: baseHash, p_edits: edits });
  const kbPatch = (nodeId: string, baseHash: string | null, edits: unknown, bearer = fx.aTok.accessToken, workId = wA) =>
    call('mcp_propose_kb_edit', bearer, { p_work_id: workId, p_node_id: nodeId, p_base_hash: baseHash, p_edits: edits });

  const chapter = (content: string, workId = wA) => insertChapter(fx, workId, content, { orderIndex: Math.floor(Math.random() * 1e6) });
  const node = (content: string | null) => insertKbNode(fx, { ownerId: fx.writerA.id, workId: wA, parentId: folder, category: '인물', name: `패치 ${randomUUID()}`, content });
  const row = async (id: string) => (await fx.query('select * from public.mcp_proposals where id = $1', [id]))[0];
  const chapterBody = async (id: string) => (await fx.query('select content from public.chapters where id = $1', [id]))[0].content as string;
  const nodeBody = async (id: string) => (await fx.query('select content from public.kb_nodes where id = $1', [id]))[0].content as string | null;
  const proposalCount = async () => (await fx.query(
    'select count(*)::int as n from public.mcp_proposals where owner_id = any($1::uuid[])', [[fx.writerA.id, fx.writerB.id]]))[0].n as number;

  /** 실패 단정: 행 0개 추가, 원본 불변, 정확한 message·SQLSTATE·DETAIL. */
  async function expectPatchError(
    run: () => Promise<Full>, message: string, sqlstate: string, details: unknown, original?: { chapter?: string; node?: string; body: string | null },
  ) {
    const n = await proposalCount();
    const result = await run();
    expect(result.status, JSON.stringify(result.details)).toBe(400);
    expect(result.message).toBe(message);
    expect(result.code).toBe(sqlstate);
    expect(result.details).toEqual(details);
    // TS 계약: 같은 오류가 McpPatchError로 구조화돼야 한다(허용 필드만).
    const mapped = mcpRpcError({ message: result.message, code: result.code, details: result.rawDetails });
    expect(mapped, String(result.rawDetails)).toBeInstanceOf(McpPatchError);
    expect((mapped as McpPatchError).detail).toEqual(details);
    expect(await proposalCount()).toBe(n);
    if (original?.chapter) expect(await chapterBody(original.chapter)).toBe(original.body);
    if (original?.node) expect(await nodeBody(original.node)).toBe(original.body);
    return result;
  }

  beforeAll(async () => {
    assertDisposableRef();
    fx = await setupProposalFixture('patch');
    wA = await insertWork(fx, fx.writerA.id, 'patch A');
    wB = await insertWork(fx, fx.writerB.id, 'patch B');
    wCap = await insertWork(fx, fx.writerA.id, 'patch cap');
    folder = await insertKbNode(fx, { ownerId: fx.writerA.id, workId: wA, nodeType: 'folder', category: '인물', name: '인물', locked: true });
  }, 180_000);

  afterEach(async () => {
    // 상한(작품당 30건)에 걸리지 않도록 테스트마다 제안 행을 비운다.
    await fx?.query('delete from public.mcp_proposals where owner_id = any($1::uuid[])', [[fx.writerA.id, fx.writerB.id]]);
  });

  afterAll(async () => {
    await fx?.cleanup();
  }, 180_000);

  describe('success', () => {
    it('replace: stores the full LF proposal, raw base and raw base hash; returns a bounded preview; chapter unchanged', async () => {
      const original = '첫 문단.\n\n둘째 문단 🌙 달.\n\n셋째 문단.\n\n넷째 문단.\n\n다섯째.\n';
      const c = await chapter(original);
      const result = await chapterPatch(c, sha256(original), [{ op: 'replace', find: '🌙', replace: '해', hint_para: 2 }]);
      expect(result.status, String(result.message)).toBe(200);
      const data = result.json as Proposed;
      expect(Object.keys(data).sort()).toEqual(['expires_at', 'id', 'preview', 'status', 'superseded_id']);
      expect(data).toMatchObject({ status: 'pending', superseded_id: null });
      const expected = '첫 문단.\n\n둘째 문단 해 달.\n\n셋째 문단.\n\n넷째 문단.\n\n다섯째.\n';
      expect(await row(data.id)).toMatchObject({
        kind: 'chapter_draft', chapter_id: c, content: expected, content_hash: sha256(expected),
        base_content: original, base_hash: sha256(original), source_client_id: fx.aTok.clientId,
      });
      // 변경 구간 바로 앞뒤 각 최대 2문단(이음새 조각 포함), 전체 본문은 돌려주지 않는다.
      expect(data.preview).toEqual([{
        editIndex: 0,
        before: [{ text: '첫 문단.', truncated: false }, { text: '둘째 문단 ', truncated: false }],
        after: [{ text: ' 달.', truncated: false }, { text: '셋째 문단.', truncated: false }],
      }]);
      expect(JSON.stringify(data)).not.toContain('다섯째');
      expect(await chapterBody(c)).toBe(original);
    });

    it('replace_range: replaces from the start anchor through the end anchor, inclusive', async () => {
      const original = 'A1\n\nB 시작 중간 끝 B\n\nC3\n';
      const c = await chapter(original);
      const result = await chapterPatch(c, sha256(original), [{ op: 'replace_range', start_text: '시작', end_text: '끝', replace: '새 구간' }]);
      expect(result.status, String(result.message)).toBe(200);
      const data = result.json as Proposed;
      expect((await row(data.id)).content).toBe('A1\n\nB 새 구간 B\n\nC3\n');
      expect(data.preview).toEqual([{ editIndex: 0,
        before: [{ text: 'A1', truncated: false }, { text: 'B ', truncated: false }],
        after: [{ text: ' B', truncated: false }, { text: 'C3', truncated: false }] }]);
    });

    it('replaceAll alone behaves like the old full-content path (no preview, CRLF normalized)', async () => {
      const original = 'old body';
      const c = await chapter(original);
      const result = await chapterPatch(c, sha256(original), [{ op: 'replaceAll', content: '새 본문\r\n둘째 줄\r\n' }]);
      expect(result.status, String(result.message)).toBe(200);
      const data = result.json as Proposed;
      expect(Object.keys(data).sort()).toEqual(['expires_at', 'id', 'status', 'superseded_id']);
      expect((await row(data.id)).content).toBe('새 본문\n둘째 줄\n');
    });

    it('several edits use original coordinates (ascending, adjacent allowed) and are applied together', async () => {
      const original = 'one two three four';
      const c = await chapter(original);
      // 첫 edit 결과에 'two'가 하나 더 생기지만, 좌표는 원본 기준이라 둘째 edit의 'two'는 유일하다.
      const result = await chapterPatch(c, sha256(original), [
        { op: 'replace', find: 'one', replace: 'two' },
        { op: 'replace', find: ' two', replace: ' 2' },
        { op: 'replace', find: ' three', replace: ' 3' },
      ]);
      expect(result.status, String(result.message)).toBe(200);
      const data = result.json as Proposed;
      expect((await row(data.id)).content).toBe('two 2 3 four');
      expect(data.preview!.map((p) => p.editIndex)).toEqual([0, 1, 2]);
    });

    it('CRLF original: the hash is over raw text; LF and CRLF anchors both match the LF copy; base stays raw', async () => {
      const original = '가\r\n나 다\r\n라\r\n';
      const c = await chapter(original);
      const lf = await chapterPatch(c, sha256(original), [{ op: 'replace', find: '나 다\n라', replace: '나\r\n다라' }]);
      expect(lf.status, String(lf.message)).toBe(200);
      const lfRow = await row((lf.json as Proposed).id);
      expect(lfRow).toMatchObject({ content: '가\n나\n다라\n', base_content: original, base_hash: sha256(original) });
      const crlf = await chapterPatch(c, sha256(original), [{ op: 'replace', find: '가\r\n나', replace: 'X' }]);
      expect(crlf.status, String(crlf.message)).toBe(200);
      expect((await row((crlf.json as Proposed).id)).content).toBe('X 다\n라\n');
      // CR 단독 원본도 같은 LF 사본에서 맞춘다.
      const cr = 'a\rb\rc';
      const c2 = await chapter(cr);
      const crResult = await chapterPatch(c2, sha256(cr), [{ op: 'replace', find: 'b\nc', replace: 'B' }]);
      expect(crResult.status, String(crResult.message)).toBe(200);
      expect(await row((crResult.json as Proposed).id)).toMatchObject({ content: 'a\nB', base_content: cr });
      // LF로 정규화한 해시는 원문 해시가 아니므로 stale이다.
      await expectPatchError(() => chapterPatch(c, sha256('가\n나 다\n라\n'), [{ op: 'replace', find: '가', replace: '하' }]),
        'mcp_patch_stale', 'P0001', { code: 'stale', latestHash: sha256(original) }, { chapter: c, body: original });
    });

    it('regex specials are literal: .*[]() match only themselves', async () => {
      const original = 'a.*[b](c) and a.b and axb';
      const c = await chapter(original);
      const ok = await chapterPatch(c, sha256(original), [{ op: 'replace', find: '.*[b](c)', replace: '!' }]);
      expect(ok.status, String(ok.message)).toBe(200);
      expect((await row((ok.json as Proposed).id)).content).toBe('a! and a.b and axb');
      const lit = await chapterPatch(c, sha256(original), [{ op: 'replace', find: 'a.b', replace: 'A' }]);
      expect(lit.status, String(lit.message)).toBe(200);
      expect((await row((lit.json as Proposed).id)).content).toBe('a.*[b](c) and A and axb');
      await expectPatchError(() => chapterPatch(c, sha256(original), [{ op: 'replace', find: '(x)', replace: 'y' }]),
        'mcp_patch_no_match', 'P0001', { code: 'no_match', editIndex: 0, reason: 'find' }, { chapter: c, body: original });
    });

    it('kb edit: replace on a file; a null body hashes as the empty string and accepts replaceAll', async () => {
      const original = '이름: 하린\n나이: 17\n';
      const k = await node(original);
      const result = await kbPatch(k, sha256(original), [{ op: 'replace', find: '17', replace: '18' }]);
      expect(result.status, String(result.message)).toBe(200);
      expect(await row((result.json as Proposed).id)).toMatchObject({
        kind: 'kb_edit', node_id: k, content: '이름: 하린\n나이: 18\n', base_content: original, base_hash: sha256(original),
      });
      expect(await nodeBody(k)).toBe(original);

      const empty = await node(null);
      await expectPatchError(() => kbPatch(empty, sha256('x'), [{ op: 'replace', find: 'a', replace: 'b' }]),
        'mcp_patch_stale', 'P0001', { code: 'stale', latestHash: sha256('') }, { node: empty, body: null });
      await expectPatchError(() => kbPatch(empty, sha256(''), [{ op: 'replace', find: 'a', replace: 'b' }]),
        'mcp_patch_no_match', 'P0001', { code: 'no_match', editIndex: 0, reason: 'find' }, { node: empty, body: null });
      const all = await kbPatch(empty, sha256(''), [{ op: 'replaceAll', content: '새 설정' }]);
      expect(all.status, String(all.message)).toBe(200);
      expect(await row((all.json as Proposed).id)).toMatchObject({ content: '새 설정', base_content: '', base_hash: sha256('') });
      expect(await nodeBody(empty)).toBeNull();
    });
  });

  describe('refusals (no row, original unchanged)', () => {
    it('stale base hash returns only the latest raw hash, before any edit check', async () => {
      const original = '현재 원문';
      const c = await chapter(original);
      const stale = await expectPatchError(
        () => chapterPatch(c, sha256('읽었던 옛 원문'), [{ op: 'replace', find: '없는 글', replace: 'x' }, { op: 'bogus' }]),
        'mcp_patch_stale', 'P0001', { code: 'stale', latestHash: sha256(original) }, { chapter: c, body: original });
      expect(Object.keys(stale.details as object).sort()).toEqual(['code', 'latestHash']);
      for (const bad of [null, '', 'ABC', sha256(original).toUpperCase()]) {
        await expectPatchError(() => chapterPatch(c, bad, [{ op: 'replace', find: '현재', replace: '지금' }]),
          'mcp_patch_stale', 'P0001', { code: 'stale', latestHash: sha256(original) }, { chapter: c, body: original });
      }
    });

    it('no_match / ambiguous (overlapping occurrences counted) with code-point candidates', async () => {
      const original = 'baaab';
      const c = await chapter(original);
      await expectPatchError(() => chapterPatch(c, sha256(original), [{ op: 'replace', find: 'aa', replace: 'x' }]),
        'mcp_patch_ambiguous', 'P0001', { code: 'ambiguous', editIndex: 0, reason: 'find', candidates: [
          { position: 2, before: 'b', after: 'ab' }, { position: 3, before: 'ba', after: 'b' },
        ] }, { chapter: c, body: original });
      await expectPatchError(() => chapterPatch(c, sha256(original), [{ op: 'replace', find: 'z', replace: 'x' }]),
        'mcp_patch_no_match', 'P0001', { code: 'no_match', editIndex: 0, reason: 'find' }, { chapter: c, body: original });

      // 3곳 넘게 일치해도 후보는 3곳, 문맥은 앞뒤 20자(코드포인트).
      const long = `${'가'.repeat(30)}X${'나'.repeat(30)}X${'다'.repeat(30)}X${'라'.repeat(30)}X`;
      const c2 = await chapter(long);
      await expectPatchError(() => chapterPatch(c2, sha256(long), [{ op: 'replace', find: 'X', replace: 'Y' }]),
        'mcp_patch_ambiguous', 'P0001', { code: 'ambiguous', editIndex: 0, reason: 'find', candidates: [
          { position: 31, before: '가'.repeat(20), after: '나'.repeat(20) },
          { position: 62, before: '나'.repeat(20), after: '다'.repeat(20) },
          { position: 93, before: '다'.repeat(20), after: '라'.repeat(20) },
        ] }, { chapter: c2, body: long });

      // 이모지 경계: 위치는 UTF-16(3, 6)이 아니라 코드포인트(2, 4) 기준.
      const emoji = '🌙a🌙a';
      const c3 = await chapter(emoji);
      await expectPatchError(() => chapterPatch(c3, sha256(emoji), [{ op: 'replace', find: 'a', replace: 'b' }]),
        'mcp_patch_ambiguous', 'P0001', { code: 'ambiguous', editIndex: 0, reason: 'find', candidates: [
          { position: 2, before: '🌙', after: '🌙a' }, { position: 4, before: '🌙a🌙', after: '' },
        ] }, { chapter: c3, body: emoji });
    });

    it('replace_range anchors: start/end no_match and ambiguous carry their own reason', async () => {
      const original = 'S1 middle E1 tail E2';
      const c = await chapter(original);
      const body = { chapter: c, body: original };
      await expectPatchError(() => chapterPatch(c, sha256(original), [{ op: 'replace_range', start_text: 'Q', end_text: 'E1', replace: '' }]),
        'mcp_patch_no_match', 'P0001', { code: 'no_match', editIndex: 0, reason: 'start_text' }, body);
      await expectPatchError(() => chapterPatch(c, sha256(original), [{ op: 'replace_range', start_text: 'S1', end_text: 'Q', replace: '' }]),
        'mcp_patch_no_match', 'P0001', { code: 'no_match', editIndex: 0, reason: 'end_text' }, body);
      await expectPatchError(() => chapterPatch(c, sha256(original), [{ op: 'replace_range', start_text: 'S1', end_text: 'E', replace: '' }]),
        'mcp_patch_ambiguous', 'P0001', { code: 'ambiguous', editIndex: 0, reason: 'end_text', candidates: [
          { position: 11, before: 'S1 middle ', after: '1 tail E2' }, { position: 19, before: 'S1 middle E1 tail ', after: '2' },
        ] }, body);
    });

    it('range reversed / overlapping anchors, not_ascending and overlapping edits', async () => {
      const original = 'one two three four';
      const c = await chapter(original);
      const body = { chapter: c, body: original };
      await expectPatchError(() => chapterPatch(c, sha256(original), [{ op: 'replace_range', start_text: 'three', end_text: 'one', replace: '' }]),
        'mcp_patch_overlap', 'P0001', { code: 'overlap', editIndex: 0, reason: 'range_reversed' }, body);
      await expectPatchError(() => chapterPatch(c, sha256(original), [{ op: 'replace_range', start_text: 'two thr', end_text: 'three', replace: '' }]),
        'mcp_patch_overlap', 'P0001', { code: 'overlap', editIndex: 0, reason: 'range_reversed' }, body);
      await expectPatchError(() => chapterPatch(c, sha256(original), [
        { op: 'replace', find: 'three', replace: '3' }, { op: 'replace', find: 'one', replace: '1' }]),
      'mcp_patch_overlap', 'P0001', { code: 'overlap', editIndex: 1, reason: 'not_ascending' }, body);
      await expectPatchError(() => chapterPatch(c, sha256(original), [
        { op: 'replace_range', start_text: 'one', end_text: 'three', replace: 'x' }, { op: 'replace', find: 'ree fo', replace: 'y' }]),
      'mcp_patch_overlap', 'P0001', { code: 'overlap', editIndex: 1, reason: 'overlap' }, body);
    });

    it('a later failing edit rolls back the whole request (no row, original unchanged)', async () => {
      const original = 'alpha beta gamma';
      const c = await chapter(original);
      await expectPatchError(() => chapterPatch(c, sha256(original), [
        { op: 'replace', find: 'alpha', replace: 'A' }, { op: 'replace', find: 'beta', replace: 'B' }, { op: 'replace', find: 'delta', replace: 'D' }]),
      'mcp_patch_no_match', 'P0001', { code: 'no_match', editIndex: 2, reason: 'find' }, { chapter: c, body: original });
      expect(await fx.query('select 1 from public.mcp_proposals where chapter_id = $1', [c])).toHaveLength(0);
    });

    it('invalid shapes: replaceAll mixed, unknown op, malformed edits', async () => {
      const original = 'shape body';
      const c = await chapter(original);
      const body = { chapter: c, body: original };
      const h = sha256(original);
      await expectPatchError(() => chapterPatch(c, h, [{ op: 'replace', find: 'shape', replace: 's' }, { op: 'replaceAll', content: 'x' }]),
        'mcp_patch_invalid', '22023', { code: 'invalid', editIndex: 1, reason: 'replace_all_mixed' }, body);
      await expectPatchError(() => chapterPatch(c, h, [{ op: 'insert', find: 'shape', replace: 's' }]),
        'mcp_patch_invalid', '22023', { code: 'invalid', editIndex: 0, reason: 'unknown_op' }, body);
      for (const [edits, detail] of [
        [[{ op: 'replace', find: 1, replace: 's' }], { code: 'invalid', editIndex: 0, reason: 'malformed' }],
        [[{ op: 'replace', find: 'shape' }], { code: 'invalid', editIndex: 0, reason: 'malformed' }],
        [[{ op: 'replace', find: 'shape', replace: 's', extra: 1 }], { code: 'invalid', editIndex: 0, reason: 'malformed' }],
        [['shape'], { code: 'invalid', editIndex: 0, reason: 'malformed' }],
        [{ op: 'replace' }, { code: 'invalid', reason: 'malformed' }],
        [[], { code: 'invalid', reason: 'malformed' }],
        [null, { code: 'invalid', reason: 'malformed' }],
      ] as const) {
        await expectPatchError(() => chapterPatch(c, h, edits), 'mcp_patch_invalid', '22023', detail, body);
      }
    });

    it('hint_para must be an integer 1..100000 when present (re-checked in SQL, still never a position)', async () => {
      const original = 'hint body';
      const c = await chapter(original);
      const body = { chapter: c, body: original };
      for (const hint of ['3', 0, 100_001, 1.5, -1, null, true, [1]]) {
        await expectPatchError(() => chapterPatch(c, sha256(original), [{ op: 'replace', find: 'hint', replace: 'h', hint_para: hint }]),
          'mcp_patch_invalid', '22023', { code: 'invalid', editIndex: 0, reason: 'malformed' }, body);
      }
      await expectPatchError(() => chapterPatch(c, sha256(original), [
        { op: 'replace', find: 'hint', replace: 'h', hint_para: 1 },
        { op: 'replace_range', start_text: 'bo', end_text: 'dy', replace: 'B', hint_para: '2' }]),
      'mcp_patch_invalid', '22023', { code: 'invalid', editIndex: 1, reason: 'malformed' }, body);
      for (const hint of [1, 100_000]) {
        const ok = await chapterPatch(c, sha256(original), [{ op: 'replace', find: 'hint', replace: `h${hint}`, hint_para: hint }]);
        expect(ok.status, String(ok.message)).toBe(200);
      }
    });

    it('replaceAll raw length is capped before normalization (stripped controls cannot bypass the limit)', async () => {
      const original = 'raw cap body';
      const c = await chapter(original);
      const n = await proposalCount();
      // 100,001 code points, 100,000 of them control characters that normalization would strip.
      const over = await chapterPatch(c, sha256(original), [{ op: 'replaceAll', content: `x${'\u0007'.repeat(100_000)}` }]);
      expect(over).toMatchObject({ status: 400, message: 'mcp_invalid_content', code: '22023' });
      const okRaw = await chapterPatch(c, sha256(original), [{ op: 'replaceAll', content: `x${'\u0007'.repeat(99_999)}` }]);
      expect(okRaw.status, String(okRaw.message)).toBe(200);
      expect((await row((okRaw.json as Proposed).id)).content).toBe('x');
      // 100,000 emoji = 100,000 code points (UTF-16 200,000) is still within the chapter limit.
      const emoji = await chapterPatch(c, sha256(original), [{ op: 'replaceAll', content: '😀'.repeat(100_000) }]);
      expect(emoji.status, String(emoji.message)).toBe(200);

      const k = await node('kb raw cap');
      const kOver = await kbPatch(k, sha256('kb raw cap'), [{ op: 'replaceAll', content: `y${'‎\u0001'.repeat(25_000)}` }]);
      expect(kOver).toMatchObject({ status: 400, message: 'mcp_invalid_content', code: '22023' });
      const kOk = await kbPatch(k, sha256('kb raw cap'), [{ op: 'replaceAll', content: `y${'\u0001'.repeat(49_999)}` }]);
      expect(kOk.status, String(kOk.message)).toBe(200);
      expect(await proposalCount()).toBe(n + 3);
      expect(await chapterBody(c)).toBe(original);
    });

    it('no change and blank results use the existing errors', async () => {
      const original = 'same text';
      const c = await chapter(original);
      const same = await chapterPatch(c, sha256(original), [{ op: 'replace', find: 'same', replace: 'same' }]);
      expect(same).toMatchObject({ status: 400, message: 'mcp_no_change', code: 'P0001' });
      const blank = await chapterPatch(c, sha256(original), [{ op: 'replace', find: 'same text', replace: '  ' }]);
      expect(blank).toMatchObject({ status: 400, message: 'mcp_invalid_content', code: '22023' });
      expect(await proposalCount()).toBe(0);
    });
  });

  describe('limits (boundary and +1, SQL re-checks what TS already checks)', () => {
    it('edits: 20 ok, 21 refused', async () => {
      const original = Array.from({ length: 21 }, (_, i) => `[${String(i).padStart(2, '0')}]`).join(' ');
      const c = await chapter(original);
      const edits = (n: number) => Array.from({ length: n }, (_, i) => ({ op: 'replace', find: `[${String(i).padStart(2, '0')}]`, replace: `<${i}>` }));
      await expectPatchError(() => chapterPatch(c, sha256(original), edits(21)),
        'mcp_patch_limit', '22023', { code: 'limit', reason: 'edit_count' }, { chapter: c, body: original });
      const ok = await chapterPatch(c, sha256(original), edits(20));
      expect(ok.status, String(ok.message)).toBe(200);
      expect((ok.json as Proposed).preview).toHaveLength(20);
    });

    it('anchors: 500 ok, 501 refused; emoji anchors count code points', async () => {
      const anchor500 = '앵'.repeat(500);
      const original = `${anchor500}!`;
      const c = await chapter(original);
      await expectPatchError(() => chapterPatch(c, sha256(original), [{ op: 'replace', find: `${anchor500}!`, replace: 'x' }]),
        'mcp_patch_limit', '22023', { code: 'limit', editIndex: 0, reason: 'anchor_length' }, { chapter: c, body: original });
      await expectPatchError(() => chapterPatch(c, sha256(original), [{ op: 'replace', find: '', replace: 'x' }]),
        'mcp_patch_limit', '22023', { code: 'limit', editIndex: 0, reason: 'anchor_length' }, { chapter: c, body: original });
      const ok = await chapterPatch(c, sha256(original), [{ op: 'replace', find: anchor500, replace: 'x' }]);
      expect(ok.status, String(ok.message)).toBe(200);
      // 500 이모지 = UTF-16 1000단위지만 SQL은 코드포인트 500자라 허용, 501은 거절.
      const emoji = `${'😀'.repeat(501)}`;
      const c2 = await chapter(emoji);
      await expectPatchError(() => chapterPatch(c2, sha256(emoji), [{ op: 'replace_range', start_text: '😀'.repeat(501), end_text: 'z', replace: '' }]),
        'mcp_patch_limit', '22023', { code: 'limit', editIndex: 0, reason: 'anchor_length' }, { chapter: c2, body: emoji });
      const emojiOk = await chapterPatch(c2, sha256(emoji), [{ op: 'replace', find: `${'😀'.repeat(500)}`, replace: '' }]);
      // 501개 중 500개 연속은 겹친 출현 2곳이다.
      expect(emojiOk).toMatchObject({ status: 400, message: 'mcp_patch_ambiguous' });
    });

    it('replace text: 10,000 ok, 10,001 refused (code points; 10,000 emoji pass SQL)', async () => {
      const original = 'MARK rest';
      const c = await chapter(original);
      await expectPatchError(() => chapterPatch(c, sha256(original), [{ op: 'replace', find: 'MARK', replace: 'r'.repeat(10_001) }]),
        'mcp_patch_limit', '22023', { code: 'limit', editIndex: 0, reason: 'replace_length' }, { chapter: c, body: original });
      await expectPatchError(() => chapterPatch(c, sha256(original), [{ op: 'replace_range', start_text: 'MARK', end_text: 'rest', replace: '😀'.repeat(10_001) }]),
        'mcp_patch_limit', '22023', { code: 'limit', editIndex: 0, reason: 'replace_length' }, { chapter: c, body: original });
      expect((await chapterPatch(c, sha256(original), [{ op: 'replace', find: 'MARK', replace: 'r'.repeat(10_000) }])).status).toBe(200);
      expect((await chapterPatch(c, sha256(original), [{ op: 'replace', find: 'rest', replace: '😀'.repeat(10_000) }])).status).toBe(200);
    });

    it('replace_range delete length: 10,000 ok, 10,001 refused', async () => {
      const ok = `S${'x'.repeat(9_998)}E tail`;
      const over = `S${'x'.repeat(9_999)}E tail`;
      const c = await chapter(over);
      await expectPatchError(() => chapterPatch(c, sha256(over), [{ op: 'replace_range', start_text: 'S', end_text: 'E', replace: '' }]),
        'mcp_patch_limit', '22023', { code: 'limit', editIndex: 0, reason: 'delete_length' }, { chapter: c, body: over });
      const c2 = await chapter(ok);
      const result = await chapterPatch(c2, sha256(ok), [{ op: 'replace_range', start_text: 'S', end_text: 'E', replace: '' }]);
      expect(result.status, String(result.message)).toBe(200);
      expect((await row((result.json as Proposed).id)).content).toBe(' tail');
    });

    it('result length: chapter 100,000 ok / 100,001 refused; kb 50,000 ok / 50,001 refused', async () => {
      const cOk = await chapter(`MARK${'y'.repeat(90_000)}`);
      const cOver = await chapter(`MARK${'y'.repeat(90_001)}`);
      const okBody = `MARK${'y'.repeat(90_000)}`;
      const overBody = `MARK${'y'.repeat(90_001)}`;
      await expectPatchError(() => chapterPatch(cOver, sha256(overBody), [{ op: 'replace', find: 'MARK', replace: 'z'.repeat(10_000) }]),
        'mcp_patch_limit', '22023', { code: 'limit', reason: 'result_length' }, { chapter: cOver, body: overBody });
      const ok = await chapterPatch(cOk, sha256(okBody), [{ op: 'replace', find: 'MARK', replace: 'z'.repeat(10_000) }]);
      expect(ok.status, String(ok.message)).toBe(200);
      expect(((await row((ok.json as Proposed).id)).content as string).length).toBe(100_000);

      const kOkBody = `MARK${'y'.repeat(40_000)}`;
      const kOverBody = `MARK${'y'.repeat(40_001)}`;
      const kOk = await node(kOkBody);
      const kOver = await node(kOverBody);
      await expectPatchError(() => kbPatch(kOver, sha256(kOverBody), [{ op: 'replace', find: 'MARK', replace: 'z'.repeat(10_000) }]),
        'mcp_patch_limit', '22023', { code: 'limit', reason: 'result_length' }, { node: kOver, body: kOverBody });
      const kResult = await kbPatch(kOk, sha256(kOkBody), [{ op: 'replace', find: 'MARK', replace: 'z'.repeat(10_000) }]);
      expect(kResult.status, String(kResult.message)).toBe(200);
      // 이모지도 코드포인트로 센다: 10,000 이모지(UTF-16 20,000단위)는 replace 한도 안.
      const kEmojiBody = 'MARK';
      const kEmoji = await node(kEmojiBody);
      const emoji = await kbPatch(kEmoji, sha256(kEmojiBody), [{ op: 'replace', find: 'MARK', replace: '😀'.repeat(10_000) }]);
      expect(emoji.status, String(emoji.message)).toBe(200);
    });

    it('preview paragraphs are capped at 240 code points with a truncated flag', async () => {
      const longBefore = '😀'.repeat(300);
      const longAfter = '가'.repeat(300);
      const original = `${longBefore}\nTARGET\n${longAfter}`;
      const c = await chapter(original);
      const result = await chapterPatch(c, sha256(original), [{ op: 'replace', find: 'TARGET', replace: 'T' }]);
      expect(result.status, String(result.message)).toBe(200);
      expect((result.json as Proposed).preview).toEqual([{ editIndex: 0,
        before: [{ text: '😀'.repeat(240), truncated: true }],
        after: [{ text: '가'.repeat(240), truncated: true }] }]);
    });
  });

  describe('dedupe, cap, ownership and ACL', () => {
    it('dedupes by the final proposal hash: chapters across connections, kb per connection', async () => {
      const original = 'dedupe original';
      const c = await chapter(original);
      const first = await chapterPatch(c, sha256(original), [{ op: 'replace', find: 'original', replace: 'changed' }]);
      expect(first.status, String(first.message)).toBe(200);
      const viaAll = await chapterPatch(c, sha256(original), [{ op: 'replaceAll', content: 'dedupe changed' }], fx.aTok2.accessToken);
      expect((viaAll.json as Proposed).id).toBe((first.json as Proposed).id);
      const other = await chapterPatch(c, sha256(original), [{ op: 'replace', find: 'dedupe', replace: 'x' }]);
      expect((other.json as Proposed).id).not.toBe((first.json as Proposed).id);
      expect(await fx.query("select 1 from public.mcp_proposals where chapter_id = $1 and status = 'pending'", [c])).toHaveLength(2);

      const k = await node('kb dedupe');
      const k1 = await kbPatch(k, sha256('kb dedupe'), [{ op: 'replace', find: 'dedupe', replace: 'v2' }]);
      const k2 = await kbPatch(k, sha256('kb dedupe'), [{ op: 'replace_range', start_text: 'de', end_text: 'pe', replace: 'v2' }]);
      expect((k2.json as Proposed).id).toBe((k1.json as Proposed).id);
      const k3 = await kbPatch(k, sha256('kb dedupe'), [{ op: 'replace', find: 'dedupe', replace: 'v2' }], fx.aTok2.accessToken);
      expect((k3.json as Proposed).id).not.toBe((k1.json as Proposed).id);
    });

    it('dedupe runs before the per-work cap; a new text over the cap is refused', async () => {
      const original = 'cap original';
      const c = await chapter(original, wCap);
      const kept = await chapterPatch(c, sha256(original), [{ op: 'replace', find: 'original', replace: 'kept' }], fx.aTok.accessToken, wCap);
      expect(kept.status, String(kept.message)).toBe(200);
      await fx.query(`insert into public.mcp_proposals
          (owner_id, work_id, kind, proposed_category, proposed_name, content, content_hash, source_client_id, source_client_name, source_host)
        select $1, $2, 'kb_create', '인물', 'cap' || g, 'cap content ' || g,
               encode(sha256(convert_to('cap content ' || g, 'UTF8')), 'hex'), $3, 'cap', 'claude.ai'
        from generate_series(1, 29) as g`, [fx.writerA.id, wCap, fx.aTok.clientId]);
      const refused = await chapterPatch(c, sha256(original), [{ op: 'replace', find: 'original', replace: 'over' }], fx.aTok.accessToken, wCap);
      expect(refused).toMatchObject({ status: 400, message: 'mcp_cap_reached' });
      const again = await chapterPatch(c, sha256(original), [{ op: 'replace', find: 'original', replace: 'kept' }], fx.aTok.accessToken, wCap);
      expect((again.json as Proposed).id).toBe((kept.json as Proposed).id);
    });

    it('other writers get mcp_not_found before any hash or edit check (no latestHash leak)', async () => {
      const original = 'A secret body';
      const c = await chapter(original);
      const k = await node('A secret kb');
      const cB = await chapter('B body', wB);
      const n = await proposalCount();
      for (const [run, label] of [
        [() => chapterPatch(c, sha256(original), [{ op: 'replace', find: 'secret', replace: 'x' }], fx.bTok.accessToken), 'B on A chapter, right hash'],
        [() => chapterPatch(c, sha256('wrong'), [{ op: 'replace', find: 'secret', replace: 'x' }], fx.bTok.accessToken), 'B on A chapter, wrong hash'],
        [() => chapterPatch(c, sha256('wrong'), [{ op: 'bogus' }], fx.bTok.accessToken, wB), 'B work + A chapter'],
        [() => chapterPatch(cB, sha256('B body'), [{ op: 'replace', find: 'B', replace: 'x' }]), 'A token on B chapter'],
        [() => kbPatch(k, sha256('wrong'), [{ op: 'replace', find: 'secret', replace: 'x' }], fx.bTok.accessToken), 'B on A kb'],
        [() => kbPatch(k, sha256('A secret kb'), [{ op: 'replace', find: 'secret', replace: 'x' }], fx.bTok.accessToken, wB), 'B work + A kb'],
      ] as const) {
        const result = await run();
        expect(result.message, label).toBe('mcp_not_found');
        expect(String(result.rawDetails ?? ''), label).not.toMatch(/[0-9a-f]{64}|secret/);
      }
      expect(await proposalCount()).toBe(n);
      expect(await chapterBody(c)).toBe(original);
    });

    it('browser sessions and anon are refused; the old (p_content) signature no longer exists', async () => {
      const original = 'acl body';
      const c = await chapter(original);
      const browser = await chapterPatch(c, sha256(original), [{ op: 'replace', find: 'acl', replace: 'x' }], fx.aBrowser);
      expect(browser.message).toBe('live MCP grant required');
      const anon = await chapterPatch(c, sha256(original), [{ op: 'replace', find: 'acl', replace: 'x' }], anonKey);
      expect([401, 403, 404]).toContain(anon.status);
      for (const [fn, body] of [
        ['mcp_propose_chapter_draft', { p_work_id: wA, p_chapter_id: c, p_content: 'old style' }],
        ['mcp_propose_kb_edit', { p_work_id: wA, p_node_id: randomUUID(), p_content: 'old style' }],
      ] as const) {
        const old = await call(fn, fx.aTok.accessToken, body);
        expect(old.status, fn).toBe(404);
      }
      const signatures = (await fx.query(`select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in ('mcp_propose_chapter_draft', 'mcp_propose_kb_edit') order by 1`)).map((r) => r.sig);
      expect(signatures).toEqual(['mcp_propose_chapter_draft(uuid,uuid,text,jsonb)', 'mcp_propose_kb_edit(uuid,uuid,text,jsonb)']);
      expect(await proposalCount()).toBe(0);
    });
  });
});
