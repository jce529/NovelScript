import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const m = vi.hoisted(() => ({ path: '/', user: true }));
vi.mock('next/navigation', () => ({ usePathname: () => m.path }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: m.user ? { id: 'u1', email: 'reader@x.com' } : null } }) },
    from: () => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.maybeSingle = () => Promise.resolve({ data: { role: 'reader', pen_name: null, balance: 1234 } });
      return q;
    },
  }),
}));
vi.mock('@/components/layout/account-panel', () => ({
  AccountPanel: (p: { displayName: string; balance: number }) =>
    React.createElement('div', { 'data-account': p.displayName, 'data-bal': p.balance }),
}));

import { SiteHeader } from '@/components/layout/site-header';
import { ReaderHeaderFrame } from '@/components/reader/reader-header-frame';

async function render(path: string, user = true) {
  m.path = path;
  m.user = user;
  return renderToStaticMarkup(await SiteHeader());
}

describe('SiteHeader reader frame', () => {
  it('reader route: 4 tabs, overflow rows, disabled search/charge, balance, account', async () => {
    const html = await render('/');
    expect(html).toContain('data-header="reader"');
    for (const l of ['무료연재', '유료연재', '랭킹', '내서재']) expect(html).toContain(l);
    expect(html.match(/overflow-x-auto/g)?.length).toBe(2);
    expect(html).toContain('전체');
    expect(html).toMatch(/<button[^>]*disabled[^>]*aria-label="검색 \(준비 중\)"|<button[^>]*aria-label="검색 \(준비 중\)"[^>]*disabled/);
    expect(html).toContain('1,234');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>충전/);
    expect(html).toContain('data-account="reader"');
    expect(html.match(/sticky/g)?.length).toBe(1);
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
