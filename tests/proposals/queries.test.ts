import { beforeEach, describe, expect, it } from 'vitest';
import { FakeSupabase } from '../helpers/proposals-fake-supabase';
import {
  countPendingProposalsByWork,
  countPendingProposalsForTarget,
  getProposalDetail,
  listWorkProposals,
} from '@/lib/proposals/queries';
import { hashContent } from '@/lib/proposals/hash';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const WORK = '33333333-3333-4333-8333-333333333333';
const WORK_2 = '33333333-3333-4333-8333-333333333334';
const FOREIGN_WORK = '44444444-4444-4444-8444-444444444444';
const CHAPTER = '55555555-5555-4555-8555-555555555555';
const NODE = '66666666-6666-4666-8666-666666666666';
const CLIENT_LIVE = '77777777-7777-4777-8777-777777777777';
const CLIENT_GONE = '77777777-7777-4777-8777-777777777778';
const CLIENT_OLD_SAME_PAIR = '77777777-7777-4777-8777-777777777779';

const id = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;
const DAY = 86_400_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

const BASE = '첫 문단\n\n둘째 문단\n\n셋째 문단\n';
const DRAFT = '첫 문단 고침\n\n둘째 문단\n\n셋째 문단\n\n넷째 문단\n';

function proposal(n: number, over: Record<string, unknown> = {}) {
  return {
    id: id(n), owner_id: OWNER, work_id: WORK, kind: 'chapter_draft',
    chapter_id: CHAPTER, node_id: null, proposed_category: null, proposed_name: null,
    content: DRAFT, base_content: BASE, base_hash: hashContent(BASE), status: 'pending',
    source_client_id: CLIENT_LIVE, source_client_name: 'Claude', source_host: 'claude.ai',
    created_at: iso(-n * 1000), expires_at: iso(10 * DAY), decided_at: null, decision: null,
    undo_until: null, created_node_id: null,
    ...over,
  };
}

let fake: FakeSupabase;
let chapterContent: string | null;

beforeEach(() => {
  chapterContent = BASE;
  fake = new FakeSupabase({
    works: [
      { id: WORK, owner_id: OWNER, title: '내 작품', deleted_at: null },
      { id: WORK_2, owner_id: OWNER, title: '두 번째', deleted_at: null },
      { id: FOREIGN_WORK, owner_id: OTHER, title: '남의 작품', deleted_at: null },
    ],
    chapters: [{ id: CHAPTER, work_id: WORK, title: '1화', deleted_at: null }],
    kb_nodes: [{
      id: NODE, owner_id: OWNER, work_id: WORK, scope: 'work', node_type: 'file', category: '인물',
      name: '주인공', content: '이름: 가\n', is_locked: false, deleted_at: null, parent_id: null,
    }],
    mcp_connections: [
      { user_id: OWNER, oauth_client_id: CLIENT_LIVE, client_name: 'Claude', redirect_host: 'claude.ai',
        connected_at: iso(-DAY), last_used_at: null, revoked_at: null },
    ],
    mcp_proposals: [],
  });
  fake.rpcHandlers.set('read_chapter_content', () => ({ data: chapterContent }));
});

