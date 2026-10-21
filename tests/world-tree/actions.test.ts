import { beforeEach, describe, expect, it, vi } from 'vitest';
import { blindParentSummary, eligibleSummary, ids, insufficientSummary, ownerTree, readerNormalTree } from './fixtures';

const SESSION = ids.owner;
const OTHER = '00000000-0000-4000-8000-000000000999';
const NOTICE = '00000000-0000-4000-8000-000000000070';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  revalidatePath: vi.fn(),
  checkWriteAccess: vi.fn(),
  getWork: vi.fn(),
  getBranchEligibility: vi.fn(),
  beginBranch: vi.fn(),
  getBranchDiff: vi.fn(),
  confirmBranch: vi.fn(),
  deleteBranch: vi.fn(),
  saveTimeline: vi.fn(),
  ensureWorldTree: vi.fn(),
  getWorldTree: vi.fn(),
  getOwnedBranch: vi.fn(),
  getOwnedTimeline: vi.fn(),
  markBranchNoticeRead: vi.fn(),
  client: { tag: 'session-client' },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ ...mocks.client, auth: { getUser: mocks.getUser } }),
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/lib/auth/write-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/write-access')>()),
  checkWriteAccess: mocks.checkWriteAccess,
}));
vi.mock('@/lib/works/actions', () => ({ getWork: mocks.getWork }));
vi.mock('@/lib/world-tree/branches', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/world-tree/branches')>()),
  getBranchEligibility: mocks.getBranchEligibility,
  beginBranch: mocks.beginBranch,
  getBranchDiff: mocks.getBranchDiff,
  confirmBranch: mocks.confirmBranch,
  deleteBranch: mocks.deleteBranch,
}));
vi.mock('@/lib/world-tree/timeline', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/world-tree/timeline')>()),
  saveTimeline: mocks.saveTimeline,
  ensureWorldTree: mocks.ensureWorldTree,
}));
vi.mock('@/lib/world-tree/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/world-tree/queries')>()),
  getWorldTree: mocks.getWorldTree,
}));
vi.mock('@/lib/world-tree/owner', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/world-tree/owner')>()),
  getOwnedBranch: mocks.getOwnedBranch,
  getOwnedTimeline: mocks.getOwnedTimeline,
  markBranchNoticeRead: mocks.markBranchNoticeRead,
}));

import {
  beginBranchAction,
  confirmBranchAction,
  deleteBranchAction,
  ensureWorldTreeAction,
  getBranchDiffAction,
  getBranchEligibilityAction,
  getReaderPreviewAction,
  markBranchNoticeReadAction,
  saveWorldTimelineAction,
} from '@/app/studio/[workId]/world/actions';
import { BRANCH_COPY } from '@/lib/world-tree/branches';

const T0 = '2026-10-01T00:00:00.000Z';
const branch = (over: Record<string, unknown> = {}) => ({
  id: ids.draftBranch, rootWorkId: ids.rootWork, workId: ids.draftWork, ownerId: SESSION, parentBranchId: ids.rootBranch,
  kind: 'if', status: 'draft', forkEraId: ids.eraAncient, confirmedAt: null, deletedAt: null, requestId: ids.requestId, createdAt: T0, ...over,
});
const rootBranchRow = branch({ id: ids.rootBranch, workId: ids.rootWork, parentBranchId: null, kind: 'trunk', status: 'confirmed', forkEraId: null, requestId: null });
const ifBranchRow = branch({ id: ids.ifBranch, workId: ids.ifWork, status: 'confirmed', forkEraId: ids.eraMedieval, requestId: null });

const beginInput = { kind: 'if' as const, forkEraId: null, requestId: ids.requestId };
const confirmInput = { title: '만약 왕이 살았다면', eraId: ids.eraMedieval };
const ineligibleFromDb = {
  ok: false, code: 'branch_ineligible', error: BRANCH_COPY.parentNotVisible, retryable: false,
  unmetReasons: ['parent_not_visible'], eligibility: blindParentSummary,
};

