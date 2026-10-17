import { describe, expect, it } from 'vitest';
import { getWorkReadingStats, paginateChapters, resolveResumeChapter, sumViewCounts, CHAPTERS_PER_PAGE } from '@/lib/reader/work-detail';
import type { PublicChapterListItem } from '@/lib/chapters/actions';

const row = (orderIndex: number, over: Partial<PublicChapterListItem> = {}): PublicChapterListItem => ({
  id: `c${orderIndex}`, title: `t${orderIndex}`, orderIndex, priceTier: null, locked: false,
  state: 'readable', blinded: false, entitled: false, blindReason: null, ...over,
});
const rows = (n: number) => Array.from({ length: n }, (_, i) => row(i));

describe('getWorkReadingStats', () => {
  it('returns null (not 0%) because rates are not computed yet', () => {
    expect(getWorkReadingStats()).toEqual({ completionRate: null, continuationRate: null });
  });
});

describe('paginateChapters', () => {
  it('uses 10 rows per page', () => expect(CHAPTERS_PER_PAGE).toBe(10));
  it('0 rows -> empty contract', () => {
    expect(paginateChapters([], 1)).toEqual({ items: [], page: 1, pageCount: 0, total: 0, buttons: [], empty: true });
  });
  it('10 rows -> one page', () => {
    const r = paginateChapters(rows(10), 1);
    expect(r.items).toHaveLength(10);
    expect(r.buttons).toEqual([1]);
    expect(r.pageCount).toBe(1);
  });
  it('11 rows page 2 -> last row, buttons [1,2]', () => {
    const r = paginateChapters(rows(11), 2);
    expect(r.items.map((c) => c.id)).toEqual(['c10']);
    expect(r.buttons).toEqual([1, 2]);
  });
  it('51 rows page 6 -> 1 row, buttons [6]', () => {
    const r = paginateChapters(rows(51), 6);
    expect(r.items).toHaveLength(1);
    expect(r.buttons).toEqual([6]);
    expect(r.pageCount).toBe(6);
  });
  it('51 rows page 1 -> buttons 1-5', () => {
    expect(paginateChapters(rows(51), 1).buttons).toEqual([1, 2, 3, 4, 5]);
  });
  it('clamps out-of-range and invalid pages', () => {
    expect(paginateChapters(rows(11), 99).page).toBe(2);
    expect(paginateChapters(rows(11), 0).page).toBe(1);
    expect(paginateChapters(rows(11), -3).page).toBe(1);
    expect(paginateChapters(rows(11), 1.5).page).toBe(1);
    expect(paginateChapters(rows(11), Number.NaN).page).toBe(1);
  });
  it('keeps original orderIndex gaps and blinded/entitled state', () => {
    const list = [row(0), row(2, { blinded: true, state: 'blinded', locked: true }), row(5, { entitled: true })];
    const r = paginateChapters(list, 1);
    expect(r.items.map((c) => c.orderIndex)).toEqual([0, 2, 5]);
    expect(r.items[1].blinded).toBe(true);
    expect(r.items[2].entitled).toBe(true);
  });
});

describe('resolveResumeChapter', () => {
  it('no progress -> first chapter, not resumed', () => {
    expect(resolveResumeChapter(rows(3), null)).toEqual({ chapterId: 'c0', orderIndex: 0, resumed: false });
  });
  it('valid progress -> resumed with original index', () => {
    expect(resolveResumeChapter(rows(3), { chapterId: 'c2' })).toEqual({ chapterId: 'c2', orderIndex: 2, resumed: true });
  });
  it('vanished chapter id falls back to first public chapter', () => {
    expect(resolveResumeChapter(rows(3), { chapterId: 'gone' })).toEqual({ chapterId: 'c0', orderIndex: 0, resumed: false });
  });
  it('prefers a non-blinded first chapter', () => {
    const list = [row(0, { blinded: true, state: 'blinded', locked: true }), row(1)];
    expect(resolveResumeChapter(list, null)?.chapterId).toBe('c1');
  });
  it('no chapters -> null', () => {
    expect(resolveResumeChapter([], { chapterId: 'x' })).toBeNull();
  });
});

describe('sumViewCounts', () => {
  it('sums metadata counts and ignores bad values', () => {
    expect(sumViewCounts([{ view_count: 3 }, { view_count: 4 }, { view_count: null }])).toBe(7);
    expect(sumViewCounts(null)).toBe(0);
  });
});
