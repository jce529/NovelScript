import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { WRITE_FORBIDDEN_MESSAGE, WRITE_SUSPENDED_MESSAGE } from '../auth/write-access';
import { applySelectedHunks } from './paragraph-merge';
import { getProposalDetail, isUuid, type ProposalDetail } from './queries';

/**
 * Phase 14 (MCP-06/07) decision logic for the writer's browser session.
 * Called by the thin 'use server' wrappers (app/studio/[workId]/review/**) with the
 * cookie session client (lib/supabase/server) and the user ID from auth.getUser();
 * never with the admin client, never with IDs taken from the client as identity.
 *
 * Trust model (D-P14-01/02/04/10):
 * - The client sends only hunk indexes, an optional 직접 고침 text per hunk and the
 *   opaque seenHash it was shown. Hunk text is always recomputed here from the
 *   stored base_content / draft and the CURRENT original; the final text is built
 *   here and the hash passed to the RPC is computed here from what was re-read.
 * - The 0042 RPCs re-check owner, status, expiry, write access and the original's
 *   hash under row locks, so a save that slips in between our read and the RPC
 *   fails as mcp_stale and changes nothing.
 * - Errors are mapped to fixed Korean copy; raw database text never leaves.
 */

export const PROPOSAL_ERROR_COPY = {
  forbidden: WRITE_FORBIDDEN_MESSAGE,
  suspended: WRITE_SUSPENDED_MESSAGE,
  not_found: '제안을 찾을 수 없어요. 리뷰 큐에서 다시 열어 주세요.',
  not_pending: '이미 처리된 제안이에요. 화면을 새로고침해 주세요.',
  expired: '만료된 제안이라 반영할 수 없어요. AI에게 다시 요청해 주세요.',
  stale: '원본이 바뀌었어요. 지금 본문을 기준으로 다시 비교했어요. 확인한 뒤 다시 골라 주세요.',
  locked: '잠긴 문서라 반영할 수 없어요. 문서 잠금을 푼 뒤 다시 열어 주세요.',
  invalid_request: '요청을 처리할 수 없어요. 화면을 새로고침한 뒤 다시 시도해 주세요.',
  invalid_selection: '선택한 변경을 반영할 수 없어요. 화면을 새로고침한 뒤 다시 골라 주세요.',
  invalid_content: '반영할 내용이 너무 길거나 쓸 수 없는 문자가 있어요. 직접 고친 내용을 확인해 주세요.',
  folder_required: '저장할 폴더를 골라 주세요.',
  folder_changed: '선택한 폴더에 저장하지 못했어요. 폴더가 삭제됐거나 바뀌었어요. 폴더를 다시 골라 주세요.',
  name_collision: '같은 이름의 문서가 있어요. 다른 폴더를 선택하거나 제안을 거절해 주세요.',
  undo_expired: '되돌릴 수 있는 기간이 지났어요.',
  not_revertible: '이 제안은 되돌릴 수 없어요.',
  accept_failed: '반영하지 못했어요. 본문은 바뀌지 않았어요. 잠시 뒤 다시 시도해 주세요.',
  reject_failed: '거절하지 못했어요. 잠시 뒤 다시 시도해 주세요.',
  revert_failed: '되돌리지 못했어요. 본문은 지금 그대로예요. 잠시 뒤 다시 시도해 주세요.',
} as const;

export type ProposalErrorCode =
  | 'forbidden' | 'suspended' | 'not_found' | 'not_pending' | 'expired' | 'locked'
  | 'invalid_request' | 'invalid_selection' | 'invalid_content'
  | 'folder_required' | 'folder_changed' | 'name_collision'
  | 'undo_expired' | 'not_revertible' | 'failed';

type ErrorResult = { ok: false; status: 'error'; code: ProposalErrorCode; error: string };

/** Same limits as 0042 mcp_decision_check_content. */
export const ACCEPT_CONTENT_LIMIT = { chapter_draft: 100_000, kb_edit: 50_000 } as const;
const MAX_SELECTIONS = 2_000;
const MAX_EDITED_TEXT = 100_000;
const SHA256_HEX = /^[0-9a-f]{64}$/;

