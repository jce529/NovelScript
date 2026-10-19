import { describe, expect, it } from 'vitest';
import {
  BRANCH_FLOW_COPY,
  branchFlowReducer,
  canBegin,
  canConfirm,
  canOpenReview,
  createBranchFlow,
  diffGate,
  diffSignature,
  eligibilityGate,
  eligibilityRows,
  eligibilityUnmetMessage,
  type BranchFlowEvent,
  type BranchFlowState,
} from '@/lib/world-tree/branch-flow';
import type { BranchDiff, BranchEligibilitySummary } from '@/lib/world-tree/types';
import {
  blindParentSummary,
  diffAdded,
  diffDeleted,
  diffModified,
  diffZero,
  eligibleSummary,
  ids,
  insufficientSummary,
} from './fixtures';

const REQUEST_ID = '9b2f7c1e-3a4d-4e5f-8a6b-7c8d9e0f1a2b';
const DRAFT_WORK = ids.draftWork;
const ERA = ids.ifEraOwn;
const eraOptions = [{ id: ERA, label: '왕의 귀환' }];

function run(state: BranchFlowState, ...events: BranchFlowEvent[]): BranchFlowState {
  return events.reduce(branchFlowReducer, state);
}

function fresh(eligibility: BranchEligibilitySummary | null = eligibleSummary): BranchFlowState {
  const s = createBranchFlow({ sourceWorkId: ids.rootWork, requestId: REQUEST_ID, eraOptions });
  return eligibility ? run(s, { type: 'ELIGIBILITY_LOADED', summary: eligibility }) : s;
}

/** Fresh flow -> If selected -> draft created -> diff loaded. */
function editing(diff: BranchDiff, kind: 'if' | 'expand' = 'if'): BranchFlowState {
  return run(
    fresh(),
    { type: 'SELECT_KIND', kind },
    { type: 'BEGIN_REQUESTED' },
    { type: 'BEGIN_SUCCEEDED', draftWorkId: DRAFT_WORK },
    { type: 'DIFF_LOADED', diff },
  );
}

function atInfo(diff: BranchDiff = diffModified, kind: 'if' | 'expand' = 'if'): BranchFlowState {
  return run(
    editing(diff, kind),
    { type: 'OPEN_REVIEW' },
    { type: 'ACKNOWLEDGE_REVIEW' },
    { type: 'SET_TITLE', title: '만약 왕이 살았다면' },
    { type: 'SET_ERA', eraId: ERA },
  );
}

describe('createBranchFlow', () => {
  it('starts at the source step with self source, no kind and loading eligibility', () => {
    const s = createBranchFlow({ sourceWorkId: ids.rootWork, requestId: REQUEST_ID });
    expect(s.step).toBe('source');
    expect(s.source).toBe('self');
    expect(s.kind).toBeNull();
    expect(s.eligibility.status).toBe('loading');
    expect(s.requestId).toBe(REQUEST_ID);
  });

  it('resumes an existing server draft at the editing step with a stale diff', () => {
    const s = createBranchFlow({
      sourceWorkId: ids.rootWork,
      requestId: REQUEST_ID,
      draft: { draftWorkId: DRAFT_WORK, kind: 'expand', requestId: ids.requestId },
    });
    expect(s.step).toBe('editing');
    expect(s.kind).toBe('expand');
    expect(s.draftWorkId).toBe(DRAFT_WORK);
    expect(s.requestId).toBe(ids.requestId);
    expect(s.diff.status).toBe('stale');
  });
});

