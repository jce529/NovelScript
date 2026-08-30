import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { getMentionedNodesContent } from '@/lib/ai/mentions';
import { composeSystemInstruction, assembleUserContent, type PresetLevel, type StylePresetId } from '@/lib/ai/prompt';
import { computeMaxOutputTokens, computeDebitAmount } from '@/lib/ai/cost';
import { MODEL_TIER_TO_ID, type ModelTier, type GeminiClient } from '@/lib/ai/gemini';

export const AI_GENERATION_REFERENCE_TYPE = 'ai_generation';

export interface EstimateCostInput {
  ownerId: string;
  workId: string;
  modelTier: ModelTier;
  mentionedNodeIds: string[];
  presetLevel: PresetLevel;
  customInstruction: string | null;
  styleId: StylePresetId;
  /** D-07: active genre for this generation (defaults to the work's own genre,
   * overridable per-generation — resolved by the caller, always a plain string). */
  genre: string;
  precedingText: string;
}

export interface EstimateCostResult {
  ok: boolean;
  error?: string;
  estimatedTokens?: number;
}

/** EDIT-05: token count only (D-12), input-side only (countTokens can't predict
 * output length) — no wallet read, no wallet write. */
export async function estimateCost(
  supabase: SupabaseClient, client: GeminiClient, input: EstimateCostInput
): Promise<EstimateCostResult> {
  const mentionedDocs = await getMentionedNodesContent(supabase, { ownerId: input.ownerId, workId: input.workId, nodeIds: input.mentionedNodeIds });
  const systemInstruction = composeSystemInstruction({
    presetLevel: input.presetLevel, customInstruction: input.customInstruction, styleId: input.styleId, genre: input.genre,
  });
  const contents = assembleUserContent({ mentionedDocs, precedingText: input.precedingText });
  const model = MODEL_TIER_TO_ID[input.modelTier];

  const { totalTokens } = await client.countTokens({ model, contents: `${systemInstruction}\n\n${contents}` });
  return { ok: true, estimatedTokens: totalTokens };
}

export interface GenerateInput extends EstimateCostInput {
  chapterId: string;
  /** D-10rev: the permission-prompt card's free-text row, folded into the
   * regeneration's instruction (composeSystemInstruction handles the folding). */
  regenerationFeedback?: string | null;
}

export interface GenerateResult {
  ok: boolean;
  error?: string;
  text?: string;
  /** true when the call was cut short by D-13's cap (either before the call fired,
   * because balance was already exhausted, or because finishReason === 'MAX_TOKENS'). */
  wasCapped?: boolean;
  remainingBalance?: number;
}

/**
 * EDIT-04 + D-13: the full generate -> cap -> debit -> return lifecycle.
 *
 * Wallet reads/writes use the ADMIN (service-role) client, not the session
 * `supabase` client passed in — see the Wallet RLS Gap note in this plan's
 * <interfaces> block. `input.ownerId` must always come from the authenticated
 * session (never client-supplied) — the Server Action wrapper enforces this,
 * not this function.
 */
export async function generate(
  supabase: SupabaseClient, client: GeminiClient, input: GenerateInput
): Promise<GenerateResult> {
  const admin = createAdminClient();

  const { data: wallet } = await admin.from('wallets').select('balance').eq('id', input.ownerId).maybeSingle();
  if (!wallet) return { ok: false, error: '지갑을 찾을 수 없어요.' };
  const walletBalance = Number(wallet.balance);

  const mentionedDocs = await getMentionedNodesContent(supabase, { ownerId: input.ownerId, workId: input.workId, nodeIds: input.mentionedNodeIds });
  const systemInstruction = composeSystemInstruction({
    presetLevel: input.presetLevel,
    customInstruction: input.customInstruction,
    styleId: input.styleId,
    genre: input.genre,
    regenerationFeedback: input.regenerationFeedback ?? null,
  });
  const contents = assembleUserContent({ mentionedDocs, precedingText: input.precedingText });
  const model = MODEL_TIER_TO_ID[input.modelTier];

  const { totalTokens: inputTokenCount } = await client.countTokens({ model, contents: `${systemInstruction}\n\n${contents}` });
  const maxOutputTokens = computeMaxOutputTokens({ walletBalance, modelTier: input.modelTier, inputTokenCount });

  if (maxOutputTokens <= 0) {
    return { ok: false, error: '보유 토큰을 모두 사용해서 생성할 수 없어요.', wasCapped: true, remainingBalance: walletBalance };
  }

  const result = await client.generateContent({ model, systemInstruction, contents, maxOutputTokens, temperature: 0.9 });

  const debitAmount = computeDebitAmount({
    modelTier: input.modelTier,
    promptTokenCount: result.promptTokenCount,
    candidatesTokenCount: result.candidatesTokenCount,
  });
  const referenceId = crypto.randomUUID();
  const { data: newBalance, error: debitError } = await admin.rpc('apply_wallet_delta', {
    p_wallet_id: input.ownerId,
    p_delta: -debitAmount,
    p_reference_type: AI_GENERATION_REFERENCE_TYPE,
    p_reference_id: referenceId,
    p_reason: `chapter:${input.chapterId}`,
  });
  if (debitError) return { ok: false, error: '토큰 차감에 실패했어요. 잠시 후 다시 시도해주세요.' };

  return {
    ok: true,
    text: result.text,
    wasCapped: result.finishReason === 'MAX_TOKENS',
    remainingBalance: Number(newBalance),
  };
}
