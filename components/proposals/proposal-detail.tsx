'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, AlertTriangle, ArrowLeft, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import type { DetailHunk, ProposalDetail, ProposalStatus } from '@/lib/proposals/queries';
import { acceptProposalAction, rejectProposalAction, revertProposalAction } from '@/app/studio/[workId]/review/[proposalId]/actions';
import {
  buildAcceptInput, canEditChunk, cardTitle, detailHeading, fallbackTitle, folderOptionLabel, formatKstDate, isEdited, isFoldable,
  isMutedStatus, queueHref, selectAll, selectableIndexes, selectionStatus, statusLabel, toggleSelection,
} from './review-model';

/**
 * Phase 14 (MCP-06/07) proposal review detail. Renders the server's detail as-is:
 * hunks, applicability, stale flag and the opaque seenHash all come from
 * getProposalDetail; the client only keeps the writer's choices (checked indexes,
 * 직접 고침 text, folder) and sends those to the thin Server Actions.
 * 14-08 adds `AI와 다듬기` next to `직접 고치기`.
 */

type Outcome =
  | { kind: 'accepted'; appliedCount: number; indexes: number[]; edited: number[]; undoUntil: string | null; createdNodeId: string | null; folderName: string | null }
  | { kind: 'reverted' };

type Flash = { tone: 'status' | 'alert'; message: string } | null;

export interface ProposalDetailViewProps {
  detail: ProposalDetail;
  /** Server-formatted arrival label (relative labels depend on request time). */
  arrivalLabel: string;
}

function StatusBadge({ status, partial }: { status: ProposalStatus; partial: boolean }) {
  if (status === 'pending') return <Badge variant="outline" className="font-semibold">{statusLabel(status)}</Badge>;
  return <Badge variant="secondary" className={isMutedStatus(status) ? 'text-muted-foreground' : undefined}>{statusLabel(status, partial)}</Badge>;
}

const targetHref = (d: ProposalDetail, createdNodeId: string | null) => {
  if (d.kind === 'chapter_draft') return d.target.chapterId ? `/studio/${d.workId}/chapters/${d.target.chapterId}` : null;
  if (d.kind === 'kb_edit') return d.target.nodeId ? `/studio/${d.workId}/kb/${d.target.nodeId}` : null;
  const node = createdNodeId ?? d.createdNodeId;
  return node ? `/studio/${d.workId}/kb/${node}` : null;
};