describe('source step', () => {
  it('purchase source stays disabled (only self is active)', () => {
    const s = run(fresh(), { type: 'SELECT_SOURCE', source: 'purchase' });
    expect(s.source).toBe('self');
  });

  it('cannot begin without a kind, while loading, or after a lookup error', () => {
    expect(canBegin(fresh())).toBe(false);
    const loading = run(createBranchFlow({ sourceWorkId: ids.rootWork, requestId: REQUEST_ID }), { type: 'SELECT_KIND', kind: 'if' });
    expect(canBegin(loading)).toBe(false);
    const failed = run(loading, { type: 'ELIGIBILITY_FAILED', message: BRANCH_FLOW_COPY.eligibilityUnavailable });
    expect(failed.eligibility.status).toBe('error');
    expect(canBegin(failed)).toBe(false);
    expect(eligibilityGate(failed.eligibility).message).toBe('가지 치기 조건을 확인하지 못했어요. 다시 시도해 주세요.');
  });

  it('blocks 49/50 chapters and category shortfalls with server reasons', () => {
    const s = run(fresh(insufficientSummary), { type: 'SELECT_KIND', kind: 'if' });
    expect(canBegin(s)).toBe(false);
    const gate = eligibilityGate(s.eligibility);
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toBe('unmet');
    expect(gate.message).toContain('아직 가지 치기 조건을 채우지 못했어요');
    // BEGIN_REQUESTED is a no-op: no draft can be created while unmet.
    const after = run(s, { type: 'BEGIN_REQUESTED' });
    expect(after.begin.pending).toBe(false);
    expect(after.draftWorkId).toBeNull();
  });

  it('does not flip a client-side "fixed" summary to eligible (server flag wins, fail closed)', () => {
    // Counts look sufficient but the server says not eligible: stays blocked.
    const tampered: BranchEligibilitySummary = { ...eligibleSummary, eligible: false, unmetReasons: ['published_chapters_insufficient'] };
    expect(eligibilityGate({ status: 'ok', summary: tampered }).allowed).toBe(false);
    // eligible=true but contradicting reasons -> still blocked.
    const contradicting: BranchEligibilitySummary = { ...eligibleSummary, eligible: true, unmetReasons: ['place_documents_insufficient'] };
    expect(eligibilityGate({ status: 'ok', summary: contradicting }).allowed).toBe(false);
  });

  it('separates a blinded published parent (parent_not_visible) from numeric shortfalls', () => {
    const gate = eligibilityGate({ status: 'ok', summary: blindParentSummary });
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toBe('parent_not_visible');
    expect(gate.message).toBe('이 작품은 지금 독자에게 보이지 않아서 가지를 칠 수 없어요. 공개 상태를 확인해 주세요.');
    expect(gate.hint).toBe('부모 작품이 독자에게 공개된 상태에서만 가지를 칠 수 있어요.');
    // Not aggregated: no count rows that would render 0 as a shortfall.
    expect(eligibilityRows(blindParentSummary)).toBeNull();
  });

  it('asks to publish first when the parent is not published at all', () => {
    const draftParent: BranchEligibilitySummary = { ...blindParentSummary, isPublished: false };
    const gate = eligibilityGate({ status: 'ok', summary: draftParent });
    expect(gate.reason).toBe('parent_unpublished');
    expect(gate.hint).toBe('먼저 작품을 발행해 주세요.');
  });

  it('builds count rows from server numbers/thresholds and server reasons only', () => {
    const rows = eligibilityRows(insufficientSummary)!;
    expect(rows.map((r) => r.label)).toEqual(['발행 49/50화', '설정 문서 20/20개', '인물 5/5개', '장소 2/3개', '사건 3/3개']);
    expect(rows.map((r) => r.met)).toEqual([false, true, true, false, true]);
    const custom = { ...eligibleSummary, thresholds: { ...eligibleSummary.thresholds, minPublishedChapters: 7 } };
    expect(eligibilityRows(custom)![0].label).toBe('발행 50/7화');
    expect(eligibilityUnmetMessage(insufficientSummary.thresholds)).toBe(
      '아직 가지 치기 조건을 채우지 못했어요. 발행 50화 이상, 본문이 있는 설정 문서 20개 이상(인물 5·장소 3·사건 3)을 채운 작품에서 가지를 칠 수 있어요.',
    );
  });

  it('begin is single-flight and a retry reuses the same request id (no duplicate draft)', () => {
    const s = run(fresh(), { type: 'SELECT_KIND', kind: 'if' }, { type: 'BEGIN_REQUESTED' });
    expect(s.begin.pending).toBe(true);
    expect(canBegin(s)).toBe(false);
    expect(run(s, { type: 'BEGIN_REQUESTED' })).toBe(s);
    const failed = run(s, { type: 'BEGIN_FAILED', failure: { code: 'unavailable', error: '잠시 후', retryable: true } });
    expect(failed.step).toBe('source');
    expect(failed.begin.pending).toBe(false);
    expect(failed.requestId).toBe(REQUEST_ID);
    expect(canBegin(failed)).toBe(true);
  });

  it('a begin rejected as branch_ineligible keeps the source step and shows the latest summary', () => {
    const s = run(fresh(), { type: 'SELECT_KIND', kind: 'if' }, { type: 'BEGIN_REQUESTED' }, {
      type: 'BEGIN_FAILED',
      failure: { code: 'branch_ineligible', error: '아직', retryable: false, unmetReasons: ['parent_not_visible'], eligibility: blindParentSummary },
    });
    expect(s.step).toBe('source');
    expect(s.draftWorkId).toBeNull();
    expect(s.eligibility).toEqual({ status: 'ok', summary: blindParentSummary });
    expect(canBegin(s)).toBe(false);
  });

  it('kind cannot change once the draft exists', () => {
    const s = run(editing(diffModified), { type: 'SELECT_KIND', kind: 'expand' });
    expect(s.kind).toBe('if');
  });
});

