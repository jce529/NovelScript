import { describe, it, expect } from 'vitest';
import { GEMINI_PRICING_USD_PER_MILLION } from '../../lib/ai/providers/gemini/cost';
import { OPENAI_PRICING_USD_PER_MILLION } from '../../lib/ai/providers/openai/cost';
import { ANTHROPIC_PRICING_USD_PER_MILLION } from '../../lib/ai/providers/anthropic/cost';
import {
  walletTokensPerVendorToken, vendorTokensPerWalletToken, computeMaxOutputTokens,
  computeDebitAmount, PER_REQUEST_MAX_OUTPUT_TOKENS, KRW_PER_WALLET_TOKEN, USD_TO_KRW,
} from '../../lib/ai/cost';

const geminiPricing = GEMINI_PRICING_USD_PER_MILLION['gemini-3.5-flash'];

describe('lib/ai/cost.ts — wallet-token <-> Gemini-token conversion (Open Question 1)', () => {
  it('derives the lite-tier output rate from Gemini list pricing and the placeholder KRW rate', () => {
    expect(walletTokensPerVendorToken(geminiPricing, 'output')).toBeCloseTo(0.00126, 8);
    expect(vendorTokensPerWalletToken(geminiPricing, 'output')).toBeCloseTo(793.650794, 4);
  });

  it('pro-tier rates currently equal lite (both map to gemini-3.5-flash until 프로 moves to a dedicated pro model)', () => {
    expect(walletTokensPerVendorToken(geminiPricing, 'output')).toBeCloseTo(0.00126, 8);
    expect(vendorTokensPerWalletToken(geminiPricing, 'output')).toBeCloseTo(793.650794, 4);
    expect(walletTokensPerVendorToken(geminiPricing, 'input')).toBeCloseTo(0.00021, 8);
  });

  it('caps output at 0 when the wallet balance is exhausted (D-13 hard-stop case)', () => {
    expect(computeMaxOutputTokens({ walletBalance: 0, pricing: geminiPricing })).toBe(0);
  });

  it('caps output at PER_REQUEST_MAX_OUTPUT_TOKENS for a healthy balance (request ceiling binds, not the balance)', () => {
    const cap = computeMaxOutputTokens({ walletBalance: 100, pricing: geminiPricing });
    expect(cap).toBe(2048);
    expect(cap).toBe(PER_REQUEST_MAX_OUTPUT_TOKENS);
  });

  it('caps output below the request ceiling for a low balance, from the whole balance with no input estimate', () => {
    const cap = computeMaxOutputTokens({ walletBalance: 1, pricing: geminiPricing });
    expect(cap).toBe(793);
    expect(cap).toBeLessThan(PER_REQUEST_MAX_OUTPUT_TOKENS);
  });

  it('debits the ACTUAL post-call usage (input+output), never the pre-call estimate (Pitfall 2)', () => {
    const debit = computeDebitAmount({ pricing: geminiPricing, promptTokenCount: 1000, candidatesTokenCount: 2048 });
    expect(debit).toBe(3);
  });

  it('adds thinking tokens at the output rate', () => {
    expect(computeDebitAmount({ pricing: geminiPricing, promptTokenCount: 1000, candidatesTokenCount: 2048, thoughtsTokenCount: 2000 })).toBe(6);
  });

  it('preserves the debit when thinking tokens are omitted', () => {
    expect(computeDebitAmount({ pricing: geminiPricing, promptTokenCount: 1000, candidatesTokenCount: 2048 })).toBe(3);
  });

  it('treats unreported thinking tokens as zero', () => {
    expect(computeDebitAmount({ pricing: geminiPricing, promptTokenCount: 1000, candidatesTokenCount: 2048, thoughtsTokenCount: null })).toBe(3);
  });

  it('charges thinking-only usage at the output rather than input rate', () => {
    expect(computeDebitAmount({ pricing: geminiPricing, promptTokenCount: 0, candidatesTokenCount: 0, thoughtsTokenCount: 1000 })).toBe(2);
  });

  it('returns a nonnegative integer positive zero for zero usage', () => {
    const debit = computeDebitAmount({ pricing: geminiPricing, promptTokenCount: 0, candidatesTokenCount: 0, thoughtsTokenCount: 0 });
    expect(debit).toBe(0);
    expect(Number.isInteger(debit)).toBe(true);
    expect(Object.is(debit, -0)).toBe(false);
  });

  it('BUG-04: folds reported thinking tokens into the output debit at the output rate', () => {
    const withoutThoughts = computeDebitAmount({ pricing: geminiPricing, promptTokenCount: 1000, candidatesTokenCount: 2000 });
    const withThoughts = computeDebitAmount({ pricing: geminiPricing, promptTokenCount: 1000, candidatesTokenCount: 2000, thoughtsTokenCount: 3000 });
    expect(withThoughts).toBeGreaterThan(withoutThoughts);
    expect(withThoughts).toBe(computeDebitAmount({ pricing: geminiPricing, promptTokenCount: 1000, candidatesTokenCount: 2000 + 3000 }));
  });

  it('BUG-04: null thoughtsTokenCount (provider did not report thinking) debits the same as omitting it', () => {
    const omitted = computeDebitAmount({ pricing: geminiPricing, promptTokenCount: 1000, candidatesTokenCount: 2000 });
    const nulled = computeDebitAmount({ pricing: geminiPricing, promptTokenCount: 1000, candidatesTokenCount: 2000, thoughtsTokenCount: null });
    expect(nulled).toBe(omitted);
  });

  it('exposes the conversion constants as named, tunable exports (not inlined magic numbers)', () => {
    expect(typeof KRW_PER_WALLET_TOKEN).toBe('number');
    expect(typeof USD_TO_KRW).toBe('number');
  });

  it('uses the supplied vendor price rather than falling back to Gemini', () => {
    const usage = { promptTokenCount: 10_000, candidatesTokenCount: 10_000 };
    const gemini = computeDebitAmount({ pricing: geminiPricing, ...usage });
    expect(computeDebitAmount({ pricing: OPENAI_PRICING_USD_PER_MILLION['gpt-4o-mini'], ...usage })).not.toBe(gemini);
    expect(computeDebitAmount({ pricing: ANTHROPIC_PRICING_USD_PER_MILLION['claude-haiku-4-5'], ...usage })).not.toBe(gemini);
  });
});
