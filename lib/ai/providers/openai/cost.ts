/** OpenAI list pricing, USD per 1,000,000 tokens (verified against
 * developers.openai.com/api/docs/pricing, 2026-09-22). D-06: this table is
 * owned by OpenAI; other providers use their own cost modules. Re-verify
 * before changing prices because vendor pricing can change. */
export const OPENAI_PRICING_USD_PER_MILLION: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-5.6-terra': { input: 2.00, output: 12.00 },
};
