import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

type MockProps = { children?: React.ReactNode; [key: string]: unknown };
vi.mock('next/link', () => ({ default: ({ children, href, ...props }: MockProps) => React.createElement('a', { href, ...props }, children) }));
vi.mock('@/components/ui/badge', () => ({ Badge: ({ children, ...props }: MockProps) => React.createElement('span', props, children) }));

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  listWorks: vi.fn(),
  countByWork: vi.fn(),
  countForTarget: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/works/actions', () => ({ listWorks: mocks.listWorks }));
vi.mock('@/lib/proposals/queries', async () => {
  const actual = await vi.importActual<typeof import('@/lib/proposals/queries')>('@/lib/proposals/queries');
  return { ...actual, countPendingProposalsByWork: mocks.countByWork, countPendingProposalsForTarget: mocks.countForTarget };
});

import {
  PendingProposalBadge, PendingTargetLine, ReviewQueueNavLink,
  pendingBadgeLabel, sidebarCountLabel, sidebarAriaLabel, homeBadgeAriaLabel, targetReviewHref,
} from '@/components/proposals/pending-badges';
import WorkListPage from '@/app/studio/page';
import { getPendingProposalsForTargetAction } from '@/app/studio/[workId]/review/target-actions';

const W1 = '11111111-1111-4111-8111-111111111111';
const W2 = '22222222-2222-4222-8222-222222222222';
const T1 = '33333333-3333-4333-8333-333333333333';
const P1 = '44444444-4444-4444-8444-444444444444';
const P2 = '55555555-5555-4555-8555-555555555555';
const USER = '66666666-6666-4666-8666-666666666666';

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const anchors = (markup: string) => (markup.match(/<a /g) ?? []).length;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser } });
  mocks.getUser.mockResolvedValue({ data: { user: { id: USER } }, error: null });
});

describe('label helpers', () => {
  it('formats home badge, sidebar count (99+) and accessible names', () => {
    expect(pendingBadgeLabel(3)).toBe('대기 3건');
    expect(sidebarCountLabel(7)).toBe('7');
    expect(sidebarCountLabel(99)).toBe('99');
    expect(sidebarCountLabel(100)).toBe('99+');
    expect(homeBadgeAriaLabel('달빛 연대기', 2)).toBe('달빛 연대기 리뷰 큐, 대기 2건');
    expect(sidebarAriaLabel(4)).toBe('리뷰 큐, 대기 4건');
    expect(sidebarAriaLabel(0)).toBe('리뷰 큐');
  });

  it('links one proposal to its detail and several to the queue', () => {
    expect(targetReviewHref(W1, [P1])).toBe(`/studio/${W1}/review/${P1}`);
    expect(targetReviewHref(W1, [P1, P2])).toBe(`/studio/${W1}/review`);
    expect(targetReviewHref(W1, [])).toBe(`/studio/${W1}/review`);
  });
});

describe('PendingProposalBadge', () => {
  it('renders 대기 n건 as a single review-queue link with the work-titled name', () => {
    const markup = html(React.createElement(PendingProposalBadge, { workId: W1, workTitle: '달빛 연대기', count: 3 }));
    expect(markup).toContain(`href="/studio/${W1}/review"`);
    expect(markup).toContain('aria-label="달빛 연대기 리뷰 큐, 대기 3건"');
    expect(markup).toContain('대기 3건');
    expect(anchors(markup)).toBe(1);
  });

  it('renders nothing for 0 or invalid counts', () => {
    for (const count of [0, -1, Number.NaN]) {
      expect(html(React.createElement(PendingProposalBadge, { workId: W1, workTitle: 'x', count }))).toBe('');
    }
  });
});

describe('ReviewQueueNavLink', () => {
  it('shows the count badge with 99+ cap and the combined accessible name', () => {
    const some = html(React.createElement(ReviewQueueNavLink, { workId: W1, count: 5 }));
    expect(some).toContain('리뷰 큐');
    expect(some).toContain(`href="/studio/${W1}/review"`);
    expect(some).toContain('aria-label="리뷰 큐, 대기 5건"');
    expect(some).toContain('>5<');
    expect(html(React.createElement(ReviewQueueNavLink, { workId: W1, count: 250 }))).toContain('>99+<');
  });

  it('keeps the link but omits the badge at 0', () => {
    const none = html(React.createElement(ReviewQueueNavLink, { workId: W1, count: 0 }));
    expect(none).toContain('리뷰 큐');
    expect(none).toContain('aria-label="리뷰 큐"');
    expect(none).not.toContain('rounded bg-background');
    expect(none).not.toContain('대기');
  });
});

