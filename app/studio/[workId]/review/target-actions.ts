'use server';

import { createClient } from '@/lib/supabase/server';
import { countPendingProposalsForTarget, isUuid } from '@/lib/proposals/queries';

/**
 * Phase 14 (MCP-07) pending count for one chapter or document, for the client
 * editor pages. Server Actions are reachable without visiting a page, so the
 * writer is re-derived from the cookie session (never from client input) and the
 * query filters by owner, work and target. A foreign or unknown ID, a signed-out
 * caller and any failure all look the same: zero (the line is not rendered).
 */
export type PendingForTarget = { count: number; proposalIds: string[] };

const NONE: PendingForTarget = { count: 0, proposalIds: [] };

export async function getPendingProposalsForTargetAction(
  workId: string, kind: 'chapter' | 'kb', targetId: string,
): Promise<PendingForTarget> {
  try {
    if (!isUuid(workId) || !isUuid(targetId) || (kind !== 'chapter' && kind !== 'kb')) return NONE;
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NONE;
    return await countPendingProposalsForTarget(supabase, user.id, workId, kind === 'chapter' ? 'chapter' : 'node', targetId);
  } catch {
    return NONE;
  }
}
