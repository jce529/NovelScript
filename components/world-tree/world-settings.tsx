'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  deleteBranchAction,
  getBranchEligibilityAction,
  getReaderPreviewAction,
  markBranchNoticeReadAction,
} from '@/app/studio/[workId]/world/actions';
import { BRANCH_FLOW_COPY, eligibilityGate, type EligibilityView, type EraOption } from '@/lib/world-tree/branch-flow';
import type { WorldTreeOwnerState } from '@/lib/world-tree/owner';
import type { BranchKind, ChildBranchKind, OwnerTreeNode, ReaderWorldTreeProjection } from '@/lib/world-tree/types';
import { BranchWizard, EligibilityPanel, eligibilityViewFromSection } from './branch-wizard';

/**
 * Minimal world settings for one owned work (18-09, UI-SPEC §5 / mockup board 40).
 *
 * - Visibility = the work's own publish state only. There is no connection toggle and no
 *   per-document switch (READ-06 / WTREE-09 are out of scope); the publish button only links to
 *   the existing chapter publish settings.
 * - Eligibility summary, start button, timeline link, author/reader preview, snapshot notices and
 *   the delete restriction (from the DB child count in the owner state).
 * - The reader preview is a fresh server reader projection (get_world_tree p_reader_preview),
 *   never a client-side filter of the owner tree.
 * - Notice read marks are a separate action; a failure keeps the unread state and any open edit.
 */

export interface WorldSettingsProps {
  ownerState: WorldTreeOwnerState;
  /** Optional owner tree visual (e.g. 18-10 WorldTreeView) rendered in the author view. */
  ownerTreeSlot?: ReactNode;
  /** Validated server draft to resume the wizard with (18-11 ?draft= query). */
  resumeDraft?: { draftWorkId: string; kind: ChildBranchKind; requestId: string } | null;
  /** Timeline editor route (18-08). */
  timelineHref?: string;
  /** Existing chapter/work publish settings. */
  publishHref?: string;
}

const KIND_TEXT: Record<BranchKind, string> = { trunk: '본가지', if: 'If 가지', expand: '확장 가지' };
const SNAPSHOT_NOTE = '분기 시점 스냅샷으로 고정돼요. 원작 설정이 바뀌어도 이 가지에는 반영되지 않아요.';
const OWNER_PRIVATE_NOTE = '독자에게는 이 자리가 ‘부러진 가지’로 보여요. 다시 발행하면 가지가 이어져요.';

type ReaderPreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'unavailable' }
  | { status: 'ok'; projection: ReaderWorldTreeProjection };

