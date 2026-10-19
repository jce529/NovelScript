/**
 * 5-step self-branch flow (18-09, WTREE-03/04/05/07/10) as a pure state machine.
 *
 *   source (start position + kind + server eligibility)
 *     -> editing (KB copy edited in the EXISTING editor at /studio/{draftWorkId}/kb/{nodeId})
 *     -> review (server diff + snapshot / irreversible warning; acknowledging does NOT confirm)
 *     -> info (title + era; the ONLY place the confirm RPC is called, exactly once)
 *     -> complete
 *
 * Rules enforced here (the server re-checks every one of them; this only keeps the UI honest):
 * - Eligibility is rendered from the server BranchEligibilitySummary only. loading / error /
 *   eligible=false / contradicting summaries all fail closed. Nothing here compares counts with
 *   thresholds: per-row met/unmet comes from the server's unmetReasons.
 * - parent_not_visible (draft, blinded, deleted, no published chapter) is a separate reason from
 *   numeric shortfalls, and its zero counts are "not aggregated", never rendered as a shortfall.
 * - If: zero changes cannot move on. Expand: zero additions or any inherited mutation cannot.
 * - The review acknowledgement is bound to the exact server diff it was given for. Returning from
 *   the external KB editor (or a different refreshed diff) invalidates it.
 * - begin reuses one request id per flow so retries never create a second draft; confirm is
 *   single-flight (recheck -> submit) and a confirmed reply is reused (idempotent).
 * - Only the `self` start source is active. `purchase` is a disabled placeholder (WTREE-11~13
 *   are out of scope).
 * - WTREE-09 (pre-fork document locks follow the child reader's progress when the parent is
 *   private) is out of scope: no progress/lock state lives here.
 *
 * No server-only imports: this module is shared by the client wizard and unit tests.
 */
import {
  ELIGIBILITY_CATEGORIES,
  type BranchDiff,
  type BranchEligibilitySummary,
  type BranchEligibilityThresholds,
  type ChildBranchKind,
  type EligibilityCategory,
  type EligibilityUnmetReason,
  type Uuid,
} from '@/lib/world-tree/types';

// ---------------------------------------------------------------------------
// Copy (UI-SPEC §4)
// ---------------------------------------------------------------------------

export const BRANCH_FLOW_COPY = Object.freeze({
  eligibilityTitle: '가지 치기 조건',
  eligibilityMet: '가지 치기 조건을 채웠어요.',
  eligibilityLoading: '가지 치기 조건을 확인하고 있어요.',
  eligibilityUnavailable: '가지 치기 조건을 확인하지 못했어요. 다시 시도해 주세요.',
  ineligible: '아직 가지 치기 조건을 채우지 못했어요.',
  revalidationFailed: '조건이 달라졌어요. 부족한 항목을 채워 주세요.',
  parentNotVisible: '이 작품은 지금 독자에게 보이지 않아서 가지를 칠 수 없어요. 공개 상태를 확인해 주세요.',
  parentBlockedHint: '부모 작품이 독자에게 공개된 상태에서만 가지를 칠 수 있어요.',
  parentUnpublishedHint: '먼저 작품을 발행해 주세요.',
  documentHelp: (minChars: number) => `본문 ${minChars}자 이상인 설정 문서만 세어요.`,
  documentExcluded: '빈 문서·폴더·기본 템플릿은 세지 않아요.',
  ifDescription: '기존 설정을 고치거나 지우고, 필요하면 새 설정도 더해요. 같은 세계관의 다른 가능성(If 스토리)을 써요.',
  expandDescription: '기존 설정은 그대로 가져오고 새 인물·장소 같은 설정만 더해요. 같은 세계관을 공유하는 다른 지역 이야기를 써요.',
  kindRequired: '가지 유형을 골라 주세요.',
  zeroChanges: '설정을 하나 이상 바꿔야 가지를 확정할 수 있어요.',
  zeroAdditions: '새 설정을 하나 이상 추가해야 가지를 확정할 수 있어요.',
  inheritedMutation: '확장 가지에서는 가져온 설정을 고치거나 지울 수 없어요. 새 설정만 더해 주세요.',
  diffRequired: '변경 내용을 다시 확인해 주세요.',
  diffUnavailable: '변경 내용을 불러오지 못했어요. 다시 시도해 주세요.',
  confirmWarning:
    '확정하면 이 시점의 설정이 스냅샷으로 고정돼요. 원본 세계관이 나중에 바뀌어도 이 가지에는 반영되지 않고 알림만 가요. 확정 뒤에는 가지 설정을 되돌릴 수 없어요.',
  reviewRequired: '변경 내용을 다시 확인하고 가지 확정을 눌러 주세요.',
  titleRequired: '작품 제목을 입력해주세요.',
  eraInvalid: '세계관 내 시점을 다시 선택해 주세요.',
  newWorkPublishNote: '첫 회차를 발행하면 세계수에 보여요.',
  completeTitle: '가지가 열렸어요',
  copyScope: '설정집(KB) 전체를 복제해 새 가지를 시작해요. 본문과 원고는 복제되지 않아요.',
  sourceIsOriginal: '원본 세계관은 바뀌지 않아요. 가지는 확정하는 순간의 스냅샷으로 고정돼요.',
  purchaseDisabled: '구매한 세계관으로 시작하기는 아직 준비 중이에요.',
});

