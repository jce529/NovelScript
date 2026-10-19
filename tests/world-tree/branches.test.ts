import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BRANCH_COPY,
  beginBranch,
  confirmBranch,
  deleteBranch,
  getBranchDiff,
  getBranchEligibility,
} from '@/lib/world-tree/branches';
import { WRITE_SUSPENDED_MESSAGE } from '@/lib/auth/write-access';
import { blindParentSummary, diffAdded, diffDeleted, diffModified, eligibleSummary, ids, insufficientSummary } from './fixtures';

type RpcResult = { data: unknown; error: { message: string; code?: string; details?: string | null } | null };

interface FakeOptions {
  /** Row returned by getWork (owner-scoped works lookup). null = not owned / missing. */
  work?: { id: string; owner_id: string } | null;
  writeAccess?: { can_write: boolean; reason: string; sanctioned_until?: string | null };
  rpc?: (fn: string, args: Record<string, unknown>) => RpcResult | Promise<RpcResult>;
}

function fake(options: FakeOptions = {}) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args });
    if (fn === 'get_write_access') {
      return { data: options.writeAccess ?? { can_write: true, reason: 'ok', sanctioned_until: null }, error: null };
    }
    if (!options.rpc) return { data: null, error: { message: 'unexpected rpc ' + fn } };
    return options.rpc(fn, args);
  });
  const work = options.work === undefined ? { id: ids.rootWork, owner_id: ids.owner } : options.work;
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'is']) chain[method] = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => ({ data: work, error: null }));
  const from = vi.fn(() => chain);
  const client = { rpc, from } as unknown as SupabaseClient;
  const branchCalls = () => calls.filter((c) => c.fn !== 'get_write_access');
  return { client, calls, branchCalls };
}

const ok = (data: unknown): RpcResult => ({ data, error: null });
const raised = (message: string, details: string | null = null, code = 'P0001'): RpcResult => ({ data: null, error: { message, code, details } });

const beginInput = {
  ownerId: ids.owner,
  sourceWorkId: ids.rootWork,
  kind: 'if' as const,
  forkEraId: null,
  requestId: ids.requestId,
};
const confirmInput = { ownerId: ids.owner, draftWorkId: ids.draftWork, title: '만약 왕이 살았다면', eraId: ids.eraMedieval };

