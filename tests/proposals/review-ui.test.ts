import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ProposalSummary } from '@/lib/proposals/queries';

// --- module mocks (UI primitives -> plain elements, server deps -> stubs) ---------------
type MockProps = { children?: React.ReactNode; render?: React.ReactElement; initialFocus?: unknown; finalFocus?: unknown; [key: string]: unknown };
vi.mock('next/link', () => ({ default: ({ children, href, ...props }: MockProps) => React.createElement('a', { href, ...props }, children) }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
  redirect: (to: string) => { throw new Error(`NEXT_REDIRECT ${to}`); },
}));
vi.mock('@/components/ui/button', () => ({ Button: ({ children, render, ...props }: MockProps) => render ? React.cloneElement(render, props as Record<string, unknown>, children) : React.createElement('button', props, children) }));
vi.mock('@/components/ui/badge', () => ({ Badge: ({ children, ...props }: MockProps) => React.createElement('span', props, children) }));
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: MockProps) => React.createElement('div', { 'data-dialog-open': String(!!open) }, children),
  DialogTrigger: ({ children, render }: MockProps) => render ?? children,
  DialogContent: ({ children, initialFocus }: MockProps) => React.createElement('div', { 'data-initial-focus': String(!!initialFocus) }, children),
  DialogDescription: ({ children }: MockProps) => React.createElement('div', null, children),
  DialogFooter: ({ children }: MockProps) => React.createElement('div', null, children),
  DialogHeader: ({ children }: MockProps) => React.createElement('div', null, children),
  DialogTitle: ({ children }: MockProps) => React.createElement('h2', null, children),
  DialogClose: ({ children, render }: MockProps) => render ?? children,
}));
vi.mock('@/components/ui/textarea', () => ({ Textarea: (props: MockProps) => React.createElement('textarea', props) }));
const actionMocks = vi.hoisted(() => ({ accept: vi.fn(), reject: vi.fn(), revert: vi.fn() }));
vi.mock('@/app/studio/[workId]/review/[proposalId]/actions', () => ({
  acceptProposalAction: actionMocks.accept, rejectProposalAction: actionMocks.reject, revertProposalAction: actionMocks.revert,
}));
const pageMocks = vi.hoisted(() => ({ list: vi.fn(), detail: vi.fn(), access: vi.fn(), user: { id: '11111111-1111-4111-8111-111111111111' } as { id: string } | null }));
vi.mock('@/lib/proposals/queries', () => ({ listWorkProposals: pageMocks.list, getProposalDetail: pageMocks.detail }));
vi.mock('@/lib/auth/write-access', () => ({ checkWriteAccess: pageMocks.access }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: pageMocks.user } }) } }) }));

import {
  buildSelections, canEditChunk, cardSummary, cardTitle, detailHeading, expiryNotice, folderOptionLabel, formatArrival,
  formatKstDate, formatKstDateTime, isEdited, isFoldable, parseQueueFilter, queueHref, selectAll, selectionStatus, statusLabel,
  toggleSelection,
} from '@/components/proposals/review-model';
import { ProposalQueue } from '@/components/proposals/proposal-queue';
import ReviewQueuePage from '@/app/studio/[workId]/review/page';

const WORK = '33333333-3333-4333-8333-333333333333';
const P1 = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const NOW = Date.parse('2026-11-06T06:12:00Z'); // 2026-11-06 15:12 KST
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const iso = (offset: number) => new Date(NOW + offset).toISOString();

function summary(over: Partial<ProposalSummary> = {}): ProposalSummary {
  return {
    id: P1, kind: 'chapter_draft', status: 'pending', createdAt: iso(-3 * HOUR), expiresAt: iso(27 * DAY), decidedAt: null,
    targetTitle: '4화', proposedCategory: null, changeCount: 5,
    source: { clientName: 'Claude', host: 'claude.ai', disconnected: false },
    ...over,
  };
}

