'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type {
  AdminActionRecord,
  AdminReportItem,
  AdminActionType,
  AdminPage,
  ReportGroupSummary,
  ReportStatus,
  ReviewRequestStatus,
  ReviewRequestSummary,
} from '@/lib/admin/types';
import { queueHref, queueQuery, type AdminQueueState } from '@/lib/admin/queue-params';

/*
 * Admin queue (ADMIN-01, D-16, D-18, D-20). Renders the grouped DTOs from lib/admin/queries.
 * All user-provided text goes through React text nodes; nothing is rendered as HTML.
 */

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  open: '미처리',
  resolved: '처리 완료',
  dismissed: '기각',
};

export const REVIEW_STATUS_LABELS: Record<ReviewRequestStatus, string> = {
  open: '검토 요청됨',
  maintained: '유지',
  unblinded: '블라인드 해제',
};

export const ACTION_TYPE_LABELS: Record<AdminActionType, string> = {
  report_resolve: '신고 처리 완료',
  report_dismiss: '신고 기각',
  work_blind: '작품 블라인드',
  work_unblind: '작품 블라인드 해제',
  chapter_blind: '회차 블라인드',
  chapter_unblind: '회차 블라인드 해제',
  user_warn: '경고',
  user_suspend: '기간 정지',
  user_permanent_suspend: '영구 정지',
  user_sanction_lift: '제재 해제',
  review_maintain: '재검토 유지',
  review_unblind: '재검토 블라인드 해제',
  admin_grant: '관리자 지정',
  admin_revoke: '관리자 해제',
};

/** Local-time timestamp; the ISO value stays in dateTime for machines and tooltips. */
export function LocalTime({ value, withZone = false }: { value: string; withZone?: boolean }) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return <span>-</span>;
  const text = date.toLocaleString('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...(withZone ? { timeZoneName: 'short' as const } : {}),
  });
  return (
    <time dateTime={date.toISOString()} title={date.toISOString()} suppressHydrationWarning>
      {text}
    </time>
  );
}

export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  return <Badge variant={status === 'open' ? 'default' : 'secondary'}>{REPORT_STATUS_LABELS[status]}</Badge>;
}

export function ReviewStatusBadge({ status }: { status: ReviewRequestStatus }) {
  return <Badge variant={status === 'open' ? 'default' : 'secondary'}>{REVIEW_STATUS_LABELS[status]}</Badge>;
}

function TargetLabel({ workTitle, chapterTitle }: { workTitle: string; chapterTitle: string | null }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="font-medium [overflow-wrap:anywhere]">{workTitle}</span>
      <span className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
        {chapterTitle ? `회차 · ${chapterTitle}` : '작품 전체'}
      </span>
    </span>
  );
}

function Cover({ url }: { url: string | null }) {
  return (
    <span className="block h-12 w-8 shrink-0 overflow-hidden rounded-sm bg-muted" aria-hidden="true">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" width={32} height={48} className="h-12 w-8 object-cover" />
      ) : null}
    </span>
  );
}