describe('diff review gates', () => {
  it('zero changes cannot move to review/info (If)', () => {
    const s = editing(diffZero);
    expect(canOpenReview(s)).toBe(false);
    expect(diffGate('if', diffZero).message).toBe('설정을 하나 이상 바꿔야 가지를 확정할 수 있어요.');
    const after = run(s, { type: 'OPEN_REVIEW' });
    expect(after.step).toBe('editing');
    expect(after.error).toBe('설정을 하나 이상 바꿔야 가지를 확정할 수 있어요.');
    expect(run(after, { type: 'ACKNOWLEDGE_REVIEW' }).step).toBe('editing');
  });

  it('expand needs at least one addition and rejects inherited mutations', () => {
    expect(diffGate('expand', diffZero).code).toBe('zero_additions');
    expect(diffGate('expand', diffModified).code).toBe('inherited_mutation');
    expect(diffGate('expand', diffDeleted).code).toBe('inherited_mutation');
    expect(diffGate('expand', diffAdded).allowed).toBe(true);
    expect(canOpenReview(editing(diffModified, 'expand'))).toBe(false);
    expect(canOpenReview(editing(diffAdded, 'expand'))).toBe(true);
  });

  it('cannot open review without a fresh server diff', () => {
    const s = run(fresh(), { type: 'SELECT_KIND', kind: 'if' }, { type: 'BEGIN_REQUESTED' }, { type: 'BEGIN_SUCCEEDED', draftWorkId: DRAFT_WORK });
    expect(s.step).toBe('editing');
    expect(canOpenReview(s)).toBe(false);
    const failed = run(s, { type: 'DIFF_REQUESTED' }, { type: 'DIFF_FAILED', message: '변경 내용을 불러오지 못했어요.' });
    expect(canOpenReview(failed)).toBe(false);
  });

  it('acknowledging the warning moves to info but does not confirm', () => {
    const s = run(editing(diffModified), { type: 'OPEN_REVIEW' }, { type: 'ACKNOWLEDGE_REVIEW' });
    expect(s.step).toBe('info');
    expect(s.review.acknowledgedSignature).toBe(diffSignature(diffModified));
    expect(s.confirm.phase).toBe('idle');
    expect(s.result).toBeNull();
    // Title/era missing -> cannot confirm.
    expect(canConfirm(s)).toBe(false);
  });
});

