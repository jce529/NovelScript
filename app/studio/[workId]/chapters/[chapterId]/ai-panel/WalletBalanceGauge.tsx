'use client';

import { Button } from '@/components/ui/button';
import type { KeySource } from '@/lib/ai/providers/selection';
import type { WalletStatusState } from '@/lib/ai/wallet-refresh';

export const BYOK_WALLET_COPY = '내 키로 호출해요 · 지갑 토큰은 차감되지 않아요';
export const WALLET_LOADING_COPY = '지갑 잔액을 불러오는 중이에요';
export const WALLET_ERROR_COPY = '지갑 잔액을 불러오지 못했어요';
export const WALLET_GAUGE_LABEL = '지갑 잔액과 최근 AI 차감';

export interface WalletBalanceGaugeProps {
  keySource: KeySource;
  status: WalletStatusState;
  onRetry: () => void;
}

const fmt = (n: number) => n.toLocaleString('ko-KR');

/** Segment widths of the comparison bar: held balance vs the most recent AI debit. Not a share of any fixed budget. */
export function gaugeSegments(balance: number, recentDebit: number): { held: number; spent: number } {
  const b = Number.isFinite(balance) && balance > 0 ? balance : 0;
  const d = Number.isFinite(recentDebit) && recentDebit > 0 ? recentDebit : 0;
  const denominator = Math.max(1, b + d);
  return { held: b / denominator, spent: d / denominator };
}

/** Wallet balance + latest real AI debit for service models; the exact no-charge sentence for own-key (BYOK) models. */
export function WalletBalanceGauge({ keySource, status, onRetry }: WalletBalanceGaugeProps) {
  if (keySource === 'byok') {
    return <p role="status" aria-live="polite" className="text-xs text-muted-foreground">{BYOK_WALLET_COPY}</p>;
  }
  if (status.kind === 'loading') {
    return <p role="status" aria-live="polite" className="text-xs text-muted-foreground">{WALLET_LOADING_COPY}</p>;
  }
  if (status.kind === 'error') {
    return (
      <div role="alert" className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{WALLET_ERROR_COPY}</span>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>다시 불러오기</Button>
      </div>
    );
  }
  const { held, spent } = gaugeSegments(status.balance, status.recentDebit);
  return (
    <div className="flex flex-col gap-1 text-xs text-muted-foreground" data-wallet-gauge="">
      <div
        role="img"
        aria-label={WALLET_GAUGE_LABEL}
        className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div data-segment="held" className="h-full bg-primary" style={{ width: `${held * 100}%` }} />
        <div data-segment="spent" className="h-full bg-muted-foreground/40" style={{ width: `${spent * 100}%` }} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span>보유 지갑 토큰 {fmt(status.balance)}</span>
        <span>최근 AI 차감 {fmt(status.recentDebit)}토큰</span>
      </div>
    </div>
  );
}
