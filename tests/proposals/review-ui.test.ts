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
vi.mock('@/lib/proposals/queries', () => ({
  listWorkProposals: pageMocks.list, getProposalDetail: pageMocks.detail,
  isUuid: (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
}));
const libMocks = vi.hoisted(() => ({ accept: vi.fn(), reject: vi.fn(), revert: vi.fn(), revalidate: vi.fn() }));
vi.mock('@/lib/proposals/actions', () => ({
  acceptProposal: libMocks.accept, rejectProposal: libMocks.reject, revertProposal: libMocks.revert,
  PROPOSAL_ERROR_COPY: { forbidden: '이 작업을 할 수 있는 계정이 아니에요. 다시 로그인해주세요.', accept_failed: 'AF', reject_failed: 'RF', revert_failed: 'VF' },
}));
vi.mock('next/cache', () => ({ revalidatePath: libMocks.revalidate }));
vi.mock('@/lib/auth/write-access', () => ({ checkWriteAccess: pageMocks.access }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: pageMocks.user } }) } }) }));

import {
  buildSelections, canEditChunk, cardSummary, cardTitle, detailHeading, expiryNotice, folderOptionLabel, formatArrival,
  formatKstDate, formatKstDateTime, isEdited, isFoldable, parseQueueFilter, queueHref, selectAll, selectionStatus, statusLabel,
  toggleSelection,
} from '@/components/proposals/review-model';
import { ProposalQueue } from '@/components/proposals/proposal-queue';
import ReviewQueuePage from '@/app/studio/[workId]/review/page';
import { ProposalDetailView } from '@/components/proposals/proposal-detail';
import ProposalReviewPage from '@/app/studio/[workId]/review/[proposalId]/page';
import { buildAcceptInput } from '@/components/proposals/review-model';
import type { ProposalDetail } from '@/lib/proposals/queries';

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

// ---------------------------------------------------------------------------
// Task 2: detail view, detail page, thin server actions
// ---------------------------------------------------------------------------
const CHAPTER = '55555555-5555-4555-8555-555555555555';
const NODE = '66666666-6666-4666-8666-666666666666';
const ROOT = '88888888-8888-4888-8888-888888888881';
const SUB = '88888888-8888-4888-8888-888888888882';
const HASH = 'a'.repeat(64);

function detail(over: Partial<ProposalDetail> = {}): ProposalDetail {
  return {
    ...summary(),
    workId: WORK, workTitle: '무월의 문',
    target: { chapterId: CHAPTER, nodeId: null, title: '4화', state: 'ok' },
    draft: '첫 문단 고침\n\n둘째 문단\n\n넷째 문단\n\n다섯째 문단\n',
    currentContent: '첫 문단\n\n둘째 문단\n\n셋째 문단\n\n넷째 문단\n',
    hunks: [
      { index: 0, kind: '바뀜', before: '첫 문단\n\n', after: '첫 문단 고침\n\n', applicable: true, anchor: { start: 0, end: 1 }, currentText: '첫 문단\n\n' },
      { index: 1, kind: '삭제', before: '셋째 문단\n\n', after: '', applicable: true, anchor: { start: 2, end: 3 }, currentText: '셋째 문단\n\n' },
      { index: 2, kind: '추가', before: '', after: '다섯째 문단\n', applicable: true, anchor: { start: 4, end: 4 }, currentText: '' },
    ],
    isStale: false, seenHash: HASH, undoUntil: null, canRevert: false, decision: null, folders: null,
    savedFolderId: null, createdNodeId: null,
    ...over,
  };
}

const createDetail = (over: Partial<ProposalDetail> = {}) => detail({
  kind: 'kb_create', targetTitle: '서하', proposedCategory: '인물', changeCount: null,
  target: { chapterId: null, nodeId: null, title: '서하', state: 'ok' },
  draft: '나이: 25세\n성격: 침착함\n', currentContent: null, hunks: [], seenHash: null,
  folders: { status: 'ok', root: { id: ROOT, name: '인물', isRoot: true, path: '', version: `${ROOT}:인물` }, candidates: [
    { id: ROOT, name: '인물', isRoot: true, path: '', version: `${ROOT}:인물` },
    { id: SUB, name: '조연', isRoot: false, path: '조연', version: `${ROOT}:인물/${SUB}:조연` },
  ] },
  ...over,
});

const detailHtml = (d: ProposalDetail) => renderToStaticMarkup(React.createElement(ProposalDetailView, { detail: d, arrivalLabel: '3시간 전' }));
const disabledButton = (label: string) => new RegExp(`<button[^>]*disabled=""[^>]*>${label}`);
const enabledButton = (label: string) => new RegExp(`<button(?![^>]*disabled)[^>]*>${label}`);

