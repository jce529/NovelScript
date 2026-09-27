import { describe, expect, it } from 'vitest';
import { computeDecisionMetrics, computeShadowMetrics, evaluateShadowGate } from '@/lib/ai/decision/metrics';
import { JEV_ACTIVATION_THRESHOLDS } from '@/lib/ai/decision/config';

describe('Jev shadow and decision metrics', () => {
  it('computes error rate and task accuracy from eligible rows', () => {
    const m = computeShadowMetrics([
      { status: 'ok', task_decision: 'clarify', task_correct: true, folder_fallback: false, template_fallback: false, call_count: 1, latency_ms: 10, estimated_cost_usd: 0.1 },
      { status: 'ok', task_decision: 'document', task_correct: false, folder_fallback: true, template_fallback: false, call_count: 2, latency_ms: 20, estimated_cost_usd: 0.2 },
      { status: 'error', task_decision: null, task_correct: null, folder_fallback: null, template_fallback: null, call_count: 1, latency_ms: 100, estimated_cost_usd: null },
    ]);
    expect(m.errorRate).toBeCloseTo(1 / 3);
    expect(m.taskAccuracy).toBe(0.5);
  });

  it('computes nearest-rank p50 and p95 over successful rows only', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ status: i === 0 ? 'error' as const : 'ok' as const, task_decision: null, task_correct: null, folder_fallback: null, template_fallback: null, call_count: 1, latency_ms: i * 10, estimated_cost_usd: 0 }));
    const m = computeShadowMetrics(rows);
    expect(m.latencyP50).toBe(100);
    expect(m.latencyP95).toBe(190);
  });

  it('computes task, fallback, call, and cost aggregates', () => {
    const m = computeShadowMetrics([
      { status: 'ok', task_decision: 'clarify', task_correct: null, folder_fallback: true, template_fallback: false, call_count: 2, latency_ms: 5, estimated_cost_usd: 0.2 },
      { status: 'ok', task_decision: 'document', task_correct: null, folder_fallback: false, template_fallback: true, call_count: 4, latency_ms: 7, estimated_cost_usd: 0.4 },
    ]);
    expect(m.clarifyRate).toBe(0.5);
    expect(m.documentRate).toBe(0.5);
    expect(m.folderFallbackRate).toBe(0.5);
    expect(m.templateFallbackRate).toBe(0.5);
    expect(m.avgCallCount).toBe(3);
    expect(m.avgCostPerCallUsd).toBeCloseTo(0.1);
  });

  it('returns safe empty metrics without throwing', () => {
    expect(computeShadowMetrics([])).toEqual({ sampleSize: 0, errorRate: 0, taskAccuracy: null, clarifyRate: 0, documentRate: 0, folderFallbackRate: null, templateFallbackRate: null, avgCallCount: null, avgCostPerCallUsd: null, latencyP50: null, latencyP95: null });
  });

  it('computes decision metrics and zeroes for empty input', () => {
    expect(computeDecisionMetrics([])).toEqual({ sampleSize: 0, acceptanceRate: 0, folderChangeRate: 0, templateChangeRate: 0, regenerationRate: 0 });
    expect(computeDecisionMetrics([{ accepted: true, folder_changed: false, template_changed: true, regenerated: false }, { accepted: false, folder_changed: true, template_changed: false, regenerated: true }])).toEqual({ sampleSize: 2, acceptanceRate: 0.5, folderChangeRate: 0.5, templateChangeRate: 0.5, regenerationRate: 0.5 });
  });

  it('reports each shadow gate failure and passes only when all thresholds hold', () => {
    expect(evaluateShadowGate({ sampleSize: 199, errorRate: 0, latencyP95: 1 } as never)).toEqual({ ok: false, reasons: ['shadow_samples_insufficient'] });
    expect(evaluateShadowGate({ sampleSize: 200, errorRate: 0.06, latencyP95: 1 } as never).reasons).toContain('shadow_error_rate');
    expect(evaluateShadowGate({ sampleSize: 200, errorRate: 0, latencyP95: 801 } as never).reasons).toContain('shadow_latency_p95');
    expect(evaluateShadowGate({ sampleSize: 200, errorRate: JEV_ACTIVATION_THRESHOLDS.maxShadowErrorRate, latencyP95: JEV_ACTIVATION_THRESHOLDS.maxShadowLatencyP95Ms } as never)).toEqual({ ok: true, reasons: [] });
  });
});

