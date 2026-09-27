import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DecisionClient, DecisionRequest } from '@/lib/ai/decision/types';
import { DecisionCallError } from '@/lib/ai/decision/errors';
import { loadFolderTemplateSet, loadGoldenSet, type FolderTemplateItem, type GoldenItem } from '@/lib/ai/decision/eval/golden-set';
import {
  buildEvidence,
  computeECE,
  evaluateFolderAndTemplate,
  evaluateTaskAndCategory,
  recommendConfidenceThreshold,
} from '@/lib/ai/decision/eval/evaluate';
import { runEval } from '@/lib/ai/decision/eval/run-eval';
import * as plan from '@/lib/ai/decision/plan';

function clientFor(decide: (request: DecisionRequest) => string | Promise<string>): DecisionClient {
  return {
    provider: 'jev',
    async decide(request) {
      return { key: await decide(request), confidence: 0.95, probabilities: {}, latencyMs: 1, modelVersion: 'test-model' };
    },
  };
}

const tinyGolden = (id: string, split: GoldenItem['split'], expectedTask: GoldenItem['expectedTask'] = 'reply'): GoldenItem => ({
  id, split, state: { userRequest: id, chapterContext: '', mentionedFacts: [] }, expectedTask,
  ...(expectedTask === 'document' ? { expectedCategory: '인물' as const } : {}),
  difficulty: 'easy', tags: ['test'], rationale: '합성 평가 시나리오 확인용이다.', reviewer: 'test-reviewer',
});

describe('Jev offline evaluation', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('computes expected calibration error from confidence bins', () => {
    expect(computeECE([{ confidence: 0.5, correct: true }, { confidence: 0.5, correct: false }])).toBeCloseTo(0);
    expect(computeECE([{ confidence: 1, correct: false }, { confidence: 1, correct: false }])).toBeCloseTo(1);
  });

  it('scores task and document category together, counting unavailable as incorrect at zero confidence', async () => {
    const items = [tinyGolden('ok', 'holdout', 'document'), tinyGolden('down', 'holdout', 'reply')];
    const client = clientFor(async (request) => {
      if (request.state.userRequest === 'down') throw new DecisionCallError({ provider: 'jev', status: null, kind: 'unavailable', providerErrorCode: 'OFFLINE' });
      return request.decisionType === 'task' ? 'document' : '장소';
    });
    const result = await evaluateTaskAndCategory(client, items);
    expect(result.accuracy).toBe(0);
    expect(result.records).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'down', correct: false, confidence: 0 }),
      expect.objectContaining({ id: 'ok', correct: false }),
    ]));
  });

  it('shuffles the candidates sent to the decision client when a seed is supplied', async () => {
    const orders: string[][] = [];
    const client = clientFor((request) => { orders.push(request.candidates.map((candidate) => candidate.key)); return request.candidates[0].key; });
    const item = tinyGolden('order', 'holdout');
    await evaluateTaskAndCategory(client, [item]);
    await evaluateTaskAndCategory(client, [item], 42);
    expect(orders[0]).not.toEqual(orders[1]);
  });

  it('routes folder/template items through the production candidate planner', async () => {
    const spy = vi.spyOn(plan, 'planFolderAndTemplateFromCandidates');
    const items = loadFolderTemplateSet().slice(0, 2);
    const client = clientFor((request) => request.candidates[0].key);
    const result = await evaluateFolderAndTemplate(client, items);
    expect(spy).toHaveBeenCalledTimes(items.length);
    expect(result.accuracy).toBeGreaterThanOrEqual(0);
    expect(result.accuracy).toBeLessThanOrEqual(1);
  });

  it('recommends the lowest allowed threshold meeting target precision', () => {
    const records = [
      { confidence: 0.9, correct: true }, { confidence: 0.85, correct: false },
      { confidence: 0.7, correct: true }, { confidence: 0.4, correct: false },
    ];
    expect(recommendConfidenceThreshold(records, 0.9)).toBe(0.9);
    expect(recommendConfidenceThreshold([{ confidence: 0.31, correct: true }], 0.9)).toBe(0.3);
    expect(recommendConfidenceThreshold([{ confidence: 0.3, correct: false }], 0.9)).toBe(0.9);
  });

  it('builds conservative metrics across baseline and order shuffles', () => {
    const metrics = buildEvidence({
      baseline: { accuracy: 0.9, calibrationError: 0.08 },
      shuffledRuns: [{ accuracy: 0.8, calibrationError: 0.12 }, { accuracy: 0.86, calibrationError: 0.1 }],
      folderTemplateAccuracy: 0.75,
    });
    expect(metrics).toMatchObject({ taskAccuracy: 0.8, folderTemplateAccuracy: 0.75, calibrationError: 0.12 });
    expect(metrics.orderSensitivityDrop).toBeCloseTo(0.1);
  });

  it('never records activation evidence for a fixture run', async () => {
    const record = vi.fn(async () => ({ recorded: true }));
    const golden = [tinyGolden('cal-1', 'calibration'), tinyGolden('hold-1', 'holdout')];
    await runEval({ useReal: false, client: clientFor((request) => request.candidates[0].key), modelVersion: 'fixture', record,
      now: () => new Date('2026-01-01T00:00:00Z'), loadGoldenSet: () => golden,
      loadFolderTemplateSet: () => loadFolderTemplateSet().slice(0, 1), datasetHash: () => 'f'.repeat(64), writeReport: false });
    expect(record).not.toHaveBeenCalled();
  });

  it('uses calibration ids for recommendations and holdout count for evidence only', async () => {
    const golden = [tinyGolden('cal-task-1', 'calibration'), tinyGolden('cal-task-2', 'calibration'),
      tinyGolden('hold-task-1', 'holdout'), tinyGolden('hold-task-2', 'holdout'), tinyGolden('hold-task-3', 'holdout')];
    const folderItems = loadFolderTemplateSet().slice(0, 4).map((item, index) => ({ ...item, id: `${index < 2 ? 'cal' : 'hold'}-folder-${index}`, split: index < 2 ? 'calibration' as const : 'holdout' as const }));
    const recommendations: Array<Array<{ id?: string; confidence: number; correct: boolean }>> = [];
    const record = vi.fn(async (_admin, input) => ({ recorded: input.sampleSize === 3 }));
    const result = await runEval({ useReal: true, client: clientFor((request) => request.candidates[0].key), modelVersion: 'model-v1', record,
      now: () => new Date('2026-01-01T00:00:00Z'), loadGoldenSet: () => golden,
      loadFolderTemplateSet: () => folderItems, datasetHash: () => 'a'.repeat(64), createAdmin: () => ({} as never), writeReport: false,
      recommendThreshold(records) { recommendations.push(records); return 0.6; } });
    expect(recommendations).toHaveLength(2);
    expect(recommendations.flat().every((row) => row.id?.startsWith('cal-'))).toBe(true);
    expect(recommendations.flat().some((row) => row.id?.startsWith('hold-'))).toBe(false);
    expect(record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ split: 'holdout', sampleSize: 3, usedRealVendor: true }));
    expect(result.holdout.taskAccuracy).toBeGreaterThanOrEqual(0);
  });
});
