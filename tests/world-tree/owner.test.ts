import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  OWNER_COPY,
  getOwnedBranch,
  getOwnedTimeline,
  getWorldTreeOwnerState,
  markBranchNoticeRead,
} from '@/lib/world-tree/owner';
import { WRITE_SUSPENDED_MESSAGE } from '@/lib/auth/write-access';
import type { WorldBranch, Era, EraPlacement } from '@/lib/world-tree/types';
import {
  allBranches,
  blindParentSummary,
  eligibleSummary,
  ids,
  ifEras,
  ownerTree,
  placements,
  readerNormalTree,
  ROOT_TITLE,
  trunkEras,
} from './fixtures';

// ---------------------------------------------------------------------------
// Fake Supabase client: tables are filtered by the eq/is calls the code under test makes,
// so ownership filters are exercised for real. rpc is scripted per function name.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;
type RpcResult = { data: unknown; error: { message: string; code?: string } | null };

interface FakeOptions {
  tables?: Record<string, Row[]>;
  failTables?: string[];
  writeAccess?: { can_write: boolean; reason: string; sanctioned_until?: string | null };
  rpc?: (fn: string, args: Record<string, unknown>) => RpcResult | Promise<RpcResult>;
}

const T0 = '2026-10-01T00:00:00.000Z';
const OTHER = '00000000-0000-4000-8000-000000000999';
const NOTICE_A = '00000000-0000-4000-8000-000000000070';
const NOTICE_B = '00000000-0000-4000-8000-000000000071';

const branchRow = (b: WorldBranch, extra: Row = {}): Row => ({
  id: b.id, root_work_id: b.rootWorkId, work_id: b.workId, owner_id: b.ownerId, parent_branch_id: b.parentBranchId,
  kind: b.kind, status: b.status, fork_era_id: b.forkEraId, confirmed_at: b.confirmedAt, deleted_at: b.deletedAt,
  request_id: b.status === 'draft' ? ids.requestId : null, created_at: T0, ...extra,
});
const eraRow = (e: Era): Row => ({
  id: e.id, branch_id: e.branchId, source_era_id: e.sourceEraId, position: e.position, name: e.name,
  year_label: e.yearLabel, memo: e.memo, inherited: e.inherited, deleted_at: e.deletedAt,
});
const placementRow = (p: EraPlacement): Row => ({
  id: p.id, branch_id: p.branchId, era_id: p.eraId, work_id: p.workId, order_index: p.orderIndex,
  concurrent_with_prev: p.concurrentWithPrev, relation_label: p.relationLabel, deleted_at: null,
});

const works: Row[] = [
  { id: ids.rootWork, owner_id: ids.owner, title: ROOT_TITLE, deleted_at: null },
  { id: ids.ifWork, owner_id: ids.owner, title: '만약 왕이 살았다면', deleted_at: null },
  { id: ids.expandWork, owner_id: ids.owner, title: '변방의 기사', deleted_at: null },
  { id: ids.grandchildWork, owner_id: ids.owner, title: '기사의 아들', deleted_at: null },
  { id: ids.draftWork, owner_id: ids.owner, title: '초안', deleted_at: null },
  { id: OTHER, owner_id: OTHER, title: '남의 작품', deleted_at: null },
];

const notices: Row[] = [
  { id: NOTICE_A, source_work_id: ids.rootWork, branch_id: ids.ifBranch, event_key: `source_kb:${ids.sourceNode}`, created_at: '2026-10-05T00:00:00.000Z', read_at: null },
  { id: NOTICE_B, source_work_id: ids.rootWork, branch_id: ids.ifBranch, event_key: 'source_changed_before_confirm', created_at: '2026-10-02T00:00:00.000Z', read_at: '2026-10-03T00:00:00.000Z' },
];

function defaultTables(): Record<string, Row[]> {
  return {
    works,
    world_branches: allBranches.map((b) => branchRow(b)),
    world_eras: [...trunkEras, ...ifEras].map(eraRow),
    world_era_placements: placements.map(placementRow),
    world_branch_notices: notices,
  };
}

