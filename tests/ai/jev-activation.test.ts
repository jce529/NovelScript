import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { JEV_ACTIVATION_THRESHOLDS } from '@/lib/ai/decision/config';
vi.mock('server-only', () => ({}));
import { EVALUATOR_VERSION, getAiDocPlanningMode, isWeakerThan, metricsPass, recordActivationEvidence, __resetActivationCacheForTests } from '@/lib/ai/decision/activation';

const goodMetrics = { taskAccuracy: 0.9, folderTemplateAccuracy: 0.9, calibrationError: 0.05, orderSensitivityDrop: 0.02 };
const approval = (overrides = {}) => ({ kind: 'policy_review', approved_by: 'writer', model_version: 'jev-1', dataset_hash: 'hash-1', approved_thresholds: JEV_ACTIVATION_THRESHOLDS, approved_at: '2026-09-01T00:00:00Z', revoked_at: null, ...overrides });
const evidence = (overrides = {}) => ({ model_version: 'jev-1', dataset_hash: 'hash-1', evaluator_version: EVALUATOR_VERSION, used_real_vendor: true, split: 'holdout', metrics: goodMetrics, passed: true, recorded_at: '2026-09-02T00:00:00Z', ...overrides });
function admin(data: Record<string, unknown> = {}, errorTable?: string) {
  const calls: string[] = [];
  const client = { from: (table: string) => {
    calls.push(table);
    const builder = { select: () => builder, eq: () => builder, is: () => builder, lt: () => builder, gte: () => builder, order: () => builder, limit: () => builder,
      insert: vi.fn((row: unknown) => ({ select: () => ({ single: async () => ({ data: row, error: null }) }) })),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: data[table] ?? [], error: errorTable === table ? new Error('db') : null }).then(resolve) };
    return builder;
  } } as unknown as SupabaseClient;
  return { client, calls };
}
const activeEnv = { AI_DOC_PLANNING_MODE: 'active', TYPESAFE_API_KEY: 'key', JEV_MODEL_VERSION: 'jev-1' };
const shadowRows = Array.from({ length: 200 }, () => ({ status: 'ok', task_decision: 'document', task_correct: true, folder_fallback: false, template_fallback: false, call_count: 1, latency_ms: 100, estimated_cost_usd: 0.01 }));
const allRows = (a = [approval()], e = [evidence()], s: unknown[] = shadowRows) => ({ ai_doc_activation_approvals: a, ai_doc_activation_evidence: e, ai_doc_plan_shadow_log: s });

