/* eslint-disable react/no-children-prop */
(globalThis as { self?: unknown }).self ??= globalThis;
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GENRES } from '@/lib/works/genres';

const navMock = vi.hoisted(() => ({
  pathname: '/series/free',
  search: '',
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: navMock.push,
    refresh: navMock.refresh,
  }),
  usePathname: () => navMock.pathname,
  useSearchParams: () => new URLSearchParams(navMock.search),
}));

import {
  SeriesCard,
  type SeriesCardProps,
  type SeriesCardWork,
} from '@/components/reader/series-card';
import {
  WorkGrid,
  type WorkGridEmptyState,
  type WorkGridProps,
} from '@/components/reader/work-grid';
import {
  ListFilterBar,
  type ListFilterBarProps,
} from '@/components/reader/list-filter-bar';

type WalkElement = {
  type?: unknown;
  props?: Record<string, unknown>;
};

function walkAll(
  node: unknown,
  predicate: (el: WalkElement) => boolean,
  acc: WalkElement[] = [],
): WalkElement[] {
  if (!node || typeof node !== 'object') return acc;
  if (Array.isArray(node)) {
    for (const item of node) {
      walkAll(item, predicate, acc);
    }
    return acc;
  }
  const el = node as WalkElement;
  if (predicate(el)) {
    acc.push(el);
  }
  if (el.props && 'children' in el.props) {
    walkAll(el.props.children, predicate, acc);
  }
  return acc;
}

function captureTree<P extends object>(
  Component: (props: P) => React.ReactElement | null,
  props: P,
): { html: string; tree: React.ReactElement | null } {
  let captured: React.ReactElement | null = null;
  const Wrapper = () => {
    captured = Component(props);
    return captured;
  };
  const html = renderToStaticMarkup(React.createElement(Wrapper));
  return { html, tree: captured };
}

function createStatefulHarness() {
  const cells: unknown[] = [];
  const refs: Array<{ current: unknown }> = [];
  let pendingEffects: Array<() => void | (() => void)> = [];
  const cleanups: Array<(() => void) | void> = [];

  const renderWithHooks = <P extends object>(
    Component: (props: P) => React.ReactElement | null,
    props: P,
  ) => {
    let stateIdx = 0;
    let refIdx = 0;
    pendingEffects = [];

    const useStateSpy = vi.spyOn(React, 'useState').mockImplementation(((
      init?: unknown,
    ) => {
      const idx = stateIdx++;
      if (!(idx in cells)) {
        cells[idx] = typeof init === 'function' ? (init as () => unknown)() : init;
      }
      const setState = (next: unknown) => {
        cells[idx] =
          typeof next === 'function'
            ? (next as (prev: unknown) => unknown)(cells[idx])
            : next;
      };
      return [cells[idx], setState];
    }) as typeof React.useState);

    const useRefSpy = vi.spyOn(React, 'useRef').mockImplementation(((
      init?: unknown,
    ) => {
      const idx = refIdx++;
      if (!refs[idx]) {
        refs[idx] = { current: init };
      }
      return refs[idx];
    }) as typeof React.useRef);

    const useEffectSpy = vi.spyOn(React, 'useEffect').mockImplementation(((
      effect: () => void | (() => void),
    ) => {
      pendingEffects.push(effect);
    }) as typeof React.useEffect);

    try {
      const result = captureTree(Component, props);
      return result;
    } finally {
      useStateSpy.mockRestore();
      useRefSpy.mockRestore();
      useEffectSpy.mockRestore();
    }
  };

  const flushEffects = () => {
    while (cleanups.length > 0) {
      const fn = cleanups.pop();
      if (typeof fn === 'function') fn();
    }
    for (const effect of pendingEffects) {
      const cleanup = effect();
      cleanups.push(cleanup);
    }
    pendingEffects = [];
  };

  return { renderWithHooks, flushEffects };
}