export const BRANCH_FLOW_STEPS = ['source', 'editing', 'review', 'info', 'complete'] as const;
export type BranchFlowStep = (typeof BRANCH_FLOW_STEPS)[number];
export const BRANCH_FLOW_STEP_LABELS: Readonly<Record<BranchFlowStep, string>> = Object.freeze({
  source: '세계수 시작',
  editing: '설정 복제·수정',
  review: '변경 확인',
  info: '새 작품 정보',
  complete: '완료',
});

export type BranchSource = 'self' | 'purchase';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type EligibilityView =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; summary: BranchEligibilitySummary };

export type DiffView =
  | { status: 'stale' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; diff: BranchDiff; editLinks: (string | null)[]; signature: string };

/** Failure shape shared by the 18-07 Server Action results (only these fields are read). */
export interface BranchFlowFailure {
  code: string;
  error: string;
  retryable: boolean;
  unmetReasons?: EligibilityUnmetReason[];
  eligibility?: BranchEligibilitySummary | null;
}

export interface EraOption {
  id: Uuid;
  label: string;
}

export interface BranchFlowState {
  step: BranchFlowStep;
  source: 'self';
  kind: ChildBranchKind | null;
  sourceWorkId: Uuid;
  /** One id per flow: a retried begin is recovered by the RPC instead of creating a new draft. */
  requestId: Uuid;
  draftWorkId: Uuid | null;
  eligibility: EligibilityView;
  diff: DiffView;
  review: { acknowledgedSignature: string | null };
  info: { title: string; eraId: Uuid | null };
  eraOptions: EraOption[];
  begin: { pending: boolean };
  confirm: { phase: 'idle' | 'rechecking' | 'submitting' };
  result: { workId: Uuid; branchId: Uuid } | null;
  /** Latest blocking / failure message for the current step (null = none). */
  error: string | null;
  /** False after a non-retryable confirm failure (not_found / forbidden / request_conflict). */
  retryable: boolean;
}

export interface BranchFlowInit {
  sourceWorkId: Uuid;
  requestId: Uuid;
  eraOptions?: EraOption[];
  /** An existing server draft (owner state) to resume at the editing step. */
  draft?: { draftWorkId: Uuid; kind: ChildBranchKind; requestId: Uuid } | null;
  eligibility?: EligibilityView;
}

export function createBranchFlow(init: BranchFlowInit): BranchFlowState {
  const draft = init.draft ?? null;
  return {
    step: draft ? 'editing' : 'source',
    source: 'self',
    kind: draft ? draft.kind : null,
    sourceWorkId: init.sourceWorkId,
    requestId: draft ? draft.requestId : init.requestId,
    draftWorkId: draft ? draft.draftWorkId : null,
    eligibility: init.eligibility ?? { status: 'loading' },
    diff: { status: 'stale' },
    review: { acknowledgedSignature: null },
    info: { title: '', eraId: null },
    eraOptions: [...(init.eraOptions ?? [])],
    begin: { pending: false },
    confirm: { phase: 'idle' },
    result: null,
    error: null,
    retryable: true,
  };
}

// ---------------------------------------------------------------------------
// Pure gates
// ---------------------------------------------------------------------------

export type EligibilityBlockReason = 'loading' | 'error' | 'parent_unpublished' | 'parent_not_visible' | 'unmet';

