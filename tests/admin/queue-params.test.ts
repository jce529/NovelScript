import { describe, expect, it } from 'vitest';
import { REPORT_STATUSES, SANCTION_KINDS } from '../../lib/admin/types';
import { parseQueueParams, queueHref } from '../../lib/admin/queue-params';

const uid = '10000000-0000-4000-8000-000000000001';
const roundTrip = (href: string) =>
  parseQueueParams(Object.fromEntries(new URLSearchParams(href.split('?')[1] ?? '')));

describe('queue URL state: all filter and sanctions tab', () => {
  it('keeps DB tuples free of all', () => {
    expect(REPORT_STATUSES).toEqual(['open', 'resolved', 'dismissed']);
    expect(SANCTION_KINDS).not.toContain('all');
  });

  it('round trips status=all', () => {
    const state = parseQueueParams({ status: 'all', page: '2' });
    expect(state).toMatchObject({ tab: 'reports', status: 'all', page: 2 });
    expect(queueHref(state)).toBe('/admin?status=all&page=2');
    expect(roundTrip(queueHref(state))).toEqual(state);
  });

  it('round trips sanctions user and both page axes', () => {
    const state = parseQueueParams({ tab: 'sanctions', user: uid, historyPage: '3', page: '2' });
    expect(state).toMatchObject({ tab: 'sanctions', userId: uid, historyPage: 3, page: 2 });
    expect(queueHref(state)).toBe(`/admin?tab=sanctions&page=2&user=${uid}&historyPage=3`);
    expect(roundTrip(queueHref(state))).toEqual(state);
  });

  it('drops invalid uuid and out-of-range history pages', () => {
    const state = parseQueueParams({ tab: 'sanctions', user: 'not-a-uuid', historyPage: '3' });
    expect(state.userId).toBeUndefined();
    expect(state.historyPage).toBeUndefined();
    expect(queueHref(state)).toBe('/admin?tab=sanctions');
    const bad = parseQueueParams({ tab: 'sanctions', user: uid, historyPage: '99999' });
    expect(bad.userId).toBe(uid);
    expect(bad.historyPage).toBeUndefined();
    expect(queueHref(parseQueueParams({ tab: 'sanctions', user: 'https://evil.example' }))).toBe('/admin?tab=sanctions');
  });

  it('ignores user/historyPage/status outside their tabs', () => {
    expect(queueHref(parseQueueParams({ tab: 'reports', user: uid, historyPage: '2' }))).toBe('/admin');
    expect(queueHref(parseQueueParams({ tab: 'sanctions', status: 'all' }))).toBe('/admin?tab=sanctions');
    expect(queueHref(parseQueueParams({ tab: 'reviews', status: 'resolved' }))).toBe('/admin?tab=reviews');
  });

  it('keeps legacy defaults', () => {
    expect(parseQueueParams({})).toEqual({ tab: 'reports', status: 'open', page: 1 });
    expect(queueHref(parseQueueParams({ status: 'dismissed', page: '3' }))).toBe('/admin?status=dismissed&page=3');
  });
});
