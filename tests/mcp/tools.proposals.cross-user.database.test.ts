import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertDisposableRef } from '../helpers/disposable-ref';
import { callTool, type McpToolCallResult } from '../helpers/mcp-oauth';
import {
  insertChapter, insertKbNode, insertWork, proposalEnvReady, setupProposalFixture, type ProposalFixture,
} from '../helpers/proposals-db';

/**
 * 14-02 MCP-05/06: the two proposal tools (save_draft, propose_kb_document), called through the
 * real /mcp route with real Supabase OAuth tokens on a disposable project (0037 -> 0038 ->
 * 0039 -> 0041 applied). Writer A's valid calls succeed first, so the refusals below are
 * meaningful. Writer B's bearer, given A's workId / chapterId / nodeId (alone or mixed with
 * B's own work), only ever gets the fixed "missing" answer: A's pending proposals and
 * original text stay unchanged, B gains no proposal row, and no response carries A's text,
 * A's IDs or a raw SQL fragment.
 * SUPABASE_DB_URL marks this file for vitest's serialized db project; fixtures go in over a
 * superuser connection (proposals only through the bearer RPCs). Never prints tokens or bodies.
 */
const MISSING = '요청한 항목을 찾을 수 없습니다.';
const INPUT = '입력값을 확인해주세요.';
const SQL_LEAK = /PGRST|permission denied|violates|relation "|column "|syntax error|42501|P0001|22023|mcp_[a-z_]+|row-level security|JWT/i;

