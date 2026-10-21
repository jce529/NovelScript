'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { checkWriteAccess, type WriteDenialCode } from '@/lib/auth/write-access';
import { getWork } from '@/lib/works/actions';
import {
  BRANCH_COPY,
  beginBranch,
  confirmBranch,
  deleteBranch,
  getBranchDiff,
  getBranchEligibility,
  type BeginBranchResult,
  type BranchDiffResult,
  type BranchEligibilityResult,
  type BranchErrorCode,
  type ConfirmBranchResult,
  type DeleteBranchResult,
} from '@/lib/world-tree/branches';
import { ensureWorldTree, saveTimeline, type EnsureWorldTreeResult, type SaveTimelineResult, type TimelineDraft, type TimelineErrorCode } from '@/lib/world-tree/timeline';
import { getWorldTree, WORLD_TREE_QUERY_COPY, type WorldTreeQueryErrorCode, type WorldTreeQueryResult } from '@/lib/world-tree/queries';
import {
  OWNER_COPY,
  getOwnedBranch,
  getOwnedTimeline,
  markBranchNoticeRead,
  type MarkNoticeReadResult,
  type OwnedBranch,
  type OwnerErrorCode,
} from '@/lib/world-tree/owner';
import { loadWorldTreePopularity, type WorldTreePopularityResult } from '@/lib/world-tree/metric-adapter';
import type { BranchEligibilitySummary, ChildBranchKind, EligibilityUnmetReason } from '@/lib/world-tree/types';

/**
 * Studio world-tree Server Actions (18-07). Thin session boundary over the 18-02/18-03/18-04/18-07
 * domain functions:
 *
 * - Every action re-derives the actor from the request session (createClient().auth.getUser()).
 *   No ownerId is accepted from the client; extra client fields (counts, eligibility, thresholds,
 *   visibility choices) are dropped because each action builds the domain input itself.
 * - Mutations check write access (suspension) and the owner-scoped work before any domain call.
 *   The domain functions and the RPCs check again (auth.uid()), so these checks never replace
 *   the DB guards.
 * - begin / first confirm run a server eligibility pre-check (18-14 summary on the source work)
 *   and stop on unmet or failed lookups. The RPC re-asserts eligibility; its rejection is passed
 *   through unchanged (typed parent_not_visible and the latest summary for 18-09). Retries of an
 *   already created draft (same request id) or an already confirmed branch skip the pre-check so
 *   the stored result is recovered instead of being blocked.
 * - revalidatePath runs only after a persisted success. A refresh failure is reported as
 *   `refreshed: false` on the success result, never as a failed save, so the UI does not retry
 *   (and double-confirm) a write that already happened.
 * - No cache components / 'use cache' / tags are used, so no updateTag/revalidateTag calls.
 */

export type WorldActionErrorCode =
  | 'unauthenticated'
  | 'no_tree'
  | BranchErrorCode
  | TimelineErrorCode
  | WorldTreeQueryErrorCode
  | OwnerErrorCode
  | WriteDenialCode;

export interface WorldActionFailure {
  ok: false;
  code: WorldActionErrorCode;
  error: string;
  retryable: boolean;
  unmetReasons?: EligibilityUnmetReason[];
  eligibility?: BranchEligibilitySummary | null;
}

/** A persisted success; `refreshed` is false when only the follow-up revalidation failed. */
type Persisted<T> = T & { refreshed: boolean };
type Success<R> = Extract<R, { ok: true }>;
type ActionResult<R> = Persisted<Success<R>> | Exclude<R, { ok: true }> | WorldActionFailure;

export type BeginBranchActionResult = ActionResult<BeginBranchResult>;
export type ConfirmBranchActionResult = ActionResult<ConfirmBranchResult>;
export type DeleteBranchActionResult = ActionResult<DeleteBranchResult>;
export type SaveWorldTimelineActionResult = ActionResult<SaveTimelineResult>;
export type EnsureWorldTreeActionResult = ActionResult<EnsureWorldTreeResult>;
export type MarkBranchNoticeReadActionResult = ActionResult<MarkNoticeReadResult>;
export type BranchEligibilityActionResult = BranchEligibilityResult | WorldActionFailure;
export type BranchDiffActionResult = BranchDiffResult | WorldActionFailure;
export type ReaderPreviewActionResult = Extract<WorldTreeQueryResult, { mode: 'reader' } | { status: 'unavailable' }> | WorldActionFailure;

