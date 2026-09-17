/**
 * The ONLY place provider errors cross into app code/logs.
 * Add fields by allowlist, never by spreading the SDK error.
 * (D-11: a raw SDK error may carry the API key, headers, request config or prompt text.)
 */
import type { ProviderErrorCode, ProviderErrorKind, ProviderId, SanitizedProviderError } from './types';

const STATUS_TO_CODE: Partial<Record<number, ProviderErrorCode>> = {
  400: 'INVALID_ARGUMENT',
  401: 'UNAUTHENTICATED',
  403: 'PERMISSION_DENIED',
  404: 'NOT_FOUND',
  429: 'RESOURCE_EXHAUSTED',
  500: 'INTERNAL',
  503: 'UNAVAILABLE',
  504: 'DEADLINE_EXCEEDED',
};

function readStatus(err: unknown): number | null {
  if (typeof err !== 'object' || err === null) return null;
  const status = (err as { status?: unknown }).status;
  if (typeof status === 'number' && Number.isInteger(status) && status >= 400 && status <= 599) {
    return status;
  }
  return null;
}

export function toSanitizedProviderError(provider: ProviderId, err: unknown): SanitizedProviderError {
  const status = readStatus(err);
  let kind: ProviderErrorKind;
  if (status === 429) kind = 'rate_limited';
  else if (status === null || status >= 500) kind = 'unavailable';
  else kind = 'config';
  const providerErrorCode = status !== null ? (STATUS_TO_CODE[status] ?? null) : null;
  return { provider, status, kind, providerErrorCode };
}

export class ProviderCallError extends Error {
  readonly info: SanitizedProviderError;

  constructor(info: SanitizedProviderError) {
    super(`provider_call_failed:${info.provider}:${info.kind}`);
    this.name = 'ProviderCallError';
    this.info = {
      provider: info.provider,
      status: info.status,
      kind: info.kind,
      providerErrorCode: info.providerErrorCode,
    };
  }
}

export function logProviderFailure(info: SanitizedProviderError, idempotencyKey: string): void {
  console.error('[ai] provider call failed', {
    provider: info.provider,
    status: info.status,
    kind: info.kind,
    idempotencyKey,
  });
}
