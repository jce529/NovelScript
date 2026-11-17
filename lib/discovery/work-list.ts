import type { SupabaseClient } from '@supabase/supabase-js';
import { computeTrendingScores } from '@/lib/discovery/actions';

/** D-06, UI-SPEC 3절: 연재 시작일(첫 공개 회차 published_at) 기준 NEW 배지 부여 일수 */
export const NEW_BADGE_DAYS = 14;

/** D-03, UI-SPEC 4절: 더보기 단계당 누적 페이지 크기 (page=3이면 최대 72개 반환) */
export const WORK_LIST_PAGE_SIZE = 24;

/** PostgREST 기본 단일 응답 행 상한(1000행) 우회를 위한 배치 크기 */
export const WORK_LIST_QUERY_BATCH_SIZE = 1000;

/** URL/헤더 16KB 한도 초과를 피하기 위한 work_likes IN 질의 배치 크기 */
export const WORK_LIKE_QUERY_BATCH_SIZE = 150;

export type WorkSeriesKind = 'free' | 'paid';
export type WorkListKindFilter = WorkSeriesKind | 'all';
export type WorkListSubTab = 'all' | 'new' | 'popular' | 'completed';
export type WorkListSort = 'updated' | 'started' | 'popular';
export type WorkSerialStatus = 'ongoing' | 'completed';
export type WorkBadge = 'new' | 'completed' | null;

/**
 * UI-SPEC 7절: 정렬 안내 문구 상수.
 * Phase 26(RDATA) 완독률 전환 시 `getWorkListSortKey`·`computeWorkListTrendingScores`와 함께 갱신한다.
 */
export const WORK_LIST_SORT_DESCRIPTIONS: Readonly<Record<WorkListSort, string>> = {
  updated: '최근 회차가 올라온 순서예요.',
  started: '연재를 시작한 날이 가까운 순서예요.',
  popular: '조회수·좋아요·다음화 이동률을 종합한 순서예요.',
};

export interface WorkListChapterInput {
  order_index: number;
  is_published: boolean;
  deleted_at: string | null;
  published_at: string | null;
  price_tier: number | null;
  view_count?: number | null;
}

export interface RawWorkProfileInput {
  pen_name: string | null;
}

export interface RawWorkListRow {
  id: string;
  title: string;
  cover_image_url: string | null;
  genre: string | null;
  serial_status?: WorkSerialStatus | string | null;
  profiles?: RawWorkProfileInput | RawWorkProfileInput[] | null;
  chapters?: WorkListChapterInput[] | null;
}

export interface PublicChapterSummary {
  kind: WorkSeriesKind;
  isPaid: boolean;
  publishedChapterCount: number;
  startedAt: string;
  updatedAt: string;
  publishedPriceTiers: (number | null)[];
  firstPaidEpisodeOrder: number | null;
  minPaidPriceTier: number | null;
  totalViews: number;
  ctr: number;
}

export interface WorkBadgeInput {
  serialStatus?: WorkSerialStatus | string | null;
  startedAt: string | Date | null | undefined;
  now?: Date | string | number;
}

export type WorkPriceLabelInput =
  | readonly (number | null | undefined)[]
  | {
      publishedPriceTiers?: readonly (number | null | undefined)[];
      chapters?: readonly WorkListChapterInput[];
      firstPaidEpisodeOrder?: number | null;
      minPaidPriceTier?: number | null;
    };

export interface WorkListTrendingInput {
  totalViews: number;
  likeCount: number;
  ctr: number;
}

export interface WorkListSortableItem {
  id: string;
  updatedAt: string;
  startedAt: string;
  trendingScore: number;
}

/**
 * UI-SPEC 9절 SeriesCard.work 필수 필드 + Phase 21/23 조립용 공개 회차 지표.
 * 21 전용 표시 값인 `badge`·`priceLabel`은 포함하지 않으며 호출측 조립부에서 순수 함수로 도출한다.
 */
