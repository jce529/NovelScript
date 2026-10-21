/** Client-safe wallet-status refresh controller (04-11). Read-only: never sends to a provider or writes a ledger row. */
import type { ChatOutcome } from '@/lib/ai/chat-request';

export type WalletStatusState =
  | { kind: 'loading' }
  | { kind: 'ok'; balance: number; recentDebit: number }
  | { kind: 'error'; error: string };

export type WalletLoadResult = { ok: true; balance: number; recentDebit: number } | { ok: false; error: string };

/** mount/workId/retry show the loading state; focus/settled/regenerate refresh silently in the background. */
export type WalletRefreshTrigger = 'mount' | 'workId' | 'retry' | 'focus' | 'settled' | 'regenerate';

const VISIBLE_LOADING: ReadonlySet<WalletRefreshTrigger> = new Set(['mount', 'workId', 'retry']);
export const WALLET_LOAD_FAILED = '지갑 잔액을 불러오지 못했어요.';

export interface WalletRefreshController {
  refresh(trigger: WalletRefreshTrigger): Promise<void>;
  /** Invalidates every in-flight request; later refresh() calls and late responses are no-ops. */
  dispose(): void;
  readonly disposed: boolean;
}

export function createWalletRefreshController(deps: {
  load: () => Promise<WalletLoadResult>;
  apply: (state: WalletStatusState) => void;
}): WalletRefreshController {
  let seq = 0;
  let disposed = false;
  return {
    get disposed() { return disposed; },
    dispose() { disposed = true; seq += 1; },
    async refresh(trigger) {
      if (disposed) return;
      const mine = ++seq;
      if (VISIBLE_LOADING.has(trigger)) deps.apply({ kind: 'loading' });
      let state: WalletStatusState;
      try {
        const result = await deps.load();
        state = result.ok
          ? { kind: 'ok', balance: result.balance, recentDebit: result.recentDebit }
          : { kind: 'error', error: result.error || WALLET_LOAD_FAILED };
      } catch {
        state = { kind: 'error', error: WALLET_LOAD_FAILED };
      }
      // Only the latest request may apply; a disposed controller (unmount / workId change) applies nothing.
      if (disposed || mine !== seq) return;
      deps.apply(state);
    },
  };
}

/** Whether a finished chat attempt should re-read the wallet. null = response lost / settlement error. */
export function shouldRefreshWalletAfterChat(outcome: ChatOutcome | null): boolean {
  if (outcome === null) return true;
  if (outcome.kind === 'success') return true;
  return outcome.notice.refreshBalance;
}
