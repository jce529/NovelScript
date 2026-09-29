import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import type { GenerateResult, ProviderClient, UsageReport } from './types';
import { ProviderCallError, toSanitizedProviderError } from './errors';

/** Convert a Messages response to the shared provider result. */
export function mapAnthropicResponse(response: Anthropic.Messages.Message): GenerateResult {
  const usage: UsageReport = {
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    thoughtsTokens: null,
    reported: {
      input: response.usage?.input_tokens != null,
      output: response.usage?.output_tokens != null,
    },
  };

  if (response.stop_reason === 'refusal') {
    return { text: '', finishReason: 'refusal', usage, refusal: { stage: 'output', reasonCode: 'OTHER' } };
  }

  const text = response.content.filter((block) => block.type === 'text').map((block) => block.text).join('');
  const finishReason = response.stop_reason === 'max_tokens' ? 'max_tokens' : 'stop';
  return { text, finishReason, usage, refusal: null };
}

/** Construct the SDK once; only sanitized errors leave the adapter boundary. */
export function createAnthropicProvider({ apiKey }: { apiKey: string }): ProviderClient {
  const client = new Anthropic({ apiKey });
  return {
    provider: 'anthropic',
    async generateContent({ model, systemInstruction, contents, maxOutputTokens }) {
      // Current catalog models reject temperature; build the SDK arguments explicitly.
      let response: Anthropic.Messages.Message;
      try {
        response = await client.messages.create({
          model,
          system: systemInstruction,
          messages: [{ role: 'user', content: contents }],
          max_tokens: maxOutputTokens,
        });
      } catch (err) {
        throw new ProviderCallError(toSanitizedProviderError('anthropic', err));
      }
      return mapAnthropicResponse(response);
    },
  };
}
