// Phase 14 (14-11) global review inbox. Server-renderable, no client state: every tab / chip is a
// link and the URL is the state. Rows reuse the work queue card; the only addition is the work
// title. Client and host names are attacker-controlled and only ever rendered as React text.
import Link from 'next/link';
import { AlertCircle, Inbox } from 'lucide-react';
import type { InboxKind, InboxProposal, InboxScope, InboxWork, ProposalFilter } from '@/lib/proposals/queries';
import { ProposalCard } from './proposal-queue';
import { filterTabLabel, QUEUE_FILTERS } from './review-model';
import { INBOX_KINDS, INBOX_KIND_LABEL, countBadgeText, inboxHref, inboxResultStatus } from './inbox-model';

export interface ProposalInboxProps {
  filter: ProposalFilter;
  kind: InboxKind;
  scope: InboxScope;
  pendingTotal: number;
  works: InboxWork[];
  proposals: InboxProposal[];
  now: number;
  loadError: boolean;
  suspended?: boolean;
}

const TAB = 'inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring';
const tabClass = (active: boolean) => `${TAB} ${active ? 'border-foreground bg-foreground text-background' : 'border-border bg-background hover:bg-muted'}`;

export function ProposalInbox({
  filter, kind, scope, pendingTotal, works, proposals, now, loadError, suspended = false,
}: ProposalInboxProps) {
  const scopedWork = works.find((w) => w.id === scope.workId) ?? null;
  const href = (over: { status?: ProposalFilter; kind?: InboxKind; workId?: string | null; chapterId?: string | null }) =>
    inboxHref({ status: filter, kind, workId: scope.workId, chapterId: scope.chapterId, ...over });

  return (
    <div className="flex flex-col gap-6">
      {suspended && (
        <p className="text-xs text-muted-foreground">지금은 계정이 제한되어 새 제안이 오지 않고 수락도 할 수 없어요. 도착한 제안은 볼 수 있어요.</p>
      )}

      <nav aria-label="상태" className="flex flex-wrap gap-2">
        {QUEUE_FILTERS.map((f) => (
          <Link key={f} href={href({ status: f })} aria-current={f === filter ? 'page' : undefined} className={tabClass(f === filter)}>
            {filterTabLabel(f, pendingTotal)}
          </Link>
        ))}
      </nav>
      <nav aria-label="종류" className="flex flex-wrap gap-2">
        {INBOX_KINDS.map((k) => (
          <Link key={k} href={href({ kind: k })} aria-current={k === kind ? 'page' : undefined} className={tabClass(k === kind)}>
            {INBOX_KIND_LABEL[k]}
          </Link>
        ))}
      </nav>

      {works.length > 1 && (
        <nav aria-label="작품" className="flex flex-wrap gap-2">
          <Link href={href({ workId: null, chapterId: null })} aria-current={scope.workId ? undefined : 'page'} className={tabClass(!scope.workId)}>
            모든 작품
          </Link>
          {works.map((w) => (
            <Link
              key={w.id}
              href={href({ workId: w.id, chapterId: null })}
              aria-current={w.id === scope.workId ? 'page' : undefined}
              aria-label={w.pendingCount > 0 ? `${w.title}, 대기 ${w.pendingCount}건` : w.title}
              className={tabClass(w.id === scope.workId)}
            >
              <span className="max-w-48 truncate">{w.title}</span>
              {w.pendingCount > 0 && <span aria-hidden className="ml-2 text-xs">{countBadgeText(w.pendingCount)}</span>}
            </Link>
          ))}
        </nav>
      )}

      {scope.chapterId && (
        <p className="flex flex-wrap items-center gap-3 rounded-md bg-muted px-4 py-2 text-sm">
          <span className="break-keep">{scopedWork ? `${scopedWork.title}의 한 회차에 온 초안만 보는 중` : '한 회차에 온 초안만 보는 중'}</span>
          <Link href={href({ chapterId: null })} className="inline-flex min-h-11 items-center underline underline-offset-4">전체 보기</Link>
        </p>
      )}

      {loadError ? (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/40 p-4 text-sm text-destructive">
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
          제안 목록을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.
        </div>
      ) : (
        <>
          <p role="status" aria-live="polite" className="text-xs text-muted-foreground">{inboxResultStatus(proposals.length)}</p>
          {proposals.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Inbox aria-hidden className="size-6 text-muted-foreground" />
              <h2 className="text-lg font-semibold">{filter === 'pending' ? '검토할 제안이 없어요' : '아직 기록이 없어요'}</h2>
              <p className="max-w-md break-keep text-sm text-muted-foreground">
                연결된 AI가 초안이나 설정집 제안을 보내면 여기에 모여요.
              </p>
              <Link href="/studio/settings/mcp-connections" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">AI 커넥터 관리</Link>
            </div>
          ) : (
            <ul aria-label="제안 목록" className="flex flex-col gap-6">
              {proposals.map((p) => <ProposalCard key={p.id} workId={p.workId} workTitle={p.workTitle} proposal={p} now={now} />)}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