const sampleWork: SeriesCardWork = {
  id: 'work-101',
  title: '달빛 서고의 기록자',
  coverImageUrl: 'https://example.com/cover.jpg',
  authorName: '은하수',
  genre: '판타지',
  publishedChapterCount: 18,
};

beforeEach(() => {
  navMock.pathname = '/series/free';
  navMock.search = '';
  navMock.push.mockReset();
  navMock.refresh.mockReset();
});

describe('Phase 21-03 component boundary hygiene', () => {
  it('SeriesCard does not import work-list or reference Phase 21 calculation symbols', () => {
    const src = readFileSync(
      path.resolve(process.cwd(), 'components/reader/series-card.tsx'),
      'utf8',
    );
    expect(src).not.toContain('lib/discovery/work-list');
    expect(src).not.toContain('computeTrendingScores');
    expect(src).not.toContain('NEW_BADGE_DAYS');
    expect(src).not.toContain('price_tier');
  });

  it('ListFilterBar does not hardcode Phase 21 sub-row values, free/paid tabs, NEW_BADGE_DAYS, or home anchors', () => {
    const src = readFileSync(
      path.resolve(process.cwd(), 'components/reader/list-filter-bar.tsx'),
      'utf8',
    );
    expect(src).not.toMatch(/sub=new|sub=popular|sub=completed|new\|popular\|completed/);
    expect(src).not.toMatch(/free\|paid/);
    expect(src).not.toContain('NEW_BADGE_DAYS');
    expect(src).not.toContain('#weekly-ranking');
  });

  it('exports UI-SPEC section 9 prop contracts usable without Phase 21 modules', () => {
    const cardProps: SeriesCardProps = {
      work: sampleWork,
      href: '/works/work-101',
      badge: 'new',
      priceLabel: '무료',
      overlay: null,
      corner: null,
      footer: null,
      size: 'default',
      priority: false,
    };
    const emptyContract: WorkGridEmptyState = {
      title: '아직 연재 중인 작품이 없어요',
      description: '곧 새로운 작품이 올라와요.',
    };
    const gridProps: WorkGridProps = {
      children: null,
      total: 0,
      shown: 0,
      loadMoreHref: null,
      emptyState: emptyContract,
    };
    const filterProps: ListFilterBarProps = {
      genres: GENRES,
      sortOptions: [{ value: 'updated', label: '업데이트순' }],
      defaults: { sort: 'updated', genre: '전체', status: 'all' },
    };
    expect(cardProps.work.id).toBe('work-101');
    expect(gridProps.total).toBe(0);
    expect(filterProps.defaults.sort).toBe('updated');
  });
});

