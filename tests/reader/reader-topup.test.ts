import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => '/' }));
vi.mock('@/app/works/[workId]/chapters/[chapterId]/actions', () => ({ purchaseChapterAction: vi.fn() }));
vi.mock('@/components/payment/token-topup-provider', () => ({ useTokenTopup: () => ({ openTopup: vi.fn() }) }));

import { runChapterPurchase, stablePurchaseKey } from '@/components/reader/chapter-purchase-entry';
import { WorkChapterList } from '@/components/reader/work-chapter-list';
import { INSUFFICIENT_BALANCE_MESSAGE } from '@/lib/reader/topup-request';
import type { PurchaseResult } from '@/lib/commerce/actions';
import type { PublicChapterListItem } from '@/lib/chapters/actions';

function setup(result: PurchaseResult | Error, source: 'viewer' | 'work-detail' = 'viewer') {
  const purchase = vi.fn(async () => { if (result instanceof Error) throw result; return result; });
  const openTopup = vi.fn();
  const refresh = vi.fn();
  const returnPath = source === 'viewer' ? '/works/w/chapters/c1?page=2' : '/works/w?p=3';
  const run = () => runChapterPurchase({ chapterId: 'c1', idempotencyKey: 'k1', source, returnPath, purchase, openTopup, refresh });
  return { purchase, openTopup, refresh, run, returnPath };
}

describe('runChapterPurchase', () => {
  it.each(['viewer', 'work-detail'] as const)('%s: insufficient opens top-up once with origin payload', async (source) => {
    const t = setup({ ok: false, error: INSUFFICIENT_BALANCE_MESSAGE }, source);
    expect(await t.run()).toBeNull();
    expect(t.openTopup).toHaveBeenCalledTimes(1);
    expect(t.openTopup).toHaveBeenCalledWith({ source, returnPath: t.returnPath, chapterId: 'c1' });
    expect(t.purchase).toHaveBeenCalledTimes(1); // no auto purchase retry
    expect(t.refresh).not.toHaveBeenCalled();
  });

  it('success refreshes and does not open top-up', async () => {
    const t = setup({ ok: true, orderId: 'o' });
    expect(await t.run()).toBeNull();
    expect(t.refresh).toHaveBeenCalledTimes(1);
    expect(t.openTopup).not.toHaveBeenCalled();
  });

  it.each([
    [{ ok: false, error: 'blind', code: 'content_blinded' as const }],
    [{ ok: false, error: 'gone', code: 'content_unavailable' as const }],
    [{ ok: false, error: 'susp', code: 'write_suspended' as const }],
    [{ ok: false, error: '로그인이 필요해요.' }],
  ])('other failure shows its error and never opens top-up', async (result) => {
    const t = setup(result);
    expect(await t.run()).toBe(result.error);
    expect(t.openTopup).not.toHaveBeenCalled();
  });

  it('network error is reported and does not open top-up', async () => {
    const t = setup(new Error('net'));
    expect(await t.run()).toBe('연결을 확인하고 다시 시도해주세요.');
    expect(t.openTopup).not.toHaveBeenCalled();
  });

  it('retry keeps the same idempotency key per chapter', () => {
    const ref = { current: null as { chapterId: string; key: string } | null };
    let n = 0;
    const make = () => `key-${++n}`;
    expect(stablePurchaseKey(ref, 'c1', make)).toBe('key-1');
    expect(stablePurchaseKey(ref, 'c1', make)).toBe('key-1');
    expect(stablePurchaseKey(ref, 'c2', make)).toBe('key-2');
  });
});

const item = (id: string, state: PublicChapterListItem['state'], i: number): PublicChapterListItem => ({
  id, title: `t${i}`, orderIndex: i, priceTier: 3, locked: state !== 'readable',
  state, blinded: state === 'blinded', entitled: false, blindReason: null,
});

describe('WorkChapterList consumer', () => {
  it('renders the purchase CTA only on purchase_required rows', () => {
    const html = renderToStaticMarkup(React.createElement(WorkChapterList, {
      workId: 'w',
      chapters: [item('a', 'readable', 0), item('b', 'purchase_required', 1), item('c', 'blinded', 2)],
    }));
    expect(html.match(/3 토큰으로 소장/g)).toHaveLength(1);
    expect(html).toContain('id="chapter-b"');
    expect(html).toContain('/works/w/chapters/b');
  });
});