export function ProposalDetailView({ detail, arrivalLabel }: ProposalDetailViewProps) {
  const router = useRouter();
  const [stale, setStale] = useState<ProposalDetail | null>(null);
  const view = stale ?? detail;
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [editing, setEditing] = useState<Record<number, boolean>>({});
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [folderId, setFolderId] = useState<string | null>(null);
  const [busy, setBusy] = useState<'accept' | 'reject' | 'revert' | null>(null);
  const [dialog, setDialog] = useState<'accept' | 'reject' | 'revert' | null>(null);
  const [dialogError, setDialogError] = useState('');
  const [revertConfirmHash, setRevertConfirmHash] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const staleRef = useRef<HTMLDivElement>(null);
  const acceptTriggerRef = useRef<HTMLButtonElement>(null);
  const rejectTriggerRef = useRef<HTMLButtonElement>(null);
  const revertTriggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [focusTarget, setFocusTarget] = useState<'flash' | 'stale' | null>(null);

  useEffect(() => { headingRef.current?.focus(); }, []);
  useEffect(() => {
    if (focusTarget === 'flash') flashRef.current?.focus();
    if (focusTarget === 'stale') staleRef.current?.focus();
  }, [focusTarget, flash, stale]);

  const status: ProposalStatus = outcome?.kind ?? view.status;
  const pending = status === 'pending';
  const isCreate = view.kind === 'kb_create';
  const isChapter = view.kind === 'chapter_draft';
  const titleText = view.targetTitle?.trim() || fallbackTitle(view.kind);
  const heading = detailHeading(view);
  const blocked = view.target.state !== 'ok';
  const selectable = blocked ? [] : selectableIndexes(view.hunks);
  const chosen = selected.filter((i) => selectable.includes(i));
  const folders = view.folders?.status === 'ok' ? view.folders : null;
  const folder = folders?.candidates.find((c) => c.id === folderId) ?? null;
  const decision = outcome?.kind === 'accepted' ? { acceptedIndexes: outcome.indexes, editedIndexes: outcome.edited } : view.decision;
  const partial = status === 'accepted' && !isCreate && decision !== null && view.hunks.length > 0 && decision.acceptedIndexes.length < view.hunks.length;
  const undoUntil = outcome?.kind === 'accepted' ? outcome.undoUntil : view.undoUntil;
  const canRevert = status === 'accepted' && (outcome?.kind === 'accepted' ? outcome.undoUntil !== null : view.canRevert);
  const labels = isChapter ? { current: '지금 본문', draft: 'AI 초안' } : { current: '지금 내용', draft: '수정안' };
  const link = targetHref(view, outcome?.kind === 'accepted' ? outcome.createdNodeId : null);
  const linkLabel = isChapter ? '회차 열기' : '문서 열기';
  const cardName = cardTitle(view);

  function resetChoices() {
    setSelected([]);
    setEditing({});
    setEdits({});
    setExpanded({});
  }

  function closeDialog(open: boolean) {
    if (open || busy) return;
    setDialog(null);
    setDialogError('');
    setRevertConfirmHash(null);
  }

  async function accept() {
    setBusy('accept');
    setFlash(null);
    try {
      const result = await acceptProposalAction(buildAcceptInput(view, chosen, edits, folder ? { id: folder.id, version: folder.version } : null));
      if (result.ok) {
        const appliedIdx = isCreate ? [] : chosen;
        setOutcome({
          kind: 'accepted', appliedCount: result.appliedCount, indexes: appliedIdx,
          edited: appliedIdx.filter((i) => { const h = view.hunks.find((x) => x.index === i); return h ? isEdited(h, edits) : false; }),
          undoUntil: result.undoUntil, createdNodeId: result.createdNodeId, folderName: folder ? folderOptionLabel(folder, folders?.root.name ?? '') : null,
        });
        setStale(null);
        const message = isCreate
          ? `${folder ? folderOptionLabel(folder, folders?.root.name ?? '') : ''} 폴더에 새 문서를 저장했어요.`
          : isChapter ? `${result.appliedCount}개를 본문에 반영했어요.` : `${result.appliedCount}개를 설정집에 반영했어요.`;
        setFlash({ tone: 'status', message });
        setFocusTarget('flash');
      } else if (result.status === 'stale') {
        // D-P14-04: fresh comparison, every selection cleared.
        setStale(result.detail);
        resetChoices();
        setFlash(null);
        setFocusTarget('stale');
      } else {
        if (result.code === 'folder_changed') setFolderId(null);
        if (result.code === 'not_pending' || result.code === 'expired' || result.code === 'locked' || result.code === 'not_found') {
          setStale(null);
          router.refresh();
        }
        setFlash({ tone: 'alert', message: result.error });
        setFocusTarget('flash');
      }
    } catch {
      setFlash({ tone: 'alert', message: '반영하지 못했어요. 본문은 바뀌지 않았어요. 잠시 뒤 다시 시도해 주세요.' });
      setFocusTarget('flash');
    } finally {
      setBusy(null);
      setDialog(null);
    }
  }

  async function reject() {
    setBusy('reject');
    setDialogError('');
    try {
      const result = await rejectProposalAction({ workId: view.workId, proposalId: view.id });
      if (result.ok) {
        router.push(`${queueHref(view.workId, 'pending')}?notice=rejected`);
        return;
      }
      setDialogError(result.error);
    } catch {
      setDialogError('거절하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    } finally {
      setBusy(null);
    }
  }

  async function revert() {
    setBusy('revert');
    setDialogError('');
    try {
      const result = await revertProposalAction(revertConfirmHash
        ? { workId: view.workId, proposalId: view.id, confirm: true, seenHash: revertConfirmHash }
        : { workId: view.workId, proposalId: view.id });
      if (result.ok) {
        setOutcome({ kind: 'reverted' });
        setDialog(null);
        setRevertConfirmHash(null);
        setFlash({ tone: 'status', message: '이 제안을 반영하기 전 본문으로 되돌렸어요.' });
        setFocusTarget('flash');
      } else if (result.status === 'confirm_required') {
        // The original changed after accept (or again): warn, keep the dialog, send this hash next.
        setRevertConfirmHash(result.confirmHash);
      } else {
        setDialogError(result.error);
        if (result.code === 'undo_expired' || result.code === 'not_revertible') router.refresh();
      }
    } catch {
      setDialogError('되돌리지 못했어요. 본문은 지금 그대로예요. 잠시 뒤 다시 시도해 주세요.');
    } finally {
      setBusy(null);
    }
  }

  const finalFocus = flash ? flashRef : dialog === 'revert' ? revertTriggerRef : dialog === 'reject' ? rejectTriggerRef : acceptTriggerRef;
  const unselected = view.hunks.length - chosen.length;
  const showBar = pending;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link href={queueHref(view.workId, 'pending')} className="inline-flex min-h-11 items-center gap-1 self-start text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft aria-hidden className="size-3" /> 리뷰 큐로 돌아가기
        </Link>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 ref={headingRef} tabIndex={-1} className="break-keep text-2xl font-semibold leading-tight outline-none">{heading}</h1>
          <StatusBadge status={status} partial={partial} />
        </div>
        <p className="text-xs text-muted-foreground">
          <span className="break-all font-semibold text-foreground">{view.source.clientName}</span>
          {' · '}<span className="break-all">{view.source.host}</span>
          {view.source.disconnected && <span> (연결 해제됨)</span>}
          에서 <span className="tabular-nums">{arrivalLabel}</span>에 보냈어요
        </p>
        {pending && !isCreate && (
          <p className="break-keep text-sm text-muted-foreground">원본과 달라진 부분을 문단 단위로 나눴어요. 반영할 부분만 골라 수락하세요. 고르지 않은 부분은 지금 본문 그대로 남아요.</p>
        )}
      </header>

      {flash && (
        <div
          ref={flashRef}
          tabIndex={-1}
          role={flash.tone}
          className={`flex flex-col gap-3 rounded-xl border p-4 outline-none ${flash.tone === 'alert' ? 'border-destructive/40' : 'border-border bg-muted'}`}
        >
          <p className={`flex items-start gap-2 text-sm ${flash.tone === 'alert' ? 'text-destructive' : ''}`}>
            {flash.tone === 'alert' && <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />}
            {flash.message}
          </p>
        </div>
      )}

      {(status === 'accepted' || status === 'reverted') && (
        <section aria-label="반영 결과" className="flex flex-col gap-3 rounded-xl border border-border p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {link && status === 'accepted' && (
              <Link href={link} className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-semibold hover:bg-muted sm:w-auto">{linkLabel}</Link>
            )}
            {canRevert && (
              <Button ref={revertTriggerRef} type="button" variant="outline" className="min-h-11 w-full sm:w-auto" disabled={busy !== null} onClick={() => setDialog('revert')}>반영 되돌리기</Button>
            )}
          </div>
          {canRevert && undoUntil && (
            <p className="text-xs text-muted-foreground tabular-nums">{formatKstDate(undoUntil)}까지 되돌릴 수 있어요. 되돌리기는 한 번만 할 수 있어요.</p>
          )}
          {status === 'accepted' && !canRevert && undoUntil && (
            <p className="text-xs text-muted-foreground">되돌릴 수 있는 기간이 지났어요.</p>
          )}
        </section>
      )}

      {pending && view.isStale && !blocked && (
        <div ref={staleRef} tabIndex={-1} role="alert" className="flex gap-3 rounded-xl border border-destructive/40 p-4 outline-none">
          <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-destructive">원본이 바뀌었어요</p>
            <p className="break-keep text-sm">
              {isChapter
                ? 'AI가 제안을 보낸 뒤에 이 회차의 본문이 달라졌어요. 지금 본문을 기준으로 변경 사항을 다시 비교했어요. 아래 내용을 확인한 뒤 반영해 주세요.'
                : 'AI가 제안을 보낸 뒤에 이 설정집 문서가 달라졌어요. 지금 내용을 기준으로 변경 사항을 다시 비교했어요. 아래 내용을 확인한 뒤 반영해 주세요.'}
            </p>
            <p className="text-xs text-muted-foreground">본문이 바뀌어서 선택을 처음부터 다시 해야 해요.</p>
          </div>
        </div>
      )}

      {pending && view.target.state === 'locked' && (
        <div className="flex gap-3 rounded-xl bg-muted p-4">
          <Lock aria-hidden className="mt-0.5 size-5 shrink-0" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold">잠긴 문서라 반영할 수 없어요</p>
            <p className="break-keep text-sm text-muted-foreground">이 문서는 잠겨 있어서 수정할 수 없어요. 문서 잠금을 푼 뒤 다시 열어 주세요.</p>
          </div>
        </div>
      )}

      {pending && view.target.state === 'missing' && (
        <div className="flex gap-3 rounded-xl bg-muted p-4">
          <AlertCircle aria-hidden className="mt-0.5 size-5 shrink-0" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold">{isChapter ? '삭제된 회차라 반영할 수 없어요' : '삭제된 문서라 반영할 수 없어요'}</p>
            <p className="break-keep text-sm text-muted-foreground">
              {isChapter ? '이 제안이 가리키는 회차가 삭제됐어요. 제안을 거절해서 정리해 주세요.' : '이 제안이 가리키는 설정집 문서가 삭제됐어요. 제안을 거절해서 정리해 주세요.'}
            </p>
          </div>
        </div>
      )}

      {isCreate ? (
        <CreateBody
          view={view} pending={pending} folderId={folderId} onFolder={setFolderId} disabled={busy !== null}
          savedFolderName={outcome?.kind === 'accepted' ? outcome.folderName : null}
        />
      ) : view.target.state === 'missing' || view.hunks.length === 0 ? (
        <section aria-label={labels.draft} className="flex flex-col gap-2">
          {pending && view.target.state === 'ok' && (
            <p className="break-keep text-sm">반영할 수 있는 부분이 없어요. {isChapter ? '회차 본문이' : '설정집 문서가'} 많이 바뀌었어요. AI에게 현재 본문을 기준으로 초안을 다시 요청해 주세요.</p>
          )}
          <p className="text-xs font-semibold text-muted-foreground">{labels.draft}</p>
          <div className="whitespace-pre-wrap break-words rounded-xl border-l-4 border-foreground/40 bg-background p-4 text-sm leading-7">{view.draft}</div>
        </section>
      ) : (
        <>
          {pending && !blocked && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="min-h-11 flex-1 sm:flex-none" disabled={busy !== null || selectable.length === 0} onClick={() => setSelected(selectAll(view.hunks))}>전체 선택</Button>
                <Button type="button" variant="outline" className="min-h-11 flex-1 sm:flex-none" disabled={busy !== null || chosen.length === 0} onClick={() => setSelected([])}>전체 해제</Button>
              </div>
              <p role="status" className="text-sm font-semibold tabular-nums">{selectionStatus(chosen.length, selectable.length)}</p>
            </div>
          )}
          {pending && !blocked && selectable.length === 0 && (
            <p className="break-keep text-sm">반영할 수 있는 부분이 없어요. {isChapter ? '회차 본문이' : '설정집 문서가'} 많이 바뀌었어요. AI에게 현재 본문을 기준으로 초안을 다시 요청해 주세요.</p>
          )}
          <ol aria-label="변경 목록" className="flex flex-col gap-4">
            {view.hunks.map((h) => (
              <ChunkRow
                key={h.index}
                hunk={h}
                labels={labels}
                mode={pending ? (blocked ? 'blocked' : 'select') : 'readonly'}
                checked={chosen.includes(h.index)}
                onToggle={() => setSelected((s) => toggleSelection(s, h.index, view.hunks))}
                editing={!!editing[h.index]}
                onToggleEdit={() => setEditing((e) => ({ ...e, [h.index]: !e[h.index] }))}
                value={edits[h.index] ?? h.after}
                onEdit={(text) => setEdits((e) => ({ ...e, [h.index]: text }))}
                onResetEdit={() => setEdits((e) => { const next = { ...e }; delete next[h.index]; return next; })}
                edited={isEdited(h, edits)}
                expanded={!!expanded[h.index]}
                onToggleExpand={() => setExpanded((x) => ({ ...x, [h.index]: !x[h.index] }))}
                disabled={busy !== null}
                decision={decision && (status === 'accepted' || status === 'reverted')
                  ? { accepted: decision.acceptedIndexes.includes(h.index), edited: decision.editedIndexes.includes(h.index) }
                  : null}
              />
            ))}
          </ol>
        </>
      )}

      {showBar && (
        <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-3 border-t border-border bg-card px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:-mx-8 md:flex-row md:items-center md:px-8">
          <div className="flex flex-col gap-1">
            {isCreate ? (
              !folder && <p className="text-xs text-muted-foreground">저장할 폴더를 골라 주세요.</p>
            ) : (
              <>
                <p className="text-sm font-semibold tabular-nums">선택한 변경 {chosen.length}개</p>
                <p className="text-xs text-muted-foreground">
                  {chosen.length === 0 && !blocked ? '반영할 부분을 하나 이상 골라 주세요. ' : ''}체크하지 않은 변경은 반영되지 않아요.
                </p>
              </>
            )}
          </div>
          <div className="flex flex-col-reverse gap-2 md:ml-auto md:flex-row">
            <Button ref={rejectTriggerRef} type="button" variant="outline" className="min-h-11 w-full md:w-auto" disabled={busy !== null} onClick={() => setDialog('reject')}>이 제안 거절하기</Button>
            <Button
              ref={acceptTriggerRef}
              type="button"
              className="min-h-11 w-full md:w-auto"
              disabled={busy !== null || blocked || (isCreate ? !folder : chosen.length === 0)}
              onClick={() => setDialog('accept')}
            >
              {isCreate ? '설정집에 저장하기' : `선택한 ${chosen.length}개 반영하기`}
            </Button>
          </div>
        </div>
      )}

      {pending && (<Dialog open={dialog === 'accept'} onOpenChange={closeDialog}>
        <DialogContent initialFocus={cancelRef} finalFocus={finalFocus} showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{isCreate ? '설정집에 새 문서를 저장할까요?' : `선택한 ${chosen.length}개를 본문에 반영할까요?`}</DialogTitle>
          </DialogHeader>
          <DialogDescription className="flex flex-col gap-2">
            <span className="block">
              {isCreate
                ? `${folder ? folderOptionLabel(folder, folders?.root.name ?? '') : ''} 폴더에 새 문서 ${titleText}을(를) 만들어요.`
                : isChapter
                  ? `${titleText}의 본문이 바뀌어요. 선택하지 않은 ${unselected}개는 지금 본문 그대로 남아요.`
                  : `설정집 문서 ${titleText}의 내용이 바뀌어요. 선택하지 않은 ${unselected}개는 지금 내용 그대로 남아요.`}
            </span>
            <span className="block text-xs">반영한 뒤에는 한 번 되돌릴 수 있어요. 되돌리기는 이 제안 화면에서 할 수 있어요.</span>
          </DialogDescription>
          {busy === 'accept' && <p role="status" className="text-sm">반영하는 중…</p>}
          <DialogFooter>
            <DialogClose render={<Button ref={cancelRef} type="button" variant="outline" className="min-h-11" disabled={busy !== null}>취소</Button>} />
            <Button type="button" className="min-h-11" disabled={busy !== null} onClick={accept}>반영하기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>)}

      {pending && (<Dialog open={dialog === 'reject'} onOpenChange={closeDialog}>
        <DialogContent initialFocus={cancelRef} finalFocus={rejectTriggerRef} showCloseButton={false}>
          <DialogHeader><DialogTitle>이 제안을 거절할까요?</DialogTitle></DialogHeader>
          <DialogDescription className="flex flex-col gap-2">
            <span className="block">{isCreate ? '거절하면 이 제안은 더 이상 저장할 수 없어요. 설정집은 바뀌지 않아요.' : '거절하면 이 제안은 더 이상 반영할 수 없어요. 본문은 바뀌지 않아요.'}</span>
            <span className="block">AI에게 새 초안을 다시 요청하면 새 제안이 도착해요.</span>
          </DialogDescription>
          {busy === 'reject' && <p role="status" className="text-sm">거절하는 중…</p>}
          {dialogError && <p role="alert" className="text-sm text-destructive">{dialogError}</p>}
          <DialogFooter>
            <DialogClose render={<Button ref={cancelRef} type="button" variant="outline" className="min-h-11" disabled={busy !== null}>제안 유지하기</Button>} />
            <Button type="button" variant="destructive" className="min-h-11" aria-label={`${cardName} 거절 확인`} disabled={busy !== null} onClick={reject}>거절하기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>)}

      {canRevert && (<Dialog open={dialog === 'revert'} onOpenChange={closeDialog}>
        <DialogContent initialFocus={cancelRef} finalFocus={finalFocus} showCloseButton={false}>
          <DialogHeader><DialogTitle>반영을 되돌릴까요?</DialogTitle></DialogHeader>
          {revertConfirmHash && (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 p-3 text-sm text-destructive">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
              {isChapter ? '반영한 뒤 본문이 다시 바뀌었어요. 되돌리면 그 수정도 사라져요.' : '반영한 뒤 문서가 다시 바뀌었어요. 되돌리면 그 수정도 사라져요.'}
            </p>
          )}
          <DialogDescription className="flex flex-col gap-2">
            <span className="block">
              {isCreate
                ? `저장한 새 문서 ${titleText}을(를) 삭제해요.`
                : isChapter
                  ? `${titleText}의 본문이 이 제안을 반영하기 전 모습으로 돌아가요.`
                  : `${titleText}의 내용이 이 제안을 반영하기 전 모습으로 돌아가요.`}
            </span>
            <span className="block">반영한 뒤에 직접 고친 내용이 있으면 함께 사라질 수 있어요. 되돌리기는 한 번만 할 수 있어요.</span>
          </DialogDescription>
          {busy === 'revert' && <p role="status" className="text-sm">되돌리는 중…</p>}
          {dialogError && <p role="alert" className="text-sm text-destructive">{dialogError}</p>}
          <DialogFooter>
            <DialogClose render={<Button ref={cancelRef} type="button" variant="outline" className="min-h-11" disabled={busy !== null}>닫기</Button>} />
            <Button type="button" variant="destructive" className="min-h-11" disabled={busy !== null} onClick={revert}>반영 되돌리기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>)}
    </div>
  );
}

