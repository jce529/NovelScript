import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertDisposableRef } from '../helpers/disposable-ref';
import {
  insertChapter, insertWork, proposalEnvReady, setupProposalFixture, sha256,
  type ProposalFixture,
} from '../helpers/proposals-db';

/**
 * 14-01 MCP-05: mcp_propose_chapter_draft on the disposable Supabase project (0041).
 * Only pending proposal rows are created; chapters.content never changes. One pending draft
 * per chapter (supersede), same connection + same text is idempotent, expired pending rows
 * do not block, the per-writer pending cap is 50. SUPABASE_DB_URL marks this file for the
 * serialized db project; the suite never applies migrations or prints secrets.
 */
const ready = proposalEnvReady && Boolean(process.env.SUPABASE_DB_URL);

type Proposed = { id: string; status: string; expires_at: string; superseded_id: string | null };

describe.skipIf(!ready)('mcp_propose_chapter_draft (0041)', () => {
  let fx: ProposalFixture;
  let wA: string; let wA2: string; let wAdel: string; let wB: string;
  let cDraft: string; let cPub: string; let cDeleted: string; let cInDeletedWork: string; let cB: string;
  let cCap: string;
  const ORIGINAL = '첫 문단입니다.\n\n둘째 문단 🌙\n';

  const propose = (bearer: string, workId: string, chapterId: string, content: string) =>
    fx.rpc('mcp_propose_chapter_draft', bearer, { p_work_id: workId, p_chapter_id: chapterId, p_content: content });
  const chapterBodies = () => fx.query(
    'select id, content, updated_at from public.chapters where work_id = any($1::uuid[]) order by id',
    [[wA, wA2, wAdel, wB]],
  );
  const pendingFor = (chapterId: string) => fx.query(
    "select id, status from public.mcp_proposals where chapter_id = $1 and status = 'pending'", [chapterId],
  );

  beforeAll(async () => {
    assertDisposableRef();
    fx = await setupProposalFixture('draft');
    wA = await insertWork(fx, fx.writerA.id, 'proposal draft A');
    wA2 = await insertWork(fx, fx.writerA.id, 'proposal draft A2');
    wAdel = await insertWork(fx, fx.writerA.id, 'proposal draft A deleted', true);
    wB = await insertWork(fx, fx.writerB.id, 'proposal draft B');
    cDraft = await insertChapter(fx, wA, ORIGINAL, { orderIndex: 1 });
    cPub = await insertChapter(fx, wA, 'published body', { orderIndex: 2, published: true });
    cDeleted = await insertChapter(fx, wA, 'deleted body', { orderIndex: 3, deleted: true });
    cCap = await insertChapter(fx, wA, 'cap body', { orderIndex: 4 });
    cInDeletedWork = await insertChapter(fx, wAdel, 'in deleted work', { orderIndex: 1 });
    cB = await insertChapter(fx, wB, 'B body', { orderIndex: 1, published: true });
  }, 180_000);

  afterAll(async () => {
    await fx?.cleanup();
  }, 180_000);

  it('saves a pending draft for an owned chapter and leaves the chapter body unchanged', async () => {
    const before = await chapterBodies();
    const result = await propose(fx.aTok.accessToken, wA, cDraft, '첫 문단입니다.\r\n\r\n바뀐 둘째 문단\r\n');
    expect(result.status).toBe(200);
    const data = result.json as Proposed;
    expect(Object.keys(data).sort()).toEqual(['expires_at', 'id', 'status', 'superseded_id']);
    expect(data.status).toBe('pending');
    expect(data.superseded_id).toBeNull();
    const days = (Date.parse(data.expires_at) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);

    const [row] = await fx.query('select * from public.mcp_proposals where id = $1', [data.id]);
    expect(row).toMatchObject({
      owner_id: fx.writerA.id, work_id: wA, kind: 'chapter_draft', chapter_id: cDraft, node_id: null,
      status: 'pending', content: '첫 문단입니다.\n\n바뀐 둘째 문단\n',
      base_content: ORIGINAL, base_hash: sha256(ORIGINAL),
      source_client_id: fx.aTok.clientId, source_client_name: fx.aTok.clientName, source_host: 'claude.ai',
      decision: null, undo_content: null, applied_hash: null, created_node_id: null,
    });
    expect(row.content_hash).toBe(sha256('첫 문단입니다.\n\n바뀐 둘째 문단\n'));
    expect(await chapterBodies()).toEqual(before);
  });

  it('accepts a published chapter too (publication state is irrelevant)', async () => {
    const result = await propose(fx.aTok.accessToken, wA, cPub, 'published body, revised');
    expect(result.status).toBe(200);
    expect((result.json as Proposed).status).toBe('pending');
    expect((await fx.query('select content from public.chapters where id = $1', [cPub]))[0].content).toBe('published body');
  });

  it('returns the same id when the same connection retries the same text', async () => {
    const first = await propose(fx.aTok.accessToken, wA, cDraft, '첫 문단입니다.\n\n바뀐 둘째 문단\n');
    expect(first.status).toBe(200);
    const again = await propose(fx.aTok.accessToken, wA, cDraft, '첫 문단입니다.\r\n\r\n바뀐 둘째 문단\r\n');
    expect(again.status).toBe(200);
    expect((again.json as Proposed).id).toBe((first.json as Proposed).id);
    expect((again.json as Proposed).superseded_id).toBeNull();
    expect(await pendingFor(cDraft)).toHaveLength(1);
  });

  it('supersedes the previous pending draft of the same chapter on different text or another connection', async () => {
    const [previous] = await pendingFor(cDraft);
    const next = await propose(fx.aTok.accessToken, wA, cDraft, '완전히 새 초안');
    expect(next.status).toBe(200);
    const nextData = next.json as Proposed;
    expect(nextData.id).not.toBe(previous.id);
    expect(nextData.superseded_id).toBe(previous.id);
    const [old] = await fx.query('select status, decided_at from public.mcp_proposals where id = $1', [previous.id]);
    expect(old.status).toBe('superseded');
    expect(old.decided_at).not.toBeNull();

    // Same text from a second connection of the same writer is a new proposal, not a dedupe.
    const other = await propose(fx.aTok2.accessToken, wA, cDraft, '완전히 새 초안');
    expect(other.status).toBe(200);
    expect((other.json as Proposed).superseded_id).toBe(nextData.id);
    const pending = await pendingFor(cDraft);
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe((other.json as Proposed).id);
    expect((await fx.query('select content from public.chapters where id = $1', [cDraft]))[0].content).toBe(ORIGINAL);
  });

  it('enforces one pending draft per chapter in the DB (mcp_proposals_one_pending_draft)', async () => {
    const [pending] = await fx.query(
      "select * from public.mcp_proposals where chapter_id = $1 and status = 'pending'", [cDraft]);
    await expect(fx.query(`insert into public.mcp_proposals
        (owner_id, work_id, kind, chapter_id, content, content_hash, base_content, base_hash,
         source_client_id, source_client_name, source_host)
      values ($1, $2, 'chapter_draft', $3, 'dup', $4, '', $5, $6, 'x', 'x')`,
    [fx.writerA.id, wA, cDraft, sha256('dup'), sha256(''), pending.source_client_id]))
      .rejects.toMatchObject({ code: '23505' });
  });

  it('does not let an expired pending draft block a new one', async () => {
    const [pending] = await pendingFor(cDraft);
    await fx.query("update public.mcp_proposals set expires_at = now() - interval '1 minute' where id = $1", [pending.id]);
    const fresh = await propose(fx.aTok.accessToken, wA, cDraft, '만료 뒤 새 초안');
    expect(fresh.status).toBe(200);
    expect((fresh.json as Proposed).superseded_id).toBeNull();
    const [old] = await fx.query('select status from public.mcp_proposals where id = $1', [pending.id]);
    expect(old.status).toBe('expired');
    expect(await pendingFor(cDraft)).toHaveLength(1);
  });

  it('refuses other writers, deleted chapters, deleted works and mismatched work ids with mcp_not_found', async () => {
    const before = await chapterBodies();
    const count = async () => (await fx.query('select count(*)::int as n from public.mcp_proposals where owner_id = any($1::uuid[])',
      [[fx.writerA.id, fx.writerB.id]]))[0].n as number;
    const n = await count();
    for (const [bearer, workId, chapterId, label] of [
      [fx.bTok.accessToken, wA, cDraft, 'B token on A chapter'],
      [fx.bTok.accessToken, wB, cDraft, 'B work id with A chapter'],
      [fx.aTok.accessToken, wB, cB, 'A token on B chapter'],
      [fx.aTok.accessToken, wA, cDeleted, 'deleted chapter'],
      [fx.aTok.accessToken, wAdel, cInDeletedWork, 'chapter in deleted work'],
      [fx.aTok.accessToken, wA2, cDraft, 'chapter under the wrong work'],
      [fx.aTok.accessToken, wA, randomUUID(), 'unknown chapter'],
    ] as const) {
      const result = await propose(bearer, workId, chapterId, `cross ${label}`);
      expect(result.status, label).not.toBe(200);
      expect(result.message, label).toBe('mcp_not_found');
    }
    expect(await count()).toBe(n);
    expect(await chapterBodies()).toEqual(before);
  });

  it('validates content: blank, over 100000 chars, unchanged text and NUL are refused; CRLF is normalized', async () => {
    for (const [content, message] of [
      ['', 'mcp_invalid_content'],
      [' \n\t\r\n ', 'mcp_invalid_content'],
      ['가'.repeat(100_001), 'mcp_invalid_content'],
      ['cap body', 'mcp_no_change'],
    ] as const) {
      const result = await propose(fx.aTok.accessToken, wA, cCap, content);
      expect(result.status, message).not.toBe(200);
      expect(result.message).toBe(message);
    }
    const nul = await propose(fx.aTok.accessToken, wA, cCap, 'a\u0000b');
    expect(nul.status).not.toBe(200);
    expect(await pendingFor(cCap)).toHaveLength(0);

    const max = await propose(fx.aTok.accessToken, wA, cCap, 'x'.repeat(100_000));
    expect(max.status).toBe(200);
  });

  it('refuses browser sessions and anonymous callers', async () => {
    for (const bearer of [fx.aBrowser, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!]) {
      const result = await propose(bearer, wA, cPub, 'from a browser');
      expect([401, 403, 404]).toContain(result.status);
    }
    const browser = await propose(fx.aBrowser, wA, cPub, 'from a browser');
    expect(browser.message).toBe('live MCP grant required');
  });

  it('refuses a suspended writer (mcp_suspended) and a connection without propose_draft (mcp_scope_denied)', async () => {
    await fx.query("select set_config('app.sanction_cache_writer', 'on', false)");
    await fx.query("update public.profiles set sanction_kind = 'suspension', sanctioned_until = now() + interval '1 day' where id = $1", [fx.writerA.id]);
    try {
      const suspended = await propose(fx.aTok.accessToken, wA, cPub, 'while suspended');
      expect(suspended.status).toBe(403);
      expect(suspended.message).toBe('mcp_suspended');
    } finally {
      await fx.query("update public.profiles set sanction_kind = 'none', sanctioned_until = null where id = $1", [fx.writerA.id]);
    }

    // mcp_connections' CHECK always requires both scopes, so the scope-less state is simulated
    // inside a rolled-back transaction with the CHECK dropped.
    const [constraint] = await fx.query(`select conname from pg_constraint
      where conrelid = 'public.mcp_connections'::regclass and contype = 'c'
        and pg_get_constraintdef(oid) like '%propose_draft%'`);
    const scoped = await fx.asClaims({ ...fx.aTok.claims, role: 'authenticated' },
      () => fx.outcome('select public.mcp_propose_chapter_draft($1, $2, $3) as r', [wA, cPub, 'no scope']),
      async () => {
        await fx.query(`alter table public.mcp_connections drop constraint "${String(constraint.conname)}"`);
        await fx.query("update public.mcp_connections set scopes = array['read'] where oauth_client_id = $1", [fx.aTok.clientId]);
      });
    expect(scoped).toMatchObject({ code: '42501', message: 'mcp_scope_denied' });
    const [scopes] = await fx.query('select scopes from public.mcp_connections where oauth_client_id = $1', [fx.aTok.clientId]);
    expect(scopes.scopes).toEqual(['read', 'propose_draft']);
  });

  it('caps live pending proposals at 50 per writer; superseding needs no extra capacity', async () => {
    const [{ n }] = await fx.query(
      "select count(*)::int as n from public.mcp_proposals where owner_id = $1 and status = 'pending' and expires_at > now()",
      [fx.writerA.id]);
    const fill = 50 - (n as number);
    expect(fill).toBeGreaterThan(0);
    await fx.query(`insert into public.mcp_proposals
        (owner_id, work_id, kind, proposed_category, proposed_name, content, content_hash,
         source_client_id, source_client_name, source_host)
      select $1, $2, 'kb_create', '인물', 'cap ' || g, 'cap content ' || g,
             encode(sha256(convert_to('cap content ' || g, 'UTF8')), 'hex'), $3, 'cap', 'claude.ai'
      from generate_series(1, $4::int) as g`, [fx.writerA.id, wA2, fx.aTok.clientId, fill]);

    const newChapter = await insertChapter(fx, wA, 'cap target', { orderIndex: 5 });
    const refused = await propose(fx.aTok.accessToken, wA, newChapter, '51번째');
    expect(refused.status).not.toBe(200);
    expect(refused.message).toBe('mcp_cap_reached');
    expect(await pendingFor(newChapter)).toHaveLength(0);

    // Replacing the pending draft of cCap keeps the count at 50.
    const replace = await propose(fx.aTok.accessToken, wA, cCap, '대체 초안');
    expect(replace.status).toBe(200);
    expect((replace.json as Proposed).superseded_id).not.toBeNull();

    // An expired pending row frees capacity.
    await fx.query(`update public.mcp_proposals set expires_at = now() - interval '1 minute'
      where id = (select id from public.mcp_proposals where owner_id = $1 and proposed_name = 'cap 1')`, [fx.writerA.id]);
    const freed = await propose(fx.aTok.accessToken, wA, newChapter, '공간이 생긴 뒤');
    expect(freed.status).toBe(200);
    const [{ live }] = await fx.query(
      "select count(*)::int as live from public.mcp_proposals where owner_id = $1 and status = 'pending' and expires_at > now()",
      [fx.writerA.id]);
    expect(live).toBe(50);
  });

  it('serializes concurrent saves for one chapter into a single pending row', async () => {
    const target = await insertChapter(fx, wA, 'race body', { orderIndex: 6 });
    await fx.query("delete from public.mcp_proposals where owner_id = $1 and kind = 'kb_create'", [fx.writerA.id]);
    const results = await Promise.all(['경합 1', '경합 2', '경합 3', '경합 4'].map((text) =>
      propose(fx.aTok.accessToken, wA, target, text)));
    for (const result of results) expect(result.status).toBe(200);
    expect(await pendingFor(target)).toHaveLength(1);
    const [{ superseded }] = await fx.query(
      "select count(*)::int as superseded from public.mcp_proposals where chapter_id = $1 and status = 'superseded'", [target]);
    expect(superseded).toBe(3);
  });
});