describe('ProposalDetailView: chapter and kb_edit chunks', () => {
  it('renders the pending chapter draft with per-chunk checkbox, labels, edit and bulk controls', () => {
    const html = detailHtml(detail());
    expect(html).toContain('4화 초안 검토');
    expect(html).toContain('리뷰 큐로 돌아가기');
    expect(html).toContain('Claude');
    expect(html).toContain('3시간 전');
    expect(html).toContain('<ol');
    expect(html).toContain('aria-label="1번째 변경, 바뀜"');
    expect(html).toContain('aria-label="2번째 변경, 삭제"');
    expect(html).toContain('aria-label="3번째 변경, 추가"');
    expect(html).toContain('1번째 변경 반영');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('지금 본문');
    expect(html).toContain('AI 초안');
    expect(html).toContain('md:grid-cols-2');
    expect(html).toContain('min-h-11');
    expect(html.match(/직접 고치기/g)?.length).toBe(2); // 바뀜 + 추가 only
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('전체 선택');
    expect(html).toContain('전체 해제');
    expect(html).toMatch(/role="status"[^>]*>0\/3개 선택/);
    expect(html).toMatch(disabledButton('선택한 0개 반영하기'));
    expect(html).toContain('반영할 부분을 하나 이상 골라 주세요.');
    expect(html).toContain('체크하지 않은 변경은 반영되지 않아요.');
    expect(html).toMatch(enabledButton('이 제안 거절하기'));
    expect(html).toContain('sticky bottom-0');
    expect(html).toContain('safe-area-inset-bottom');
    expect(html).not.toContain('원본이 바뀌었어요');
  });

  it('shows the stale warning and disables non-applicable chunks', () => {
    const d = detail({ isStale: true, hunks: [
      ...detail().hunks.slice(0, 2),
      { index: 2, kind: '추가', before: '', after: '다섯째 문단\n', applicable: false, anchor: null, currentText: '' },
    ] });
    const html = detailHtml(d);
    expect(html).toMatch(/role="alert"[\s\S]*원본이 바뀌었어요/);
    expect(html).toContain('본문이 바뀌어서 선택을 처음부터 다시 해야 해요.');
    expect(html).toContain('적용할 수 없음');
    expect(html).toContain('이 부분이 들어갈 자리가 지금 본문에 없어서 반영할 수 없어요.');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toMatch(/0\/2개 선택/);
    expect(html.match(/직접 고치기/g)?.length).toBe(1);
  });

  it('says nothing can be applied when every chunk is non-applicable', () => {
    const d = detail({ isStale: true, hunks: detail().hunks.map((h) => ({ ...h, applicable: false, anchor: null })) });
    const html = detailHtml(d);
    expect(html).toContain('반영할 수 있는 부분이 없어요.');
    expect(html).toMatch(disabledButton('선택한 0개 반영하기'));
    expect(html).toMatch(enabledButton('이 제안 거절하기'));
  });

  it('uses 지금 내용 / 수정안 for kb_edit and blocks a locked document except reject', () => {
    const html = detailHtml(detail({ kind: 'kb_edit', targetTitle: '아린', target: { chapterId: null, nodeId: NODE, title: '아린', state: 'locked' }, seenHash: null }));
    expect(html).toContain('아린 수정안 검토');
    expect(html).toContain('지금 내용');
    expect(html).toContain('수정안');
    expect(html).toContain('잠긴 문서라 반영할 수 없어요');
    expect(html).not.toContain('직접 고치기');
    expect(html).toMatch(disabledButton('선택한 0개 반영하기'));
    expect(html).toMatch(enabledButton('이 제안 거절하기'));
  });

  it('shows only the proposal text for a deleted document', () => {
    const html = detailHtml(detail({ kind: 'kb_edit', targetTitle: '아린', target: { chapterId: null, nodeId: NODE, title: null, state: 'missing' }, hunks: [], seenHash: null, currentContent: null }));
    expect(html).toContain('삭제된 문서라 반영할 수 없어요');
    expect(html).toContain('제안을 거절해서 정리해 주세요.');
    expect(html).not.toContain('type="checkbox"');
    expect(html).toMatch(enabledButton('이 제안 거절하기'));
  });

  it('renders an accepted proposal read-only with result labels and one-time revert', () => {
    const html = detailHtml(detail({
      status: 'accepted', seenHash: null, canRevert: true, undoUntil: '2026-11-13T00:00:00Z',
      decision: { acceptedIndexes: [0, 2], editedIndexes: [0] },
    }));
    expect(html).toContain('일부 반영됨');
    expect(html).not.toContain('type="checkbox"');
    expect(html).toContain('반영함');
    expect(html).toContain('반영 안 함');
    expect(html).toContain('직접 고침');
    expect(html).toMatch(enabledButton('반영 되돌리기'));
    expect(html).toContain('2026. 11. 13.까지 되돌릴 수 있어요.');
    expect(html).toContain(`href="/studio/${WORK}/chapters/${CHAPTER}"`);
    expect(html).toContain('회차 열기');
    expect(html).not.toContain('선택한 0개 반영하기');
  });

  it('shows the expired undo window instead of the revert button', () => {
    const html = detailHtml(detail({ status: 'accepted', seenHash: null, canRevert: false, undoUntil: '2026-10-01T00:00:00Z', decision: { acceptedIndexes: [0, 1, 2], editedIndexes: [] } }));
    expect(html).toContain('반영됨');
    expect(html).toContain('되돌릴 수 있는 기간이 지났어요.');
    expect(html).not.toMatch(enabledButton('반영 되돌리기'));
  });

  it('renders rejected, superseded and expired proposals read-only without actions', () => {
    for (const status of ['rejected', 'superseded', 'expired'] as const) {
      const html = detailHtml(detail({ status, seenHash: null }));
      expect(html).not.toContain('type="checkbox"');
      expect(html).not.toMatch(enabledButton('이 제안 거절하기'));
      expect(html).not.toMatch(enabledButton('반영 되돌리기'));
    }
  });

  it('renders the three confirmation dialogs with the contract copy and a safe initial focus', () => {
    const html = detailHtml(detail());
    expect(html).toContain('본문에 반영할까요?');
    expect(html).toContain('반영하기');
    expect(html).toContain('이 제안을 거절할까요?');
    expect(html).toContain('제안 유지하기');
    expect(html).toContain('aria-label="4화 초안 거절 확인"');
    expect(html).not.toContain('반영을 되돌릴까요?');
    expect(html).not.toContain('data-initial-focus="false"');
    const accepted = detailHtml(detail({ status: 'accepted', seenHash: null, canRevert: true, undoUntil: '2026-11-13T00:00:00Z', decision: { acceptedIndexes: [0], editedIndexes: [] } }));
    expect(accepted).toContain('반영을 되돌릴까요?');
    expect(accepted).toContain('4화의 본문이 이 제안을 반영하기 전 모습으로 돌아가요.');
    expect(accepted).toContain('>닫기<');
    expect(accepted).not.toContain('이 제안을 거절할까요?');
    expect(accepted).not.toContain('data-initial-focus="false"');
  });
});