describe('stale review after external KB edits', () => {
  it('returning from the editor invalidates the acknowledgement and goes back to review, keeping info', () => {
    const s = run(atInfo(), { type: 'EDITOR_RETURNED' });
    expect(s.step).toBe('review');
    expect(s.diff.status).toBe('stale');
    expect(s.review.acknowledgedSignature).toBeNull();
    expect(s.info).toEqual({ title: '만약 왕이 살았다면', eraId: ERA });
    expect(canConfirm(s)).toBe(false);
  });

  it('a refreshed diff with different content clears the acknowledgement at info', () => {
    const changed: BranchDiff = {
      counts: { added: 1, modified: 1, deleted: 0 },
      entries: [...diffModified.entries, ...diffAdded.entries.map((e) => ({ ...e, draftNodeId: ids.sourceNode }))],
    };
    const s = run(atInfo(), { type: 'DIFF_REQUESTED' }, { type: 'DIFF_LOADED', diff: changed });
    expect(s.step).toBe('review');
    expect(s.review.acknowledgedSignature).toBeNull();
    expect(canConfirm(s)).toBe(false);
  });

  it('a refreshed identical diff keeps the acknowledgement', () => {
    const s = run(atInfo(), { type: 'DIFF_REQUESTED' }, { type: 'DIFF_LOADED', diff: { ...diffModified } });
    expect(s.step).toBe('info');
    expect(canConfirm(s)).toBe(true);
  });

  it('going back to editing keeps title/era and requires a new acknowledgement', () => {
    const s = run(atInfo(), { type: 'RETURN_TO_EDITING' });
    expect(s.step).toBe('editing');
    expect(s.review.acknowledgedSignature).toBeNull();
    expect(s.info.title).toBe('만약 왕이 살았다면');
  });
});