describe('PendingTargetLine', () => {
  it('shows the chapter / document line and links one proposal to its detail', () => {
    const chapter = html(React.createElement(PendingTargetLine, { workId: W1, subject: '회차', count: 1, proposalIds: [P1] }));
    expect(chapter).toContain('이 회차에 대기 제안 1건');
    expect(chapter).toContain(`href="/studio/${W1}/review/${P1}"`);
    const doc = html(React.createElement(PendingTargetLine, { workId: W1, subject: '문서', count: 2, proposalIds: [P1, P2] }));
    expect(doc).toContain('이 문서에 대기 제안 2건');
    expect(doc).toContain(`href="/studio/${W1}/review"`);
    expect(anchors(doc)).toBe(1);
  });

  it('renders nothing at 0', () => {
    expect(html(React.createElement(PendingTargetLine, { workId: W1, subject: '회차', count: 0, proposalIds: [] }))).toBe('');
  });
});

describe('studio home page', () => {
  const works = [
    { id: W1, title: '작품 하나', synopsis: '줄거리' },
    { id: W2, title: '작품 둘', synopsis: '' },
  ];

  it('asks for all work counts in one call and badges only the work that has pending proposals', async () => {
    mocks.listWorks.mockResolvedValue(works);
    mocks.countByWork.mockResolvedValue({ [W1]: 2, [W2]: 0 });
    const markup = html(await WorkListPage());
    expect(mocks.countByWork).toHaveBeenCalledTimes(1);
    expect(mocks.countByWork.mock.calls[0][1]).toBe(USER);
    expect(mocks.countByWork.mock.calls[0][2]).toEqual([W1, W2]);
    expect(markup).toContain('대기 2건');
    expect(markup).toContain('aria-label="작품 하나 리뷰 큐, 대기 2건"');
    expect(markup).not.toContain('작품 둘 리뷰 큐');
    expect(markup.match(/리뷰 큐, 대기 \d건/g)).toHaveLength(1);
  });

  it('never nests the badge link inside the card link', async () => {
    mocks.listWorks.mockResolvedValue(works);
    mocks.countByWork.mockResolvedValue({ [W1]: 1, [W2]: 1 });
    const markup = html(await WorkListPage());
    // Every <a> closes before the next <a> opens (no anchor inside an anchor).
    expect(markup).not.toMatch(/<a [^>]*>(?:(?!<\/a>)[\s\S])*<a /);
  });

  it('renders cards without badges when the count helper degrades to zeros', async () => {
    mocks.listWorks.mockResolvedValue(works);
    mocks.countByWork.mockResolvedValue({ [W1]: 0, [W2]: 0 });
    const markup = html(await WorkListPage());
    expect(markup).toContain('작품 하나');
    expect(markup).not.toContain('대기');
  });
});

describe('getPendingProposalsForTargetAction', () => {
  it('uses the session user (not client input) and the right target column kind', async () => {
    mocks.countForTarget.mockResolvedValue({ count: 1, proposalIds: [P1] });
    await expect(getPendingProposalsForTargetAction(W1, 'chapter', T1)).resolves.toEqual({ count: 1, proposalIds: [P1] });
    expect(mocks.countForTarget).toHaveBeenCalledWith(expect.anything(), USER, W1, 'chapter', T1);
    await getPendingProposalsForTargetAction(W1, 'kb', T1);
    expect(mocks.countForTarget).toHaveBeenLastCalledWith(expect.anything(), USER, W1, 'node', T1);
  });

  it('returns zero for signed-out callers, bad IDs, bad kinds and query failures', async () => {
    const zero = { count: 0, proposalIds: [] };
    await expect(getPendingProposalsForTargetAction('nope', 'chapter', T1)).resolves.toEqual(zero);
    await expect(getPendingProposalsForTargetAction(W1, 'chapter', 'nope')).resolves.toEqual(zero);
    await expect(getPendingProposalsForTargetAction(W1, 'other' as never, T1)).resolves.toEqual(zero);
    expect(mocks.countForTarget).not.toHaveBeenCalled();

    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(getPendingProposalsForTargetAction(W1, 'chapter', T1)).resolves.toEqual(zero);
    expect(mocks.countForTarget).not.toHaveBeenCalled();

    mocks.getUser.mockResolvedValue({ data: { user: { id: USER } }, error: null });
    mocks.countForTarget.mockRejectedValue(new Error('boom'));
    await expect(getPendingProposalsForTargetAction(W1, 'chapter', T1)).resolves.toEqual(zero);
    mocks.createClient.mockRejectedValue(new Error('no cookies'));
    await expect(getPendingProposalsForTargetAction(W1, 'chapter', T1)).resolves.toEqual(zero);
  });
});