function fake(options: FakeOptions = {}) {
  const tables = options.tables ?? defaultTables();
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const selects: Array<{ table: string; columns: string }> = [];
  const fromCalls: string[] = [];

  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ fn, args });
    if (fn === 'get_write_access') {
      return { data: options.writeAccess ?? { can_write: true, reason: 'ok', sanctioned_until: null }, error: null };
    }
    if (options.rpc) return options.rpc(fn, args);
    if (fn === 'get_world_branch_eligibility') return { data: eligibleSummary, error: null };
    if (fn === 'get_world_tree') return { data: { ...ownerTree, focusWorkId: args.p_work_id }, error: null };
    return { data: null, error: { message: 'unexpected rpc ' + fn } };
  });

  const from = vi.fn((table: string) => {
    fromCalls.push(table);
    const filters: Array<(row: Row) => boolean> = [];
    let limit = Infinity;
    const resolveRows = () => {
      if (options.failTables?.includes(table)) return { data: null, error: { message: 'boom' } };
      const rows = (tables[table] ?? []).filter((row) => filters.every((f) => f(row))).slice(0, limit);
      return { data: rows, error: null };
    };
    const builder: Record<string, unknown> = {
      select: vi.fn((columns: string) => { selects.push({ table, columns }); return builder; }),
      eq: vi.fn((col: string, val: unknown) => { filters.push((r) => r[col] === val); return builder; }),
      is: vi.fn((col: string, val: unknown) => { filters.push((r) => (r[col] ?? null) === val); return builder; }),
      in: vi.fn((col: string, vals: unknown[]) => { filters.push((r) => vals.includes(r[col])); return builder; }),
      order: vi.fn(() => builder),
      limit: vi.fn((n: number) => { limit = n; return builder; }),
      maybeSingle: vi.fn(async () => {
        const res = resolveRows();
        if (res.error) return res;
        return { data: (res.data as Row[])[0] ?? null, error: null };
      }),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(resolveRows()).then(resolve, reject),
    };
    return builder;
  });

  const client = { rpc, from } as unknown as SupabaseClient;
  const domainRpc = () => rpcCalls.filter((c) => c.fn !== 'get_write_access');
  return { client, rpcCalls, domainRpc, selects, fromCalls };
}

const WORLD_TABLES = ['world_branches', 'world_eras', 'world_era_placements', 'world_branch_notices'];

// ---------------------------------------------------------------------------
// getWorldTreeOwnerState
// ---------------------------------------------------------------------------

