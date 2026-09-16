import { listReportGroups, listReviewRequests } from '@/lib/admin/queries';
import { requireAdminPage } from '@/lib/admin/auth';
import { parseQueueParams } from '@/lib/admin/queue-params';
import type { AdminErrorCode } from '@/lib/admin/types';
import { notFound } from 'next/navigation';
import { QueueTabs, ReportQueue, ReviewQueue } from '@/components/admin/report-queue';

/** Load failures go to app/admin/error.tsx (retry); denial is indistinguishable from 404. */
function failLoad(error: AdminErrorCode): never {
  if (error === 'not_found') notFound();
  throw new Error('admin_queue_unavailable');
}

export default async function AdminQueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage();
  const state = parseQueueParams(await searchParams);

  if (state.tab === 'reviews') {
    const result = await listReviewRequests({ status: 'open', page: state.page });
    if (!result.ok) failLoad(result.error);
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold">신고 관리</h1>
        <QueueTabs state={state} />
        <ReviewQueue state={state} page={result.data} />
      </div>
    );
  }

  const result = await listReportGroups({ status: state.status, page: state.page });
  if (!result.ok) failLoad(result.error);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">신고 관리</h1>
      <QueueTabs state={state} />
      <ReportQueue state={state} page={result.data} />
    </div>
  );
}
