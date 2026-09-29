/** Anthropic list pricing, USD per 1,000,000 tokens (verified against
 * platform.claude.com/docs/en/models/overview, 2026-09-22).
 * D-06: only Anthropic cost lookup should read this provider-owned table. */
export const ANTHROPIC_PRICING_USD_PER_MILLION: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5': { input: 1.00, output: 5.00 },
  'claude-sonnet-5': { input: 2.00, output: 10.00 },
};