export function QueueTabs({ state }: { state: AdminQueueState }) {
  const tabs = [
    { tab: 'reports' as const, label: '신고' },
    { tab: 'reviews' as const, label: '재검토 요청' },
  ];
  return (
    <nav aria-label="관리 목록" className="flex gap-1 border-b border-border">
      {tabs.map(({ tab, label }) => {
        const active = state.tab === tab;
        return (
          <Link
            key={tab}
            href={queueHref({ tab, status: 'open', page: 1 })}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px inline-flex min-h-11 items-center border-b-2 px-4 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function StatusSelect({ state }: { state: AdminQueueState }) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="admin-report-status" className="text-sm font-medium">
        상태
      </label>
      <select
        id="admin-report-status"
        value={state.status}
        onChange={(event) =>
          router.push(queueHref({ tab: 'reports', status: event.target.value as ReportStatus, page: 1 }))
        }
        className="h-11 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
      >
        {(Object.keys(REPORT_STATUS_LABELS) as ReportStatus[]).map((status) => (
          <option key={status} value={status}>
            {REPORT_STATUS_LABELS[status]}
          </option>
        ))}
      </select>
    </div>
  );
}

function Pagination({ state, page }: { state: AdminQueueState; page: AdminPage<unknown> }) {
  const hasPrev = state.page > 1;
  const iconClass = cn(buttonVariants({ variant: 'outline', size: 'icon' }), 'size-11');
  return (
    <nav aria-label="페이지" className="flex items-center justify-end gap-2">
      {hasPrev ? (
        <Link href={queueHref({ ...state, page: state.page - 1 })} className={iconClass} aria-label="이전 페이지">
          <ChevronLeft />
        </Link>
      ) : (
        <span className={cn(iconClass, 'pointer-events-none opacity-50')} aria-disabled="true" aria-label="이전 페이지">
          <ChevronLeft />
        </span>
      )}
      <span className="min-w-12 text-center text-sm text-muted-foreground">{state.page} 페이지</span>
      {page.hasNext ? (
        <Link href={queueHref({ ...state, page: state.page + 1 })} className={iconClass} aria-label="다음 페이지">
          <ChevronRight />
        </Link>
      ) : (
        <span className={cn(iconClass, 'pointer-events-none opacity-50')} aria-disabled="true" aria-label="다음 페이지">
          <ChevronRight />
        </span>
      )}
    </nav>
  );
}

function reporterSummary(group: ReportGroupSummary): string {
  return `신고자 ${group.reporterCount}명`;
}

export function ReportQueue({ state, page }: { state: AdminQueueState; page: AdminPage<ReportGroupSummary> }) {
  const returnQuery = queueQuery(state);
  const detailHref = (group: ReportGroupSummary) => `/admin/reports/${group.anchorReportId}${returnQuery}`;

  return (
    <section aria-labelledby="report-queue-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id="report-queue-heading" className="text-xl font-semibold">
          {REPORT_STATUS_LABELS[state.status]} 신고
        </h2>
        <StatusSelect state={state} />
      </div>

      {page.items.length === 0 ? (
        <p className="py-8 text-muted-foreground">
          {state.status === 'open' ? '미처리 신고가 없습니다' : `${REPORT_STATUS_LABELS[state.status]} 신고가 없습니다`}
        </p>
      ) : (
        <>
          {/* >= md: semantic table */}
          <table className="hidden w-full table-fixed border-collapse text-left md:table">
            <thead className="border-b border-border text-sm text-muted-foreground">
              <tr>
                <th scope="col" className="w-[36%] py-2 pr-4 font-medium">대상</th>
                <th scope="col" className="w-[10%] py-2 pr-4 font-medium">신고 수</th>
                <th scope="col" className="w-[20%] py-2 pr-4 font-medium">사유</th>
                <th scope="col" className="w-[16%] py-2 pr-4 font-medium">가장 오래된 신고</th>
                <th scope="col" className="w-[9%] py-2 pr-4 font-medium">상태</th>
                <th scope="col" className="w-[9%] py-2 font-medium">신고자</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((group) => (
                <tr key={`${group.target.workId}:${group.target.chapterId ?? ''}`} className="border-b border-border align-top">
                  <td className="py-3 pr-4">
                    <Link href={detailHref(group)} className="flex min-w-0 gap-3 rounded-sm outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
                      <Cover url={group.coverImageUrl} />
                      <TargetLabel workTitle={group.workTitle} chapterTitle={group.chapterTitle} />
                    </Link>
                    {group.blinded ? <Badge variant="destructive" className="mt-2">블라인드됨</Badge> : null}
                  </td>
                  <td className="py-3 pr-4">{group.reportCount}건</td>
                  <td className="py-3 pr-4 text-sm [overflow-wrap:anywhere]">{group.categories.join(', ')}</td>
                  <td className="py-3 pr-4 text-sm"><LocalTime value={group.oldestReportedAt} /></td>
                  <td className="py-3 pr-4"><ReportStatusBadge status={group.status} /></td>
                  <td className="py-3 text-sm">{reporterSummary(group)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* < md: labeled rows, title first */}
          <ul className="flex flex-col md:hidden">
            {page.items.map((group) => (
              <li key={`${group.target.workId}:${group.target.chapterId ?? ''}`} className="border-b border-border py-4">
                <Link href={detailHref(group)} className="flex min-w-0 gap-3 rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                  <Cover url={group.coverImageUrl} />
                  <TargetLabel workTitle={group.workTitle} chapterTitle={group.chapterTitle} />
                </Link>
                <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
                  <dt className="font-medium text-muted-foreground">신고 수</dt>
                  <dd>{group.reportCount}건 · {reporterSummary(group)}</dd>
                  <dt className="font-medium text-muted-foreground">사유</dt>
                  <dd className="[overflow-wrap:anywhere]">{group.categories.join(', ')}</dd>
                  <dt className="font-medium text-muted-foreground">가장 오래된 신고</dt>
                  <dd><LocalTime value={group.oldestReportedAt} /></dd>
                  <dt className="font-medium text-muted-foreground">상태</dt>
                  <dd className="flex flex-wrap gap-2">
                    <ReportStatusBadge status={group.status} />
                    {group.blinded ? <Badge variant="destructive">블라인드됨</Badge> : null}
                  </dd>
                </dl>
              </li>
            ))}
          </ul>
        </>
      )}

      <Pagination state={state} page={page} />
    </section>
  );
}

export function ReviewQueue({ state, page }: { state: AdminQueueState; page: AdminPage<ReviewRequestSummary> }) {
  const returnQuery = queueQuery(state);
  return (
    <section aria-labelledby="review-queue-heading" className="flex flex-col gap-4">
      <h2 id="review-queue-heading" className="text-xl font-semibold">재검토 요청</h2>
      {page.items.length === 0 ? (
        <p className="py-8 text-muted-foreground">재검토 요청이 없습니다</p>
      ) : (
        <ul className="flex flex-col">
          {page.items.map((request) => (
            <li key={request.id} className="border-b border-border py-4">
              <div className="flex flex-col gap-2 md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)_auto] md:items-start md:gap-4">
                <Link
                  href={`/admin/reviews/${request.id}${returnQuery}`}
                  className="min-w-0 rounded-sm outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <TargetLabel workTitle={request.workTitle} chapterTitle={request.chapterTitle} />
                </Link>
                <p className="line-clamp-3 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
                  <span className="sr-only">요청 내용: </span>
                  {request.message ?? '요청 메시지 없음'}
                </p>
                <p className="text-sm text-muted-foreground">
                  <span className="sr-only">요청 시각: </span>
                  <LocalTime value={request.createdAt} />
                </p>
                <ReviewStatusBadge status={request.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pagination state={state} page={page} />
    </section>
  );
}

/* ---------- Evidence building blocks used by the detail pages ---------- */

export function ReportItemList({
  reports,
  emptyText,
  showTarget = false,
}: {
  reports: AdminReportItem[];
  emptyText: string;
  showTarget?: boolean;
}) {
  if (reports.length === 0) return <p className="text-muted-foreground">{emptyText}</p>;
  return (
    <ul className="flex flex-col">
      {reports.map((report) => (
        <li key={report.id} className="flex flex-col gap-2 border-b border-border py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{report.reasonCategory}</span>
            <ReportStatusBadge status={report.status} />
            {showTarget ? (
              <span className="text-sm text-muted-foreground">
                {report.target.type === 'chapter' ? '회차 신고' : '작품 신고'}
              </span>
            ) : null}
          </div>
          {report.detail ? (
            <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{report.detail}</p>
          ) : (
            <p className="text-sm text-muted-foreground">상세 내용 없음</p>
          )}
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <dt className="font-medium">신고자</dt>
            <dd className="font-mono text-xs [overflow-wrap:anywhere]">{report.reporterId}</dd>
            <dt className="font-medium">신고 시각</dt>
            <dd><LocalTime value={report.createdAt} /></dd>
            {report.resolvedAt ? (
              <>
                <dt className="font-medium">처리 시각</dt>
                <dd><LocalTime value={report.resolvedAt} /></dd>
              </>
            ) : null}
            {report.resolutionNote ? (
              <>
                <dt className="font-medium">처리 메모</dt>
                <dd className="whitespace-pre-wrap [overflow-wrap:anywhere]">{report.resolutionNote}</dd>
              </>
            ) : null}
          </dl>
        </li>
      ))}
    </ul>
  );
}

export function ActionHistoryList({ actions, emptyText }: { actions: AdminActionRecord[]; emptyText: string }) {
  if (actions.length === 0) return <p className="text-muted-foreground">{emptyText}</p>;
  return (
    <ul className="flex flex-col">
      {actions.map((action) => (
        <li key={action.id} className="flex flex-col gap-1 border-b border-border py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{ACTION_TYPE_LABELS[action.actionType]}</span>
            <span className="text-sm text-muted-foreground"><LocalTime value={action.createdAt} /></span>
          </div>
          {action.reason ? (
            <p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
              <span className="font-medium text-muted-foreground">내부 사유 </span>
              {action.reason}
            </p>
          ) : null}
          {action.publicReason ? (
            <p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
              <span className="font-medium text-muted-foreground">공개 사유 </span>
              {action.publicReason}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** Target body as plain selectable text; never parsed as HTML. */
export function TargetBody({ body }: { body: string | null }) {
  if (!body) return <p className="text-muted-foreground">본문이 없습니다</p>;
  return (
    <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-border p-4 text-base leading-relaxed whitespace-pre-wrap select-text [overflow-wrap:anywhere]">
      {body}
    </div>
  );
}
