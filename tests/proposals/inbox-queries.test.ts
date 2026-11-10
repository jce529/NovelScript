import { beforeEach, describe, expect, it } from 'vitest';
import { FakeSupabase } from '../helpers/proposals-fake-supabase';
import {
  countPendingDraftsByChapter,
  countPendingProposalsTotal,
  listInboxProposals,
} from '@/lib/proposals/queries';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const WORK = '33333333-3333-4333-8333-333333333333';
const WORK_2 = '33333333-3333-4333-8333-333333333334';
const WORK_DELETED = '33333333-3333-4333-8333-333333333335';
const FOREIGN_WORK = '44444444-4444-4444-8444-444444444444';
const CH_1 = '55555555-5555-4555-8555-555555555551';
const CH_2 = '55555555-5555-4555-8555-555555555552';
const CH_W2 = '55555555-5555-4555-8555-555555555553';
const NODE = '66666666-6666-4666-8666-666666666666';
const CLIENT = '77777777-7777-4777-8777-777777777777';

const id = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;
const DAY = 86_400_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const BASE = '첫 문단\n\n둘째 문단\n';

function proposal(n: number, over: Record<string, unknown> = {}) {
  return {
    id: id(n), owner_id: OWNER, work_id: WORK, kind: 'chapter_draft',
    chapter_id: CH_1, node_id: null, proposed_category: null, proposed_name: null,
    content: `${BASE}셋째 문단\n`, base_content: BASE, status: 'pending',
    source_client_id: CLIENT, source_client_name: 'Claude', source_host: 'claude.ai',
    created_at: iso(-n * 1000), expires_at: iso(10 * DAY), decided_at: null, decision: null,
    undo_until: null, created_node_id: null,
    ...over,
  };
}

const kbEdit = (n: number, over: Record<string, unknown> = {}) => proposal(n, {
  kind: 'kb_edit', chapter_id: null, node_id: NODE, base_content: '이름: 가\n', content: '이름: 나\n', ...over,
});
const kbCreate = (n: number, over: Record<string, unknown> = {}) => proposal(n, {
  kind: 'kb_create', chapter_id: null, base_content: null, proposed_category: '장소', proposed_name: '새 도시', content: '도시\n', ...over,
});

let fake: FakeSupabase;

beforeEach(() => {
  fake = new FakeSupabase({
    works: [
      { id: WORK, owner_id: OWNER, title: '내 작품', deleted_at: null, created_at: iso(-3 * DAY) },
      { id: WORK_2, owner_id: OWNER, title: '두 번째', deleted_at: null, created_at: iso(-2 * DAY) },
      { id: WORK_DELETED, owner_id: OWNER, title: '지운 작품', deleted_at: iso(-DAY), created_at: iso(-4 * DAY) },
      { id: FOREIGN_WORK, owner_id: OTHER, title: '남의 작품', deleted_at: null, created_at: iso(-DAY) },
    ],
    chapters: [
      { id: CH_1, work_id: WORK, title: '1화', deleted_at: null },
      { id: CH_2, work_id: WORK, title: '2화', deleted_at: null },
      { id: CH_W2, work_id: WORK_2, title: '프롤로그', deleted_at: null },
    ],
    kb_nodes: [{
      id: NODE, owner_id: OWNER, work_id: WORK_2, scope: 'work', node_type: 'file', category: '인물',
      name: '주인공', content: '이름: 가\n', is_locked: false, deleted_at: null, parent_id: null,
    }],
    mcp_connections: [
      { user_id: OWNER, oauth_client_id: CLIENT, client_name: 'Claude', redirect_host: 'claude.ai',
        connected_at: iso(-DAY), last_used_at: null, revoked_at: null },
    ],
    mcp_proposals: [],
  });
});