export interface WorkSeriesItem extends WorkListSortableItem {
  title: string;
  coverImageUrl: string | null;
  authorName: string;
  genre: string | null;
  publishedChapterCount: number;
  kind: WorkSeriesKind;
  isPaid: boolean;
  serialStatus: WorkSerialStatus;
  publishedPriceTiers: (number | null)[];
  firstPaidEpisodeOrder: number | null;
  minPaidPriceTier: number | null;
  viewCount: number;
  likeCount: number;
  ctr: number;
}

export interface WorkListQueryParams {
  kind?: WorkListKindFilter;
  sub?: WorkListSubTab;
  genre?: string | null;
  sort?: WorkListSort;
  page?: number;
  now?: Date | string | number;
}

export interface WorkSeriesResult {
  items: WorkSeriesItem[];
  total: number;
  shown: number;
  page: number;
  hasMore: boolean;
}

const MS_PER_DAY = 86_400_000;

function isPositivePriceTier(tier: number | null | undefined): tier is number {
  return typeof tier === 'number' && Number.isFinite(tier) && tier > 0;
}

function isPublicChapter(
  chapter: WorkListChapterInput
): chapter is WorkListChapterInput & { published_at: string } {
  return (
    chapter.is_published === true &&
    chapter.deleted_at === null &&
    typeof chapter.published_at === 'string' &&
    chapter.published_at.length > 0
  );
}

/** 연속된 공개 회차 간 조회수 유지율(다음화 이동률) 평균 */
function averageNextChapterCtr(viewCountsInOrder: readonly number[]): number {
  if (viewCountsInOrder.length < 2) return 0;
  const ratios = viewCountsInOrder.slice(1).map((views, idx) => {
    const prev = viewCountsInOrder[idx];
    return prev > 0 ? Math.min(views / prev, 1) : 0;
  });
  return ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
}

function resolveAuthorPenName(profiles: RawWorkListRow['profiles']): string {
  const profileObj = Array.isArray(profiles) ? profiles[0] : profiles;
  const trimmed = profileObj?.pen_name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : '작가';
}

/**
 * D-02, D-05: 공개·미삭제(`is_published=true AND deleted_at IS NULL AND published_at IS NOT NULL`)
 * 회차를 `order_index` 오름차순으로 정렬해 무료/유료 분류, 연재 시작일(최소 published_at),
 * 최근 업데이트일(최대 published_at), 유료 시작 회차(1-based) 및 최저 유료 단가를 집계한다.
 * 공개 회차가 0개이면 null을 반환해 목록에서 제외한다.
 */
export function summarizePublicChapters(
  chapters: readonly WorkListChapterInput[] | null | undefined
): PublicChapterSummary | null {
  if (!chapters || chapters.length === 0) return null;

  const publicChapters = chapters
    .filter(isPublicChapter)
    .sort((a, b) => a.order_index - b.order_index);

  if (publicChapters.length === 0) return null;

  let minTime = Infinity;
  let maxTime = -Infinity;
  let startedAt = publicChapters[0].published_at;
  let updatedAt = publicChapters[0].published_at;

  const publishedPriceTiers: (number | null)[] = [];
  const viewCountsInOrder: number[] = [];
  let firstPaidEpisodeOrder: number | null = null;
  let minPaidPriceTier: number | null = null;
  let totalViews = 0;

  publicChapters.forEach((chapter, idx) => {
    const parsedTime = Date.parse(chapter.published_at);
    if (Number.isFinite(parsedTime)) {
      if (parsedTime < minTime) {
        minTime = parsedTime;
        startedAt = chapter.published_at;
      }
      if (parsedTime > maxTime) {
        maxTime = parsedTime;
        updatedAt = chapter.published_at;
      }
    } else {
      if (chapter.published_at < startedAt) startedAt = chapter.published_at;
      if (chapter.published_at > updatedAt) updatedAt = chapter.published_at;
    }

    const tier = isPositivePriceTier(chapter.price_tier)
      ? chapter.price_tier
      : chapter.price_tier === 0
        ? 0
        : null;
    publishedPriceTiers.push(tier);

    if (isPositivePriceTier(tier)) {
      if (firstPaidEpisodeOrder === null) {
        firstPaidEpisodeOrder = idx + 1;
      }
      if (minPaidPriceTier === null || tier < minPaidPriceTier) {
        minPaidPriceTier = tier;
      }
    }

    const views =
      typeof chapter.view_count === 'number' && Number.isFinite(chapter.view_count)
        ? Math.max(0, chapter.view_count)
        : 0;
    viewCountsInOrder.push(views);
    totalViews += views;
  });

  const isPaid = firstPaidEpisodeOrder !== null;

  return {
    kind: isPaid ? 'paid' : 'free',
    isPaid,
    publishedChapterCount: publicChapters.length,
    startedAt,
    updatedAt,
    publishedPriceTiers,
    firstPaidEpisodeOrder,
    minPaidPriceTier,
    totalViews,
    ctr: averageNextChapterCtr(viewCountsInOrder),
  };
}

