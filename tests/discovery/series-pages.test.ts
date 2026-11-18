(globalThis as { self?: unknown }).self ??= globalThis;
import { readFileSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pathname: '/series/free',
  search: '',
  push: vi.fn(),
  refresh: vi.fn(),
  user: null as { id: string; email: string } | null,
  rawWorks: [] as Array<Record<string, unknown>>,
  likeRows: [] as Array<{ work_id: string }>,
  worksError: null as { message: string } | null,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.push,
    refresh: mocks.refresh,
  }),
  usePathname: () => mocks.pathname,
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

vi.mock('@/components/layout/account-panel', () => ({
  AccountPanel: (p: { displayName: string; balance: number }) =>
    React.createElement('div', { 'data-account': p.displayName, 'data-bal': p.balance }),
}));

vi.mock('@/components/payment/header-token-balance', () => ({
  HeaderTokenBalance: (p: { balance: number; loggedIn: boolean }) =>
    p.loggedIn
      ? React.createElement('div', { 'data-balance': '1' }, p.balance.toLocaleString('ko-KR'))
      : null,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: mocks.user }, error: null }),
    },
    from: (table: string) => {
      if (table === 'works') {
        let genreEq: string | null = null;
        const chain: Record<string, unknown> = {
          select: () => chain,
          is: () => chain,
          eq: (col: string, val: unknown) => {
            if (col === 'genre' && typeof val === 'string') {
              genreEq = val;
            }
            return chain;
          },
          order: () => chain,
          range: async (from: number, to: number) => {
            if (mocks.worksError) {
              return { data: null, error: mocks.worksError };
            }
            const filtered = genreEq
              ? mocks.rawWorks.filter((w) => w.genre === genreEq)
              : mocks.rawWorks;
            return {
              data: filtered.slice(from, to + 1),
              error: null,
            };
          },
        };
        return chain;
      }
      if (table === 'work_likes') {
        const chain: Record<string, unknown> = {
          select: () => chain,
          in: async (_col: string, ids: string[]) => ({
            data: mocks.likeRows.filter((r) => ids.includes(r.work_id)),
            error: null,
          }),
        };
        return chain;
      }
      const profileChain: Record<string, unknown> = {
        select: () => profileChain,
        eq: () => profileChain,
        maybeSingle: async () => ({
          data: { role: 'reader', pen_name: null, balance: 0 },
          error: null,
        }),
      };
      return profileChain;
    },
  }),
}));

import FreeSeriesPage from '@/app/series/free/page';
import PaidSeriesPage from '@/app/series/paid/page';
import SeriesLoading from '@/app/series/loading';
import {
  FIRST_ROW_PRIORITY_COUNT,
  SERIES_PAGE_COPY,
  SeriesListContent,
  buildSeriesHref,
  normalizeSeriesSearchParams,
} from '@/app/series/series-list-content';

const NOW = new Date('2026-11-13T12:00:00.000Z');

function makeFreeWork(index: number, overrides: Record<string, unknown> = {}) {
  const num = String(index).padStart(3, '0');
  const day = String(((index - 1) % 28) + 1).padStart(2, '0');
  return {
    id: `free-${num}`,
    title: `무료 작품 ${num}`,
    cover_image_url: `https://example.com/free-${num}.jpg`,
    genre: '판타지',
    serial_status: 'ongoing',
    profiles: { pen_name: `작가${num}` },
    chapters: [
      {
        order_index: 0,
        is_published: true,
        deleted_at: null,
        published_at: `2026-10-${day}T00:00:00.000Z`,
        price_tier: null,
        view_count: index * 10,
      },
    ],
    ...overrides,
  };
}

function makePaidWork(
  index: number,
  tiers: Array<number | null>,
  overrides: Record<string, unknown> = {},
) {
  const num = String(index).padStart(3, '0');
  return {
    id: `paid-${num}`,
    title: `유료 작품 ${num}`,
    cover_image_url: `https://example.com/paid-${num}.jpg`,
    genre: '로맨스판타지',
    serial_status: 'ongoing',
    profiles: { pen_name: `유료작가${num}` },
    chapters: tiers.map((tier, idx) => ({
      order_index: idx,
      is_published: true,
      deleted_at: null,
      published_at: `2026-11-${String(idx + 1).padStart(2, '0')}T00:00:00.000Z`,
      price_tier: tier,
      view_count: 50,
    })),
    ...overrides,
  };
}

