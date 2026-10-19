import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const m = vi.hoisted(() => ({ user: true }));
vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: m.user ? { id: 'u1', email: 'reader@x.com' } : null } }) },
    from: () => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.maybeSingle = () => Promise.resolve({ data: { role: 'reader', pen_name: null, balance: 777 } });
      return q;
    },
  }),
}));
vi.mock('@/components/layout/account-panel', () => ({
  AccountPanel: () => React.createElement('div', { 'data-account': '1' }),
}));
vi.mock('@/components/payment/header-token-balance', () => ({
  HeaderTokenBalance: (p: { balance: number; loggedIn: boolean }) =>
    p.loggedIn ? React.createElement('span', { 'data-htb': p.balance }, 'topup+') : null,
}));

import { SiteHeader } from '@/components/layout/site-header';

async function render(user: boolean) {
  m.user = user;
  return renderToStaticMarkup(await SiteHeader());
}

describe('SiteHeader HeaderTokenBalance slot', () => {
  it('logged-in: passes the SSR wallet balance to HeaderTokenBalance, no disabled placeholder', async () => {
    const html = await render(true);
    expect(html).toContain('data-htb="777"');
    expect(html).not.toContain('충전 (준비 중)');
    expect(html).toContain('data-account');
  });
  it('guest: no balance slot or charge button, login link remains', async () => {
    const html = await render(false);
    expect(html).not.toContain('data-htb');
    expect(html).not.toContain('충전');
    expect(html).toContain('/login');
  });
  it('does not embed a dialog or provider inside the header source', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('components/layout/site-header.tsx', 'utf8');
    expect(src).not.toMatch(/TokenTopupProvider|TokenTopupDialog/);
  });
});