/** Exact RPC messages (0041/0042 contract) -> local codes. Anything else is 'failed'. */
const RPC_ERROR_CODES: Record<string, ProposalErrorCode> = {
  'browser session required': 'forbidden',
  'active writer required': 'forbidden',
  mcp_suspended: 'suspended',
  mcp_not_found: 'not_found',
  mcp_not_pending: 'not_pending',
  mcp_expired: 'expired',
  mcp_folder_invalid: 'folder_changed',
  mcp_folder_changed: 'folder_changed',
  mcp_name_collision: 'name_collision',
  mcp_invalid_content: 'invalid_content',
  mcp_invalid_decision: 'invalid_request',
  mcp_not_revertible: 'not_revertible',
  mcp_undo_expired: 'undo_expired',
};

function fail(code: ProposalErrorCode, failedCopy: string = PROPOSAL_ERROR_COPY.accept_failed): ErrorResult {
  const error = code === 'failed' ? failedCopy : PROPOSAL_ERROR_COPY[code];
  return { ok: false, status: 'error', code, error };
}

function mapRpcError(message: string | undefined, failedCopy: string): ErrorResult {
  const code = (message && RPC_ERROR_CODES[message.trim()]) || 'failed';
  return fail(code, failedCopy);
}

const idSchema = z.string().refine(isUuid);

const acceptSchema = z.strictObject({
  workId: idSchema,
  proposalId: idSchema,
  seenHash: z.string().regex(SHA256_HEX).optional(),
  selections: z.array(z.strictObject({
    index: z.number().int().min(0).max(MAX_SELECTIONS),
    accepted: z.boolean(),
    editedText: z.string().max(MAX_EDITED_TEXT).optional(),
  })).max(MAX_SELECTIONS),
  folderId: idSchema.optional(),
  folderVersion: z.string().min(1).max(10_000).optional(),
});

export type AcceptProposalInput = z.input<typeof acceptSchema>;

export type AcceptProposalResult =
  | { ok: true; status: 'accepted'; proposalId: string; undoUntil: string | null; createdNodeId: string | null; appliedCount: number }
  | { ok: false; status: 'stale'; error: string; detail: ProposalDetail }
  | ErrorResult;

/** Non-pending detail -> the right refusal (expired vs already decided). */
function refusalFor(detail: ProposalDetail): ErrorResult | null {
  if (detail.status === 'expired') return fail('expired');
  if (detail.status !== 'pending') return fail('not_pending');
  return null;
}

/** Re-read after a stale signal: fresh hunks with every selection cleared (UI-SPEC B). */
async function staleResult(
  supabase: SupabaseClient, userId: string, workId: string, proposalId: string, known?: ProposalDetail,
): Promise<AcceptProposalResult> {
  let fresh = known;
  if (!fresh) {
    const reloaded = await getProposalDetail(supabase, userId, workId, proposalId);
    if (!reloaded.ok) return reloaded.reason === 'not_found' ? fail('not_found') : fail('failed');
    fresh = reloaded.detail;
  }
  const refusal = refusalFor(fresh);
  if (refusal) return refusal;
  if (fresh.target.state === 'locked') return fail('locked');
  if (fresh.target.state === 'missing') return fail('not_found');
  return { ok: false, status: 'stale', error: PROPOSAL_ERROR_COPY.stale, detail: fresh };
}

