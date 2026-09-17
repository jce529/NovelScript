/**
 * Local, synchronous, offline input-token estimator (replaces the remote token-count API call).
 *
 * Policy: the estimate only sizes maxOutputTokens (D-13 cap). The debit always uses
 * provider-reported usage. If actual usage exceeds the estimate and apply_wallet_delta
 * raises insufficient balance, chat.ts returns a settlement failure (plan 08-03) —
 * never a negative balance and never a clamped amount.
 */

export interface TokenEstimateConstants {
  asciiTokensPerChar: number;
  nonAsciiTokensPerChar: number;
  safetyFactor: number;
  overheadTokens: number;
}

/** Initial design candidate (08-RESEARCH.md), deliberately over-estimating Korean. NOT a tokenizer upper-bound guarantee.
 * Calibrate against provider-reported promptTokenCount on real Korean prose (see 08-VALIDATION.md manual row).
 * Phase 9 adds OPENAI_TOKEN_ESTIMATE / ANTHROPIC_TOKEN_ESTIMATE beside this — never share one constant across providers. */
export const GEMINI_TOKEN_ESTIMATE: TokenEstimateConstants = {
  asciiTokensPerChar: 0.25,
  nonAsciiTokensPerChar: 2.0,
  safetyFactor: 1.25,
  overheadTokens: 32,
};

export function estimateTokens(text: string, c: TokenEstimateConstants): number {
  let ascii = 0;
  let nonAscii = 0;
  // for...of iterates code points, so surrogate pairs (emoji) count once.
  for (const ch of text) {
    if ((ch.codePointAt(0) ?? 0) < 128) ascii += 1;
    else nonAscii += 1;
  }
  return (
    Math.ceil((ascii * c.asciiTokensPerChar + nonAscii * c.nonAsciiTokensPerChar) * c.safetyFactor) +
    c.overheadTokens
  );
}

export function estimateGeminiInputTokens(systemInstruction: string, contents: string): number {
  return estimateTokens(`${systemInstruction}\n\n${contents}`, GEMINI_TOKEN_ESTIMATE);
}
