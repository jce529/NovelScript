import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { getMentionedNodesContent } from '@/lib/ai/mentions';
import {
  composeSystemInstruction, assembleUserContent, type PresetLevel, type StylePresetId, type ChatTurn, type DocumentProposal,
} from '@/lib/ai/prompt';
import { computeMaxOutputTokens, computeDebitAmount } from '@/lib/ai/cost';
import { MODEL_TIER_TO_ID, type ModelTier, type GeminiClient } from '@/lib/ai/gemini';
import { KB_CATEGORIES, type KbCategory } from '@/lib/kb/categories';

export const AI_GENERATION_REFERENCE_TYPE = 'ai_generation';
export type { DocumentProposal };

export interface ParsedChatResponse {
  reply: string;
  draft: string | null;
  proposal: DocumentProposal | null;
}

/** Parses lib/ai/prompt.ts's RESPONSE_PROTOCOL_INSTRUCTIONS [REPLY]/[DRAFT]/
 * [DOCUMENT] format. Falls back to treating the whole response as the reply
 * (no draft, no proposal) if the model didn't follow the format, or drops a
 * DOCUMENT block missing a required field — a malformed block must never
 * silently insert garbage into 본문 or create a garbage KB document. */
export function parseChatResponse(raw: string): ParsedChatResponse {
  const replyMatch = raw.match(/\[REPLY\]([\s\S]*?)(?:\[\/REPLY\]|\[DRAFT\]|\[DOCUMENT\]|$)/);
  const reply = (replyMatch ? replyMatch[1] : raw).trim();

  const draftMatch = raw.match(/\[DRAFT\]([\s\S]*?)\[\/DRAFT\]/);
  const draft = draftMatch ? draftMatch[1].trim() || null : null;

  const docMatch = raw.match(/\[DOCUMENT\]([\s\S]*?)\[\/DOCUMENT\]/);
  let proposal: DocumentProposal | null = null;
  if (docMatch) {
    const block = docMatch[1];
    const category = block.match(/카테고리:\s*(.+)/)?.[1]?.trim();
    const name = block.match(/이름:\s*(.+)/)?.[1]?.trim();
    const content = block.match(/내용:\s*([\s\S]*)/)?.[1]?.trim();
    if (category && name && content && KB_CATEGORIES.includes(category as KbCategory)) {
      proposal = { category: category as KbCategory, name, content };
    }
  }

  return { reply, draft, proposal };
}

export interface ChatInput {
  ownerId: string;
  workId: string;
  chapterId: string;
  modelTier: ModelTier;
  mentionedNodeIds: string[];
  presetLevel: PresetLevel;
  styleId: StylePresetId;
  /** D-07: active genre for this generation — resolved by the caller. */
  genre: string;
  precedingText: string;
  /** Full chat session so far, oldest first, INCLUDING the newest user
   * message as the last entry (caller appends it before calling). */
  chatHistory: ChatTurn[];
}

export interface ChatResult {
  ok: boolean;
  error?: string;
  reply?: string;
  /** Chapter-prose draft, insertable into 본문 — null when this turn didn't produce one. */
  draft?: string | null;
  /** KB(설정집) document proposal, savable — null when this turn didn't produce one. */
  proposal?: DocumentProposal | null;
  /** true when the call was cut short by D-13's cap (either before the call fired,
   * because balance was already exhausted, or because finishReason === 'MAX_TOKENS'). */
  wasCapped?: boolean;
  remainingBalance?: number;
}

/**
 * This session's redesign of EDIT-04 + D-13: ONE chat, no separate
 * "생성하기" button. Every turn goes through this single function — the
 * wallet debit/cap lifecycle is unchanged (D-13), but the result now carries
 * `draft`/`proposal` instead of assuming every response is chapter prose.
 *
 * Wallet reads/writes use the ADMIN (service-role) client, not the session
 * `supabase` client passed in — see the Wallet RLS Gap note in Phase 04's
 * plans. `input.ownerId` must always come from the authenticated session
 * (never client-supplied) — the Server Action wrapper enforces that, not
 * this function.
 */
export async function chat(supabase: SupabaseClient, client: GeminiClient, input: ChatInput): Promise<ChatResult> {
  const admin = createAdminClient();

  const { data: wallet } = await admin.from('wallets').select('balance').eq('id', input.ownerId).maybeSingle();
  if (!wallet) return { ok: false, error: '지갑을 찾을 수 없어요.' };
  const walletBalance = Number(wallet.balance);

  const mentionedDocs = await getMentionedNodesContent(supabase, { ownerId: input.ownerId, workId: input.workId, nodeIds: input.mentionedNodeIds });
  const systemInstruction = composeSystemInstruction({ presetLevel: input.presetLevel, styleId: input.styleId, genre: input.genre });
  const contents = assembleUserContent({ mentionedDocs, precedingText: input.precedingText, chatHistory: input.chatHistory });
  const model = MODEL_TIER_TO_ID[input.modelTier];

  // Gemini SDK throws on any non-2xx (rate limits, transient 503s, network
  // blips) instead of returning a result — without these try/catches, a
  // Gemini outage 500s the whole server action instead of a friendly inline
  // error. Both thrown BEFORE any wallet debit, so a failed call never
  // charges the writer.
  let inputTokenCount: number;
  try {
    ({ totalTokens: inputTokenCount } = await client.countTokens({ model, contents: `${systemInstruction}\n\n${contents}` }));
  } catch {
    return { ok: false, error: 'AI 응답을 받지 못했어요. 잠시 후 다시 시도해주세요.' };
  }
  const maxOutputTokens = computeMaxOutputTokens({ walletBalance, modelTier: input.modelTier, inputTokenCount });

  if (maxOutputTokens <= 0) {
    return { ok: false, error: '보유 토큰을 모두 사용해서 대화할 수 없어요.', wasCapped: true, remainingBalance: walletBalance };
  }

  let result: Awaited<ReturnType<GeminiClient['generateContent']>>;
  try {
    result = await client.generateContent({ model, systemInstruction, contents, maxOutputTokens, temperature: 0.9 });
  } catch {
    return { ok: false, error: 'AI 응답을 받지 못했어요. 잠시 후 다시 시도해주세요.' };
  }

  const debitAmount = computeDebitAmount({
    modelTier: input.modelTier, promptTokenCount: result.promptTokenCount, candidatesTokenCount: result.candidatesTokenCount,
  });
  const { data: newBalance, error: debitError } = await admin.rpc('apply_wallet_delta', {
    p_wallet_id: input.ownerId,
    p_delta: -debitAmount,
    p_reference_type: AI_GENERATION_REFERENCE_TYPE,
    p_reference_id: crypto.randomUUID(),
    p_reason: `chapter:${input.chapterId}`,
  });
  if (debitError) return { ok: false, error: '토큰 차감에 실패했어요. 잠시 후 다시 시도해주세요.' };

  const { reply, draft, proposal } = parseChatResponse(result.text);
  return {
    ok: true,
    reply,
    draft,
    proposal,
    wasCapped: result.finishReason === 'MAX_TOKENS',
    remainingBalance: Number(newBalance),
  };
}