function setBranches(rows: Array<ReturnType<typeof branch>>) {
  mocks.getOwnedBranch.mockImplementation(async (_c: unknown, input: Record<string, string>) => {
    const found = rows.find((b) =>
      (input.branchId && b.id === input.branchId)
      || (input.workId && b.workId === input.workId)
      || (input.requestId && b.requestId === input.requestId));
    return { ok: true, branch: found && input.ownerId === SESSION ? found : null };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.revalidatePath.mockReset();
  mocks.getUser.mockResolvedValue({ data: { user: { id: SESSION } }, error: null });
  mocks.checkWriteAccess.mockResolvedValue({ ok: true });
  mocks.getWork.mockImplementation(async (_c: unknown, { ownerId, workId }: { ownerId: string; workId: string }) =>
    ownerId === SESSION && workId !== OTHER ? { id: workId, title: '작품', owner_id: ownerId } : null);
  mocks.getBranchEligibility.mockResolvedValue({ ok: true, eligibility: eligibleSummary });
  setBranches([rootBranchRow, ifBranchRow]);
  mocks.beginBranch.mockResolvedValue({ ok: true, draftWorkId: ids.draftWork, editHref: `/studio/${ids.draftWork}` });
  mocks.confirmBranch.mockResolvedValue({ ok: true, status: 'confirmed', workId: ids.draftWork, branchId: ids.draftBranch, snapshotFixed: true, irreversible: true });
  mocks.deleteBranch.mockResolvedValue({ ok: true, branchId: ids.ifBranch, workId: ids.ifWork });
  mocks.getBranchDiff.mockResolvedValue({ ok: true, diff: { counts: { added: 1, modified: 0, deleted: 0 }, entries: [] }, editLinks: [] });
  mocks.markBranchNoticeRead.mockResolvedValue({ ok: true, noticeId: NOTICE, readAt: T0 });
  mocks.getWorldTree.mockResolvedValue({ ok: true, status: 'ok', mode: 'reader', projection: readerNormalTree });
  mocks.ensureWorldTree.mockResolvedValue({ ok: true, branchId: ids.rootBranch, rootWorkId: ids.rootWork, created: true });
  mocks.saveTimeline.mockResolvedValue({ ok: true, message: 'saved', branchId: ids.ifBranch, eras: [], placementCount: 0 });
  mocks.getOwnedTimeline.mockResolvedValue({
    ok: true,
    timeline: { branch: ifBranchRow, baseline: { eras: [], placements: [], forkEraIds: [] } },
  });
});

const DOMAIN_MUTATIONS = [
  mocks.beginBranch, mocks.confirmBranch, mocks.deleteBranch, mocks.saveTimeline, mocks.ensureWorldTree, mocks.markBranchNoticeRead,
];

const mutationCalls: Array<[string, () => Promise<unknown>]> = [
  ['begin', () => beginBranchAction(ids.rootWork, beginInput)],
  ['confirm', () => confirmBranchAction(ids.draftWork, confirmInput)],
  ['delete', () => deleteBranchAction(ids.ifWork, ids.ifBranch)],
  ['timeline', () => saveWorldTimelineAction(ids.ifWork, { eras: [], placements: [] })],
  ['ensure', () => ensureWorldTreeAction(ids.rootWork)],
  ['notice', () => markBranchNoticeReadAction(ids.ifWork, NOTICE)],
];

describe('session boundary', () => {
  it.each(mutationCalls)('%s: an unauthenticated session never reaches a domain mutation', async (_name, call) => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const result = await call();
    expect(result).toMatchObject({ ok: false, code: 'unauthenticated' });
    for (const fn of DOMAIN_MUTATIONS) expect(fn).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each(mutationCalls)('%s: a suspended writer never reaches a domain mutation', async (_name, call) => {
    mocks.checkWriteAccess.mockResolvedValue({ ok: false, code: 'write_suspended', error: 'suspended', permanent: false, sanctionedUntil: null });
    const result = await call();
    expect(result).toMatchObject({ ok: false, code: 'write_suspended' });
    for (const fn of DOMAIN_MUTATIONS) expect(fn).not.toHaveBeenCalled();
    expect(mocks.checkWriteAccess).toHaveBeenCalledWith(expect.anything(), SESSION);
  });

  it.each(mutationCalls)('%s: a session error fails closed', async (_name, call) => {
    mocks.getUser.mockRejectedValue(new Error('cookie'));
    const result = await call();
    expect(result).toMatchObject({ ok: false });
    for (const fn of DOMAIN_MUTATIONS) expect(fn).not.toHaveBeenCalled();
  });

  it("rejects someone else's work before any domain call", async () => {
    for (const call of [
      () => beginBranchAction(OTHER, beginInput),
      () => confirmBranchAction(OTHER, confirmInput),
      () => deleteBranchAction(OTHER, ids.ifBranch),
      () => saveWorldTimelineAction(OTHER, { eras: [], placements: [] }),
      () => markBranchNoticeReadAction(OTHER, NOTICE),
      () => getReaderPreviewAction(OTHER),
      () => getBranchEligibilityAction(OTHER),
      () => getBranchDiffAction(OTHER),
    ]) {
      expect(await call()).toMatchObject({ ok: false, code: 'forbidden' });
    }
    for (const fn of [...DOMAIN_MUTATIONS, mocks.getWorldTree, mocks.getBranchEligibility, mocks.getBranchDiff]) expect(fn).not.toHaveBeenCalled();
  });

  it('rejects malformed ids before the session lookup', async () => {
    expect(await beginBranchAction('nope', beginInput)).toMatchObject({ ok: false, code: 'invalid_input' });
    expect(await deleteBranchAction(ids.ifWork, 'nope')).toMatchObject({ ok: false, code: 'invalid_input' });
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
});

describe('beginBranchAction', () => {
  it('ignores client owner ids, counts, eligibility and visibility values', async () => {
    const forged = { ...beginInput, ownerId: OTHER, eligible: true, counts: { chapters: 999 }, thresholds: {}, isPublic: true, readerVisible: true };
    const result = await beginBranchAction(ids.rootWork, forged as never);
    expect(result).toMatchObject({ ok: true, draftWorkId: ids.draftWork, refreshed: true });
    expect(mocks.getBranchEligibility).toHaveBeenCalledWith(expect.anything(), { ownerId: SESSION, sourceWorkId: ids.rootWork });
    expect(mocks.beginBranch).toHaveBeenCalledWith(expect.anything(), {
      ownerId: SESSION, sourceWorkId: ids.rootWork, kind: 'if', forkEraId: null, requestId: ids.requestId,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/studio/${ids.rootWork}/world`);
  });

  it('rejects a blind parent from the pre-check and keeps parent_not_visible and the summary', async () => {
    mocks.getBranchEligibility.mockResolvedValue({ ok: true, eligibility: blindParentSummary });
    const result = await beginBranchAction(ids.rootWork, beginInput);
    expect(result).toEqual({
      ok: false, code: 'branch_ineligible', error: BRANCH_COPY.parentNotVisible, retryable: false,
      unmetReasons: ['parent_not_visible'], eligibility: blindParentSummary,
    });
    expect(mocks.beginBranch).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('rejects an unmet summary from the pre-check with the server reasons', async () => {
    mocks.getBranchEligibility.mockResolvedValue({ ok: true, eligibility: insufficientSummary });
    const result = await beginBranchAction(ids.rootWork, beginInput);
    expect(result).toMatchObject({
      ok: false, code: 'branch_ineligible', error: BRANCH_COPY.ineligible,
      unmetReasons: insufficientSummary.unmetReasons, eligibility: insufficientSummary,
    });
    expect(mocks.beginBranch).not.toHaveBeenCalled();
  });

  it('does not start when the eligibility lookup fails', async () => {
    mocks.getBranchEligibility.mockResolvedValue({ ok: false, code: 'eligibility_unavailable', error: BRANCH_COPY.eligibilityUnavailable, retryable: true });
    const result = await beginBranchAction(ids.rootWork, beginInput);
    expect(result).toMatchObject({ ok: false, code: 'eligibility_unavailable', retryable: true });
    expect(mocks.beginBranch).not.toHaveBeenCalled();
  });

  it('passes a DB rejection after a passing pre-check through unchanged (blind after check)', async () => {
    mocks.beginBranch.mockResolvedValue(ineligibleFromDb);
    const result = await beginBranchAction(ids.rootWork, beginInput);
    expect(result).toEqual(ineligibleFromDb);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('passes other DB rejections after the check through unchanged', async () => {
    const denied = { ok: false, code: 'request_conflict', error: BRANCH_COPY.requestConflict, retryable: false };
    mocks.beginBranch.mockResolvedValue(denied);
    expect(await beginBranchAction(ids.rootWork, beginInput)).toEqual(denied);
  });

  it('recovers an existing draft for a retried request id without a new pre-check', async () => {
    setBranches([rootBranchRow, branch()]);
    mocks.getBranchEligibility.mockResolvedValue({ ok: true, eligibility: insufficientSummary });
    const result = await beginBranchAction(ids.rootWork, beginInput);
    expect(result).toMatchObject({ ok: true, draftWorkId: ids.draftWork });
    expect(mocks.getBranchEligibility).not.toHaveBeenCalled();
    expect(mocks.beginBranch).toHaveBeenCalledTimes(1);
  });
});

describe('confirmBranchAction', () => {
  beforeEach(() => setBranches([rootBranchRow, ifBranchRow, branch()]));

  it("pre-checks the parent (source) work, not the draft, then confirms with session-only arguments", async () => {
    const forged = { ...confirmInput, ownerId: OTHER, sourceWorkId: OTHER, eligible: true, diff: { added: 9 } };
    const result = await confirmBranchAction(ids.draftWork, forged as never);
    expect(result).toMatchObject({ ok: true, status: 'confirmed', workId: ids.draftWork, refreshed: true });
    expect(mocks.getBranchEligibility).toHaveBeenCalledWith(expect.anything(), { ownerId: SESSION, sourceWorkId: ids.rootWork });
    expect(mocks.confirmBranch).toHaveBeenCalledWith(expect.anything(), {
      ownerId: SESSION, draftWorkId: ids.draftWork, title: confirmInput.title, eraId: confirmInput.eraId, sourceWorkId: ids.rootWork,
    });
    const paths = mocks.revalidatePath.mock.calls.map((c) => c[0]);
    expect(paths).toEqual(expect.arrayContaining([
      `/studio/${ids.draftWork}/world`, `/works/${ids.draftWork}`, `/studio/${ids.rootWork}/world`, `/works/${ids.rootWork}`,
    ]));
  });

  it('rejects a blind parent before confirm and keeps the typed reason', async () => {
    mocks.getBranchEligibility.mockResolvedValue({ ok: true, eligibility: blindParentSummary });
    const result = await confirmBranchAction(ids.draftWork, confirmInput);
    expect(result).toMatchObject({ ok: false, code: 'branch_ineligible', unmetReasons: ['parent_not_visible'], eligibility: blindParentSummary });
    expect(mocks.confirmBranch).not.toHaveBeenCalled();
  });

  it('does not confirm when the eligibility lookup fails or is unmet', async () => {
    mocks.getBranchEligibility.mockResolvedValueOnce({ ok: false, code: 'eligibility_unavailable', error: 'x', retryable: true });
    expect(await confirmBranchAction(ids.draftWork, confirmInput)).toMatchObject({ ok: false, code: 'eligibility_unavailable' });
    mocks.getBranchEligibility.mockResolvedValueOnce({ ok: true, eligibility: insufficientSummary });
    expect(await confirmBranchAction(ids.draftWork, confirmInput)).toMatchObject({ ok: false, code: 'branch_ineligible' });
    expect(mocks.confirmBranch).not.toHaveBeenCalled();
  });

  it('passes a DB rejection after the pre-check (blind after check) through unchanged', async () => {
    mocks.confirmBranch.mockResolvedValue(ineligibleFromDb);
    expect(await confirmBranchAction(ids.draftWork, confirmInput)).toEqual(ineligibleFromDb);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('recovers a confirmed branch on retry without a new eligibility pre-check', async () => {
    setBranches([rootBranchRow, ifBranchRow, branch({ status: 'confirmed', confirmedAt: T0 })]);
    mocks.getBranchEligibility.mockResolvedValue({ ok: true, eligibility: blindParentSummary });
    const result = await confirmBranchAction(ids.draftWork, confirmInput);
    expect(result).toMatchObject({ ok: true, status: 'confirmed', branchId: ids.draftBranch });
    expect(mocks.getBranchEligibility).not.toHaveBeenCalled();
    expect(mocks.confirmBranch).toHaveBeenCalledTimes(1);
  });

  it('reports a persisted confirm even when the refresh fails, so the UI does not confirm twice', async () => {
    mocks.revalidatePath.mockImplementation(() => { throw new Error('refresh failed'); });
    const result = await confirmBranchAction(ids.draftWork, confirmInput);
    expect(result).toMatchObject({ ok: true, status: 'confirmed', refreshed: false });
    expect(mocks.confirmBranch).toHaveBeenCalledTimes(1);
  });

  it('returns not_found for a work that is not a branch draft', async () => {
    setBranches([rootBranchRow]);
    expect(await confirmBranchAction(ids.draftWork, confirmInput)).toMatchObject({ ok: false, code: 'not_found' });
    expect(mocks.confirmBranch).not.toHaveBeenCalled();
  });

  it('fails closed when the branch lookup fails', async () => {
    mocks.getOwnedBranch.mockResolvedValue({ ok: false, code: 'unavailable', error: 'x', retryable: true });
    expect(await confirmBranchAction(ids.draftWork, confirmInput)).toMatchObject({ ok: false, code: 'unavailable', retryable: true });
    expect(mocks.confirmBranch).not.toHaveBeenCalled();
  });
});

describe('saveWorldTimelineAction', () => {
  const era = { id: ids.ifEraOwn, position: 2, name: '왕의 귀환', yearLabel: null, memo: null, inherited: false };

  it("builds the draft on the work's own server branch and the server baseline", async () => {
    const forged = { branchId: OTHER, branchKind: 'trunk', branchWorkId: OTHER, eras: [era], placements: [], baseline: { eras: [] }, ownerId: OTHER };
    const result = await saveWorldTimelineAction(ids.ifWork, forged as never);
    expect(result).toMatchObject({ ok: true, refreshed: true });
    expect(mocks.getOwnedTimeline).toHaveBeenCalledWith(expect.anything(), { ownerId: SESSION, workId: ids.ifWork });
    expect(mocks.saveTimeline).toHaveBeenCalledWith(expect.anything(), {
      ownerId: SESSION,
      draft: { branchId: ids.ifBranch, branchKind: 'if', branchWorkId: ids.ifWork, eras: [era], placements: [] },
      baseline: { eras: [], placements: [], forkEraIds: [] },
    });
    const paths = mocks.revalidatePath.mock.calls.map((c) => c[0]);
    expect(paths).toEqual(expect.arrayContaining([`/studio/${ids.ifWork}/world`, `/works/${ids.ifWork}`, `/works/${ids.rootWork}`]));
  });

  it('does not revalidate when the save fails', async () => {
    mocks.saveTimeline.mockResolvedValue({ ok: false, code: 'inherited_locked', error: 'x', retryable: false });
    expect(await saveWorldTimelineAction(ids.ifWork, { eras: [], placements: [] })).toMatchObject({ ok: false, code: 'inherited_locked' });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('rejects a non-array payload and a work without a tree', async () => {
    expect(await saveWorldTimelineAction(ids.ifWork, { eras: 'x', placements: [] } as never)).toMatchObject({ ok: false, code: 'invalid_input' });
    mocks.getOwnedTimeline.mockResolvedValue({ ok: true, timeline: null });
    expect(await saveWorldTimelineAction(ids.ifWork, { eras: [], placements: [] })).toMatchObject({ ok: false, code: 'no_tree' });
    expect(mocks.saveTimeline).not.toHaveBeenCalled();
  });
});

describe('deleteBranchAction', () => {
  it("rejects a branch that is not this work's branch", async () => {
    expect(await deleteBranchAction(ids.rootWork, ids.ifBranch)).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await deleteBranchAction(ids.ifWork, ids.grandchildBranch)).toMatchObject({ ok: false, code: 'forbidden' });
    expect(mocks.deleteBranch).not.toHaveBeenCalled();
  });

  it('deletes through the domain guard and revalidates on success only', async () => {
    const result = await deleteBranchAction(ids.ifWork, ids.ifBranch);
    expect(result).toMatchObject({ ok: true, branchId: ids.ifBranch, refreshed: true });
    expect(mocks.deleteBranch).toHaveBeenCalledWith(expect.anything(), { ownerId: SESSION, branchId: ids.ifBranch });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/studio/${ids.rootWork}/world`);

    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: SESSION } }, error: null });
    mocks.checkWriteAccess.mockResolvedValue({ ok: true });
    mocks.deleteBranch.mockResolvedValue({ ok: false, code: 'has_children', error: BRANCH_COPY.hasChildren, retryable: false });
    expect(await deleteBranchAction(ids.ifWork, ids.ifBranch)).toMatchObject({ ok: false, code: 'has_children', error: BRANCH_COPY.hasChildren });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe('markBranchNoticeReadAction', () => {
  it('marks through the domain RPC with the session owner and revalidates on success', async () => {
    const result = await markBranchNoticeReadAction(ids.ifWork, NOTICE);
    expect(result).toMatchObject({ ok: true, noticeId: NOTICE, readAt: T0, refreshed: true });
    expect(mocks.markBranchNoticeRead).toHaveBeenCalledWith(expect.anything(), { ownerId: SESSION, noticeId: NOTICE });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/studio/${ids.ifWork}/world`);
  });

  it('keeps the unread state on failure (no revalidate)', async () => {
    mocks.markBranchNoticeRead.mockResolvedValue({ ok: false, code: 'forbidden', error: 'x', retryable: false });
    expect(await markBranchNoticeReadAction(ids.ifWork, NOTICE)).toMatchObject({ ok: false, code: 'forbidden' });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe('getReaderPreviewAction', () => {
  it('asks the server for the reader projection instead of filtering the owner view', async () => {
    const result = await getReaderPreviewAction(ids.rootWork);
    expect(result).toMatchObject({ ok: true, status: 'ok', mode: 'reader', projection: readerNormalTree });
    expect(mocks.getWorldTree).toHaveBeenCalledWith(expect.anything(), { workId: ids.rootWork, readerPreview: true });
  });

  it('never returns an owner projection as a preview', async () => {
    mocks.getWorldTree.mockResolvedValue({ ok: true, status: 'ok', mode: 'owner', projection: ownerTree });
    const result = await getReaderPreviewAction(ids.rootWork);
    expect(result).toMatchObject({ ok: false, code: 'invalid_response' });
    expect(result).not.toHaveProperty('projection');
  });

  it('allows a suspended writer to preview (read only)', async () => {
    mocks.checkWriteAccess.mockResolvedValue({ ok: false, code: 'write_suspended', error: 'x', permanent: false, sanctionedUntil: null });
    expect(await getReaderPreviewAction(ids.rootWork)).toMatchObject({ ok: true });
  });
});

describe('read actions', () => {
  it('getBranchEligibilityAction returns the server summary as is', async () => {
    mocks.getBranchEligibility.mockResolvedValue({ ok: true, eligibility: blindParentSummary });
    expect(await getBranchEligibilityAction(ids.rootWork)).toEqual({ ok: true, eligibility: blindParentSummary });
    expect(mocks.getBranchEligibility).toHaveBeenCalledWith(expect.anything(), { ownerId: SESSION, sourceWorkId: ids.rootWork });
  });

  it('getBranchDiffAction uses the session owner', async () => {
    await getBranchDiffAction(ids.draftWork);
    expect(mocks.getBranchDiff).toHaveBeenCalledWith(expect.anything(), { ownerId: SESSION, draftWorkId: ids.draftWork });
  });

  it('ensureWorldTreeAction revalidates only after the trunk exists', async () => {
    expect(await ensureWorldTreeAction(ids.rootWork)).toMatchObject({ ok: true, branchId: ids.rootBranch, refreshed: true });
    expect(mocks.ensureWorldTree).toHaveBeenCalledWith(expect.anything(), { ownerId: SESSION, workId: ids.rootWork });
  });
});
