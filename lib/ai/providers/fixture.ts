import 'server-only';
import type { GenerateResult, ProviderClient } from './types';
import { ProviderCallError } from './errors';

/**
 * Canned provider for browser verification of refusal / error / lifecycle states
 * (08-09). DEVELOPMENT ONLY — see readProviderFixture.
 */
export const PROVIDER_FIXTURE_MODES = [
  'refusal-input',
  'refusal-output',
  'rate_limited',
  'unavailable',
  'config',
  'slow',
  'drop-response',
] as const;
export type ProviderFixtureMode = (typeof PROVIDER_FIXTURE_MODES)[number];

/** DEVELOPMENT ONLY. Any other NODE_ENV → null, so production can never serve canned output. */
export function readProviderFixture(env: Record<string, string | undefined>): ProviderFixtureMode | null {
  if (env.NODE_ENV !== 'development') return null;
  const v = env.AI_PROVIDER_FIXTURE;
  if (v === 'off') return null;
  return (PROVIDER_FIXTURE_MODES as readonly string[]).includes(v ?? '') ? (v as ProviderFixtureMode) : null;
}

const OK_RESULT: GenerateResult = {
  text: '[REPLY]\n(개발용 고정 응답)\n[DRAFT]\n개발용 고정 초안 문단입니다.\n[/DRAFT]',
  finishReason: 'stop',
  refusal: null,
  usage: { inputTokens: 400, outputTokens: 200, thoughtsTokens: null, reported: { input: true, output: true } },
};

export function createFixtureProvider(mode: ProviderFixtureMode, opts: { delayMs?: number } = {}): ProviderClient {
  const delayMs = opts.delayMs ?? 3000;
  return {
    provider: 'gemini',
    async generateContent(): Promise<GenerateResult> {
      switch (mode) {
        case 'refusal-input':
          return {
            text: '',
            finishReason: 'refusal',
            refusal: { stage: 'input', reasonCode: 'SAFETY' },
            usage: { inputTokens: 4800, outputTokens: 0, thoughtsTokens: null, reported: { input: true, output: false } },
          };
        case 'refusal-output':
          return {
            text: '',
            finishReason: 'refusal',
            refusal: { stage: 'output', reasonCode: 'RECITATION' },
            usage: { inputTokens: 4800, outputTokens: 40, thoughtsTokens: null, reported: { input: true, output: true } },
          };
        case 'rate_limited':
          throw new ProviderCallError({ provider: 'gemini', status: 429, kind: 'rate_limited', providerErrorCode: 'RESOURCE_EXHAUSTED' });
        case 'unavailable':
          throw new ProviderCallError({ provider: 'gemini', status: 503, kind: 'unavailable', providerErrorCode: 'UNAVAILABLE' });
        case 'config':
          throw new ProviderCallError({ provider: 'gemini', status: 401, kind: 'config', providerErrorCode: 'UNAUTHENTICATED' });
        case 'slow':
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          return { ...OK_RESULT, usage: { ...OK_RESULT.usage, reported: { ...OK_RESULT.usage.reported } } };
        case 'drop-response':
          return { ...OK_RESULT, usage: { ...OK_RESULT.usage, reported: { ...OK_RESULT.usage.reported } } };
      }
    },
  };
}
