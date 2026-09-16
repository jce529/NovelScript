import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireAdminPage } from '@/lib/admin/auth';
import { getReviewRequestDetail } from '@/lib/admin/queries';
import { parseQueueParams, queueHref } from '@/lib/admin/queue-params';
import { Badge } from '@/components/ui/badge';
import {
  ActionHistoryList,
  LocalTime,
  ReviewStatusBadge,
  TargetBody,
} from '@/components/admin/report-queue';
import { ReviewDecisionForm } from '@/components/admin/moderation-form';

export default async function AdminReviewDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ requestId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage();
  const [{ requestId }, query] = await Promise.all([params, searchParams]);
  const back = queueHref({ ...parseQueueParams(query), tab: 'reviews' });

  const result = await getReviewRequestDetail(requestId);
  if (!result.ok) {
    if (result.error === 'unavailable') throw new Error('admin_review_unavailable');
    notFound();
  }
  const request = result.data;
  const targetName = request.chapterTitle ? `${request.workTitle} · ${request.chapterTitle}` : request.workTitle;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={back}
        className="inline-flex min-h-11 w-fit items-center gap-1 rounded-sm text-sm font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        재검토 요청 목록
      </Link>

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{request.target.type === 'chapter' ? '회차' : '작품'}</Badge>
          <ReviewStatusBadge status={request.status} />
          {request.blinded ? <Badge variant="destructive">블라인드됨</Badge> : null}
        </div>
        <h1 className="text-2xl font-semibold [overflow-wrap:anywhere]">{targetName}</h1>
        {request.publicBlindReason ? (
          <p className="text-sm [overflow-wrap:anywhere]">
            <span className="font-medium text-muted-foreground">공개 블라인드 사유 </span>
            {request.publicBlindReason}
          </p>
        ) : null}
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <div className="flex min-w-0 flex-col gap-8">
          <section aria-labelledby="request-heading" className="flex flex-col gap-2">
            <h2 id="request-heading" className="text-xl font-semibold">작가 요청</h2>
            <p className="text-sm text-muted-foreground">
              요청 시각 <LocalTime value={request.createdAt} />
            </p>
            {request.message ? (
              <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{request.message}</p>
            ) : (
              <p className="text-muted-foreground">요청 메시지 없음</p>
            )}
            {request.resolutionNote ? (
              <p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
                <span className="font-medium text-muted-foreground">처리 메모 </span>
                {request.resolutionNote}
              </p>
            ) : null}
          </section>

          <section aria-labelledby="body-heading" className="flex flex-col gap-2">
            <h2 id="body-heading" className="text-xl font-semibold">
              {request.target.type === 'chapter' ? '회차 본문' : '작품 소개'}
            </h2>
            <TargetBody body={request.targetBody} />
          </section>

          <section aria-labelledby="actions-heading" className="flex flex-col gap-2">
            <h2 id="actions-heading" className="text-xl font-semibold">이전 조치</h2>
            <ActionHistoryList actions={request.targetActionHistory} emptyText="이전 조치가 없습니다" />
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-8 lg:sticky lg:top-20 lg:self-start">
          {request.status === 'open' ? (
            <ReviewDecisionForm key={request.targetVersion} requestId={request.id} targetVersion={request.targetVersion} />
          ) : (
            <p className="text-muted-foreground">
              처리된 요청입니다{request.resolvedAt ? ' · ' : ''}
              {request.resolvedAt ? <LocalTime value={request.resolvedAt} /> : null}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