const queueHtml = (props: Partial<React.ComponentProps<typeof ProposalQueue>> = {}) => renderToStaticMarkup(React.createElement(ProposalQueue, {
  workId: WORK, filter: 'pending', pendingCount: 1, proposals: [summary()], now: NOW, loadError: false, ...props,
}));

describe('review-model helpers', () => {
  it('parses the status filter with pending as default', () => {
    expect(parseQueueFilter(undefined)).toBe('pending');
    expect(parseQueueFilter('done')).toBe('done');
    expect(parseQueueFilter('all')).toBe('all');
    expect(parseQueueFilter('accepted')).toBe('pending');
    expect(parseQueueFilter(['done', 'all'])).toBe('pending');
    expect(queueHref(WORK, 'pending')).toBe(`/studio/${WORK}/review`);
    expect(queueHref(WORK, 'done')).toBe(`/studio/${WORK}/review?status=done`);
  });

  it('formats arrival in KST, relative within a day', () => {
    expect(formatArrival(iso(-20_000), NOW)).toBe('방금 전');
    expect(formatArrival(iso(-15 * 60_000), NOW)).toBe('15분 전');
    expect(formatArrival(iso(-3 * HOUR), NOW)).toBe('3시간 전');
    expect(formatKstDateTime('2026-11-01T06:05:00Z')).toBe('2026. 11. 1. 오후 3:05');
    expect(formatKstDateTime('2026-10-31T15:30:00Z')).toBe('2026. 11. 1. 오전 12:30');
    expect(formatArrival('2026-11-01T06:05:00Z', NOW)).toBe('2026. 11. 1. 오후 3:05');
    expect(formatKstDate('2026-11-13T00:00:00Z')).toBe('2026. 11. 13.');
  });

  it('shows the expiry countdown only within 7 days of a pending proposal', () => {
    expect(expiryNotice(summary({ expiresAt: iso(27 * DAY) }), NOW)).toBeNull();
    expect(expiryNotice(summary({ expiresAt: iso(6.5 * DAY) }), NOW)).toBe('만료까지 7일');
    expect(expiryNotice(summary({ expiresAt: iso(2 * HOUR) }), NOW)).toBe('만료까지 1일');
    expect(expiryNotice(summary({ status: 'accepted', expiresAt: iso(2 * DAY) }), NOW)).toBeNull();
  });

  it('builds card titles, headings, summaries and status labels from the contract', () => {
    expect(cardTitle(summary())).toBe('4화 초안');
    expect(cardTitle(summary({ kind: 'kb_edit', targetTitle: '아린' }))).toBe('아린 수정안');
    expect(cardTitle(summary({ kind: 'kb_create', targetTitle: '서하' }))).toBe('서하');
    expect(cardTitle(summary({ targetTitle: null }))).toBe('제목 없는 회차 초안');
    expect(detailHeading(summary())).toBe('4화 초안 검토');
    expect(detailHeading(summary({ kind: 'kb_edit', targetTitle: '아린' }))).toBe('아린 수정안 검토');
    expect(detailHeading(summary({ kind: 'kb_create', targetTitle: '서하' }))).toBe('서하 새 설정집 문서 검토');
    expect(cardSummary(summary())).toBe('바뀐 부분 5곳');
    expect(cardSummary(summary({ kind: 'kb_create', changeCount: null, proposedCategory: '인물' }))).toBe('카테고리 인물');
    expect(statusLabel('accepted')).toBe('반영됨');
    expect(statusLabel('accepted', true)).toBe('일부 반영됨');
    expect(statusLabel('superseded')).toBe('새 초안으로 대체됨');
    expect(statusLabel('reverted')).toBe('되돌림');
  });
});

