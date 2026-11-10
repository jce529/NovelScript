import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

type MockProps = { children?: React.ReactNode; [key: string]: unknown };
vi.mock('next/link', () => ({ default: ({ children, href, ...props }: MockProps) => React.createElement('a', { href, ...props }, children) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }));
vi.mock('@/components/ui/badge', () => ({ Badge: ({ children, ...props }: MockProps) => React.createElement('span', props, children) }));

import { HeaderReviewLink } from '@/components/proposals/header-review-link';
import { ProposalInbox, type ProposalInboxProps } from '@/components/proposals/inbox';
import type { InboxProposal } from '@/lib/proposals/queries';

const W1 = '33333333-3333-4333-8333-333333333333';
const W2 = '33333333-3333-4333-8333-333333333334';
const P1 = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const html = (el: React.ReactElement) => renderToStaticMarkup(el);

const proposal = (over: Partial<InboxProposal> = {}): InboxProposal => ({
  id: P1, kind: 'chapter_draft', status: 'pending', createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(), decidedAt: null,
  targetTitle: '1화', proposedCategory: null, changeCount: 2,
  source: { clientName: '<b>Claude</b>', host: 'claude.ai', disconnected: false },
  workId: W1, workTitle: '내 작품', ...over,
});

const base = (over: Partial<ProposalInboxProps> = {}): ProposalInboxProps => ({
  filter: 'pending', kind: 'all', scope: { workId: null, chapterId: null }, pendingTotal: 1,
  works: [{ id: W1, title: '내 작품', pendingCount: 1 }, { id: W2, title: '두 번째', pendingCount: 0 }],
  proposals: [proposal()], now: Date.now(), loadError: false, ...over,
});

describe('HeaderReviewLink', () => {
  it('always links to the inbox; the number only shows for a positive count', () => {
    const withCount = html(React.createElement(HeaderReviewLink, { count: 3 }));
    expect(withCount).toContain('href="/studio/review"');
    expect(withCount).toContain('aria-label="AI 검토 대기 3건"');
    expect(withCount).toContain('>3<');
    for (const count of [0, null]) {
      const markup = html(React.createElement(HeaderReviewLink, { count }));
      expect(markup).toContain('href="/studio/review"');
      expect(markup).toContain('aria-label="AI 검토 이력"');
      expect(markup).not.toContain('rounded-full');
    }
    expect(html(React.createElement(HeaderReviewLink, { count: 120 }))).toContain('>99+<');
  });
});

describe('ProposalInbox', () => {
  it('renders rows with the work title, per-work review links and escaped source text', () => {
    const markup = html(React.createElement(ProposalInbox, base()));
    expect(markup).toContain('내 작품');
    expect(markup).toContain(`href="/studio/${W1}/review/${P1}"`);
    expect(markup).toContain('&lt;b&gt;Claude&lt;/b&gt;');
    expect(markup).not.toContain('<b>Claude</b>');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('1건');
  });

  it('marks the current tab and keeps the filters in every tab link', () => {
    const markup = html(React.createElement(ProposalInbox, base({ filter: 'done', kind: 'kb' })));
    expect(markup).toContain('href="/studio/review?status=done&amp;kind=kb"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('href="/studio/review?status=done"');
    expect(markup).toContain(`href="/studio/review?status=done&amp;kind=kb&amp;work=${W2}"`);
  });

  it('shows the scope chip with a way back and hides the work chips for a single work', () => {
    const scoped = html(React.createElement(ProposalInbox, base({
      scope: { workId: W1, chapterId: 'c1' }, proposals: [],
    })));
    expect(scoped).toContain('전체 보기');
    expect(scoped).toContain(`href="/studio/review?work=${W1}"`);
    expect(scoped).toContain('조건에 맞는 제안이 없어요.');

    const single = html(React.createElement(ProposalInbox, base({ works: [{ id: W1, title: '내 작품', pendingCount: 1 }] })));
    expect(single).not.toContain('aria-label="작품"');
  });

  it('shows an alert (no list, no empty state) when loading failed, and a suspended note', () => {
    const failed = html(React.createElement(ProposalInbox, base({ loadError: true, proposals: [] })));
    expect(failed).toContain('role="alert"');
    expect(failed).not.toContain('검토할 제안이 없어요');
    expect(html(React.createElement(ProposalInbox, base({ suspended: true })))).toContain('계정이 제한되어');
  });
});
