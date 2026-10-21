'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useReducer, useRef, useState } from 'react';
import { CheckCircle2Icon, CircleAlertIcon, ExternalLinkIcon, LoaderIcon, XCircleIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  beginBranchAction,
  confirmBranchAction,
  getBranchDiffAction,
  getBranchEligibilityAction,
} from '@/app/studio/[workId]/world/actions';
import {
  BRANCH_FLOW_COPY,
  branchFlowReducer,
  canBegin,
  canConfirm,
  canOpenReview,
  confirmBlock,
  createBranchFlow,
  diffGate,
  eligibilityGate,
  eligibilityRows,
  type BranchFlowFailure,
  type BranchFlowState,
  type EligibilityView,
  type EraOption,
} from '@/lib/world-tree/branch-flow';
import type { OwnerEligibilitySection } from '@/lib/world-tree/owner';
import type { ChildBranchKind, EligibilityUnmetReason, BranchEligibilitySummary } from '@/lib/world-tree/types';
import { BranchStepper } from './branch-stepper';

/**
 * Self-branch wizard (18-09, UI-SPEC §4 / mockup board 42).
 *
 * - Every transition goes through the pure branch-flow reducer; this component only performs the
 *   18-07 Server Actions and dispatches their results.
 * - Eligibility is rendered from the server summary only (no client counting, no thresholds in
 *   this file). Loading / error / unmet disable both "start" and the final confirm.
 * - Documents are edited in the EXISTING KB editor (/studio/{draftWorkId}/kb/{nodeId} and the
 *   draft's studio tree), opened in a new tab. Coming back to this tab marks the diff stale,
 *   re-fetches it and voids the warning acknowledgement.
 * - Step 3 ("가지 확정") only records the acknowledgement. The DB confirm runs once from step 4
 *   ("작품 만들기") after title/era validation and a fresh server eligibility check.
 * - No visibility choice: the new work becomes visible only through the normal publish flow.
 * - WTREE-09 (pre-fork locks following the child reader's progress) is out of scope.
 */

// ---------------------------------------------------------------------------
// Shared: eligibility panel (also used by WorldSettings)
// ---------------------------------------------------------------------------

export function eligibilityViewFromSection(section: OwnerEligibilitySection | null | undefined): EligibilityView {
  if (!section) return { status: 'loading' };
  if (section.status === 'ok') return { status: 'ok', summary: section.summary };
  return { status: 'error', message: section.error };
}

function publishStateText(summary: BranchEligibilitySummary): string {
  if (!summary.isPublished) return '발행 전';
  return summary.readerVisible ? '발행 중' : '발행 중 · 독자에게 보이지 않음';
}