describe('beginBranch', () => {
  it('rejects an invalid kind, a non-uuid id and a missing request id before any RPC', async () => {
    for (const input of [
      { ...beginInput, kind: 'trunk' },
      { ...beginInput, kind: 'other' },
      { ...beginInput, sourceWorkId: 'not-a-uuid' },
      { ...beginInput, requestId: undefined },
    ]) {
      const f = fake();
      const result = await beginBranch(f.client, input as never);
      expect(result).toMatchObject({ ok: false, code: 'invalid_input', retryable: false });
      expect(f.calls).toHaveLength(0);
    }
  });

  it("rejects someone else's source before the begin RPC", async () => {
    const f = fake({ work: null });
    const result = await beginBranch(f.client, beginInput);
    expect(result).toMatchObject({ ok: false, code: 'forbidden', error: BRANCH_COPY.forbidden, retryable: false });
    expect(f.branchCalls()).toHaveLength(0);
  });

  it('rejects a suspended writer before the begin RPC', async () => {
    const f = fake({ writeAccess: { can_write: false, reason: 'suspended', sanctioned_until: '2026-11-01T00:00:00Z' } });
    const result = await beginBranch(f.client, beginInput);
    expect(result).toMatchObject({ ok: false, code: 'write_suspended', error: WRITE_SUSPENDED_MESSAGE });
    expect(f.branchCalls()).toHaveLength(0);
  });

  it('sends exactly the begin contract (no forged eligible/counts/thresholds) and returns the editor link', async () => {
    const f = fake({ rpc: (fn) => (fn === 'begin_world_branch' ? ok({ draft_work_id: ids.draftWork }) : raised('x')) });
    const forged = { ...beginInput, eligible: true, counts: { added: 9 }, thresholds: { minPublishedChapters: 0 }, isPublic: true };
    const result = await beginBranch(f.client, forged as never);
    expect(result).toEqual({ ok: true, draftWorkId: ids.draftWork, editHref: `/studio/${ids.draftWork}` });
    const begin = f.branchCalls().find((c) => c.fn === 'begin_world_branch')!;
    expect(begin.args).toEqual({
      p_source_work_id: ids.rootWork, p_kind: 'if', p_fork_era_id: null, p_request_id: ids.requestId,
    });
  });

  it('keeps the same request id across retries (the caller owns it)', async () => {
    const f = fake({ rpc: () => ok({ draft_work_id: ids.draftWork }) });
    await beginBranch(f.client, beginInput);
    await beginBranch(f.client, beginInput);
    const requests = f.branchCalls().filter((c) => c.fn === 'begin_world_branch').map((c) => c.args.p_request_id);
    expect(requests).toEqual([ids.requestId, ids.requestId]);
  });

  it('maps branch_ineligible parent_not_visible with its reason and the latest server status', async () => {
    const f = fake({
      rpc: (fn) => fn === 'begin_world_branch'
        ? raised('branch_ineligible', JSON.stringify({ unmetReasons: ['parent_not_visible'] }))
        : ok(blindParentSummary),
    });
    const result = await beginBranch(f.client, beginInput);
    expect(result).toEqual({
      ok: false, code: 'branch_ineligible', error: BRANCH_COPY.parentNotVisible, retryable: false,
      unmetReasons: ['parent_not_visible'], eligibility: blindParentSummary,
    });
    expect(f.branchCalls().find((c) => c.fn === 'get_world_branch_eligibility')!.args).toEqual({ p_source_work_id: ids.rootWork });
  });

  it('uses the general shortfall copy for count reasons and drops unknown reason codes', async () => {
    const f = fake({
      rpc: (fn) => fn === 'begin_world_branch'
        ? raised('branch_ineligible', JSON.stringify({ unmetReasons: ['published_chapters_insufficient', 'made_up'] }))
        : ok(insufficientSummary),
    });
    const result = await beginBranch(f.client, beginInput);
    expect(result).toMatchObject({
      ok: false, code: 'branch_ineligible', error: '아직 가지 치기 조건을 채우지 못했어요.',
      unmetReasons: ['published_chapters_insufficient'], eligibility: insufficientSummary,
    });
  });

  it('keeps branch_ineligible even when the follow-up status lookup fails (eligibility null, never eligible)', async () => {
    const f = fake({
      rpc: (fn) => fn === 'begin_world_branch' ? raised('branch_ineligible', 'not json') : raised('boom', null, '08006'),
    });
    const result = await beginBranch(f.client, beginInput);
    expect(result).toMatchObject({ ok: false, code: 'branch_ineligible', unmetReasons: [], eligibility: null });
  });

  it('separates retryable failures from rule rejections', async () => {
    const serialization = await beginBranch(fake({ rpc: () => raised('could not serialize access', null, '40001') }).client, beginInput);
    expect(serialization).toMatchObject({ ok: false, code: 'unavailable', retryable: true });
    const thrown = await beginBranch(fake({ rpc: () => { throw new Error('network'); } }).client, beginInput);
    expect(thrown).toMatchObject({ ok: false, code: 'unavailable', retryable: true });
    const conflict = await beginBranch(fake({ rpc: () => raised('world_branch_request_conflict') }).client, beginInput);
    expect(conflict).toMatchObject({ ok: false, code: 'request_conflict', retryable: false });
    const malformed = await beginBranch(fake({ rpc: () => ok({ draft_work_id: 'nope' }) }).client, beginInput);
    expect(malformed).toMatchObject({ ok: false, code: 'unavailable', retryable: true });
  });
});

