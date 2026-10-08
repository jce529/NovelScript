/**
 * The ONLY place provider errors cross into app code/logs.
 * Add fields by allowlist, never by spreading the SDK error.
 */
import type { ProviderErrorCode, ProviderErrorContext, ProviderErrorKind, ProviderId, SanitizedProviderError } from './types';

const STATUS_TO_CODE: Partial<Record<number, ProviderErrorCode>> = {
  400: 'INVALID_ARGUMENT', 401: 'UNAUTHENTICATED', 403: 'PERMISSION_DENIED', 404: 'NOT_FOUND',
  429: 'RESOURCE_EXHAUSTED', 500: 'INTERNAL', 503: 'UNAVAILABLE', 504: 'DEADLINE_EXCEEDED',
};

const OPENAI_SPEND_CODES: Record<string, ProviderErrorCode> = {
  credit_balance_exhausted: 'CREDIT_BALANCE_EXHAUSTED',
  organization_spend_limit_exceeded: 'ORGANIZATION_SPEND_LIMIT_EXCEEDED',
  project_spend_limit_exceeded: 'PROJECT_SPEND_LIMIT_EXCEEDED',
  organization_usage_limit_exceeded: 'ORGANIZATION_USAGE_LIMIT_EXCEEDED',
};

function property(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  try { return (value as Record<string, unknown>)[key]; } catch { return undefined; }
}

function readStatus(err: unknown): number | null {
  const status = property(err, 'status');
  return typeof status === 'number' && Number.isInteger(status) && status >= 400 && status <= 599 ? status : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readProviderCode(provider: ProviderId, err: unknown): ProviderErrorCode | null {
  const nested = property(err, 'error');
  if (provider === 'openai') {
    const code = readString(property(err, 'code')) ?? readString(property(nested, 'code'));
    return code ? OPENAI_SPEND_CODES[code] ?? null : null;
  }
  if (provider === 'anthropic') {
    const detailCode = readString(property(property(nested, 'details'), 'error_code'));
    if (detailCode === 'enforced_spend_limit_reached') return 'ENFORCED_SPEND_LIMIT_REACHED';
    return null;
  }
  const code = readString(property(err, 'code')) ?? readString(property(err, 'status'));
  return code === 'PAYMENT_REQUIRED' ? 'PAYMENT_REQUIRED' : code === 'RESOURCE_EXHAUSTED' ? 'RESOURCE_EXHAUSTED' : null;
}

function isGeminiInvalidKey(err: unknown): boolean {
  // Gemini는 잘못된 키를 400 INVALID_ARGUMENT + reason API_KEY_INVALID로 돌려준다(2026-10-08 live 확인).
  // 일반 400(잘못된 요청)과 구분하려고 구조화 사유가 있을 때만 키 무효로 본다. 메시지는 이 판정에만 쓰고 반환·로그하지 않는다.
  const message = readString(property(err, 'message'));
  return message !== null && message.includes('API_KEY_INVALID');
}

export function toSanitizedProviderError(
  provider: ProviderId,
  err: unknown,
  context: ProviderErrorContext = { keySource: 'service' },
): SanitizedProviderError {
  const status = readStatus(err);
  const structuredCode = readProviderCode(provider, err);
  let kind: ProviderErrorKind;
  if (status === null || status >= 500) kind = 'unavailable';
  else if (status === 429) {
    kind = (provider === 'openai' && structuredCode && structuredCode !== 'RESOURCE_EXHAUSTED')
      || (provider === 'anthropic' && structuredCode === 'ENFORCED_SPEND_LIMIT_REACHED')
      ? 'credit_exhausted' : 'rate_limited';
  } else if (provider === 'anthropic' && status === 402) kind = 'credit_exhausted';
  else if (provider === 'gemini' && status === 402 && structuredCode === 'PAYMENT_REQUIRED') kind = 'credit_exhausted';
  else if (context.keySource === 'byok' && (status === 401 || (provider !== 'openai' && status === 403)
    || (provider === 'gemini' && status === 400 && isGeminiInvalidKey(err)))) kind = 'invalid_key';
  else kind = 'config';

  return { provider, status, kind, providerErrorCode: structuredCode ?? (status !== null ? STATUS_TO_CODE[status] ?? null : null) };
}

export class ProviderCallError extends Error {
  readonly info: SanitizedProviderError;
  constructor(info: SanitizedProviderError) {
    super(`provider_call_failed:${info.provider}:${info.kind}`);
    this.name = 'ProviderCallError';
    this.info = { provider: info.provider, status: info.status, kind: info.kind, providerErrorCode: info.providerErrorCode };
  }
}

export function logProviderFailure(info: SanitizedProviderError, idempotencyKey: string): void {
  console.error('[ai] provider call failed', {
    provider: info.provider, status: info.status, kind: info.kind, idempotencyKey,
  });
}
