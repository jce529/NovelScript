import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const m = vi.hoisted(() => ({ path: '/', search: '', user: true }));
vi.mock('next/navigation', () => ({
  usePathname: () => m.path,
  useSearchParams: () => new URLSearchParams(m.search),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: m.user ? { id: 'u1', email: 'reader@x.com' } : null },
      }),
    },
    from: () => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.maybeSingle = () =>
        Promise.resolve({ data: { role: 'reader', pen_name: null, balance: 1234 } });
      return q;
    },
  }),
}));
vi.mock('@/components/layout/account-panel', () => ({
  AccountPanel: (p: { displayName: string; balance: number }) =>
    React.createElement('div', { 'data-account': p.displayName, 'data-bal': p.balance }),
}));

vi.mock('@/components/payment/header-token-balance', () => ({
  HeaderTokenBalance: (p: { balance: number; loggedIn: boolean }) =>
    p.loggedIn
      ? React.createElement(
          'div',
          { 'data-balance': '1' },
          p.balance.toLocaleString('ko-KR'),
          React.createElement('button', { 'aria-label': '토큰 충전하기' }),
        )
      : null,
}));

import { SiteHeader } from '@/components/layout/site-header';
import { ReaderHeaderFrame } from '@/components/reader/reader-header-frame';

async function render(path: string, user = true, search = '') {
  m.path = path;
  m.search = search;
  m.user = user;
  return renderToStaticMarkup(await SiteHeader());
}

describe('SiteHeader reader frame', () => {
  it('reader route: 4 tabs, overflow rows, nav aria-labels, disabled search/charge, balance, account', async () => {
    const html = await render('/');
    expect(html).toContain('data-header="reader"');
    expect(html).toContain('aria-label="연재 구분"');
    expect(html).toContain('aria-label="서브 구분"');
    for (const l of ['무료연재', '유료연재', '랭킹', '내서재']) expect(html).toContain(l);
    expect(html.match(/overflow-x-auto/g)?.length).toBe(2);
    expect(html).toContain('전체');
    expect(html).toContain('min-h-11 min-w-11');
    expect(html).toMatch(
      /<button[^>]*disabled[^>]*aria-label="검색 \(준비 중\)"|<button[^>]*aria-label="검색 \(준비 중\)"[^>]*disabled/,
    );
    expect(html).toContain('1,234');
    expect(html).toContain('aria-label="토큰 충전하기"');
    expect(html).toContain('data-account="reader"');
    expect(html.match(/sticky/g)?.length).toBe(1);
  });

  it('renders 2-tier reader header on /series/free and /series/paid with URL-derived active states, genre preservation, and sort/page removal', async () => {
    const freeHtml = await render('/series/free', true, 'sub=new&genre=판타지&sort=popular&page=3');
    expect(freeHtml).toContain('data-header="reader"');
    expect(freeHtml).toMatch(/<a(?=[^>]*aria-current="page")[^>]*href="\/series\/free"[^>]*>무료연재<\/a>/);
    expect(freeHtml).toMatch(/<a[^>]*href="\/series\/paid"[^>]*>유료연재<\/a>/);
    expect(freeHtml).not.toMatch(/<a(?=[^>]*aria-current="page")[^>]*href="\/series\/paid"/);
    expect(freeHtml).toMatch(/<span[^>]*aria-disabled="true"[^>]*>랭킹<\/span>/);
    expect(freeHtml).toMatch(/<span[^>]*aria-disabled="true"[^>]*>내서재<\/span>/);

    const decodedFree = decodeURIComponent(freeHtml);
    expect(decodedFree).toContain('href="/series/free?genre=판타지"');
    expect(decodedFree).toContain('href="/series/free?sub=new&amp;genre=판타지"');
    expect(decodedFree).toContain('href="/series/free?sub=popular&amp;genre=판타지"');
    expect(decodedFree).toContain('href="/series/free?sub=completed&amp;genre=판타지"');
    expect(decodedFree).not.toContain('sort=popular');
    expect(decodedFree).not.toContain('page=3');
    expect(freeHtml).toMatch(/<a[^>]*aria-current="page"[^>]*>신작<\/a>/);
    expect(freeHtml).not.toMatch(/<a[^>]*aria-current="page"[^>]*>전체<\/a>/);

    const paidHtml = await render('/series/paid', true, 'sub=completed');
    expect(paidHtml).toMatch(/<a(?=[^>]*aria-current="page")[^>]*href="\/series\/paid"[^>]*>유료연재<\/a>/);
    expect(paidHtml).not.toMatch(/<a(?=[^>]*aria-current="page")[^>]*href="\/series\/free"/);
    expect(paidHtml).toMatch(/<a(?=[^>]*aria-current="page")[^>]*href="\/series\/paid\?sub=completed"[^>]*>완결<\/a>/);
  });

  it('hides the sub row and leaves all main tabs inactive on /search and /author/[id]', async () => {
    for (const p of ['/search', '/author/author-1']) {
      const html = await render(p, true, 'sub=new&genre=판타지');
      expect(html).toContain('data-header="reader"');
      expect(html).toContain('aria-label="연재 구분"');
      expect(html).not.toContain('aria-label="서브 구분"');
      expect(html).not.toContain('data-row="sub"');
      expect(html).not.toContain('aria-current="page"');
      expect(html.match(/overflow-x-auto/g)?.length).toBe(1);
    }
  });

  it('keeps home (/) and work detail (/works/[id]) fallback on free/전체', async () => {
    for (const p of ['/', '/works/work-1']) {
      const html = await render(p);
      expect(html).toContain('data-header="reader"');
      expect(html).toMatch(/<a(?=[^>]*aria-current="page")[^>]*href="\/series\/free"[^>]*>무료연재<\/a>/);
      expect(html).toMatch(/<a(?=[^>]*aria-current="page")[^>]*href="\/series\/free"[^>]*>전체<\/a>/);
    }
  });

  it('compact routes have no reader tabs', async () => {
    for (const p of ['/studio', '/admin', '/account']) {
      const html = await render(p);
      expect(html).not.toContain('무료연재');
      expect(html).toContain('data-account="reader"');
      expect(html).toContain('h-14');
    }
  });

  it('viewer route renders no header', async () => {
    expect(await render('/works/a/chapters/b')).toBe('');
  });

  it('guest: login link, no balance', async () => {
    const html = await render('/', false);
    expect(html).toContain('/login');
    expect(html).not.toContain('data-balance');
    expect(html).not.toContain('충전');
  });

  it('balanceSlot replaces default balance', () => {
    m.path = '/';
    m.search = '';
    const html = renderToStaticMarkup(
      React.createElement(ReaderHeaderFrame, {
        brand: 'b',
        account: 'a',
        loggedIn: true,
        balance: 5,
        balanceSlot: React.createElement('i', { 'data-slot': '1' }),
      }),
    );
    expect(html).toContain('data-slot="1"');
    expect(html).not.toContain('data-balance');
  });
});
