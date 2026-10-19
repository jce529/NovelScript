import {
  getUserSanctionHistory,
  listReportGroups,
  listReviewRequests,
  listSanctionUsers,
} from '@/lib/admin/queries';
import { SanctionHistory } from '@/components/admin/sanction-history';
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

  if (state.tab === 'sanctions') {
    const users = await listSanctionUsers({ page: state.page });
    if (!users.ok) failLoad(users.error);
    // Only a user on the current list page is selectable; anything else gets a notice.
    const selected = state.userId
      ? users.data.items.find((user) => user.userId.toLowerCase() === state.userId)
      : undefined;
    let history = null;
    if (selected) {
      const loaded = await getUserSanctionHistory({ userId: selected.userId, page: state.historyPage ?? 1 });
      if (!loaded.ok) failLoad(loaded.error);
      history = loaded.data;
    }
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold">신고 관리</h1>
        <QueueTabs state={state} />
        <SanctionHistory state={state} users={users.data} history={history} />
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
