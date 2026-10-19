import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));

import { QueueTabs, ReportQueue } from '@/components/admin/report-queue';
import {
  SanctionHistory,
  SanctionTimeline,
  groupSanctionTimeline,
  sanctionUserName,
} from '@/components/admin/sanction-history';
import { parseQueueParams } from '@/lib/admin/queue-params';
import type {
  AdminPage,
  AdminSanctionHistoryEntry,
  AdminSanctionUserSummary,
  ReportGroupSummary,
} from '@/lib/admin/types';

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const U3 = '33333333-3333-4333-8333-333333333333';

const render = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node);
const pageOf = <T>(items: T[], extra: Partial<AdminPage<T>> = {}): AdminPage<T> => ({
  items,
  page: 1,
  pageSize: 25,
  totalCount: items.length,
  hasNext: false,
  ...extra,
});

function group(over: Partial<ReportGroupSummary> = {}): ReportGroupSummary {
  return {
    target: { type: 'work', workId: 'w1', chapterId: null },
    workTitle: '작품 제목',
    chapterTitle: null,
    coverImageUrl: null,
    reportCount: 3,
    reporterCount: 2,
    categories: ['스팸'],
    oldestReportedAt: '2026-10-01T00:00:00.000Z',
    status: 'open',
    statuses: ['open'],
    blinded: false,
    anchorReportId: 'r1',
    ...over,
  };
}

function user(over: Partial<AdminSanctionUserSummary> = {}): AdminSanctionUserSummary {
  return {
    userId: U1,
    role: 'writer',
    penName: '펜네임',
    effectiveSanction: { kind: 'none', sanctionedUntil: null },
    expectedSeq: '7',
    latestAt: '2026-10-01T00:00:00.000Z',
    ...over,
  };
}

function entry(over: Partial<AdminSanctionHistoryEntry> = {}): AdminSanctionHistoryEntry {
  return {
    id: 'e1',
    seq: '1',
    kind: 'warning',
    publicReason: '공개 사유',
    internalNote: '내부 메모',
    endsAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    actorId: null,
    adminActionId: 'a1',
    metadata: {},
    ...over,
  };
}

describe('admin tabs and all-status queue', () => {
  it('links the three non-comment tabs with URL state and no comment tab', () => {
    const html = render(createElement(QueueTabs, { state: parseQueueParams({ tab: 'sanctions' }) }));
    expect(html).toContain('작품·회차 신고');
    expect(html).toContain('작가 재검토');
    expect(html).toContain('제재 이력');
    expect(html).not.toContain('댓글');
    expect(html).toContain('href="/admin?tab=reviews"');
    expect(html).toContain('href="/admin?tab=sanctions"');
    expect(html).toMatch(/aria-current="page"[^>]*>제재 이력/);
  });

  it('renders every status of a mixed group and labels the all filter without a report status', () => {
    const state = parseQueueParams({ status: 'all' });
    const html = render(
      createElement(ReportQueue, {
        state,
        page: pageOf([group({ statuses: ['open', 'resolved', 'dismissed'] })]),
      })
    );
    expect(html).toContain('전체 신고');
    expect(html).toContain('<option value="all"');
    for (const label of ['미처리', '처리 완료', '기각']) expect(html).toContain(label);
    expect(html).toContain('/admin/reports/r1?status=all');
  });

  it('shows the all-filter empty text and keeps the filter in pagination links', () => {
    const state = parseQueueParams({ status: 'all', page: '2' });
    const empty = render(createElement(ReportQueue, { state, page: pageOf<ReportGroupSummary>([], { page: 2 }) }));
    expect(empty).toContain('전체 신고가 없습니다');
    const next = render(
      createElement(ReportQueue, { state, page: pageOf([group()], { page: 2, hasNext: true }) })
    );
    expect(next).toContain('href="/admin?status=all&amp;page=3"');
    expect(next).toContain('href="/admin?status=all"');
  });

  it('falls back to the representative status when statuses is empty', () => {
    const html = render(
      createElement(ReportQueue, { state: parseQueueParams({}), page: pageOf([group({ statuses: [] })]) })
    );
    expect(html).toContain('미처리');
  });
});