interface ChunkRowProps {
  hunk: DetailHunk;
  labels: { current: string; draft: string };
  /** select: pending & actionable; blocked: pending but locked/missing; readonly: decided. */
  mode: 'select' | 'blocked' | 'readonly';
  checked: boolean;
  onToggle: () => void;
  editing: boolean;
  onToggleEdit: () => void;
  value: string;
  onEdit: (text: string) => void;
  onResetEdit: () => void;
  edited: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  disabled: boolean;
  decision: { accepted: boolean; edited: boolean } | null;
}

function ChunkRow(props: ChunkRowProps) {
  const { hunk: h, labels, mode, checked, editing, value, edited, expanded, disabled, decision } = props;
  const n = h.index + 1;
  const bodyId = useId();
  const editId = useId();
  const kindLabel = h.applicable ? h.kind : '적용할 수 없음';
  const selectable = mode === 'select' && h.applicable;
  const editable = mode === 'select' && canEditChunk(h);
  const showEditor = editable && editing;
  const hasCurrent = h.currentText !== '';
  const hasDraft = h.kind !== '삭제' && h.after !== '';
  const foldable = isFoldable(h) && !showEditor;
  const clamp = foldable && !expanded ? 'max-md:line-clamp-6' : '';
  const draftText = mode === 'select' && edited ? value : h.after;

  return (
    <li
      aria-label={`${n}번째 변경, ${kindLabel}`}
      className={`flex flex-col overflow-hidden rounded-xl border bg-card ${checked ? 'border-foreground' : 'border-border'}`}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <span className="text-xs text-muted-foreground">{n}번째 변경 · </span>
        <span className={`text-xs font-semibold ${h.applicable ? '' : 'inline-flex items-center gap-1 text-destructive'}`}>
          {!h.applicable && <AlertCircle aria-hidden className="size-3" />}{kindLabel}
        </span>
        {(edited && mode === 'select') || decision?.edited ? <Badge variant="outline" className="font-semibold">직접 고침</Badge> : null}
        <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
          {editable && (
            <Button type="button" variant="outline" className="min-h-11 flex-1 sm:flex-none" aria-expanded={editing} aria-controls={editing ? editId : undefined} disabled={disabled} onClick={props.onToggleEdit}>
              {editing ? '고치기 닫기' : '직접 고치기'}
            </Button>
          )}
          {selectable ? (
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold">
              <input type="checkbox" className="size-5 accent-primary" checked={checked} onChange={props.onToggle} disabled={disabled} aria-describedby={bodyId} />
              <span>{n}번째 변경 반영</span>
              <span className="text-xs font-normal text-muted-foreground">{checked ? '반영함' : '반영 안 함'}</span>
            </label>
          ) : mode !== 'readonly' ? (
            <label className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" className="size-5" checked={false} disabled aria-disabled="true" aria-describedby={bodyId} readOnly />
              <span>{h.applicable ? `${n}번째 변경 반영` : '반영할 수 없어요'}</span>
            </label>
          ) : decision ? (
            <span className="text-xs font-semibold">{decision.accepted ? '반영함' : '반영 안 함'}</span>
          ) : null}
        </div>
      </div>
      {!h.applicable && (
        <p className="px-4 pt-3 text-sm text-destructive">이 부분이 들어갈 자리가 지금 본문에 없어서 반영할 수 없어요.</p>
      )}
      <div id={bodyId} className="grid grid-cols-1 items-start gap-4 p-4 md:grid-cols-2">
        {hasCurrent ? (
          <div className="flex min-w-0 flex-col gap-1 rounded-lg bg-muted p-3">
            <p className="text-xs font-semibold text-muted-foreground">{labels.current}</p>
            <p className={`whitespace-pre-wrap break-words text-sm leading-7 ${h.kind === '삭제' && h.applicable ? 'line-through decoration-muted-foreground' : ''} ${clamp}`}>{h.currentText}</p>
          </div>
        ) : (
          <p className="hidden text-sm text-muted-foreground md:block">이 위치에는 문단이 없어요.</p>
        )}
        {hasDraft ? (
          <div className="flex min-w-0 flex-col gap-1 border-l-4 border-foreground/40 pl-3">
            <p className="text-xs font-semibold text-muted-foreground">{labels.draft}</p>
            {showEditor ? (
              <div id={editId} className="flex flex-col gap-2">
                <label htmlFor={`${editId}-text`} className="text-xs font-semibold text-muted-foreground">반영할 내용을 직접 고쳐요</label>
                <Textarea id={`${editId}-text`} rows={5} value={value} disabled={disabled} onChange={(e) => props.onEdit(e.target.value)} className="min-h-28 text-sm leading-7" />
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <p className="text-xs text-muted-foreground">고친 내용이 AI 초안 대신 본문에 들어가요.</p>
                  <Button type="button" variant="outline" className="min-h-11 sm:ml-auto" disabled={disabled || !edited} onClick={props.onResetEdit}>AI 초안으로 되돌리기</Button>
                </div>
              </div>
            ) : (
              <p className={`whitespace-pre-wrap break-words text-sm leading-7 ${clamp}`}>{draftText}</p>
            )}
          </div>
        ) : (
          <p className="hidden border-l-4 border-foreground/40 pl-3 text-sm text-muted-foreground md:block">이 문단을 지우자는 제안이에요.</p>
        )}
      </div>
      {foldable && (
        <Button type="button" variant="ghost" className="mx-4 mb-3 min-h-11 self-start underline md:hidden motion-reduce:transition-none" aria-expanded={expanded} aria-controls={bodyId} onClick={props.onToggleExpand}>
          {expanded ? '접기' : '전체 보기'}
        </Button>
      )}
    </li>
  );
}

