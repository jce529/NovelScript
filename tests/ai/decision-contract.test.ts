import { describe, expect, it } from 'vitest';
import {
  JEV_ACTIVATION_THRESHOLDS,
  JEV_CONFIDENCE_THRESHOLDS,
  JEV_DEFAULT_TIMEOUT_MS,
} from '@/lib/ai/decision/config';
import { DecisionCallError, logDecisionFailure, toSanitizedDecisionError } from '@/lib/ai/decision/errors';
import type { DecisionClient, DecisionRequest, DecisionResult } from '@/lib/ai/decision/types';

describe('DecisionClient contract and sanitized error boundary', () => {
  it('keeps decisions separate from text providers and exposes required request/result metadata', () => {
    const request: DecisionRequest = {
      decisionType: 'task',
      requestId: 'request-1',
      instructions: 'Choose the most likely candidate.',
      state: {},
      candidates: [{ key: 'candidate-1', label: 'Candidate 1' }],
    };
    const result: DecisionResult = {
      key: 'candidate-1',
      confidence: 0.9,
      probabilities: { 'candidate-1': 0.9 },
      latencyMs: 1,
      modelVersion: 'jev-1.13.0',
    };
    const client: Pick<DecisionClient, 'provider'> = { provider: 'jev' };

    expect(request.decisionType).toBe('task');
    expect(request.requestId).toBe('request-1');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.modelVersion).toContain('jev');
    expect(client.provider).toBe('jev');
  });

  it('normalizes timeout and HTTP failures without raw error fields', () => {
    expect(toSanitizedDecisionError(Object.assign(new Error('secret'), { name: 'TimeoutError' }))).toEqual({
      provider: 'jev',
      status: null,
      kind: 'unavailable',
      providerErrorCode: 'TIMEOUT',
    });
    expect(toSanitizedDecisionError({ status: 429 })).toEqual({
      provider: 'jev',
      status: 429,
      kind: 'rate_limited',
      providerErrorCode: 'HTTP_429',
    });
    expect(new DecisionCallError(toSanitizedDecisionError({ status: 503 })).info).toEqual({
      provider: 'jev',
      status: 503,
      kind: 'unavailable',
      providerErrorCode: 'HTTP_503',
    });
    expect(typeof logDecisionFailure).toBe('function');
  });

  it('exports pre-registered thresholds and the default timeout', () => {
    expect(JEV_CONFIDENCE_THRESHOLDS.taskAndCategory).toBe(0.6);
    expect(JEV_ACTIVATION_THRESHOLDS.minTaskAccuracy).toBe(0.85);
    expect(JEV_DEFAULT_TIMEOUT_MS).toBe(2000);
  });
});
