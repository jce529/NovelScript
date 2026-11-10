import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertDisposableRef } from '../helpers/disposable-ref';
import { issueMcpToken } from '../helpers/mcp-oauth';
import {
  insertChapter, insertKbNode, insertWork, proposalEnvReady, setupProposalFixture, sha256,
  type ProposalFixture,
} from '../helpers/proposals-db';

/**
 * 14-01 MCP-07: the source snapshot (client id / name / host) and the base snapshot (verbatim
 * original + sha256) are filled by the RPC from mcp_connections and the stored original, never
 * from caller input, and survive a disconnect. Bearers cannot read or write mcp_proposals over
 * REST; browsers read only their own rows. SUPABASE_DB_URL marks this file for the db project.
 */
const ready = proposalEnvReady && Boolean(process.env.SUPABASE_DB_URL);

type Proposed = { id: string };

describe.skipIf(!ready)('proposal source and base snapshots (0041)', () => {
  let fx: ProposalFixture;
  let wA: string; let cA: string; let cA2: string; let kA: string;
  const ORIGINAL = '원문 그대로\r\n윈도우 줄바꿈이 섞인 🌊 본문\n';

  beforeAll(async () => {
    assertDisposableRef();
    fx = await setupProposalFixture('source');
    wA = await insertWork(fx, fx.writerA.id, 'proposal source A');
    cA = await insertChapter(fx, wA, ORIGINAL, { orderIndex: 1 });
    cA2 = await insertChapter(fx, wA, 'second', { orderIndex: 2 });
    kA = await insertKbNode(fx, { ownerId: fx.writerA.id, workId: wA, category: '세력', name: '길드', content: '길드 설정' });
  }, 180_000);

  afterAll(async () => {
    await fx?.cleanup();
  }, 180_000);

  it('stores the connection client name, host and id from mcp_connections', async () => {
    const result = await fx.rpc('mcp_propose_chapter_draft', fx.aTok.accessToken,
      { p_work_id: wA, p_chapter_id: cA, p_base_hash: sha256(ORIGINAL), p_edits: [{ op: 'replaceAll', content: '새 초안' }] });
    expect(result.status).toBe(200);
    const [row] = await fx.query(
      'select source_client_id, source_client_name, source_host, base_content, base_hash from public.mcp_proposals where id = $1',
      [(result.json as Proposed).id]);
    const [connection] = await fx.query(
      'select client_name, redirect_host from public.mcp_connections where oauth_client_id = $1', [fx.aTok.clientId]);
    expect(row).toEqual({
      source_client_id: fx.aTok.clientId,
      source_client_name: connection.client_name,
      source_host: connection.redirect_host,
      // The base is stored verbatim (no CRLF normalization) so it hashes like the live body.
      base_content: ORIGINAL,
      base_hash: sha256(ORIGINAL),
    });
    expect(row.source_client_name).toBe(fx.aTok.clientName);
    const [{ db_hash }] = await fx.query(
      "select encode(sha256(convert_to(content, 'UTF8')), 'hex') as db_hash from public.chapters where id = $1", [cA]);
    expect(db_hash).toBe(row.base_hash);
  });

  it('ignores caller-supplied source or owner fields (no such RPC arguments)', async () => {
    for (const extra of [
      { p_source_client_name: 'Forged' },
      { p_source_host: 'evil.example' },
      { p_owner_id: fx.writerB.id },
    ]) {
      const result = await fx.rpc('mcp_propose_chapter_draft', fx.aTok.accessToken,
        { p_work_id: wA, p_chapter_id: cA2, p_base_hash: sha256('second'), p_edits: [{ op: 'replaceAll', content: 'forged' }], ...extra });
      expect(result.status).not.toBe(200);
    }
    const rows = await fx.query('select source_client_name from public.mcp_proposals where chapter_id = $1', [cA2]);
    expect(rows).toHaveLength(0);
  });

  it('bearers cannot read or write mcp_proposals over REST; browsers read only their own rows', async () => {
    const [{ n: before }] = await fx.query('select count(*)::int as n from public.mcp_proposals where owner_id = $1', [fx.writerA.id]);
    const read = await fx.rest('GET', 'mcp_proposals?select=id,source_client_name', fx.aTok.accessToken);
    expect([200, 401, 403]).toContain(read.status);
    if (read.status === 200) expect(read.json).toEqual([]);
    const insert = await fx.rest('POST', 'mcp_proposals', fx.aTok.accessToken, {
      owner_id: fx.writerA.id, work_id: wA, kind: 'kb_create', proposed_category: '인물', proposed_name: 'rest',
      content: 'x', content_hash: sha256('x'), source_client_id: fx.aTok.clientId, source_client_name: 'Forged', source_host: 'evil',
    });
    expect([401, 403]).toContain(insert.status);

    const browserOwn = await fx.rest('GET', 'mcp_proposals?select=id,source_client_name,source_host', fx.aBrowser);
    expect(browserOwn.status).toBe(200);
    expect((browserOwn.json as unknown[]).length).toBe(before);
    expect(browserOwn.json).toEqual(expect.arrayContaining([
      expect.objectContaining({ source_client_name: fx.aTok.clientName, source_host: 'claude.ai' }),
    ]));
    const browserOther = await fx.rest('GET', 'mcp_proposals?select=id', fx.bBrowser);
    expect(browserOther.status).toBe(200);
    expect(browserOther.json).toEqual([]);
    expect([401, 403]).toContain((await fx.rest('POST', 'mcp_proposals', fx.aBrowser, {
      owner_id: fx.writerA.id, work_id: wA, kind: 'kb_create', proposed_category: '인물', proposed_name: 'browser',
      content: 'x', content_hash: sha256('x'), source_client_id: fx.aTok.clientId, source_client_name: 'b', source_host: 'b',
    })).status);
  });

  it('keeps the source snapshot after the connection is revoked, and the revoked token can no longer propose', async () => {
    const temp = await issueMcpToken(fx.writerA, { clientName: 'mcp-test-source-temp' });
    fx.clientIds.push(temp.clientId);
    const created = await fx.rpc('mcp_propose_kb_edit', temp.accessToken,
      { p_work_id: wA, p_node_id: kA, p_base_hash: sha256('길드 설정'), p_edits: [{ op: 'replace', find: '설정', replace: '설정 v2' }] });
    expect(created.status).toBe(200);
    const id = (created.json as Proposed).id;

    expect((await fx.writerA.browser.rpc('mcp_disconnect', { p_client_id: temp.clientId })).error).toBeNull();
    const [row] = await fx.query(
      'select status, source_client_id, source_client_name, source_host from public.mcp_proposals where id = $1', [id]);
    expect(row).toEqual({
      status: 'pending', source_client_id: temp.clientId, source_client_name: 'mcp-test-source-temp', source_host: 'claude.ai',
    });

    const after = await fx.rpc('mcp_propose_kb_create', temp.accessToken,
      { p_work_id: wA, p_category: '인물', p_name: 'after revoke', p_content: 'x' });
    expect(after.status).toBe(403);
    expect(after.message).toBe('live MCP grant required');
    expect((await fx.query('select content from public.kb_nodes where id = $1', [kA]))[0].content).toBe('길드 설정');
  });
});
