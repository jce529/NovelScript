import type { PurchaseResult } from '@/lib/commerce/actions';

/** The only purchase failure that maps to top-up. purchaseError() has no machine code for it yet,
 * so this exact message is matched in this one adapter. */
export const INSUFFICIENT_BALANCE_MESSAGE = '토큰 잔액이 부족해요.';

export type ReaderTopupSource = 'viewer' | 'work-detail';

export interface ReaderTopupRequest {
  source: ReaderTopupSource;
  returnPath: string;
  chapterId: string;
}

function isLocalWorksPath(value: string): boolean {
  return (
    value.startsWith('/works/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    !value.includes('://') &&
    !value.includes('#')
  );
}

/** Maps an exact insufficient-balance purchase result to a top-up request, otherwise null.
 * No shortage is sent: the server did not confirm one. Success is never a top-up. */
export function toReaderTopupRequest(input: {
  result: PurchaseResult;
  source: ReaderTopupSource;
  returnPath: string;
  chapterId: string;
}): ReaderTopupRequest | null {
  const { result, source, returnPath, chapterId } = input;
  if (result.ok) return null;
  if (result.code !== undefined) return null;
  if (result.error !== INSUFFICIENT_BALANCE_MESSAGE) return null;
  if (!isLocalWorksPath(returnPath)) return null;
  return { source, returnPath, chapterId };
}