describe('listInboxProposals', () => {
  it('lists the pending proposals of every owned work with work and target titles, newest first', async () => {
    fake.tables.mcp_proposals.push(
      proposal(3),
      proposal(1, { work_id: WORK_2, chapter_id: CH_W2 }),
      kbEdit(2, { work_id: WORK_2 }),
    );
    const result = await listInboxProposals(fake.client, OWNER);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proposals.map((p) => p.id)).toEqual([id(1), id(2), id(3)]);
    expect(result.proposals.map((p) => [p.workTitle, p.targetTitle])).toEqual([
      ['두 번째', '프롤로그'], ['두 번째', '주인공'], ['내 작품', '1화'],
    ]);
    expect(result.pendingTotal).toBe(3);
    expect(result.works.map((w) => [w.title, w.pendingCount])).toEqual([['두 번째', 2], ['내 작품', 1]]);
  });

  it('never lists another owner, a foreign work or a deleted work', async () => {
    fake.tables.mcp_proposals.push(
      proposal(1),
      proposal(2, { owner_id: OTHER, work_id: FOREIGN_WORK }),
      proposal(3, { work_id: WORK_DELETED }),
    );
    const result = await listInboxProposals(fake.client, OWNER, { filter: 'all' });
    expect(result.ok && result.proposals.map((p) => p.id)).toEqual([id(1)]);
    const scopedForeign = await listInboxProposals(fake.client, OWNER, { filter: 'all', workId: FOREIGN_WORK });
    expect(scopedForeign.ok && scopedForeign.proposals).toEqual([]);
  });

  it('filters by kind: draft = chapter drafts, kb = edits and creations', async () => {
    fake.tables.mcp_proposals.push(proposal(1), kbEdit(2), kbCreate(3));
    const drafts = await listInboxProposals(fake.client, OWNER, { kind: 'draft' });
    expect(drafts.ok && drafts.proposals.map((p) => p.kind)).toEqual(['chapter_draft']);
    const kb = await listInboxProposals(fake.client, OWNER, { kind: 'kb' });
    expect(kb.ok && kb.proposals.map((p) => p.kind).sort()).toEqual(['kb_create', 'kb_edit']);
    const all = await listInboxProposals(fake.client, OWNER, { kind: 'all' });
    expect(all.ok && all.proposals).toHaveLength(3);
  });

  it('narrows to one work and one chapter (tree shortcut); malformed scope ids are ignored, not matched', async () => {
    fake.tables.mcp_proposals.push(
      proposal(1), proposal(2, { chapter_id: CH_2 }), proposal(3, { work_id: WORK_2, chapter_id: CH_W2 }),
    );
    const byWork = await listInboxProposals(fake.client, OWNER, { workId: WORK });
    expect(byWork.ok && byWork.proposals.map((p) => p.id).sort()).toEqual([id(1), id(2)]);
    const byChapter = await listInboxProposals(fake.client, OWNER, { workId: WORK, chapterId: CH_2 });
    expect(byChapter.ok && byChapter.proposals.map((p) => p.id)).toEqual([id(2)]);
    expect(byChapter.ok && byChapter.scope).toEqual({ workId: WORK, chapterId: CH_2 });
    const junk = await listInboxProposals(fake.client, OWNER, { workId: 'nope', chapterId: 'nope' });
    expect(junk.ok && junk.scope).toEqual({ workId: null, chapterId: null });
    expect(junk.ok && junk.proposals).toHaveLength(3);
  });

  it('keeps several pending drafts of one chapter as separate rows', async () => {
    fake.tables.mcp_proposals.push(proposal(1), proposal(2, { content: `${BASE}다른 초안\n` }));
    const result = await listInboxProposals(fake.client, OWNER);
    expect(result.ok && result.proposals.filter((p) => p.targetTitle === '1화')).toHaveLength(2);
  });

  it('done shows decided and lapsed rows; expired pending is not counted as pending', async () => {
    fake.tables.mcp_proposals.push(
      proposal(1),
      proposal(2, { expires_at: iso(-1000) }),
      proposal(3, { status: 'rejected', decided_at: iso(-500) }),
    );
    const pending = await listInboxProposals(fake.client, OWNER);
    expect(pending.ok && pending.proposals.map((p) => p.id)).toEqual([id(1)]);
    expect(pending.ok && pending.pendingTotal).toBe(1);
    const done = await listInboxProposals(fake.client, OWNER, { filter: 'done' });
    expect(done.ok && done.proposals.map((p) => [p.id, p.status])).toEqual([[id(3), 'rejected'], [id(2), 'expired']]);
  });

  it('reports failure instead of throwing or showing partial data', async () => {
    fake.failTables.set('mcp_proposals', 'boom');
    expect(await listInboxProposals(fake.client, OWNER)).toEqual({ ok: false });
    fake.failTables.clear();
    fake.failTables.set('works', 'boom');
    expect(await listInboxProposals(fake.client, OWNER)).toEqual({ ok: false });
    expect(await listInboxProposals(fake.client, 'not-a-uuid')).toEqual({ ok: false });
  });
});

describe('countPendingProposalsTotal / countPendingDraftsByChapter', () => {
  it('counts only the owner\'s live pending rows over all works', async () => {
    fake.tables.mcp_proposals.push(
      proposal(1), kbCreate(2, { work_id: WORK_2 }),
      proposal(3, { expires_at: iso(-1000) }), proposal(4, { status: 'accepted' }),
      proposal(5, { owner_id: OTHER, work_id: FOREIGN_WORK }),
    );
    expect(await countPendingProposalsTotal(fake.client, OWNER)).toBe(2);
    expect(await countPendingProposalsTotal(fake.client, 'not-a-uuid')).toBeNull();
    fake.failTables.set('mcp_proposals', 'boom');
    expect(await countPendingProposalsTotal(fake.client, OWNER)).toBeNull();
  });

  it('counts live pending drafts per chapter of one work; failure gives no badges', async () => {
    fake.tables.mcp_proposals.push(
      proposal(1), proposal(2, { content: `${BASE}다른\n` }), proposal(3, { chapter_id: CH_2 }),
      kbEdit(4), proposal(5, { work_id: WORK_2, chapter_id: CH_W2 }), proposal(6, { status: 'rejected' }),
    );
    expect(await countPendingDraftsByChapter(fake.client, OWNER, WORK)).toEqual({ [CH_1]: 2, [CH_2]: 1 });
    expect(await countPendingDraftsByChapter(fake.client, OWNER, 'nope')).toEqual({});
    fake.failTables.set('mcp_proposals', 'boom');
    expect(await countPendingDraftsByChapter(fake.client, OWNER, WORK)).toEqual({});
  });
});
