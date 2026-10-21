import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  WalletBalanceGauge, gaugeSegments, BYOK_WALLET_COPY, WALLET_LOADING_COPY, WALLET_ERROR_COPY,
} from '@/app/studio/[workId]/chapters/[chapterId]/ai-panel/WalletBalanceGauge';
import type { WalletStatusState } from '@/lib/ai/wallet-refresh';

const render = (keySource: 'service' | 'byok', status: WalletStatusState) =>
  renderToStaticMarkup(createElement(WalletBalanceGauge, { keySource, status, onRetry: () => {} }));

describe('WalletBalanceGauge', () => {
  it('service: shows balance, recent debit and an accessible gauge', () => {
    const html = render('service', { kind: 'ok', balance: 1200, recentDebit: 300 });
    expect(html).toContain('보유 지갑 토큰 1,200');
    expect(html).toContain('최근 AI 차감 300토큰');
    expect(html).toContain('aria-label="지갑 잔액과 최근 AI 차감"');
    expect(html).toContain('width:80%');
    expect(html).toContain('width:20%');
    expect(html).not.toContain('한도');
    expect(html).not.toMatch(/\d\s*%</);
  });

  it('BYOK hides the gauge and recent debit, even while loading or failed', () => {
    for (const status of [
      { kind: 'ok', balance: 5, recentDebit: 9 }, { kind: 'loading' }, { kind: 'error', error: 'x' },
    ] as WalletStatusState[]) {
      const html = render('byok', status);
      expect(html).toContain('지갑 토큰은 차감되지 않아요');
      expect(html).toContain(BYOK_WALLET_COPY);
      expect(html).not.toContain('최근 AI 차감');
      expect(html).not.toContain('role="img"');
      expect(html).not.toContain(WALLET_LOADING_COPY);
      expect(html).not.toContain(WALLET_ERROR_COPY);
    }
  });

  it('service loading and error are distinct; error offers retry and never shows 0', () => {
    expect(render('service', { kind: 'loading' })).toContain('지갑 잔액을 불러오는 중이에요');
    const html = render('service', { kind: 'error', error: 'x' });
    expect(html).toContain('지갑 잔액을 불러오지 못했어요');
    expect(html).toContain('다시 불러오기');
    expect(html).not.toContain('보유 지갑 토큰');
  });

  it('zero balance and zero debit are stated explicitly with an empty bar', () => {
    const html = render('service', { kind: 'ok', balance: 0, recentDebit: 0 });
    expect(html).toContain('보유 지갑 토큰 0');
    expect(html).toContain('최근 AI 차감 0토큰');
    expect(html).toContain('width:0%');
  });
});

describe('gaugeSegments', () => {
  it('uses denominator max(1, B+D) and survives abnormal numbers', () => {
    expect(gaugeSegments(0, 0)).toEqual({ held: 0, spent: 0 });
    expect(gaugeSegments(30, 10)).toEqual({ held: 0.75, spent: 0.25 });
    expect(gaugeSegments(0, 5)).toEqual({ held: 0, spent: 1 });
    expect(gaugeSegments(Number.NaN, -3)).toEqual({ held: 0, spent: 0 });
    expect(gaugeSegments(Infinity, 1)).toEqual({ held: 0, spent: 1 });
  });
});
