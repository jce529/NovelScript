import 'server-only';
import OpenAI from 'openai';
import type { GenerateResult, ProviderClient, UsageReport } from './types';
import { ProviderCallError, toSanitizedProviderError } from './errors';

/** Convert structured Responses API signals to the shared provider result. */
export function mapOpenAiResponse(response: OpenAI.Responses.Response): GenerateResult {
  const usage: UsageReport = {
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    thoughtsTokens: response.usage?.output_tokens_details?.reasoning_tokens ?? null,
    reported: {
      input: response.usage?.input_tokens != null,
      output: response.usage?.output_tokens != null,
    },
  };

  const hasRefusal = response.output?.some(
    (item) => 'content' in item && Array.isArray(item.content)
      && item.content.some((content) => content.type === 'refusal'),
  );
  if (hasRefusal) {
    return { text: '', finishReason: 'refusal', usage, refusal: { stage: 'output', reasonCode: 'OTHER' } };
  }
  if (response.status === 'incomplete' && response.incomplete_details?.reason === 'content_filter') {
    return { text: '', finishReason: 'refusal', usage, refusal: { stage: 'output', reasonCode: 'OTHER' } };
  }

  const finishReason = response.status === 'incomplete' && response.incomplete_details?.reason === 'max_output_tokens'
    ? 'max_tokens' : 'stop';
  return { text: response.output_text ?? '', finishReason, usage, refusal: null };
}

/** Construct the SDK once; only sanitized errors leave the adapter boundary. */
export function createOpenAiProvider({ apiKey }: { apiKey: string }): ProviderClient {
  const client = new OpenAI({ apiKey });
  return {
    provider: 'openai',
    async generateContent({ model, systemInstruction, contents, maxOutputTokens, temperature }) {
      let response: OpenAI.Responses.Response;
      try {
        response = await client.responses.create({
          model,
          instructions: systemInstruction,
          input: contents,
          max_output_tokens: maxOutputTokens,
          temperature,
        });
      } catch (err) {
        throw new ProviderCallError(toSanitizedProviderError('openai', err));
      }
      return mapOpenAiResponse(response);
    },
  };
}