describe('listWorkProposals', () => {
  it('owner: a foreign or missing work is not_found and never lists rows', async () => {
    fake.tables.mcp_proposals.push(proposal(1, { owner_id: OTHER, work_id: FOREIGN_WORK }));
    const foreign = await listWorkProposals(fake.client, OWNER, FOREIGN_WORK);
    expect(foreign).toEqual({ ok: false, reason: 'not_found' });
    const bogus = await listWorkProposals(fake.client, OWNER, 'not-a-uuid');
    expect(bogus).toEqual({ ok: false, reason: 'not_found' });
  });

  it('owner: rows of another owner in the same work id are filtered out', async () => {
    fake.tables.mcp_proposals.push(proposal(1), proposal(2, { owner_id: OTHER }));
    const result = await listWorkProposals(fake.client, OWNER, WORK, 'all');
    expect(result.ok && result.proposals.map((p) => p.id)).toEqual([id(1)]);
  });

  it('expired: pending past expires_at leaves the pending tab and shows as expired in done', async () => {
    fake.tables.mcp_proposals.push(
      proposal(1),
      proposal(2, { expires_at: iso(-1000) }),
      proposal(3, { status: 'rejected', decided_at: iso(-500) }),
    );
    const pending = await listWorkProposals(fake.client, OWNER, WORK);
    expect(pending.ok && pending.proposals.map((p) => p.id)).toEqual([id(1)]);
    expect(pending.ok && pending.pendingCount).toBe(1);

    const done = await listWorkProposals(fake.client, OWNER, WORK, 'done');
    expect(done.ok && done.proposals.map((p) => [p.id, p.status])).toEqual([
      [id(3), 'rejected'], [id(2), 'expired'],
    ]);
  });

  it('defaults to pending, newest first, with titles and change counts', async () => {
    fake.tables.mcp_proposals.push(
      proposal(5),
      proposal(2, {
        kind: 'kb_edit', chapter_id: null, node_id: NODE,
        base_content: '이름: 가\n', base_hash: hashContent('이름: 가\n'), content: '이름: 나\n',
      }),
      proposal(3, {
        kind: 'kb_create', chapter_id: null, base_content: null, base_hash: null,
        proposed_category: '장소', proposed_name: '새 도시', content: '도시 설명\n',
      }),
    );
    const result = await listWorkProposals(fake.client, OWNER, WORK);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proposals.map((p) => p.id)).toEqual([id(2), id(3), id(5)]);
    const [edit, create, draft] = result.proposals;
    expect(draft).toMatchObject({ kind: 'chapter_draft', targetTitle: '1화', changeCount: 2 });
    expect(edit).toMatchObject({ kind: 'kb_edit', targetTitle: '주인공', changeCount: 1 });
    expect(create).toMatchObject({ kind: 'kb_create', targetTitle: '새 도시', proposedCategory: '장소', changeCount: null });
  });

  it('snapshot: keeps the stored client name/host and flags disconnected sources', async () => {
    fake.tables.mcp_proposals.push(
      proposal(1),
      proposal(2, { source_client_id: CLIENT_GONE, source_client_name: '옛 클라이언트', source_host: 'old.example' }),
      // Reconnecting the same client (same name + host) revokes the old client id (0037);
      // that is still the same live connection, not "연결 해제됨".
      proposal(3, { source_client_id: CLIENT_OLD_SAME_PAIR }),
    );
    const result = await listWorkProposals(fake.client, OWNER, WORK);
    if (!result.ok) throw new Error('expected ok');
    const byId = Object.fromEntries(result.proposals.map((p) => [p.id, p.source]));
    expect(byId[id(1)]).toEqual({ clientName: 'Claude', host: 'claude.ai', disconnected: false });
    expect(byId[id(2)]).toEqual({ clientName: '옛 클라이언트', host: 'old.example', disconnected: true });
    expect(byId[id(3)]).toEqual({ clientName: 'Claude', host: 'claude.ai', disconnected: false });
  });

  it('returns error (not an empty list) when the proposal query fails', async () => {
    fake.failTables.set('mcp_proposals', 'boom');
    await expect(listWorkProposals(fake.client, OWNER, WORK)).resolves.toEqual({ ok: false, reason: 'error' });
  });
});

