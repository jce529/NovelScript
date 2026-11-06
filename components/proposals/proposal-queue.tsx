// Phase 14 review queue (MCP-06). Server-renderable: no hooks here; the interactive
// tabs / notice / reload live in queue-client.tsx. Source strings (client name, host)
// are attacker-controlled and only ever rendered as React text.
import Link from 'next/link';
import { AlertCircle, Inbox } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ProposalFilter, ProposalSummary } from '@/lib/proposals/queries';
import { QueueFilterTabs, QueueStatusNotice, ReloadButton } from './queue-client';
import {
  KIND_LABEL, cardSummary, cardTitle, emptyQueueCopy, expiryNotice, formatArrival, isActionable, isMutedStatus,
  reviewHref, statusLabel,
} from './review-model';

export interface ProposalQueueProps {
  workId: string;
  filter: ProposalFilter;
  pendingCount: number;
  proposals: ProposalSummary[];
  /** Render time (ms) used for relative arrival / expiry labels. */
  now: number;
  loadError: boolean;
  suspended?: boolean;
  notice?: 'rejected' | null;
}

export function ProposalStatusBadge({ status, partial = false }: { status: ProposalSummary['status']; partial?: boolean }) {
  if (status === 'pending') return <Badge variant="outline" className="font-semibold">{statusLabel(status)}</Badge>;
  return <Badge variant="secondary" className={isMutedStatus(status) ? 'text-muted-foreground' : undefined}>{statusLabel(status, partial)}</Badge>;
}

function ProposalCard({ workId, proposal, now }: { workId: string; proposal: ProposalSummary; now: number }) {
  const titleId = `proposal-${proposal.id}-title`;
  const title = cardTitle(proposal);
  const actionable = isActionable(proposal.status);
  const expiry = expiryNotice(proposal, now);
  return (
    <li
      aria-labelledby={titleId}
      className={`flex min-w-0 flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-6 ${actionable ? 'border-foreground/60 bg-card' : 'border-border bg-muted/40'}`}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground">{KIND_LABEL[proposal.kind]}</span>
          <ProposalStatusBadge status={proposal.status} />
        </div>
        <h3 id={titleId} className="break-keep text-lg font-semibold leading-tight">{title}</h3>
        <dl className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-6">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <dt className="sr-only">보낸 AI</dt>
            <dd className="min-w-0 break-all text-sm font-semibold text-foreground">{proposal.source.clientName}</dd>
          </div>
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <dt className="sr-only">출처</dt>
            <dd className="min-w-0 break-all">
              {proposal.source.host}
              {proposal.source.disconnected && <span className="ml-2">연결 해제됨</span>}
            </dd>
          </div>
          <div className="flex gap-x-2">
            <dt className="sr-only">도착 시각</dt>
            <dd className="tabular-nums">도착 {formatArrival(proposal.createdAt, now)}</dd>
          </div>
          {expiry && (
            <div className="flex gap-x-2">
              <dt className="sr-only">만료</dt>
              <dd className="tabular-nums">{expiry}</dd>
            </div>
          )}
        </dl>
        <p className="text-sm">{cardSummary(proposal)}</p>
      </div>
      <Link
        href={reviewHref(workId, proposal.id)}
        aria-label={`${title} ${actionable ? '검토하기' : '내용 보기'}`}
        className="inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-semibold outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-auto"
      >
        {actionable ? '검토하기' : '내용 보기'}
      </Link>
    </li>
  );
}

export function ProposalQueue({ workId, filter, pendingCount, proposals, now, loadError, suspended = false, notice = null }: ProposalQueueProps) {
  const empty = emptyQueueCopy(filter);
  return (
    <div className="flex flex-col gap-6">
      {notice === 'rejected' && <QueueStatusNotice message="제안을 거절했어요." />}
      {suspended && (
        <p className="text-xs text-muted-foreground">지금은 계정이 제한되어 AI가 새 제안을 보낼 수 없어요. 이미 도착한 제안은 검토할 수 있어요.</p>
      )}
      <QueueFilterTabs workId={workId} filter={filter} pendingCount={pendingCount} />
      {loadError ? (
        <div role="alert" className="flex flex-col gap-4 rounded-xl border border-destructive/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-sm text-destructive">
            <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
            제안 목록을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.
          </p>
          <ReloadButton />
        </div>
      ) : proposals.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <Inbox aria-hidden className="size-6 text-muted-foreground" />
          <h2 className="text-lg font-semibold">{empty.heading}</h2>
          <p className="max-w-md break-keep text-sm text-muted-foreground">{empty.body}</p>
          {empty.showConnectorLink && (
            <Link href="/studio/settings/mcp-connections" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">AI 커넥터 관리</Link>
          )}
        </div>
      ) : (
        <ul aria-label="제안 목록" className="flex flex-col gap-6">
          {proposals.map((p) => <ProposalCard key={p.id} workId={workId} proposal={p} now={now} />)}
        </ul>
      )}
    </div>
  );
}