describe('SeriesCard', () => {
  it('renders a single Link tab stop with default /works/{id}, 3:4 cover, h3 title, genre & episode badges, and priceLabel', () => {
    const html = renderToStaticMarkup(
      React.createElement(SeriesCard, {
        work: sampleWork,
        badge: 'new',
        priceLabel: '3화부터 유료',
      }),
    );

    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain('href="/works/work-101"');
    expect(html).toContain('aspect-[3/4]');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain(`alt="${sampleWork.title}"`);
    expect(html).toMatch(/<h3[^>]*>달빛 서고의 기록자<\/h3>/);
    expect(html).toContain('은하수');
    expect(html).toContain('판타지');
    expect(html).toContain('18화');
    expect(html).toContain('NEW');
    expect(html).toContain('3화부터 유료');
    expect(html).toContain('text-primary');
    expect(html).toContain('focus-visible:outline-2');
    expect(html).toContain('motion-reduce:transition-none');
  });

  it('uses fallback author "작가", cover fallback "표지 없음", custom href, eager priority, and muted style for "무료"', () => {
    const html = renderToStaticMarkup(
      React.createElement(SeriesCard, {
        work: {
          ...sampleWork,
          coverImageUrl: null,
          authorName: '   ',
        },
        href: '/works/work-101/chapters/ch-3',
        badge: 'completed',
        priceLabel: '무료',
        priority: true,
      }),
    );

    expect(html).toContain('href="/works/work-101/chapters/ch-3"');
    expect(html).toContain('표지 없음');
    expect(html).toContain('>작가<');
    expect(html).toContain('완결');
    expect(html).toContain('bg-foreground text-background');
    expect(html).toContain('무료');

    const withCoverPriority = renderToStaticMarkup(
      React.createElement(SeriesCard, {
        work: sampleWork,
        priority: true,
      }),
    );
    expect(withCoverPriority).toContain('loading="eager"');
  });

  it('prioritizes overlay over badge (hides NEW/완결 when overlay is passed) and renders corner & footer slots', () => {
    const html = renderToStaticMarkup(
      React.createElement(SeriesCard, {
        work: sampleWork,
        badge: 'completed',
        overlay: React.createElement('span', { 'data-rank': '1' }, '1위'),
        corner: React.createElement('span', { 'data-corner': 'new-ep' }, '새 회차'),
        footer: React.createElement('div', { 'data-footer': 'progress' }, '7화 이어 읽기'),
      }),
    );

    expect(html).toContain('data-rank="1"');
    expect(html).toContain('1위');
    expect(html).not.toContain('완결');
    expect(html).not.toContain('data-slot="series-card-badge"');
    expect(html).toContain('data-corner="new-ep"');
    expect(html).toContain('새 회차');
    expect(html).toContain('data-footer="progress"');
    expect(html).toContain('7화 이어 읽기');
  });

  it('renders mobile 3-column compact text layout without Badge chips when size="compact"', () => {
    const html = renderToStaticMarkup(
      React.createElement(SeriesCard, {
        work: sampleWork,
        size: 'compact',
        priceLabel: '회차당 10토큰~',
      }),
    );

    expect(html).toContain('data-size="compact"');
    expect(html).toContain('판타지 · 18화');
    expect(html).not.toContain('data-slot="badge"');
    expect(html).toContain('회차당 10토큰~');
  });
});

