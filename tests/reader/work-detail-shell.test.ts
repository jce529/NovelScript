import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const m = vi.hoisted(() => ({ work: vi.fn(), chapters: vi.fn(), progress: vi.fn(), viewRows: vi.fn() }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND'); }, useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => {
      const q: Record<string, unknown> = {};
      q.select = () => q; q.eq = () => q; q.is = () => Promise.resolve({ data: m.viewRows() });
      return q;
    },
  }),
}));
vi.mock('@/lib/works/actions', () => ({ getPublicWork: m.work }));
vi.mock('@/lib/chapters/actions', () => ({ listPublicChapters: m.chapters }));
vi.mock('@/lib/reader/subscriptions', () => ({ getSubscriptionState: async () => false }));
vi.mock('@/lib/reader/bookmarks', () => ({ getBookmarkState: async () => false }));
vi.mock('@/lib/reader/progress', () => ({ getReadingProgress: m.progress }));
vi.mock('@/lib/reader/likes', () => ({ getLikeState: async () => false, getLikeCount: async () => 5 }));
vi.mock('@/app/works/[workId]/actions', () => ({ submitReportAction: vi.fn(), toggleSubscriptionAction: vi.fn(), toggleBookmarkAction: vi.fn(), toggleLikeAction: vi.fn() }));
vi.mock('@/components/layout/site-header', () => ({ SiteHeader: () => React.createElement('header', { 'data-site-header': '1' }) }));
vi.mock('@/components/reader/work-header-actions', () => ({ WorkHeaderActions: () => React.createElement('div', { 'data-header-actions': '1' }) }));
vi.mock('@/components/reader/like-button', () => ({ LikeButton: () => React.createElement('button', { 'data-like': '1' }) }));
vi.mock('@/components/reader/report-dialog', () => ({ ReportDialog: () => React.createElement('button', { 'data-report-dialog': '1' }, '신고') }));

import WorkDetailPage from '@/app/works/[workId]/page';

const chapter = (i: number) => ({ id: `c${i}`, title: `제${i}`, orderIndex: i, priceTier: null, locked: false, state: 'readable', blinded: false, entitled: false, blindReason: null });
const render = async () => renderToStaticMarkup(await WorkDetailPage({ params: Promise.resolve({ workId: 'w1' }) }));
const setup = (over: Record<string, unknown> = {}, nChapters = 12) => {
  m.work.mockResolvedValue({ id: 'w1', title: '작품', synopsis: '줄거리', genre: '판타지', blinded: false, blindReason: null, ...over });
  m.chapters.mockResolvedValue(Array.from({ length: nChapters }, (_, i) => chapter(i)));
  m.progress.mockResolvedValue(null);
  m.viewRows.mockReturnValue([{ view_count: 10 }, { view_count: 32 }]);
};

describe('work detail shell', () => {
  it('renders four tab triggers in order', async () => {
    setup();
    const html = await render();
    const labels = ['소개', '회차', '세계관', '리뷰'];
    const idx = labels.map((l) => html.indexOf(`>${l}</button>`));
    expect(idx.every((i) => i >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });
  it('shows null stats as 집계 중 and sums public view metadata', async () => {
    setup();
    const html = await render();
    expect(html).toContain('연독률 집계 중');
    expect(html).toContain('완독률 집계 중');
    expect(html).not.toMatch(/(연독률|완독률) ?\d/);
    expect(html).toContain('<dd>42</dd>');
  });
  it('places a single report outside the tabs, before them', async () => {
    setup();
    const html = await render();
    expect(html.match(/data-report-dialog/g)).toHaveLength(1);
    expect(html.indexOf('data-report-dialog')).toBeLessThan(html.indexOf('role="tablist"'));
    expect(html).toContain('불일치·표절 신고');
    expect(html).toContain('aria-label="신고"');
  });
  it('hides the global header on mobile only and keeps header actions', async () => {
    setup();
    const html = await render();
    expect(html).toContain('hidden md:block');
    expect(html).toContain('data-header-actions');
    expect(html).toContain('검색 (준비 중)');
  });
  it('blinded work shows no synopsis, TOC, or purchase/read CTA', async () => {
    setup({ blinded: true, blindReason: '검토 중' });
    const html = await render();
    expect(html).not.toContain('줄거리');
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain('읽기 시작');
    expect(html).not.toContain('data-report-dialog');
  });
});
