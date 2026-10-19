'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  createTopupOrderAction,
  getTopupOrderStatusAction,
  listTopupTiersAction,
} from '@/lib/payments/actions';
import type { TopupTier } from '@/lib/payments/tiers';

export type TopupState = 'closed' | 'tier-select' | 'redirecting' | 'awaiting-credit';
export type TopupSource = 'header' | 'viewer' | 'work-detail' | 'binge';
export type OpenTopupInput = {
  source: TopupSource;
  returnPath?: string;
  chapterId?: string;
  shortage?: number;
};
export type TopupCatalog =
  | { status: 'loading'; tiers: TopupTier[]; balance: number }
  | { status: 'ready'; tiers: TopupTier[]; balance: number }
  | { status: 'empty'; tiers: TopupTier[]; balance: number }
  | { status: 'error'; tiers: TopupTier[]; balance: number };

export const POLL_INTERVAL_MS = 2000;
export const CANCEL_TOAST = '결제가 취소되었어요';
export const OPEN_FAIL_TOAST = '결제창을 열지 못했어요. 잠시 후 다시 시도해주세요.';

// ---------------------------------------------------------------- pure helpers

export type TopupEvent =
  | { type: 'open' }
  | { type: 'dismiss' }
  | { type: 'checkout-start' }
  | { type: 'checkout-failed' }
  | { type: 'return-success' }
  | { type: 'return-fail' }
  | { type: 'credited' };

/** Exactly four states; `dismiss` while redirecting is ignored (dismissal guard). */
export function nextTopupState(state: TopupState, event: TopupEvent): TopupState {
  switch (event.type) {
    case 'open':
      return state === 'closed' ? 'tier-select' : state;
    case 'dismiss':
      return state === 'redirecting' ? state : 'closed';
    case 'checkout-start':
      return state === 'tier-select' ? 'redirecting' : state;
    case 'checkout-failed':
      return state === 'redirecting' ? 'tier-select' : state;
    case 'return-success':
      return 'awaiting-credit';
    case 'return-fail':
      return 'tier-select';
    case 'credited':
      return 'closed';
  }
}

export type ReturnMarker = { kind: 'topup'; orderId: string } | { kind: 'fail' } | null;

const ORDER_ID_PATTERN = /^ns_[A-Za-z0-9_-]{36}$/;

/** Reads the one inbound marker from a query string (topup wins over topupFail). */
export function readReturnMarker(search: string): ReturnMarker {
  const params = new URLSearchParams(search);
  const orderId = params.get('topup');
  if (orderId !== null) return ORDER_ID_PATTERN.test(orderId) ? { kind: 'topup', orderId } : null;
  if (params.get('topupFail') !== null) return { kind: 'fail' };
  return null;
}

/** Removes only the consumed marker key; every other param and the pathname survive. */
export function stripReturnMarker(pathname: string, search: string, marker: 'topup' | 'topupFail'): string {
  const params = new URLSearchParams(search);
  params.delete(marker);
  const qs = params.toString();
  return `${pathname}${qs ? `?${qs}` : ''}`;
}

export function isSafeReturnPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    !value.includes('://')
  );
}

/** pathname + search, never href/hash. An explicit safe source path wins. */
export function resolveReturnPath(explicit: string | undefined, pathname: string, search: string): string {
  if (explicit !== undefined && isSafeReturnPath(explicit)) return explicit;
  const current = `${pathname}${search}`;
  return isSafeReturnPath(current) ? current : '/';
}

/** Keeps a selection only while that tier still exists in the refreshed catalog. */
export function reconcileSelection(selectedId: string | null, tiers: TopupTier[]): string | null {
  return selectedId !== null && tiers.some((tier) => tier.id === selectedId) ? selectedId : null;
}

export function catalogStatus(tiers: TopupTier[]): 'ready' | 'empty' {
  return tiers.length > 0 ? 'ready' : 'empty';
}

export function canCheckout(state: TopupState, catalog: TopupCatalog, selectedId: string | null): boolean {
  return (
    state === 'tier-select' &&
    catalog.status === 'ready' &&
    reconcileSelection(selectedId, catalog.tiers) !== null
  );
}

/** Derived from price vs tokens x 10 KRW; 0 when not a discount. */
export function discountPercent(tier: Pick<TopupTier, 'tokens' | 'priceKrw'>): number {
  const base = tier.tokens * 10;
  if (base <= 0) return 0;
  return Math.max(0, Math.floor(((base - tier.priceKrw) * 100) / base));
}

// ----------------------------------------------------------------------- hook

const INITIAL_CATALOG: TopupCatalog = { status: 'loading', tiers: [], balance: 0 };