beforeEach(() => {
  mocks.pathname = '/series/free';
  mocks.search = '';
  mocks.push.mockReset();
  mocks.refresh.mockReset();
  mocks.user = null;
  mocks.rawWorks = [];
  mocks.likeRows = [];
  mocks.worksError = null;
});

describe('Phase 21-04 route files & reuse boundary hygiene (Task 1 & Task 3)', () => {
  it('both /series/free and /series/paid pages declare Promise searchParams and await it', () => {
    const freeSrc = readFileSync(
      path.resolve(process.cwd(), 'app/series/free/page.tsx'),
      'utf8',
    );
    const paidSrc = readFileSync(
      path.resolve(process.cwd(), 'app/series/paid/page.tsx'),
      'utf8',
    );

    expect(freeSrc).toContain('Promise<');
    expect(freeSrc).toContain('await searchParams');
    expect(paidSrc).toContain('Promise<');
    expect(paidSrc).toContain('await searchParams');
  });

  it('keeps Phase 21-specific calculations out of shared SeriesCard, WorkGrid, and ListFilterBar', () => {
    for (const relPath of [
      'components/reader/series-card.tsx',
      'components/reader/work-grid.tsx',
      'components/reader/list-filter-bar.tsx',
    ]) {
      const src = readFileSync(path.resolve(process.cwd(), relPath), 'utf8');
      expect(src).not.toContain('lib/discovery/work-list');
      expect(src).not.toContain('app/series/series-list-content');
      expect(src).not.toContain('NEW_BADGE_DAYS');
      expect(src).not.toContain('computeTrendingScores');
      expect(src).not.toContain('price_tier');
    }
  });

  it('SeriesLoading renders 12 skeleton cards with aria-busy="true"', () => {
    const html = renderToStaticMarkup(React.createElement(SeriesLoading));
    expect(html).toContain('aria-busy="true"');
    expect(html.match(/data-slot="work-grid-skeleton"/g)).toHaveLength(12);
  });
});

describe('normalizeSeriesSearchParams & buildSeriesHref (UI-SPEC §4)', () => {
  it('normalizes unknown genre to 전체, invalid page (0/negative/NaN) to 1, and derives sub default sort', () => {
    expect(
      normalizeSeriesSearchParams({
        sub: 'invalid',
        genre: '존재하지않는장르',
        sort: 'invalid',
        page: '0',
      }),
    ).toEqual({
      sub: 'all',
      genre: '전체',
      sort: 'updated',
      defaultSort: 'updated',
      page: 1,
      hasActiveFilter: false,
    });

    expect(normalizeSeriesSearchParams({ page: '-5' }).page).toBe(1);
    expect(normalizeSeriesSearchParams({ page: 'abc' }).page).toBe(1);

    expect(normalizeSeriesSearchParams({ sub: 'new' })).toEqual({
      sub: 'new',
      genre: '전체',
      sort: 'started',
      defaultSort: 'started',
      page: 1,
      hasActiveFilter: true,
    });

    expect(normalizeSeriesSearchParams({ sub: 'popular' })).toEqual({
      sub: 'popular',
      genre: '전체',
      sort: 'popular',
      defaultSort: 'popular',
      page: 1,
      hasActiveFilter: true,
    });

    expect(
      normalizeSeriesSearchParams({
        sub: 'completed',
        genre: '판타지',
        sort: 'popular',
        page: '3',
      }),
    ).toEqual({
      sub: 'completed',
      genre: '판타지',
      sort: 'popular',
      defaultSort: 'updated',
      page: 3,
      hasActiveFilter: true,
    });
  });

  it('omits default sub=all, genre=전체, sub default sort, and page=1 from built hrefs', () => {
    expect(
      buildSeriesHref('free', { sub: 'all', genre: '전체', sort: 'updated', page: 1 }),
    ).toBe('/series/free');
    expect(
      buildSeriesHref('free', { sub: 'new', genre: '전체', sort: 'started', page: 1 }),
    ).toBe('/series/free?sub=new');
    expect(
      buildSeriesHref('paid', { sub: 'popular', genre: '전체', sort: 'popular', page: 1 }),
    ).toBe('/series/paid?sub=popular');
    expect(
      decodeURIComponent(
        buildSeriesHref('paid', {
          sub: 'completed',
          genre: '로맨스판타지',
          sort: 'popular',
          page: 4,
        }),
      ),
    ).toBe('/series/paid?sub=completed&genre=로맨스판타지&sort=popular&page=4');
  });
});

