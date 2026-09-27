import 'server-only';
import { z } from 'zod';
import type { DecisionClient, DecisionRequest, DecisionResult } from './types';
import { DecisionCallError, toSanitizedDecisionError } from './errors';
import { JEV_DEFAULT_TIMEOUT_MS } from './config';

const unit = z.number().finite().min(0).max(1);
const QUESTION_ID = 'decision';
const JevResponseSchema = z.object({
  model: z.string().min(1).optional(),
  answers: z.object({
    [QUESTION_ID]: z.object({
      choice: z.string().min(1),
      confidence: unit,
      probabilities: z.record(z.string(), unit).optional(),
    }),
  }),
});

function timeoutFrom(env: Record<string, string | undefined>): number {
  const configured = Number(env.JEV_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : JEV_DEFAULT_TIMEOUT_MS;
}

/**
 * Constructs the TypeSafe AI adapter against the documented `/v1/systemone` "choice" question
 * shape (docs.typesafe.ai/api.md): POST { state, model, questions: { decision: { type, instructions, criteria } } }
 * → { model, answers: { decision: { choice, probabilities, confidence } } }.
 */
export function createJevClient(env: Record<string, string | undefined> = process.env): DecisionClient {
  const apiKey = env.TYPESAFE_API_KEY;
  const model = env.JEV_MODEL_VERSION;
  if (!apiKey) {
    throw new DecisionCallError({ provider: 'jev', status: null, kind: 'config', providerErrorCode: 'API_KEY_MISSING' });
  }
  if (!model) {
    throw new DecisionCallError({ provider: 'jev', status: null, kind: 'config', providerErrorCode: 'MODEL_VERSION_MISSING' });
  }

  const url = env.TYPESAFE_API_BASE_URL || 'https://api.typesafe.ai/v1/systemone';
  const timeoutMs = timeoutFrom(env);

  return {
    provider: 'jev',
    async decide(request: DecisionRequest): Promise<DecisionResult> {
      const started = Date.now();
      // One sanitized boundary: fetch, HTTP status, JSON parsing, schema, and membership all remain inside this try.
      try {
        const criteria = Object.fromEntries(request.candidates.map((candidate) => [candidate.key, candidate.label]));
        const res = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            state: request.state,
            questions: { [QUESTION_ID]: { type: 'choice', instructions: request.instructions, criteria } },
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) throw new DecisionCallError(toSanitizedDecisionError({ status: res.status }));

        let raw: unknown;
        try {
          raw = await res.json();
        } catch {
          throw new DecisionCallError({ provider: 'jev', status: res.status, kind: 'invalid_response', providerErrorCode: 'BAD_JSON' });
        }

        const parsed = JevResponseSchema.safeParse(raw);
        if (!parsed.success) {
          throw new DecisionCallError({ provider: 'jev', status: res.status, kind: 'invalid_response', providerErrorCode: 'SCHEMA_MISMATCH' });
        }

        const answer = parsed.data.answers[QUESTION_ID];
        const allowed = new Set(request.candidates.map((candidate) => candidate.key));
        if (!allowed.has(answer.choice)) {
          throw new DecisionCallError({ provider: 'jev', status: res.status, kind: 'invalid_response', providerErrorCode: 'UNKNOWN_KEY' });
        }

        const probabilities = Object.fromEntries(Object.entries(answer.probabilities ?? {}).filter(([key]) => allowed.has(key)));
        return {
          key: answer.choice,
          confidence: answer.confidence,
          probabilities,
          latencyMs: Date.now() - started,
          modelVersion: parsed.data.model ?? model,
        };
      } catch (err) {
        if (err instanceof DecisionCallError) throw err;
        throw new DecisionCallError(toSanitizedDecisionError(err));
      }
    },
  };
}
