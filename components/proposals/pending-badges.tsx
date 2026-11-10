import Link from 'next/link';
import { Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { queueHref, reviewHref } from './review-model';

/**
 * Phase 14 (MCP-07) pending-proposal entry points: studio home card badge, work
 * sidebar link and the one-line notice above the chapter / document editors.
 * Pure presentation; counts come from the owner-scoped lib/proposals/queries
 * helpers. Zero (or invalid) counts render nothing, never an empty row.
 */

const isShown = (count: number) => Number.isInteger(count) && count > 0;

export const pendingBadgeLabel = (count: number) => `대기 ${count}건`;
export const sidebarCountLabel = (count: number) => (count > 99 ? '99+' : String(count));
export const homeBadgeAriaLabel = (workTitle: string, count: number) => `${workTitle} 리뷰 큐, 대기 ${count}건`;
export const sidebarAriaLabel = (count: number) => (isShown(count) ? `리뷰 큐, 대기 ${count}건` : '리뷰 큐');

/** One pending proposal -> its detail; several -> the work queue. */
export function targetReviewHref(workId: string, proposalIds: string[]): string {
  return proposalIds.length === 1 ? reviewHref(workId, proposalIds[0]) : queueHref(workId, 'pending');
}

/** Studio home: a separate row under the card link (never nested inside it). */
export function PendingProposalBadge({ workId, workTitle, count }: { workId: string; workTitle: string; count: number }) {
  if (!isShown(count)) return null;
  return (
    <p className="mt-2">
      <Link
        href={queueHref(workId, 'pending')}
        aria-label={homeBadgeAriaLabel(workTitle, count)}
        className="inline-flex min-h-11 items-center"
      >
        <Badge variant="outline" className="font-semibold">{pendingBadgeLabel(count)}</Badge>
      </Link>
    </p>
  );
}

/** Work sidebar `리뷰 큐` row; the count badge is omitted at 0. */
export function ReviewQueueNavLink({ workId, count }: { workId: string; count: number }) {
  return (
    <div className="flex h-8 items-center max-lg:h-10" style={{ paddingLeft: 28 }}>
      <Link
        href={queueHref(workId, 'pending')}
        aria-label={sidebarAriaLabel(count)}
        className="flex min-w-0 flex-1 items-center gap-2 pr-2 text-sm font-medium hover:text-foreground"
      >
        <span className="truncate">리뷰 큐</span>
        {isShown(count) && (
          <span aria-hidden className="ml-auto shrink-0 rounded bg-background px-1.5 text-xs font-semibold">
            {sidebarCountLabel(count)}
          </span>
        )}
      </Link>
    </div>
  );
}

/** Static one-liner above the editor (no overlay). `subject` is `회차` or `문서`. */
export function PendingTargetLine({
  workId, subject, count, proposalIds,
}: { workId: string; subject: '회차' | '문서'; count: number; proposalIds: string[] }) {
  if (!isShown(count)) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <Info aria-hidden className="size-3.5 shrink-0" />
      <span>{`이 ${subject}에 대기 제안 ${count}건`}</span>
      <Link href={targetReviewHref(workId, proposalIds)} className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-2">
        검토하기
      </Link>
    </p>
  );
}
