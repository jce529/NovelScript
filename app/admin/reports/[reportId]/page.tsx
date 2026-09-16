import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireAdminPage } from '@/lib/admin/auth';
import { getReportDetail } from '@/lib/admin/queries';
import { parseQueueParams, queueHref } from '@/lib/admin/queue-params';
import { Badge } from '@/components/ui/badge';
import {
  ActionHistoryList,
  ReportItemList,
  TargetBody,
} from '@/components/admin/report-queue';
import { ReportModerationForm, UnblindForm } from '@/components/admin/moderation-form';

export default async function AdminReportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ reportId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage();
  const [{ reportId }, query] = await Promise.all([params, searchParams]);
  const back = queueHref({ ...parseQueueParams(query), tab: 'reports' });

  const result = await getReportDetail(reportId);
  if (!result.ok) {
    if (result.error === 'unavailable') throw new Error('admin_report_unavailable');
    notFound();
  }
  const detail = result.data;
  const targetName = detail.chapterTitle ? `${detail.workTitle} · ${detail.chapterTitle}` : detail.workTitle;
  const authorName = detail.authorPenName ?? detail.authorId;
  const reviewedIds = new Set(detail.reviewedReportIds);
  const otherAuthorReports = detail.authorReportHistory.filter(
    (report) => !detail.reports.some((current) => current.id === report.id)
  );

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={back}
        className="inline-flex min-h-11 w-fit items-center gap-1 rounded-sm text-sm font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        신고 목록
      </Link>

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{detail.target.type === 'chapter' ? '회차' : '작품'}</Badge>
          {detail.blinded ? <Badge variant="destructive">블라인드됨</Badge> : null}
        </div>
        <h1 className="text-2xl font-semibold [overflow-wrap:anywhere]">{targetName}</h1>
        <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">작가: {authorName}</p>
        {detail.blinded && detail.publicBlindReason ? (
          <p className="text-sm [overflow-wrap:anywhere]">
            <span className="font-medium text-muted-foreground">공개 블라인드 사유 </span>
            {detail.publicBlindReason}
          </p>
        ) : null}
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <div className="flex min-w-0 flex-col gap-8">
          <section aria-labelledby="reports-heading" className="flex flex-col gap-2">
            <h2 id="reports-heading" className="text-xl font-semibold">
              신고 내역 <span className="text-base font-normal text-muted-foreground">{detail.reports.length}건</span>
            </h2>
            <ReportItemList reports={detail.reports} emptyText="신고가 없습니다" />
          </section>

          <section aria-labelledby="body-heading" className="flex flex-col gap-2">
            <h2 id="body-heading" className="text-xl font-semibold">
              {detail.target.type === 'chapter' ? '회차 본문' : '작품 소개'}
            </h2>
            <TargetBody body={detail.targetBody} />
          </section>

          <section aria-labelledby="author-history-heading" className="flex flex-col gap-4">
            <h2 id="author-history-heading" className="text-xl font-semibold">작가 이력</h2>
            <div className="flex flex-col gap-2">
              <h3 className="text-base font-semibold">다른 신고</h3>
              <ReportItemList reports={otherAuthorReports} emptyText="다른 신고가 없습니다" showTarget />
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="text-base font-semibold">과거 조치</h3>
              <ActionHistoryList actions={detail.authorActionHistory} emptyText="과거 조치가 없습니다" />
            </div>
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-8 lg:sticky lg:top-20 lg:self-start">
          {reviewedIds.size > 0 ? (
            <ReportModerationForm
              key={`${detail.targetVersion}:${detail.reviewedReportIds.join(',')}`}
              workId={detail.target.workId}
              chapterId={detail.target.chapterId}
              reportIds={detail.reviewedReportIds}
              targetVersion={detail.targetVersion}
              targetName={targetName}
              authorName={authorName}
            />
          ) : (
            <p className="text-muted-foreground">미처리 신고가 없습니다</p>
          )}
          {detail.blinded ? (
            <UnblindForm
              key={`unblind:${detail.targetVersion}`}
              workId={detail.target.workId}
              chapterId={detail.target.chapterId}
              targetVersion={detail.targetVersion}
            />
          ) : null}
        </aside>
      </div>
    </div>
  );
}
