import { beforeEach, describe, expect, it } from 'vitest';
import { FakeSupabase } from '../helpers/proposals-fake-supabase';
import {
  acceptProposal,
  PROPOSAL_ERROR_COPY,
  rejectProposal,
  revertProposal,
} from '@/lib/proposals/actions';
import { hashContent } from '@/lib/proposals/hash';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const WORK = '33333333-3333-4333-8333-333333333333';
const WORK_2 = '33333333-3333-4333-8333-333333333334';
const FOREIGN_WORK = '44444444-4444-4444-8444-444444444444';
const CHAPTER = '55555555-5555-4555-8555-555555555555';
const NODE = '66666666-6666-4666-8666-666666666666';
const ROOT = '88888888-8888-4888-8888-888888888881';
const SUB = '88888888-8888-4888-8888-888888888882';
const CLIENT = '77777777-7777-4777-8777-777777777777';
const P = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;
const DAY = 86_400_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

// Hunk 0 = 바뀜 (첫 문단), hunk 1 = 삭제 (셋째 문단), hunk 2 = 추가 (다섯째 문단).
const BASE = '첫 문단\n\n둘째 문단\n\n셋째 문단\n\n넷째 문단\n';
const DRAFT = '첫 문단 고침\n\n둘째 문단\n\n넷째 문단\n\n다섯째 문단\n';
const EDITED_FIRST = '작가가 새로 쓴 첫 문단\n\n둘째 문단\n\n셋째 문단\n\n넷째 문단\n';
const SQL_LEAK = /select|insert|update|relation|violates|constraint|syntax|column|function|mcp_|42501|P0001|22023/i;

function proposal(n: number, over: Record<string, unknown> = {}) {
  return {
    id: P(n), owner_id: OWNER, work_id: WORK, kind: 'chapter_draft',
    chapter_id: CHAPTER, node_id: null, proposed_category: null, proposed_name: null,
    content: DRAFT, base_content: BASE, base_hash: hashContent(BASE), status: 'pending',
    source_client_id: CLIENT, source_client_name: 'Claude', source_host: 'claude.ai',
    created_at: iso(-n * 1000), expires_at: iso(10 * DAY), decided_at: null, decision: null,
    undo_until: null, created_node_id: null,
    ...over,
  };
}

let fake: FakeSupabase;
let chapterContent: string;

beforeEach(() => {
  chapterContent = BASE;
  fake = new FakeSupabase({
    works: [
      { id: WORK, owner_id: OWNER, title: '내 작품', deleted_at: null },
      { id: WORK_2, owner_id: OWNER, title: '두 번째', deleted_at: null },
      { id: FOREIGN_WORK, owner_id: OTHER, title: '남의 작품', deleted_at: null },
    ],
    chapters: [{ id: CHAPTER, work_id: WORK, title: '1화', deleted_at: null }],
    kb_nodes: [
      { id: NODE, owner_id: OWNER, work_id: WORK, scope: 'work', node_type: 'file', category: '인물',
        name: '주인공', content: '이름: 가\n\n나이: 17\n', is_locked: false, deleted_at: null, parent_id: null },
      { id: ROOT, owner_id: OWNER, work_id: WORK, scope: 'work', node_type: 'folder', category: '장소',
        name: '장소', parent_id: null, deleted_at: null },
      { id: SUB, owner_id: OWNER, work_id: WORK, scope: 'work', node_type: 'folder', category: '장소',
        name: '도시', parent_id: ROOT, deleted_at: null },
    ],
    mcp_connections: [],
    mcp_proposals: [proposal(1)],
  });
  fake.rpcHandlers.set('read_chapter_content', () => ({ data: chapterContent }));
  fake.rpcHandlers.set('accept_mcp_chapter_draft', (args) => ({
    data: { id: args.p_proposal_id, status: 'accepted', undo_until: iso(7 * DAY), created_node_id: null },
  }));
  fake.rpcHandlers.set('accept_mcp_kb_edit', (args) => ({
    data: { id: args.p_proposal_id, status: 'accepted', undo_until: iso(7 * DAY), created_node_id: null },
  }));
  fake.rpcHandlers.set('accept_mcp_kb_create', (args) => ({
    data: { id: args.p_proposal_id, status: 'accepted', undo_until: iso(7 * DAY), created_node_id: 'new-node' },
  }));
  fake.rpcHandlers.set('reject_mcp_proposal', (args) => ({ data: { id: args.p_proposal_id, status: 'rejected' } }));
});

