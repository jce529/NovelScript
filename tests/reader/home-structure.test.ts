import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const m = vi.hoisted(() => ({ user: vi.fn(), feed: vi.fn(), recent: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: m.user() } }) } }),
}));
vi.mock('@/lib/discovery/actions', () => ({ listFeed: m.feed, FEED_PAGE_SIZE: 12 }));
vi.mock('@/lib/reader/progress', () => ({ listRecentlyRead: m.recent }));
vi.mock('@/components/layout/site-header', () => ({ SiteHeader: () => React.createElement('header') }));
vi.mock('@/components/reader/feed-filters', () => ({ FeedFilters: () => React.createElement('div', { 'data-filters': '1' }) }));

import HomePage from '@/app/page';

const work = (i: number) => ({
  id: `w${i}`, title: `작품${i}`, synopsis: null, genre: '판타지', coverImageUrl: null,
  trendingScore: 77 + i, viewCount: 1000, likeCount: 10, ctr: 0.1,
});
const render = async () => renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }));
const recentItem = { workId: 'w1', workTitle: '작품1', coverImageUrl: null, chapterId: 'c9', chapterTitle: '제9', chapterOrderIndex: 8, chapterBlinded: false, updatedAt: 'x' };

describe('home structure', () => {
  it('logged-in order: 이어 읽기 / 주간 랭킹 / 루키 쿼터존 / 명예의 전당', async () => {
    m.user.mockReturnValue({ id: 'u1' });
    m.feed.mockResolvedValue([work(1), work(2)]);
    m.recent.mockResolvedValue([recentItem]);
    const html = await render();
    const idx = ['이어 읽기', '주간 랭킹', '루키 쿼터존', '명예의 전당'].map((t) => html.indexOf(`>${t}</h2>`));
    expect(idx.every((i) => i >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    expect(html).toContain('href="/works/w1/chapters/c9"');
    expect(html).toContain('인기 78');
    expect(html).toContain('data-slot="tooltip-trigger"'); // tooltip body mounts on hover only
    expect(html).toContain('role="region"');
  });

  it('guest has no 이어 읽기', async () => {
    m.user.mockReturnValue(null);
    m.feed.mockResolvedValue([work(1)]);
    const html = await render();
    expect(html).not.toContain('이어 읽기');
    expect(m.recent).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: null }));
    expect(html.indexOf('>주간 랭킹</h2>')).toBeGreaterThanOrEqual(0);
  });

  it('has no promo banner or fake 더보기, and the banner file is gone', async () => {
    m.user.mockReturnValue(null);
    m.feed.mockResolvedValue(Array.from({ length: 30 }, (_, i) => work(i)));
    const html = await render();
    expect(html).not.toContain('신작 프리미어 위크');
    expect(html).not.toContain('더보기');
    expect(html).not.toContain('limit=');
    expect(existsSync(resolve(process.cwd(), 'components/reader/promo-banner.tsx'))).toBe(false);
  });

  it('shows only 준비 중 notices for 루키 and 명예의 전당, and empty feed message', async () => {
    m.user.mockReturnValue(null);
    m.feed.mockResolvedValue([]);
    const html = await render();
    expect(html).toContain('루키 쿼터존은 준비 중');
    expect(html).toContain('명예의 전당은 준비 중');
    expect(html).toContain('아직 등록된 작품이 없어요');
  });
});