export function useTopupFlow() {
  const router = useRouter();
  const [state, setState] = useState<TopupState>('closed');
  const [catalog, setCatalog] = useState<TopupCatalog>(INITIAL_CATALOG);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [context, setContext] = useState<OpenTopupInput | null>(null);
  const [pollOrderId, setPollOrderId] = useState<string | null>(null);
  const [awaitingTokens, setAwaitingTokens] = useState<number | null>(null);
  const contextRef = useRef<OpenTopupInput | null>(null);
  const selectedRef = useRef<string | null>(null);
  // Refs are only read from event handlers and effects, so syncing them after commit is enough.
  useEffect(() => {
    contextRef.current = context;
    selectedRef.current = selectedId;
  }, [context, selectedId]);

  const dispatch = useCallback((event: TopupEvent) => {
    setState((prev) => nextTopupState(prev, event));
  }, []);

  const loadCatalog = useCallback(async () => {
    setCatalog((prev) => ({ status: 'loading', tiers: prev.tiers, balance: prev.balance }));
    try {
      const { tiers, balance } = await listTopupTiersAction();
      setSelectedId((prev) => reconcileSelection(prev, tiers));
      setCatalog({ status: catalogStatus(tiers), tiers, balance });
    } catch {
      setSelectedId(null);
      setCatalog({ status: 'error', tiers: [], balance: 0 });
    }
  }, []);

  const openTopup = useCallback(
    (input: OpenTopupInput = { source: 'header' }) => {
      setContext(input);
      setSelectedId(null);
      setState('tier-select');
      void loadCatalog();
    },
    [loadCatalog],
  );

  const dismiss = useCallback(() => dispatch({ type: 'dismiss' }), [dispatch]);

  const select = useCallback((id: string) => setSelectedId(id), []);

  // Mount: consume the one return marker. Plain window read, since the provider is global.
  useEffect(() => {
    const marker = readReturnMarker(window.location.search);
    if (!marker) return;
    const key = marker.kind === 'topup' ? 'topup' : 'topupFail';
    window.history.replaceState(
      null,
      '',
      stripReturnMarker(window.location.pathname, window.location.search, key) + window.location.hash,
    );
    if (marker.kind === 'topup') {
      // 05-UI-SPEC "Detection: mount effect": the marker lives only in window.location (no
      // router search hook), so it is read after mount to keep SSR and hydration identical.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPollOrderId(marker.orderId);
      setState('awaiting-credit');
    } else {
      setSelectedId(null);
      setState('tier-select');
      void loadCatalog();
      toast(CANCEL_TOAST);
    }
  }, [loadCatalog]);

  // Persistent polling: independent of dialog visibility, no timeout/attempt cap.
  useEffect(() => {
    if (!pollOrderId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const result = await getTopupOrderStatusAction(pollOrderId);
        if (cancelled) return;
        if (Number.isFinite(result.tokenAmount) && result.tokenAmount > 0) setAwaitingTokens(result.tokenAmount);
        if (result.credited) {
          setPollOrderId(null);
          dispatch({ type: 'credited' });
          router.refresh();
          toast.success(
            result.tokenAmount > 0
              ? `${result.tokenAmount.toLocaleString('ko-KR')} 토큰이 충전되었어요.`
              : '토큰이 충전되었어요.',
          );
          setAwaitingTokens(null);
          return;
        }
      } catch {
        // pending/failed/transient errors all keep waiting (D-06/D-08).
      }
      if (!cancelled) timer = setTimeout(tick, POLL_INTERVAL_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [pollOrderId, dispatch, router]);

  const checkout = useCallback(async () => {
    const tierId = reconcileSelection(selectedRef.current, catalog.tiers);
    if (state !== 'tier-select' || catalog.status !== 'ready' || tierId === null) return;
    dispatch({ type: 'checkout-start' });
    try {
      const returnPath = resolveReturnPath(
        contextRef.current?.returnPath,
        window.location.pathname,
        window.location.search,
      );
      const order = await createTopupOrderAction(tierId, returnPath);
      const { loadTossPayments, ANONYMOUS } = await import('@tosspayments/tosspayments-sdk');
      const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
      if (!clientKey) throw new Error('Toss client key missing');
      const payment = (await loadTossPayments(clientKey)).payment({ customerKey: ANONYMOUS });
      // D-04: a single method:'CARD' request opens Toss's combined payment screen where the
      // user picks among 카드/카카오페이/네이버페이/토스페이; the app renders no method selector.
      await payment.requestPayment({
        method: 'CARD',
        amount: { currency: 'KRW', value: order.amountKrw },
        orderId: order.orderId,
        orderName: order.orderName,
        successUrl: `${window.location.origin}/api/payments/toss/success`,
        failUrl: `${window.location.origin}/api/payments/toss/fail`,
      });
    } catch {
      dispatch({ type: 'checkout-failed' });
      toast(OPEN_FAIL_TOAST);
      void loadCatalog();
    }
  }, [catalog, state, dispatch, loadCatalog]);

  return {
    state,
    catalog,
    selectedId,
    context,
    awaitingTokens,
    select,
    openTopup,
    dismiss,
    checkout,
    reloadCatalog: loadCatalog,
  };
}
