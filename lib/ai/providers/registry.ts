import 'server-only';
import type { ProviderClient } from './types';
import { ProviderCallError } from './errors';
import { createGeminiProvider } from './gemini';

/** Platform (service key) provider for Phase 8 — Gemini only. Phase 9 adds OpenAI/Anthropic; Phase 10-11 add BYOK resolution. */
export function createPlatformProvider(env: Record<string, string | undefined> = process.env): ProviderClient {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new ProviderCallError({ provider: 'gemini', status: null, kind: 'config', providerErrorCode: 'API_KEY_MISSING' });
  }
  return createGeminiProvider({ apiKey });
}