describe('getWorldTreeOwnerState', () => {
  it('rejects malformed ids before any query', async () => {
    for (const input of [{ ownerId: 'x', workId: ids.rootWork }, { ownerId: ids.owner, workId: 'nope' }]) {
      const f = fake();
      const result = await getWorldTreeOwnerState(f.client, input);
      expect(result).toMatchObject({ ok: false, code: 'invalid_input', retryable: false });
      expect(f.fromCalls).toHaveLength(0);
      expect(f.rpcCalls).toHaveLength(0);
    }
  });

  it("returns forbidden for someone else's work and reads no world rows or eligibility", async () => {
    const f = fake();
    const result = await getWorldTreeOwnerState(f.client, { ownerId: ids.owner, workId: OTHER });
    expect(result).toMatchObject({ ok: false, code: 'forbidden', error: OWNER_COPY.forbidden });
    expect(f.fromCalls.filter((t) => WORLD_TABLES.includes(t))).toHaveLength(0);
    expect(f.domainRpc()).toHaveLength(0);
  });

  it('builds the trunk owner state with a delete block from live children', async () => {
    const f = fake();
    const result = await getWorldTreeOwnerState(f.client, { ownerId: ids.owner, workId: ids.rootWork });
    if (!result.ok) throw new Error('expected ok: ' + result.code);
    const { state } = result;
    expect(state.work).toEqual({ id: ids.rootWork, title: ROOT_TITLE });
    expect(state.branch?.id).toBe(ids.rootBranch);
    expect(state.branch?.kind).toBe('trunk');
    expect(state.draft).toBeNull();
    expect(state.deletion).toEqual({ canDelete: false, reason: 'has_children', message: OWNER_COPY.hasChildren });
    expect(state.timeline?.draft.branchId).toBe(ids.rootBranch);
    expect(state.timeline?.draft.eras.map((e) => e.id)).toEqual([ids.eraAncient, ids.eraMedieval, ids.eraModern]);
    expect(state.timeline?.baseline.eras).toHaveLength(3);
    expect(state.timeline?.baseline.placements.map((p) => p.id).sort()).toEqual([ids.placementConcurrent, ids.placementRoot].sort());
    // Live children fork at 중세 (If), 근대 (expand); the draft forks at 고대.
    expect([...(state.timeline?.baseline.forkEraIds ?? [])].sort()).toEqual([ids.eraAncient, ids.eraMedieval, ids.eraModern].sort());
    expect(state.eligibility).toEqual({ status: 'ok', summary: eligibleSummary });
    expect(state.tree.status).toBe('ok');
  });

  it('marks a leaf branch deletable and gives notices without event keys or copies', async () => {
    const f = fake();
    const result = await getWorldTreeOwnerState(f.client, { ownerId: ids.owner, workId: ids.ifWork });
    if (!result.ok) throw new Error('expected ok');
    const { state } = result;
    expect(state.deletion).toEqual({ canDelete: true, reason: null, message: null });
    expect(state.notices).toEqual([
      { id: NOTICE_A, branchId: ids.ifBranch, sourceWorkId: ids.rootWork, kind: 'source_changed', createdAt: '2026-10-05T00:00:00.000Z', readAt: null, read: false, message: OWNER_COPY.noticeSourceChanged },
      { id: NOTICE_B, branchId: ids.ifBranch, sourceWorkId: ids.rootWork, kind: 'source_changed_before_confirm', createdAt: '2026-10-02T00:00:00.000Z', readAt: '2026-10-03T00:00:00.000Z', read: true, message: OWNER_COPY.noticeSourceChangedBeforeConfirm },
    ]);
    for (const notice of state.notices) expect(notice).not.toHaveProperty('eventKey');
    // Reading the state never touches snapshot rows or KB content.
    expect(f.fromCalls).not.toContain('world_branch_docs');
    expect(f.fromCalls).not.toContain('kb_nodes');
  });

  it('returns a draft DTO whose source is the parent branch work', async () => {
    const f = fake();
    const result = await getWorldTreeOwnerState(f.client, { ownerId: ids.owner, workId: ids.draftWork });
    if (!result.ok) throw new Error('expected ok');
    expect(result.state.draft).toEqual({
      branchId: ids.draftBranch, draftWorkId: ids.draftWork, sourceWorkId: ids.rootWork, rootWorkId: ids.rootWork,
      kind: 'if', status: 'draft', forkEraId: ids.eraAncient, requestId: ids.requestId, createdAt: T0,
    });
  });

  it('gives a work without a world tree a null branch and no delete action', async () => {
    const tables = defaultTables();
    tables.world_branches = [];
    const f = fake({ tables });
    const result = await getWorldTreeOwnerState(f.client, { ownerId: ids.owner, workId: ids.rootWork });
    if (!result.ok) throw new Error('expected ok');
    expect(result.state.branch).toBeNull();
    expect(result.state.timeline).toBeNull();
    expect(result.state.notices).toEqual([]);
    expect(result.state.deletion).toEqual({ canDelete: false, reason: 'not_in_tree', message: null });
  });

  it('keeps parent_not_visible and isPublished/readerVisible from the server summary', async () => {
    const f = fake({
      rpc: (fn, args) => fn === 'get_world_branch_eligibility'
        ? { data: blindParentSummary, error: null }
        : { data: { ...ownerTree, focusWorkId: args.p_work_id }, error: null },
    });
    const result = await getWorldTreeOwnerState(f.client, { ownerId: ids.owner, workId: ids.rootWork });
    if (!result.ok) throw new Error('expected ok');
    expect(result.state.eligibility).toEqual({ status: 'ok', summary: blindParentSummary });
    if (result.state.eligibility.status !== 'ok') throw new Error('expected summary');
    expect(result.state.eligibility.summary.isPublished).toBe(true);
    expect(result.state.eligibility.summary.readerVisible).toBe(false);
    expect(result.state.eligibility.summary.unmetReasons).toEqual(['parent_not_visible']);
  });

  it('treats an eligibility lookup failure or malformed summary as unavailable, never eligible', async () => {
    for (const answer of [
      { data: null, error: { message: 'boom' } },
      { data: { ...eligibleSummary, eligible: 'yes' }, error: null },
      { data: { ...eligibleSummary, unmetReasons: ['published_chapters_insufficient'] }, error: null },
    ] as RpcResult[]) {
      const f = fake({
        rpc: (fn, args) => fn === 'get_world_branch_eligibility' ? answer : { data: { ...ownerTree, focusWorkId: args.p_work_id }, error: null },
      });
      const result = await getWorldTreeOwnerState(f.client, { ownerId: ids.owner, workId: ids.rootWork });
      if (!result.ok) throw new Error('expected ok');
      expect(result.state.eligibility).toMatchObject({ status: 'unavailable', retryable: true });
      expect(result.state.eligibility).not.toHaveProperty('summary');
    }
  });

  it('never passes a reader projection off as the owner tree', async () => {
    const f = fake({
      rpc: (fn) => fn === 'get_world_branch_eligibility' ? { data: eligibleSummary, error: null } : { data: readerNormalTree, error: null },
    });
    const result = await getWorldTreeOwnerState(f.client, { ownerId: ids.owner, workId: ids.rootWork });
    if (!result.ok) throw new Error('expected ok');
    expect(result.state.tree).toMatchObject({ status: 'error' });
    expect(result.state.tree).not.toHaveProperty('projection');
  });

  it('closes as unavailable when a world table read fails', async () => {
    for (const table of WORLD_TABLES) {
      const f = fake({ failTables: [table] });
      const result = await getWorldTreeOwnerState(f.client, { ownerId: ids.owner, workId: ids.ifWork });
      expect(result).toMatchObject({ ok: false, code: 'unavailable', retryable: true });
    }
  });

  it('reads world tables with explicit owner-only column lists', async () => {
    const f = fake();
    await getWorldTreeOwnerState(f.client, { ownerId: ids.owner, workId: ids.ifWork });
    const worldSelects = f.selects.filter((s) => WORLD_TABLES.includes(s.table));
    expect(worldSelects.length).toBeGreaterThanOrEqual(4);
    for (const s of worldSelects) {
      expect(s.columns).not.toContain('*');
      expect(s.columns).not.toMatch(/content/);
    }
  });
});

