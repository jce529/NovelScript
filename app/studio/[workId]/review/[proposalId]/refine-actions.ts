'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { chat } from '@/lib/ai/chat';
import { resolveGenerationRoute } from '@/lib/ai/providers/byok';
import { refineChunk } from '@/lib/proposals/refine';
import { REFINE_ERROR_COPY, type RefineChunkInput, type RefineChunkResult } from '@/lib/proposals/refine-shared';

/**
 * 14-08 (D-P14-11) `AI와 다듬기` Server Action for one review-screen chunk.
 *
 * Reachable by direct POST, so the writer is re-derived from the cookie session here and
 * every input is re-validated in lib/proposals/refine (strict: proposalId, hunkIndex, seenHash,
 * message, history, providerId, model, keySource, idempotencyKey — never chunk text).
 * The chunk is recomputed from the stored proposal and the current original; only the
 * writer's own live pending proposal can be refined.
 *
 * Billing / BYOK / failures reuse the studio AI panel's gateway: resolveGenerationRoute (the
 * admin client is passed ONLY to decrypt the writer's own BYOK key, exactly as chatAction does)
 * and chat() (wallet preflight + lock + idempotency + settlement + failure kinds). chatAction
 * itself is not called (no Jev document planning, no after() shadow plan). Proposal reads use
 * the session client only. Nothing is written besides the gateway's own usage/ledger rows;
 * the conversation is not stored and the answer is only a 직접 고치기 candidate.
 * Not part of the MCP path (lib/mcp is untouched).
 */
export async function refineChunkAction(input: RefineChunkInput): Promise<RefineChunkResult> {
  let supabase: Awaited<ReturnType<typeof createClient>>;
  let userId: string;
  try {
    supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return { ok: false, code: 'unauthenticated', error: REFINE_ERROR_COPY.unauthenticated };
    userId = user.id;
  } catch {
    return { ok: false, code: 'unauthenticated', error: REFINE_ERROR_COPY.unauthenticated };
  }

  try {
    return await refineChunk({
      supabase,
      userId,
      resolveRoute: (selection) => resolveGenerationRoute({ supabase, admin: createAdminClient() as never, ownerId: userId, selection }),
      runChat: (client, chatInput) => chat(supabase, client, chatInput),
    // Raw client input on purpose: the strict schema validates history (≤6 turns, ≤2000 chars
    // each), message (≤1000), the model and the UUID idempotencyKey, and rejects extra fields.
    }, input as unknown);
  } catch {
    return { ok: false, code: 'failed', error: REFINE_ERROR_COPY.failed };
  }
}