describe('WorkGrid', () => {
  it('renders ul/li grid, polite result count, and hides load more when all works are shown', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        WorkGrid,
        { total: 2, shown: 2, loadMoreHref: null },
        React.createElement(SeriesCard, { key: 'w1', work: sampleWork }),
        React.createElement(SeriesCard, {
          key: 'w2',
          work: { ...sampleWork, id: 'work-102', title: '두 번째 작품' },
        }),
      ),
    );

    expect(html).toContain('<ul');
    expect(html.match(/<li /g)).toHaveLength(2);
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('작품 2개');
    expect(html).not.toContain('작품 더 보기');
  });

  it('renders default filtered empty state with reset link when resetHref is given, and hides button when resetHref is omitted', () => {
    const withReset = renderToStaticMarkup(
      React.createElement(WorkGrid, {
        total: 0,
        shown: 0,
        resetHref: '/series/free',
        children: null,
      }),
    );

    expect(withReset).toContain('조건에 맞는 작품이 없어요');
    expect(withReset).toContain('장르나 정렬 조건을 바꿔 보세요.');
    expect(withReset).toContain('필터 초기화');
    expect(withReset).toContain('href="/series/free"');

    const withoutReset = renderToStaticMarkup(
      React.createElement(WorkGrid, {
        total: 0,
        shown: 0,
        children: null,
      }),
    );

    expect(withoutReset).toContain('조건에 맞는 작품이 없어요');
    expect(withoutReset).not.toContain('필터 초기화');
  });

  it('renders custom emptyState (unfiltered tab empty copy) without reset button', () => {
    const html = renderToStaticMarkup(
      React.createElement(WorkGrid, {
        total: 0,
        shown: 0,
        emptyState: {
          title: '아직 연재 중인 작품이 없어요',
          description: '곧 새로운 작품이 올라와요.',
        },
        children: null,
      }),
    );

    expect(html).toContain('아직 연재 중인 작품이 없어요');
    expect(html).toContain('곧 새로운 작품이 올라와요.');
    expect(html).not.toContain('필터 초기화');
  });

  it('renders 12 skeleton cards with aria-busy="true" when loading', () => {
    const html = renderToStaticMarkup(
      React.createElement(WorkGrid, {
        total: 0,
        shown: 0,
        loading: true,
        children: null,
      }),
    );

    expect(html).toContain('aria-busy="true"');
    expect(html.match(/data-slot="work-grid-skeleton"/g)).toHaveLength(12);
    expect(html).toContain('motion-reduce:animate-none');
  });

  it('renders error alert with retry callback', () => {
    const retryFn = vi.fn();
    const { html, tree } = captureTree(WorkGrid, {
      total: 0,
      shown: 0,
      error: { retry: retryFn },
      children: null,
    });

    expect(html).toContain('role="alert"');
    expect(html).toContain('목록을 불러오지 못했어요');
    expect(html).toContain('잠시 후 다시 시도해 주세요.');
    expect(html).toContain('다시 불러오기');

    const retryButtons = walkAll(
      tree,
      (el) => el.type === 'button' && el.props?.children === '다시 불러오기',
    );
    expect(retryButtons).toHaveLength(1);
    (retryButtons[0].props?.onClick as () => void)();
    expect(retryFn).toHaveBeenCalledTimes(1);
  });

  it('handles load more: disables with "불러오는 중…", calls router.push(loadMoreHref, { scroll: false }), announces added count, and focuses new first card', () => {
    const harness = createStatefulHarness();
    const cardsPage1 = [
      React.createElement(SeriesCard, { key: 'w1', work: { ...sampleWork, id: 'w1' } }),
      React.createElement(SeriesCard, { key: 'w2', work: { ...sampleWork, id: 'w2' } }),
    ];

    const step1 = harness.renderWithHooks(WorkGrid, {
      total: 4,
      shown: 2,
      loadMoreHref: '/series/free?page=2',
      children: cardsPage1,
    });

    expect(step1.html).toContain('aria-label="작품 더 보기"');
    expect(step1.html).toContain('>더보기</button>');

    const loadMoreBtn = walkAll(
      step1.tree,
      (el) => el.type === 'button' && el.props?.['aria-label'] === '작품 더 보기',
    )[0];
    expect(loadMoreBtn).toBeDefined();

    (loadMoreBtn.props?.onClick as () => void)();
    expect(navMock.push).toHaveBeenCalledTimes(1);
    expect(navMock.push).toHaveBeenCalledWith('/series/free?page=2', { scroll: false });

    const step2Loading = harness.renderWithHooks(WorkGrid, {
      total: 4,
      shown: 2,
      loadMoreHref: '/series/free?page=2',
      children: cardsPage1,
    });
    expect(step2Loading.html).toContain('불러오는 중…');
    expect(step2Loading.html).toMatch(/<button[^>]*disabled=""[^>]*>불러오는 중…<\/button>/);

    // Duplicate click while loading is ignored
    const loadingBtn = walkAll(
      step2Loading.tree,
      (el) => el.type === 'button' && el.props?.['aria-label'] === '작품 더 보기',
    )[0];
    (loadingBtn.props?.onClick as () => void)();
    expect(navMock.push).toHaveBeenCalledTimes(1);

    // Next page arrives: shown increases from 2 to 4
    const cardsPage2 = [
      ...cardsPage1,
      React.createElement(SeriesCard, { key: 'w3', work: { ...sampleWork, id: 'w3' } }),
      React.createElement(SeriesCard, { key: 'w4', work: { ...sampleWork, id: 'w4' } }),
    ];
    const step3Loaded = harness.renderWithHooks(WorkGrid, {
      total: 4,
      shown: 4,
      loadMoreHref: null,
      children: cardsPage2,
    });

    expect(step3Loaded.html).toContain('작품 2개 더 불러왔어요');
    expect(step3Loaded.html).not.toContain('작품 더 보기');

    const listItems = walkAll(
      step3Loaded.tree,
      (el) => el.type === 'li' && el.props?.['data-slot'] === 'work-grid-item',
    );
    expect(listItems).toHaveLength(4);
    expect(listItems[2].props?.['data-focus-target']).toBe('true');
    expect(listItems[2].props?.tabIndex).toBe(-1);

    const focusSpy = vi.fn();
    listItems.forEach((li, idx) => {
      const refCb = li.props?.ref as ((el: unknown) => void) | undefined;
      refCb?.({
        focus: idx === 2 ? focusSpy : vi.fn(),
        querySelector: () => null,
      });
    });

    harness.flushEffects();
    expect(focusSpy).toHaveBeenCalledTimes(1);
  });

  it('cooperates with ListFilterBar to move focus to the "전체" genre chip after clicking "필터 초기화"', () => {
    const filterHarness = createStatefulHarness();
    const filterRender = filterHarness.renderWithHooks(ListFilterBar, {
      genres: GENRES,
      sortOptions: [{ value: 'updated', label: '업데이트순' }],
      defaults: { sort: 'updated', genre: '전체', status: 'all' },
    });

    const allChipFocus = vi.fn();
    const chipButtons = walkAll(
      filterRender.tree,
      (el) => el.type === 'button' && el.props?.['data-slot'] === 'genre-chip',
    );
    expect(chipButtons[0].props?.['data-genre-chip']).toBe('전체');
    (chipButtons[0].props?.ref as (el: unknown) => void)?.({
      focus: allChipFocus,
    });
    filterHarness.flushEffects();

    const gridRender = captureTree(WorkGrid, {
      total: 0,
      shown: 0,
      resetHref: '/series/free',
      children: null,
    });
    const resetLinks = walkAll(
      gridRender.tree,
      (el) => el.props?.['data-slot'] === 'work-grid-reset',
    );
    expect(resetLinks).toHaveLength(1);
    (resetLinks[0].props?.onClick as () => void)();

    expect(allChipFocus).toHaveBeenCalledTimes(1);
  });
});