export function EligibilityPanel({
  view,
  onRetry,
  retrying = false,
  className,
}: {
  view: EligibilityView;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}) {
  const gate = eligibilityGate(view);
  const summary = view.status === 'ok' ? view.summary : null;
  const rows = summary ? eligibilityRows(summary) : null;

  return (
    <section aria-labelledby="branch-eligibility-title" className={cn('rounded-xl border bg-card p-4', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="branch-eligibility-title" className="text-sm font-semibold">
          {BRANCH_FLOW_COPY.eligibilityTitle}
        </h3>
        {view.status === 'loading' ? (
          <Badge variant="secondary">
            <LoaderIcon className="animate-spin" aria-hidden="true" />
            확인 중
          </Badge>
        ) : gate.allowed ? (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
            <CheckCircle2Icon aria-hidden="true" />
            조건 충족
          </Badge>
        ) : view.status === 'error' ? (
          <Badge variant="destructive">
            <CircleAlertIcon aria-hidden="true" />
            확인 실패
          </Badge>
        ) : (
          <Badge variant="destructive">
            <XCircleIcon aria-hidden="true" />
            조건 미충족
          </Badge>
        )}
      </div>

      {summary ? (
        <dl className="mt-3 grid gap-1.5 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">작품 발행 상태</dt>
            <dd className="flex items-center gap-1.5">
              {summary.readerVisible ? (
                <CheckCircle2Icon className="size-4 text-green-700 dark:text-green-400" aria-hidden="true" />
              ) : (
                <XCircleIcon className="size-4 text-destructive" aria-hidden="true" />
              )}
              <span>{publishStateText(summary)}</span>
            </dd>
          </div>
          {rows?.map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-3">
              <dt className={cn(row.key !== 'chapters' && row.key !== 'documents' && 'pl-3', 'text-muted-foreground')}>
                {row.key === 'chapters' ? '발행 회차' : row.key === 'documents' ? '설정 문서' : `· ${row.key}`}
              </dt>
              <dd className="flex items-center gap-1.5">
                {row.met ? (
                  <CheckCircle2Icon className="size-4 text-green-700 dark:text-green-400" aria-hidden="true" />
                ) : (
                  <XCircleIcon className="size-4 text-destructive" aria-hidden="true" />
                )}
                <span>{row.label}</span>
                <span className={cn('text-xs', row.met ? 'text-green-700 dark:text-green-400' : 'text-destructive')}>
                  {row.met ? '충족' : '미충족'}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="mt-3 space-y-1 text-xs leading-relaxed text-muted-foreground">
        {summary && rows ? (
          <>
            <p>{BRANCH_FLOW_COPY.documentHelp(summary.thresholds.minDocumentChars)}</p>
            <p>{BRANCH_FLOW_COPY.documentExcluded}</p>
          </>
        ) : null}
      </div>

      {!gate.allowed && view.status !== 'loading' ? (
        <div role="status" className="mt-3 space-y-1 text-sm">
          <p className={cn(view.status === 'error' ? 'text-destructive' : 'text-foreground')}>{gate.message}</p>
          {gate.hint ? <p className="font-semibold">{gate.hint}</p> : null}
        </div>
      ) : gate.allowed ? (
        <p role="status" className="mt-3 text-sm text-green-700 dark:text-green-400">
          {gate.message}
        </p>
      ) : (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          {gate.message}
        </p>
      )}

      {view.status === 'error' && onRetry ? (
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry} disabled={retrying}>
          다시 불러오기
        </Button>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Wizard
// ---------------------------------------------------------------------------

export interface BranchWizardProps {
  /** The work the new branch is cut from (root, If or expand child alike). */
  sourceWorkId: string;
  sourceTitle: string;
  /** Server eligibility section from getWorldTreeOwnerState (never computed on the client). */
  eligibility: OwnerEligibilitySection | null;
  /** Eras of the source work's own timeline line (confirm's fork era). */
  eraOptions: EraOption[];
  /** Existing server draft to resume (owner state / validated ?draft= query). */
  draft?: { draftWorkId: string; kind: ChildBranchKind; requestId: string } | null;
  onClose?: () => void;
}

type ActionFailureLike = {
  ok: false;
  code: string;
  error: string;
  retryable: boolean;
  unmetReasons?: EligibilityUnmetReason[];
  eligibility?: BranchEligibilitySummary | null;
};

function toFailure(result: ActionFailureLike): BranchFlowFailure {
  return {
    code: result.code,
    error: result.error,
    retryable: result.retryable,
    unmetReasons: result.unmetReasons,
    eligibility: result.eligibility ?? null,
  };
}

function newRequestId(): string {
  return globalThis.crypto.randomUUID();
}

const KIND_LABEL: Record<ChildBranchKind, string> = { if: 'If 가지', expand: '확장 가지' };

export function BranchWizard({ sourceWorkId, sourceTitle, eligibility, eraOptions, draft = null, onClose }: BranchWizardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, dispatch] = useReducer(branchFlowReducer, null, () =>
    createBranchFlow({
      sourceWorkId,
      requestId: newRequestId(),
      eraOptions,
      draft,
      eligibility: eligibilityViewFromSection(eligibility),
    }),
  );
  const stateRef = useRef<BranchFlowState>(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const confirmInFlight = useRef(false);
  const editorOpened = useRef(false);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);
  const titleId = useId();
  const eraId = useId();

  // Server re-render (router.refresh / ?draft=) may bring a newer era list.
  useEffect(() => {
    dispatch({ type: 'SET_ERA_OPTIONS', eraOptions });
  }, [eraOptions]);

  const refreshEligibility = useCallback(async () => {
    setEligibilityLoading(true);
    dispatch({ type: 'ELIGIBILITY_REQUESTED' });
    try {
      const result = await getBranchEligibilityAction(sourceWorkId);
      if (result.ok) dispatch({ type: 'ELIGIBILITY_LOADED', summary: result.eligibility });
      else dispatch({ type: 'ELIGIBILITY_FAILED', message: BRANCH_FLOW_COPY.eligibilityUnavailable });
    } catch {
      dispatch({ type: 'ELIGIBILITY_FAILED', message: BRANCH_FLOW_COPY.eligibilityUnavailable });
    } finally {
      setEligibilityLoading(false);
    }
  }, [sourceWorkId]);

  // No server summary passed in: ask the server once (never assume eligible).
  const initialLookup = useRef(eligibility === null);
  useEffect(() => {
    if (initialLookup.current) {
      initialLookup.current = false;
      void refreshEligibility();
    }
  }, [refreshEligibility]);

  const loadDiff = useCallback(async (draftWorkId: string) => {
    dispatch({ type: 'DIFF_REQUESTED' });
    try {
      const result = await getBranchDiffAction(draftWorkId);
      if (result.ok) dispatch({ type: 'DIFF_LOADED', diff: result.diff, editLinks: result.editLinks });
      else dispatch({ type: 'DIFF_FAILED', message: result.error || BRANCH_FLOW_COPY.diffUnavailable });
    } catch {
      dispatch({ type: 'DIFF_FAILED', message: BRANCH_FLOW_COPY.diffUnavailable });
    }
  }, []);

  // Stale diff (new draft, editor return, server rejection) -> fetch the server diff again.
  useEffect(() => {
    if (state.draftWorkId && state.diff.status === 'stale' && state.step !== 'source' && state.step !== 'complete') {
      void loadDiff(state.draftWorkId);
    }
  }, [state.draftWorkId, state.diff.status, state.step, loadDiff]);

  // Returning from the external KB editor tab voids the review acknowledgement.
  useEffect(() => {
    function onReturn() {
      if (document.visibilityState !== 'visible' || !editorOpened.current) return;
      editorOpened.current = false;
      dispatch({ type: 'EDITOR_RETURNED' });
    }
    window.addEventListener('focus', onReturn);
    document.addEventListener('visibilitychange', onReturn);
    return () => {
      window.removeEventListener('focus', onReturn);
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, []);

  const markEditorOpened = () => {
    editorOpened.current = true;
  };

  async function handleBegin() {
    const current = stateRef.current;
    if (!canBegin(current) || current.kind === null) {
      dispatch({ type: 'BEGIN_REQUESTED' });
      return;
    }
    dispatch({ type: 'BEGIN_REQUESTED' });
    try {
      const result = await beginBranchAction(sourceWorkId, { kind: current.kind, forkEraId: null, requestId: current.requestId });
      if (result.ok) {
        dispatch({ type: 'BEGIN_SUCCEEDED', draftWorkId: result.draftWorkId });
        // Keep the draft in the URL so a reload resumes the same draft (18-11 validates ?draft=).
        router.replace(`${pathname}?draft=${result.draftWorkId}`, { scroll: false });
      } else {
        dispatch({ type: 'BEGIN_FAILED', failure: toFailure(result) });
      }
    } catch {
      dispatch({ type: 'BEGIN_FAILED', failure: { code: 'unavailable', error: '지금은 가지를 처리할 수 없어요. 잠시 후 다시 시도해 주세요.', retryable: true } });
    }
  }

  async function handleOpenReview() {
    const current = stateRef.current;
    if (!current.draftWorkId) return;
    // Always review the latest server diff, not a cached one.
    await loadDiff(current.draftWorkId);
    dispatch({ type: 'OPEN_REVIEW' });
  }

  async function handleConfirm() {
    const current = stateRef.current;
    if (confirmInFlight.current || !canConfirm(current) || !current.draftWorkId || !current.info.eraId) {
      dispatch({ type: 'CONFIRM_REQUESTED' });
      return;
    }
    confirmInFlight.current = true;
    dispatch({ type: 'CONFIRM_REQUESTED' });
    try {
      // 1) Latest server eligibility right before the irreversible confirm.
      let recheck: { ok: true; summary: BranchEligibilitySummary } | { ok: false; message: string };
      try {
        const latest = await getBranchEligibilityAction(sourceWorkId);
        recheck = latest.ok ? { ok: true, summary: latest.eligibility } : { ok: false, message: latest.error };
      } catch {
        recheck = { ok: false, message: BRANCH_FLOW_COPY.eligibilityUnavailable };
      }
      dispatch({ type: 'CONFIRM_RECHECKED', result: recheck });
      if (!recheck.ok || !eligibilityGate({ status: 'ok', summary: recheck.summary }).allowed) return;

      // 2) Single atomic confirm (server re-verifies eligibility and the diff again).
      try {
        const result = await confirmBranchAction(current.draftWorkId, { title: current.info.title.trim(), eraId: current.info.eraId });
        if (result.ok) {
          // The action already revalidated the world/work paths; keep this tab on the completion step.
          dispatch({ type: 'CONFIRM_SUCCEEDED', workId: result.workId, branchId: result.branchId });
        } else {
          dispatch({ type: 'CONFIRM_FAILED', failure: toFailure(result) });
        }
      } catch {
        dispatch({
          type: 'CONFIRM_FAILED',
          failure: { code: 'unavailable', error: '지금은 가지를 처리할 수 없어요. 잠시 후 다시 시도해 주세요.', retryable: true },
        });
      }
    } finally {
      confirmInFlight.current = false;
    }
  }

  const gate = eligibilityGate(state.eligibility);
  const okDiff = state.diff.status === 'ok' ? state.diff : null;
  const draftStudioHref = state.draftWorkId ? `/studio/${state.draftWorkId}` : null;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <BranchStepper current={state.step} />
        <p className="text-xs text-muted-foreground">{BRANCH_FLOW_COPY.sourceIsOriginal}</p>
      </div>

      {state.error ? (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </div>
      ) : null}

      {state.step === 'source' ? (
        <section aria-labelledby="branch-step-source" className="space-y-5">
          <h2 id="branch-step-source" className="text-lg font-semibold">
            1. 세계수 시작
          </h2>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">시작 위치</legend>
            <div className="flex flex-wrap gap-2">
              <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-primary px-3 text-sm">
                <input type="radio" name="branch-source" value="self" checked readOnly />내 작품의 세계관
              </label>
              <label className="flex min-h-11 cursor-not-allowed items-center gap-2 rounded-lg border px-3 text-sm text-muted-foreground">
                <input type="radio" name="branch-source" value="purchase" disabled aria-describedby="branch-source-purchase" />
                구매한 세계관
              </label>
            </div>
            <p id="branch-source-purchase" className="text-xs text-muted-foreground">
              {BRANCH_FLOW_COPY.purchaseDisabled}
            </p>
          </fieldset>

          <div className="rounded-xl border bg-card p-4 text-sm">
            <p className="text-xs text-muted-foreground">내 작품의 세계관에서 시작해요.</p>
            <p className="mt-1 font-semibold">{sourceTitle}</p>
          </div>

          <fieldset className="space-y-2" disabled={state.begin.pending}>
            <legend className="text-sm font-semibold">가지 유형</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(['if', 'expand'] as const).map((kind) => (
                <label
                  key={kind}
                  className={cn(
                    'flex min-h-11 cursor-pointer flex-col gap-1 rounded-xl border p-3 text-sm',
                    state.kind === kind && 'border-primary ring-2 ring-primary/30',
                  )}
                >
                  <span className="flex items-center gap-2 font-semibold">
                    <input
                      type="radio"
                      name="branch-kind"
                      value={kind}
                      checked={state.kind === kind}
                      onChange={() => dispatch({ type: 'SELECT_KIND', kind })}
                    />
                    {KIND_LABEL[kind]}
                  </span>
                  <span className="text-xs leading-relaxed text-muted-foreground">
                    {kind === 'if' ? BRANCH_FLOW_COPY.ifDescription : BRANCH_FLOW_COPY.expandDescription}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <EligibilityPanel view={state.eligibility} onRetry={() => void refreshEligibility()} retrying={eligibilityLoading} />

          <div className="space-y-1 text-xs leading-relaxed text-muted-foreground">
            <p>{BRANCH_FLOW_COPY.copyScope}</p>
            <p>확정하면 새 작품(초안)이 만들어져요. {BRANCH_FLOW_COPY.newWorkPublishNote}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {onClose ? (
              <Button type="button" variant="outline" onClick={onClose}>
                닫기
              </Button>
            ) : null}
            <Button type="button" onClick={() => void handleBegin()} disabled={!canBegin(state)} aria-describedby="branch-begin-reason">
              {state.begin.pending ? '가지를 준비하는 중…' : '이 세계관에서 가지 치기'}
            </Button>
            {!canBegin(state) && !state.begin.pending ? (
              <p id="branch-begin-reason" className="text-xs text-muted-foreground">
                {state.kind === null && gate.allowed ? BRANCH_FLOW_COPY.kindRequired : gate.allowed ? null : gate.reason === 'unmet' ? BRANCH_FLOW_COPY.ineligible : gate.message}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {state.step === 'editing' && state.kind ? (
        <section aria-labelledby="branch-step-editing" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="branch-step-editing" className="text-lg font-semibold">
              2. 복제한 설정 고치기
            </h2>
            <Badge variant="secondary">{KIND_LABEL[state.kind]}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {state.kind === 'expand'
              ? '확장 가지는 가져온 설정을 고치거나 지울 수 없어요. 새 인물·장소·설정 문서만 더해요.'
              : '복제한 설정 문서를 기존 설정집 편집기에서 고치거나 지우고, 새 문서를 더할 수 있어요.'}
          </p>

          {draftStudioHref ? (
            <div className="flex flex-wrap gap-2">
              <Link
                href={draftStudioHref}
                target="_blank"
                rel="noopener"
                onClick={markEditorOpened}
                className={cn(buttonVariants({ variant: 'outline' }), 'min-h-11')}
              >
                설정집 편집기 열기
                <ExternalLinkIcon aria-hidden="true" />
              </Link>
              <span className="self-center text-xs text-muted-foreground">
                새 인물·장소·설정 문서는 편집기의 설정집에서 추가해요. 편집을 마치고 이 탭으로 돌아오면 변경 내용을 다시 불러와요.
              </span>
            </div>
          ) : null}

          <DiffSummary state={state} onEditLink={markEditorOpened} />

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => state.draftWorkId && void loadDiff(state.draftWorkId)}
              disabled={state.diff.status === 'loading'}
            >
              변경 내용 새로 불러오기
            </Button>
            <Button type="button" onClick={() => void handleOpenReview()} disabled={!canOpenReview(state)}>
              변경 내용 확인
            </Button>
            {okDiff && !canOpenReview(state) ? (
              <p className="text-xs text-muted-foreground">{diffGate(state.kind, okDiff.diff).message}</p>
            ) : null}
          </div>
        </section>
      ) : null}

      {state.step === 'review' && state.kind ? (
        <section aria-labelledby="branch-step-review" className="space-y-4">
          <h2 id="branch-step-review" className="text-lg font-semibold">
            3. 가지 확정
          </h2>
          <DiffSummary state={state} onEditLink={markEditorOpened} />
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
            {BRANCH_FLOW_COPY.confirmWarning}
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="outline" onClick={() => dispatch({ type: 'RETURN_TO_EDITING' })}>
              이전
            </Button>
            <Button
              type="button"
              onClick={() => dispatch({ type: 'ACKNOWLEDGE_REVIEW' })}
              disabled={!okDiff || !diffGate(state.kind, okDiff.diff).allowed}
            >
              가지 확정
            </Button>
          </div>
        </section>
      ) : null}

      {state.step === 'info' ? (
        <section aria-labelledby="branch-step-info" className="space-y-4">
          <h2 id="branch-step-info" className="text-lg font-semibold">
            4. 새 작품 정보와 연표 위치
          </h2>
          <div className="grid gap-4 sm:max-w-md">
            <div className="grid gap-1.5">
              <Label htmlFor={titleId}>작품 제목</Label>
              <Input
                id={titleId}
                value={state.info.title}
                maxLength={100}
                disabled={state.confirm.phase !== 'idle'}
                onChange={(e) => dispatch({ type: 'SET_TITLE', title: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={eraId}>세계관 내 시점 (연표 위치)</Label>
              <select
                id={eraId}
                className="h-11 rounded-lg border border-input bg-background px-3 text-sm"
                value={state.info.eraId ?? ''}
                disabled={state.confirm.phase !== 'idle'}
                onChange={(e) => dispatch({ type: 'SET_ERA', eraId: e.target.value || null })}
              >
                <option value="">시점을 골라 주세요</option>
                {state.eraOptions.map((era) => (
                  <option key={era.id} value={era.id}>
                    {era.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-xl border bg-muted/40 p-3 text-sm">
            <p className="font-semibold">공개는 작품 발행으로 정해져요</p>
            <p className="mt-1 text-xs text-muted-foreground">
              새 작품은 초안으로 시작해요. {BRANCH_FLOW_COPY.newWorkPublishNote} 작품을 비공개로 돌리면 독자에게는 작품 정보 없는
              ‘부러진 가지’로 보여요.
            </p>
          </div>

          <EligibilityPanel view={state.eligibility} onRetry={() => void refreshEligibility()} retrying={eligibilityLoading} />

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => dispatch({ type: 'BACK_TO_REVIEW' })}
              disabled={state.confirm.phase !== 'idle'}
            >
              이전
            </Button>
            <Button type="button" onClick={() => void handleConfirm()} disabled={!canConfirm(state)} aria-describedby="branch-confirm-reason">
              {state.confirm.phase === 'rechecking'
                ? '조건을 다시 확인하는 중…'
                : state.confirm.phase === 'submitting'
                  ? '작품을 만드는 중…'
                  : '작품 만들기'}
            </Button>
            {state.confirm.phase === 'idle' && !canConfirm(state) ? (
              <p id="branch-confirm-reason" className="text-xs text-muted-foreground">
                {confirmBlock(state) ?? (state.retryable ? null : '처음부터 다시 시작해 주세요.')}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {state.step === 'complete' && state.result ? (
        <section aria-labelledby="branch-step-complete" className="space-y-4">
          <h2 id="branch-step-complete" className="text-lg font-semibold">
            {BRANCH_FLOW_COPY.completeTitle}
          </h2>
          <p className="text-sm">
            “{state.info.title.trim()}”이 초안으로 만들어졌어요. {BRANCH_FLOW_COPY.newWorkPublishNote}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href={`/studio/${state.result.workId}/world`} className={cn(buttonVariants({ variant: 'outline' }), 'min-h-11')}>
              세계수에서 보기
            </Link>
            <Link href={`/studio/${state.result.workId}`} className={cn(buttonVariants(), 'min-h-11')}>
              에디터로 가서 연재 시작
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function DiffSummary({ state, onEditLink }: { state: BranchFlowState; onEditLink: () => void }) {
  if (state.diff.status === 'loading' || state.diff.status === 'stale') {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        변경 내용을 불러오는 중이에요.
      </p>
    );
  }
  if (state.diff.status === 'error') {
    return (
      <p role="status" className="text-sm text-destructive">
        {state.diff.message}
      </p>
    );
  }
  const { diff, editLinks } = state.diff;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {state.kind ? <Badge variant="secondary">{KIND_LABEL[state.kind]}</Badge> : null}
        <span>수정 {diff.counts.modified}</span>
        <span>삭제 {diff.counts.deleted}</span>
        <span>추가 {diff.counts.added}</span>
      </div>
      {diff.entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">아직 바뀐 설정이 없어요.</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {diff.entries.map((entry, index) => {
            const href = editLinks[index] ?? null;
            const kindText = entry.changeKind === 'added' ? '추가' : entry.changeKind === 'modified' ? '수정' : '삭제';
            return (
              <li key={`${entry.changeKind}-${entry.draftNodeId ?? entry.sourceNodeId ?? index}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                <Badge variant="outline">{entry.category}</Badge>
                <span className={cn('flex-1', entry.changeKind === 'deleted' && 'text-muted-foreground line-through')}>{entry.name}</span>
                <Badge variant={entry.changeKind === 'deleted' ? 'destructive' : 'secondary'}>{kindText}</Badge>
                {href && state.step === 'editing' ? (
                  <Link href={href} target="_blank" rel="noopener" onClick={onEditLink} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                    편집
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