describe('getBranchEligibility', () => {
  it('sends only the source id and returns a validated summary', async () => {
    const f = fake({ rpc: () => ok(eligibleSummary) });
    expect(await getBranchEligibility(f.client, { ownerId: ids.owner, sourceWorkId: ids.rootWork }))
      .toEqual({ ok: true, eligibility: eligibleSummary });
    expect(f.branchCalls()).toEqual([{ fn: 'get_world_branch_eligibility', args: { p_source_work_id: ids.rootWork } }]);
  });

  it('never treats an RPC failure or a malformed / self-contradicting payload as eligible', async () => {
    for (const rpc of [
      () => raised('boom', null, '08006'),
      () => ok({ eligible: true }),
      () => ok({ ...eligibleSummary, unmetReasons: ['parent_not_visible'] }),
      () => ok({ ...blindParentSummary, eligible: true }),
      () => ok(null),
    ]) {
      const result = await getBranchEligibility(fake({ rpc }).client, { ownerId: ids.owner, sourceWorkId: ids.rootWork });
      expect(result).toMatchObject({ ok: false, code: 'eligibility_unavailable', error: BRANCH_COPY.eligibilityUnavailable, retryable: true });
      expect(result).not.toHaveProperty('eligibility');
    }
  });

  it('maps auth/ownership errors to forbidden, not to an ineligible summary', async () => {
    const result = await getBranchEligibility(fake({ rpc: () => raised('world_tree_forbidden') }).client, { ownerId: ids.owner, sourceWorkId: ids.rootWork });
    expect(result).toMatchObject({ ok: false, code: 'forbidden', retryable: false });
  });
});

describe('confirmBranch', () => {
  it('rejects an empty title before any RPC', async () => {
    const f = fake();
    expect(await confirmBranch(f.client, { ...confirmInput, title: '   ' })).toMatchObject({ ok: false, code: 'invalid_input', error: BRANCH_COPY.titleRequired });
    expect(f.calls).toHaveLength(0);
  });

  it('sends exactly {p_draft_work_id, p_title, p_era_id}: no client counts, eligibility or visibility', async () => {
    const f = fake({ rpc: () => ok({ work_id: ids.draftWork, branch_id: ids.draftBranch }) });
    const forged = { ...confirmInput, title: '  만약 왕이 살았다면 ', counts: { added: 1, modified: 0, deleted: 0 }, eligible: true, isPublic: true };
    const result = await confirmBranch(f.client, forged as never);
    expect(result).toEqual({
      ok: true, status: 'confirmed', workId: ids.draftWork, branchId: ids.draftBranch, snapshotFixed: true, irreversible: true,
    });
    expect(f.branchCalls()).toEqual([{
      fn: 'confirm_world_branch',
      args: { p_draft_work_id: ids.draftWork, p_title: '만약 왕이 살았다면', p_era_id: ids.eraMedieval },
    }]);
  });

  it('a retry keeps the same workId/branchId', async () => {
    const f = fake({ rpc: () => ok({ work_id: ids.draftWork, branch_id: ids.draftBranch }) });
    const first = await confirmBranch(f.client, confirmInput);
    const second = await confirmBranch(f.client, confirmInput);
    expect(second).toEqual(first);
  });

  it('returns the exact zero-change / zero-addition / inherited-mutation copy', async () => {
    const cases: Array<[string, string, string]> = [
      ['world_branch_zero_changes', 'zero_changes', '설정을 하나 이상 바꿔야 가지를 확정할 수 있어요.'],
      ['world_branch_zero_additions', 'zero_additions', '새 설정을 하나 이상 추가해야 가지를 확정할 수 있어요.'],
      ['world_branch_inherited_mutation', 'inherited_mutation', BRANCH_COPY.inheritedMutation],
      ['world_branch_inherited_immutable', 'inherited_mutation', BRANCH_COPY.inheritedMutation],
    ];
    for (const [message, code, copy] of cases) {
      const result = await confirmBranch(fake({ rpc: () => raised(message) }).client, confirmInput);
      expect(result).toEqual({ ok: false, code, error: copy, retryable: false });
    }
  });

  it('maps branch_ineligible on confirm and refreshes status for the given source only', async () => {
    const f = fake({
      rpc: (fn) => fn === 'confirm_world_branch'
        ? raised('branch_ineligible', JSON.stringify({ unmetReasons: ['parent_not_visible'] }))
        : ok(blindParentSummary),
    });
    const result = await confirmBranch(f.client, { ...confirmInput, sourceWorkId: ids.rootWork });
    expect(result).toMatchObject({ ok: false, code: 'branch_ineligible', unmetReasons: ['parent_not_visible'], eligibility: blindParentSummary });
    expect(f.branchCalls()[0].args).toEqual({ p_draft_work_id: ids.draftWork, p_title: confirmInput.title, p_era_id: ids.eraMedieval });
  });

  it('maps era/timeline/suspension errors', async () => {
    expect(await confirmBranch(fake({ rpc: () => raised('world_branch_era_mismatch') }).client, confirmInput))
      .toMatchObject({ code: 'era_invalid', retryable: false });
    expect(await confirmBranch(fake({ rpc: () => raised('world_tree_timeline_not_ready') }).client, confirmInput))
      .toMatchObject({ code: 'unavailable', retryable: true });
    expect(await confirmBranch(fake({ rpc: () => raised('write_access_denied') }).client, confirmInput))
      .toMatchObject({ code: 'write_suspended', error: WRITE_SUSPENDED_MESSAGE, retryable: false });
  });
});

