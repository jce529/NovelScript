import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const m = vi.hoisted(() => ({ providerCalls: 0 }));
vi.mock('next/font/google', () => ({
  Geist: () => ({ variable: 'geist-sans' }),
  Geist_Mono: () => ({ variable: 'geist-mono' }),
}));
vi.mock('@/app/globals.css', () => ({}));
vi.mock('@/components/ui/sonner', () => ({
  Toaster: () => React.createElement('i', { 'data-toaster': '1' }),
}));
vi.mock('@/components/moderation/account-notices', () => ({
  AccountNotices: () => React.createElement('i', { 'data-notices': '1' }),
}));
vi.mock('@/components/payment/token-topup-provider', () => ({
  TokenTopupProvider: ({ children }: { children: React.ReactNode }) => {
    m.providerCalls += 1;
    return React.createElement('div', { 'data-topup-provider': '1' }, children);
  },
}));

import RootLayout from '@/app/layout';

function render() {
  m.providerCalls = 0;
  const child = React.createElement('main', { 'data-child': '1' }, 'viewer-without-header');
  const html = renderToStaticMarkup(
    (RootLayout as unknown as (p: { children: React.ReactNode }) => React.ReactElement)({ children: child }),
  );
  return html;
}

describe('root layout TokenTopupProvider wiring', () => {
  it('mounts the provider exactly once around children only', () => {
    const html = render();
    expect(m.providerCalls).toBe(1);
    expect(html.match(/data-topup-provider/g)?.length).toBe(1);
    expect(html).toMatch(/<div data-topup-provider="1"><main data-child="1">viewer-without-header<\/main><\/div>/);
  });
  it('preserves AccountNotices before and Toaster after the provider', () => {
    const html = render();
    const n = html.indexOf('data-notices');
    const p = html.indexOf('data-topup-provider');
    const t = html.indexOf('data-toaster');
    expect(n).toBeGreaterThan(-1);
    expect(n).toBeLessThan(p);
    expect(p).toBeLessThan(t);
  });
  it('does not duplicate the dialog host in the layout source', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('app/layout.tsx', 'utf8');
    expect(src).not.toMatch(/TokenTopupDialog/);
    expect(src.match(/<TokenTopupProvider>/g)?.length).toBe(1);
  });
});
