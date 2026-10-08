import 'server-only';
import type { ProviderClient, ProviderId } from './types';
import { ProviderCallError } from './errors';
import { createGeminiProvider } from './gemini';
import { createOpenAiProvider } from './openai';
import { createAnthropicProvider } from './anthropic';
import { createFixtureProvider, readProviderFixture } from './fixture';

const ENV_VAR_BY_PROVIDER: Record<ProviderId, string> = {
  gemini: 'GEMINI_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
};

export type ProviderKeySource = 'service' | 'byok';

/** Construct one of the supported provider adapters with an already-resolved key. */
export function createProviderWithApiKey(
  providerId: ProviderId,
  apiKey: string,
  _options: { keySource: ProviderKeySource },
): ProviderClient {
  if (providerId === 'openai') return createOpenAiProvider({ apiKey });
  if (providerId === 'anthropic') return createAnthropicProvider({ apiKey });
  return createGeminiProvider({ apiKey });
}

/** Platform service-key provider. Fixture and environment resolution stay platform-only. */
export function createPlatformProvider(
  providerId: ProviderId,
  env: Record<string, string | undefined> = process.env,
): ProviderClient {
  const fixture = readProviderFixture(env);
  if (fixture) {
    console.warn(`[ai/providers] AI_PROVIDER_FIXTURE=${fixture} is active; serving canned responses. Set AI_PROVIDER_FIXTURE=off to disable.`);
    return createFixtureProvider(fixture);
  }
  const apiKey = env[ENV_VAR_BY_PROVIDER[providerId]];
  if (!apiKey) {
    throw new ProviderCallError({ provider: providerId, status: null, kind: 'config', providerErrorCode: 'API_KEY_MISSING' });
  }
  return createProviderWithApiKey(providerId, apiKey, { keySource: 'service' });
}
