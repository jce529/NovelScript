/** Gemini list pricing, USD per 1,000,000 tokens (verified against
 * https://ai.google.dev/gemini-api/docs/pricing 2026-08-31).
 * Both former tiers use gemini-3.5-flash; re-verify prices when updating the catalog. */
export const GEMINI_PRICING_USD_PER_MILLION: Record<string, { input: number; output: number }> = {
  'gemini-3.5-flash': { input: 1.50, output: 9.00 },
};