// ---------------------------------------------------------------------------
// getOwnedBranch / getOwnedTimeline
// ---------------------------------------------------------------------------

describe('getOwnedBranch', () => {
  it("does not resolve someone else's branch id", async () => {
    const tables = defaultTables();
    tables.world_branches = [...tables.world_branches, branchRow({ ...allBranches[1], id: NOTICE_A, workId: OTHER, ownerId: OTHER })];
    const f = fake({ tables });
    expect(await getOwnedBranch(f.client, { ownerId: ids.owner, branchId: NOTICE_A })).toEqual({ ok: true, branch: null });
    const mine = await getOwnedBranch(f.client, { ownerId: ids.owner, branchId: ids.ifBranch });
    expect(mine).toMatchObject({ ok: true, branch: { id: ids.ifBranch, workId: ids.ifWork, rootWorkId: ids.rootWork } });
  });

  it('looks up by work id and by request id', async () => {
    const f = fake();
    expect(await getOwnedBranch(f.client, { ownerId: ids.owner, workId: ids.draftWork })).toMatchObject({ ok: true, branch: { id: ids.draftBranch } });
    expect(await getOwnedBranch(f.client, { ownerId: ids.owner, requestId: ids.requestId })).toMatchObject({ ok: true, branch: { id: ids.draftBranch } });
  });

  it('fails closed on a read error and on malformed ids', async () => {
    const f = fake({ failTables: ['world_branches'] });
    expect(await getOwnedBranch(f.client, { ownerId: ids.owner, branchId: ids.ifBranch })).toMatchObject({ ok: false, code: 'unavailable' });
    expect(await getOwnedBranch(fake().client, { ownerId: ids.owner, branchId: 'x' })).toMatchObject({ ok: false, code: 'invalid_input' });
  });
});

