'use client';

import { Check, Coins, Loader2, XIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { TopupTier } from '@/lib/payments/tiers';
import {
  canCheckout,
  discountPercent,
  type OpenTopupInput,
  type TopupCatalog,
  type TopupState,
} from './use-topup-flow';

type Props = {
  state: TopupState;
  catalog: TopupCatalog;
  selectedId: string | null;
  context: OpenTopupInput | null;
  awaitingTokens: number | null;
  onSelect: (id: string) => void;
  onDismiss: () => void;
  onCheckout: () => void;
  onReload: () => void;
};

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

function TierCard({ tier, selected, onSelect }: { tier: TopupTier; selected: boolean; onSelect: () => void }) {
  const discount = discountPercent(tier);
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'flex flex-col gap-1 rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        selected ? 'border-primary bg-primary/5 ring-2 ring-primary/40' : 'border-border hover:bg-muted',
      )}
    >
      <span className="flex items-center justify-between">
        <span className="text-xl leading-[1.3] font-semibold">{tier.tokens.toLocaleString('ko-KR')} 토큰</span>
        <span className="flex items-center gap-1.5">
          {tier.label ? <Badge variant="secondary">{tier.label}</Badge> : null}
          {discount > 0 ? <Badge variant="secondary">{discount}% 할인</Badge> : null}
          {selected ? <Check aria-hidden className="size-4 text-primary" /> : null}
        </span>
      </span>
      <span className="text-sm font-medium">{won(tier.priceKrw)}</span>
      {discount > 0 ? (
        <span className="text-xs text-muted-foreground line-through">{won(tier.tokens * 10)}</span>
      ) : (
        <span className="text-xs text-muted-foreground">기준 가격</span>
      )}
    </button>
  );
}

export function TokenTopupDialog({
  state,
  catalog,
  selectedId,
  context,
  awaitingTokens,
  onSelect,
  onDismiss,
  onCheckout,
  onReload,
}: Props) {
  const open = state !== 'closed';
  const redirecting = state === 'redirecting';
  const awaiting = state === 'awaiting-credit';
  const selectedTier = catalog.tiers.find((tier) => tier.id === selectedId) ?? null;
  const insufficient = context !== null && context.source !== 'header';

  return (
    <Dialog
      open={open}
      disablePointerDismissal={redirecting}
      onOpenChange={(next, details) => {
        if (!next && redirecting) {
          if (details.reason === 'escape-key' || details.reason === 'outside-press' || details.reason === 'close-press') {
            details.cancel();
            return;
          }
        }
        if (!next) onDismiss();
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <div className="flex flex-col gap-2">
          <DialogTitle>토큰 충전소</DialogTitle>
          {!awaiting ? (
            <DialogDescription>
              {insufficient ? (
                <>
                  토큰 잔액이 부족해요.
                  {context?.shortage && context.shortage > 0
                    ? ` ${context.shortage.toLocaleString('ko-KR')} 토큰이 더 필요해요.`
                    : ''}{' '}
                </>
              ) : null}
              충전할 토큰 묶음을 선택해주세요.
            </DialogDescription>
          ) : null}
        </div>
        {!redirecting ? (
          <DialogClose render={<Button variant="ghost" size="icon-sm" className="absolute top-2 right-2" />}>
            <XIcon />
            <span className="sr-only">닫기</span>
          </DialogClose>
        ) : null}

        {awaiting ? (
          <>
            <div role="status" aria-live="polite" className="flex flex-col items-center gap-4 py-8 text-center">
              <Loader2 aria-hidden className="size-8 animate-spin text-muted-foreground" />
              <div className="flex flex-col gap-1">
                <p className="text-sm">결제를 확인하고 있어요</p>
                <p className="text-xs text-muted-foreground">
                  {awaitingTokens !== null
                    ? `${awaitingTokens.toLocaleString('ko-KR')} 토큰이 곧 반영돼요. 충전이 끝나면 자동으로 닫힐게요.`
                    : '충전이 끝나면 자동으로 닫힐게요.'}
                </p>
              </div>
            </div>
            <Button variant="outline" className="h-11 w-full" onClick={onDismiss}>
              닫기
            </Button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2 text-sm">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Coins className="size-4" /> 보유 토큰
              </span>
              <span className="font-medium">{catalog.balance.toLocaleString('ko-KR')}</span>
            </div>

            {catalog.status === 'loading' ? (
              <p role="status" className="py-4 text-center text-sm text-muted-foreground">
                충전 묶음을 불러오고 있어요.
              </p>
            ) : null}
            {catalog.status === 'empty' ? (
              <p className="py-4 text-center text-sm text-muted-foreground">지금 충전할 수 있는 묶음이 없어요.</p>
            ) : null}
            {catalog.status === 'error' ? (
              <div className="flex flex-col items-center gap-2 py-4">
                <p className="text-sm text-muted-foreground">충전 묶음을 불러오지 못했어요.</p>
                <Button variant="outline" onClick={onReload}>
                  다시 불러오기
                </Button>
              </div>
            ) : null}
            {catalog.status === 'ready' ? (
              <div
                role="group"
                aria-label="충전할 토큰 묶음"
                className={cn('grid grid-cols-1 gap-2 sm:grid-cols-2', redirecting && 'pointer-events-none opacity-60')}
              >
                {catalog.tiers.map((tier) => (
                  <TierCard
                    key={tier.id}
                    tier={tier}
                    selected={tier.id === selectedId}
                    onSelect={() => onSelect(tier.id)}
                  />
                ))}
              </div>
            ) : null}

            <div className="flex flex-col gap-2">
              <Button
                size="lg"
                className="h-11 w-full"
                disabled={!canCheckout(state, catalog, selectedId)}
                onClick={onCheckout}
              >
                {redirecting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> 결제창을 여는 중이에요
                  </>
                ) : selectedTier ? (
                  `${won(selectedTier.priceKrw)} 결제하기`
                ) : (
                  '결제하기'
                )}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                {redirecting ? '잠시 후 결제창으로 이동해요.' : '결제는 토스페이먼츠를 통해 안전하게 진행돼요.'}
              </p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