export interface EligibilityGate {
  allowed: boolean;
  reason: EligibilityBlockReason | null;
  message: string;
  /** Extra line under the general copy (parent publish state). */
  hint: string | null;
}

export function eligibilityUnmetMessage(t: BranchEligibilityThresholds): string {
  const c = t.minCategoryDocuments;
  return `${BRANCH_FLOW_COPY.ineligible} 발행 ${t.minPublishedChapters}화 이상, 본문이 있는 설정 문서 ${t.minQualifyingDocuments}개 이상(인물 ${c['인물']}·장소 ${c['장소']}·사건 ${c['사건']})을 채운 작품에서 가지를 칠 수 있어요.`;
}

/** Server summary -> allowed / reason. Fails closed on anything but a clean eligible=true. */
export function eligibilityGate(view: EligibilityView): EligibilityGate {
  if (view.status === 'loading') return { allowed: false, reason: 'loading', message: BRANCH_FLOW_COPY.eligibilityLoading, hint: null };
  if (view.status === 'error') return { allowed: false, reason: 'error', message: BRANCH_FLOW_COPY.eligibilityUnavailable, hint: null };
  const s = view.summary;
  if (s.readerVisible !== true || s.unmetReasons.includes('parent_not_visible')) {
    const unpublished = s.isPublished !== true;
    return {
      allowed: false,
      reason: unpublished ? 'parent_unpublished' : 'parent_not_visible',
      message: BRANCH_FLOW_COPY.parentNotVisible,
      hint: unpublished ? BRANCH_FLOW_COPY.parentUnpublishedHint : BRANCH_FLOW_COPY.parentBlockedHint,
    };
  }
  if (s.eligible !== true || s.unmetReasons.length > 0) {
    return { allowed: false, reason: 'unmet', message: eligibilityUnmetMessage(s.thresholds), hint: null };
  }
  return { allowed: true, reason: null, message: BRANCH_FLOW_COPY.eligibilityMet, hint: null };
}

export interface EligibilityRow {
  key: 'chapters' | 'documents' | EligibilityCategory;
  label: string;
  current: number;
  required: number;
  met: boolean;
}

const CATEGORY_REASON: Record<EligibilityCategory, EligibilityUnmetReason> = {
  인물: 'character_documents_insufficient',
  장소: 'place_documents_insufficient',
  사건: 'event_documents_insufficient',
};

/**
 * Display rows from the server summary. Numbers and denominators are the server's; met/unmet is
 * the server's unmetReasons. Returns null when counts were not aggregated (parent_not_visible).
 */
export function eligibilityRows(summary: BranchEligibilitySummary): EligibilityRow[] | null {
  if (summary.readerVisible !== true || summary.unmetReasons.includes('parent_not_visible')) return null;
  const t = summary.thresholds;
  const unmet = new Set(summary.unmetReasons);
  const rows: EligibilityRow[] = [
    {
      key: 'chapters',
      label: `발행 ${summary.publishedChapterCount}/${t.minPublishedChapters}화`,
      current: summary.publishedChapterCount,
      required: t.minPublishedChapters,
      met: !unmet.has('published_chapters_insufficient'),
    },
    {
      key: 'documents',
      label: `설정 문서 ${summary.qualifyingDocumentCount}/${t.minQualifyingDocuments}개`,
      current: summary.qualifyingDocumentCount,
      required: t.minQualifyingDocuments,
      met: !unmet.has('qualifying_documents_insufficient'),
    },
  ];
  for (const c of ELIGIBILITY_CATEGORIES) {
    rows.push({
      key: c,
      label: `${c} ${summary.categoryCounts[c]}/${t.minCategoryDocuments[c]}개`,
      current: summary.categoryCounts[c],
      required: t.minCategoryDocuments[c],
      met: !unmet.has(CATEGORY_REASON[c]),
    });
  }
  return rows;
}

export interface DiffGate {
  allowed: boolean;
  code: 'zero_changes' | 'zero_additions' | 'inherited_mutation' | null;
  message: string | null;
}

