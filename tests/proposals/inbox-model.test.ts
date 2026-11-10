import { describe, expect, it } from 'vitest';
import {
  INBOX_PATH, chapterBadgeAriaLabel, chapterInboxHref, countBadgeText, firstParam, headerLinkAriaLabel,
  headerLinkShowsBadge, inboxHref, inboxResultStatus, parseInboxKind,
} from '@/components/proposals/inbox-model';

const W = '33333333-3333-4333-8333-333333333333';
const C = '55555555-5555-4555-8555-555555555551';

describe('inbox-model', () => {
  it('leaves defaults out of the URL and keeps the rest', () => {
    expect(inboxHref()).toBe(INBOX_PATH);
    expect(inboxHref({ status: 'pending', kind: 'all' })).toBe(INBOX_PATH);
    expect(inboxHref({ status: 'done' })).toBe(`${INBOX_PATH}?status=done`);
    expect(inboxHref({ kind: 'kb', workId: W })).toBe(`${INBOX_PATH}?kind=kb&work=${W}`);
    expect(inboxHref({ status: 'all', kind: 'draft', workId: W, chapterId: C })).toBe(`${INBOX_PATH}?status=all&kind=draft&work=${W}&chapter=${C}`);
  });

  it('never emits a chapter scope without its work', () => {
    expect(inboxHref({ chapterId: C })).toBe(INBOX_PATH);
    expect(chapterInboxHref(W, C)).toBe(`${INBOX_PATH}?work=${W}&chapter=${C}`);
  });

  it('parses kind and params defensively', () => {
    expect(parseInboxKind('draft')).toBe('draft');
    expect(parseInboxKind('kb')).toBe('kb');
    expect(parseInboxKind('all')).toBe('all');
    expect(parseInboxKind('<script>')).toBe('all');
    expect(parseInboxKind(undefined)).toBe('all');
    expect(parseInboxKind(['kb', 'draft'])).toBe('kb');
    expect(firstParam(undefined)).toBeNull();
    expect(firstParam('')).toBeNull();
    expect(firstParam(['a', 'b'])).toBe('a');
  });

  it('labels the header entry: count when > 0, history name otherwise, 99+ cap', () => {
    expect(headerLinkAriaLabel(3)).toBe('AI 검토 대기 3건');
    expect(headerLinkAriaLabel(0)).toBe('AI 검토 이력');
    expect(headerLinkAriaLabel(null)).toBe('AI 검토 이력');
    expect(headerLinkShowsBadge(0)).toBe(false);
    expect(headerLinkShowsBadge(null)).toBe(false);
    expect(headerLinkShowsBadge(2)).toBe(true);
    expect(countBadgeText(99)).toBe('99');
    expect(countBadgeText(100)).toBe('99+');
    expect(chapterBadgeAriaLabel('1화', 2)).toBe('1화에 온 AI 초안 2건 검토');
    expect(inboxResultStatus(0)).toBe('조건에 맞는 제안이 없어요.');
    expect(inboxResultStatus(4)).toBe('4건');
  });
});