describe('/series/free and /series/paid SSR assembly (Task 1 & Task 3)', () => {
  it('allows anonymous guest viewing with single h1, approved copy, badges, price labels, and first-6 priority', async () => {
    mocks.user = null;
    mocks.rawWorks = [
      // Completed work started 2 days ago -> '완결' prioritized over 'NEW'
      makeFreeWork(1, {
        title: '완결 우선 작품',
        serial_status: 'completed',
        chapters: [
          {
            order_index: 0,
            is_published: true,
            deleted_at: null,
            published_at: '2026-11-11T00:00:00.000Z',
            price_tier: null,
            view_count: 100,
          },
        ],
      }),
      // Ongoing work started 3 days ago -> 'NEW'
      makeFreeWork(2, {
        title: '신규 시작 작품',
        serial_status: 'ongoing',
        chapters: [
          {
            order_index: 0,
            is_published: true,
            deleted_at: null,
            published_at: '2026-11-10T00:00:00.000Z',
            price_tier: null,
            view_count: 80,
          },
        ],
      }),
      ...Array.from({ length: 6 }, (_, idx) => makeFreeWork(idx + 3)),
      // Paid works should never appear on /series/free
      makePaidWork(1, [null, 30]),
    ];

    const freeTree = await SeriesListContent({
      kind: 'free',
      searchParams: Promise.resolve({}),
      now: NOW,
    });
    const freeHtml = renderToStaticMarkup(freeTree);

    expect(freeHtml.match(/<h1 /g)).toHaveLength(1);
    expect(freeHtml).toContain(SERIES_PAGE_COPY.free.title);
    expect(freeHtml).toContain(SERIES_PAGE_COPY.free.description);
    expect(freeHtml).toContain('최근 회차가 올라온 순서예요.');
    expect(freeHtml).not.toContain('완독률');
    expect(freeHtml).not.toContain('Free Series');

    expect(freeHtml).toContain('완결 우선 작품');
    expect(freeHtml).toContain('신규 시작 작품');
    expect(freeHtml).not.toContain('유료 작품 001');
    expect(freeHtml).toContain('>완결<');
    expect(freeHtml).toContain('>NEW<');
    expect(freeHtml).toContain('>무료<');
    expect(freeHtml).toContain('/login');

    // First 6 cards have loading="eager", remaining 2 cards have loading="lazy"
    expect(freeHtml.match(/loading="eager"/g)).toHaveLength(FIRST_ROW_PRIORITY_COUNT);
    expect(freeHtml.match(/loading="lazy"/g)).toHaveLength(2);

    // /series/paid renders only paid works with "N화부터 유료" and "회차당 N토큰~"
    mocks.pathname = '/series/paid';
    mocks.rawWorks = [
      makeFreeWork(1),
      makePaidWork(1, [null, null, 30], { title: '3화 유료 전환작' }),
      makePaidWork(2, [50, 10, 30], { title: '1화부터 유료작' }),
    ];

    const paidHtml = renderToStaticMarkup(
      await PaidSeriesPage({ searchParams: Promise.resolve({ sub: 'popular' }) }),
    );
    expect(paidHtml.match(/<h1 /g)).toHaveLength(1);
    expect(paidHtml).toContain(SERIES_PAGE_COPY.paid.title);
    expect(paidHtml).toContain(SERIES_PAGE_COPY.paid.description);
    expect(paidHtml).toContain('조회수·좋아요·다음화 이동률을 종합한 순서예요.');
    expect(paidHtml).not.toContain('완독률');
    expect(paidHtml).not.toContain('무료 작품 001');
    expect(paidHtml).toContain('3화부터 유료');
    expect(paidHtml).toContain('회차당 10토큰~');
  });

  it('renders cumulative 24*page SSR items (page=3 -> 72 items), preserves query on next href, and clamps out-of-range page', async () => {
    mocks.rawWorks = Array.from({ length: 80 }, (_, idx) => makeFreeWork(idx + 1));
    mocks.search = 'sub=new&genre=판타지&page=3';

    const page3Html = renderToStaticMarkup(
      await FreeSeriesPage({
        searchParams: Promise.resolve({ sub: 'new', genre: '판타지', page: '3' }),
      }),
    );

    expect(page3Html).toContain('연재를 시작한 날이 가까운 순서예요.');
    expect(page3Html).toContain('작품 80개');
    expect(page3Html.match(/data-slot="series-card"/g)).toHaveLength(72);
    expect(page3Html).toContain('aria-label="작품 더 보기"');

    // Out-of-range page=99 clamps to maxPage=4 (shows all 80 works and hides load more)
    const clampedHtml = renderToStaticMarkup(
      await FreeSeriesPage({
        searchParams: Promise.resolve({ sub: 'new', genre: '판타지', page: '99' }),
      }),
    );
    expect(clampedHtml.match(/data-slot="series-card"/g)).toHaveLength(80);
    expect(clampedHtml).not.toContain('aria-label="작품 더 보기"');
  });

  it('distinguishes unfiltered empty state from filtered empty state with resetHref', async () => {
    mocks.rawWorks = [];

    // 1. Unfiltered 0 works: tab empty copy without reset button
    const unfilteredHtml = renderToStaticMarkup(
      await FreeSeriesPage({ searchParams: Promise.resolve({}) }),
    );
    expect(unfilteredHtml).toContain('아직 연재 중인 작품이 없어요');
    expect(unfilteredHtml).toContain('곧 새로운 작품이 올라와요.');
    expect(unfilteredHtml).not.toContain('필터 초기화');

    // 2. Filtered 0 works: filter empty copy with resetHref="/series/free"
    const filteredHtml = renderToStaticMarkup(
      await FreeSeriesPage({
        searchParams: Promise.resolve({ genre: '무협', sub: 'completed' }),
      }),
    );
    expect(filteredHtml).toContain('조건에 맞는 작품이 없어요');
    expect(filteredHtml).toContain('장르나 정렬 조건을 바꿔 보세요.');
    expect(filteredHtml).toContain('필터 초기화');
    expect(filteredHtml).toContain('href="/series/free"');

    // 3. Paid filtered 0 works: resetHref="/series/paid"
    mocks.pathname = '/series/paid';
    const paidFilteredHtml = renderToStaticMarkup(
      await PaidSeriesPage({
        searchParams: Promise.resolve({ sub: 'completed' }),
      }),
    );
    expect(paidFilteredHtml).toContain('조건에 맞는 작품이 없어요');
    expect(paidFilteredHtml).toContain('href="/series/paid"');
  });

  it('renders UI-SPEC §5 error state while keeping the filter bar when listWorkSeries fails', async () => {
    mocks.worksError = { message: 'database unavailable' };

    const errorHtml = renderToStaticMarkup(
      await FreeSeriesPage({
        searchParams: Promise.resolve({ genre: '판타지' }),
      }),
    );

    expect(errorHtml).toContain('무료연재');
    expect(errorHtml).toContain('data-slot="list-filter-bar"');
    expect(errorHtml).toContain('role="alert"');
    expect(errorHtml).toContain('목록을 불러오지 못했어요');
    expect(errorHtml).toContain('잠시 후 다시 시도해 주세요.');
    expect(errorHtml).toContain('다시 불러오기');
  });
});