describe('getOwnedTimeline', () => {
  it("returns the work's own branch with a server-derived baseline", async () => {
    const f = fake();
    const result = await getOwnedTimeline(f.client, { ownerId: ids.owner, workId: ids.ifWork });
    if (!result.ok || !result.timeline) throw new Error('expected timeline');
    expect(result.timeline.branch.id).toBe(ids.ifBranch);
    expect(result.timeline.baseline.eras.map((e) => e.id)).toEqual([ids.ifEraAncient, ids.ifEraMedieval, ids.ifEraOwn]);
    expect(result.timeline.baseline.placements.map((p) => p.id)).toEqual([ids.placementIf]);
    expect(result.timeline.baseline.forkEraIds).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// markBranchNoticeRead
// ---------------------------------------------------------------------------

describe('markBranchNoticeRead', () => {
  const ok = (data: unknown): RpcResult => ({ data, error: null });

  it('rejects malformed ids before any RPC', async () => {
    const f = fake();
    expect(await markBranchNoticeRead(f.client, { ownerId: ids.owner, noticeId: 'nope' })).toMatchObject({ ok: false, code: 'invalid_input' });
    expect(f.rpcCalls).toHaveLength(0);
  });

  it('blocks a suspended writer before the read RPC', async () => {
    const f = fake({ writeAccess: { can_write: false, reason: 'suspended', sanctioned_until: null } });
    const result = await markBranchNoticeRead(f.client, { ownerId: ids.owner, noticeId: NOTICE_A });
    expect(result).toMatchObject({ ok: false, code: 'write_suspended', error: WRITE_SUSPENDED_MESSAGE });
    expect(f.domainRpc()).toHaveLength(0);
  });

  it("maps someone else's notice to forbidden", async () => {
    const f = fake({ rpc: () => ({ data: null, error: { message: 'world_tree_forbidden', code: 'P0001' } }) });
    const result = await markBranchNoticeRead(f.client, { ownerId: ids.owner, noticeId: NOTICE_A });
    expect(result).toMatchObject({ ok: false, code: 'forbidden', retryable: false });
  });

  it('sends only p_notice_id and reports read state only after a matching RPC answer', async () => {
    const f = fake({ rpc: () => ok({ notice_id: NOTICE_A, read_at: '2026-10-06T00:00:00+00:00' }) });
    const result = await markBranchNoticeRead(f.client, { ownerId: ids.owner, noticeId: NOTICE_A });
    expect(result).toEqual({ ok: true, noticeId: NOTICE_A, readAt: '2026-10-06T00:00:00+00:00' });
    expect(f.domainRpc()).toEqual([{ fn: 'mark_branch_notice_read', args: { p_notice_id: NOTICE_A } }]);
    // No table writes and no snapshot access.
    expect(f.fromCalls).toHaveLength(0);
  });

  it('does not confirm read state for a mismatched, malformed or failed answer', async () => {
    for (const answer of [
      ok({ notice_id: NOTICE_B, read_at: '2026-10-06T00:00:00+00:00' }),
      ok({ notice_id: NOTICE_A, read_at: null }),
      ok({ notice_id: NOTICE_A, read_at: 'x', extra: 1 }),
      { data: null, error: { message: 'network', code: 'network' } },
      { data: null, error: { message: 'deadlock', code: '40P01' } },
    ] as RpcResult[]) {
      const f = fake({ rpc: () => answer });
      const result = await markBranchNoticeRead(f.client, { ownerId: ids.owner, noticeId: NOTICE_A });
      expect(result).toMatchObject({ ok: false, code: 'unavailable', retryable: true });
    }
  });

  it('maps the DB write_access_denied to write_suspended', async () => {
    const f = fake({ rpc: () => ({ data: null, error: { message: 'write_access_denied', code: 'P0001' } }) });
    expect(await markBranchNoticeRead(f.client, { ownerId: ids.owner, noticeId: NOTICE_A })).toMatchObject({ ok: false, code: 'write_suspended' });
  });
});
