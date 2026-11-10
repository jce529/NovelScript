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

    it('14-10: with several pending drafts on one chapter, accepting one makes the others stale (mcp_stale, nothing changes) until re-read', async () => {
      const original = '원본 문단\n';
      const chapter = await insertChapter(fx, wA, original, { orderIndex: 91 });
      const first = await seedChapterProposal(chapter, wA, '원본 문단\n\n첫 초안이 더한 문단\n');
      const second = await seedChapterProposal(chapter, wA, '원본 문단\n\n둘째 초안이 더한 문단\n');
      expect([first.id, second.id]).toHaveLength(2);

      const accepted = await acceptChapter(fx.aBrowser, first.id, hashContent(original), '원본 문단\n\n첫 초안이 더한 문단\n');
      expect(accepted.status, String(accepted.message)).toBe(200);
      const afterFirst = (await chapterBody(chapter)).content;

      // The second draft was read against the old original: the stored hash no longer matches.
      const stale = await acceptChapter(fx.aBrowser, second.id, hashContent(original), '원본 문단\n\n둘째 초안이 더한 문단\n');
      expect(stale.status).not.toBe(200);
      expect(stale.message).toBe('mcp_stale');
      expect((await chapterBody(chapter)).content).toBe(afterFirst);
      expect((await proposalRow(second.id)).status).toBe('pending');

      // Re-read against the latest original: accepting works and is undoable from that state.
      const merged = `${afterFirst}\n둘째 초안이 더한 문단\n`;
      const retry = await acceptChapter(fx.aBrowser, second.id, hashContent(afterFirst), merged);
      expect(retry.status, String(retry.message)).toBe(200);
      expect((await chapterBody(chapter)).content).toBe(merged);
      expect((await proposalRow(second.id)).undo_content).toBe(afterFirst);
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

  describe('accept_mcp_kb_create', () => {
    const acceptCreate = (bearer: string, id: string, folderId: string, version: string | null) =>
      fx.rpc('accept_mcp_kb_create', bearer, { p_proposal_id: id, p_folder_id: folderId, p_folder_version: version });

    it('creates the file in the folder the writer picked (root or nested) and records created_node_id', async () => {
      const root = await seedKbCreateProposal(wA, '인물', '새 인물', '이름: 도윤\n');
      const result = await acceptCreate(fx.aBrowser, root.id, people, `${people}:인물`);
      expect(result.status, String(result.message)).toBe(200);
      const data = result.json as Decided;
      expect(data).toMatchObject({ id: root.id, status: 'accepted' });
      expect(data.created_node_id).toEqual(expect.any(String));
      const node = await nodeRow(data.created_node_id!);
      expect(node).toMatchObject({ parent_id: people, category: '인물', name: '새 인물', content: '이름: 도윤\n', is_locked: false, deleted_at: null });
      const row = await proposalRow(root.id);
      expect(row).toMatchObject({ status: 'accepted', created_node_id: data.created_node_id, undo_content: null, applied_hash: sha256('이름: 도윤\n') });
      expect(row.decision).toMatchObject({ folder_id: people, folder_version: `${people}:인물` });

      const nested = await seedKbCreateProposal(wA, '인물', '조연 신규', 'side');
      const nestedResult = await acceptCreate(fx.aBrowser, nested.id, peopleSub, `${people}:인물/${peopleSub}:조연`);
      expect(nestedResult.status, String(nestedResult.message)).toBe(200);
      expect((await nodeRow((nestedResult.json as Decided).created_node_id!)).parent_id).toBe(peopleSub);
    });

    it('never saves to another folder: wrong category, stale version, other work, account_template, deleted or foreign folders', async () => {
      const a = fx.writerA.id;
      const wA2 = await insertWork(fx, a, 'proposal decide A2');
      const otherWorkPeople = await insertKbNode(fx, { ownerId: a, workId: wA2, nodeType: 'folder', category: '인물', name: '인물', locked: true });
      const acct = await insertKbNode(fx, { ownerId: a, workId: null, scope: 'account_template', nodeType: 'folder', category: 'custom', name: '공유' });
      const deletedSub = await insertKbNode(fx, { ownerId: a, workId: wA, parentId: people, nodeType: 'folder', category: '인물', name: '지운 폴더', deleted: true });
      const bPeople = await insertKbNode(fx, { ownerId: fx.writerB.id, workId: wB, nodeType: 'folder', category: '인물', name: '인물', locked: true });
      const { id } = await seedKbCreateProposal(wA, '인물', '갈 곳 없는 인물', 'nowhere');
      const count = async () => (await fx.query('select count(*)::int as n from public.kb_nodes where owner_id = any($1::uuid[])',
        [[a, fx.writerB.id]]))[0].n as number;
      const before = await count();

      for (const [folder, version, message] of [
        [places, `${places}:장소`, 'mcp_folder_invalid'],
        [customRoot, `${customRoot}:메모`, 'mcp_folder_invalid'],
        [otherWorkPeople, `${otherWorkPeople}:인물`, 'mcp_folder_invalid'],
        [acct, `${acct}:공유`, 'mcp_folder_invalid'],
        [deletedSub, `${people}:인물/${deletedSub}:지운 폴더`, 'mcp_folder_invalid'],
        [bPeople, `${bPeople}:인물`, 'mcp_folder_invalid'],
        [randomUUID(), 'x', 'mcp_folder_invalid'],
        [peopleSub, `${people}:인물/${peopleSub}:옛 이름`, 'mcp_folder_changed'],
        [peopleSub, null, 'mcp_folder_changed'],
      ] as const) {
        const result = await acceptCreate(fx.aBrowser, id, folder, version);
        expect(result, `${folder} ${version}`).toMatchObject({ status: 400, message });
      }
      expect(await count()).toBe(before);
      expect(await proposalRow(id)).toMatchObject({ status: 'pending', created_node_id: null });
      // B cannot accept A's proposal into B's own folder either.
      expect(await acceptCreate(fx.bBrowser, id, bPeople, `${bPeople}:인물`)).toMatchObject({ status: 400, message: 'mcp_not_found' });
    });

    it('maps a sibling name collision to mcp_name_collision and keeps the proposal pending', async () => {
      await insertKbNode(fx, { ownerId: fx.writerA.id, workId: wA, parentId: places, category: '장소', name: '왕궁', content: 'existing' });
      const { id } = await seedKbCreateProposal(wA, '장소', '왕궁', 'duplicate');
      const result = await acceptCreate(fx.aBrowser, id, places, `${places}:장소`);
      expect(result).toMatchObject({ status: 400, message: 'mcp_name_collision' });
      expect(await proposalRow(id)).toMatchObject({ status: 'pending', created_node_id: null });
      expect((await fx.query("select count(*)::int as n from public.kb_nodes where parent_id = $1 and name = '왕궁'", [places]))[0].n).toBe(1);
    });
  });

  describe('reject_mcp_proposal', () => {
    it('rejects pending proposals only, for the owner only, without touching the original', async () => {
      const chapter = await insertChapter(fx, wA, 'reject original', { orderIndex: 40 });
      const { id } = await seedChapterProposal(chapter, wA, 'reject draft');
      expect(await fx.rpc('reject_mcp_proposal', fx.bBrowser, { p_proposal_id: id })).toMatchObject({ status: 400, message: 'mcp_not_found' });
      const result = await fx.rpc('reject_mcp_proposal', fx.aBrowser, { p_proposal_id: id });
      expect(result).toMatchObject({ status: 200, json: { id, status: 'rejected' } });
      expect((await proposalRow(id))).toMatchObject({ status: 'rejected', undo_content: null });
      expect((await chapterBody(chapter)).content).toBe('reject original');
      expect(await fx.rpc('reject_mcp_proposal', fx.aBrowser, { p_proposal_id: id })).toMatchObject({ status: 400, message: 'mcp_not_pending' });
      expect((await acceptChapter(fx.aBrowser, id, hashContent('reject original'), 'reject draft')).message).toBe('mcp_not_pending');
    });
  });

  describe('revert_mcp_proposal', () => {
    type Reverted = { id: string; status: string; confirm_required: boolean; changed_since_accept: boolean; current_hash: string | null };
    const revert = (bearer: string, id: string, confirm?: { seenHash: string | null }) =>
      fx.rpc('revert_mcp_proposal', bearer, confirm === undefined
        ? { p_proposal_id: id }
        : { p_proposal_id: id, p_confirm: true, p_seen_hash: confirm.seenHash });
    /** kb_create current_hash, same formula as 0042: sha256(jsonb_build_array(name, parent_id, category, content)::text). */
    const nodeStateHash = async (nodeId: string) => (await fx.query(
      "select public.mcp_proposal_sha256(jsonb_build_array(name, parent_id, category, coalesce(content, ''))::text) as h from public.kb_nodes where id = $1",
      [nodeId]))[0].h as string;
    async function acceptCreated(name: string, content: string) {
      const created = await seedKbCreateProposal(wA, '인물', name, content);
      const accepted = await fx.rpc('accept_mcp_kb_create', fx.aBrowser,
        { p_proposal_id: created.id, p_folder_id: people, p_folder_version: `${people}:인물` });
      expect(accepted.status, String(accepted.message)).toBe(200);
      return { id: created.id, nodeId: (accepted.json as Decided).created_node_id! };
    }

    it('restores the chapter once: reverted, undo cleared, no second revert and no re-accept', async () => {
      const chapter = await insertChapter(fx, wA, 'revert original', { orderIndex: 50 });
      const { id } = await seedChapterProposal(chapter, wA, 'revert draft');
      expect((await acceptChapter(fx.aBrowser, id, hashContent('revert original'), 'revert draft')).status).toBe(200);
      expect(await revert(fx.bBrowser, id)).toMatchObject({ status: 400, message: 'mcp_not_found' });
      const result = await revert(fx.aBrowser, id);
      expect(result).toMatchObject({ status: 200, json: { id, status: 'reverted', changed_since_accept: false } });
      expect((await chapterBody(chapter)).content).toBe('revert original');
      const row = await proposalRow(id);
      expect(row).toMatchObject({ status: 'reverted', undo_content: null });
      expect(row.decision).toMatchObject({ changed_since_accept: false });
      expect(await revert(fx.aBrowser, id)).toMatchObject({ status: 400, message: 'mcp_not_revertible' });
      expect((await acceptChapter(fx.aBrowser, id, hashContent('revert original'), 'again')).message).toBe('mcp_not_pending');
      expect((await chapterBody(chapter)).content).toBe('revert original');
    });

    it('warns when the target changed after the accept and restores only with the seen current_hash', async () => {
      const chapter = await insertChapter(fx, wA, 'warn original', { orderIndex: 51 });
      const { id } = await seedChapterProposal(chapter, wA, 'warn draft');
      expect((await acceptChapter(fx.aBrowser, id, hashContent('warn original'), 'warn draft')).status).toBe(200);
      await fx.query("update public.chapters set content = 'warn draft + later edit' where id = $1", [chapter]);
      const warn = await revert(fx.aBrowser, id);
      expect(warn).toMatchObject({ status: 200, json: {
        id, status: 'accepted', confirm_required: true, changed_since_accept: true,
        current_hash: hashContent('warn draft + later edit'),
      } });
      expect((await chapterBody(chapter)).content).toBe('warn draft + later edit');
      expect((await proposalRow(id)).status).toBe('accepted');
      const confirmed = await revert(fx.aBrowser, id, { seenHash: (warn.json as Reverted).current_hash });
      expect(confirmed).toMatchObject({ status: 200, json: { status: 'reverted', changed_since_accept: true, current_hash: null } });
      expect((await chapterBody(chapter)).content).toBe('warn original');
    });

    it('does not overwrite an edit made between the warning and the confirmation', async () => {
      const chapter = await insertChapter(fx, wA, 'race original', { orderIndex: 54 });
      const { id } = await seedChapterProposal(chapter, wA, 'race draft');
      expect((await acceptChapter(fx.aBrowser, id, hashContent('race original'), 'race draft')).status).toBe(200);
      await fx.query("update public.chapters set content = 'race edit 1' where id = $1", [chapter]);
      const warn = await revert(fx.aBrowser, id);
      const seen = (warn.json as Reverted).current_hash;
      expect(seen).toBe(hashContent('race edit 1'));
      // The writer edits again before confirming.
      await fx.query("update public.chapters set content = 'race edit 2' where id = $1", [chapter]);
      const stale = await revert(fx.aBrowser, id, { seenHash: seen });
      expect(stale).toMatchObject({ status: 200, json: {
        status: 'accepted', confirm_required: true, current_hash: hashContent('race edit 2'),
      } });
      expect((await chapterBody(chapter)).content).toBe('race edit 2');
      expect(await proposalRow(id)).toMatchObject({ status: 'accepted', undo_content: 'race original' });
      // A wrong hash is not a confirmation either; the fresh one is.
      expect((await revert(fx.aBrowser, id, { seenHash: 'f'.repeat(64) })).json).toMatchObject({ confirm_required: true });
      const ok = await revert(fx.aBrowser, id, { seenHash: (stale.json as Reverted).current_hash });
      expect(ok).toMatchObject({ status: 200, json: { status: 'reverted' } });
      expect((await chapterBody(chapter)).content).toBe('race original');
    });

    it('p_confirm without p_seen_hash is mcp_invalid_decision and changes nothing', async () => {
      const chapter = await insertChapter(fx, wA, 'confirm original', { orderIndex: 55 });
      const { id } = await seedChapterProposal(chapter, wA, 'confirm draft');
      expect((await acceptChapter(fx.aBrowser, id, hashContent('confirm original'), 'confirm draft')).status).toBe(200);
      await fx.query("update public.chapters set content = 'confirm edited' where id = $1", [chapter]);
      for (const body of [{ p_proposal_id: id, p_confirm: true }, { p_proposal_id: id, p_confirm: true, p_seen_hash: null }]) {
        expect(await fx.rpc('revert_mcp_proposal', fx.aBrowser, body)).toMatchObject({ status: 400, message: 'mcp_invalid_decision' });
      }
      expect((await chapterBody(chapter)).content).toBe('confirm edited');
      expect((await proposalRow(id)).status).toBe('accepted');
    });

    it('a created document that is now locked is refused on the first call, not sent through confirmation', async () => {
      const { id, nodeId } = await acceptCreated('잠길 신규', 'locked doc');
      await fx.query('update public.kb_nodes set is_locked = true where id = $1', [nodeId]);
      expect(await revert(fx.aBrowser, id)).toMatchObject({ status: 400, message: 'mcp_not_revertible' });
      expect(await revert(fx.aBrowser, id, { seenHash: await nodeStateHash(nodeId) }))
        .toMatchObject({ status: 400, message: 'mcp_not_revertible' });
      expect(await nodeRow(nodeId)).toMatchObject({ deleted_at: null, is_locked: true });
      expect((await proposalRow(id)).status).toBe('accepted');
    });

    it('undo_until boundary: just inside reverts, just past raises mcp_undo_expired and leaves the target unchanged', async () => {
      const chapter = await insertChapter(fx, wA, 'deadline original', { orderIndex: 56 });
      const inside = await seedChapterProposal(chapter, wA, 'deadline draft');
      expect((await acceptChapter(fx.aBrowser, inside.id, hashContent('deadline original'), 'deadline draft')).status).toBe(200);
      await fx.query("update public.mcp_proposals set undo_until = now() + interval '10 seconds' where id = $1", [inside.id]);
      expect(await revert(fx.aBrowser, inside.id)).toMatchObject({ status: 200, json: { status: 'reverted' } });
      expect((await chapterBody(chapter)).content).toBe('deadline original');

      const { id, nodeId } = await acceptCreated('기한 신규', 'deadline doc');
      await fx.query("update public.mcp_proposals set undo_until = now() - interval '1 millisecond' where id = $1", [id]);
      expect(await revert(fx.aBrowser, id)).toMatchObject({ status: 400, message: 'mcp_undo_expired' });
      expect((await nodeRow(nodeId)).deleted_at).toBeNull();
      expect((await proposalRow(id)).status).toBe('accepted');

      // Lock-wait expiry (static): after the target FOR UPDATE the window is re-checked with
      // clock_timestamp(), not the transaction-start now().
      const [{ src }] = await fx.query("select prosrc as src from pg_proc where proname = 'revert_mcp_proposal'");
      expect(String(src)).toMatch(/for update of n;[\s\S]*undo_until <= pg_catalog\.clock_timestamp\(\)[\s\S]*mcp_undo_expired/);
    });

    it('a created document renamed, moved or re-categorized after accept needs confirmation before it is soft-deleted', async () => {
      const changes: Array<[string, (nodeId: string) => Promise<unknown>]> = [
        ['rename', (nodeId) => fx.query("update public.kb_nodes set name = name || ' (고침)' where id = $1", [nodeId])],
        ['move', (nodeId) => fx.query('update public.kb_nodes set parent_id = $2 where id = $1', [nodeId, peopleSub])],
        // Category only (same folder, same name and content) must count as changed too.
        ['category', (nodeId) => fx.query("update public.kb_nodes set category = '장소' where id = $1", [nodeId])],
      ];
      for (const [label, change] of changes) {
        const { id, nodeId } = await acceptCreated(`옮길 신규 ${label}`, `doc ${label}`);
        await change(nodeId);
        const warn = await revert(fx.aBrowser, id);
        expect(warn, label).toMatchObject({ status: 200, json: {
          status: 'accepted', confirm_required: true, changed_since_accept: true, current_hash: await nodeStateHash(nodeId),
        } });
        expect((await nodeRow(nodeId)).deleted_at, label).toBeNull();
        expect((await proposalRow(id)).status, label).toBe('accepted');
        const done = await revert(fx.aBrowser, id, { seenHash: (warn.json as Reverted).current_hash });
        expect(done, label).toMatchObject({ status: 200, json: { status: 'reverted', changed_since_accept: true } });
        expect((await nodeRow(nodeId)).deleted_at, label).not.toBeNull();
      }
    });

    it('restores a document edit and soft-deletes a created document', async () => {
      const node = await insertKbNode(fx, { ownerId: fx.writerA.id, workId: wA, parentId: people, category: '인물', name: '되돌릴 인물', content: 'kb before' });
      const edit = await seedKbEditProposal(node, wA, 'kb after');
      expect((await acceptKbEdit(fx.aBrowser, edit.id, hashContent('kb before'), 'kb after')).status).toBe(200);
      expect(await revert(fx.aBrowser, edit.id)).toMatchObject({ status: 200, json: { status: 'reverted', changed_since_accept: false } });
      expect((await nodeRow(node)).content).toBe('kb before');
      expect((await proposalRow(edit.id)).status).toBe('reverted');

      const created = await seedKbCreateProposal(wA, '인물', '되돌릴 신규', 'created doc');
      const accepted = await fx.rpc('accept_mcp_kb_create', fx.aBrowser,
        { p_proposal_id: created.id, p_folder_id: people, p_folder_version: `${people}:인물` });
      expect(accepted.status, String(accepted.message)).toBe(200);
      const nodeId = (accepted.json as Decided).created_node_id!;
      expect(await revert(fx.aBrowser, created.id)).toMatchObject({ status: 200, json: { status: 'reverted', changed_since_accept: false } });
      const gone = await nodeRow(nodeId);
      expect(gone.deleted_at).not.toBeNull();
      expect(gone.is_locked).toBe(false);
      expect(await proposalRow(created.id)).toMatchObject({ status: 'reverted', created_node_id: nodeId });
    });

    it('refuses after the 7-day window and drops expired undo snapshots opportunistically', async () => {
      const chapter = await insertChapter(fx, wA, 'window original', { orderIndex: 52 });
      const { id } = await seedChapterProposal(chapter, wA, 'window draft');
      expect((await acceptChapter(fx.aBrowser, id, hashContent('window original'), 'window draft')).status).toBe(200);
      await fx.query("update public.mcp_proposals set undo_until = now() - interval '1 second' where id = $1", [id]);
      expect(await revert(fx.aBrowser, id)).toMatchObject({ status: 400, message: 'mcp_undo_expired' });
      expect((await chapterBody(chapter)).content).toBe('window draft');
      // The raised error rolled the cleanup back; any successful decision call drops the snapshot.
      expect((await proposalRow(id)).undo_content).toBe('window original');
      const other = await insertChapter(fx, wA, 'cleanup original', { orderIndex: 53 });
      const otherP = await seedChapterProposal(other, wA, 'cleanup draft');
      expect((await fx.rpc('reject_mcp_proposal', fx.aBrowser, { p_proposal_id: otherP.id })).status).toBe(200);
      expect(await proposalRow(id)).toMatchObject({ status: 'accepted', undo_content: null });
    });
  });

  describe('browser session only', () => {
    it('OAuth bearers get 42501 on all five decision RPCs and nothing changes; anon is refused', async () => {
      const chapter = await insertChapter(fx, wA, 'bearer original', { orderIndex: 60 });
      const { id } = await seedChapterProposal(chapter, wA, 'bearer draft');
      const create = await seedKbCreateProposal(wA, '인물', '토큰 신규', 'bearer doc');
      const calls: Array<[string, Record<string, unknown>]> = [
        ['accept_mcp_chapter_draft', { p_proposal_id: id, p_expected_hash: hashContent('bearer original'), p_new_content: 'bearer draft', p_decision: {} }],
        ['accept_mcp_kb_edit', { p_proposal_id: id, p_expected_hash: hashContent('bearer original'), p_new_content: 'x', p_decision: {} }],
        ['accept_mcp_kb_create', { p_proposal_id: create.id, p_folder_id: people, p_folder_version: `${people}:인물` }],
        ['reject_mcp_proposal', { p_proposal_id: id }],
        ['revert_mcp_proposal', { p_proposal_id: id }],
      ];
      for (const [fn, body] of calls) {
        for (const token of [fx.aTok.accessToken, fx.bTok.accessToken]) {
          const result = await fx.rpc(fn, token, body);
          expect(result, fn).toMatchObject({ status: 403, message: 'browser session required' });
        }
        const anon = await fx.rpc(fn, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, body);
        expect([401, 403, 404], fn).toContain(anon.status);
      }
      expect((await chapterBody(chapter)).content).toBe('bearer original');
      expect(await proposalRow(id)).toMatchObject({ status: 'pending', decision: null });
      expect(await proposalRow(create.id)).toMatchObject({ status: 'pending', created_node_id: null });
    });
  });

  describe('suspended and demoted accounts', () => {
    it('suspended writers cannot accept or revert, but can reject', async () => {
      const chapter = await insertChapter(fx, wA, 'suspended original', { orderIndex: 20 });
      const pending = await seedChapterProposal(chapter, wA, 'suspended draft');
      const node = await insertKbNode(fx, { ownerId: fx.writerA.id, workId: wA, parentId: people, category: '인물', name: '정지 인물', content: 'kb v1' });
      const kbPending = await seedKbEditProposal(node, wA, 'kb v2');
      const create = await seedKbCreateProposal(wA, '인물', '정지 신규', 'new doc');
      // An accepted proposal to try reverting while suspended.
      const acceptedChapter = await insertChapter(fx, wA, 'accepted original', { orderIndex: 21 });
      const accepted = await seedChapterProposal(acceptedChapter, wA, 'accepted draft');
      expect((await acceptChapter(fx.aBrowser, accepted.id, hashContent('accepted original'), 'accepted draft')).status).toBe(200);

      await withSuspendedA(async () => {
        const chapterTry = await acceptChapter(fx.aBrowser, pending.id, hashContent('suspended original'), 'suspended draft');
        expect(chapterTry).toMatchObject({ status: 403, message: 'mcp_suspended' });
        const kbTry = await acceptKbEdit(fx.aBrowser, kbPending.id, hashContent('kb v1'), 'kb v2');
        expect(kbTry).toMatchObject({ status: 403, message: 'mcp_suspended' });
        const createTry = await fx.rpc('accept_mcp_kb_create', fx.aBrowser,
          { p_proposal_id: create.id, p_folder_id: people, p_folder_version: `${people}:인물` });
        expect(createTry).toMatchObject({ status: 403, message: 'mcp_suspended' });
        const revertTry = await fx.rpc('revert_mcp_proposal', fx.aBrowser, { p_proposal_id: accepted.id, p_confirm: true, p_seen_hash: 'x' });
        expect(revertTry).toMatchObject({ status: 403, message: 'mcp_suspended' });
        const reject = await fx.rpc('reject_mcp_proposal', fx.aBrowser, { p_proposal_id: pending.id });
        expect(reject.status, String(reject.message)).toBe(200);
      });
      expect((await chapterBody(chapter)).content).toBe('suspended original');
      expect((await nodeRow(node)).content).toBe('kb v1');
      expect((await chapterBody(acceptedChapter)).content).toBe('accepted draft');
      expect((await proposalRow(pending.id)).status).toBe('rejected');
      expect((await proposalRow(kbPending.id)).status).toBe('pending');
      expect(await proposalRow(create.id)).toMatchObject({ status: 'pending', created_node_id: null });
      expect((await proposalRow(accepted.id)).status).toBe('accepted');
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
        const revertTry = await fx.rpc('revert_mcp_proposal', fx.aBrowser, { p_proposal_id: accepted.id, p_confirm: true, p_seen_hash: 'x' });
        expect(revertTry).toMatchObject({ status: 403, message: 'active writer required' });
        const createP = await seedKbCreateProposal(wA, '인물', '강등 신규', 'demoted new');
        const createTry = await fx.rpc('accept_mcp_kb_create', fx.aBrowser,
          { p_proposal_id: createP.id, p_folder_id: people, p_folder_version: `${people}:인물` });
        expect(createTry).toMatchObject({ status: 403, message: 'active writer required' });
        // Rejecting changes no original, so a demoted account may still clear its queue.
        const reject = await fx.rpc('reject_mcp_proposal', fx.aBrowser, { p_proposal_id: createP.id });
        expect(reject, String(reject.message)).toMatchObject({ status: 200, json: { status: 'rejected' } });
      } finally {
        await fx.query("update public.profiles set role = 'writer' where id = $1", [fx.writerA.id]);
      }
      // Only the seeded (then rejected) create proposal was added: the bearer created nothing.
      expect((await fx.query('select count(*)::int as n from public.mcp_proposals where owner_id = $1', [fx.writerA.id]))[0].n)
        .toBe(proposalsBefore + 1);
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
