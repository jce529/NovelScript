import 'server-only';
import type { DecisionClient, DecisionRequest, DecisionResult } from './types';
import { KB_CATEGORIES } from '@/lib/kb/categories';

export const DECISION_FIXTURE_MODES = ['high-confidence-document', 'clarify', 'low-confidence-folder'] as const;
export type DecisionFixtureMode = (typeof DECISION_FIXTURE_MODES)[number];

export function readDecisionFixture(env: Record<string, string | undefined>): DecisionFixtureMode | null {
  if (env.NODE_ENV !== 'development') return null;
  const value = env.DECISION_FIXTURE;
  if (!value || value === 'off') return null;
  return (DECISION_FIXTURE_MODES as readonly string[]).includes(value) ? value as DecisionFixtureMode : null;
}

function candidateKey(request: DecisionRequest, preferred: string, fromEnd = false): string {
  const candidates = request.candidates;
  if (candidates.length === 0) throw new Error('Decision fixture requires at least one candidate');
  const match = candidates.find((candidate) => candidate.key === preferred);
  return match?.key ?? candidates[fromEnd ? candidates.length - 1 : 0].key;
}

export function createFixtureDecisionClient(mode: DecisionFixtureMode): DecisionClient {
  return {
    provider: 'jev',
    async decide(request): Promise<DecisionResult> {
      let preferred: string;
      let confidence = 0.9;
      switch (mode) {
        case 'clarify':
          preferred = request.decisionType === 'task' ? 'clarify' : request.candidates[0]?.key ?? '';
          break;
        case 'low-confidence-folder':
          if (request.decisionType === 'task') preferred = 'document';
          else if (request.decisionType === 'category') preferred = KB_CATEGORIES[0];
          else preferred = request.candidates.at(-1)?.key ?? '';
          if (request.decisionType === 'folder' || request.decisionType === 'template') confidence = 0.2;
          break;
        case 'high-confidence-document':
          if (request.decisionType === 'task') preferred = 'document';
          else if (request.decisionType === 'category') preferred = KB_CATEGORIES[0];
          else preferred = request.candidates.at(-1)?.key ?? '';
          break;
      }
      const answer: DecisionResult = {
        key: candidateKey(request, preferred, request.decisionType === 'folder' || request.decisionType === 'template'),
        confidence,
        probabilities: {},
        latencyMs: 1,
        modelVersion: 'fixture',
      };
      return answer;
    },
  };
}