/** 공개 회차 기준 작품의 무료/유료 구분. 공개 회차가 없으면 null을 반환한다. */
export function classifyWorkKind(
  chapters: readonly WorkListChapterInput[] | null | undefined
): WorkSeriesKind | null {
  const summary = summarizePublicChapters(chapters);
  return summary ? summary.kind : null;
}

/**
 * D-06, UI-SPEC 3절: 카드 좌상단 배지 판정.
 * `completed`가 `new`보다 우선하며, `0 <= now - startedAt <= NEW_BADGE_DAYS(14일)`일 때만 `'new'`를 부여한다.
 * 미래 시작일(`now - startedAt < 0`)이나 잘못된 시각은 제외한다.
 */
export function resolveWorkBadge(input: WorkBadgeInput): WorkBadge {
  if (input.serialStatus === 'completed') {
    return 'completed';
  }
  if (!input.startedAt) {
    return null;
  }

  const nowInput = input.now ?? new Date();
  const nowMs =
    nowInput instanceof Date
      ? nowInput.getTime()
      : typeof nowInput === 'number'
        ? nowInput
        : Date.parse(nowInput);
  const startedMs =
    input.startedAt instanceof Date
      ? input.startedAt.getTime()
      : Date.parse(input.startedAt);

  if (!Number.isFinite(nowMs) || !Number.isFinite(startedMs)) {
    return null;
  }

  const elapsedMs = nowMs - startedMs;
  if (elapsedMs >= 0 && elapsedMs <= NEW_BADGE_DAYS * MS_PER_DAY) {
    return 'new';
  }
  return null;
}

export const getWorkBadge = resolveWorkBadge;

/**
 * D-07, UI-SPEC 3절·7절: 공개·미삭제 회차의 `order_index` 오름차순 `price_tier` 기준 가격 문구 계산.
 * - 양수 `price_tier` 회차가 없으면 `무료`
 * - 1화부터 유료이면 공개 유료 회차 최저 단가로 `회차당 {N}토큰~`
 * - 1화가 무료이고 이후 유료 회차가 있으면 1-based 첫 유료 순번으로 `{N}화부터 유료` (N >= 2)
 */
