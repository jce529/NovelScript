import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { JEV_ACTIVATION_THRESHOLDS } from './config';
import { computeShadowMetrics, evaluateShadowGate, type ShadowLogRow } from './metrics';
import { untypedTable } from './untyped-table';

export type AiDocPlanningMode = 'off' | 'shadow' | 'active';
export interface ActivationStatus { mode: AiDocPlanningMode; reasons: string[]; modelVersion: string | null; }
export const EVALUATOR_VERSION = 'jev-eval-v1';
export interface EvalMetrics { taskAccuracy: number; folderTemplateAccuracy: number; calibrationError: number; orderSensitivityDrop: number; }
export function metricsPass(m: EvalMetrics, t = JEV_ACTIVATION_THRESHOLDS): boolean {
  return m.taskAccuracy >= t.minTaskAccuracy && m.folderTemplateAccuracy >= t.minFolderTemplateAccuracy
    && m.calibrationError <= t.maxCalibrationError && m.orderSensitivityDrop <= t.maxOrderSensitivityDrop;
}
const keys = Object.keys(JEV_ACTIVATION_THRESHOLDS) as Array<keyof typeof JEV_ACTIVATION_THRESHOLDS>;
export function isWeakerThan(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return keys.some(key => typeof a[key] !== 'number' || typeof b[key] !== 'number'
    || (String(key).startsWith('min') ? Number(a[key]) < Number(b[key]) : Number(a[key]) > Number(b[key])));
}
function stable(value: unknown): string {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return JSON.stringify(value);
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))));
}
function failed(modelVersion: string | null, reason = 'not_requested'): ActivationStatus { return { mode: 'off', reasons: [reason], modelVersion }; }
let cache: { key: string; expires: number; status: ActivationStatus } | null = null;
export function __resetActivationCacheForTests() { cache = null; }

export async function getAiDocPlanningMode(admin: SupabaseClient, env: Record<string, string | undefined> = process.env): Promise<ActivationStatus> {
  const requested = env.AI_DOC_PLANNING_MODE;
  const modelVersion = env.JEV_MODEL_VERSION ?? null;
  if (requested !== 'shadow' && requested !== 'active') return failed(modelVersion);
  if (!env.TYPESAFE_API_KEY || !modelVersion) return failed(modelVersion, 'jev_not_configured');
  if (requested === 'shadow') return { mode: 'shadow', reasons: [], modelVersion };
  const cacheKey = `${requested}:${modelVersion}`;
  if (cache?.key === cacheKey && cache.expires > Date.now()) return cache.status;
  try {
    const { data: approvalRows, error: approvalError } = await untypedTable(admin, 'ai_doc_activation_approvals')
      .select('*').eq('kind', 'policy_review').is('revoked_at', null).eq('model_version', modelVersion).order('approved_at', { ascending: false }).limit(1);
    if (approvalError) throw approvalError;
    const approval = approvalRows?.[0];
    if (!approval) return { mode: 'shadow', reasons: ['policy_approval_missing'], modelVersion };
    const reasons: string[] = [];
    if (stable(approval.approved_thresholds) !== stable(JEV_ACTIVATION_THRESHOLDS)) reasons.push('approved_thresholds_mismatch');
    const { data: priorRows, error: priorError } = await untypedTable(admin, 'ai_doc_activation_approvals')
      .select('approved_at,approved_thresholds').eq('model_version', modelVersion).lt('approved_at', approval.approved_at);
    if (priorError) throw priorError;
    if ((priorRows ?? []).some((prior: { approved_thresholds?: Record<string, unknown> }) => isWeakerThan(approval.approved_thresholds ?? {}, prior.approved_thresholds ?? {}))) reasons.push('approved_thresholds_weakened');
    const { data: evidenceRows, error: evidenceError } = await untypedTable(admin, 'ai_doc_activation_evidence')
      .select('*').eq('model_version', modelVersion).eq('dataset_hash', approval.dataset_hash)
      .eq('evaluator_version', EVALUATOR_VERSION).eq('split', 'holdout').eq('used_real_vendor', true)
      .order('recorded_at', { ascending: false }).limit(1);
    if (evidenceError) throw evidenceError;
    const candidateEvidence = evidenceRows?.[0];
    const evidence = candidateEvidence && candidateEvidence.model_version === modelVersion
      && candidateEvidence.dataset_hash === approval.dataset_hash && candidateEvidence.evaluator_version === EVALUATOR_VERSION
      && candidateEvidence.split === 'holdout' && candidateEvidence.used_real_vendor === true ? candidateEvidence : null;
    if (!evidence) reasons.push('real_vendor_evidence_missing');
    else {
      if (!evidence.metrics || !metricsPass(evidence.metrics)) reasons.push('eval_threshold_not_met');
      if (new Date(evidence.recorded_at).getTime() <= new Date(approval.approved_at).getTime()) reasons.push('evidence_predates_approval');
    }
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: shadowRows, error: shadowError } = await untypedTable(admin, 'ai_doc_plan_shadow_log')
      .select('status,task_decision,task_correct,folder_fallback,template_fallback,call_count,latency_ms,estimated_cost_usd')
      .eq('model_version', modelVersion).gte('created_at', since);
    if (shadowError) throw shadowError;
    reasons.push(...evaluateShadowGate(computeShadowMetrics((shadowRows ?? []) as ShadowLogRow[])).reasons);
    const status: ActivationStatus = { mode: reasons.length ? 'shadow' : 'active', reasons, modelVersion };
    cache = { key: cacheKey, expires: Date.now() + 60_000, status };
    return status;
  } catch {
    return failed(modelVersion, 'activation_query_failed');
  }
}
export async function recordActivationEvidence(admin: SupabaseClient, e: {
  modelVersion: string; datasetHash: string; usedRealVendor: boolean; split: 'calibration' | 'holdout';
  sampleSize: number; metrics: EvalMetrics;
}): Promise<{ recorded: boolean }> {
  if (!e.usedRealVendor) return { recorded: false };
  try {
    const { error } = await untypedTable(admin, 'ai_doc_activation_evidence').insert({
      model_version: e.modelVersion, dataset_hash: e.datasetHash, evaluator_version: EVALUATOR_VERSION,
      used_real_vendor: true, split: e.split, sample_size: e.sampleSize, metrics: e.metrics, passed: metricsPass(e.metrics),
    });
    return { recorded: !error };
  } catch { return { recorded: false }; }
}

