'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isUuid } from '@/lib/proposals/queries';
import {
  acceptProposal,
  rejectProposal,
  revertProposal,
  PROPOSAL_ERROR_COPY,
  type AcceptProposalInput,
  type AcceptProposalResult,
  type RejectProposalResult,
  type RevertProposalResult,
} from '@/lib/proposals/actions';

/**
 * Phase 14 (MCP-06/07) thin Server Action wrappers. Server Actions are reachable
 * without visiting the page, so each call re-derives the writer from the cookie
 * session (never from client input) and delegates to lib/proposals/actions, which
 * re-validates the input, recomputes hunks/hashes and calls the 0042 RPCs.
 * No admin client and no MCP bearer path here.
 */

type Session = { supabase: Awaited<ReturnType<typeof createClient>>; userId: string };

async function writerSession(): Promise<Session | null> {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    return { supabase, userId: user.id };
  } catch {
    return null;
  }
}

const forbidden = () => ({ ok: false as const, status: 'error' as const, code: 'forbidden' as const, error: PROPOSAL_ERROR_COPY.forbidden });
const failedResult = (failed: string) => ({ ok: false as const, status: 'error' as const, code: 'failed' as const, error: failed });

/** Refresh the work's studio tree (queue, detail, chapter / document, future badges). */
function revalidateWork(workId: unknown) {
  if (isUuid(workId)) revalidatePath(`/studio/${workId}`, 'layout');
}

const workIdOf = (input: unknown) => (input && typeof input === 'object' ? (input as { workId?: unknown }).workId : undefined);

export async function acceptProposalAction(input: AcceptProposalInput): Promise<AcceptProposalResult> {
  const session = await writerSession();
  if (!session) return forbidden();
  try {
    const result = await acceptProposal(session.supabase, session.userId, input);
    if (result.ok) revalidateWork(workIdOf(input));
    return result;
  } catch {
    return failedResult(PROPOSAL_ERROR_COPY.accept_failed);
  }
}

export async function rejectProposalAction(input: { workId: string; proposalId: string }): Promise<RejectProposalResult> {
  const session = await writerSession();
  if (!session) return forbidden();
  try {
    const result = await rejectProposal(session.supabase, session.userId, input);
    if (result.ok) revalidateWork(workIdOf(input));
    return result;
  } catch {
    return failedResult(PROPOSAL_ERROR_COPY.reject_failed);
  }
}

/** First call without confirm; on confirm_required pass the returned confirmHash back unchanged. */
export async function revertProposalAction(
  input: { workId: string; proposalId: string; confirm?: boolean; seenHash?: string },
): Promise<RevertProposalResult> {
  const session = await writerSession();
  if (!session) return forbidden();
  try {
    const result = await revertProposal(session.supabase, session.userId, input);
    if (result.ok) revalidateWork(workIdOf(input));
    return result;
  } catch {
    return failedResult(PROPOSAL_ERROR_COPY.revert_failed);
  }
}
