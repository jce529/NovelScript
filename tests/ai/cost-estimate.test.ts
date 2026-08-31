import { describe, it, expect } from 'vitest';
import {
  walletTokensPerGeminiToken, geminiTokensPerWalletToken, computeMaxOutputTokens,
  computeDebitAmount, PER_REQUEST_MAX_OUTPUT_TOKENS, KRW_PER_WALLET_TOKEN, USD_TO_KRW,
} from '../../lib/ai/cost';

describe('lib/ai/cost.ts — wallet-token <-> Gemini-token conversion (Open Question 1)', () => {
  it('derives the lite-tier output rate from Gemini list pricing and the placeholder KRW rate', () => {
    expect(walletTokensPerGeminiToken('lite', 'output')).toBeCloseTo(0.00126, 8);
    expect(geminiTokensPerWalletToken('lite', 'output')).toBeCloseTo(793.650794, 4);
  });

  it('pro-tier rates currently equal lite (both map to gemini-3.5-flash until 프로 moves to a dedicated pro model)', () => {
    expect(walletTokensPerGeminiToken('pro', 'output')).toBeCloseTo(0.00126, 8);
    expect(geminiTokensPerWalletToken('pro', 'output')).toBeCloseTo(793.650794, 4);
    expect(walletTokensPerGeminiToken('pro', 'input')).toBeCloseTo(0.00021, 8);
    expect(walletTokensPerGeminiToken('pro', 'output')).toEqual(walletTokensPerGeminiToken('lite', 'output'));
  });

  it('caps output at 0 when the wallet balance is exhausted (D-13 hard-stop case)', () => {
    expect(computeMaxOutputTokens({ walletBalance: 0, modelTier: 'lite', inputTokenCount: 0 })).toBe(0);
  });

  it('caps output at PER_REQUEST_MAX_OUTPUT_TOKENS for a healthy balance (request ceiling binds, not the balance)', () => {
    const cap = computeMaxOutputTokens({ walletBalance: 100, modelTier: 'lite', inputTokenCount: 500 });
    expect(cap).toBe(2048);
    expect(cap).toBe(PER_REQUEST_MAX_OUTPUT_TOKENS);
  });

  it('caps output below the request ceiling for a low balance + large context (D-13 partial-generation case)', () => {
    const cap = computeMaxOutputTokens({ walletBalance: 1, modelTier: 'pro', inputTokenCount: 500 });
    expect(cap).toBe(710);
    expect(cap).toBeLessThan(PER_REQUEST_MAX_OUTPUT_TOKENS);
  });

  it('debits the ACTUAL post-call usage (input+output), never the pre-call estimate (Pitfall 2)', () => {
    const debit = computeDebitAmount({ modelTier: 'lite', promptTokenCount: 1000, candidatesTokenCount: 2048 });
    expect(debit).toBe(3);
  });

  it('exposes the conversion constants as named, tunable exports (not inlined magic numbers)', () => {
    expect(typeof KRW_PER_WALLET_TOKEN).toBe('number');
    expect(typeof USD_TO_KRW).toBe('number');
  });
});