function CreateBody({ view, pending, folderId, onFolder, disabled, savedFolderName }: {
  view: ProposalDetail; pending: boolean; folderId: string | null; onFolder: (id: string) => void; disabled: boolean; savedFolderName: string | null;
}) {
  const legendId = useId();
  const folders = view.folders?.status === 'ok' ? view.folders : null;
  const category = view.proposedCategory ?? '-';
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-5">
      <section aria-labelledby={`${legendId}-content`} className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4 md:col-span-3 md:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">카테고리</span>
          <Badge variant="outline">{category}</Badge>
          <span className="text-xs text-muted-foreground">AI가 정한 카테고리예요.</span>
        </div>
        <h2 id={`${legendId}-content`} className="text-lg font-semibold">AI가 제안한 내용</h2>
        <div className="whitespace-pre-wrap break-words border-l-4 border-foreground/40 pl-3 text-sm leading-7">{view.draft}</div>
      </section>
      {pending ? (
        <section className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4 md:col-span-2 md:p-6">
          {folders ? (
            <fieldset className="flex flex-col gap-2" disabled={disabled}>
              <legend id={legendId} className="mb-2 text-lg font-semibold">저장할 폴더</legend>
              <p className="break-keep text-xs text-muted-foreground">이 카테고리({category})의 폴더 중에서 골라 주세요. 고르기 전에는 저장되지 않아요.</p>
              {folders.candidates.map((c) => (
                <label
                  key={c.id}
                  className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 text-sm ${folderId === c.id ? 'border-foreground font-semibold' : 'border-border'}`}
                >
                  <input type="radio" name={`folder-${view.id}`} className="size-5 accent-primary" value={c.id} checked={folderId === c.id} onChange={() => onFolder(c.id)} />
                  <span className="min-w-0 break-all">{folderOptionLabel(c, folders.root.name)}</span>
                  {c.isRoot && <span className="ml-auto text-xs font-normal text-muted-foreground">최상위</span>}
                </label>
              ))}
            </fieldset>
          ) : (
            <div className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold">저장할 폴더</h2>
              <p className="break-keep text-sm">이 카테고리에 저장할 수 있는 폴더가 없어요. 설정집에서 폴더를 먼저 만든 뒤 다시 열어 주세요.</p>
              <Link href={`/studio/${view.workId}`} className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-semibold hover:bg-muted sm:w-auto sm:self-start">설정집 열기</Link>
            </div>
          )}
        </section>
      ) : savedFolderName ? (
        <p className="text-sm text-muted-foreground md:col-span-2">저장한 폴더: {savedFolderName}</p>
      ) : null}
    </div>
  );
}