/** Same rules the confirm RPC enforces (0034): If needs >= 1 change, expand >= 1 add and no inherited edit. */
export function diffGate(kind: ChildBranchKind, diff: BranchDiff): DiffGate {
  const { added, modified, deleted } = diff.counts;
  if (kind === 'expand') {
    if (modified > 0 || deleted > 0) return { allowed: false, code: 'inherited_mutation', message: BRANCH_FLOW_COPY.inheritedMutation };
    if (added === 0) return { allowed: false, code: 'zero_additions', message: BRANCH_FLOW_COPY.zeroAdditions };
    return { allowed: true, code: null, message: null };
  }
  if (added + modified + deleted === 0) return { allowed: false, code: 'zero_changes', message: BRANCH_FLOW_COPY.zeroChanges };
  return { allowed: true, code: null, message: null };
}

/** Review token: identifies the exact server diff the warning was acknowledged for. */
export function diffSignature(diff: BranchDiff): string {
  const entries = diff.entries
    .map((e) => [e.changeKind, e.category, e.name, e.draftNodeId ?? '', e.sourceNodeId ?? ''].join('\u0001'))
    .sort();
  return JSON.stringify([diff.counts.added, diff.counts.modified, diff.counts.deleted, entries]);
}

function freshDiff(state: BranchFlowState): Extract<DiffView, { status: 'ok' }> | null {
  return state.diff.status === 'ok' ? state.diff : null;
}

export function canBegin(state: BranchFlowState): boolean {
  return (
    state.step === 'source' &&
    state.source === 'self' &&
    state.kind !== null &&
    state.draftWorkId === null &&
    !state.begin.pending &&
    eligibilityGate(state.eligibility).allowed
  );
}

function reviewBlock(state: BranchFlowState): string | null {
  const diff = freshDiff(state);
  if (!diff || !state.kind) return state.diff.status === 'error' ? BRANCH_FLOW_COPY.diffUnavailable : BRANCH_FLOW_COPY.diffRequired;
  return diffGate(state.kind, diff.diff).message;
}

export function canOpenReview(state: BranchFlowState): boolean {
  return state.step === 'editing' && state.draftWorkId !== null && reviewBlock(state) === null;
}

/** First reason the final confirm is blocked, or null when it may run. */
export function confirmBlock(state: BranchFlowState): string | null {
  const gate = eligibilityGate(state.eligibility);
  if (!gate.allowed) return gate.reason === 'unmet' ? BRANCH_FLOW_COPY.ineligible : gate.message;
  const diffBlocked = reviewBlock(state);
  if (diffBlocked) return diffBlocked;
  const diff = freshDiff(state)!;
  if (state.review.acknowledgedSignature !== diff.signature) return BRANCH_FLOW_COPY.reviewRequired;
  if (state.info.title.trim().length === 0) return BRANCH_FLOW_COPY.titleRequired;
  if (!state.info.eraId || !state.eraOptions.some((e) => e.id === state.info.eraId)) return BRANCH_FLOW_COPY.eraInvalid;
  return null;
}

