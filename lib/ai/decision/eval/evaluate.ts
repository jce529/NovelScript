import type { DecisionClient } from '../types';
import type { EvalMetrics } from '../activation';
import { planTaskAndCategory, planFolderAndTemplateFromCandidates } from '../plan';
import type { FolderTemplateItem, GoldenItem } from './golden-set';

export interface ConfidenceRecord { id?: string; confidence: number; correct: boolean; }
export interface EvaluationResult { accuracy: number; calibrationError: number; records: ConfidenceRecord[]; }
export interface FolderEvaluationResult { accuracy: number; records: ConfidenceRecord[]; }
export const ORDER_SEEDS = [11, 42, 97] as const;

export function computeECE(records: ConfidenceRecord[], bins = 10): number {
  if (!Number.isInteger(bins) || bins < 1) throw new RangeError('bins must be a positive integer');
  if (records.length === 0) return 0;
  const buckets = Array.from({ length: bins }, () => [] as ConfidenceRecord[]);
  for (const record of records) {
    const index = Math.min(bins - 1, Math.floor(Math.max(0, Math.min(1, record.confidence)) * bins));
    buckets[index].push(record);
  }
  return buckets.reduce((ece, bucket) => {
    if (bucket.length === 0) return ece;
    const confidence = bucket.reduce((sum, row) => sum + row.confidence, 0) / bucket.length;
    const accuracy = bucket.filter((row) => row.correct).length / bucket.length;
    return ece + (bucket.length / records.length) * Math.abs(accuracy - confidence);
  }, 0);
}

export async function evaluateTaskAndCategory(
  client: DecisionClient,
  items: GoldenItem[],
  seed?: number,
): Promise<EvaluationResult> {
  const records: ConfidenceRecord[] = [];
  for (const item of items) {
    const result = await planTaskAndCategory(client, item.state, seed === undefined ? {} : { seed });
    const correct = result.kind === item.expectedTask
      && (result.kind !== 'document' || result.category === item.expectedCategory);
    const confidence = result.kind === 'unavailable' ? 0
      : result.kind === 'document' ? Math.min(result.taskConfidence, result.categoryConfidence)
        : result.taskConfidence;
    records.push({ id: item.id, confidence, correct });
  }
  return {
    accuracy: records.length ? records.filter((record) => record.correct).length / records.length : 0,
    calibrationError: computeECE(records),
    records,
  };
}

export async function evaluateFolderAndTemplate(
  client: DecisionClient,
  items: FolderTemplateItem[],
  seed?: number,
): Promise<FolderEvaluationResult> {
  const records: ConfidenceRecord[] = [];
  for (const item of items) {
    const result = await planFolderAndTemplateFromCandidates(client, {
      state: item.state,
      folders: item.folders,
      templates: item.templates,
      ...(seed === undefined ? {} : { seed }),
    });
    const correct = result.folder.id === item.expectedFolderId && result.template.id === item.expectedTemplateId;
    const decisions = [result.folderConfidence, result.templateConfidence].filter((value): value is number => value !== null);
    const confidence = decisions.length ? Math.min(...decisions) : 1;
    records.push({ id: item.id, confidence, correct });
  }
  return {
    accuracy: records.length ? records.filter((record) => record.correct).length / records.length : 0,
    records,
  };
}

export function recommendConfidenceThreshold(records: ConfidenceRecord[], targetPrecision = 0.9): number {
  for (let step = 6; step <= 18; step++) {
    const threshold = step / 20;
    const selected = records.filter((record) => record.confidence >= threshold);
    if (selected.length && selected.filter((record) => record.correct).length / selected.length >= targetPrecision) return threshold;
  }
  return 0.9;
}

export function buildEvidence(input: {
  baseline: { accuracy: number; calibrationError: number };
  shuffledRuns: { accuracy: number; calibrationError: number }[];
  folderTemplateAccuracy: number;
}): EvalMetrics {
  const accuracies = [input.baseline.accuracy, ...input.shuffledRuns.map((run) => run.accuracy)];
  const errors = [input.baseline.calibrationError, ...input.shuffledRuns.map((run) => run.calibrationError)];
  return {
    taskAccuracy: Math.min(...accuracies),
    folderTemplateAccuracy: input.folderTemplateAccuracy,
    calibrationError: Math.max(...errors),
    orderSensitivityDrop: Math.max(0, input.baseline.accuracy - Math.min(...input.shuffledRuns.map((run) => run.accuracy), input.baseline.accuracy)),
  };
}
