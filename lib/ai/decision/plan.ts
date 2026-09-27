import type { DecisionClient, DecisionRequest, DecisionResult, DecisionType } from './types';
import { DecisionCallError } from './errors';
import {
  buildOpaqueKeyMap,
  CATEGORY_CANDIDATES,
  shuffleArray,
  sortFolderCandidates,
  sortTemplateOptions,
  TASK_CANDIDATES,
} from './candidates';
import { JEV_CONFIDENCE_THRESHOLDS } from './config';
import { listCategoryFolderCandidates, listTemplateOptions, type FolderCandidate, type TemplateOption } from '@/lib/kb/actions';
import { KB_CATEGORIES, type KbCategory } from '@/lib/kb/categories';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface DecisionCallRecord {
  decisionType: DecisionType;
  ok: boolean;
  latencyMs: number;
  modelVersion: string | null;
  errorKind: string | null;
}

export interface PlanOptions { seed?: number; }

async function tryDecide(
  client: DecisionClient,
  req: Omit<DecisionRequest, 'requestId'>,
  calls: DecisionCallRecord[],
): Promise<DecisionResult | null> {
  const started = Date.now();
  try {
    const response = await client.decide({ ...req, requestId: crypto.randomUUID() });
    calls.push({
      decisionType: req.decisionType,
      ok: true,
      latencyMs: response.latencyMs,
      modelVersion: response.modelVersion,
      errorKind: null,
    });
    return response;
  } catch (error) {
    if (!(error instanceof DecisionCallError)) throw error;
    calls.push({
      decisionType: req.decisionType,
      ok: false,
      latencyMs: Date.now() - started,
      modelVersion: null,
      errorKind: error.info.kind,
    });
    return null;
  }
}

function order<T>(items: readonly T[], seed?: number): T[] {
  return seed === undefined ? [...items] : shuffleArray(items, seed);
}

export type TaskCategoryPlan =
  | { kind: 'reply' | 'draft'; taskConfidence: number; categoryConfidence: null; calls: DecisionCallRecord[] }
  | { kind: 'document'; category: KbCategory; taskConfidence: number; categoryConfidence: number; calls: DecisionCallRecord[] }
  | { kind: 'clarify'; taskConfidence: number; categoryConfidence: number | null; calls: DecisionCallRecord[] }
  | { kind: 'unavailable'; calls: DecisionCallRecord[] };

export async function planTaskAndCategory(
  client: DecisionClient,
  state: Record<string, unknown>,
  opts: PlanOptions = {},
): Promise<TaskCategoryPlan> {
  const calls: DecisionCallRecord[] = [];
  const taskCandidates = order(TASK_CANDIDATES, opts.seed).map((key) => ({ key }));
  const task = await tryDecide(client, { decisionType: 'task', state, candidates: taskCandidates }, calls);
  if (!task) return { kind: 'unavailable', calls };

  const taskKey = (TASK_CANDIDATES as readonly string[]).includes(task.key) ? task.key : 'clarify';
  if (task.confidence < JEV_CONFIDENCE_THRESHOLDS.taskAndCategory || taskKey === 'clarify') {
    return { kind: 'clarify', taskConfidence: task.confidence, categoryConfidence: null, calls };
  }
  if (taskKey === 'reply' || taskKey === 'draft') {
    return { kind: taskKey, taskConfidence: task.confidence, categoryConfidence: null, calls };
  }

  const categoryCandidates = order(CATEGORY_CANDIDATES, opts.seed).map((key) => ({ key }));
  const categoryResult = await tryDecide(client, { decisionType: 'category', state, candidates: categoryCandidates }, calls);
  if (!categoryResult) return { kind: 'unavailable', calls };
  const category = (KB_CATEGORIES as readonly string[]).includes(categoryResult.key)
    ? categoryResult.key as KbCategory
    : null;
  if (!category || categoryResult.confidence < JEV_CONFIDENCE_THRESHOLDS.taskAndCategory) {
    return { kind: 'clarify', taskConfidence: task.confidence, categoryConfidence: categoryResult.confidence, calls };
  }
  return { kind: 'document', category, taskConfidence: task.confidence, categoryConfidence: categoryResult.confidence, calls };
}

