import { describe, expect, it } from 'vitest';
import { computeTrendingScores } from '@/lib/discovery/actions';
import {
  NEW_BADGE_DAYS,
  WORK_LIST_PAGE_SIZE,
  WORK_LIST_SORT_DESCRIPTIONS,
  buildWorkSeriesResult,
  classifyWorkKind,
  computeWorkListTrendingScores,
  formatWorkPriceLabel,
  getDefaultWorkListSort,
  getWorkBadge,
  getWorkListSortKey,
  getWorkPriceLabel,
  normalizeWorkListPage,
  resolveWorkBadge,
  sortWorkSeriesItems,
  summarizePublicChapters,
  type RawWorkListRow,
  type WorkListChapterInput,
} from '@/lib/discovery/work-list';

describe('work-list pure domain functions (Task 1)', () => {
  const NOW = new Date('2026-11-13T12:00:00.000Z');

  describe('constants & copy', () => {
    it('exports NEW_BADGE_DAYS=14, WORK_LIST_PAGE_SIZE=24, and approved sort descriptions', () => {
      expect(NEW_BADGE_DAYS).toBe(14);
      expect(WORK_LIST_PAGE_SIZE).toBe(24);
      expect(WORK_LIST_SORT_DESCRIPTIONS).toEqual({
        updated: '최근 회차가 올라온 순서예요.',
        started: '연재를 시작한 날이 가까운 순서예요.',
        popular: '조회수·좋아요·다음화 이동률을 종합한 순서예요.',
      });
    });
  });

  describe('summarizePublicChapters & classifyWorkKind (D-02, D-05)', () => {
    it('excludes works with 0 public non-deleted chapters', () => {
      expect(summarizePublicChapters([])).toBeNull();
      expect(
        summarizePublicChapters([
          {
            order_index: 0,
            is_published: false,
            deleted_at: null,
            published_at: '2026-11-01T00:00:00.000Z',
            price_tier: null,
            view_count: 100,
          },
          {
            order_index: 1,
            is_published: true,
            deleted_at: '2026-11-02T00:00:00.000Z',
            published_at: '2026-11-01T00:00:00.000Z',
            price_tier: 30,
            view_count: 50,
          },
          {
            order_index: 2,
            is_published: true,
            deleted_at: null,
            published_at: null,
            price_tier: null,
            view_count: 20,
          },
        ])
      ).toBeNull();
    });

    it('classifies free vs paid strictly by public chapters having price_tier != null && price_tier > 0', () => {
      const chaptersWithUnpublishedPaid: WorkListChapterInput[] = [
        {
          order_index: 0,
          is_published: true,
          deleted_at: null,
          published_at: '2026-11-01T00:00:00.000Z',
          price_tier: null,
          view_count: 10,
        },
        {
          order_index: 1,
          is_published: true,
          deleted_at: null,
          published_at: '2026-11-02T00:00:00.000Z',
          price_tier: 0,
          view_count: 10,
        },
        // 비공개 유료 회차와 삭제된 유료 회차는 분류에 영향을 주지 않는다.
        {
          order_index: 2,
          is_published: false,
          deleted_at: null,
          published_at: '2026-11-03T00:00:00.000Z',
          price_tier: 50,
          view_count: 0,
        },
        {
          order_index: 3,
          is_published: true,
          deleted_at: '2026-11-04T00:00:00.000Z',
          published_at: '2026-11-03T00:00:00.000Z',
          price_tier: 100,
          view_count: 0,
        },
      ];

      const freeSummary = summarizePublicChapters(chaptersWithUnpublishedPaid);
      expect(freeSummary).not.toBeNull();
      expect(freeSummary?.kind).toBe('free');
      expect(freeSummary?.isPaid).toBe(false);
      expect(freeSummary?.publishedChapterCount).toBe(2);
      expect(classifyWorkKind(chaptersWithUnpublishedPaid)).toBe('free');

      const paidChapters: WorkListChapterInput[] = [
        ...chaptersWithUnpublishedPaid,
        {
          order_index: 4,
          is_published: true,
          deleted_at: null,
          published_at: '2026-11-05T00:00:00.000Z',
          price_tier: 10,
          view_count: 5,
        },
      ];
      const paidSummary = summarizePublicChapters(paidChapters);
      expect(paidSummary?.kind).toBe('paid');
      expect(paidSummary?.isPaid).toBe(true);
      expect(paidSummary?.publishedChapterCount).toBe(3);
      expect(classifyWorkKind(paidChapters)).toBe('paid');
    });

    it('derives startedAt from minimum published_at and updatedAt from maximum published_at of public chapters', () => {
      const chapters: WorkListChapterInput[] = [
        {
          order_index: 2,
          is_published: true,
          deleted_at: null,
          published_at: '2026-11-10T08:00:00.000Z',
          price_tier: 30,
          view_count: 40,
        },
        {
          order_index: 0,
          is_published: true,
          deleted_at: null,
          published_at: '2026-11-01T09:30:00.000Z',
          price_tier: null,
          view_count: 100,
        },
        {
          order_index: 1,
          is_published: true,
          deleted_at: null,
          published_at: '2026-11-05T15:00:00.000Z',
          price_tier: null,
          view_count: 80,
        },
      ];

      const summary = summarizePublicChapters(chapters);
      expect(summary).not.toBeNull();
      expect(summary?.startedAt).toBe('2026-11-01T09:30:00.000Z');
      expect(summary?.updatedAt).toBe('2026-11-10T08:00:00.000Z');
      expect(summary?.publishedPriceTiers).toEqual([null, null, 30]);
      expect(summary?.firstPaidEpisodeOrder).toBe(3);
      expect(summary?.minPaidPriceTier).toBe(30);
    });
  });

  describe('resolveWorkBadge / getWorkBadge (D-06, UI-SPEC 3절)', () => {
    it('prioritizes completed over NEW even when startedAt is within 14 days', () => {
      expect(
        resolveWorkBadge({
          serialStatus: 'completed',
          startedAt: '2026-11-13T00:00:00.000Z',
          now: NOW,
        })
      ).toBe('completed');
    });

    it('grants NEW when 0 <= now - startedAt <= 14 days (including exact 0 and exact 14-day boundary)', () => {
      // 정확히 0ms 차이
      expect(
        getWorkBadge({
          serialStatus: 'ongoing',
          startedAt: '2026-11-13T12:00:00.000Z',
          now: NOW,
        })
      ).toBe('new');

      // 정확히 14일(NEW_BADGE_DAYS) 경계 포함
      const exact14DaysAgo = new Date(NOW.getTime() - NEW_BADGE_DAYS * 86_400_000).toISOString();
      expect(
        getWorkBadge({
          serialStatus: 'ongoing',
          startedAt: exact14DaysAgo,
          now: NOW,
        })
      ).toBe('new');
    });

    it('returns null when older than 14 days or when startedAt is in the future', () => {
      const over14DaysAgo = new Date(NOW.getTime() - NEW_BADGE_DAYS * 86_400_000 - 1).toISOString();
      expect(
        resolveWorkBadge({
          serialStatus: 'ongoing',
          startedAt: over14DaysAgo,
          now: NOW,
        })
      ).toBeNull();

      // 미래 시작일 제외 (now - startedAt < 0)
      const futureStartedAt = new Date(NOW.getTime() + 1000).toISOString();
      expect(
        resolveWorkBadge({
          serialStatus: 'ongoing',
          startedAt: futureStartedAt,
          now: NOW,
        })
      ).toBeNull();
    });
  });

  describe('formatWorkPriceLabel / getWorkPriceLabel (D-07, UI-SPEC 3절·7절)', () => {
    it('returns "무료" when no public chapter has a positive price_tier', () => {
      expect(formatWorkPriceLabel([null, null, 0])).toBe('무료');
      expect(getWorkPriceLabel({ publishedPriceTiers: [null, null] })).toBe('무료');
    });

    it('returns "{N}화부터 유료" (N >= 2) using 1-based order among public chapters sorted by order_index ascending', () => {
      // 1화 무료, 2화 유료 -> 2화부터 유료
      expect(formatWorkPriceLabel([null, 10, 30])).toBe('2화부터 유료');

      // order_index에 빈 번호(0, 5, 10, 20)가 있어도 공개·미삭제 회차 오름차순 1-based 순번(4화)을 사용한다.
      const chaptersWithGaps: WorkListChapterInput[] = [
        { order_index: 20, is_published: true, deleted_at: null, published_at: '2026-11-04T00:00:00.000Z', price_tier: 50 },
        { order_index: 0, is_published: true, deleted_at: null, published_at: '2026-11-01T00:00:00.000Z', price_tier: null },
        { order_index: 1, is_published: false, deleted_at: null, published_at: '2026-11-01T00:00:00.000Z', price_tier: 10 }, // 비공개 제외
        { order_index: 2, is_published: true, deleted_at: '2026-11-02T00:00:00.000Z', published_at: '2026-11-02T00:00:00.000Z', price_tier: 10 }, // 삭제 제외
        { order_index: 5, is_published: true, deleted_at: null, published_at: '2026-11-02T00:00:00.000Z', price_tier: null },
        { order_index: 10, is_published: true, deleted_at: null, published_at: '2026-11-03T00:00:00.000Z', price_tier: null },
      ];
      expect(formatWorkPriceLabel({ chapters: chaptersWithGaps })).toBe('4화부터 유료');
    });

    it('returns "회차당 {N}토큰~" with minimum positive price_tier when paid from chapter 1', () => {
      expect(formatWorkPriceLabel([30, 50, 10, 100])).toBe('회차당 10토큰~');
      // 1화가 유료이면 뒤에 무료 회차가 섞여 있어도 "1화부터 유료" 문구 대신 최저 단가를 표시한다.
      expect(formatWorkPriceLabel([50, null, 30])).toBe('회차당 30토큰~');
      expect(formatWorkPriceLabel([100])).toBe('회차당 100토큰~');
    });
  });

  describe('sorting, tie-breaking, sub=new semantics, and completed + sort override independence (D-04, D-05)', () => {
    const rawWorks: RawWorkListRow[] = [
      {
        id: 'work-b',
        title: '작품 B (연재중, 동률 시작일 늦음)',
        cover_image_url: null,
        genre: '판타지',
        serial_status: 'ongoing',
        profiles: { pen_name: '작가B' },
        chapters: [
          {
            order_index: 0,
            is_published: true,
            deleted_at: null,
            published_at: '2026-10-05T00:00:00.000Z',
            price_tier: null,
            view_count: 100,
          },
          {
            order_index: 1,
            is_published: true,
            deleted_at: null,
            published_at: '2026-11-10T00:00:00.000Z',
            price_tier: null,
            view_count: 100,
          },
        ],
      },
      {
        id: 'work-a',
        title: '작품 A (완결, 동률 시작일·ID 앞섬)',
        cover_image_url: 'https://example.com/a.jpg',
        genre: '판타지',
        serial_status: 'completed',
        profiles: { pen_name: '작가A' },
        chapters: [
          {
            order_index: 0,
            is_published: true,
            deleted_at: null,
            published_at: '2026-10-05T00:00:00.000Z',
            price_tier: null,
            view_count: 100,
          },
          {
            order_index: 1,
            is_published: true,
            deleted_at: null,
            published_at: '2026-11-10T00:00:00.000Z',
            price_tier: null,
            view_count: 100,
          },
        ],
      },
      {
        id: 'work-c',
        title: '작품 C (완결, 30일 전 시작·최고 인기)',
        cover_image_url: null,
        genre: '판타지',
        serial_status: 'completed',
        profiles: { pen_name: null },
        chapters: [
          {
            order_index: 0,
            is_published: true,
            deleted_at: null,
            published_at: '2026-10-01T00:00:00.000Z',
            price_tier: null,
            view_count: 500,
          },
          {
            order_index: 1,
            is_published: true,
            deleted_at: null,
            published_at: '2026-11-08T00:00:00.000Z',
            price_tier: null,
            view_count: 500,
          },
        ],
      },
      {
        id: 'work-d',
        title: '작품 D (연재중, 가장 최근 시작)',
        cover_image_url: null,
        genre: '판타지',
        serial_status: 'ongoing',
        profiles: [{ pen_name: '작가D' }],
        chapters: [
          {
            order_index: 0,
            is_published: true,
            deleted_at: null,
            published_at: '2026-11-12T00:00:00.000Z',
            price_tier: null,
            view_count: 10,
          },
        ],
      },
    ];

    it('uses computeTrendingScores once via adapter and selects sort key in getWorkListSortKey', () => {
      const inputs = [
        { totalViews: 200, likeCount: 10, ctr: 1 },
        { totalViews: 1000, likeCount: 50, ctr: 1 },
      ];
      expect(computeWorkListTrendingScores(inputs)).toEqual(computeTrendingScores(inputs));

      const sample = {
        id: 'w-1',
        updatedAt: '2026-11-10T00:00:00.000Z',
        startedAt: '2026-11-01T00:00:00.000Z',
        trendingScore: 87,
      };
      expect(getWorkListSortKey(sample, 'popular')).toBe(87);
      expect(getWorkListSortKey(sample, 'started')).toBe(Date.parse('2026-11-01T00:00:00.000Z'));
      expect(getWorkListSortKey(sample, 'updated')).toBe(Date.parse('2026-11-10T00:00:00.000Z'));
    });

    it('breaks ties by startedAt descending then work id ascending', () => {
      const tiedItems = [
        {
          id: 'work-z',
          updatedAt: '2026-11-10T00:00:00.000Z',
          startedAt: '2026-11-01T00:00:00.000Z',
          trendingScore: 80,
        },
        {
          id: 'work-a',
          updatedAt: '2026-11-10T00:00:00.000Z',
          startedAt: '2026-11-01T00:00:00.000Z',
          trendingScore: 80,
        },
        {
          id: 'work-m',
          updatedAt: '2026-11-10T00:00:00.000Z',
          startedAt: '2026-11-05T00:00:00.000Z',
          trendingScore: 80,
        },
      ];

      expect(sortWorkSeriesItems(tiedItems, 'popular').map((i) => i.id)).toEqual([
        'work-m',
        'work-a',
        'work-z',
      ]);
      expect(sortWorkSeriesItems(tiedItems, 'updated').map((i) => i.id)).toEqual([
        'work-m',
        'work-a',
        'work-z',
      ]);
    });

    it('treats sub=new as startedAt descending across all works (NOT a 14-day filter)', () => {
      expect(getDefaultWorkListSort('new')).toBe('started');
      const result = buildWorkSeriesResult(rawWorks, new Map(), {
        kind: 'free',
        sub: 'new',
      });
      // 14일이 지난 work-a, work-b, work-c도 모두 포함되며 시작일 최신순(work-d -> work-a -> work-b -> work-c)으로 정렬된다.
      expect(result.total).toBe(4);
      expect(result.items.map((w) => w.id)).toEqual(['work-d', 'work-a', 'work-b', 'work-c']);
    });

    it('keeps sub=completed filter independent from sort overrides (updated, started, popular)', () => {
      const likes = new Map<string, number>([
        ['work-a', 5],
        ['work-c', 50],
      ]);

      // 기본 완결 정렬 = updated (work-a 11/10 > work-c 11/08)
      const completedUpdated = buildWorkSeriesResult(rawWorks, likes, {
        kind: 'free',
        sub: 'completed',
      });
      expect(completedUpdated.items.map((w) => w.id)).toEqual(['work-a', 'work-c']);

      // 완결 + 인기순 override (work-c > work-a)
      const completedPopular = buildWorkSeriesResult(rawWorks, likes, {
        kind: 'free',
        sub: 'completed',
        sort: 'popular',
      });
      expect(completedPopular.items.map((w) => w.id)).toEqual(['work-c', 'work-a']);

      // 완결 + 연재 시작일순 override (work-a 10/05 > work-c 10/01)
      const completedStarted = buildWorkSeriesResult(rawWorks, likes, {
        kind: 'free',
        sub: 'completed',
        sort: 'started',
      });
      expect(completedStarted.items.map((w) => w.id)).toEqual(['work-a', 'work-c']);
    });

    it('computes trending scores on the full candidate set before slicing so page 1 and page 2 share identical scores', () => {
      // 25개 작품 생성: 25번째 작품(work-25)이 압도적인 좋아요 수를 가져 정규화 분모(maxLikes)를 결정한다.
      const manyWorks: RawWorkListRow[] = Array.from({ length: 25 }, (_, idx) => {
        const num = String(idx + 1).padStart(2, '0');
        return {
          id: `work-${num}`,
          title: `작품 ${num}`,
          cover_image_url: null,
          genre: '로맨스',
          serial_status: 'ongoing',
          profiles: { pen_name: `작가${num}` },
          chapters: [
            {
              order_index: 0,
              is_published: true,
              deleted_at: null,
              published_at: `2026-10-${String((idx % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
              price_tier: null,
              view_count: (25 - idx) * 10,
            },
          ],
        };
      });
      const likes = new Map<string, number>([
        ['work-01', 10],
        ['work-25', 1000], // updated 정렬에서는 2페이지(25번째)에 위치하지만 전체 정규화 분모에 포함되어야 함
      ]);

      const page1 = buildWorkSeriesResult(manyWorks, likes, {
        kind: 'free',
        sub: 'all',
        sort: 'updated',
        page: 1,
      });
      const page2 = buildWorkSeriesResult(manyWorks, likes, {
        kind: 'free',
        sub: 'all',
        sort: 'updated',
        page: 2,
      });

      expect(page1.items).toHaveLength(24);
      expect(page2.items).toHaveLength(25);
      expect(page1.items.map((w) => ({ id: w.id, score: w.trendingScore }))).toEqual(
        page2.items.slice(0, 24).map((w) => ({ id: w.id, score: w.trendingScore }))
      );
    });

    it('normalizes invalid or out-of-range page values cleanly', () => {
      expect(normalizeWorkListPage(0, 50)).toBe(1);
      expect(normalizeWorkListPage(-3, 50)).toBe(1);
      expect(normalizeWorkListPage(Number.NaN, 50)).toBe(1);
      expect(normalizeWorkListPage(undefined, 50)).toBe(1);
      expect(normalizeWorkListPage(3, 50)).toBe(3);
      expect(normalizeWorkListPage(99, 50)).toBe(3);
      expect(normalizeWorkListPage(5, 0)).toBe(1);
    });
  });
});