describe('persistent Jev activation gate', () => {
  beforeEach(() => __resetActivationCacheForTests());
  it('defaults to off without querying the database', async () => {
    const db = admin();
    await expect(getAiDocPlanningMode(db.client, {})).resolves.toMatchObject({ mode: 'off', reasons: ['not_requested'] });
    expect(db.calls).toHaveLength(0);
  });
  it('turns off when shadow requested without provider or pinned model configuration', async () => {
    await expect(getAiDocPlanningMode(admin().client, { AI_DOC_PLANNING_MODE: 'shadow', JEV_MODEL_VERSION: 'jev-1' })).resolves.toMatchObject({ mode: 'off', reasons: ['jev_not_configured'] });
  });
  it('returns shadow without querying approvals or evidence when configured', async () => {
    const db = admin();
    await expect(getAiDocPlanningMode(db.client, { AI_DOC_PLANNING_MODE: 'shadow', TYPESAFE_API_KEY: 'key', JEV_MODEL_VERSION: 'jev-1' })).resolves.toMatchObject({ mode: 'shadow' });
    expect(db.calls).toHaveLength(0);
  });
  it('requires a current policy approval', async () => {
    await expect(getAiDocPlanningMode(admin({ ai_doc_activation_approvals: [] }).client, activeEnv)).resolves.toMatchObject({ mode: 'shadow', reasons: expect.arrayContaining(['policy_approval_missing']) });
  });
  it('rejects fixture evidence', async () => {
    await expect(getAiDocPlanningMode(admin(allRows(undefined, [evidence({ used_real_vendor: false })])).client, activeEnv)).resolves.toMatchObject({ mode: 'shadow', reasons: expect.arrayContaining(['real_vendor_evidence_missing']) });
  });
  it('requires matching model, approval dataset hash, and evaluator version', async () => {
    for (const bad of [evidence({ model_version: 'other' }), evidence({ dataset_hash: 'other' }), evidence({ evaluator_version: 'old' })]) {
      await expect(getAiDocPlanningMode(admin(allRows(undefined, [bad])).client, activeEnv)).resolves.toMatchObject({ mode: 'shadow' });
    }
  });
  it('recomputes evaluation thresholds instead of trusting passed', async () => {
    await expect(getAiDocPlanningMode(admin(allRows(undefined, [evidence({ metrics: { ...goodMetrics, taskAccuracy: 0.1 }, passed: true })])).client, activeEnv)).resolves.toMatchObject({ mode: 'shadow', reasons: expect.arrayContaining(['eval_threshold_not_met']) });
  });
  it('requires approved thresholds to equal the current pre-registered thresholds', async () => {
    await expect(getAiDocPlanningMode(admin(allRows([approval({ approved_thresholds: { ...JEV_ACTIVATION_THRESHOLDS, minTaskAccuracy: 0.1 } })])).client, activeEnv)).resolves.toMatchObject({ mode: 'shadow', reasons: expect.arrayContaining(['approved_thresholds_mismatch']) });
  });
  it('requires the minimum shadow sample', async () => {
    await expect(getAiDocPlanningMode(admin(allRows(undefined, undefined, shadowRows.slice(0, 199))).client, activeEnv)).resolves.toMatchObject({ mode: 'shadow', reasons: expect.arrayContaining(['shadow_samples_insufficient']) });
  });
  it('activates only when all approval, evaluation, and shadow gates pass', async () => {
    await expect(getAiDocPlanningMode(admin(allRows()).client, activeEnv)).resolves.toMatchObject({ mode: 'active', reasons: [] });
  });
  it('fails closed without throwing when a database query fails', async () => {
    await expect(getAiDocPlanningMode(admin({}, 'ai_doc_activation_approvals').client, activeEnv)).resolves.toMatchObject({ mode: 'off', reasons: ['activation_query_failed'] });
  });
  it('does not persist fixture evaluation evidence', async () => {
    const insert = vi.fn(); const client = { from: () => ({ insert }) } as unknown as SupabaseClient;
    await expect(recordActivationEvidence(client, { modelVersion: 'jev-1', datasetHash: 'hash-1', usedRealVendor: false, split: 'holdout', sampleSize: 10, metrics: goodMetrics })).resolves.toEqual({ recorded: false });
    expect(insert).not.toHaveBeenCalled();
  });
  it('rejects evidence recorded no later than approval', async () => {
    await expect(getAiDocPlanningMode(admin(allRows(undefined, [evidence({ recorded_at: '2026-09-01T00:00:00Z' })])).client, activeEnv)).resolves.toMatchObject({ mode: 'shadow', reasons: expect.arrayContaining(['evidence_predates_approval']) });
  });
  it('detects weakened historical approvals and validates comparison helpers', async () => {
    const weaker = { ...JEV_ACTIVATION_THRESHOLDS, minTaskAccuracy: 0.8, maxCalibrationError: 0.2 };
    expect(isWeakerThan(weaker, JEV_ACTIVATION_THRESHOLDS)).toBe(true);
    expect(isWeakerThan(JEV_ACTIVATION_THRESHOLDS, weaker)).toBe(false);
    expect(metricsPass(goodMetrics)).toBe(true);
    const db = admin({ ...allRows(), ai_doc_activation_approvals: [approval({ approved_thresholds: weaker }), approval({ approved_at: '2026-08-01T00:00:00Z', approved_thresholds: JEV_ACTIVATION_THRESHOLDS, revoked_at: '2026-08-15T00:00:00Z' })] });
    await expect(getAiDocPlanningMode(db.client, activeEnv)).resolves.toMatchObject({ mode: 'shadow', reasons: expect.arrayContaining(['approved_thresholds_weakened']) });
  });
});