export async function acceptProposal(
  supabase: SupabaseClient, userId: string, input: unknown,
): Promise<AcceptProposalResult> {
  if (!isUuid(userId)) return fail('forbidden');
  const parsed = acceptSchema.safeParse(input);
  if (!parsed.success) return fail('invalid_request');
  const { workId, proposalId, seenHash, folderId, folderVersion } = parsed.data;
  const chosen = parsed.data.selections.filter((s) => s.accepted);

  const loaded = await getProposalDetail(supabase, userId, workId, proposalId);
  if (!loaded.ok) return loaded.reason === 'not_found' ? fail('not_found') : fail('failed');
  const detail = loaded.detail;
  const refusal = refusalFor(detail);
  if (refusal) return refusal;

  if (detail.kind === 'kb_create') return acceptCreate(supabase, detail, chosen.length, folderId, folderVersion);

  if (detail.target.state === 'missing') return fail('not_found');
  if (detail.target.state === 'locked') return fail('locked');
  if (!seenHash) return fail('invalid_request');
  if (detail.seenHash === null || detail.currentContent === null) return fail('failed');
  // D-P14-04: the original changed after the writer looked -> nothing is written.
  if (seenHash !== detail.seenHash) return staleResult(supabase, userId, workId, proposalId, detail);

  if (chosen.length === 0) return fail('invalid_selection');
  const limit = ACCEPT_CONTENT_LIMIT[detail.kind];
  const selections: Array<{ index: number; editedText?: string }> = [];
  for (const s of chosen) {
    if (s.editedText === undefined) {
      selections.push({ index: s.index });
      continue;
    }
    // D-P14-10: 직접 고침 is untrusted text: LF-normalized, no NUL, bounded.
    const edited = s.editedText.replace(/\r\n?/g, '\n');
    if (edited.includes('\u0000') || edited.length > limit) return fail('invalid_content');
    selections.push({ index: s.index, editedText: edited });
  }

  let finalText: string;
  try {
    // Throws on unknown / duplicate index, a non-applicable hunk, or editedText on 삭제.
    finalText = applySelectedHunks(detail.currentContent, detail.hunks, selections);
  } catch {
    return fail('invalid_selection');
  }
  if (finalText.includes('\u0000') || finalText.length > limit) return fail('invalid_content');

  const decision = {
    accepted_indexes: selections.map((s) => s.index).sort((a, b) => a - b),
    edited_indexes: selections.filter((s) => s.editedText !== undefined).map((s) => s.index).sort((a, b) => a - b),
    hunk_count: detail.hunks.length,
    stale_base: detail.isStale,
  };
  const rpc = detail.kind === 'chapter_draft' ? 'accept_mcp_chapter_draft' : 'accept_mcp_kb_edit';
  try {
    const { data, error } = await supabase.rpc(rpc, {
      p_proposal_id: detail.id,
      // Hash of the original this merge was built on, computed server-side (= seenHash).
      p_expected_hash: detail.seenHash,
      p_new_content: finalText,
      p_decision: decision,
    });
    if (error) {
      if (error.message?.trim() === 'mcp_stale') return staleResult(supabase, userId, workId, proposalId);
      return mapRpcError(error.message, PROPOSAL_ERROR_COPY.accept_failed);
    }
    const row = (data ?? {}) as { undo_until?: unknown };
    return {
      ok: true, status: 'accepted', proposalId: detail.id,
      undoUntil: typeof row.undo_until === 'string' ? row.undo_until : null,
      createdNodeId: null, appliedCount: selections.length,
    };
  } catch {
    return fail('failed');
  }
}

/** D-P14-03: a new document needs the writer's explicit folder; never a default. */
async function acceptCreate(
  supabase: SupabaseClient, detail: ProposalDetail, selectionCount: number,
  folderId: string | undefined, folderVersion: string | undefined,
): Promise<AcceptProposalResult> {
  if (selectionCount > 0) return fail('invalid_selection');
  if (!folderId || !folderVersion) return fail('folder_required');
  // Early, friendly check against the candidates just re-read; the RPC re-walks the
  // chain under FOR SHARE and compares the same 'id:name' version.
  const folders = detail.folders;
  const folder = folders?.status === 'ok' ? folders.candidates.find((c) => c.id === folderId) : undefined;
  if (!folder || folder.version !== folderVersion) return fail('folder_changed');
  try {
    const { data, error } = await supabase.rpc('accept_mcp_kb_create', {
      p_proposal_id: detail.id, p_folder_id: folderId, p_folder_version: folderVersion,
    });
    if (error) return mapRpcError(error.message, PROPOSAL_ERROR_COPY.accept_failed);
    const row = (data ?? {}) as { undo_until?: unknown; created_node_id?: unknown };
    return {
      ok: true, status: 'accepted', proposalId: detail.id,
      undoUntil: typeof row.undo_until === 'string' ? row.undo_until : null,
      createdNodeId: typeof row.created_node_id === 'string' ? row.created_node_id : null,
      appliedCount: 1,
    };
  } catch {
    return fail('failed');
  }
}

const targetSchema = z.strictObject({ workId: idSchema, proposalId: idSchema });