describe('countPendingProposalsByWork', () => {
  it('count: builds the per-work map with one proposal query (no N+1)', async () => {
    fake.tables.mcp_proposals.push(
      proposal(1), proposal(2, { chapter_id: 'c2' }), proposal(3, { work_id: WORK_2 }),
      proposal(4, { expires_at: iso(-1) }), proposal(5, { status: 'accepted' }),
      proposal(6, { owner_id: OTHER, work_id: FOREIGN_WORK }),
    );
    const counts = await countPendingProposalsByWork(fake.client, OWNER, [WORK, WORK_2, FOREIGN_WORK]);
    expect(counts).toEqual({ [WORK]: 2, [WORK_2]: 1, [FOREIGN_WORK]: 0 });
    expect(fake.fromCalls.filter((t) => t === 'mcp_proposals')).toHaveLength(1);
  });

  it('count: an empty id list makes no query; a failed query yields zeros', async () => {
    await expect(countPendingProposalsByWork(fake.client, OWNER, [])).resolves.toEqual({});
    expect(fake.fromCalls).toHaveLength(0);
    fake.failTables.set('mcp_proposals', 'boom');
    await expect(countPendingProposalsByWork(fake.client, OWNER, [WORK])).resolves.toEqual({ [WORK]: 0 });
  });
});

describe('countPendingProposalsForTarget', () => {
  it('count: counts live pending proposals of one chapter or document', async () => {
    fake.tables.mcp_proposals.push(
      proposal(1), proposal(2, { expires_at: iso(-1) }),
      proposal(3, { kind: 'kb_edit', chapter_id: null, node_id: NODE }),
      proposal(4, { kind: 'kb_edit', chapter_id: null, node_id: NODE }),
      proposal(5, { kind: 'kb_edit', chapter_id: null, node_id: NODE, owner_id: OTHER }),
    );
    await expect(countPendingProposalsForTarget(fake.client, OWNER, WORK, 'chapter', CHAPTER))
      .resolves.toEqual({ count: 1, proposalIds: [id(1)] });
    const node = await countPendingProposalsForTarget(fake.client, OWNER, WORK, 'node', NODE);
    expect(node.count).toBe(2);
    expect(node.proposalIds).toEqual([id(3), id(4)]);
    await expect(countPendingProposalsForTarget(fake.client, OWNER, WORK, 'node', 'bad'))
      .resolves.toEqual({ count: 0, proposalIds: [] });
  });
});

