'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { TokenTopupDialog } from './token-topup-dialog';
import { useTopupFlow, type OpenTopupInput } from './use-topup-flow';

type TokenTopupApi = { openTopup: (input?: OpenTopupInput) => void };

const TokenTopupContext = createContext<TokenTopupApi | null>(null);

/**
 * Mounts exactly one flow hook and one dialog, as siblings of the children so polling and
 * the modal survive any transient popover. Opening never authorizes a chapter purchase.
 */
export function TokenTopupProvider({ children }: { children: ReactNode }) {
  const flow = useTopupFlow();
  const { openTopup } = flow;
  const api = useMemo<TokenTopupApi>(() => ({ openTopup }), [openTopup]);
  return (
    <TokenTopupContext.Provider value={api}>
      {children}
      <TokenTopupDialog
        state={flow.state}
        catalog={flow.catalog}
        selectedId={flow.selectedId}
        context={flow.context}
        awaitingTokens={flow.awaitingTokens}
        onSelect={flow.select}
        onDismiss={flow.dismiss}
        onCheckout={() => void flow.checkout()}
        onReload={() => void flow.reloadCatalog()}
      />
    </TokenTopupContext.Provider>
  );
}

export function useTokenTopup(): TokenTopupApi {
  const ctx = useContext(TokenTopupContext);
  if (!ctx) throw new Error('useTokenTopup must be used within TokenTopupProvider');
  return ctx;
}