export function formatWorkPriceLabel(input: WorkPriceLabelInput): string {
  let tiers: readonly (number | null | undefined)[] | null = null;

  if (Array.isArray(input)) {
    tiers = input;
  } else if (input && typeof input === 'object') {
    if ('chapters' in input && Array.isArray(input.chapters)) {
      const summary = summarizePublicChapters(input.chapters);
      tiers = summary ? summary.publishedPriceTiers : [];
    } else if ('publishedPriceTiers' in input && Array.isArray(input.publishedPriceTiers)) {
      tiers = input.publishedPriceTiers;
    } else if ('firstPaidEpisodeOrder' in input || 'minPaidPriceTier' in input) {
      const firstPaid = input.firstPaidEpisodeOrder ?? null;
      const minPaid = input.minPaidPriceTier ?? null;
      if (
        firstPaid === null ||
        firstPaid <= 0 ||
        minPaid === null ||
        !isPositivePriceTier(minPaid)
      ) {
        return '무료';
      }
      if (firstPaid === 1) {
        return `회차당 ${minPaid}토큰~`;
      }
      return `${firstPaid}화부터 유료`;
    }
  }

  const normalizedTiers = tiers ?? [];
  let firstPaidIndex = -1;
  let minPaidTier = Infinity;

  for (let i = 0; i < normalizedTiers.length; i += 1) {
    const tier = normalizedTiers[i];
    if (isPositivePriceTier(tier)) {
      if (firstPaidIndex === -1) {
        firstPaidIndex = i;
      }
      if (tier < minPaidTier) {
        minPaidTier = tier;
      }
    }
  }

  if (firstPaidIndex === -1 || !Number.isFinite(minPaidTier)) {
    return '무료';
  }
  if (firstPaidIndex === 0) {
    return `회차당 ${minPaidTier}토큰~`;
  }
  return `${firstPaidIndex + 1}화부터 유료`;
}

export const getWorkPriceLabel = formatWorkPriceLabel;

/**
 * D-04: 인기 점수 계산 어댑터.
 * Phase 26(RDATA) 완독률·연독률 도입 전까지 현행 `computeTrendingScores`(조회 0.4·좋아요 0.3·다음화 이동률 0.3)를
 * 전체 후보 집합에 한 번 적용한다. Phase 26 이후 완독률 기반 전환 시 이 어댑터와 `getWorkListSortKey`만 교체한다.
 */
export function computeWorkListTrendingScores(
  inputs: readonly WorkListTrendingInput[]
): number[] {
  return computeTrendingScores([...inputs]);
}

/**
 * D-04: 연재 목록 정렬 키 선택 단일 함수.
 * Phase 26 이후 인기 정렬 기준을 바꿀 때 이 함수와 `computeWorkListTrendingScores`만 수정한다.
 */
