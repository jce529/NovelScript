import 'server-only';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { createFixtureDecisionClient } from '../fixture';
import { createJevClient } from '../jev';
import { EVALUATOR_VERSION, metricsPass, recordActivationEvidence, type EvalMetrics } from '../activation';
import type { DecisionClient } from '../types';
import { datasetHash as readDatasetHash, loadFolderTemplateSet, loadGoldenSet, type FolderTemplateItem, type GoldenItem } from './golden-set';
import { buildEvidence, evaluateFolderAndTemplate, evaluateTaskAndCategory, ORDER_SEEDS, recommendConfidenceThreshold, type ConfidenceRecord } from './evaluate';

export interface EvalDeps {
  useReal: boolean;
  client: DecisionClient;
  modelVersion: string;
  record: typeof recordActivationEvidence | null;
  now: () => Date;
  loadGoldenSet?: () => GoldenItem[];
  loadFolderTemplateSet?: () => FolderTemplateItem[];
  datasetHash?: () => string;
  recommendThreshold?: (records: ConfidenceRecord[], targetPrecision?: number) => number;
  createAdmin?: () => SupabaseClient;
  writeReport?: boolean;
}

export async function runEval(deps: EvalDeps): Promise<{
  holdout: EvalMetrics;
  recommendedThresholds: { taskAndCategory: number; folderAndTemplate: number };
  datasetHash: string;
}> {
  const golden = (deps.loadGoldenSet ?? loadGoldenSet)();
  const folderItems = (deps.loadFolderTemplateSet ?? loadFolderTemplateSet)();
  const hash = (deps.datasetHash ?? readDatasetHash)();
  const recommend = deps.recommendThreshold ?? recommendConfidenceThreshold;
  const calibration = golden.filter((item) => item.split === 'calibration');
  const calibrationFolders = folderItems.filter((item) => item.split === 'calibration');
  const taskRecommendation = evaluateTaskAndCategory(deps.client, calibration);
  const folderRecommendation = evaluateFolderAndTemplate(deps.client, calibrationFolders);
  const [taskCalibration, folderCalibration] = await Promise.all([taskRecommendation, folderRecommendation]);
  const recommendedThresholds = {
    taskAndCategory: recommend(taskCalibration.records),
    folderAndTemplate: recommend(folderCalibration.records),
  };
  console.log(`[eval:jev] recommended JEV_CONFIDENCE_THRESHOLDS.taskAndCategory=${recommendedThresholds.taskAndCategory.toFixed(2)}`);
  console.log(`[eval:jev] recommended JEV_CONFIDENCE_THRESHOLDS.folderAndTemplate=${recommendedThresholds.folderAndTemplate.toFixed(2)}`);

  const holdout = golden.filter((item) => item.split === 'holdout');
  const holdoutFolders = folderItems.filter((item) => item.split === 'holdout');
  const baseline = await evaluateTaskAndCategory(deps.client, holdout);
  const baselineFolders = await evaluateFolderAndTemplate(deps.client, holdoutFolders);
  const shuffledRuns: Array<{ accuracy: number; calibrationError: number }> = [];
  const folderRuns = [baselineFolders];
  for (const seed of ORDER_SEEDS) {
    const [taskRun, folderRun] = await Promise.all([
      evaluateTaskAndCategory(deps.client, holdout, seed),
      evaluateFolderAndTemplate(deps.client, holdoutFolders, seed),
    ]);
    shuffledRuns.push({ accuracy: taskRun.accuracy, calibrationError: taskRun.calibrationError });
    folderRuns.push(folderRun);
  }
  const folderTemplateAccuracy = Math.min(...folderRuns.map((run) => run.accuracy));
  const metrics = buildEvidence({ baseline, shuffledRuns, folderTemplateAccuracy });
  const passes = metricsPass(metrics);
  console.log(`[eval:jev] accuracy=${metrics.taskAccuracy.toFixed(3)} calibrationError=${metrics.calibrationError.toFixed(3)} orderSensitivityDrop=${metrics.orderSensitivityDrop.toFixed(3)} folderTemplateAccuracy=${metrics.folderTemplateAccuracy.toFixed(3)} meetsActivationThreshold=${passes && deps.useReal}`);

  if (deps.useReal && deps.record) {
    const result = await deps.record((deps.createAdmin ?? createAdminClient)(), {
      modelVersion: deps.modelVersion,
      datasetHash: hash,
      usedRealVendor: true,
      split: 'holdout',
      sampleSize: holdout.length,
      metrics,
    });
    if (!result.recorded) throw new Error('Activation evidence could not be recorded');
  } else if (!deps.useReal) {
    console.log('[eval:jev] fixture run — 활성화 증거를 기록하지 않습니다.');
  }

  if (deps.writeReport !== false) {
    const reportPath = path.join(process.cwd(), 'lib/ai/decision/eval/.last-eval-report.json');
    writeFileSync(reportPath, `${JSON.stringify({ note: '참고용 결과이며 활성화 게이트로 사용하지 않습니다.', evaluatorVersion: EVALUATOR_VERSION, datasetHash: hash, usedRealVendor: deps.useReal, recommendedThresholds, holdout: metrics, createdAt: deps.now().toISOString() }, null, 2)}\n`, 'utf8');
  }
  return { holdout: metrics, recommendedThresholds, datasetHash: hash };
}

export async function main(env: Record<string, string | undefined> = process.env): Promise<void> {
  const useReal = Boolean(env.TYPESAFE_API_KEY && env.JEV_MODEL_VERSION);
  const client = useReal ? createJevClient(env) : createFixtureDecisionClient('high-confidence-document');
  await runEval({
    useReal,
    client,
    modelVersion: env.JEV_MODEL_VERSION ?? 'fixture',
    record: useReal ? recordActivationEvidence : null,
    now: () => new Date(),
  });
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath && import.meta.url === invokedPath) {
  main().catch((error: unknown) => {
    console.error('[eval:jev] failed', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