describe('sanction history tab', () => {
  const users = pageOf([
    user(),
    user({ userId: U2, role: 'reader', penName: null, effectiveSanction: { kind: 'permanent_suspension', sanctionedUntil: null } }),
    user({
      userId: U3,
      role: 'reader',
      penName: '정지자',
      effectiveSanction: { kind: 'suspension', sanctionedUntil: '2026-12-01T00:00:00.000Z' },
    }),
  ]);

  it('renders reader and writer rows with safe names and current status', () => {
    const html = render(
      createElement(SanctionHistory, { state: parseQueueParams({ tab: 'sanctions' }), users, history: null })
    );
    expect(html).toContain('독자');
    expect(html).toContain('작가');
    expect(html).toContain('펜네임');
    expect(html).toContain(`사용자 ${U2.slice(0, 8)}`);
    expect(html).toContain('영구 정지 중');
    expect(html).toContain('기간 정지 중');
    expect(html).toContain('현재 제재 없음');
    expect(sanctionUserName({ userId: U1, penName: '   ' })).toBe(`사용자 ${U1.slice(0, 8)}`);
  });

  it('renders the empty state', () => {
    const html = render(
      createElement(SanctionHistory, {
        state: parseQueueParams({ tab: 'sanctions' }),
        users: pageOf<AdminSanctionUserSummary>([]),
        history: null,
      })
    );
    expect(html).toContain('제재 이력이 있는 사용자가 없습니다');
  });

  it('selection and history paging are separate URLs; the list page resets the selection', () => {
    const state = parseQueueParams({ tab: 'sanctions', page: '2', user: U1, historyPage: '2' });
    const html = render(
      createElement(SanctionHistory, {
        state,
        users: { ...users, page: 2, hasNext: true },
        history: pageOf([entry()], { page: 2, hasNext: true }),
      })
    );
    expect(html).toContain(`href="/admin?tab=sanctions&amp;page=2&amp;user=${U2}"`);
    // list pagination drops the selection
    expect(html).toContain('href="/admin?tab=sanctions&amp;page=3"');
    expect(html).toContain('href="/admin?tab=sanctions"');
    // history pagination keeps user and list page
    expect(html).toContain(`href="/admin?tab=sanctions&amp;page=2&amp;user=${U1}"`);
    expect(html).toContain(`href="/admin?tab=sanctions&amp;page=2&amp;user=${U1}&amp;historyPage=3"`);
  });

  it('shows a notice when the selected user is not on the list page', () => {
    const html = render(
      createElement(SanctionHistory, {
        state: parseQueueParams({ tab: 'sanctions', user: '44444444-4444-4444-8444-444444444444' }),
        users,
        history: null,
      })
    );
    expect(html).toContain('선택한 사용자가 현재 목록 페이지에 없습니다');
    expect(html).not.toContain('data-current-sanction');
  });

  it('renders warning, suspension, lift entries with long reasons in order', () => {
    const long = '가'.repeat(2000);
    const html = render(
      createElement(SanctionTimeline, {
        entries: [
          entry({ id: 'l', kind: 'lift', createdAt: '2026-10-03T00:00:00.000Z', internalNote: long }),
          entry({ id: 's', kind: 'suspension', endsAt: '2026-10-09T00:00:00.000Z', createdAt: '2026-10-02T00:00:00.000Z' }),
          entry({ id: 'w', kind: 'warning' }),
        ],
      })
    );
    expect(html.indexOf('제재 해제')).toBeLessThan(html.indexOf('기간 정지'));
    expect(html.indexOf('기간 정지')).toBeLessThan(html.indexOf('경고'));
    expect(html).toContain(long);
    expect(html).toContain('[overflow-wrap:anywhere]');
    expect(render(createElement(SanctionTimeline, { entries: [] }))).toContain('제재 이력이 없습니다');
  });

  it('merges a linked lift + suspension into one duration change and keeps audit ids', () => {
    const meta = { operation: 'change_duration', changeId: 'c1', previousEndsAt: '2026-10-05T00:00:00.000Z', newEndsAt: '2026-10-20T00:00:00.000Z' };
    const entries = [
      entry({ id: 'sus', kind: 'suspension', adminActionId: 'act-sus', endsAt: '2026-10-20T00:00:00.000Z', metadata: meta }),
      entry({ id: 'lift', kind: 'lift', adminActionId: 'act-lift', metadata: meta }),
      entry({ id: 'plain', kind: 'warning' }),
    ];
    const items = groupSanctionTimeline(entries);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ type: 'duration_change', newEndsAt: '2026-10-20T00:00:00.000Z' });
    const html = render(createElement(SanctionTimeline, { entries }));
    expect(html).toContain('기간 변경');
    expect(html).toContain('data-audit-id="act-sus"');
    expect(html).toContain('data-audit-id="act-lift"');
    expect(html).toContain('→');
  });

  it('keeps a lone half of a duration change labeled as a change and drops nothing', () => {
    const items = groupSanctionTimeline([
      entry({ id: 'only', kind: 'lift', metadata: { operation: 'change_duration', changeId: 'c9' } }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('duration_change');
    // a plain lift (no duration change metadata) stays a lift
    expect(groupSanctionTimeline([entry({ kind: 'lift', metadata: { operation: 'lift' } })])[0].type).toBe('entry');
  });
});
