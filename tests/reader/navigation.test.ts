import { describe, expect, it } from 'vitest';
import {
  READER_MAIN_TABS,
  buildSubRowHref,
  getActiveMainTab,
  getActiveSubKey,
  getHeaderVariant,
  getMainTabHref,
  getSubRow,
} from '@/lib/reader/navigation';

describe('reader navigation', () => {
  it('has four main tabs in order with connected free/paid hrefs and null for unimplemented tabs', () => {
    expect(READER_MAIN_TABS.map((t) => t.label)).toEqual([
      '무료연재',
      '유료연재',
      '랭킹',
      '내서재',
    ]);
    expect(READER_MAIN_TABS.map((t) => t.href)).toEqual([
      '/series/free',
      '/series/paid',
      null,
      null,
    ]);
    expect(getMainTabHref('free')).toBe('/series/free');
    expect(getMainTabHref('paid')).toBe('/series/paid');
    expect(getMainTabHref('ranking')).toBeNull();
    expect(getMainTabHref('library')).toBeNull();
  });

  it('returns confirmed sub rows per tab', () => {
    expect(getSubRow('free').map((s) => s.label)).toEqual(['전체', '신작', '인기', '완결']);
    expect(getSubRow('paid').map((s) => s.label)).toEqual(['전체', '신작', '인기', '완결']);
    expect(getSubRow('ranking').map((s) => s.label)).toEqual([
      '주간 랭킹',
      '루키 쿼터존',
      '명예의 전당',
      '완결작',
    ]);
    expect(getSubRow('library').map((s) => s.label)).toEqual([
      '이어 읽기',
      '선호작',
      '알림 구독',
      '소장함',
    ]);
  });

  it('connects all 8 free/paid sub-row hrefs while preserving null on unimplemented ranking/library items', () => {
    expect(getSubRow('free').map((s) => s.href)).toEqual([
      '/series/free',
      '/series/free?sub=new',
      '/series/free?sub=popular',
      '/series/free?sub=completed',
    ]);
    expect(getSubRow('paid').map((s) => s.href)).toEqual([
      '/series/paid',
      '/series/paid?sub=new',
      '/series/paid?sub=popular',
      '/series/paid?sub=completed',
    ]);
    expect(getSubRow('ranking').map((s) => s.href)).toEqual([
      '/#weekly-ranking',
      null,
      null,
      null,
    ]);
    expect(getSubRow('library').every((s) => s.href === null)).toBe(true);
  });

  it('classifies routes including /series/free and /series/paid as reader', () => {
    expect(getHeaderVariant('/')).toBe('reader');
    expect(getHeaderVariant('/works/abc')).toBe('reader');
    expect(getHeaderVariant('/works/abc/')).toBe('reader');
    expect(getHeaderVariant('/series/free')).toBe('reader');
    expect(getHeaderVariant('/series/paid')).toBe('reader');
    expect(getHeaderVariant('/series/free/')).toBe('reader');
    expect(getHeaderVariant('/series/paid/')).toBe('reader');
    expect(getHeaderVariant('/search')).toBe('reader');
    expect(getHeaderVariant('/author/author-1')).toBe('reader');
    expect(getHeaderVariant('/works/abc/chapters/def')).toBe('viewer');
    for (const p of [
      '/studio',
      '/studio/works/1',
      '/admin',
      '/admin/x',
      '/account',
      '/write',
      '/start',
      '/login',
    ]) {
      expect(getHeaderVariant(p)).toBe('compact');
    }
    expect(getHeaderVariant(null)).toBe('reader');
  });

  it('derives active main tab from pathname (free, paid, null on /search and /author/[id], free fallback elsewhere)', () => {
    expect(getActiveMainTab('/series/free')).toBe('free');
    expect(getActiveMainTab('/series/free/')).toBe('free');
    expect(getActiveMainTab('/series/free?sub=new')).toBe('free');
    expect(getActiveMainTab('/series/paid')).toBe('paid');
    expect(getActiveMainTab('/series/paid/')).toBe('paid');
    expect(getActiveMainTab('/series/paid?sub=completed')).toBe('paid');

    expect(getActiveMainTab('/search')).toBeNull();
    expect(getActiveMainTab('/search?q=판타지')).toBeNull();
    expect(getActiveMainTab('/author/user-123')).toBeNull();
    expect(getActiveMainTab('/author/user-123/')).toBeNull();

    expect(getActiveMainTab('/')).toBe('free');
    expect(getActiveMainTab('/works/abc')).toBe('free');
    expect(getActiveMainTab(null)).toBe('free');
    expect(getActiveMainTab(undefined)).toBe('free');
  });

  it('normalizes sub active key and builds sub-row hrefs preserving genre while dropping sort and page', () => {
    expect(getActiveSubKey(null)).toBe('all');
    expect(getActiveSubKey(undefined)).toBe('all');
    expect(getActiveSubKey('all')).toBe('all');
    expect(getActiveSubKey('unknown')).toBe('all');
    expect(getActiveSubKey('new')).toBe('new');
    expect(getActiveSubKey('popular')).toBe('popular');
    expect(getActiveSubKey('completed')).toBe('completed');

    const freeSub = getSubRow('free');
    const query = new URLSearchParams('sub=popular&genre=판타지&sort=started&page=3');

    expect(decodeURIComponent(buildSubRowHref(freeSub[0], query)!)).toBe(
      '/series/free?genre=판타지',
    );
    expect(decodeURIComponent(buildSubRowHref(freeSub[1], query)!)).toBe(
      '/series/free?sub=new&genre=판타지',
    );
    expect(decodeURIComponent(buildSubRowHref(freeSub[2], query)!)).toBe(
      '/series/free?sub=popular&genre=판타지',
    );
    expect(decodeURIComponent(buildSubRowHref(freeSub[3], query)!)).toBe(
      '/series/free?sub=completed&genre=판타지',
    );

    // Invalid or '전체' genre is omitted
    const invalidGenreQuery = new URLSearchParams('genre=없는장르&sort=popular&page=2');
    expect(buildSubRowHref(freeSub[0], invalidGenreQuery)).toBe('/series/free');
    expect(buildSubRowHref(freeSub[1], invalidGenreQuery)).toBe('/series/free?sub=new');

    // Non-series sub items stay untouched
    expect(buildSubRowHref(getSubRow('ranking')[0], query)).toBe('/#weekly-ranking');
    expect(buildSubRowHref(getSubRow('ranking')[1], query)).toBeNull();
  });
});