describe('info step and confirm', () => {
  it('requires a title and a valid era before confirming', () => {
    const noTitle = run(atInfo(), { type: 'SET_TITLE', title: '   ' });
    expect(canConfirm(noTitle)).toBe(false);
    expect(run(noTitle, { type: 'CONFIRM_REQUESTED' }).error).toBe('작품 제목을 입력해주세요.');
    const badEra = run(atInfo(), { type: 'SET_ERA', eraId: ids.eraModern });
    expect(canConfirm(badEra)).toBe(false);
    expect(run(badEra, { type: 'CONFIRM_REQUESTED' }).error).toBe('세계관 내 시점을 다시 선택해 주세요.');
    expect(canConfirm(atInfo())).toBe(true);
  });

  it('confirms exactly once: recheck -> submit -> complete; duplicate requests are ignored', () => {
    const requested = run(atInfo(), { type: 'CONFIRM_REQUESTED' });
    expect(requested.confirm.phase).toBe('rechecking');
    expect(canConfirm(requested)).toBe(false);
    expect(run(requested, { type: 'CONFIRM_REQUESTED' })).toBe(requested);
    const submitting = run(requested, { type: 'CONFIRM_RECHECKED', result: { ok: true, summary: eligibleSummary } });
    expect(submitting.confirm.phase).toBe('submitting');
    expect(run(submitting, { type: 'CONFIRM_REQUESTED' })).toBe(submitting);
    const done = run(submitting, { type: 'CONFIRM_SUCCEEDED', workId: DRAFT_WORK, branchId: ids.draftBranch });
    expect(done.step).toBe('complete');
    expect(done.result).toEqual({ workId: DRAFT_WORK, branchId: ids.draftBranch });
    // Idempotent reply reuses the completion; no further confirm possible.
    expect(run(done, { type: 'CONFIRM_SUCCEEDED', workId: DRAFT_WORK, branchId: ids.draftBranch })).toBe(done);
    expect(run(done, { type: 'CONFIRM_REQUESTED' })).toBe(done);
  });

  it('a recheck that finds the conditions changed keeps draft/info and shows the latest shortfall', () => {
    const s = run(atInfo(), { type: 'CONFIRM_REQUESTED' }, { type: 'CONFIRM_RECHECKED', result: { ok: true, summary: insufficientSummary } });
    expect(s.step).toBe('info');
    expect(s.confirm.phase).toBe('idle');
    expect(s.error).toBe('조건이 달라졌어요. 부족한 항목을 채워 주세요.');
    expect(s.eligibility).toEqual({ status: 'ok', summary: insufficientSummary });
    expect(s.draftWorkId).toBe(DRAFT_WORK);
    expect(s.info.title).toBe('만약 왕이 살았다면');
    expect(canConfirm(s)).toBe(false);
  });

  it('a recheck that finds a blinded parent shows the parent_not_visible copy', () => {
    const s = run(atInfo(), { type: 'CONFIRM_REQUESTED' }, { type: 'CONFIRM_RECHECKED', result: { ok: true, summary: blindParentSummary } });
    expect(s.error).toBe(BRANCH_FLOW_COPY.parentNotVisible);
    expect(canConfirm(s)).toBe(false);
  });

  it('a recheck lookup failure blocks the confirm with the lookup copy', () => {
    const s = run(atInfo(), { type: 'CONFIRM_REQUESTED' }, { type: 'CONFIRM_RECHECKED', result: { ok: false, message: 'x' } });
    expect(s.confirm.phase).toBe('idle');
    expect(s.eligibility.status).toBe('error');
    expect(s.error).toBe('가지 치기 조건을 확인하지 못했어요. 다시 시도해 주세요.');
    expect(canConfirm(s)).toBe(false);
  });

  it('a DB branch_ineligible rejection keeps draft/info and shows the latest summary', () => {
    const s = run(
      atInfo(),
      { type: 'CONFIRM_REQUESTED' },
      { type: 'CONFIRM_RECHECKED', result: { ok: true, summary: eligibleSummary } },
      {
        type: 'CONFIRM_FAILED',
        failure: { code: 'branch_ineligible', error: 'db', retryable: false, unmetReasons: ['published_chapters_insufficient'], eligibility: insufficientSummary },
      },
    );
    expect(s.step).toBe('info');
    expect(s.error).toBe('아직 가지 치기 조건을 채우지 못했어요.');
    expect(s.eligibility).toEqual({ status: 'ok', summary: insufficientSummary });
    expect(s.info.eraId).toBe(ERA);
    expect(canConfirm(s)).toBe(false);
  });

  it('a DB parent_not_visible rejection without a summary still closes eligibility', () => {
    const s = run(
      atInfo(),
      { type: 'CONFIRM_REQUESTED' },
      { type: 'CONFIRM_RECHECKED', result: { ok: true, summary: eligibleSummary } },
      { type: 'CONFIRM_FAILED', failure: { code: 'branch_ineligible', error: 'db', retryable: false, unmetReasons: ['parent_not_visible'], eligibility: null } },
    );
    expect(s.error).toBe(BRANCH_FLOW_COPY.parentNotVisible);
    expect(s.eligibility.status).toBe('error');
    expect(canConfirm(s)).toBe(false);
  });

  it('a server zero_changes rejection sends the flow back to review with a stale diff', () => {
    const s = run(
      atInfo(),
      { type: 'CONFIRM_REQUESTED' },
      { type: 'CONFIRM_RECHECKED', result: { ok: true, summary: eligibleSummary } },
      { type: 'CONFIRM_FAILED', failure: { code: 'zero_changes', error: '설정을 하나 이상 바꿔야 가지를 확정할 수 있어요.', retryable: false } },
    );
    expect(s.step).toBe('review');
    expect(s.diff.status).toBe('stale');
    expect(s.error).toBe('설정을 하나 이상 바꿔야 가지를 확정할 수 있어요.');
    expect(s.info.title).toBe('만약 왕이 살았다면');
  });

  it('a transient failure keeps info and allows a retry on the same draft', () => {
    const s = run(
      atInfo(),
      { type: 'CONFIRM_REQUESTED' },
      { type: 'CONFIRM_RECHECKED', result: { ok: true, summary: eligibleSummary } },
      { type: 'CONFIRM_FAILED', failure: { code: 'unavailable', error: '지금은 가지를 처리할 수 없어요.', retryable: true } },
    );
    expect(s.step).toBe('info');
    expect(s.confirm.phase).toBe('idle');
    expect(s.draftWorkId).toBe(DRAFT_WORK);
    expect(canConfirm(s)).toBe(true);
  });

  it('CONFIRM_SUCCEEDED is ignored unless a submit is in flight', () => {
    const s = atInfo();
    expect(run(s, { type: 'CONFIRM_SUCCEEDED', workId: DRAFT_WORK, branchId: ids.draftBranch })).toBe(s);
  });
});
