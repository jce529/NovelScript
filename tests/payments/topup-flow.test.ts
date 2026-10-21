import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn() }) }));
vi.mock('@/lib/payments/actions', () => ({
  createTopupOrderAction: vi.fn(),
  getTopupOrderStatusAction: vi.fn(),
  listTopupTiersAction: vi.fn(),
}));

import {
  canCheckout,
  catalogStatus,
  discountPercent,
  isSafeReturnPath,
  nextTopupState,
  readReturnMarker,
  reconcileSelection,
  resolveReturnPath,
  stripReturnMarker,
  type TopupCatalog,
} from '@/components/payment/use-topup-flow';

const ORDER = `ns_${'a'.repeat(36)}`;
const tiers = [
  { id: 'a', tokens: 100, priceKrw: 1000, label: null },
  { id: 'event', tokens: 2000, priceKrw: 16000, label: '이벤트' },
];
const ready: TopupCatalog = { status: 'ready', tiers, balance: 5 };

describe('topup state machine', () => {
  it('opens, selects, redirects and fails back to tier-select', () => {
    let s = nextTopupState('closed', { type: 'open' });
    expect(s).toBe('tier-select');
    s = nextTopupState(s, { type: 'checkout-start' });
    expect(s).toBe('redirecting');
    expect(nextTopupState(s, { type: 'dismiss' })).toBe('redirecting');
    expect(nextTopupState(s, { type: 'checkout-failed' })).toBe('tier-select');
  });
  it('awaiting dismiss closes and credited closes', () => {
    expect(nextTopupState('awaiting-credit', { type: 'dismiss' })).toBe('closed');
    expect(nextTopupState('awaiting-credit', { type: 'credited' })).toBe('closed');
    expect(nextTopupState('closed', { type: 'return-success' })).toBe('awaiting-credit');
    expect(nextTopupState('closed', { type: 'return-fail' })).toBe('tier-select');
  });
});

describe('return markers', () => {
  it('reads topup order id or topupFail', () => {
    expect(readReturnMarker(`?topup=${ORDER}`)).toEqual({ kind: 'topup', orderId: ORDER });
    expect(readReturnMarker('?topupFail=1')).toEqual({ kind: 'fail' });
    expect(readReturnMarker('?topup=bad')).toBeNull();
    expect(readReturnMarker('?tab=drafts')).toBeNull();
  });
  it('strips only the consumed key', () => {
    expect(stripReturnMarker('/studio', `?tab=drafts&topup=${ORDER}&x=1`, 'topup')).toBe('/studio?tab=drafts&x=1');
    expect(stripReturnMarker('/', '?topupFail=1', 'topupFail')).toBe('/');
  });
});

describe('return path', () => {
  it('uses pathname+search and keeps a source chapter path', () => {
    expect(resolveReturnPath(undefined, '/works/1', '?chapter=3')).toBe('/works/1?chapter=3');
    expect(resolveReturnPath('/read/9?c=2', '/works/1', '')).toBe('/read/9?c=2');
  });
  it('rejects unsafe paths', () => {
    expect(isSafeReturnPath('//evil.com')).toBe(false);
    expect(resolveReturnPath('https://evil.com', '/a', '')).toBe('/a');
  });
});

describe('dynamic catalog', () => {
  it('renders a fifth event tier and its discount from data', () => {
    expect(discountPercent(tiers[1])).toBe(20);
    expect(discountPercent(tiers[0])).toBe(0);
  });
  it('drops a removed selection on refresh', () => {
    expect(reconcileSelection('event', tiers)).toBe('event');
    expect(reconcileSelection('event', [tiers[0]])).toBeNull();
  });
  it('empty/error/loading disable checkout; ready with selection enables', () => {
    expect(catalogStatus([])).toBe('empty');
    expect(canCheckout('tier-select', { status: 'empty', tiers: [], balance: 0 }, 'a')).toBe(false);
    expect(canCheckout('tier-select', { status: 'error', tiers: [], balance: 0 }, 'a')).toBe(false);
    expect(canCheckout('tier-select', ready, null)).toBe(false);
    expect(canCheckout('tier-select', ready, 'gone')).toBe(false);
    expect(canCheckout('tier-select', ready, 'a')).toBe(true);
    expect(canCheckout('redirecting', ready, 'a')).toBe(false);
  });
});

describe('hook source contract', () => {
  const src = readFileSync('components/payment/use-topup-flow.ts', 'utf8');
  it('keeps method CARD with D-04 comment and no useSearchParams / timeout cap / TOPUP_TIERS', () => {
    expect(src).toContain("method: 'CARD'");
    expect(src).toMatch(/D-04[^\n]*\n[^\n]*카드\/카카오페이\/네이버페이\/토스페이/);
    expect(src).not.toContain('useSearchParams');
    expect(src).not.toContain('TOPUP_TIERS');
    expect(src).not.toMatch(/MAX_ATTEMPTS|attempt\s*>/);
  });
  it('success toast only in credited polling branch', () => {
    expect(src.match(/toast\.success/g)).toHaveLength(1);
    expect(src.indexOf('toast.success')).toBeGreaterThan(src.indexOf('if (result.credited)'));
  });
});