describe('getBranchDiff', () => {
  it('validates the server diff and links non-deleted entries to the existing KB editor', async () => {
    const payload = {
      counts: { added: 1, modified: 1, deleted: 1 },
      entries: [...diffAdded.entries, ...diffModified.entries, ...diffDeleted.entries],
    };
    const f = fake({ rpc: () => ok(payload) });
    const result = await getBranchDiff(f.client, { ownerId: ids.owner, draftWorkId: ids.draftWork });
    expect(result).toEqual({
      ok: true,
      diff: payload,
      editLinks: [
        `/studio/${ids.draftWork}/kb/${ids.draftNode}`,
        `/studio/${ids.draftWork}/kb/${ids.draftNode}`,
        null,
      ],
    });
    expect(f.branchCalls()).toEqual([{ fn: 'get_world_branch_diff', args: { p_draft_work_id: ids.draftWork } }]);
  });

  it('closes on content leaks, count mismatches and malformed entries', async () => {
    for (const payload of [
      { counts: { added: 1, modified: 0, deleted: 0 }, entries: [{ ...diffAdded.entries[0], content: 'secret' }] },
      { counts: { added: 2, modified: 0, deleted: 0 }, entries: diffAdded.entries },
      { counts: { added: 0, modified: 0, deleted: 0 }, entries: [{ ...diffAdded.entries[0], category: 'template' }] },
      null,
    ]) {
      expect(await getBranchDiff(fake({ rpc: () => ok(payload) }).client, { ownerId: ids.owner, draftWorkId: ids.draftWork }))
        .toMatchObject({ ok: false, code: 'unavailable' });
    }
  });
});

describe('deleteBranch', () => {
  it('maps world_branch_has_children to the tooltip copy and rejects bad ids before RPC', async () => {
    expect(await deleteBranch(fake({ rpc: () => raised('world_branch_has_children') }).client, { ownerId: ids.owner, branchId: ids.ifBranch }))
      .toEqual({ ok: false, code: 'has_children', error: '하위 가지를 먼저 정리해 주세요.', retryable: false });
    const f = fake();
    expect(await deleteBranch(f.client, { ownerId: ids.owner, branchId: 'x' })).toMatchObject({ code: 'invalid_input' });
    expect(f.calls).toHaveLength(0);
  });

  it('deletes through the RPC with only the branch id', async () => {
    const f = fake({ rpc: () => ok({ branch_id: ids.ifBranch, work_id: ids.ifWork }) });
    expect(await deleteBranch(f.client, { ownerId: ids.owner, branchId: ids.ifBranch }))
      .toEqual({ ok: true, branchId: ids.ifBranch, workId: ids.ifWork });
    expect(f.branchCalls()).toEqual([{ fn: 'soft_delete_world_branch', args: { p_branch_id: ids.ifBranch } }]);
  });
});