describe('ListFilterBar', () => {
  const phase21SortOptions = [
    { value: 'updated', label: '업데이트순' },
    { value: 'started', label: '연재 시작일순' },
    { value: 'popular', label: '인기순' },
  ];
  const phase21StatusOptions = [
    { value: 'all', label: '연재 전체' },
    { value: 'completed', label: '완결만' },
  ];

  it('renders genre chips with aria-pressed, sort/status selects with aria-labels, 44px hit areas, focus ring, and reduced motion', () => {
    navMock.search = 'genre=판타지&sort=popular';
    const html = renderToStaticMarkup(
      React.createElement(ListFilterBar, {
        genres: GENRES,
        sortOptions: phase21SortOptions,
        statusOptions: phase21StatusOptions,
        defaults: { sort: 'updated', genre: '전체', status: 'all' },
        paramNames: { status: 'sub' },
      }),
    );

    expect(html).toContain('data-genre-chip="전체"');
    for (const g of GENRES) {
      expect(html).toContain(`data-genre-chip="${g}"`);
    }
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*data-genre-chip="판타지"/);
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*data-genre-chip="전체"/);
    expect(html).toContain('aria-label="정렬"');
    expect(html).toContain('aria-label="상태"');
    expect(html).toContain('인기순');
    expect(html).toContain('연재 전체');
    expect(html).toContain('min-h-11 min-w-11');
    expect(html).toContain('focus-visible:outline-2');
    expect(html).toContain('motion-reduce:transition-none');
  });

  it('supports keyboard ArrowRight / ArrowLeft / Home / End focus movement across genre chips', () => {
    const { tree } = captureTree(ListFilterBar, {
      genres: ['로맨스', '판타지'],
      sortOptions: phase21SortOptions,
      defaults: { sort: 'updated', genre: '전체' },
    });

    const chips = walkAll(
      tree,
      (el) => el.type === 'button' && el.props?.['data-slot'] === 'genre-chip',
    );
    expect(chips).toHaveLength(3); // 전체, 로맨스, 판타지

    const focusSpies = chips.map(() => vi.fn());
    const scrollSpies = chips.map(() => vi.fn());
    chips.forEach((chip, i) => {
      (chip.props?.ref as (el: unknown) => void)?.({
        focus: focusSpies[i],
        scrollIntoView: scrollSpies[i],
      });
    });

    const preventDefault = vi.fn();
    (chips[0].props?.onKeyDown as (e: unknown) => void)({
      key: 'ArrowRight',
      preventDefault,
    });
    expect(preventDefault).toHaveBeenCalled();
    expect(focusSpies[1]).toHaveBeenCalledTimes(1);
    expect(scrollSpies[1]).toHaveBeenCalledTimes(1);

    (chips[0].props?.onKeyDown as (e: unknown) => void)({
      key: 'ArrowLeft',
      preventDefault,
    });
    expect(focusSpies[2]).toHaveBeenCalledTimes(1);

    (chips[2].props?.onKeyDown as (e: unknown) => void)({
      key: 'Home',
      preventDefault,
    });
    expect(focusSpies[0]).toHaveBeenCalledTimes(1);
  });

  it('updates genre and sort in URL, deletes defaults and page, and never appends #weekly-ranking', () => {
    navMock.search = 'sub=new&genre=판타지&page=3';
    const { tree } = captureTree(ListFilterBar, {
      genres: GENRES,
      sortOptions: phase21SortOptions,
      statusOptions: phase21StatusOptions,
      defaults: { sort: 'started', genre: '전체', status: 'all' },
      paramNames: { status: 'sub' },
    });

    const chips = walkAll(
      tree,
      (el) => el.type === 'button' && el.props?.['data-slot'] === 'genre-chip',
    );
    // Click '전체' -> removes genre and page, preserves sub=new
    (chips[0].props?.onClick as () => void)();
    expect(navMock.push).toHaveBeenLastCalledWith('/series/free?sub=new', {
      scroll: false,
    });

    // Click '무협' -> sets genre=무협 and removes page
    const wuxiaChip = chips.find((c) => c.props?.['data-genre-chip'] === '무협')!;
    (wuxiaChip.props?.onClick as () => void)();
    const pushedUrl = navMock.push.mock.lastCall?.[0] as string;
    expect(pushedUrl).toContain('sub=new');
    expect(decodeURIComponent(pushedUrl)).toContain('genre=무협');
    expect(pushedUrl).not.toContain('page=');
    expect(pushedUrl).not.toContain('#weekly-ranking');

    // Selecting default sort ('started' for sub=new) omits sort from URL and removes page
    const selects = walkAll(
      tree,
      (el) => typeof el.props?.onValueChange === 'function',
    );
    const sortSelect = selects[0];
    (sortSelect.props?.onValueChange as (v: string) => void)('started');
    expect(decodeURIComponent(navMock.push.mock.lastCall?.[0] as string)).toBe(
      '/series/free?sub=new&genre=판타지',
    );
  });

  it('Phase 21 status select: "연재 전체" removes sub only when sub=completed and preserves sub=new|popular; "완결만" sets sub=completed and removes sort & page on actual change', () => {
    // 1. On sub=new: selecting '연재 전체' ('all') keeps sub=new and does not drop sort/page
    navMock.search = 'sub=new&sort=popular&page=2';
    const renderNew = captureTree(ListFilterBar, {
      genres: GENRES,
      sortOptions: phase21SortOptions,
      statusOptions: phase21StatusOptions,
      defaults: { sort: 'started', genre: '전체', status: 'all' },
      paramNames: { status: 'sub' },
      resetKeys: ['page', 'sort'],
    });
    const statusSelectNew = walkAll(
      renderNew.tree,
      (el) => typeof el.props?.onValueChange === 'function',
    )[1];
    (statusSelectNew.props?.onValueChange as (v: string) => void)('all');
    expect(navMock.push).not.toHaveBeenCalled();

    // 2. On sub=popular: selecting '연재 전체' ('all') keeps sub=popular
    navMock.search = 'sub=popular&page=2';
    const renderPopular = captureTree(ListFilterBar, {
      genres: GENRES,
      sortOptions: phase21SortOptions,
      statusOptions: phase21StatusOptions,
      defaults: { sort: 'popular', genre: '전체', status: 'all' },
      paramNames: { status: 'sub' },
      resetKeys: ['page', 'sort'],
    });
    const statusSelectPopular = walkAll(
      renderPopular.tree,
      (el) => typeof el.props?.onValueChange === 'function',
    )[1];
    (statusSelectPopular.props?.onValueChange as (v: string) => void)('all');
    expect(navMock.push).not.toHaveBeenCalled();

    // 3. On sub=popular: selecting '완결만' ('completed') sets sub=completed and removes sort & page while preserving genre
    navMock.search = 'sub=popular&genre=판타지&sort=started&page=3';
    const renderToCompleted = captureTree(ListFilterBar, {
      genres: GENRES,
      sortOptions: phase21SortOptions,
      statusOptions: phase21StatusOptions,
      defaults: { sort: 'popular', genre: '전체', status: 'all' },
      paramNames: { status: 'sub' },
      resetKeys: ['page', 'sort'],
    });
    const statusSelectToCompleted = walkAll(
      renderToCompleted.tree,
      (el) => typeof el.props?.onValueChange === 'function',
    )[1];
    (statusSelectToCompleted.props?.onValueChange as (v: string) => void)('completed');
    expect(decodeURIComponent(navMock.push.mock.lastCall?.[0] as string)).toBe(
      '/series/free?sub=completed&genre=판타지',
    );

    // 4. On sub=completed: selecting '연재 전체' ('all') removes sub, sort, and page
    navMock.search = 'sub=completed&genre=판타지&sort=popular&page=2';
    const renderFromCompleted = captureTree(ListFilterBar, {
      genres: GENRES,
      sortOptions: phase21SortOptions,
      statusOptions: phase21StatusOptions,
      defaults: { sort: 'updated', genre: '전체', status: 'all' },
      paramNames: { status: 'sub' },
      resetKeys: ['page', 'sort'],
    });
    expect(renderFromCompleted.html).toContain('완결만');
    const statusSelectFromCompleted = walkAll(
      renderFromCompleted.tree,
      (el) => typeof el.props?.onValueChange === 'function',
    )[1];
    (statusSelectFromCompleted.props?.onValueChange as (v: string) => void)('all');
    expect(decodeURIComponent(navMock.push.mock.lastCall?.[0] as string)).toBe(
      '/series/free?genre=판타지',
    );
  });

  it('Phase 23 reuse: omits status Select when statusOptions is undefined and supports custom paramNames & resetKeys', () => {
    navMock.pathname = '/ranking';
    navMock.search = 'cat=로맨스&order=weekly&page=2&cursor=abc';
    const { html, tree } = captureTree(ListFilterBar, {
      genres: GENRES,
      sortOptions: [
        { value: 'weekly', label: '주간 인기순' },
        { value: 'monthly', label: '월간 인기순' },
      ],
      defaults: { sort: 'weekly', genre: '전체' },
      paramNames: { genre: 'cat', sort: 'order' },
      resetKeys: ['page', 'cursor'],
      scrollToTop: true,
    });

    expect(html).toContain('aria-label="정렬"');
    expect(html).not.toContain('aria-label="상태"');
    expect(html).toContain('주간 인기순');

    const selects = walkAll(
      tree,
      (el) => typeof el.props?.onValueChange === 'function',
    );
    expect(selects).toHaveLength(1);
    (selects[0].props?.onValueChange as (v: string) => void)('monthly');

    expect(navMock.push).toHaveBeenLastCalledWith(
      '/ranking?cat=%EB%A1%9C%EB%A7%A8%EC%8A%A4&order=monthly',
      { scroll: true },
    );
  });
});