const decisionCalls = () => fake.rpcCalls.filter((c) => c.name !== 'read_chapter_content');
const seen = () => hashContent(chapterContent);
const accept = (over: Record<string, unknown> = {}, userId = OWNER) => acceptProposal(fake.client, userId, {
  workId: WORK, proposalId: P(1), seenHash: seen(), selections: [{ index: 0, accepted: true }], ...over,
});

describe('acceptProposal: identity and ownership', () => {
  it('rejects a missing or malformed session user without any RPC', async () => {
    const result = await accept({}, 'not-a-uuid');
    expect(result).toMatchObject({ ok: false, status: 'error', code: 'forbidden' });
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it('another work, a foreign proposal and an unknown id are the same not_found', async () => {
    fake.tables.mcp_proposals.push(proposal(2, { owner_id: OTHER, work_id: FOREIGN_WORK }));
    for (const over of [
      { workId: WORK_2 },
      { workId: FOREIGN_WORK, proposalId: P(2) },
      { proposalId: P(2) },
      { proposalId: P(9) },
    ]) {
      const result = await accept(over);
      expect(result).toMatchObject({ ok: false, status: 'error', code: 'not_found', error: PROPOSAL_ERROR_COPY.not_found });
    }
    expect(decisionCalls()).toHaveLength(0);
  });
});

describe('acceptProposal: server recomputation (client text tampering)', () => {
  it('builds the final text from the stored draft; the RPC gets hash(current) and a server decision', async () => {
    const result = await accept({ selections: [{ index: 0, accepted: true }, { index: 2, accepted: true }, { index: 1, accepted: false }] });
    expect(result).toMatchObject({ ok: true, status: 'accepted', proposalId: P(1), appliedCount: 2 });
    const call = decisionCalls()[0];
    expect(call.name).toBe('accept_mcp_chapter_draft');
    expect(call.args).toEqual({
      p_proposal_id: P(1),
      p_expected_hash: hashContent(BASE),
      p_new_content: '첫 문단 고침\n\n둘째 문단\n\n셋째 문단\n\n넷째 문단\n다섯째 문단\n',
      p_decision: { accepted_indexes: [0, 2], edited_indexes: [], hunk_count: 3, stale_base: false },
    });
  });

  it('refuses extra client fields such as hunk text or final content', async () => {
    for (const over of [
      { content: '조작된 전체 본문' },
      { selections: [{ index: 0, accepted: true, after: '조작된 덩어리' }] },
      { selections: [{ index: 0, accepted: true }], newContent: 'x' },
      { ownerId: OTHER },
    ]) {
      const result = await accept(over);
      expect(result).toMatchObject({ ok: false, status: 'error', code: 'invalid_request' });
    }
    expect(decisionCalls()).toHaveLength(0);
  });

  it('refuses unknown, duplicate, negative and fractional hunk indexes', async () => {
    for (const selections of [
      [{ index: 7, accepted: true }],
      [{ index: 0, accepted: true }, { index: 0, accepted: true }],
      [{ index: -1, accepted: true }],
      [{ index: 0.5, accepted: true }],
    ]) {
      const result = await accept({ selections });
      expect(result).toMatchObject({ ok: false, status: 'error' });
      expect(['invalid_selection', 'invalid_request']).toContain((result as { code: string }).code);
    }
    expect(decisionCalls()).toHaveLength(0);
  });

  it('refuses an empty selection (nothing to reflect; rejecting is a separate action)', async () => {
    const result = await accept({ selections: [{ index: 0, accepted: false }] });
    expect(result).toMatchObject({ ok: false, code: 'invalid_selection' });
    expect(decisionCalls()).toHaveLength(0);
  });

  it('applies 직접 고침 only on 바뀜/추가 and records which hunks were edited', async () => {
    const result = await accept({ selections: [{ index: 0, accepted: true, editedText: '작가가 고친 문단\r\n고친 둘째 줄' }] });
    expect(result).toMatchObject({ ok: true });
    const args = decisionCalls()[0].args;
    expect(args.p_new_content).toBe('작가가 고친 문단\n고친 둘째 줄\n\n둘째 문단\n\n셋째 문단\n\n넷째 문단\n');
    expect(args.p_decision).toMatchObject({ accepted_indexes: [0], edited_indexes: [0] });
  });

  it('refuses editedText on a 삭제 hunk', async () => {
    const result = await accept({ selections: [{ index: 1, accepted: true, editedText: '되살리기' }] });
    expect(result).toMatchObject({ ok: false, code: 'invalid_selection', error: PROPOSAL_ERROR_COPY.invalid_selection });
    expect(decisionCalls()).toHaveLength(0);
  });

  it('refuses NUL and over-long edited text', async () => {
    for (const editedText of ['a\u0000b', 'x'.repeat(100_001)]) {
      const result = await accept({ selections: [{ index: 0, accepted: true, editedText }] });
      expect(result).toMatchObject({ ok: false, status: 'error' });
      expect(['invalid_content', 'invalid_request']).toContain((result as { code: string }).code);
    }
    expect(decisionCalls()).toHaveLength(0);
  });

  it('refuses a hunk that cannot be applied to the current text', async () => {
    chapterContent = EDITED_FIRST;
    const result = await accept({ seenHash: hashContent(chapterContent), selections: [{ index: 0, accepted: true }] });
    expect(result).toMatchObject({ ok: false, code: 'invalid_selection' });
    expect(decisionCalls()).toHaveLength(0);
  });
});

describe('acceptProposal: stale', () => {
  it('seenHash differs from the current original -> no write, fresh detail, selections reset', async () => {
    chapterContent = EDITED_FIRST;
    const result = await accept({ seenHash: hashContent(BASE) });
    expect(result.ok).toBe(false);
    if (result.status !== 'stale') throw new Error('expected stale');
    expect(result.error).toBe(PROPOSAL_ERROR_COPY.stale);
    expect(result.detail.isStale).toBe(true);
    expect(result.detail.seenHash).toBe(hashContent(chapterContent));
    expect(result.detail.hunks.map((h) => h.applicable)).toEqual([false, true, true]);
    expect(decisionCalls()).toHaveLength(0);
  });

  it('an RPC-side mcp_stale (edit between read and write) is also a stale result', async () => {
    fake.rpcHandlers.set('accept_mcp_chapter_draft', () => {
      chapterContent = '경합 중 저장된 본문\n';
      return { error: { message: 'mcp_stale', code: 'P0001' } };
    });
    const result = await accept();
    expect(result.status).toBe('stale');
    if (result.status === 'stale') expect(result.detail.seenHash).toBe(hashContent('경합 중 저장된 본문\n'));
  });

  it('a malformed seenHash is an invalid request', async () => {
    const result = await accept({ seenHash: 'not-a-hash' });
    expect(result).toMatchObject({ ok: false, code: 'invalid_request' });
  });
});

describe('acceptProposal: state and RPC errors map to fixed copy', () => {
  it('expired and decided proposals are refused before any RPC', async () => {
    fake.tables.mcp_proposals = [proposal(1, { expires_at: iso(-1) }), proposal(2, { status: 'rejected' })];
    await expect(accept()).resolves.toMatchObject({ ok: false, code: 'expired', error: PROPOSAL_ERROR_COPY.expired });
    await expect(accept({ proposalId: P(2) })).resolves.toMatchObject({ ok: false, code: 'not_pending' });
    expect(decisionCalls()).toHaveLength(0);
  });

  it.each([
    ['mcp_suspended', '42501', 'suspended'],
    ['active writer required', '42501', 'forbidden'],
    ['browser session required', '42501', 'forbidden'],
    ['mcp_expired', 'P0001', 'expired'],
    ['mcp_not_pending', 'P0001', 'not_pending'],
    ['mcp_not_found', 'P0001', 'not_found'],
    ['mcp_invalid_content', '22023', 'invalid_content'],
    ['relation "chapters" violates constraint chapters_pkey', '23505', 'failed'],
  ])('RPC %s -> %s with no SQL text', async (message, code, mapped) => {
    fake.rpcHandlers.set('accept_mcp_chapter_draft', () => ({ error: { message, code } }));
    const result = await accept();
    expect(result).toMatchObject({ ok: false, status: 'error', code: mapped });
    expect((result as { error: string }).error).not.toMatch(SQL_LEAK);
  });

  it('a locked document is refused before the RPC', async () => {
    fake.tables.mcp_proposals = [proposal(1, {
      kind: 'kb_edit', chapter_id: null, node_id: NODE,
      base_content: '이름: 가\n\n나이: 17\n', base_hash: hashContent('이름: 가\n\n나이: 17\n'), content: '이름: 나\n\n나이: 17\n',
    })];
    fake.tables.kb_nodes[0].is_locked = true;
    const result = await accept({ seenHash: hashContent('이름: 가\n\n나이: 17\n') });
    expect(result).toMatchObject({ ok: false, code: 'locked' });
    expect(decisionCalls()).toHaveLength(0);
  });
});

describe('acceptProposal: kb documents', () => {
  it('kb_edit goes through accept_mcp_kb_edit with the 50,000 limit', async () => {
    const node = '이름: 가\n\n나이: 17\n';
    fake.tables.mcp_proposals = [proposal(1, {
      kind: 'kb_edit', chapter_id: null, node_id: NODE,
      base_content: node, base_hash: hashContent(node), content: '이름: 나\n\n나이: 17\n',
    })];
    const ok = await accept({ seenHash: hashContent(node) });
    expect(ok).toMatchObject({ ok: true });
    expect(decisionCalls()[0]).toMatchObject({
      name: 'accept_mcp_kb_edit',
      args: { p_expected_hash: hashContent(node), p_new_content: '이름: 나\n\n나이: 17\n' },
    });
    const long = await accept({ seenHash: hashContent(node), selections: [{ index: 0, accepted: true, editedText: 'x'.repeat(50_001) }] });
    expect(long).toMatchObject({ ok: false, code: 'invalid_content' });
  });

  describe('kb_create', () => {
    beforeEach(() => {
      fake.tables.mcp_proposals = [proposal(1, {
        kind: 'kb_create', chapter_id: null, base_content: null, base_hash: null,
        proposed_category: '장소', proposed_name: '새 도시', content: '도시 설명\n',
      })];
    });
    const create = (over: Record<string, unknown>) =>
      acceptProposal(fake.client, OWNER, { workId: WORK, proposalId: P(1), selections: [], ...over });

    it('requires an explicit folder and version (no default folder)', async () => {
      for (const over of [{}, { folderId: SUB }, { folderVersion: `${ROOT}:장소/${SUB}:도시` }]) {
        await expect(create(over)).resolves.toMatchObject({ ok: false, code: 'folder_required' });
      }
      expect(decisionCalls()).toHaveLength(0);
    });

    it('refuses a folder that is not a current candidate or whose version changed', async () => {
      await expect(create({ folderId: SUB, folderVersion: `${ROOT}:장소/${SUB}:옛이름` }))
        .resolves.toMatchObject({ ok: false, code: 'folder_changed', error: PROPOSAL_ERROR_COPY.folder_changed });
      await expect(create({ folderId: NODE, folderVersion: `${NODE}:주인공` }))
        .resolves.toMatchObject({ ok: false, code: 'folder_changed' });
      expect(decisionCalls()).toHaveLength(0);
    });

    it('passes the chosen folder and version to accept_mcp_kb_create', async () => {
      const version = `${ROOT}:장소/${SUB}:도시`;
      const result = await create({ folderId: SUB, folderVersion: version });
      expect(result).toMatchObject({ ok: true, createdNodeId: 'new-node' });
      expect(decisionCalls()[0]).toEqual({
        name: 'accept_mcp_kb_create', args: { p_proposal_id: P(1), p_folder_id: SUB, p_folder_version: version },
      });
    });

    it('maps mcp_name_collision and folder errors to fixed copy', async () => {
      const version = `${ROOT}:장소/${SUB}:도시`;
      fake.rpcHandlers.set('accept_mcp_kb_create', () => ({ error: { message: 'mcp_name_collision', code: 'P0001' } }));
      await expect(create({ folderId: SUB, folderVersion: version })).resolves.toMatchObject({
        ok: false, code: 'name_collision', error: '같은 이름의 문서가 있어요. 다른 폴더를 선택하거나 제안을 거절해 주세요.',
      });
      for (const message of ['mcp_folder_changed', 'mcp_folder_invalid']) {
        fake.rpcHandlers.set('accept_mcp_kb_create', () => ({ error: { message, code: 'P0001' } }));
        await expect(create({ folderId: SUB, folderVersion: version })).resolves.toMatchObject({ ok: false, code: 'folder_changed' });
      }
    });

    it('refuses hunk selections on a create proposal', async () => {
      const result = await create({ folderId: SUB, folderVersion: `${ROOT}:장소/${SUB}:도시`, selections: [{ index: 0, accepted: true }] });
      expect(result).toMatchObject({ ok: false, code: 'invalid_selection' });
    });
  });
});

describe('rejectProposal', () => {
  it('suspended reject: works without a write-access check (only the reject RPC runs)', async () => {
    const result = await rejectProposal(fake.client, OWNER, { workId: WORK, proposalId: P(1) });
    expect(result).toEqual({ ok: true, status: 'rejected', proposalId: P(1) });
    expect(fake.rpcCalls.map((c) => c.name)).toEqual(['reject_mcp_proposal']);
  });

  it('foreign or cross-work ids are not_found without calling the RPC', async () => {
    fake.tables.mcp_proposals.push(proposal(2, { owner_id: OTHER, work_id: FOREIGN_WORK }));
    for (const input of [{ workId: WORK_2, proposalId: P(1) }, { workId: FOREIGN_WORK, proposalId: P(2) }, { workId: WORK, proposalId: 'x' }]) {
      await expect(rejectProposal(fake.client, OWNER, input)).resolves.toMatchObject({ ok: false, code: 'not_found' });
    }
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it('maps RPC errors to fixed copy', async () => {
    fake.rpcHandlers.set('reject_mcp_proposal', () => ({ error: { message: 'mcp_not_pending', code: 'P0001' } }));
    await expect(rejectProposal(fake.client, OWNER, { workId: WORK, proposalId: P(1) }))
      .resolves.toMatchObject({ ok: false, code: 'not_pending' });
    fake.rpcHandlers.set('reject_mcp_proposal', () => ({ error: { message: 'deadlock detected', code: '40P01' } }));
    const failed = await rejectProposal(fake.client, OWNER, { workId: WORK, proposalId: P(1) });
    expect(failed).toMatchObject({ ok: false, code: 'failed', error: PROPOSAL_ERROR_COPY.reject_failed });
  });
});

describe('revertProposal', () => {
  const STATE_HASH = 'b'.repeat(64);
  beforeEach(() => {
    fake.tables.mcp_proposals = [proposal(1, { status: 'accepted', undo_until: iso(DAY) })];
  });
  const revert = (over: Record<string, unknown> = {}) =>
    revertProposal(fake.client, OWNER, { workId: WORK, proposalId: P(1), ...over });

  it('returns the RPC current_hash unchanged as the confirm token, then passes it back', async () => {
    fake.rpcHandlers.set('revert_mcp_proposal', (args) => (args.p_confirm
      ? { data: { id: P(1), status: 'reverted', confirm_required: false, changed_since_accept: true, current_hash: null } }
      : { data: { id: P(1), status: 'accepted', confirm_required: true, changed_since_accept: true, current_hash: STATE_HASH } }));
    const first = await revert();
    expect(first).toEqual({ ok: false, status: 'confirm_required', proposalId: P(1), confirmHash: STATE_HASH });
    const second = await revert({ confirm: true, seenHash: STATE_HASH });
    expect(second).toEqual({ ok: true, status: 'reverted', proposalId: P(1), changedSinceAccept: true });
    expect(fake.rpcCalls.map((c) => c.args)).toEqual([
      { p_proposal_id: P(1), p_confirm: false, p_seen_hash: null },
      { p_proposal_id: P(1), p_confirm: true, p_seen_hash: STATE_HASH },
    ]);
  });

  it('confirm without a seen hash is refused before the RPC', async () => {
    await expect(revert({ confirm: true })).resolves.toMatchObject({ ok: false, code: 'invalid_request' });
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it.each([
    ['mcp_undo_expired', 'P0001', 'undo_expired'],
    ['mcp_not_revertible', 'P0001', 'not_revertible'],
    ['mcp_suspended', '42501', 'suspended'],
    ['mcp_invalid_decision', '22023', 'invalid_request'],
    ['mcp_not_found', 'P0001', 'not_found'],
    ['canceling statement due to lock timeout', '55P03', 'failed'],
  ])('RPC %s -> %s', async (message, code, mapped) => {
    fake.rpcHandlers.set('revert_mcp_proposal', () => ({ error: { message, code } }));
    const result = await revert();
    expect(result).toMatchObject({ ok: false, status: 'error', code: mapped });
    expect((result as { error: string }).error).not.toMatch(SQL_LEAK);
  });

  it('foreign proposals are not_found without calling the RPC', async () => {
    fake.tables.mcp_proposals.push(proposal(2, { owner_id: OTHER, work_id: FOREIGN_WORK, status: 'accepted' }));
    await expect(revert({ proposalId: P(2) })).resolves.toMatchObject({ ok: false, code: 'not_found' });
    await expect(revertProposal(fake.client, OWNER, { workId: FOREIGN_WORK, proposalId: P(2) }))
      .resolves.toMatchObject({ ok: false, code: 'not_found' });
    expect(fake.rpcCalls).toHaveLength(0);
  });
});