export interface BeginBranchActionInput {
  kind: ChildBranchKind;
  forkEraId?: string | null;
  requestId: string;
}
export interface ConfirmBranchActionInput {
  title: string;
  eraId: string;
}
export interface SaveWorldTimelineActionInput {
  eras: TimelineDraft['eras'];
  placements: TimelineDraft['placements'];
}

// ---------------------------------------------------------------------------
// Session boundary
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

function failure(code: WorldActionErrorCode, error: string, retryable = false): WorldActionFailure {
  return { ok: false, code, error, retryable };
}
const invalidInput = () => failure('invalid_input', OWNER_COPY.invalidInput);

type Session = { ok: true; supabase: SupabaseClient; userId: string };

/**
 * Session user -> (write access) -> owner-scoped work. `write` is false for read-only actions so a
 * suspended writer can still look at their own tree.
 */
async function ownerSession(workId: string, { write }: { write: boolean }): Promise<Session | WorldActionFailure> {
  let supabase: SupabaseClient;
  let userId: string | undefined;
  try {
    supabase = (await createClient()) as unknown as SupabaseClient;
    const { data, error } = await supabase.auth.getUser();
    userId = error ? undefined : data.user?.id;
  } catch {
    return failure('unavailable', OWNER_COPY.unavailable, true);
  }
  if (!isUuid(userId)) return failure('unauthenticated', OWNER_COPY.unauthenticated);

  if (write) {
    const access = await checkWriteAccess(supabase, userId);
    if (!access.ok) return failure(access.code, access.error, access.code === 'write_unavailable');
  }

  let work: { id?: unknown } | null;
  try {
    work = await getWork(supabase, { ownerId: userId, workId });
  } catch {
    return failure('unavailable', OWNER_COPY.unavailable, true);
  }
  if (!work || work.id !== workId) return failure('forbidden', OWNER_COPY.forbidden);
  return { ok: true, supabase, userId };
}

function isFailure(value: Session | WorldActionFailure): value is WorldActionFailure {
  return value.ok === false;
}

/** Revalidates after a persisted write. Returns false (never throws) if any path failed. */
function refresh(paths: string[]): boolean {
  let refreshed = true;
  for (const path of [...new Set(paths)]) {
    try {
      revalidatePath(path);
    } catch {
      refreshed = false;
    }
  }
  return refreshed;
}

function workPaths(...workIds: Array<string | null | undefined>): string[] {
  return workIds.filter(isUuid).flatMap((id) => [`/studio/${id}/world`, `/works/${id}`]);
}

