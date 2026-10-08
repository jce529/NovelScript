/**
 * Project-owned provider contract. Every adapter (Gemini now, OpenAI/Anthropic in
 * Phase 9) implements ProviderClient; app code never touches a vendor SDK shape.
 * Client-safe module: client components type-import from here.
 */

export type ProviderId = 'gemini' | 'openai' | 'anthropic';

export type ModelTier = 'lite' | 'pro';

export type NormalizedFinishReason = 'stop' | 'max_tokens' | 'refusal' | 'other';

export const REFUSAL_REASON_CODES = [
  'SAFETY',
  'PROHIBITED_CONTENT',
  'BLOCKLIST',
  'SPII',
  'RECITATION',
  'IMAGE_SAFETY',
  'IMAGE_PROHIBITED_CONTENT',
  'IMAGE_RECITATION',
  'OTHER',
] as const;

export type RefusalReasonCode = (typeof REFUSAL_REASON_CODES)[number];

/** D-05: only structured provider signals. stage 'input' = prompt blocked, no candidates (A); 'output' = safety-family finishReason (B). */
export interface ProviderRefusal {
  stage: 'input' | 'output';
  reasonCode: RefusalReasonCode;
}

/** Provider-reported usage only. Missing fields become 0 with reported flag false — never estimated locally. */
export interface UsageReport {
  inputTokens: number;
  outputTokens: number;
  thoughtsTokens: number | null;
  reported: { input: boolean; output: boolean };
}

/** Upper bound for one provider call. The wallet generation lease TTL is derived from it (BUG-06). */
export const PROVIDER_CALL_TIMEOUT_MS = 120_000;

export interface GenerateParams {
  model: string;
  systemInstruction: string;
  contents: string;
  maxOutputTokens: number;
  temperature: number;
  /** Abort the vendor request after this many ms. Defaults to PROVIDER_CALL_TIMEOUT_MS. */
  timeoutMs?: number;
}

export interface GenerateResult {
  text: string;
  finishReason: NormalizedFinishReason;
  usage: UsageReport;
  refusal: ProviderRefusal | null;
}

export interface ProviderClient {
  readonly provider: ProviderId;
  /** Throws ONLY ProviderCallError (sanitized). Never throws a raw SDK error. */
  generateContent(params: GenerateParams): Promise<GenerateResult>;
}

export type ProviderErrorKind = 'invalid_key' | 'rate_limited' | 'credit_exhausted' | 'unavailable' | 'config';

export interface ProviderErrorContext {
  keySource: 'service' | 'byok';
}

export const PROVIDER_ERROR_CODES = [
  'RESOURCE_EXHAUSTED',
  'UNAVAILABLE',
  'INTERNAL',
  'DEADLINE_EXCEEDED',
  'UNAUTHENTICATED',
  'PERMISSION_DENIED',
  'NOT_FOUND',
  'INVALID_ARGUMENT',
  'API_KEY_MISSING',
  'PAYMENT_REQUIRED',
  'CREDIT_BALANCE_EXHAUSTED',
  'ORGANIZATION_SPEND_LIMIT_EXCEEDED',
  'PROJECT_SPEND_LIMIT_EXCEEDED',
  'ORGANIZATION_USAGE_LIMIT_EXCEEDED',
  'ENFORCED_SPEND_LIMIT_REACHED',
] as const;

export type ProviderErrorCode = (typeof PROVIDER_ERROR_CODES)[number];

export interface SanitizedProviderError {
  provider: ProviderId;
  status: number | null;
  kind: ProviderErrorKind;
  providerErrorCode: ProviderErrorCode | null;
}