export function getWorkListSortKey(
  item: WorkListSortableItem,
  sort: WorkListSort
): number {
  if (sort === 'popular') {
    return Number.isFinite(item.trendingScore) ? item.trendingScore : 0;
  }
  const timestamp = Date.parse(sort === 'started' ? item.startedAt : item.updatedAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

/** 서브 행(`all | new | popular | completed`)에 따른 기본 정렬 */
export function getDefaultWorkListSort(sub: WorkListSubTab = 'all'): WorkListSort {
  if (sub === 'new') return 'started';
  if (sub === 'popular') return 'popular';
  return 'updated';
}

/**
 * D-04, D-05: 선택된 정렬 기준 내림차순 정렬.
 * 동률 시 연재 시작일(`startedAt`) 최신순(내림차순) -> 작품 ID(`id`) 오름차순으로 안정 정렬한다.
 */
export function sortWorkSeriesItems<T extends WorkListSortableItem>(
  items: readonly T[],
  sort: WorkListSort
): T[] {
  return [...items].sort((a, b) => {
    const keyDiff = getWorkListSortKey(b, sort) - getWorkListSortKey(a, sort);
    if (keyDiff !== 0) return keyDiff;

    const startA = Date.parse(a.startedAt);
    const startB = Date.parse(b.startedAt);
    const safeStartA = Number.isFinite(startA) ? startA : 0;
    const safeStartB = Number.isFinite(startB) ? startB : 0;
    if (safeStartB !== safeStartA) return safeStartB - safeStartA;

    return a.id.localeCompare(b.id);
  });
}

/**
 * D-03, UI-SPEC 4절: 페이지 번호 보정.
 * 0·음수·NaN·생략은 1로, 전체 건수 기준 마지막 가능 페이지를 초과하면 마지막 페이지로 보정한다.
 */
export function normalizeWorkListPage(
  page: number | undefined | null,
  total: number,
  pageSize: number = WORK_LIST_PAGE_SIZE
): number {
  const safePageSize = pageSize > 0 ? pageSize : WORK_LIST_PAGE_SIZE;
  const maxPage = Math.max(1, Math.ceil(Math.max(0, total) / safePageSize));
  if (typeof page !== 'number' || !Number.isFinite(page)) {
    return 1;
  }
  const intPage = Math.floor(page);
  if (intPage < 1) {
    return 1;
  }
  return Math.min(intPage, maxPage);
}

/**
 * 전체 원본 작품 행과 좋아요 집계를 받아 분류·완결·장르 필터링 후
 * 전체 후보 집합에서 인기 점수를 계산하고, 정렬 뒤 `24 * page` 누적 슬라이스를 반환한다.
 * (`sub='new'`는 14일 필터가 아니라 `started` 기본 정렬이다.)
 */
export function buildWorkSeriesResult(
  rawWorks: readonly RawWorkListRow[],
  likeCounts: ReadonlyMap<string, number> = new Map(),
  params: WorkListQueryParams = {}
): WorkSeriesResult {
  const kindFilter: WorkListKindFilter = params.kind ?? 'all';
  const sub: WorkListSubTab = params.sub ?? 'all';
  const genreFilter =
    params.genre && params.genre !== '전체' ? params.genre : null;
  const effectiveSort: WorkListSort = params.sort ?? getDefaultWorkListSort(sub);

  const staged: Omit<WorkSeriesItem, 'trendingScore'>[] = [];

  for (const row of rawWorks) {
    if (genreFilter && row.genre !== genreFilter) {
      continue;
    }

    const serialStatus: WorkSerialStatus =
      row.serial_status === 'completed' ? 'completed' : 'ongoing';
    if (sub === 'completed' && serialStatus !== 'completed') {
      continue;
    }

    const summary = summarizePublicChapters(row.chapters);
    if (!summary) {
      continue;
    }

    if (kindFilter !== 'all' && summary.kind !== kindFilter) {
      continue;
    }

    const likeCount = likeCounts.get(row.id) ?? 0;

    staged.push({
      id: row.id,
      title: row.title,
      coverImageUrl: row.cover_image_url ?? null,
      authorName: resolveAuthorPenName(row.profiles),
      genre: row.genre ?? null,
      publishedChapterCount: summary.publishedChapterCount,
      kind: summary.kind,
      isPaid: summary.isPaid,
      serialStatus,
      startedAt: summary.startedAt,
      updatedAt: summary.updatedAt,
      publishedPriceTiers: summary.publishedPriceTiers,
      firstPaidEpisodeOrder: summary.firstPaidEpisodeOrder,
      minPaidPriceTier: summary.minPaidPriceTier,
      viewCount: summary.totalViews,
      likeCount,
      ctr: summary.ctr,
    });
  }

  // 페이지에 따라 정규화 분모(maxViews, maxLikes)가 달라지지 않도록 전체 후보 집합에 한 번만 적용한 뒤 슬라이스한다.
  const scores = computeWorkListTrendingScores(
    staged.map((item) => ({
      totalViews: item.viewCount,
      likeCount: item.likeCount,
      ctr: item.ctr,
    }))
  );

  const scoredItems: WorkSeriesItem[] = staged.map((item, idx) => ({
    ...item,
    trendingScore: scores[idx] ?? 0,
  }));

  const sortedItems = sortWorkSeriesItems(scoredItems, effectiveSort);
  const total = sortedItems.length;
  const page = normalizeWorkListPage(params.page, total, WORK_LIST_PAGE_SIZE);
  const items = sortedItems.slice(0, page * WORK_LIST_PAGE_SIZE);
  const shown = items.length;

  return {
    items,
    total,
    shown,
    page,
    hasMore: shown < total,
  };
}

/**
 * 독자 연재 목록(Phase 21) 및 랭킹(Phase 23) 공용 서버 조회 API.
 *
 * 구현·성능 메모:
 * 1. 무료/유료 단일 분류(`price_tier`), 연재 시작일(최초 공개 `published_at`), 최근 업데이트일(마지막 공개 `published_at`),
 *    다음화 이동률(`ctr`)이 모두 `chapters` 집계에 의존하므로 단일 PostgREST range 슬라이싱으로는 정확한 정렬·필터·총 건수(`total`)를 구할 수 없다.
 * 2. 따라서 `works`와 공개 판정에 필요한 최소 회차 필드(`order_index, is_published, deleted_at, published_at, price_tier, view_count`) 및
 *    작가 필명(`profiles(pen_name)` 조인으로 N+1 회피)을 안정적인 `id` 순서로 1000행(`WORK_LIST_QUERY_BATCH_SIZE`)씩 반복 조회한다.
 * 3. 삭제(`deleted_at IS NULL`)·관리자 블라인드(`admin_blinded = false`)·세계수 가지 초안(`is_branch_draft = false`, 0050 공개 정책 정합)을 명시적으로 제외한다.
 * 4. `work_likes`는 URL/헤더 길이 한도를 넘지 않도록 150개(`WORK_LIKE_QUERY_BATCH_SIZE`) 단위로 배치 조회한다.
 * 5. 한계 및 전환 지점: 작품·회차 수가 크게 증가하면 전체 읽기 응답 크기·메모리·지연이 선형 증가하므로,
 *    향후 작품별 공개 회차 요약(시작일·최근 업데이트·유료 여부·최저 단가·첫 유료 순번·조회수 합)을 제공하는 SQL 뷰/RPC로 집계 계층을 이전한다(이번 Phase에서는 마이그레이션 추가 없음).
 */
export async function listWorkSeries(
  supabase: SupabaseClient,
  params: WorkListQueryParams = {}
): Promise<WorkSeriesResult> {
  const rawWorks: RawWorkListRow[] = [];
  const genreFilter =
    params.genre && params.genre !== '전체' ? params.genre : null;

  for (let from = 0; ; from += WORK_LIST_QUERY_BATCH_SIZE) {
    let query = supabase
      .from('works')
      .select(
        'id, title, cover_image_url, genre, serial_status, profiles(pen_name), chapters(order_index, is_published, deleted_at, published_at, price_tier, view_count)'
      )
      .is('deleted_at', null)
      .eq('admin_blinded', false)
      .eq('is_branch_draft', false);

    if (genreFilter) {
      query = query.eq('genre', genreFilter);
    }

    const { data, error } = await query
      .order('id')
      .range(from, from + WORK_LIST_QUERY_BATCH_SIZE - 1);

    if (error) {
      throw new Error(error.message);
    }

    const batch = (data ?? []) as unknown as RawWorkListRow[];
    rawWorks.push(...batch);

    if (!data || data.length < WORK_LIST_QUERY_BATCH_SIZE) {
      break;
    }
  }

  const workIds = rawWorks.map((work) => work.id);
  const likeCounts = new Map<string, number>();

  for (let i = 0; i < workIds.length; i += WORK_LIKE_QUERY_BATCH_SIZE) {
    const batchIds = workIds.slice(i, i + WORK_LIKE_QUERY_BATCH_SIZE);
    const { data: likeRows, error: likeError } = await supabase
      .from('work_likes')
      .select('work_id')
      .in('work_id', batchIds);

    if (likeError) {
      throw new Error(likeError.message);
    }

    for (const row of (likeRows ?? []) as { work_id: string }[]) {
      likeCounts.set(row.work_id, (likeCounts.get(row.work_id) ?? 0) + 1);
    }
  }

  return buildWorkSeriesResult(rawWorks, likeCounts, params);
}
