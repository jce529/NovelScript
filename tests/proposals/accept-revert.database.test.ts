import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashContent } from '@/lib/proposals/hash';
import { assertDisposableRef } from '../helpers/disposable-ref';
import { decodeClaims } from '../helpers/mcp-oauth';
import {
  insertChapter, insertKbNode, insertWork, proposalEnvReady, setupProposalFixture, sha256,
  type ProposalFixture,
} from '../helpers/proposals-db';

/**
 * 14-04 MCP-06/07: the writer's decision RPCs (0042) on the disposable Supabase project.
 * Accept / reject / revert run only in a browser session (OAuth bearer -> 42501), check the
 * owner inside the definer body, compare the original's UTF-8 SHA-256 under a row lock
 * (mcp_stale = nothing changes), and write original + proposal status + undo snapshot in one
 * transaction. Suspended writers may only reject; demoted readers cannot propose, accept or
 * revert. Proposals are seeded over the superuser connection (fewer OAuth registrations);
 * the bearer paths use the fixture tokens. Never prints tokens, URLs or bodies.
 */
const ready = proposalEnvReady && Boolean(process.env.SUPABASE_DB_URL);

type Decided = { id: string; status: string; undo_until: string | null; created_node_id: string | null };

describe.skipIf(!ready)('MCP proposal decisions (0042)', () => {
  let fx: ProposalFixture;
  let wA: string; let wB: string;
  let people: string; let peopleSub: string; let places: string; let customRoot: string;

  const acceptChapter = (bearer: string, id: string, expectedHash: string | null, content: string, decision: unknown = { selections: [0] }) =>
    fx.rpc('accept_mcp_chapter_draft', bearer,
      { p_proposal_id: id, p_expected_hash: expectedHash, p_new_content: content, p_decision: decision });
  const acceptKbEdit = (bearer: string, id: string, expectedHash: string | null, content: string, decision: unknown = { selections: [0] }) =>
    fx.rpc('accept_mcp_kb_edit', bearer,
      { p_proposal_id: id, p_expected_hash: expectedHash, p_new_content: content, p_decision: decision });
  const chapterBody = async (id: string) =>
    (await fx.query('select content, updated_at from public.chapters where id = $1', [id]))[0];
  const nodeRow = async (id: string) =>
    (await fx.query('select content, updated_at, deleted_at, parent_id, category, name, is_locked from public.kb_nodes where id = $1', [id]))[0];
  const proposalRow = async (id: string) =>
    (await fx.query('select * from public.mcp_proposals where id = $1', [id]))[0];

  /** Seeds a pending proposal directly (superuser), with the base snapshot the RPC would take. */
  async function seedChapterProposal(chapterId: string, workId: string, content: string, ownerId = fx.writerA.id) {
    const [{ content: base }] = await fx.query('select content from public.chapters where id = $1', [chapterId]);
    const id = randomUUID();
    await fx.query(`insert into public.mcp_proposals
        (id, owner_id, work_id, kind, chapter_id, content, content_hash, base_content, base_hash,
         source_client_id, source_client_name, source_host)
      values ($1, $2, $3, 'chapter_draft', $4, $5, $6, $7, $8, $9, 'seed', 'claude.ai')`,
    [id, ownerId, workId, chapterId, content, sha256(content), base, sha256(String(base)), fx.aTok.clientId]);
    return { id, base: String(base) };
  }
  async function seedKbEditProposal(nodeId: string, workId: string, content: string, ownerId = fx.writerA.id) {
    const [{ content: raw }] = await fx.query('select content from public.kb_nodes where id = $1', [nodeId]);
    const base = String(raw ?? '');
    const id = randomUUID();
    await fx.query(`insert into public.mcp_proposals
        (id, owner_id, work_id, kind, node_id, content, content_hash, base_content, base_hash,
         source_client_id, source_client_name, source_host)
      values ($1, $2, $3, 'kb_edit', $4, $5, $6, $7, $8, $9, 'seed', 'claude.ai')`,
    [id, ownerId, workId, nodeId, content, sha256(content), base, sha256(base), fx.aTok.clientId]);
    return { id, base };
  }
  async function seedKbCreateProposal(workId: string, category: string, name: string, content: string, ownerId = fx.writerA.id) {
    const id = randomUUID();
    await fx.query(`insert into public.mcp_proposals
        (id, owner_id, work_id, kind, proposed_category, proposed_name, content, content_hash,
         source_client_id, source_client_name, source_host)
      values ($1, $2, $3, 'kb_create', $4, $5, $6, $7, $8, 'seed', 'claude.ai')`,
    [id, ownerId, workId, category, name, content, sha256(content), fx.aTok.clientId]);
    return { id };
  }
  async function withSuspendedA<T>(fn: () => Promise<T>): Promise<T> {
    await fx.query("select set_config('app.sanction_cache_writer', 'on', false)");
    await fx.query("update public.profiles set sanction_kind = 'suspension', sanctioned_until = now() + interval '1 day' where id = $1", [fx.writerA.id]);
    try {
      return await fn();
    } finally {
      await fx.query("update public.profiles set sanction_kind = 'none', sanctioned_until = null where id = $1", [fx.writerA.id]);
    }
  }

  beforeAll(async () => {
    assertDisposableRef();
    fx = await setupProposalFixture('decide');
    const a = fx.writerA.id;
    wA = await insertWork(fx, a, 'proposal decide A');
    wB = await insertWork(fx, fx.writerB.id, 'proposal decide B');
    people = await insertKbNode(fx, { ownerId: a, workId: wA, nodeType: 'folder', category: '인물', name: '인물', locked: true });
    peopleSub = await insertKbNode(fx, { ownerId: a, workId: wA, parentId: people, nodeType: 'folder', category: '인물', name: '조연' });
    places = await insertKbNode(fx, { ownerId: a, workId: wA, nodeType: 'folder', category: '장소', name: '장소', locked: true });
    customRoot = await insertKbNode(fx, { ownerId: a, workId: wA, nodeType: 'folder', category: 'custom', name: '메모' });
  }, 180_000);

  afterAll(async () => {
    await fx?.cleanup();
  }, 180_000);

  it('SQL mcp_proposal_sha256 equals lib/proposals/hash.ts hashContent (Korean, emoji, newlines)', async () => {
    const samples = [
      '', 'a', '첫 문단입니다.\n\n둘째 문단 🌙\n', '가족 👩‍👩‍👧 이모지\r\n줄바꿈\r끝', '\n\n\n',
      'é é 조합형', '탭\t공백  끝 ', '𝔘𝔫𝔦𝔠𝔬𝔡𝔢 🇰🇷',
    ];
    for (const text of samples) {
      const [row] = await fx.query(
        "select public.mcp_proposal_sha256($1) as h, encode(sha256(convert_to($1, 'UTF8')), 'hex') as raw", [text]);
      expect(row.h, JSON.stringify(text)).toBe(hashContent(text));
      expect(row.raw, JSON.stringify(text)).toBe(hashContent(text));
    }
  });

  describe('accept_mcp_chapter_draft', () => {
    it('atomic: writes the chapter body, accepted status, decision, 7-day undo snapshot and applied hash together', async () => {
      const original = '첫 문단입니다.\r\n\r\n둘째 문단 🌙\n';
      const chapter = await insertChapter(fx, wA, original, { orderIndex: 1 });
      const { id } = await seedChapterProposal(chapter, wA, '첫 문단입니다.\n\n바뀐 둘째 문단\n');
      const before = await chapterBody(chapter);
      const merged = '첫 문단입니다.\r\n\r\n바뀐 둘째 문단\n';
      const result = await acceptChapter(fx.aBrowser, id, hashContent(original), merged, { selections: [{ index: 0 }] });
      expect(result.status, String(result.message)).toBe(200);
      const data = result.json as Decided;
      expect(data).toMatchObject({ id, status: 'accepted', created_node_id: null });

      const after = await chapterBody(chapter);
      expect(after.content).toBe(merged);
      expect(new Date(after.updated_at).getTime()).toBeGreaterThan(new Date(before.updated_at).getTime());
      const row = await proposalRow(id);
      expect(row).toMatchObject({
        status: 'accepted', undo_content: original, applied_hash: sha256(merged),
        decision: { selections: [{ index: 0 }] },
      });
      expect(row.decided_at).not.toBeNull();
      const days = (new Date(row.undo_until).getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(6.9);
      expect(days).toBeLessThan(7.1);
    });

    it('atomic: a failure after the body update rolls back the body and the proposal together', async () => {
      const chapter = await insertChapter(fx, wA, 'atomic original', { orderIndex: 2 });
      const { id } = await seedChapterProposal(chapter, wA, 'atomic draft');
      const claims = { ...decodeClaims(fx.aBrowser), role: 'authenticated' };
      const observed = await fx.asClaims(claims, async () => {
        const call = await fx.outcome('select public.accept_mcp_chapter_draft($1, $2, $3, null::jsonb) as r',
          [id, hashContent('atomic original'), 'atomic accepted']);
        await fx.query('reset role');
        const [chapterRow] = await fx.query('select content from public.chapters where id = $1', [chapter]);
        const [proposal] = await fx.query('select status, undo_content from public.mcp_proposals where id = $1', [id]);
        return { call, content: chapterRow.content, status: proposal.status, undo: proposal.undo_content };
      }, async () => {
        // Forced failure on the proposal update, which runs after the chapter update.
        await fx.query(`create function public.zz_test_0042_fail() returns trigger language plpgsql as $f$
          begin raise exception 'forced_failure'; end; $f$`);
        await fx.query(`create trigger zz_test_0042_fail before update on public.mcp_proposals
          for each row when (new.status = 'accepted') execute function public.zz_test_0042_fail()`);
      });
      expect(observed.call.message).toBe('forced_failure');
      expect(observed).toMatchObject({ content: 'atomic original', status: 'pending', undo: null });
      expect((await chapterBody(chapter)).content).toBe('atomic original');
      expect((await proposalRow(id)).status).toBe('pending');
    });

    it('stale: a changed original raises mcp_stale and changes nothing', async () => {
      const chapter = await insertChapter(fx, wA, 'seen original', { orderIndex: 3 });
      const { id } = await seedChapterProposal(chapter, wA, 'stale draft');
      const seen = hashContent('seen original');
      await fx.query("update public.chapters set content = 'edited in the editor' where id = $1", [chapter]);
      const before = await chapterBody(chapter);
      const result = await acceptChapter(fx.aBrowser, id, seen, 'merged against old');
      expect(result.status).toBe(400);
      expect(result.message).toBe('mcp_stale');
      expect(await chapterBody(chapter)).toEqual(before);
      expect(await proposalRow(id)).toMatchObject({ status: 'pending', undo_content: null, applied_hash: null, decision: null });
      // Null expected hash is stale too.
      expect((await acceptChapter(fx.aBrowser, id, null, 'x')).message).toBe('mcp_stale');
    });

    it('published chapters are accepted (publication state is irrelevant)', async () => {
      const chapter = await insertChapter(fx, wA, 'published original', { orderIndex: 4, published: true });
      const { id } = await seedChapterProposal(chapter, wA, 'published draft');
      const result = await acceptChapter(fx.aBrowser, id, hashContent('published original'), 'published draft');
      expect(result.status, String(result.message)).toBe(200);
      expect((await chapterBody(chapter)).content).toBe('published draft');
    });

    it("refuses another writer's proposal, double accept, expired and deleted targets without changes", async () => {
      const chapter = await insertChapter(fx, wA, 'owner original', { orderIndex: 5 });
      const { id } = await seedChapterProposal(chapter, wA, 'owner draft');
      const hash = hashContent('owner original');
      const cross = await acceptChapter(fx.bBrowser, id, hash, 'B wrote this');
      expect(cross).toMatchObject({ status: 400, message: 'mcp_not_found' });
      expect((await chapterBody(chapter)).content).toBe('owner original');
      // Wrong kind through the other accept RPC.
      expect((await acceptKbEdit(fx.aBrowser, id, hash, 'x')).message).toBe('mcp_not_found');
      // Unknown id.
      expect((await acceptChapter(fx.aBrowser, randomUUID(), hash, 'x')).message).toBe('mcp_not_found');

      expect((await acceptChapter(fx.aBrowser, id, hash, 'owner draft')).status).toBe(200);
      const again = await acceptChapter(fx.aBrowser, id, hashContent('owner draft'), 'second accept');
      expect(again).toMatchObject({ status: 400, message: 'mcp_not_pending' });
      expect((await chapterBody(chapter)).content).toBe('owner draft');

      const expiredChapter = await insertChapter(fx, wA, 'expired original', { orderIndex: 6 });
      const expired = await seedChapterProposal(expiredChapter, wA, 'expired draft');
      await fx.query("update public.mcp_proposals set expires_at = now() - interval '1 second' where id = $1", [expired.id]);
      const late = await acceptChapter(fx.aBrowser, expired.id, hashContent('expired original'), 'expired draft');
      expect(late).toMatchObject({ status: 400, message: 'mcp_expired' });
      expect((await chapterBody(expiredChapter)).content).toBe('expired original');

      const goneChapter = await insertChapter(fx, wA, 'gone original', { orderIndex: 7 });
      const gone = await seedChapterProposal(goneChapter, wA, 'gone draft');
      await fx.query('update public.chapters set deleted_at = now() where id = $1', [goneChapter]);
      const deleted = await acceptChapter(fx.aBrowser, gone.id, hashContent('gone original'), 'gone draft');
      expect(deleted).toMatchObject({ status: 400, message: 'mcp_not_found' });
      expect(await proposalRow(gone.id)).toMatchObject({ status: 'pending' });
    });

    it('validates the merged text length and the decision shape', async () => {
      const chapter = await insertChapter(fx, wA, 'length original', { orderIndex: 8 });
      const { id } = await seedChapterProposal(chapter, wA, 'length draft');
      const hash = hashContent('length original');
      expect((await acceptChapter(fx.aBrowser, id, hash, 'x'.repeat(100_001))).message).toBe('mcp_invalid_content');
      expect((await acceptChapter(fx.aBrowser, id, hash, 'ok', [1, 2])).message).toBe('mcp_invalid_decision');
      expect((await chapterBody(chapter)).content).toBe('length original');
      expect((await proposalRow(id)).status).toBe('pending');
    });
  });

  describe('accept_mcp_kb_edit', () => {
    it('accepts an unlocked live document and keeps undo / applied hash', async () => {
      const node = await insertKbNode(fx, { ownerId: fx.writerA.id, workId: wA, parentId: people, category: '인물', name: '주인공', content: '이름: 하린\n' });
      const { id } = await seedKbEditProposal(node, wA, '이름: 하린\n나이: 17\n');
      const result = await acceptKbEdit(fx.aBrowser, id, hashContent('이름: 하린\n'), '이름: 하린\n나이: 17\n');
      expect(result.status, String(result.message)).toBe(200);
      expect((await nodeRow(node)).content).toBe('이름: 하린\n나이: 17\n');
      expect(await proposalRow(id)).toMatchObject({ status: 'accepted', undo_content: '이름: 하린\n', applied_hash: sha256('이름: 하린\n나이: 17\n') });
    });

    it('accepts a document whose content was null (hash of empty text)', async () => {
      const node = await insertKbNode(fx, { ownerId: fx.writerA.id, workId: wA, parentId: customRoot, category: 'custom', name: '빈 메모', content: null });
      const { id } = await seedKbEditProposal(node, wA, '새 메모');
      const result = await acceptKbEdit(fx.aBrowser, id, hashContent(''), '새 메모');
      expect(result.status, String(result.message)).toBe(200);
      expect(await proposalRow(id)).toMatchObject({ undo_content: '' });
    });

    it('refuses locked, deleted, stale and over-long edits without changes', async () => {
      const a = fx.writerA.id;
      const locked = await insertKbNode(fx, { ownerId: a, workId: wA, parentId: people, category: '인물', name: '잠긴 인물', content: 'locked', locked: true });
      const lockedP = await seedKbEditProposal(locked, wA, 'unlock me');
      expect((await acceptKbEdit(fx.aBrowser, lockedP.id, hashContent('locked'), 'unlock me')).message).toBe('mcp_not_found');
      expect((await nodeRow(locked)).content).toBe('locked');

      const deleted = await insertKbNode(fx, { ownerId: a, workId: wA, parentId: people, category: '인물', name: '지울 인물', content: 'alive' });
      const deletedP = await seedKbEditProposal(deleted, wA, 'revive');
      await fx.query('update public.kb_nodes set deleted_at = now() where id = $1', [deleted]);
      expect((await acceptKbEdit(fx.aBrowser, deletedP.id, hashContent('alive'), 'revive')).message).toBe('mcp_not_found');
      expect((await nodeRow(deleted)).content).toBe('alive');

      const stale = await insertKbNode(fx, { ownerId: a, workId: wA, parentId: people, category: '인물', name: '바뀐 인물', content: 'v1' });
      const staleP = await seedKbEditProposal(stale, wA, 'v-ai');
      await fx.query("update public.kb_nodes set content = 'v2' where id = $1", [stale]);
      expect((await acceptKbEdit(fx.aBrowser, staleP.id, hashContent('v1'), 'v-ai')).message).toBe('mcp_stale');
      expect((await nodeRow(stale)).content).toBe('v2');
      expect((await acceptKbEdit(fx.aBrowser, staleP.id, hashContent('v2'), 'x'.repeat(50_001))).message).toBe('mcp_invalid_content');
      for (const p of [lockedP, deletedP, staleP]) expect((await proposalRow(p.id)).status).toBe('pending');
    });
  });

  describe('suspended and demoted accounts', () => {
    it('suspended writers cannot accept', async () => {
      const chapter = await insertChapter(fx, wA, 'suspended original', { orderIndex: 20 });
      const pending = await seedChapterProposal(chapter, wA, 'suspended draft');
      const node = await insertKbNode(fx, { ownerId: fx.writerA.id, workId: wA, parentId: people, category: '인물', name: '정지 인물', content: 'kb v1' });
      const kbPending = await seedKbEditProposal(node, wA, 'kb v2');

      await withSuspendedA(async () => {
        const chapterTry = await acceptChapter(fx.aBrowser, pending.id, hashContent('suspended original'), 'suspended draft');
        expect(chapterTry).toMatchObject({ status: 403, message: 'mcp_suspended' });
        const kbTry = await acceptKbEdit(fx.aBrowser, kbPending.id, hashContent('kb v1'), 'kb v2');
        expect(kbTry).toMatchObject({ status: 403, message: 'mcp_suspended' });
      });
      expect((await chapterBody(chapter)).content).toBe('suspended original');
      expect((await nodeRow(node)).content).toBe('kb v1');
      expect((await proposalRow(pending.id)).status).toBe('pending');
      expect((await proposalRow(kbPending.id)).status).toBe('pending');
    });

    it('a writer demoted to reader: the old bearer cannot propose, the browser cannot accept or revert', async () => {
      const chapter = await insertChapter(fx, wA, 'demoted original', { orderIndex: 30 });
      const node = await insertKbNode(fx, { ownerId: fx.writerA.id, workId: wA, parentId: people, category: '인물', name: '강등 인물', content: 'demoted kb' });
      const pending = await seedChapterProposal(chapter, wA, 'demoted draft');
      const acceptedChapter = await insertChapter(fx, wA, 'demoted accepted original', { orderIndex: 31 });
      const accepted = await seedChapterProposal(acceptedChapter, wA, 'demoted accepted draft');
      expect((await acceptChapter(fx.aBrowser, accepted.id, hashContent('demoted accepted original'), 'demoted accepted draft')).status).toBe(200);
      const proposalsBefore = (await fx.query('select count(*)::int as n from public.mcp_proposals where owner_id = $1', [fx.writerA.id]))[0].n;

      await fx.query("update public.profiles set role = 'reader' where id = $1", [fx.writerA.id]);
      try {
        for (const [fn, body] of [
          ['mcp_propose_chapter_draft', { p_work_id: wA, p_chapter_id: chapter, p_content: 'reader draft' }],
          ['mcp_propose_kb_edit', { p_work_id: wA, p_node_id: node, p_content: 'reader edit' }],
          ['mcp_propose_kb_create', { p_work_id: wA, p_category: '인물', p_name: '리더 신규', p_content: 'reader new' }],
        ] as const) {
          const result = await fx.rpc(fn, fx.aTok.accessToken, body);
          expect(result, fn).toMatchObject({ status: 403, message: 'active writer required' });
        }
        const acceptTry = await acceptChapter(fx.aBrowser, pending.id, hashContent('demoted original'), 'demoted draft');
        expect(acceptTry).toMatchObject({ status: 403, message: 'active writer required' });
      } finally {
        await fx.query("update public.profiles set role = 'writer' where id = $1", [fx.writerA.id]);
      }
      expect((await fx.query('select count(*)::int as n from public.mcp_proposals where owner_id = $1', [fx.writerA.id]))[0].n)
        .toBe(proposalsBefore);
      expect((await chapterBody(chapter)).content).toBe('demoted original');
      expect((await chapterBody(acceptedChapter)).content).toBe('demoted accepted draft');
      expect((await proposalRow(pending.id)).status).toBe('pending');
      expect((await proposalRow(accepted.id)).status).toBe('accepted');
      // Restored writer: the same bearer proposes again.
      const back = await fx.rpc('mcp_propose_chapter_draft', fx.aTok.accessToken, { p_work_id: wA, p_chapter_id: chapter, p_content: 'writer again' });
      expect(back.status, String(back.message)).toBe(200);
    });
  });
});
