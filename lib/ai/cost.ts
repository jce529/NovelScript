export type ModelTier = 'lite' | 'pro';

/**
 * Open Question 1 (04-RESEARCH.md): the wallet's "토큰" (purchased platform currency,
 * PRICE_TIERS = 10/30/50/100 per lib/chapters/actions.ts) is NOT the same unit as a
 * Gemini LLM token. No prior phase fixed an exchange rate. These two constants ARE
 * the entire exchange rate — change ONLY these to retune the whole AI-spend economy
 * once Phase 5 fixes real Toss Payments pricing. Everything below is derived math,
 * not a second place to tune.
 */
export const KRW_PER_WALLET_TOKEN = 10; // provisional: 1 wallet-토큰 ~= 10 KRW
export const USD_TO_KRW = 1400; // provisional FX rate

/** Gemini list pricing, USD per 1,000,000 tokens (verified against
 * https://ai.google.dev/gemini-api/docs/pricing 2026-08-31). Both tiers currently
 * call gemini-3.5-flash (see lib/ai/providers/models.ts MODEL_TIER_TO_ID) since gemini-2.5-flash/pro
 * were retired for new API keys — re-split this table once 프로 moves to a real
 * pro-tier model. Re-verify before further changes if this pricing goes stale —
 * Gemini pricing changes monthly. */
export const GEMINI_PRICING_USD_PER_MILLION: Record<ModelTier, { input: number; output: number }> = {
  lite: { input: 1.50, output: 9.00 }, // gemini-3.5-flash
  pro: { input: 1.50, output: 9.00 },  // gemini-3.5-flash
};

/** How many wallet-토큰 one Gemini token of this kind actually costs the platform. */
export function walletTokensPerGeminiToken(tier: ModelTier, kind: 'input' | 'output'): number {
  const usdPerToken = GEMINI_PRICING_USD_PER_MILLION[tier][kind] / 1_000_000;
  const krwPerToken = usdPerToken * USD_TO_KRW;
  return krwPerToken / KRW_PER_WALLET_TOKEN;
}

/** Inverse — how many Gemini tokens of this kind one wallet-토큰 buys. */
export function geminiTokensPerWalletToken(tier: ModelTier, kind: 'input' | 'output'): number {
  return 1 / walletTokensPerGeminiToken(tier, kind);
}

/** D-13's "per-request" ceiling — a fixed cap on any single generation's output,
 * independent of balance, so one call is never arbitrarily huge even for a very
 * large wallet balance. (Claude's Discretion per 04-CONTEXT.md.) */
export const PER_REQUEST_MAX_OUTPUT_TOKENS = 2048;

export interface ComputeMaxOutputTokensInput {
  walletBalance: number;
  modelTier: ModelTier;
}

/**
 * D-13: "잔여 토큰까지만 생성. 이후 토큰이 전부 소모됐더라도 알리고 작업 중단."
 * Converts the whole wallet balance into an output-token budget, then applies
 * PER_REQUEST_MAX_OUTPUT_TOKENS on top. There is deliberately no pre-call input-token
 * estimate (Phase 8 decision): input is billed from actual post-call usage, and
 * lib/ai/chat.ts clamps that debit to the pre-call balance, so a near-empty wallet
 * still gets the capped body and the platform absorbs the fractional overshoot.
 * Returns 0 when the balance is 0 or less — lib/ai/chat.ts
 * MUST treat 0 as "stop before calling generateContent at all", never call the API
 * with maxOutputTokens: 0.
 */
export function computeMaxOutputTokens({ walletBalance, modelTier }: ComputeMaxOutputTokensInput): number {
  const outputBudget = Math.floor(Math.max(0, walletBalance) * geminiTokensPerWalletToken(modelTier, 'output'));
  return Math.max(0, Math.min(outputBudget, PER_REQUEST_MAX_OUTPUT_TOKENS));
}

export interface ComputeDebitInput {
  modelTier: ModelTier;
  promptTokenCount: number;
  candidatesTokenCount: number;
}

/**
 * Open Question 2 resolution: debit BOTH input and output tokens, because the
 * platform pays Gemini for input tokens too. MUST be called with the ACTUAL
 * post-call usageMetadata values (Pitfall 2). Rounds up so the platform never under-charges by a fraction.
 */
export function computeDebitAmount({ modelTier, promptTokenCount, candidatesTokenCount }: ComputeDebitInput): number {
  const inputCost = promptTokenCount * walletTokensPerGeminiToken(modelTier, 'input');
  const outputCost = candidatesTokenCount * walletTokensPerGeminiToken(modelTier, 'output');
  return Math.max(0, Math.ceil(inputCost + outputCost));
}
