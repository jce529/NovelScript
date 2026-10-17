import { describe, expect, it } from 'vitest';
import { READER_MAIN_TABS, getHeaderVariant, getSubRow } from '@/lib/reader/navigation';

describe('reader navigation', () => {
  it('has four main tabs in order', () => {
    expect(READER_MAIN_TABS.map((t) => t.label)).toEqual(['무료연재', '유료연재', '랭킹', '내서재']);
  });
  it('returns confirmed sub rows per tab', () => {
    expect(getSubRow('free').map((s) => s.label)).toEqual(['전체', '신작', '인기', '완결']);
    expect(getSubRow('paid').map((s) => s.label)).toEqual(['전체', '신작', '인기', '완결']);
    expect(getSubRow('ranking').map((s) => s.label)).toEqual(['주간 랭킹', '루키 쿼터존', '명예의 전당', '완결작']);
    expect(getSubRow('library').map((s) => s.label)).toEqual(['이어 읽기', '선호작', '알림 구독', '소장함']);
  });
  it('does not guess hrefs for missing destinations', () => {
    expect(getSubRow('ranking')[0].href).toBe('/#weekly-ranking');
    expect(getSubRow('free').every((s) => s.href === null)).toBe(true);
  });
  it('classifies routes', () => {
    expect(getHeaderVariant('/')).toBe('reader');
    expect(getHeaderVariant('/works/abc')).toBe('reader');
    expect(getHeaderVariant('/works/abc/')).toBe('reader');
    expect(getHeaderVariant('/works/abc/chapters/def')).toBe('viewer');
    for (const p of ['/studio', '/studio/works/1', '/admin', '/admin/x', '/account', '/write', '/start', '/login']) {
      expect(getHeaderVariant(p)).toBe('compact');
    }
    expect(getHeaderVariant(null)).toBe('reader');
  });
});