export function canConfirm(state: BranchFlowState): boolean {
  return (
    state.step === 'info' &&
    state.draftWorkId !== null &&
    state.confirm.phase === 'idle' &&
    state.retryable &&
    confirmBlock(state) === null
  );
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export type BranchFlowEvent =
  | { type: 'ELIGIBILITY_REQUESTED' }
  | { type: 'ELIGIBILITY_LOADED'; summary: BranchEligibilitySummary }
  | { type: 'ELIGIBILITY_FAILED'; message: string }
  | { type: 'SELECT_SOURCE'; source: BranchSource }
  | { type: 'SELECT_KIND'; kind: ChildBranchKind }
  | { type: 'BEGIN_REQUESTED' }
  | { type: 'BEGIN_SUCCEEDED'; draftWorkId: Uuid }
  | { type: 'BEGIN_FAILED'; failure: BranchFlowFailure }
  | { type: 'DIFF_REQUESTED' }
  | { type: 'DIFF_LOADED'; diff: BranchDiff; editLinks?: (string | null)[] }
  | { type: 'DIFF_FAILED'; message: string }
  | { type: 'EDITOR_RETURNED' }
  | { type: 'OPEN_REVIEW' }
  | { type: 'ACKNOWLEDGE_REVIEW' }
  | { type: 'RETURN_TO_EDITING' }
  | { type: 'BACK_TO_REVIEW' }
  | { type: 'SET_TITLE'; title: string }
  | { type: 'SET_ERA'; eraId: Uuid | null }
  | { type: 'SET_ERA_OPTIONS'; eraOptions: EraOption[] }
  | { type: 'CONFIRM_REQUESTED' }
  | { type: 'CONFIRM_RECHECKED'; result: { ok: true; summary: BranchEligibilitySummary } | { ok: false; message: string } }
  | { type: 'CONFIRM_SUCCEEDED'; workId: Uuid; branchId: Uuid }
  | { type: 'CONFIRM_FAILED'; failure: BranchFlowFailure }
  | { type: 'DISMISS_ERROR' };

function eligibilityFromFailure(failure: BranchFlowFailure, fallback: EligibilityView): EligibilityView {
  if (failure.eligibility) return { status: 'ok', summary: failure.eligibility };
  if (failure.code === 'branch_ineligible') return { status: 'error', message: BRANCH_FLOW_COPY.eligibilityUnavailable };
  if (failure.code === 'eligibility_unavailable') return { status: 'error', message: BRANCH_FLOW_COPY.eligibilityUnavailable };
  return fallback;
}

function isParentBlocked(failure: BranchFlowFailure): boolean {
  return Boolean(failure.unmetReasons?.includes('parent_not_visible') || failure.eligibility?.unmetReasons.includes('parent_not_visible'));
}

const DIFF_REJECTIONS = new Set(['zero_changes', 'zero_additions', 'inherited_mutation']);
const FATAL_CONFIRM = new Set(['not_found', 'forbidden', 'request_conflict', 'confirmed_immutable']);

export function branchFlowReducer(state: BranchFlowState, event: BranchFlowEvent): BranchFlowState {
  if (state.step === 'complete') return state;

  switch (event.type) {
    case 'ELIGIBILITY_REQUESTED':
      return { ...state, eligibility: { status: 'loading' } };
    case 'ELIGIBILITY_LOADED':
      return { ...state, eligibility: { status: 'ok', summary: event.summary } };
    case 'ELIGIBILITY_FAILED':
      return { ...state, eligibility: { status: 'error', message: event.message } };

    case 'SELECT_SOURCE':
      // Only the writer's own world is active; purchase is a disabled placeholder.
      return state;
    case 'SELECT_KIND':
      if (state.step !== 'source' || state.draftWorkId !== null || state.begin.pending) return state;
      return { ...state, kind: event.kind, error: null };

    case 'BEGIN_REQUESTED':
      if (state.begin.pending || state.step !== 'source') return state;
      if (!canBegin(state)) {
        const gate = eligibilityGate(state.eligibility);
        const error = state.kind === null ? BRANCH_FLOW_COPY.kindRequired : gate.allowed ? null : gate.message;
        return error === state.error ? state : { ...state, error };
      }
      return { ...state, begin: { pending: true }, error: null };
    case 'BEGIN_SUCCEEDED':
      if (!state.begin.pending) return state;
      return {
        ...state,
        step: 'editing',
        draftWorkId: event.draftWorkId,
        begin: { pending: false },
        diff: { status: 'stale' },
        review: { acknowledgedSignature: null },
        error: null,
      };
    case 'BEGIN_FAILED': {
      if (!state.begin.pending) return state;
      const parentBlocked = isParentBlocked(event.failure);
      const error = event.failure.code === 'branch_ineligible'
        ? (parentBlocked ? BRANCH_FLOW_COPY.parentNotVisible : BRANCH_FLOW_COPY.ineligible)
        : event.failure.error;
      return { ...state, begin: { pending: false }, eligibility: eligibilityFromFailure(event.failure, state.eligibility), error };
    }

    case 'DIFF_REQUESTED':
      if (state.draftWorkId === null) return state;
      return { ...state, diff: { status: 'loading' } };
    case 'DIFF_LOADED': {
      if (state.draftWorkId === null) return state;
      const signature = diffSignature(event.diff);
      const diff: DiffView = { status: 'ok', diff: event.diff, editLinks: [...(event.editLinks ?? [])], signature };
      const ack = state.review.acknowledgedSignature;
      if (ack !== null && ack !== signature) {
        // Content changed after the warning was acknowledged: review again before confirming.
        return { ...state, diff, review: { acknowledgedSignature: null }, step: state.step === 'info' ? 'review' : state.step };
      }
      return { ...state, diff };
    }
    case 'DIFF_FAILED':
      if (state.draftWorkId === null) return state;
      return { ...state, diff: { status: 'error', message: event.message } };

    case 'EDITOR_RETURNED':
      if (state.draftWorkId === null || state.step === 'source') return state;
      return {
        ...state,
        step: state.step === 'info' ? 'review' : state.step,
        diff: { status: 'stale' },
        review: { acknowledgedSignature: null },
      };

    case 'OPEN_REVIEW': {
      if (state.step !== 'editing') return state;
      const blocked = state.draftWorkId === null ? BRANCH_FLOW_COPY.diffRequired : reviewBlock(state);
      if (blocked) return { ...state, error: blocked };
      return { ...state, step: 'review', review: { acknowledgedSignature: null }, error: null };
    }
    case 'ACKNOWLEDGE_REVIEW': {
      if (state.step !== 'review') return state;
      const blocked = reviewBlock(state);
      if (blocked) return { ...state, error: blocked };
      // Intent only: no DB confirm yet (title/era are still missing).
      return { ...state, step: 'info', review: { acknowledgedSignature: freshDiff(state)!.signature }, error: null };
    }
    case 'RETURN_TO_EDITING':
      if ((state.step !== 'review' && state.step !== 'info') || state.confirm.phase !== 'idle') return state;
      return { ...state, step: 'editing', diff: { status: 'stale' }, review: { acknowledgedSignature: null }, error: null };
    case 'BACK_TO_REVIEW':
      if (state.step !== 'info' || state.confirm.phase !== 'idle') return state;
      return { ...state, step: 'review', review: { acknowledgedSignature: null }, error: null };

    case 'SET_TITLE':
      if (state.confirm.phase !== 'idle') return state;
      return { ...state, info: { ...state.info, title: event.title } };
    case 'SET_ERA':
      if (state.confirm.phase !== 'idle') return state;
      return { ...state, info: { ...state.info, eraId: event.eraId } };
    case 'SET_ERA_OPTIONS':
      return { ...state, eraOptions: [...event.eraOptions] };

    case 'CONFIRM_REQUESTED': {
      if (state.step !== 'info' || state.confirm.phase !== 'idle' || !state.retryable) return state;
      const blocked = confirmBlock(state);
      if (blocked) return { ...state, error: blocked };
      return { ...state, confirm: { phase: 'rechecking' }, error: null };
    }
    case 'CONFIRM_RECHECKED': {
      if (state.confirm.phase !== 'rechecking') return state;
      if (!event.result.ok) {
        return {
          ...state,
          confirm: { phase: 'idle' },
          eligibility: { status: 'error', message: BRANCH_FLOW_COPY.eligibilityUnavailable },
          error: BRANCH_FLOW_COPY.eligibilityUnavailable,
        };
      }
      const eligibility: EligibilityView = { status: 'ok', summary: event.result.summary };
      const gate = eligibilityGate(eligibility);
      if (!gate.allowed) {
        const error = gate.reason === 'unmet' ? BRANCH_FLOW_COPY.revalidationFailed : BRANCH_FLOW_COPY.parentNotVisible;
        return { ...state, confirm: { phase: 'idle' }, eligibility, error };
      }
      return { ...state, confirm: { phase: 'submitting' }, eligibility };
    }
    case 'CONFIRM_SUCCEEDED':
      if (state.confirm.phase !== 'submitting') return state;
      return {
        ...state,
        step: 'complete',
        confirm: { phase: 'idle' },
        result: { workId: event.workId, branchId: event.branchId },
        error: null,
      };
    case 'CONFIRM_FAILED': {
      if (state.confirm.phase !== 'submitting') return state;
      const f = event.failure;
      const base = { ...state, confirm: { phase: 'idle' as const } };
      if (f.code === 'branch_ineligible') {
        return {
          ...base,
          eligibility: eligibilityFromFailure(f, state.eligibility),
          error: isParentBlocked(f) ? BRANCH_FLOW_COPY.parentNotVisible : BRANCH_FLOW_COPY.ineligible,
        };
      }
      if (f.code === 'eligibility_unavailable') {
        return { ...base, eligibility: eligibilityFromFailure(f, state.eligibility), error: BRANCH_FLOW_COPY.eligibilityUnavailable };
      }
      if (DIFF_REJECTIONS.has(f.code)) {
        return { ...base, step: 'review', diff: { status: 'stale' }, review: { acknowledgedSignature: null }, error: f.error };
      }
      return { ...base, error: f.error, retryable: f.retryable || !FATAL_CONFIRM.has(f.code) };
    }
    case 'DISMISS_ERROR':
      return state.error === null ? state : { ...state, error: null };
    default:
      return state;
  }
}
