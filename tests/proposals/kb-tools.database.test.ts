import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertDisposableRef } from '../helpers/disposable-ref';
import {
  insertKbNode, insertWork, proposalEnvReady, setupProposalFixture, sha256,
  type ProposalFixture,
} from '../helpers/proposals-db';

/**
 * 14-01 MCP-06: mcp_propose_kb_edit / mcp_propose_kb_create on the disposable Supabase
 * project (0041). Edit targets are live, unlocked work-scope files of the given work in the
 * categories a writer edits (인물..아이템, plus custom for files under top-level user folders);
 * template / 회차 / account_template / folders / locked / deleted are refused. Create proposals
 * carry a category (인물..아이템) and a name; the folder is chosen at accept time. kb_nodes is
 * never written. SUPABASE_DB_URL marks this file for the serialized db project.
 */
const ready = proposalEnvReady && Boolean(process.env.SUPABASE_DB_URL);

type Proposed = { id: string; status: string; expires_at: string; superseded_id: string | null };

describe.skipIf(!ready)('mcp_propose_kb_edit / mcp_propose_kb_create (0041)', () => {
  let fx: ProposalFixture;
  let wA: string; let wA2: string; let wAdel: string; let wB: string;
  const k = {} as Record<
    'people' | 'sub' | 'file' | 'subFile' | 'customRoot' | 'customFile' | 'locked' | 'deleted' | 'tmplRoot'
    | 'tmplFile' | 'chapterFile' | 'acctRoot' | 'acctFile' | 'otherWorkFile' | 'deletedWorkFile' | 'bFile',
    string
  >;

  const edit = (bearer: string, workId: string, nodeId: string, content: string) =>
    fx.rpc('mcp_propose_kb_edit', bearer, { p_work_id: workId, p_node_id: nodeId, p_content: content });
  const create = (bearer: string, workId: string, category: string, name: string, content: string) =>
    fx.rpc('mcp_propose_kb_create', bearer, { p_work_id: workId, p_category: category, p_name: name, p_content: content });
  const kbSnapshot = () => fx.query(
    'select id, name, content, is_locked, deleted_at, updated_at from public.kb_nodes where owner_id = any($1::uuid[]) order by id',
    [[fx.writerA.id, fx.writerB.id]],
  );
  const proposalCount = async () => (await fx.query(
    'select count(*)::int as n from public.mcp_proposals where owner_id = any($1::uuid[])',
    [[fx.writerA.id, fx.writerB.id]]))[0].n as number;

  beforeAll(async () => {
    assertDisposableRef();
    fx = await setupProposalFixture('kb');
    const a = fx.writerA.id;
    wA = await insertWork(fx, a, 'proposal kb A');
    wA2 = await insertWork(fx, a, 'proposal kb A2');
    wAdel = await insertWork(fx, a, 'proposal kb A deleted', true);
    wB = await insertWork(fx, fx.writerB.id, 'proposal kb B');
    k.people = await insertKbNode(fx, { ownerId: a, workId: wA, nodeType: 'folder', category: '인물', name: '인물', locked: true });
    // createFolder: a nested folder inherits its parent's category, and so do its files.
    k.sub = await insertKbNode(fx, { ownerId: a, workId: wA, parentId: k.people, nodeType: 'folder', category: '인물', name: '조연' });
    k.file = await insertKbNode(fx, { ownerId: a, workId: wA, parentId: k.people, category: '인물', name: '주인공', content: '이름: 하린\n나이: 17\n' });
    k.subFile = await insertKbNode(fx, { ownerId: a, workId: wA, parentId: k.sub, category: '인물', name: '친구', content: null });
    // createFolder with parentId null: a top-level user folder is category custom.
    k.customRoot = await insertKbNode(fx, { ownerId: a, workId: wA, nodeType: 'folder', category: 'custom', name: '메모' });
    k.customFile = await insertKbNode(fx, { ownerId: a, workId: wA, parentId: k.customRoot, category: 'custom', name: '세계관 메모', content: 'memo' });
    k.locked = await insertKbNode(fx, { ownerId: a, workId: wA, parentId: k.people, category: '인물', name: '잠긴 인물', content: 'locked', locked: true });
    k.deleted = await insertKbNode(fx, { ownerId: a, workId: wA, parentId: k.people, category: '인물', name: '지운 인물', content: 'gone', deleted: true });
    k.tmplRoot = await insertKbNode(fx, { ownerId: a, workId: wA, nodeType: 'folder', category: 'template', name: 'template' });
    k.tmplFile = await insertKbNode(fx, { ownerId: a, workId: wA, parentId: k.tmplRoot, category: 'template', name: '내 템플릿', content: 'tmpl' });
    k.chapterFile = await insertKbNode(fx, { ownerId: a, workId: wA, category: '회차', name: '회차 파일', content: 'chapter kb' });
    k.acctRoot = await insertKbNode(fx, { ownerId: a, workId: null, scope: 'account_template', nodeType: 'folder', category: 'custom', name: '공유' });
    k.acctFile = await insertKbNode(fx, { ownerId: a, workId: null, scope: 'account_template', parentId: k.acctRoot, category: 'custom', name: '공유 문서', content: 'shared' });
    k.otherWorkFile = await insertKbNode(fx, { ownerId: a, workId: wA2, category: '장소', name: '다른 작품 장소', content: 'other' });
    k.deletedWorkFile = await insertKbNode(fx, { ownerId: a, workId: wAdel, category: '장소', name: '지운 작품 장소', content: 'del work' });
    k.bFile = await insertKbNode(fx, { ownerId: fx.writerB.id, workId: wB, category: '인물', name: 'B 인물', content: 'B' });
  }, 180_000);

  afterAll(async () => {
    await fx?.cleanup();
  }, 180_000);

  describe('kb_edit', () => {
    it('saves a pending edit proposal for an owned file and does not touch kb_nodes', async () => {
      const before = await kbSnapshot();
      const result = await edit(fx.aTok.accessToken, wA, k.file, '이름: 하린\r\n나이: 18\r\n');
      expect(result.status).toBe(200);
      const data = result.json as Proposed;
      expect(Object.keys(data).sort()).toEqual(['expires_at', 'id', 'status', 'superseded_id']);
      expect(data).toMatchObject({ status: 'pending', superseded_id: null });
      const [row] = await fx.query('select * from public.mcp_proposals where id = $1', [data.id]);
      expect(row).toMatchObject({
        kind: 'kb_edit', work_id: wA, node_id: k.file, chapter_id: null, owner_id: fx.writerA.id,
        content: '이름: 하린\n나이: 18\n', base_content: '이름: 하린\n나이: 17\n', base_hash: sha256('이름: 하린\n나이: 17\n'),
        proposed_category: null, proposed_name: null, source_client_id: fx.aTok.clientId,
      });
      expect(await kbSnapshot()).toEqual(before);
    });

    it('allows files in nested user folders (inherited category), custom files and empty bodies', async () => {
      const sub = await edit(fx.aTok.accessToken, wA, k.subFile, '친구 설정');
      expect(sub.status).toBe(200);
      const [row] = await fx.query('select base_content, base_hash from public.mcp_proposals where id = $1', [(sub.json as Proposed).id]);
      expect(row).toEqual({ base_content: '', base_hash: sha256('') });
      expect((await edit(fx.aTok.accessToken, wA, k.customFile, 'memo v2')).status).toBe(200);
    });

    it('dedupes the same connection + same text per file, keeps separate proposals otherwise', async () => {
      const first = await edit(fx.aTok.accessToken, wA, k.file, '중복 확인');
      const again = await edit(fx.aTok.accessToken, wA, k.file, '중복 확인');
      expect((again.json as Proposed).id).toBe((first.json as Proposed).id);
      const other = await edit(fx.aTok2.accessToken, wA, k.file, '중복 확인');
      expect(other.status).toBe(200);
      expect((other.json as Proposed).id).not.toBe((first.json as Proposed).id);
      expect((other.json as Proposed).superseded_id).toBeNull();
    });

    it('refuses locked, deleted, template, 회차, account_template, folders, other works and other writers', async () => {
      const before = await kbSnapshot();
      const n = await proposalCount();
      for (const [bearer, workId, nodeId, label] of [
        [fx.aTok.accessToken, wA, k.locked, 'locked file'],
        [fx.aTok.accessToken, wA, k.deleted, 'deleted file'],
        [fx.aTok.accessToken, wA, k.tmplFile, 'template file'],
        [fx.aTok.accessToken, wA, k.chapterFile, '회차 file'],
        [fx.aTok.accessToken, wA, k.acctFile, 'account_template file'],
        [fx.aTok.accessToken, wA, k.people, 'folder'],
        [fx.aTok.accessToken, wA, k.otherWorkFile, 'file of another work'],
        [fx.aTok.accessToken, wAdel, k.deletedWorkFile, 'file of a deleted work'],
        [fx.aTok.accessToken, wB, k.bFile, "B's file with A token"],
        [fx.bTok.accessToken, wA, k.file, "A's file with B token"],
        [fx.bTok.accessToken, wB, k.file, "A's file under B's work"],
        [fx.aTok.accessToken, wA, randomUUID(), 'unknown node'],
      ] as const) {
        const result = await edit(bearer, workId, nodeId, `edit ${label}`);
        expect(result.status, label).not.toBe(200);
        expect(result.message, label).toBe('mcp_not_found');
      }
      expect(await proposalCount()).toBe(n);
      expect(await kbSnapshot()).toEqual(before);
    });

    it('validates content: blank, over 50000 chars and unchanged text', async () => {
      for (const [content, message] of [
        ['', 'mcp_invalid_content'],
        ['\n\n  ', 'mcp_invalid_content'],
        ['a'.repeat(50_001), 'mcp_invalid_content'],
        ['memo', 'mcp_no_change'],
      ] as const) {
        const result = await edit(fx.aTok.accessToken, wA, k.customFile, content);
        expect(result.message, message).toBe(message);
      }
      expect((await edit(fx.aTok.accessToken, wA, k.customFile, 'b'.repeat(50_000))).status).toBe(200);
    });
  });

  describe('kb_create', () => {
    it('saves a pending create proposal with category and trimmed name; no kb node is created', async () => {
      const before = await kbSnapshot();
      const result = await create(fx.aTok.accessToken, wA, '장소', '  등대  ', '바닷가 등대\r\n');
      expect(result.status).toBe(200);
      const data = result.json as Proposed;
      expect(data).toMatchObject({ status: 'pending', superseded_id: null });
      const [row] = await fx.query('select * from public.mcp_proposals where id = $1', [data.id]);
      expect(row).toMatchObject({
        kind: 'kb_create', work_id: wA, proposed_category: '장소', proposed_name: '등대',
        content: '바닷가 등대\n', base_content: null, base_hash: null, node_id: null, chapter_id: null,
        created_node_id: null,
      });
      expect(await kbSnapshot()).toEqual(before);

      const again = await create(fx.aTok.accessToken, wA, '장소', '등대', '바닷가 등대\n');
      expect((again.json as Proposed).id).toBe(data.id);
    });

    it('accepts every writer category and refuses template, 회차, custom and unknown categories', async () => {
      for (const category of ['인물', '장소', '사건', '세력', '아이템']) {
        expect((await create(fx.aTok.accessToken, wA, category, `새 ${category}`, `${category} 내용`)).status, category).toBe(200);
      }
      for (const category of ['template', '회차', 'custom', 'weird', '']) {
        const result = await create(fx.aTok.accessToken, wA, category, '거부', '내용');
        expect(result.status, category).not.toBe(200);
        expect(result.message, category).toBe('mcp_invalid_category');
      }
    });

    it('validates name (1..100, no control chars) and content (1..50000)', async () => {
      for (const [name, content, message] of [
        ['   ', '내용', 'mcp_invalid_name'],
        ['가'.repeat(101), '내용', 'mcp_invalid_name'],
        ['줄\n바꿈', '내용', 'mcp_invalid_name'],
        ['이름', '', 'mcp_invalid_content'],
        ['이름', 'x'.repeat(50_001), 'mcp_invalid_content'],
      ] as const) {
        const result = await create(fx.aTok.accessToken, wA, '인물', name, content);
        expect(result.message, message).toBe(message);
      }
      expect((await create(fx.aTok.accessToken, wA, '인물', '가'.repeat(100), 'ok')).status).toBe(200);
    });

    it("refuses other writers' works, deleted works and unknown works with mcp_not_found", async () => {
      const n = await proposalCount();
      for (const [bearer, workId, label] of [
        [fx.bTok.accessToken, wA, "A's work with B token"],
        [fx.aTok.accessToken, wB, "B's work with A token"],
        [fx.aTok.accessToken, wAdel, 'deleted work'],
        [fx.aTok.accessToken, randomUUID(), 'unknown work'],
      ] as const) {
        const result = await create(bearer, workId, '인물', `create ${label}`, 'x');
        expect(result.message, label).toBe('mcp_not_found');
      }
      expect(await proposalCount()).toBe(n);
    });
  });

  it('both kb RPCs refuse browser sessions and suspended writers', async () => {
    expect((await edit(fx.aBrowser, wA, k.file, 'browser')).message).toBe('live MCP grant required');
    expect((await create(fx.aBrowser, wA, '인물', 'browser', 'x')).message).toBe('live MCP grant required');
    await fx.query("select set_config('app.sanction_cache_writer', 'on', false)");
    await fx.query("update public.profiles set sanction_kind = 'permanent_suspension', sanctioned_until = null where id = $1", [fx.writerA.id]);
    try {
      expect((await edit(fx.aTok.accessToken, wA, k.file, 'suspended')).message).toBe('mcp_suspended');
      expect((await create(fx.aTok.accessToken, wA, '인물', 'suspended', 'x')).message).toBe('mcp_suspended');
    } finally {
      await fx.query("update public.profiles set sanction_kind = 'none', sanctioned_until = null where id = $1", [fx.writerA.id]);
    }
  });
});
