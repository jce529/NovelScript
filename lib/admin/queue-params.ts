import { REPORT_STATUSES, type ReportStatus } from '@/lib/admin/types';

/**
 * Queue URL state for /admin (D-16, D-20). Pure and shared by the queue and detail pages
 * so a detail page can rebuild the exact queue it was opened from. Only known values are
 * accepted; anything else falls back to the default open queue, so the return link can
 * never point outside /admin.
 */

export type AdminQueueTab = 'reports' | 'reviews';

export interface AdminQueueState {
  tab: AdminQueueTab;
  status: ReportStatus;
  page: number;
}

type RawParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

export function parseQueueParams(params: RawParams): AdminQueueState {
  const tab: AdminQueueTab = first(params.tab) === 'reviews' ? 'reviews' : 'reports';
  const rawStatus = first(params.status);
  const status = (REPORT_STATUSES as readonly string[]).includes(rawStatus ?? '')
    ? (rawStatus as ReportStatus)
    : 'open';
  const rawPage = Number(first(params.page));
  const page = Number.isInteger(rawPage) && rawPage >= 1 && rawPage <= 10_000 ? rawPage : 1;
  return { tab, status, page };
}

/** Query string for a queue state; defaults are omitted to keep URLs stable. */
export function queueQuery(state: AdminQueueState): string {
  const search = new URLSearchParams();
  if (state.tab !== 'reports') search.set('tab', state.tab);
  if (state.tab === 'reports' && state.status !== 'open') search.set('status', state.status);
  if (state.page !== 1) search.set('page', String(state.page));
  const query = search.toString();
  return query ? `?${query}` : '';
}

export function queueHref(state: AdminQueueState): string {
  return `/admin${queueQuery(state)}`;
}