export interface FolderTemplatePlan {
  kind: 'planned';
  folder: FolderCandidate;
  template: TemplateOption;
  folderConfidence: number | null;
  templateConfidence: number | null;
  folderFallback: boolean;
  templateFallback: boolean;
  calls: DecisionCallRecord[];
}

export async function planFolderAndTemplateFromCandidates(
  client: DecisionClient,
  { state, folders, templates, seed }: {
    state: Record<string, unknown>;
    folders: FolderCandidate[];
    templates: TemplateOption[];
    seed?: number;
  },
): Promise<FolderTemplatePlan> {
  const calls: DecisionCallRecord[] = [];
  const sortedFolders = sortFolderCandidates(folders);
  const root = sortedFolders.find((candidate) => candidate.isRoot);
  if (!root) throw new Error('planFolderAndTemplateFromCandidates: root required');

  let selectedFolder = root;
  let folderConfidence: number | null = null;
  let folderFallback = false;
  if (sortedFolders.length > 1) {
    const keyMap = buildOpaqueKeyMap(sortedFolders, 'folder', (candidate) => ({ path: candidate.path || '(최상위)' }));
    const response = await tryDecide(client, {
      decisionType: 'folder', state, candidates: order(keyMap.candidates, seed),
    }, calls);
    const resolved = response && response.confidence >= JEV_CONFIDENCE_THRESHOLDS.folderAndTemplate
      ? keyMap.resolve(response.key)
      : undefined;
    if (resolved) {
      selectedFolder = resolved;
      folderConfidence = response!.confidence;
    } else {
      folderFallback = true;
      folderConfidence = response?.confidence ?? null;
    }
  }

  const sortedTemplates = sortTemplateOptions(templates);
  const defaultTemplate = sortedTemplates.find((candidate) => candidate.isDefault);
  if (!defaultTemplate) throw new Error('planFolderAndTemplateFromCandidates: default template required');

  let selectedTemplate = defaultTemplate;
  let templateConfidence: number | null = null;
  let templateFallback = false;
  if (sortedTemplates.length > 1) {
    const keyMap = buildOpaqueKeyMap(sortedTemplates, 'template', (candidate) => ({ name: candidate.name, scope: candidate.scope }));
    const response = await tryDecide(client, {
      decisionType: 'template', state, candidates: order(keyMap.candidates, seed),
    }, calls);
    const resolved = response && response.confidence >= JEV_CONFIDENCE_THRESHOLDS.folderAndTemplate
      ? keyMap.resolve(response.key)
      : undefined;
    if (resolved) {
      selectedTemplate = resolved;
      templateConfidence = response!.confidence;
    } else {
      templateFallback = true;
      templateConfidence = response?.confidence ?? null;
    }
  }

  return {
    kind: 'planned', folder: selectedFolder, template: selectedTemplate,
    folderConfidence, templateConfidence, folderFallback, templateFallback, calls,
  };
}

export type FolderTemplatePlanResult = FolderTemplatePlan
  | { kind: 'data_integrity'; reason: 'root_missing' | 'root_duplicate' | 'query_failed' };

export async function planFolderAndTemplate(
  client: DecisionClient,
  supabase: SupabaseClient,
  { ownerId, workId, category, state, seed }: {
    ownerId: string;
    workId: string;
    category: KbCategory;
    state: Record<string, unknown>;
    seed?: number;
  },
): Promise<FolderTemplatePlanResult> {
  const listed = await listCategoryFolderCandidates(supabase, { ownerId, workId, category });
  if (listed.status !== 'ok') return { kind: 'data_integrity', reason: listed.status };
  const templates = await listTemplateOptions(supabase, { ownerId, workId, category });
  return planFolderAndTemplateFromCandidates(client, { state, folders: listed.candidates, templates, seed });
}