/** Server pre-check; null = may proceed. Unmet and failed lookups both stop the action. */
async function eligibilityGate(supabase: SupabaseClient, ownerId: string, sourceWorkId: string): Promise<WorldActionFailure | null> {
  const result = await getBranchEligibility(supabase, { ownerId, sourceWorkId });
  if (!result.ok) return { ...result };
  const summary = result.eligibility;
  if (summary.eligible) return null;
  return {
    ok: false,
    code: 'branch_ineligible',
    error: summary.unmetReasons.includes('parent_not_visible') ? BRANCH_COPY.parentNotVisible : BRANCH_COPY.ineligible,
    retryable: false,
    unmetReasons: [...summary.unmetReasons],
    eligibility: summary,
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getBranchEligibilityAction(workId: string): Promise<BranchEligibilityActionResult> {
  if (!isUuid(workId)) return invalidInput();
  const session = await ownerSession(workId, { write: false });
  if (isFailure(session)) return session;
  return getBranchEligibility(session.supabase, { ownerId: session.userId, sourceWorkId: workId });
}

export async function getBranchDiffAction(draftWorkId: string): Promise<BranchDiffActionResult> {
  if (!isUuid(draftWorkId)) return invalidInput();
  const session = await ownerSession(draftWorkId, { write: false });
  if (isFailure(session)) return session;
  return getBranchDiff(session.supabase, { ownerId: session.userId, draftWorkId });
}

/** Reader preview = the server's reader projection (get_world_tree p_reader_preview), never a client filter. */
export async function getReaderPreviewAction(workId: string): Promise<ReaderPreviewActionResult> {
  if (!isUuid(workId)) return invalidInput();
  const session = await ownerSession(workId, { write: false });
  if (isFailure(session)) return session;
  const result = await getWorldTree(session.supabase, { workId, readerPreview: true });
  if (!result.ok) return result;
  if (result.status === 'unavailable') return result;
  if (result.mode !== 'reader') return failure('invalid_response', WORLD_TREE_QUERY_COPY.invalidResponse);
  return result;
}

export type ReaderPreviewWithMetricsActionResult =
  | (Extract<ReaderPreviewActionResult, { mode: 'reader' }> & { metricResult: WorldTreePopularityResult | null })
  | Exclude<ReaderPreviewActionResult, { mode: 'reader' }>;

/**
 * 18-11: the reader preview plus the WTREE-08 fruit scores for that same reader projection
 * (keyed by reader nodeKey). A metric failure keeps the projection with `metricResult: null`.
 */
export async function getReaderPreviewWithMetricsAction(workId: string): Promise<ReaderPreviewWithMetricsActionResult> {
  const result = await getReaderPreviewAction(workId);
  if (!result.ok || result.status === 'unavailable') return result;
  if (result.mode !== 'reader') return failure('invalid_response', WORLD_TREE_QUERY_COPY.invalidResponse);
  let metricResult: WorldTreePopularityResult | null = null;
  try {
    const supabase = (await createClient()) as unknown as SupabaseClient;
    metricResult = await loadWorldTreePopularity(supabase, result.projection.nodes);
  } catch {
    metricResult = null;
  }
  return { ...result, metricResult };
}

// ---------------------------------------------------------------------------
// Branch mutations
// ---------------------------------------------------------------------------

export async function beginBranchAction(sourceWorkId: string, input: BeginBranchActionInput): Promise<BeginBranchActionResult> {
  if (!isUuid(sourceWorkId) || typeof input !== 'object' || input === null) return invalidInput();
  const kind = input.kind;
  const forkEraId = input.forkEraId ?? null;
  const requestId = input.requestId;

  const session = await ownerSession(sourceWorkId, { write: true });
  if (isFailure(session)) return session;
  const { supabase, userId } = session;

  // A retried request that already created its draft is recovered by the RPC (request_id).
  let retried = false;
  if (isUuid(requestId)) {
    const existing = await getOwnedBranch(supabase, { ownerId: userId, requestId });
    retried = existing.ok && existing.branch !== null;
  }
  if (!retried) {
    const blocked = await eligibilityGate(supabase, userId, sourceWorkId);
    if (blocked) return blocked;
  }

  const result = await beginBranch(supabase, { ownerId: userId, sourceWorkId, kind, forkEraId, requestId });
  if (!result.ok) return result;
  return { ...result, refreshed: refresh([`/studio/${sourceWorkId}/world`]) };
}

export async function confirmBranchAction(draftWorkId: string, input: ConfirmBranchActionInput): Promise<ConfirmBranchActionResult> {
  if (!isUuid(draftWorkId) || typeof input !== 'object' || input === null) return invalidInput();
  const { title, eraId } = input;

  const session = await ownerSession(draftWorkId, { write: true });
  if (isFailure(session)) return session;
  const { supabase, userId } = session;

  const found = await getOwnedBranch(supabase, { ownerId: userId, workId: draftWorkId });
  if (!found.ok) return found;
  const branch = found.branch;
  if (!branch || branch.kind === 'trunk' || !branch.parentBranchId) return failure('not_found', BRANCH_COPY.notFound);

  const parent = await getOwnedBranch(supabase, { ownerId: userId, branchId: branch.parentBranchId });
  if (!parent.ok) return parent;
  if (!parent.branch) return failure('forbidden', BRANCH_COPY.forbidden);
  const sourceWorkId = parent.branch.workId;

  // An already confirmed branch returns its stored result from the RPC; no new pre-check.
  if (branch.status !== 'confirmed') {
    const blocked = await eligibilityGate(supabase, userId, sourceWorkId);
    if (blocked) return blocked;
  }

  const result = await confirmBranch(supabase, { ownerId: userId, draftWorkId, title, eraId, sourceWorkId });
  if (!result.ok) return result;
  return { ...result, refreshed: refresh(workPaths(result.workId, sourceWorkId, branch.rootWorkId)) };
}

export async function deleteBranchAction(workId: string, branchId: string): Promise<DeleteBranchActionResult> {
  if (!isUuid(workId) || !isUuid(branchId)) return invalidInput();
  const session = await ownerSession(workId, { write: true });
  if (isFailure(session)) return session;
  const { supabase, userId } = session;

  const found = await getOwnedBranch(supabase, { ownerId: userId, branchId });
  if (!found.ok) return found;
  const branch: OwnedBranch | null = found.branch;
  if (!branch || branch.workId !== workId) return failure('forbidden', BRANCH_COPY.forbidden);

  // Children block is enforced by soft_delete_world_branch; publish state of children is never touched.
  const result = await deleteBranch(supabase, { ownerId: userId, branchId });
  if (!result.ok) return result;
  return { ...result, refreshed: refresh([...workPaths(workId, branch.rootWorkId), '/studio']) };
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export async function ensureWorldTreeAction(workId: string): Promise<EnsureWorldTreeActionResult> {
  if (!isUuid(workId)) return invalidInput();
  const session = await ownerSession(workId, { write: true });
  if (isFailure(session)) return session;
  const result = await ensureWorldTree(session.supabase, { ownerId: session.userId, workId });
  if (!result.ok) return result;
  return { ...result, refreshed: refresh(workPaths(workId, result.rootWorkId)) };
}

/**
 * Saves the timeline of the work's own branch line. The branch id/kind/work and the baseline
 * (stored eras, placements, live fork eras) come from the server; only the edited eras and
 * placements come from the client, and save_world_timeline re-checks all of them.
 */
export async function saveWorldTimelineAction(workId: string, input: SaveWorldTimelineActionInput): Promise<SaveWorldTimelineActionResult> {
  if (!isUuid(workId) || typeof input !== 'object' || input === null) return invalidInput();
  if (!Array.isArray(input.eras) || !Array.isArray(input.placements)) return invalidInput();

  const session = await ownerSession(workId, { write: true });
  if (isFailure(session)) return session;
  const { supabase, userId } = session;

  const owned = await getOwnedTimeline(supabase, { ownerId: userId, workId });
  if (!owned.ok) return owned;
  if (!owned.timeline) return failure('no_tree', OWNER_COPY.noTree);
  const { branch, baseline } = owned.timeline;

  const draft: TimelineDraft = {
    branchId: branch.id,
    branchKind: branch.kind,
    branchWorkId: branch.workId,
    eras: input.eras,
    placements: input.placements,
  };
  const result = await saveTimeline(supabase, { ownerId: userId, draft, baseline });
  if (!result.ok) return result;
  return { ...result, refreshed: refresh(workPaths(workId, branch.rootWorkId)) };
}

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------

export async function markBranchNoticeReadAction(workId: string, noticeId: string): Promise<MarkBranchNoticeReadActionResult> {
  if (!isUuid(workId) || !isUuid(noticeId)) return invalidInput();
  const session = await ownerSession(workId, { write: true });
  if (isFailure(session)) return session;
  const result = await markBranchNoticeRead(session.supabase, { ownerId: session.userId, noticeId });
  if (!result.ok) return result;
  return { ...result, refreshed: refresh([`/studio/${workId}/world`]) };
}
