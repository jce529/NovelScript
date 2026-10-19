'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { purchaseChapterAction } from '@/app/works/[workId]/chapters/[chapterId]/actions';
import { useTokenTopup } from '@/components/payment/token-topup-provider';
import { toReaderTopupRequest, type ReaderTopupSource } from '@/lib/reader/topup-request';
import type { PurchaseResult } from '@/lib/commerce/actions';

export interface PurchaseControllerDeps {
  chapterId: string;
  idempotencyKey: string;
  source: ReaderTopupSource;
  returnPath: string;
  purchase: (chapterId: string, idempotencyKey: string) => Promise<PurchaseResult>;
  openTopup: (input: { source: ReaderTopupSource; returnPath: string; chapterId: string }) => void;
  refresh: () => void;
}

/** One purchase attempt. Insufficient balance opens the shared top-up dialog exactly once and
 * never retries or re-keys; top-up completion alone never purchases. Returns the error to show. */
export async function runChapterPurchase(deps: PurchaseControllerDeps): Promise<string | null> {
  try {
    const result = await deps.purchase(deps.chapterId, deps.idempotencyKey);
    if (result.ok) {
      deps.refresh();
      return null;
    }
    const request = toReaderTopupRequest({
      result, source: deps.source, returnPath: deps.returnPath, chapterId: deps.chapterId,
    });
    if (request) {
      deps.openTopup(request);
      return null;
    }
    return result.error ?? '구매를 완료하지 못했어요.';
  } catch {
    return '연결을 확인하고 다시 시도해주세요.';
  }
}

/** Stable per-chapter key: reused across retries until the chapter changes. */
export function stablePurchaseKey(
  ref: { current: { chapterId: string; key: string } | null },
  chapterId: string,
  makeKey: () => string = () => crypto.randomUUID(),
): string {
  if (!ref.current || ref.current.chapterId !== chapterId) ref.current = { chapterId, key: makeKey() };
  return ref.current.key;
}

export function ChapterPurchaseEntry({
  chapterId, priceTier, source, compact = false,
}: {
  chapterId: string;
  priceTier: number | null;
  source: ReaderTopupSource;
  compact?: boolean;
}) {
  const router = useRouter();
  const { openTopup } = useTokenTopup();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef<{ chapterId: string; key: string } | null>(null);
  const inFlight = useRef(false);

  function onClick() {
    if (inFlight.current) return;
    inFlight.current = true;
    const idempotencyKey = stablePurchaseKey(keyRef, chapterId);
    start(async () => {
      setError(null);
      const returnPath = `${window.location.pathname}${window.location.search}`;
      const message = await runChapterPurchase({
        chapterId, idempotencyKey, source, returnPath,
        purchase: purchaseChapterAction,
        openTopup,
        refresh: () => router.refresh(),
      });
      setError(message);
      inFlight.current = false;
    });
  }

  const label = priceTier === null ? '소장' : `${priceTier} 토큰으로 소장`;
  return (
    <>
      <Button type="button" size={compact ? 'sm' : 'default'} disabled={pending} onClick={onClick}>
        {pending ? '구매 처리 중…' : label}
      </Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </>
  );
}
