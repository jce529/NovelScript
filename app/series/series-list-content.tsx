import { Suspense, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { SiteHeader } from '@/components/layout/site-header';
import {
  ListFilterBar,
  type ListFilterOption,
} from '@/components/reader/list-filter-bar';
import { SeriesCard } from '@/components/reader/series-card';
import { WorkGrid } from '@/components/reader/work-grid';
import {
  WORK_LIST_SORT_DESCRIPTIONS,
  formatWorkPriceLabel,
  getDefaultWorkListSort,
  listWorkSeries,
  resolveWorkBadge,
  type WorkListSort,
  type WorkListSubTab,
  type WorkSeriesKind,
  type WorkSeriesResult,
} from '@/lib/discovery/work-list';
import { GENRES } from '@/lib/works/genres';

export type SeriesRawSearchParams = Record<string, string | string[] | undefined>;

export interface SeriesPageCopy {
  title: string;
  description: string;
}

export const SERIES_PAGE_COPY: Readonly<Record<WorkSeriesKind, SeriesPageCopy>> = {
  free: {
    title: '무료연재',
    description: '모든 회차를 무료로 읽을 수 있는 작품이에요.',
  },
  paid: {
    title: '유료연재',
    description: '앞부분은 무료로 읽고, 이후 회차는 소장하거나 대여해서 읽는 작품이에요.',
  },
};

export const SERIES_SORT_OPTIONS: readonly ListFilterOption[] = [
  { value: 'updated', label: '업데이트순' },
  { value: 'started', label: '연재 시작일순' },
  { value: 'popular', label: '인기순' },
] as const;

export const SERIES_STATUS_OPTIONS: readonly ListFilterOption[] = [
  { value: 'all', label: '연재 전체' },
  { value: 'completed', label: '완결만' },
] as const;

export const SERIES_EMPTY_FILTERED_STATE = {
  title: '조건에 맞는 작품이 없어요',
  description: '장르나 정렬 조건을 바꿔 보세요.',
} as const;

export const SERIES_EMPTY_UNFILTERED_STATE = {
  title: '아직 연재 중인 작품이 없어요',
  description: '곧 새로운 작품이 올라와요.',
} as const;

export const FIRST_ROW_PRIORITY_COUNT = 6;

export interface NormalizedSeriesSearchParams {
  sub: WorkListSubTab;
  genre: string;
  sort: WorkListSort;
  defaultSort: WorkListSort;
  page: number;
  hasActiveFilter: boolean;
}

function pickFirstString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function isValidSubTab(value: string | undefined): value is Exclude<WorkListSubTab, 'all'> {
  return value === 'new' || value === 'popular' || value === 'completed';
}

function isValidSort(value: string | undefined): value is WorkListSort {
  return value === 'updated' || value === 'started' || value === 'popular';
}

function isValidGenre(value: string | undefined): boolean {
  return typeof value === 'string' && (GENRES as readonly string[]).includes(value);
}

/**
 * UI-SPEC §4: searchParams 허용값 정규화.
 * - `sub`: `new | popular | completed`, 생략·그 외는 `all`
 * - `genre`: `GENRES` 중 하나, 생략·알 수 없는 값은 `'전체'`
 * - `sort`: `updated | started | popular`, 생략·알 수 없는 값은 서브 행 기본 정렬
 * - `page`: 1 이상의 정수, 0·음수·NaN·생략은 1
 */
export function normalizeSeriesSearchParams(
  raw?: SeriesRawSearchParams | null,
): NormalizedSeriesSearchParams {
  const rawSub = pickFirstString(raw?.sub);
  const sub: WorkListSubTab = isValidSubTab(rawSub) ? rawSub : 'all';

  const rawGenre = pickFirstString(raw?.genre);
  const genre = isValidGenre(rawGenre) ? rawGenre! : '전체';

  const defaultSort = getDefaultWorkListSort(sub);
  const rawSort = pickFirstString(raw?.sort);
  const sort: WorkListSort = isValidSort(rawSort) ? rawSort : defaultSort;

  const rawPage = pickFirstString(raw?.page);
  const parsedPage = rawPage !== undefined ? Number(rawPage) : 1;
  const page =
    Number.isFinite(parsedPage) && Math.floor(parsedPage) >= 1
      ? Math.floor(parsedPage)
      : 1;

  const hasActiveFilter =
    sub !== 'all' || genre !== '전체' || sort !== defaultSort;

  return {
    sub,
    genre,
    sort,
    defaultSort,
    page,
    hasActiveFilter,
  };
}

/**
 * UI-SPEC §4: 기본값(`sub=all`, `genre=전체`, 서브별 기본 `sort`, `page=1`)을 URL에서 생략해
 * 연재 목록 경로를 조립한다.
 */
export function buildSeriesHref(
  kind: WorkSeriesKind,
  params: {
    sub?: WorkListSubTab | string | null;
    genre?: string | null;
    sort?: WorkListSort | string | null;
    page?: number | null;
  } = {},
): string {
  const basePath = `/series/${kind}`;
  const sub: WorkListSubTab = isValidSubTab(params.sub ?? undefined)
    ? (params.sub as Exclude<WorkListSubTab, 'all'>)
    : 'all';
  const defaultSort = getDefaultWorkListSort(sub);
  const sort: WorkListSort = isValidSort(params.sort ?? undefined)
    ? (params.sort as WorkListSort)
    : defaultSort;
  const genre = isValidGenre(params.genre ?? undefined) ? params.genre! : '전체';
  const page =
    typeof params.page === 'number' &&
    Number.isFinite(params.page) &&
    Math.floor(params.page) > 1
      ? Math.floor(params.page)
      : 1;

  const search = new URLSearchParams();
  if (sub !== 'all') {
    search.set('sub', sub);
  }
  if (genre !== '전체') {
    search.set('genre', genre);
  }
  if (sort !== defaultSort) {
    search.set('sort', sort);
  }
  if (page > 1) {
    search.set('page', String(page));
  }

  const qs = search.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export interface SeriesListContentProps {
  kind: WorkSeriesKind;
  searchParams?: SeriesRawSearchParams | Promise<SeriesRawSearchParams>;
  supabase?: SupabaseClient;
  now?: Date | string | number;
}

export async function SeriesListContent({
  kind,
  searchParams,
  supabase: injectedSupabase,
  now,
}: SeriesListContentProps) {
  const resolvedRaw = searchParams ? await searchParams : {};
  const normalized = normalizeSeriesSearchParams(resolvedRaw);
  const copy = SERIES_PAGE_COPY[kind];
  const sortDescription = WORK_LIST_SORT_DESCRIPTIONS[normalized.sort];

  let headerNode: ReactNode = null;
  try {
    headerNode = await SiteHeader();
  } catch {
    headerNode = null;
  }

  let result: WorkSeriesResult | null = null;
  let loadError = false;

  try {
    const supabase = injectedSupabase ?? (await createClient());
    result = await listWorkSeries(supabase, {
      kind,
      sub: normalized.sub,
      genre: normalized.genre === '전체' ? null : normalized.genre,
      sort: normalized.sort,
      page: normalized.page,
      now,
    });
  } catch {
    loadError = true;
  }

  const loadMoreHref =
    result && result.hasMore
      ? buildSeriesHref(kind, {
          sub: normalized.sub,
          genre: normalized.genre,
          sort: normalized.sort,
          page: result.page + 1,
        })
      : null;

  const emptyState = normalized.hasActiveFilter
    ? SERIES_EMPTY_FILTERED_STATE
    : SERIES_EMPTY_UNFILTERED_STATE;
  const resetHref = normalized.hasActiveFilter ? `/series/${kind}` : undefined;

  return (
    <>
      {headerNode}
      <main
        data-slot="series-list-page"
        data-kind={kind}
        className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-6 px-4 pt-6 pb-12"
      >
        <header className="flex flex-col gap-1" data-slot="series-list-header">
          <h1 className="text-lg leading-[1.2] font-semibold text-foreground">
            {copy.title}
          </h1>
          <p className="text-xs leading-[1.5] font-normal text-muted-foreground">
            {copy.description}
          </p>
        </header>

        <Suspense fallback={null}>
          <ListFilterBar
            genres={GENRES}
            sortOptions={SERIES_SORT_OPTIONS}
            statusOptions={SERIES_STATUS_OPTIONS}
            defaults={{
              sort: normalized.defaultSort,
              genre: '전체',
              status: 'all',
            }}
            paramNames={{
              genre: 'genre',
              sort: 'sort',
              status: 'sub',
            }}
            resetKeys={['page', 'sort']}
          />
        </Suspense>

        <p
          data-slot="series-sort-description"
          className="text-xs leading-[1.5] font-normal text-muted-foreground"
        >
          {sortDescription}
        </p>

        {loadError || !result ? (
          <WorkGrid total={0} shown={0} error={{}} />
        ) : (
          <WorkGrid
            total={result.total}
            shown={result.shown}
            loadMoreHref={loadMoreHref}
            emptyState={emptyState}
            resetHref={resetHref}
          >
            {result.items.map((item, index) => (
              <SeriesCard
                key={item.id}
                work={{
                  id: item.id,
                  title: item.title,
                  coverImageUrl: item.coverImageUrl,
                  authorName: item.authorName,
                  genre: item.genre,
                  publishedChapterCount: item.publishedChapterCount,
                }}
                badge={resolveWorkBadge({
                  serialStatus: item.serialStatus,
                  startedAt: item.startedAt,
                  now,
                })}
                priceLabel={formatWorkPriceLabel(item)}
                priority={index < FIRST_ROW_PRIORITY_COUNT}
              />
            ))}
          </WorkGrid>
        )}
      </main>
    </>
  );
}
