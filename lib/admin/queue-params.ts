import { REPORT_QUEUE_FILTERS, type ReportQueueFilter } from '@/lib/admin/types';

/**
 * Queue URL state for /admin (D-16, D-20). Pure and shared by the queue and detail pages
 * so a detail page can rebuild the exact queue it was opened from. Only known values are
 * accepted; anything else falls back to the default open queue, so the return link can
 * never point outside /admin.
 */

export type AdminQueueTab = 'reports' | 'reviews' | 'sanctions';

export interface AdminQueueState {
  tab: AdminQueueTab;
  /** DB status or the read-only "all" view. Meaningful on the reports tab only. */
  status: ReportQueueFilter;
  /** List page (reports/reviews queue page, or sanction user list page). */
  page: number;
  /** Selected sanction user (sanctions tab only). */
  userId?: string;
  /** Sanction history page for the selected user, independent of the list page. */
  historyPage?: number;
}

type RawParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function pageOf(raw: string | undefined): number | undefined {
  const n = Number(raw);
  return raw !== undefined && Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : undefined;
}

export function parseQueueParams(params: RawParams): AdminQueueState {
  const rawTab = first(params.tab);
  const tab: AdminQueueTab = rawTab === 'reviews' || rawTab === 'sanctions' ? rawTab : 'reports';
  const rawStatus = first(params.status) ?? '';
  const status: ReportQueueFilter =
    tab === 'reports' && (REPORT_QUEUE_FILTERS as readonly string[]).includes(rawStatus)
      ? (rawStatus as ReportQueueFilter)
      : 'open';
  const state: AdminQueueState = { tab, status, page: pageOf(first(params.page)) ?? 1 };
  if (tab === 'sanctions') {
    const user = first(params.user);
    if (user && UUID.test(user)) {
      state.userId = user.toLowerCase();
      const historyPage = pageOf(first(params.historyPage));
      if (historyPage !== undefined) state.historyPage = historyPage;
    }
  }
  return state;
}

/** Query string for a queue state; defaults are omitted to keep URLs stable. */
export function queueQuery(state: AdminQueueState): string {
  const search = new URLSearchParams();
  if (state.tab !== 'reports') search.set('tab', state.tab);
  if (state.tab === 'reports' && state.status !== 'open') search.set('status', state.status);
  if (state.page !== 1) search.set('page', String(state.page));
  if (state.tab === 'sanctions' && state.userId && UUID.test(state.userId)) {
    search.set('user', state.userId);
    if (state.historyPage && state.historyPage !== 1) search.set('historyPage', String(state.historyPage));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

export function queueHref(state: AdminQueueState): string {
  return `/admin${queueQuery(state)}`;
}
