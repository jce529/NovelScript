import 'server-only';
import { GoogleGenAI, type GenerateContentResponse } from '@google/genai';
import type { GenerateResult, RefusalReasonCode, UsageReport } from './types';

/** D-05 (B): safety-family finish reasons. Partial text is dropped, never surfaced. */
const OUTPUT_REFUSAL_FINISH = new Set([
  'SAFETY',
  'RECITATION',
  'BLOCKLIST',
  'PROHIBITED_CONTENT',
  'SPII',
  'IMAGE_SAFETY',
  'IMAGE_PROHIBITED_CONTENT',
  'IMAGE_RECITATION',
]);

/** D-05 (A): prompt block reasons kept as-is; everything else collapses to OTHER. */
const INPUT_BLOCK_PASSTHROUGH = new Set(['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'IMAGE_SAFETY']);

function validCount(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null;
}

/** Pure SDK response → project GenerateResult. Copies only allowlisted structured signals (D-05, D-06, D-09). */
export function mapGeminiResponse(response: GenerateContentResponse): GenerateResult {
  const meta = response.usageMetadata;
  const input = validCount(meta?.promptTokenCount);
  const output = validCount(meta?.candidatesTokenCount);
  const thoughts = validCount(meta?.thoughtsTokenCount);
  const usage: UsageReport = {
    inputTokens: input ?? 0,
    outputTokens: output ?? 0,
    thoughtsTokens: thoughts,
    reported: { input: input !== null, output: output !== null },
  };

  const candidates = response.candidates ?? [];
  const blockReason = response.promptFeedback?.blockReason as string | undefined;

  if (candidates.length === 0 && blockReason && blockReason !== 'BLOCKED_REASON_UNSPECIFIED') {
    return {
      text: '',
      finishReason: 'refusal',
      usage,
      refusal: {
        stage: 'input',
        reasonCode: INPUT_BLOCK_PASSTHROUGH.has(blockReason) ? (blockReason as RefusalReasonCode) : 'OTHER',
      },
    };
  }

  const fr = candidates[0]?.finishReason as string | undefined;
  if (fr && OUTPUT_REFUSAL_FINISH.has(fr)) {
    return { text: '', finishReason: 'refusal', usage, refusal: { stage: 'output', reasonCode: fr as RefusalReasonCode } };
  }

  const text = (candidates[0]?.content?.parts ?? [])
    .filter((p) => typeof p.text === 'string' && !p.thought)
    .map((p) => p.text)
    .join('');
  const finishReason = fr === 'STOP' ? 'stop' : fr === 'MAX_TOKENS' ? 'max_tokens' : 'other';
  return { text, finishReason, usage, refusal: null };
}

// GoogleGenAI is consumed by createGeminiProvider (Task 2).
void GoogleGenAI;
