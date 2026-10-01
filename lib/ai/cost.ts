/** Conversion constants shared by all provider pricing tables. */
export const KRW_PER_WALLET_TOKEN = 10;
export const USD_TO_KRW = 1400;
export const PER_REQUEST_MAX_OUTPUT_TOKENS = 2048;

export interface VendorPricing { input: number; output: number }

export function walletTokensPerVendorToken(pricing: VendorPricing, kind: 'input' | 'output'): number {
  const usdPerToken = pricing[kind] / 1_000_000;
  const krwPerToken = usdPerToken * USD_TO_KRW;
  return krwPerToken / KRW_PER_WALLET_TOKEN;
}

export function vendorTokensPerWalletToken(pricing: VendorPricing, kind: 'input' | 'output'): number {
  return 1 / walletTokensPerVendorToken(pricing, kind);
}

export interface ComputeMaxOutputTokensInput {
  walletBalance: number;
  pricing: VendorPricing;
}

/** Budget from balance only; actual input and output usage is debited after generation. */
export function computeMaxOutputTokens({ walletBalance, pricing }: ComputeMaxOutputTokensInput): number {
  const outputBudget = Math.floor(Math.max(0, walletBalance) * vendorTokensPerWalletToken(pricing, 'output'));
  return Math.max(0, Math.min(outputBudget, PER_REQUEST_MAX_OUTPUT_TOKENS));
}

export interface ComputeDebitInput {
  pricing: VendorPricing;
  promptTokenCount: number;
  candidatesTokenCount: number;
  /** Reasoning tokens, when separately reported, are billed at the output rate. */
  thoughtsTokenCount?: number | null;
}

/** Charge reported usage in wallet tokens, rounding up to avoid fractional undercharge. */
export function computeDebitAmount({ pricing, promptTokenCount, candidatesTokenCount, thoughtsTokenCount }: ComputeDebitInput): number {
  const billableOutputTokens = candidatesTokenCount + (thoughtsTokenCount ?? 0);
  const inputCost = promptTokenCount * walletTokensPerVendorToken(pricing, 'input');
  const outputCost = billableOutputTokens * walletTokensPerVendorToken(pricing, 'output');
  return Math.max(0, Math.ceil(inputCost + outputCost));
}