export function WorldSettings({ ownerState, ownerTreeSlot, resumeDraft = null, timelineHref, publishHref }: WorldSettingsProps) {
  const router = useRouter();
  const workId = ownerState.work.id;
  const branch = ownerState.branch;

  const [eligibility, setEligibility] = useState<EligibilityView>(() => eligibilityViewFromSection(ownerState.eligibility));
  const [eligibilityBusy, setEligibilityBusy] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(resumeDraft !== null);
  const [view, setView] = useState<'owner' | 'reader'>('owner');
  const [preview, setPreview] = useState<ReaderPreviewState>({ status: 'idle' });
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const [noticeError, setNoticeError] = useState<string | null>(null);
  const [noticeBusy, setNoticeBusy] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const eraOptions = useMemo<EraOption[]>(
    () =>
      (ownerState.timeline?.baseline.eras ?? [])
        .filter((era) => era.deletedAt === null)
        .sort((a, b) => a.position - b.position)
        .map((era) => ({ id: era.id, label: era.yearLabel ? `${era.name} · ${era.yearLabel}` : era.name })),
    [ownerState.timeline],
  );

  const gate = eligibilityGate(eligibility);
  const isDraftWork = ownerState.draft !== null;

  async function refreshEligibility() {
    setEligibilityBusy(true);
    setEligibility({ status: 'loading' });
    try {
      const result = await getBranchEligibilityAction(workId);
      setEligibility(result.ok ? { status: 'ok', summary: result.eligibility } : { status: 'error', message: BRANCH_FLOW_COPY.eligibilityUnavailable });
    } catch {
      setEligibility({ status: 'error', message: BRANCH_FLOW_COPY.eligibilityUnavailable });
    } finally {
      setEligibilityBusy(false);
    }
  }

  async function showReaderPreview() {
    setView('reader');
    setPreview({ status: 'loading' });
    try {
      const result = await getReaderPreviewAction(workId);
      if (!result.ok) setPreview({ status: 'error', message: result.error });
      else if (result.status === 'unavailable') setPreview({ status: 'unavailable' });
      else setPreview({ status: 'ok', projection: result.projection });
    } catch {
      setPreview({ status: 'error', message: '세계수를 불러오지 못했어요. 다시 시도해 주세요.' });
    }
  }

  async function markRead(noticeId: string) {
    setNoticeBusy(noticeId);
    setNoticeError(null);
    try {
      const result = await markBranchNoticeReadAction(workId, noticeId);
      if (result.ok) setReadIds((prev) => new Set(prev).add(noticeId));
      else setNoticeError(result.error);
    } catch {
      setNoticeError('알림을 읽음으로 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setNoticeBusy(null);
    }
  }

  async function confirmDelete() {
    if (!branch || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const result = await deleteBranchAction(workId, branch.id);
      if (result.ok) {
        setDeleteOpen(false);
        router.push('/studio');
      } else {
        setDeleteError(result.error);
      }
    } catch {
      setDeleteError('지금은 가지를 처리할 수 없어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setDeleteBusy(false);
    }
  }

  if (wizardOpen) {
    return (
      <BranchWizard
        sourceWorkId={workId}
        sourceTitle={ownerState.work.title}
        eligibility={ownerState.eligibility}
        eraOptions={eraOptions}
        draft={resumeDraft}
        onClose={() => setWizardOpen(false)}
      />
    );
  }

  const unreadNotices = ownerState.notices.filter((n) => !n.read && !readIds.has(n.id));
  const showDelete = branch !== null && branch.kind !== 'trunk';
  const deleteBlocked = !ownerState.deletion.canDelete;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold">{ownerState.work.title} 세계관 설정</h1>
        <p className="text-sm text-muted-foreground">가지 치기 조건·연표·세계수 보기를 관리해요.</p>
      </header>

      {/* Visibility: publish state only */}
      <section aria-labelledby="world-visibility" className="rounded-xl border bg-card p-4">
        <h2 id="world-visibility" className="text-sm font-semibold">
          공개 상태
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          작품의 발행 상태만 독자 공개를 정해요. 첫 회차를 발행하면 세계수에 보이고, 작품을 비공개로 돌리면 독자에게는 작품 정보 없는
          ‘부러진 가지’로 보여요.
        </p>
        <Link href={publishHref ?? `/studio/${workId}/chapters`} className={cn(buttonVariants({ variant: 'outline' }), 'mt-3 min-h-11')}>
          발행 설정으로 이동
        </Link>
      </section>

      {/* Branching */}
      <section aria-labelledby="world-branching" className="space-y-3">
        <h2 id="world-branching" className="text-sm font-semibold">
          가지 치기
        </h2>
        {isDraftWork && ownerState.draft ? (
          <div className="rounded-xl border bg-muted/40 p-4 text-sm">
            <p>이 작품은 아직 확정하지 않은 가지 초안이에요.</p>
            <Link
              href={`/studio/${ownerState.draft.sourceWorkId}/world?draft=${ownerState.draft.draftWorkId}`}
              className={cn(buttonVariants({ variant: 'outline' }), 'mt-3 min-h-11')}
            >
              가지 치기 이어서 하기
            </Link>
          </div>
        ) : (
          <>
            <EligibilityPanel view={eligibility} onRetry={() => void refreshEligibility()} retrying={eligibilityBusy} />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" onClick={() => setWizardOpen(true)} disabled={!gate.allowed} aria-describedby="world-branch-start-reason">
                이 세계관에서 가지 치기
              </Button>
              {!gate.allowed && eligibility.status !== 'loading' ? (
                <p id="world-branch-start-reason" className="text-xs text-muted-foreground">
                  {gate.reason === 'unmet' ? BRANCH_FLOW_COPY.ineligible : gate.message}
                </p>
              ) : null}
            </div>
          </>
        )}
      </section>

      {/* Timeline */}
      <section aria-labelledby="world-timeline" className="rounded-xl border bg-card p-4">
        <h2 id="world-timeline" className="text-sm font-semibold">
          세계관 연표
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">시대 구간과 작품(열매) 위치를 정해요.</p>
        <Link href={timelineHref ?? `/studio/${workId}/world/timeline`} className={cn(buttonVariants({ variant: 'outline' }), 'mt-3 min-h-11')}>
          연표 편집
        </Link>
      </section>

      {/* Snapshot + notices */}
      {branch && branch.kind !== 'trunk' ? (
        <section aria-labelledby="world-snapshot" className="space-y-2 rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="world-snapshot" className="text-sm font-semibold">
              {KIND_TEXT[branch.kind]}
            </h2>
            {branch.status === 'confirmed' ? <Badge variant="secondary">스냅샷 고정</Badge> : <Badge variant="outline">가지 초안</Badge>}
          </div>
          {branch.status === 'confirmed' ? <p className="text-sm text-muted-foreground">{SNAPSHOT_NOTE}</p> : null}
        </section>
      ) : null}

      {ownerState.notices.length > 0 ? (
        <section aria-labelledby="world-notices" className="space-y-2">
          <h2 id="world-notices" className="text-sm font-semibold">
            원본 변경 알림 {unreadNotices.length > 0 ? <Badge>{`안 읽음 ${unreadNotices.length}`}</Badge> : null}
          </h2>
          {noticeError ? (
            <p role="alert" className="text-sm text-destructive">
              {noticeError}
            </p>
          ) : null}
          <ul className="divide-y rounded-xl border">
            {ownerState.notices.map((notice) => {
              const read = notice.read || readIds.has(notice.id);
              return (
                <li key={notice.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <span className="flex-1">{notice.message}</span>
                  {read ? (
                    <Badge variant="outline">읽음</Badge>
                  ) : (
                    <Button type="button" variant="ghost" size="sm" disabled={noticeBusy === notice.id} onClick={() => void markRead(notice.id)}>
                      읽음으로 표시
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* Author / reader view. An injected tree view (18-11 WorldTreeView) owns its own
          author/reader switch and server reader preview, so only one switch is shown. */}
      {ownerTreeSlot ? (
        <section aria-labelledby="world-preview" className="space-y-3">
          <h2 id="world-preview" className="text-sm font-semibold">
            세계수 보기
          </h2>
          {ownerTreeSlot}
        </section>
      ) : (
      <section aria-labelledby="world-preview" className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="world-preview" className="text-sm font-semibold">
            세계수 보기
          </h2>
          <div role="group" aria-label="보기 전환" className="flex gap-1">
            <Button type="button" size="sm" variant={view === 'owner' ? 'default' : 'outline'} aria-pressed={view === 'owner'} onClick={() => setView('owner')}>
              {ownerState.tree.status === 'ok' && ownerState.tree.mode === 'admin' ? '관리자 전체 보기' : '작가 보기'}
            </Button>
            <Button type="button" size="sm" variant={view === 'reader' ? 'default' : 'outline'} aria-pressed={view === 'reader'} onClick={() => void showReaderPreview()}>
              독자 보기
            </Button>
          </div>
        </div>
        {view === 'owner' ? <OwnerView state={ownerState} /> : <ReaderPreview preview={preview} onRetry={() => void showReaderPreview()} />}
      </section>
      )}

      {/* Delete restriction (WTREE-10) */}
      {showDelete ? (
        <section aria-labelledby="world-delete" className="rounded-xl border border-destructive/30 p-4">
          <h2 id="world-delete" className="text-sm font-semibold">
            가지 삭제
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="destructive"
              disabled={deleteBlocked}
              title={deleteBlocked && ownerState.deletion.message ? ownerState.deletion.message : undefined}
              aria-describedby="world-delete-reason"
              onClick={() => {
                setDeleteError(null);
                setDeleteOpen(true);
              }}
            >
              이 가지 삭제
            </Button>
            {deleteBlocked ? (
              <p id="world-delete-reason" className="text-xs text-muted-foreground">
                {ownerState.deletion.reason === 'has_children' ? '하위 가지를 먼저 정리해 주세요.' : ownerState.deletion.message}
              </p>
            ) : null}
          </div>
          <Dialog open={deleteOpen} onOpenChange={(open) => !deleteBusy && setDeleteOpen(open)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>이 가지를 삭제할까요?</DialogTitle>
                <DialogDescription>삭제한 가지는 세계수에서 사라져요. 하위 가지가 있으면 삭제할 수 없어요.</DialogDescription>
              </DialogHeader>
              {deleteError ? (
                <p role="alert" className="text-sm text-destructive">
                  {deleteError}
                </p>
              ) : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleteBusy}>
                  취소
                </Button>
                <Button type="button" variant="destructive" onClick={() => void confirmDelete()} disabled={deleteBusy}>
                  {deleteBusy ? '삭제하는 중…' : '삭제'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </section>
      ) : null}
    </div>
  );
}

function ownerChips(node: OwnerTreeNode): string[] {
  const chips = [KIND_TEXT[node.kind]];
  if (node.status === 'draft') chips.push('가지 초안');
  else if (!node.isPublished) chips.push('초안');
  else if (!node.readerVisible) chips.push('비공개');
  return chips;
}

function OwnerView({ state, slot }: { state: WorldTreeOwnerState; slot?: ReactNode }) {
  if (slot) return <>{slot}</>;
  const tree = state.tree;
  if (tree.status === 'unavailable') return <p className="text-sm text-muted-foreground">아직 세계수가 없어요.</p>;
  if (tree.status === 'error') return <p className="text-sm text-destructive">{tree.error}</p>;
  const branches = tree.projection.branches;
  if (branches.length <= 1) return <p className="text-sm text-muted-foreground">아직 갈라진 가지가 없어요</p>;
  return (
    <ul className="divide-y rounded-xl border">
      {branches.map((node) => (
        <li key={node.branchId} className="space-y-1 px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{node.title}</span>
            {ownerChips(node).map((chip) => (
              <Badge key={chip} variant="secondary">
                {chip}
              </Badge>
            ))}
          </div>
          {node.status === 'confirmed' && !node.readerVisible ? <p className="text-xs text-muted-foreground">{OWNER_PRIVATE_NOTE}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function ReaderPreview({ preview, onRetry }: { preview: ReaderPreviewState; onRetry: () => void }) {
  if (preview.status === 'idle' || preview.status === 'loading') {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        독자 보기를 불러오는 중이에요.
      </p>
    );
  }
  if (preview.status === 'error') {
    return (
      <div role="status" className="space-y-2">
        <p className="text-sm text-destructive">세계수를 불러오지 못했어요. 다시 시도해 주세요.</p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          다시 불러오기
        </Button>
      </div>
    );
  }
  if (preview.status === 'unavailable') return <p className="text-sm text-muted-foreground">아직 발행된 작품이 없어요.</p>;
  const { projection } = preview;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">독자에게 어떻게 보이는지 확인해요.</p>
      <p className="text-sm font-semibold">{projection.header.title} 세계수</p>
      <ul className="divide-y rounded-xl border">
        {projection.nodes.map((node) =>
          node.nodeType === 'broken' ? (
            <li key={node.nodeKey} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
              <span>비공개된 본작 자리</span>
              <Badge variant="outline">부러진 가지</Badge>
            </li>
          ) : (
            <li key={node.nodeKey} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <span className="font-semibold">{node.title}</span>
              <Badge variant="secondary">{KIND_TEXT[node.kind]}</Badge>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
