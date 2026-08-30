import 'server-only';
import { GoogleGenAI } from '@google/genai';

export type ModelTier = 'lite' | 'pro';

/** D-06: Gemini-family only, never a multi-vendor picker. 라이트=gemini-2.5-flash
 * (faster/cheaper), 프로=gemini-2.5-pro (higher-quality/costlier) — both GA and
 * non-preview per 04-RESEARCH.md, avoiding a model ID that could retire without
 * the same stability guarantee. */
export const MODEL_TIER_TO_ID: Record<ModelTier, string> = {
  lite: 'gemini-2.5-flash',
  pro: 'gemini-2.5-pro',
};

export interface GenerateContentParams {
  model: string;
  systemInstruction: string;
  contents: string;
  maxOutputTokens: number;
  temperature?: number;
}

export interface GenerateContentResult {
  text: string;
  finishReason: string | null;
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
}

export interface CountTokensParams {
  model: string;
  contents: string;
}

export interface CountTokensResult {
  totalTokens: number;
}

/** Pitfall 4 (04-RESEARCH.md): dependency-injectable client — every caller (lib/ai/generate.ts)
 * takes a GeminiClient parameter instead of importing GoogleGenAI directly, so unit tests
 * pass createMockGeminiClient() and never hit the real, paid API. */
export interface GeminiClient {
  generateContent(params: GenerateContentParams): Promise<GenerateContentResult>;
  countTokens(params: CountTokensParams): Promise<CountTokensResult>;
}

/** Real client. Throws eagerly if GEMINI_API_KEY is missing so the failure is
 * immediate and readable, not a cryptic SDK auth error. */
export function createGeminiClient(): GeminiClient {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set — see .env.example.');
  }
  const ai = new GoogleGenAI({ apiKey });

  return {
    async generateContent({ model, systemInstruction, contents, maxOutputTokens, temperature = 0.9 }) {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: { systemInstruction, maxOutputTokens, temperature },
      });
      return {
        text: response.text ?? '',
        finishReason: response.candidates?.[0]?.finishReason ?? null,
        promptTokenCount: response.usageMetadata?.promptTokenCount ?? 0,
        candidatesTokenCount: response.usageMetadata?.candidatesTokenCount ?? 0,
        totalTokenCount: response.usageMetadata?.totalTokenCount ?? 0,
      };
    },
    async countTokens({ model, contents }) {
      const response = await ai.models.countTokens({ model, contents });
      return { totalTokens: response.totalTokens ?? 0 };
    },
  };
}

/** Test-only factory — every field has a safe, deterministic default. */
export function createMockGeminiClient(overrides?: Partial<GeminiClient>): GeminiClient {
  return {
    async generateContent() {
      return {
        text: '(mock) 생성된 본문',
        finishReason: 'STOP',
        promptTokenCount: 10,
        candidatesTokenCount: 10,
        totalTokenCount: 20,
      };
    },
    async countTokens() {
      return { totalTokens: 10 };
    },
    ...overrides,
  };
}