describe('ProposalQueue', () => {
  it('renders an accessible list with kind, status, source, arrival and review link', () => {
    const html = queueHtml();
    expect(html).toContain('aria-label="제안 목록"');
    expect(html).toContain('회차 초안');
    expect(html).toContain('검토 대기');
    expect(html).toContain('4화 초안');
    expect(html).toContain('Claude');
    expect(html).toContain('claude.ai');
    expect(html).toContain('도착 3시간 전');
    expect(html).toContain('바뀐 부분 5곳');
    expect(html).toContain('검토하기');
    expect(html).toContain('aria-label="4화 초안 검토하기"');
    expect(html).toContain(`href="/studio/${WORK}/review/${P1}"`);
    expect(html).toMatch(/<dl[\s\S]*<dt[\s\S]*<dd/);
    expect(html).toContain('min-h-11');
    expect(html).not.toContain('연결 해제됨');
  });

  it('shows filter tabs with the pending count and marks the active one', () => {
    const html = queueHtml({ pendingCount: 3, filter: 'done', proposals: [summary({ status: 'rejected' })] });
    expect(html).toContain('role="tablist"');
    expect(html).toContain('대기 중 3');
    expect(html).toContain('처리됨');
    expect(html).toContain('전체');
    expect(html).toMatch(/aria-selected="true"[^>]*>처리됨|>처리됨<\/a>/);
    expect(html).toContain(`href="/studio/${WORK}/review?status=done"`);
  });

  it('uses 내용 보기 for decided, expired and superseded proposals', () => {
    const html = queueHtml({ filter: 'done', proposals: [
      summary({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002', status: 'expired' }),
      summary({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000003', status: 'superseded' }),
    ] });
    expect(html).toContain('만료됨');
    expect(html).toContain('새 초안으로 대체됨');
    expect(html).toContain('내용 보기');
    expect(html).not.toContain('>검토하기<');
  });

  it('marks a disconnected source and renders attacker-controlled source text as text only', () => {
    const html = queueHtml({ proposals: [summary({ source: { clientName: '<img src=x onerror=alert(1)>', host: 'evil.example', disconnected: true } })] });
    expect(html).toContain('연결 해제됨');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img');
  });

  it('shows the empty state per filter', () => {
    const pending = queueHtml({ proposals: [], pendingCount: 0 });
    expect(pending).toContain('검토할 제안이 없어요');
    expect(pending).toContain('30일이 지나면 만료돼요');
    expect(pending).toContain('href="/studio/settings/mcp-connections"');
    const done = queueHtml({ proposals: [], filter: 'done' });
    expect(done).toContain('처리한 제안이 아직 없어요');
  });

  it('shows the load error as an alert with a reload action', () => {
    const html = queueHtml({ proposals: [], loadError: true });
    expect(html).toContain('role="alert"');
    expect(html).toContain('제안 목록을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.');
    expect(html).toContain('다시 불러오기');
    expect(html).not.toContain('aria-label="제안 목록"');
  });

  it('shows the suspended notice and the rejected status message', () => {
    const html = queueHtml({ suspended: true, notice: 'rejected' });
    expect(html).toContain('지금은 계정이 제한되어 AI가 새 제안을 보낼 수 없어요.');
    expect(html).toContain('role="status"');
    expect(html).toContain('제안을 거절했어요.');
  });
});

describe('review queue page', () => {
  beforeEach(() => {
    pageMocks.list.mockReset();
    pageMocks.access.mockReset();
    pageMocks.access.mockResolvedValue({ ok: true });
    pageMocks.user = { id: '11111111-1111-4111-8111-111111111111' };
  });

  it('awaits params and searchParams and passes the status filter', async () => {
    pageMocks.list.mockResolvedValue({ ok: true, work: { id: WORK, title: '무월의 문' }, filter: 'done', pendingCount: 2, proposals: [] });
    const tree = await ReviewQueuePage({ params: Promise.resolve({ workId: WORK }), searchParams: Promise.resolve({ status: 'done' }) });
    const html = renderToStaticMarkup(tree);
    expect(pageMocks.list).toHaveBeenCalledWith(expect.anything(), '11111111-1111-4111-8111-111111111111', WORK, 'done');
    expect(html).toContain('<h1');
    expect(html).toContain('리뷰 큐');
    expect(html).toContain('대기 중 2');
  });

  it('falls back to pending for an unknown filter and shows the load error', async () => {
    pageMocks.list.mockResolvedValue({ ok: false, reason: 'error' });
    const tree = await ReviewQueuePage({ params: Promise.resolve({ workId: WORK }), searchParams: Promise.resolve({ status: 'bogus' }) });
    expect(pageMocks.list).toHaveBeenCalledWith(expect.anything(), expect.any(String), WORK, 'pending');
    expect(renderToStaticMarkup(tree)).toContain('role="alert"');
  });

  it('404s for a foreign or missing work', async () => {
    pageMocks.list.mockResolvedValue({ ok: false, reason: 'not_found' });
    await expect(ReviewQueuePage({ params: Promise.resolve({ workId: WORK }), searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('shows the suspended caption when writing is suspended', async () => {
    pageMocks.list.mockResolvedValue({ ok: true, work: { id: WORK, title: 'w' }, filter: 'pending', pendingCount: 0, proposals: [] });
    pageMocks.access.mockResolvedValue({ ok: false, code: 'write_suspended' });
    const html = renderToStaticMarkup(await ReviewQueuePage({ params: Promise.resolve({ workId: WORK }), searchParams: Promise.resolve({}) }));
    expect(html).toContain('지금은 계정이 제한되어');
  });
});

describe('chunk selection helpers', () => {
  const hunks = [
    { index: 0, kind: '바뀜' as const, after: 'A2\n\n', applicable: true, currentText: 'A\n\n' },
    { index: 1, kind: '삭제' as const, after: '', applicable: true, currentText: 'B\n\n' },
    { index: 2, kind: '추가' as const, after: 'C\n', applicable: false, currentText: '' },
  ];

  it('select all skips non-applicable chunks and toggling ignores them', () => {
    expect(selectAll(hunks)).toEqual([0, 1]);
    expect(toggleSelection([], 2, hunks)).toEqual([]);
    expect(toggleSelection([1], 0, hunks)).toEqual([0, 1]);
    expect(toggleSelection([0, 1], 0, hunks)).toEqual([1]);
    expect(selectionStatus(1, 2)).toBe('1/2개 선택');
  });

  it('only 추가/바뀜 applicable chunks are editable; edits count only when they differ', () => {
    expect(canEditChunk(hunks[0])).toBe(true);
    expect(canEditChunk(hunks[1])).toBe(false);
    expect(canEditChunk(hunks[2])).toBe(false);
    expect(isEdited(hunks[0], { 0: 'A2\n\n' })).toBe(false);
    expect(isEdited(hunks[0], { 0: '작가 문장\n\n' })).toBe(true);
    expect(isEdited(hunks[1], { 1: 'x' })).toBe(false);
  });

  it('builds accept selections with indexes only and editedText only when edited', () => {
    expect(buildSelections(hunks, [0, 1, 2], {})).toEqual([{ index: 0, accepted: true }, { index: 1, accepted: true }]);
    expect(buildSelections(hunks, [0], { 0: '작가 문장\n\n', 1: 'ignored' })).toEqual([{ index: 0, accepted: true, editedText: '작가 문장\n\n' }]);
    expect(buildSelections(hunks, [], { 0: 'x' })).toEqual([]);
  });

  it('folds only long 바뀜 chunks', () => {
    expect(isFoldable(hunks[0])).toBe(false);
    expect(isFoldable({ ...hunks[0], after: 'x'.repeat(300) })).toBe(true);
    expect(isFoldable({ ...hunks[2], after: 'x'.repeat(300) })).toBe(false);
  });

  it('labels folders with the category root', () => {
    expect(folderOptionLabel({ isRoot: true, name: '인물', path: '' }, '인물')).toBe('인물');
    expect(folderOptionLabel({ isRoot: false, name: '조연', path: '조연' }, '인물')).toBe('인물 / 조연');
  });
});
