import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PROVIDER_MODELS } from './providers/catalog';
import type { ProviderId, UsageReport } from './providers/types';

const PROVIDERS: ProviderId[] = ['openai', 'anthropic', 'gemini'];
type UsageStatus = 'completed' | 'refused' | 'failed';

export interface AiUsageInput {
  ownerId: string;
  provider: ProviderId;
  model: string;
  keySource: 'service' | 'byok';
  status: UsageStatus;
  idempotencyKey: string;
  usage: UsageReport;
  workId?: string | null;
  chapterId?: string | null;
}

export type RecordAiUsageResult =
  | { ok: true; recorded: true }
  | { ok: true; recorded: false; reason: 'duplicate' | 'not_recordable' }
  | { ok: false; recorded: false; reason: 'unavailable' };

export interface UsageModelTotal { model: string; calls: number; inputTokens: number; outputTokens: number }
export interface UsageProviderTotal { provider: ProviderId; calls: number; inputTokens: number; outputTokens: number; models: UsageModelTotal[] }
export type MonthlyByokUsageResult =
  | { ok: true; providers: UsageProviderTotal[] }
  | { ok: false; reason: 'unavailable' | 'invalid_data' };

export function kstMonthUtcRange(now: Date = new Date()): { startUtc: string; endUtc: string } {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = kst.getUTCMonth();
  return {
    startUtc: new Date(Date.UTC(year, month, 1, -9)).toISOString(),
    endUtc: new Date(Date.UTC(year, month + 1, 1, -9)).toISOString(),
  };
}

function logUsageFailure(stage: 'insert' | 'select', provider?: ProviderId, idempotencyKey?: string) {
  console.error(stage === 'insert' ? '[ai] usage write failed' : '[ai] usage read failed', {
    stage,
    ...(provider ? { provider } : {}),
    ...(idempotencyKey ? { idempotencyKey } : {}),
  });
}

export async function recordAiUsage(
  admin: Pick<SupabaseClient, 'from'>,
  input: AiUsageInput,
): Promise<RecordAiUsageResult> {
  if (input.status === 'failed' || (input.status === 'refused' && !input.usage.reported.input && !input.usage.reported.output)) {
    return { ok: true, recorded: false, reason: 'not_recordable' };
  }

  try {
    const { error } = await admin.from('ai_usage').insert({
      owner_id: input.ownerId,
      provider: input.provider,
      model: input.model,
      key_source: input.keySource,
      status: input.status,
      input_tokens: input.usage.inputTokens,
      output_tokens: input.usage.outputTokens,
      thoughts_tokens: input.usage.thoughtsTokens ?? 0,
      input_reported: input.usage.reported.input,
      output_reported: input.usage.reported.output,
      work_id: input.workId ?? null,
      chapter_id: input.chapterId ?? null,
      idempotency_key: input.idempotencyKey,
    });
    if (error?.code === '23505') return { ok: true, recorded: false, reason: 'duplicate' };
    if (error) {
      logUsageFailure('insert', input.provider, input.idempotencyKey);
      return { ok: false, recorded: false, reason: 'unavailable' };
    }
    return { ok: true, recorded: true };
  } catch {
    logUsageFailure('insert', input.provider, input.idempotencyKey);
    return { ok: false, recorded: false, reason: 'unavailable' };
  }
}

interface UsageRow {
  provider: unknown;
  model: unknown;
  status: unknown;
  input_tokens: unknown;
  output_tokens: unknown;
}

function validUsageRow(row: UsageRow): row is UsageRow & {
  provider: ProviderId; model: string; status: 'completed' | 'refused'; input_tokens: number; output_tokens: number;
} {
  return PROVIDERS.includes(row.provider as ProviderId)
    && typeof row.model === 'string' && row.model.length > 0
    && (row.status === 'completed' || row.status === 'refused')
    && Number.isSafeInteger(row.input_tokens) && Number(row.input_tokens) >= 0
    && Number.isSafeInteger(row.output_tokens) && Number(row.output_tokens) >= 0;
}

function modelLabel(provider: ProviderId, model: string): string {
  return PROVIDER_MODELS[provider].find((entry) => entry.id === model)?.displayName ?? model;
}

export async function loadMonthlyByokUsage(
  supabase: Pick<SupabaseClient, 'from'>,
  ownerId: string,
  now: Date = new Date(),
): Promise<MonthlyByokUsageResult> {
  const { startUtc, endUtc } = kstMonthUtcRange(now);
  try {
    const { data, error } = await supabase.from('ai_usage')
      .select('provider, model, status, input_tokens, output_tokens')
      .eq('owner_id', ownerId)
      .eq('key_source', 'byok')
      .gte('created_at', startUtc)
      .lt('created_at', endUtc);
    if (error || !Array.isArray(data)) {
      logUsageFailure('select');
      return { ok: false, reason: 'unavailable' };
    }
    if (!data.every((row: UsageRow) => row && validUsageRow(row))) return { ok: false, reason: 'invalid_data' };

    const providers = new Map<ProviderId, UsageProviderTotal>();
    for (const row of data as UsageRow[]) {
      const provider = row.provider as ProviderId;
      const model = row.model as string;
      let providerTotal = providers.get(provider);
      if (!providerTotal) {
        providerTotal = { provider, calls: 0, inputTokens: 0, outputTokens: 0, models: [] };
        providers.set(provider, providerTotal);
      }
      let modelTotal = providerTotal.models.find((item) => item.model === model);
      if (!modelTotal) {
        modelTotal = { model, calls: 0, inputTokens: 0, outputTokens: 0 };
        providerTotal.models.push(modelTotal);
      }
      providerTotal.calls++;
      providerTotal.inputTokens += row.input_tokens as number;
      providerTotal.outputTokens += row.output_tokens as number;
      modelTotal.calls++;
      modelTotal.inputTokens += row.input_tokens as number;
      modelTotal.outputTokens += row.output_tokens as number;
    }
    for (const total of providers.values()) {
      if (![total.calls, total.inputTokens, total.outputTokens, ...total.models.flatMap((model) => [model.calls, model.inputTokens, model.outputTokens])]
        .every(Number.isSafeInteger)) return { ok: false, reason: 'invalid_data' };
      total.models.sort((a, b) => b.calls - a.calls || modelLabel(total.provider, a.model).localeCompare(modelLabel(total.provider, b.model), 'ko'));
    }
    return { ok: true, providers: [...providers.values()].sort((a, b) => PROVIDERS.indexOf(a.provider) - PROVIDERS.indexOf(b.provider)) };
  } catch {
    logUsageFailure('select');
    return { ok: false, reason: 'unavailable' };
  }
}
