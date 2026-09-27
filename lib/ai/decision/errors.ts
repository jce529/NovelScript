/**
 * The ONLY place Jev errors cross into app code/logs. Add fields by allowlist, never by spreading the SDK error.
 */
import type { DecisionErrorKind, SanitizedDecisionError } from './types';

const STATUS_TO_KIND: Record<number, DecisionErrorKind> = {
  429: 'rate_limited',
  401: 'config',
  403: 'config',
  // 422: request validation failed — a shape bug on our side, not a transient vendor issue.
  422: 'config',
};

function readStatus(err: unknown): number | null {
  if (typeof err !== 'object' || err === null) return null;
  const status = (err as { status?: unknown }).status;
  return typeof status === 'number' && Number.isInteger(status) && status >= 400 && status <= 599 ? status : null;
}

export function toSanitizedDecisionError(err: unknown): SanitizedDecisionError {
  const name = typeof err === 'object' && err !== null ? (err as { name?: unknown }).name : undefined;
  if (name === 'AbortError' || name === 'TimeoutError') {
    return { provider: 'jev', status: null, kind: 'unavailable', providerErrorCode: 'TIMEOUT' };
  }

  const status = readStatus(err);
  const kind = status === null || status >= 500 ? 'unavailable' : (STATUS_TO_KIND[status] ?? 'unavailable');
  return { provider: 'jev', status, kind, providerErrorCode: status === null ? null : `HTTP_${status}` };
}

export class DecisionCallError extends Error {
  readonly info: SanitizedDecisionError;

  constructor(info: SanitizedDecisionError) {
    super(`decision_call_failed:${info.provider}:${info.kind}`);
    this.name = 'DecisionCallError';
    this.info = {
      provider: info.provider,
      status: info.status,
      kind: info.kind,
      providerErrorCode: info.providerErrorCode,
    };
  }
}

export function logDecisionFailure(info: SanitizedDecisionError, requestId: string): void {
  console.error('[ai] decision call failed', {
    provider: info.provider,
    status: info.status,
    kind: info.kind,
    providerErrorCode: info.providerErrorCode,
    requestId,
  });
}
