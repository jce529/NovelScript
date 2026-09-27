import { JEV_ACTIVATION_THRESHOLDS } from './config';

export interface ShadowLogRow {
  status: 'ok' | 'error'; task_decision: string | null; task_correct: boolean | null;
  folder_fallback: boolean | null; template_fallback: boolean | null; call_count: number;
  latency_ms: number; estimated_cost_usd: number | null;
}
export interface ShadowMetrics {
  sampleSize: number; errorRate: number; taskAccuracy: number | null; clarifyRate: number; documentRate: number;
  folderFallbackRate: number | null; templateFallbackRate: number | null; avgCallCount: number | null;
  avgCostPerCallUsd: number | null; latencyP50: number | null; latencyP95: number | null;
}
export interface DecisionLogRow { accepted: boolean; folder_changed: boolean; template_changed: boolean; regenerated: boolean; }
export interface DecisionMetrics { sampleSize: number; acceptanceRate: number; folderChangeRate: number; templateChangeRate: number; regenerationRate: number; }
const rate = (n: number, d: number) => d ? n / d : 0;
const nullableRate = (n: number, d: number) => d ? n / d : null;
function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(p / 100 * sorted.length) - 1];
}
export function computeShadowMetrics(rows: ShadowLogRow[]): ShadowMetrics {
  const ok = rows.filter(r => r.status === 'ok');
  const taskRows = ok.filter(r => r.task_correct !== null);
  const folderRows = rows.filter(r => r.folder_fallback !== null);
  const templateRows = rows.filter(r => r.template_fallback !== null);
  const calls = rows.reduce((n, r) => n + r.call_count, 0);
  const cost = rows.reduce((n, r) => n + (r.estimated_cost_usd ?? 0), 0);
  return {
    sampleSize: rows.length, errorRate: rate(rows.filter(r => r.status === 'error').length, rows.length),
    taskAccuracy: nullableRate(taskRows.filter(r => r.task_correct === true).length, taskRows.length),
    clarifyRate: rate(ok.filter(r => r.task_decision === 'clarify').length, ok.length),
    documentRate: rate(ok.filter(r => r.task_decision === 'document').length, ok.length),
    folderFallbackRate: nullableRate(folderRows.filter(r => r.folder_fallback).length, folderRows.length),
    templateFallbackRate: nullableRate(templateRows.filter(r => r.template_fallback).length, templateRows.length),
    avgCallCount: rows.length ? calls / rows.length : null, avgCostPerCallUsd: calls ? cost / calls : null,
    latencyP50: percentile(ok.map(r => r.latency_ms), 50), latencyP95: percentile(ok.map(r => r.latency_ms), 95),
  };
}
export function computeDecisionMetrics(rows: DecisionLogRow[]): DecisionMetrics {
  const n = rows.length;
  return { sampleSize: n, acceptanceRate: rate(rows.filter(r => r.accepted).length, n), folderChangeRate: rate(rows.filter(r => r.folder_changed).length, n), templateChangeRate: rate(rows.filter(r => r.template_changed).length, n), regenerationRate: rate(rows.filter(r => r.regenerated).length, n) };
}
export function evaluateShadowGate(m: Pick<ShadowMetrics, 'sampleSize' | 'errorRate' | 'latencyP95'>, t = JEV_ACTIVATION_THRESHOLDS): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (m.sampleSize < t.minShadowSamples) reasons.push('shadow_samples_insufficient');
  if (m.errorRate > t.maxShadowErrorRate) reasons.push('shadow_error_rate');
  if (m.latencyP95 === null || m.latencyP95 > t.maxShadowLatencyP95Ms) reasons.push('shadow_latency_p95');
  return { ok: reasons.length === 0, reasons };
}
