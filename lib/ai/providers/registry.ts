import 'server-only';
import type { ProviderClient } from './types';
import { ProviderCallError } from './errors';
import { createGeminiProvider } from './gemini';
import { createFixtureProvider, readProviderFixture } from './fixture';

/** Platform (service key) provider for Phase 8 — Gemini only. Phase 9 adds OpenAI/Anthropic; Phase 10-11 add BYOK resolution. */
export function createPlatformProvider(env: Record<string, string | undefined> = process.env): ProviderClient {
  // Dev-only canned provider (inert unless NODE_ENV=development).
  const fixture = readProviderFixture(env);
  if (fixture) {
    console.warn(`[ai/providers] AI_PROVIDER_FIXTURE=${fixture} is active — serving canned responses instead of Gemini. Set AI_PROVIDER_FIXTURE=off (and restart dev) to disable.`);
    return createFixtureProvider(fixture);
  }
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new ProviderCallError({ provider: 'gemini', status: null, kind: 'config', providerErrorCode: 'API_KEY_MISSING' });
  }
  return createGeminiProvider({ apiKey });
}