/** The proposal must belong to this user AND this work (same not_found otherwise). */
async function ownsProposalInWork(supabase: SupabaseClient, userId: string, workId: string, proposalId: string) {
  const { data: work, error: workError } = await supabase.from('works').select('id')
    .eq('id', workId).eq('owner_id', userId).is('deleted_at', null).maybeSingle();
  if (workError) throw new Error('work lookup failed');
  if (!work) return false;
  const { data, error } = await supabase.from('mcp_proposals').select('id')
    .eq('id', proposalId).eq('owner_id', userId).eq('work_id', workId).maybeSingle();
  if (error) throw new Error('proposal lookup failed');
  return Boolean(data);
}

export type RejectProposalResult = { ok: true; status: 'rejected'; proposalId: string } | ErrorResult;

/** Allowed for suspended writers (D-P14-07): no write-access pre-check; the RPC decides. */
export async function rejectProposal(
  supabase: SupabaseClient, userId: string, input: unknown,
): Promise<RejectProposalResult> {
  const failed = PROPOSAL_ERROR_COPY.reject_failed;
  if (!isUuid(userId)) return fail('forbidden', failed);
  const parsed = targetSchema.safeParse(input);
  if (!parsed.success) return fail('not_found', failed);
  const { workId, proposalId } = parsed.data;
  try {
    if (!(await ownsProposalInWork(supabase, userId, workId, proposalId))) return fail('not_found', failed);
    const { error } = await supabase.rpc('reject_mcp_proposal', { p_proposal_id: proposalId });
    if (error) return mapRpcError(error.message, failed);
    return { ok: true, status: 'rejected', proposalId };
  } catch {
    return fail('failed', failed);
  }
}

const revertSchema = z.strictObject({
  workId: idSchema,
  proposalId: idSchema,
  confirm: z.boolean().optional(),
  /** The confirmHash from the previous confirm_required answer, passed back unchanged. */
  seenHash: z.string().regex(SHA256_HEX).optional(),
});

export type RevertProposalResult =
  | { ok: true; status: 'reverted'; proposalId: string; changedSinceAccept: boolean }
  /** The original changed after accept: show the warning, then call again with
   * confirm: true and seenHash: confirmHash. A new confirm_required means it changed again. */
  | { ok: false; status: 'confirm_required'; proposalId: string; confirmHash: string }
  | ErrorResult;

/** Once, within the undo window, not suspended: all enforced by revert_mcp_proposal.
 * Hashes are never computed here; the RPC's current_hash round-trips as-is. */
export async function revertProposal(
  supabase: SupabaseClient, userId: string, input: unknown,
): Promise<RevertProposalResult> {
  const failed = PROPOSAL_ERROR_COPY.revert_failed;
  if (!isUuid(userId)) return fail('forbidden', failed);
  const parsed = revertSchema.safeParse(input);
  if (!parsed.success) {
    const ids = targetSchema.safeParse({
      workId: (input as { workId?: unknown } | null)?.workId,
      proposalId: (input as { proposalId?: unknown } | null)?.proposalId,
    });
    return ids.success ? fail('invalid_request', failed) : fail('not_found', failed);
  }
  const { workId, proposalId, seenHash } = parsed.data;
  const confirm = parsed.data.confirm === true;
  if (confirm && !seenHash) return fail('invalid_request', failed);
  try {
    if (!(await ownsProposalInWork(supabase, userId, workId, proposalId))) return fail('not_found', failed);
    const { data, error } = await supabase.rpc('revert_mcp_proposal', {
      p_proposal_id: proposalId, p_confirm: confirm, p_seen_hash: confirm ? seenHash : null,
    });
    if (error) return mapRpcError(error.message, failed);
    const row = (data ?? {}) as { status?: unknown; confirm_required?: unknown; changed_since_accept?: unknown; current_hash?: unknown };
    if (row.confirm_required === true && typeof row.current_hash === 'string') {
      return { ok: false, status: 'confirm_required', proposalId, confirmHash: row.current_hash };
    }
    if (row.status === 'reverted') {
      return { ok: true, status: 'reverted', proposalId, changedSinceAccept: row.changed_since_accept === true };
    }
    return fail('failed', failed);
  } catch {
    return fail('failed', failed);
  }
}