describe('getProposalDetail', () => {
  it('owner: foreign, cross-work and missing ids are the same not_found', async () => {
    fake.tables.mcp_proposals.push(
      proposal(1, { owner_id: OTHER, work_id: FOREIGN_WORK }),
      proposal(2, { work_id: WORK_2 }),
    );
    for (const [work, pid] of [[FOREIGN_WORK, id(1)], [WORK, id(1)], [WORK, id(2)], [WORK, id(9)], [WORK, 'x']]) {
      await expect(getProposalDetail(fake.client, OWNER, work, pid)).resolves.toEqual({ ok: false, reason: 'not_found' });
    }
  });

  it('chapter draft: hunks against the current text, seenHash = hash(current), not stale', async () => {
    fake.tables.mcp_proposals.push(proposal(1));
    const result = await getProposalDetail(fake.client, OWNER, WORK, id(1));
    if (!result.ok) throw new Error('expected ok');
    const d = result.detail;
    expect(d.kind).toBe('chapter_draft');
    expect(d.status).toBe('pending');
    expect(d.isStale).toBe(false);
    expect(d.seenHash).toBe(hashContent(BASE));
    expect(d.target).toMatchObject({ title: '1화', state: 'ok' });
    expect(d.currentContent).toBe(BASE);
    expect(d.hunks.map((h) => [h.index, h.kind, h.applicable])).toEqual([[0, '바뀜', true], [1, '추가', true]]);
    expect(d.hunks[0].currentText).toBe('첫 문단\n\n');
    // The DTO never carries the stored base hash.
    expect(Object.keys(d)).not.toContain('baseHash');
    expect(Object.keys(d)).not.toContain('base_hash');
  });

  it('chapter draft: original changed after proposing -> isStale and re-anchored hunks', async () => {
    fake.tables.mcp_proposals.push(proposal(1));
    chapterContent = '작가가 새로 쓴 첫 문단\n\n둘째 문단\n\n셋째 문단\n';
    const result = await getProposalDetail(fake.client, OWNER, WORK, id(1));
    if (!result.ok) throw new Error('expected ok');
    expect(result.detail.isStale).toBe(true);
    expect(result.detail.seenHash).toBe(hashContent(chapterContent));
    expect(result.detail.hunks.map((h) => h.applicable)).toEqual([false, true]);
  });

  it('expired: a pending row past expires_at is shown as expired with no seenHash', async () => {
    fake.tables.mcp_proposals.push(proposal(1, { expires_at: iso(-1) }));
    const result = await getProposalDetail(fake.client, OWNER, WORK, id(1));
    if (!result.ok) throw new Error('expected ok');
    expect(result.detail.status).toBe('expired');
    expect(result.detail.seenHash).toBeNull();
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it('kb edit: locked and deleted targets are reported, not compared', async () => {
    const editRow = proposal(1, {
      kind: 'kb_edit', chapter_id: null, node_id: NODE,
      base_content: '이름: 가\n', base_hash: hashContent('이름: 가\n'), content: '이름: 나\n',
    });
    fake.tables.mcp_proposals.push(editRow);
    const ok = await getProposalDetail(fake.client, OWNER, WORK, id(1));
    expect(ok.ok && ok.detail.target).toMatchObject({ title: '주인공', state: 'ok' });
    expect(ok.ok && ok.detail.seenHash).toBe(hashContent('이름: 가\n'));

    fake.tables.kb_nodes[0].is_locked = true;
    const locked = await getProposalDetail(fake.client, OWNER, WORK, id(1));
    expect(locked.ok && locked.detail.target.state).toBe('locked');
    expect(locked.ok && locked.detail.seenHash).toBeNull();

    fake.tables.kb_nodes[0].deleted_at = iso(-1);
    const gone = await getProposalDetail(fake.client, OWNER, WORK, id(1));
    expect(gone.ok && gone.detail.target).toMatchObject({ state: 'missing', title: null });
    expect(gone.ok && gone.detail.hunks).toEqual([]);
  });

  it('kb create: lists category folders, no hunks', async () => {
    fake.tables.kb_nodes.push(
      { id: 'f-root', owner_id: OWNER, work_id: WORK, scope: 'work', node_type: 'folder', category: '장소',
        name: '장소', parent_id: null, deleted_at: null },
      { id: 'f-sub', owner_id: OWNER, work_id: WORK, scope: 'work', node_type: 'folder', category: '장소',
        name: '도시', parent_id: 'f-root', deleted_at: null },
    );
    fake.tables.mcp_proposals.push(proposal(1, {
      kind: 'kb_create', chapter_id: null, base_content: null, base_hash: null,
      proposed_category: '장소', proposed_name: '새 도시', content: '도시 설명\n',
    }));
    const result = await getProposalDetail(fake.client, OWNER, WORK, id(1));
    if (!result.ok) throw new Error('expected ok');
    expect(result.detail.hunks).toEqual([]);
    expect(result.detail.target).toMatchObject({ title: '새 도시', state: 'ok' });
    expect(result.detail.proposedCategory).toBe('장소');
    expect(result.detail.folders).toMatchObject({ status: 'ok' });
    if (result.detail.folders?.status === 'ok') {
      expect(result.detail.folders.candidates.map((c) => c.version)).toEqual(['f-root:장소', 'f-root:장소/f-sub:도시']);
    }
  });

  it('accepted: read-only hunks with the recorded decision and undo window', async () => {
    fake.tables.mcp_proposals.push(proposal(1, {
      status: 'accepted', decided_at: iso(-1000), undo_until: iso(DAY),
      decision: { accepted_indexes: [1], edited_indexes: [] },
    }));
    const result = await getProposalDetail(fake.client, OWNER, WORK, id(1));
    if (!result.ok) throw new Error('expected ok');
    expect(result.detail.status).toBe('accepted');
    expect(result.detail.seenHash).toBeNull();
    expect(result.detail.canRevert).toBe(true);
    expect(result.detail.decision).toEqual({ acceptedIndexes: [1], editedIndexes: [] });
    expect(result.detail.hunks).toHaveLength(2);
  });
});
