import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DecisionClient } from './types';
import type { DecisionCallRecord } from './plan';
import { planTaskAndCategory, planFolderAndTemplateFromCandidates } from './plan';
import { SHADOW_SCENARIOS, type ShadowBucket, type ShadowScenario } from './shadow-scenarios';
import { untypedTable } from './untyped-table';

export interface ShadowTrigger { ownerId: string; workId: string; requestKey: string; requestLength: number; hasChapterContext: boolean; mentionedFactCount: number; }
export interface ShadowDeps { client: DecisionClient; admin: SupabaseClient; rng: () => number; now: () => Date; sampleRate: number; dailyMax: number; modelVersion: string; }
export const ESTIMATED_COST_PER_CALL_USD = 0.0005;
export const SHADOW_MAX_CONCURRENCY = 2;
let inFlight = 0;
export function bucketFor(t: Pick<ShadowTrigger, 'requestLength' | 'hasChapterContext' | 'mentionedFactCount'>): ShadowBucket {
  const length = t.requestLength < 40 ? 'short' : t.requestLength < 200 ? 'medium' : 'long';
  return `${length}:${t.hasChapterContext ? 'ctx' : 'noctx'}:${t.mentionedFactCount > 0 ? 'mention' : 'nomention'}`;
}
function hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
export function pickScenario(bucket: ShadowBucket, seedKey: string): ShadowScenario {
  const matches = SHADOW_SCENARIOS.filter(s => s.bucket === bucket);
  return matches[hash(seedKey) % matches.length];
}
export async function runShadowPlan(deps: ShadowDeps, trigger: ShadowTrigger): Promise<{ skipped?: 'not_sampled' | 'daily_budget' | 'circuit_open' | 'concurrency' } | void> {
  try {
    const configuredRate = Number.isFinite(deps.sampleRate) ? deps.sampleRate : 0;
    if (deps.rng() >= Math.max(0, Math.min(configuredRate, 0.2))) return { skipped: 'not_sampled' };
    if (inFlight >= SHADOW_MAX_CONCURRENCY) return { skipped: 'concurrency' };
    inFlight++;
    try {
      const admin = deps.admin;
      const midnight = new Date(deps.now()); midnight.setUTCHours(0, 0, 0, 0);
      const daily = await untypedTable(admin, 'ai_doc_plan_shadow_log').select('id', { count: 'exact', head: true }).gte('created_at', midnight.toISOString());
      if (daily.error || Number(daily.count ?? 0) >= deps.dailyMax) return { skipped: 'daily_budget' };
      const recent = await untypedTable(admin, 'ai_doc_plan_shadow_log').select('status').gte('created_at', new Date(deps.now().getTime() - 10 * 60_000).toISOString()).order('created_at', { ascending: false }).limit(20);
      if (recent.error) return { skipped: 'circuit_open' };
      if ((recent.data ?? []).filter((r: { status: string }) => r.status === 'error').length >= 10) return { skipped: 'circuit_open' };
      const bucket = bucketFor(trigger);
      const scenario = pickScenario(bucket, trigger.requestKey);
      const task = await planTaskAndCategory(deps.client, scenario.state);
      const ft = task.kind === 'document'
        ? await planFolderAndTemplateFromCandidates(deps.client, { state: scenario.state, folders: scenario.folders, templates: scenario.templates })
        : undefined;
      const calls: DecisionCallRecord[] = [...task.calls, ...(ft?.calls ?? [])];
      const firstError = calls.find(c => !c.ok);
      const row = {
        owner_id: trigger.ownerId, work_id: trigger.workId, scenario_id: scenario.id, bucket, model_version: deps.modelVersion,
        status: firstError ? 'error' : 'ok', error_kind: firstError?.errorKind ?? null,
        task_decision: task.kind === 'unavailable' ? null : task.kind,
        task_confidence: task.kind === 'unavailable' ? null : task.taskConfidence,
        category_decision: task.kind === 'document' ? task.category : null,
        category_confidence: task.kind === 'unavailable' ? null : task.categoryConfidence,
        expected_task: scenario.expectedTask, expected_category: scenario.expectedCategory ?? null,
        task_correct: task.kind === 'unavailable' ? null : task.kind === scenario.expectedTask && (task.kind !== 'document' || task.category === scenario.expectedCategory),
        folder_fallback: ft?.folderFallback ?? null, template_fallback: ft?.templateFallback ?? null,
        call_count: calls.length, latency_ms: calls.reduce((sum, c) => sum + c.latencyMs, 0),
        estimated_cost_usd: calls.length * ESTIMATED_COST_PER_CALL_USD, applied: false,
      };
      await untypedTable(admin, 'ai_doc_plan_shadow_log').insert(row);
      if (deps.rng() < 0.01) await admin.rpc('purge_ai_doc_plan_logs', { p_retention_days: 90 });
    } finally { inFlight--; }
  } catch {
    console.error('[ai] shadow plan failed', { stage: 'shadow' });
  }
}
export async function recordDocumentSaveDecision(admin: SupabaseClient, input: {
  ownerId: string; workId: string; nodeId: string; recommendedFolderId?: string; actualFolderId: string;
  recommendedTemplateId?: string | null; actualTemplateId: string | null; regenerated: boolean;
}): Promise<void> {
  if (!input.recommendedFolderId) return;
  try {
    const folderChanged = input.recommendedFolderId !== input.actualFolderId;
    const templateChanged = input.recommendedTemplateId !== input.actualTemplateId;
    const { error } = await untypedTable(admin, 'ai_doc_plan_decision_log').insert({
      owner_id: input.ownerId, work_id: input.workId, node_id: input.nodeId,
      recommended_folder_id: input.recommendedFolderId, actual_folder_id: input.actualFolderId,
      recommended_template_id: input.recommendedTemplateId ?? null, actual_template_id: input.actualTemplateId,
      folder_changed: folderChanged, template_changed: templateChanged, accepted: !folderChanged && !templateChanged,
      regenerated: input.regenerated,
    });
    if (error) throw error;
  } catch { console.error('[ai] decision log failed', { stage: 'decision_log' }); }
}