describe('ProposalDetailView: kb_create', () => {
  it('requires an explicit folder: radio list with no default selection', () => {
    const html = detailHtml(createDetail());
    expect(html).toContain('서하 새 설정집 문서 검토');
    expect(html).toContain('카테고리');
    expect(html).toContain('AI가 정한 카테고리예요.');
    expect(html).toContain('AI가 제안한 내용');
    expect(html).toContain('저장할 폴더');
    expect(html).toContain('인물 / 조연');
    expect(html).toContain('최상위');
    expect(html).not.toMatch(/type="radio"[^>]*checked/);
    expect(html).toMatch(disabledButton('설정집에 저장하기'));
    expect(html).toContain('저장할 폴더를 골라 주세요.');
    expect(html).not.toContain('type="checkbox"');
  });

  it('explains when the category has no folder', () => {
    const html = detailHtml(createDetail({ folders: { status: 'root_missing' } }));
    expect(html).toContain('이 카테고리에 저장할 수 있는 폴더가 없어요.');
    expect(html).toContain('설정집 열기');
    expect(html).toMatch(disabledButton('설정집에 저장하기'));
  });

  it('builds accept input without chunk text: indexes, seenHash, folder id/version only', () => {
    expect(buildAcceptInput(detail(), [0, 2], { 0: '작가 문장\n\n' }, null)).toEqual({
      workId: WORK, proposalId: P1, seenHash: HASH,
      selections: [{ index: 0, accepted: true, editedText: '작가 문장\n\n' }, { index: 2, accepted: true }],
    });
    expect(buildAcceptInput(createDetail(), [], {}, { id: SUB, version: `${ROOT}:인물/${SUB}:조연` })).toEqual({
      workId: WORK, proposalId: P1, selections: [], folderId: SUB, folderVersion: `${ROOT}:인물/${SUB}:조연`,
    });
  });
});