describe.skipIf(!proposalEnvReady)('MCP proposal tools: two-user OAuth injection', () => {
  let fx: ProposalFixture;
  const secret = `ASECRET${randomBytes(6).toString('hex')}`;
  const ids = {} as Record<'wA' | 'cA' | 'kFolderA' | 'kA' | 'wB' | 'cB', string>;
  const aPending: string[] = [];
  const aIds = () => [ids.wA, ids.cA, ids.kFolderA, ids.kA, ...aPending];

  function expectNoLeak(result: McpToolCallResult, label: string) {
    expect(result.raw.includes(secret), `${label} leaks A text`).toBe(false);
    expect(SQL_LEAK.test(result.raw), `${label} leaks a SQL fragment`).toBe(false);
  }
  function expectRefused(result: McpToolCallResult, label: string, message = MISSING) {
    expect(result.status, label).toBe(200);
    expect(result.jsonRpcError, label).toBe(false);
    expect(result.isError, label).toBe(true);
    expect(result.text, label).toBe(message);
    expectNoLeak(result, label);
    for (const id of aIds()) expect(result.raw.includes(id), `${label} echoes an A id`).toBe(false);
  }
  function expectPending(result: McpToolCallResult, label: string) {
    expect(result.status, label).toBe(200);
    expect(result.isError, `${label}: ${result.isError ? result.text : ''}`).toBe(false);
    const data = result.data as { proposalId: string; status: string; reviewUrl: string; message: string };
    expect(data.status, label).toBe('pending');
    expect(data.reviewUrl, label).toContain(`/studio/${ids.wA}/review/${data.proposalId}`);
    expect(data.message, label).toMatch(/수락해야 반영/);
    return data.proposalId;
  }
  async function snapshot() {
    const [chapter] = await fx.query('select content from public.chapters where id = $1', [ids.cA]);
    const [node] = await fx.query('select content, name from public.kb_nodes where id = $1', [ids.kA]);
    const nodes = await fx.query('select count(*)::int as n from public.kb_nodes where owner_id = $1', [fx.writerA.id]);
    const proposals = await fx.query(
      'select id, status, content, kind from public.mcp_proposals where owner_id = $1 order by id', [fx.writerA.id]);
    const bRows = await fx.query('select count(*)::int as n from public.mcp_proposals where owner_id = $1', [fx.writerB.id]);
    return {
      chapter: chapter.content as string, node: `${node.name}|${node.content}`, nodeCount: nodes[0].n as number,
      proposals: proposals.map((row) => `${row.id}|${row.kind}|${row.status}|${row.content}`), bRows: bRows[0].n as number,
    };
  }

  beforeAll(async () => {
    assertDisposableRef();
    fx = await setupProposalFixture('tools-xuser');
    ids.wA = await insertWork(fx, fx.writerA.id, `A work ${secret}`);
    ids.cA = await insertChapter(fx, ids.wA, `A body ${secret}`);
    ids.kFolderA = await insertKbNode(fx, { ownerId: fx.writerA.id, workId: ids.wA, nodeType: 'folder', category: '인물', name: 'A people' });
    ids.kA = await insertKbNode(fx, {
      ownerId: fx.writerA.id, workId: ids.wA, parentId: ids.kFolderA, category: '인물', name: `A doc ${secret}`, content: `A doc ${secret}`,
    });
    ids.wB = await insertWork(fx, fx.writerB.id, 'B work');
    ids.cB = await insertChapter(fx, ids.wB, 'B body');
  }, 180_000);

  afterAll(async () => {
    if (fx) await fx.cleanup();
  }, 120_000);

  it('A saves its own draft and KB proposals through the route (the test is live)', async () => {
    aPending.push(expectPending(await callTool(fx.aTok.accessToken, 'save_draft', {
      workId: ids.wA, chapterId: ids.cA, content: 'A 초안 제안 본문',
    }), 'A save_draft'));
    aPending.push(expectPending(await callTool(fx.aTok.accessToken, 'propose_kb_document', {
      mode: 'edit', workId: ids.wA, nodeId: ids.kA, content: 'A 설정 수정안',
    }), 'A kb edit'));
    aPending.push(expectPending(await callTool(fx.aTok.accessToken, 'propose_kb_document', {
      mode: 'create', workId: ids.wA, category: '장소', name: 'A 새 장소', content: 'A 새 장소 설정',
    }), 'A kb create'));
    // Same connection, same text: the dedupe behind idempotentHint returns the same id.
    const again = await callTool(fx.aTok.accessToken, 'save_draft', { workId: ids.wA, chapterId: ids.cA, content: 'A 초안 제안 본문' });
    expect(expectPending(again, 'A save_draft retry')).toBe(aPending[0]);
    const state = await snapshot();
    expect(state.proposals).toHaveLength(3);
    expect(state.proposals.every((row) => row.includes('|pending|'))).toBe(true);
    // Saving a proposal never touches the originals.
    expect(state.chapter).toBe(`A body ${secret}`);
    expect(state.node).toBe(`A doc ${secret}|A doc ${secret}`);
  });

  it("B's bearer with A's IDs gets only the fixed not-found answer and changes nothing", async () => {
    const before = await snapshot();
    expect(before.bRows).toBe(0);
    const attempts: Array<[string, string, Record<string, unknown>]> = [
      ['save_draft A work+chapter', 'save_draft', { workId: ids.wA, chapterId: ids.cA, content: 'B 덮어쓰기' }],
      ['save_draft B work + A chapter', 'save_draft', { workId: ids.wB, chapterId: ids.cA, content: 'B 덮어쓰기' }],
      ['save_draft A work + B chapter', 'save_draft', { workId: ids.wA, chapterId: ids.cB, content: 'B 덮어쓰기' }],
      ['kb edit A work+node', 'propose_kb_document', { mode: 'edit', workId: ids.wA, nodeId: ids.kA, content: 'B 수정' }],
      ['kb edit B work + A node', 'propose_kb_document', { mode: 'edit', workId: ids.wB, nodeId: ids.kA, content: 'B 수정' }],
      ['kb create in A work', 'propose_kb_document', { mode: 'create', workId: ids.wA, category: '인물', name: 'B 인물', content: 'B 설정' }],
    ];
    for (const [label, name, args] of attempts) expectRefused(await callTool(fx.bTok.accessToken, name, args), label);
    expect(await snapshot()).toEqual(before);
  });

  it('identity, owner and source arguments are refused as input errors before any write', async () => {
    const before = await snapshot();
    const attempts: Array<[string, string, Record<string, unknown>]> = [
      ['save_draft userId', 'save_draft', { workId: ids.wA, chapterId: ids.cA, content: 'x', userId: fx.writerA.id }],
      ['save_draft ownerId', 'save_draft', { workId: ids.wA, chapterId: ids.cA, content: 'x', ownerId: fx.writerA.id }],
      ['kb edit source', 'propose_kb_document', { mode: 'edit', workId: ids.wA, nodeId: ids.kA, content: 'x', source: 'A' }],
      ['kb create ownerId', 'propose_kb_document', { mode: 'create', workId: ids.wA, category: '인물', name: 'n', content: 'x', ownerId: fx.writerA.id }],
    ];
    for (const [label, name, args] of attempts) {
      const result = await callTool(fx.bTok.accessToken, name, args);
      expect(result.status, label).toBe(200);
      expect(result.isError, label).toBe(true);
      expectNoLeak(result, label);
      // The SDK may reject the strict schema itself or the wrapper may; neither path writes.
      if (!result.jsonRpcError && result.text !== null && !/Input validation/i.test(result.text)) {
        expect(result.text, label).toBe(INPUT);
      }
    }
    expect(await snapshot()).toEqual(before);
  });

  it("A's pending proposals stay pending and untouched after B's attempts", async () => {
    const state = await snapshot();
    expect(state.proposals).toHaveLength(3);
    for (const id of aPending) expect(state.proposals.some((row) => row.startsWith(`${id}|`) && row.includes('|pending|'))).toBe(true);
    expect(state.bRows).toBe(0);
    expect(state.chapter).toBe(`A body ${secret}`);
  });
});