describe('proposal detail page', () => {
  beforeEach(() => { pageMocks.detail.mockReset(); pageMocks.user = { id: '11111111-1111-4111-8111-111111111111' }; });

  it('awaits params and renders the server detail', async () => {
    pageMocks.detail.mockResolvedValue({ ok: true, detail: detail() });
    const html = renderToStaticMarkup(await ProposalReviewPage({ params: Promise.resolve({ workId: WORK, proposalId: P1 }) }));
    expect(pageMocks.detail).toHaveBeenCalledWith(expect.anything(), '11111111-1111-4111-8111-111111111111', WORK, P1);
    expect(html).toContain('4화 초안 검토');
  });

  it('404s for a foreign or missing proposal and alerts on load failure', async () => {
    pageMocks.detail.mockResolvedValue({ ok: false, reason: 'not_found' });
    await expect(ProposalReviewPage({ params: Promise.resolve({ workId: WORK, proposalId: P1 }) })).rejects.toThrow('NEXT_NOT_FOUND');
    pageMocks.detail.mockResolvedValue({ ok: false, reason: 'error' });
    const html = renderToStaticMarkup(await ProposalReviewPage({ params: Promise.resolve({ workId: WORK, proposalId: P1 }) }));
    expect(html).toContain('role="alert"');
  });
});

describe('review server actions (thin wrappers)', () => {
  type ActionsModule = typeof import('@/app/studio/[workId]/review/[proposalId]/actions');
  let actions: ActionsModule;
  beforeEach(async () => {
    actions = await vi.importActual<ActionsModule>('@/app/studio/[workId]/review/[proposalId]/actions');
    libMocks.accept.mockReset(); libMocks.reject.mockReset(); libMocks.revert.mockReset(); libMocks.revalidate.mockReset();
    pageMocks.user = { id: '11111111-1111-4111-8111-111111111111' };
  });

  it('refuses without a session and never calls the decision logic', async () => {
    pageMocks.user = null;
    expect(await actions.acceptProposalAction({ workId: WORK, proposalId: P1, selections: [] })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await actions.rejectProposalAction({ workId: WORK, proposalId: P1 })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await actions.revertProposalAction({ workId: WORK, proposalId: P1 })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(libMocks.accept).not.toHaveBeenCalled();
    expect(libMocks.reject).not.toHaveBeenCalled();
    expect(libMocks.revert).not.toHaveBeenCalled();
  });

  it('passes the session user id and the input through, revalidating the work on success', async () => {
    const input = { workId: WORK, proposalId: P1, seenHash: HASH, selections: [{ index: 0, accepted: true }] };
    libMocks.accept.mockResolvedValue({ ok: true, status: 'accepted', proposalId: P1, undoUntil: null, createdNodeId: null, appliedCount: 1 });
    await expect(actions.acceptProposalAction(input)).resolves.toMatchObject({ ok: true, appliedCount: 1 });
    expect(libMocks.accept).toHaveBeenCalledWith(expect.anything(), '11111111-1111-4111-8111-111111111111', input);
    expect(libMocks.revalidate).toHaveBeenCalledWith(`/studio/${WORK}`, 'layout');
  });

  it('does not revalidate on stale results and maps thrown errors to fixed copy', async () => {
    libMocks.accept.mockResolvedValue({ ok: false, status: 'stale', error: 'stale', detail: detail() });
    await actions.acceptProposalAction({ workId: WORK, proposalId: P1, selections: [] });
    expect(libMocks.revalidate).not.toHaveBeenCalled();
    libMocks.reject.mockRejectedValue(new Error('relation "mcp_proposals" does not exist'));
    expect(await actions.rejectProposalAction({ workId: WORK, proposalId: P1 })).toEqual({ ok: false, status: 'error', code: 'failed', error: 'RF' });
  });

  it('round-trips the revert confirm hash unchanged', async () => {
    libMocks.revert.mockResolvedValueOnce({ ok: false, status: 'confirm_required', proposalId: P1, confirmHash: HASH });
    expect(await actions.revertProposalAction({ workId: WORK, proposalId: P1 })).toMatchObject({ status: 'confirm_required', confirmHash: HASH });
    expect(libMocks.revalidate).not.toHaveBeenCalled();
    libMocks.revert.mockResolvedValueOnce({ ok: true, status: 'reverted', proposalId: P1, changedSinceAccept: true });
    await actions.revertProposalAction({ workId: WORK, proposalId: P1, confirm: true, seenHash: HASH });
    expect(libMocks.revert).toHaveBeenLastCalledWith(expect.anything(), expect.any(String), { workId: WORK, proposalId: P1, confirm: true, seenHash: HASH });
    expect(libMocks.revalidate).toHaveBeenCalledWith(`/studio/${WORK}`, 'layout');
  });
});
