import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getWork } from '@/lib/works/actions';
import { checkWriteAccess, isWriteAccessDbError, WRITE_SUSPENDED_MESSAGE, type WriteDenialCode } from '@/lib/auth/write-access';
import { KB_CATEGORIES } from '@/lib/kb/categories';
import {
  ELIGIBILITY_UNMET_REASONS,
  parseBranchEligibilitySummary,
  type BeginWorldBranchArgs,
  type BranchDiff,
  type BranchDiffEntry,
  type BranchEligibilitySummary,
  type ChildBranchKind,
  type ConfirmWorldBranchArgs,
  type EligibilityUnmetReason,
  type GetWorldBranchDiffArgs,
  type GetWorldBranchEligibilityArgs,
  type SoftDeleteWorldBranchArgs,
} from '@/lib/world-tree/types';

/**
 * Self-branch domain functions (18-02, WTREE-03/04/05/10). Thin wrappers over the 0034 RPCs:
 * begin_world_branch / get_world_branch_diff / confirm_world_branch / soft_delete_world_branch,
 * plus the 0033 owner-only get_world_branch_eligibility lookup.
 *
 * - `ownerId` is the session user the Server Action (18-07) passes in. Writes re-check it with
 *   checkWriteAccess (the DB answers only for auth.uid(), so a forged id fails closed) and the
 *   RPCs re-derive the caller from auth.uid() again.
 * - Nothing the client sends about counts, eligibility, thresholds or visibility ever reaches an
 *   RPC: every RPC argument object is built here from validated fields only.
 * - Document editing stays in the existing KB editor (createNode/renameNode/deleteNode/
 *   saveNodeContent at /studio/{draftWorkId}/kb/{nodeId}); this module only returns links.
 * - A failed confirm leaves the draft untouched (the RPC rolls back). `retryable` separates
 *   transient failures (network, serialization, lock, timeline not ready) from rule rejections.
 */

export const BRANCH_COPY = Object.freeze({
  invalidInput: '입력값을 다시 확인해 주세요.',
  kindInvalid: '가지 유형을 다시 선택해 주세요.',
  titleRequired: '작품 제목을 입력해주세요.',
  forbidden: '이 작품에서 가지를 칠 수 없어요.',
  ineligible: '아직 가지 치기 조건을 채우지 못했어요.',
  parentNotVisible: '이 작품은 지금 독자에게 보이지 않아서 가지를 칠 수 없어요. 공개 상태를 확인해 주세요.',
  eligibilityUnavailable: '가지 치기 조건을 확인하지 못했어요. 다시 시도해 주세요.',
  zeroChanges: '설정을 하나 이상 바꿔야 가지를 확정할 수 있어요.',
  zeroAdditions: '새 설정을 하나 이상 추가해야 가지를 확정할 수 있어요.',
  inheritedMutation: '확장 가지에서는 가져온 설정을 고치거나 지울 수 없어요. 새 설정만 더해 주세요.',
  confirmedImmutable: '확정한 가지의 설정은 바꿀 수 없어요.',
  hasChildren: '하위 가지를 먼저 정리해 주세요.',
  eraInvalid: '세계관 내 시점을 다시 선택해 주세요.',
  requestConflict: '가지 치기 요청이 겹쳤어요. 처음부터 다시 시작해 주세요.',
  notFound: '가지 초안을 찾을 수 없어요.',
  unavailable: '지금은 가지를 처리할 수 없어요. 잠시 후 다시 시도해 주세요.',
});

export type BranchErrorCode =
  | 'invalid_input'
  | 'forbidden'
  | WriteDenialCode
  | 'branch_ineligible'
  | 'eligibility_unavailable'
  | 'zero_changes'
  | 'zero_additions'
  | 'inherited_mutation'
  | 'confirmed_immutable'
  | 'has_children'
  | 'era_invalid'
  | 'request_conflict'
  | 'not_found'
  | 'unavailable';

export interface BranchFailure {
  ok: false;
  code: BranchErrorCode;
  error: string;
  retryable: boolean;
  /** branch_ineligible only: typed reasons from the DB DETAIL (parent_not_visible kept). */
  unmetReasons?: EligibilityUnmetReason[];
  /** branch_ineligible only: latest server status for 18-07/18-09 (null when it could not be read). */
  eligibility?: BranchEligibilitySummary | null;
}

export type BeginBranchResult = { ok: true; draftWorkId: string; editHref: string } | BranchFailure;
export type BranchDiffResult = { ok: true; diff: BranchDiff; editLinks: (string | null)[] } | BranchFailure;
export type ConfirmBranchResult =
  | { ok: true; status: 'confirmed'; workId: string; branchId: string; snapshotFixed: true; irreversible: true }
  | BranchFailure;
export type DeleteBranchResult = { ok: true; branchId: string; workId: string } | BranchFailure;
export type BranchEligibilityResult = { ok: true; eligibility: BranchEligibilitySummary } | BranchFailure;

const uuid = z.string().uuid();
const beginSchema = z.object({
  ownerId: uuid,
  sourceWorkId: uuid,
  kind: z.enum(['if', 'expand']),
  forkEraId: uuid.nullable().optional(),
  requestId: uuid,
});
const confirmSchema = z.object({
  ownerId: uuid,
  draftWorkId: uuid,
  title: z.string().trim().min(1),
  eraId: uuid,
  /** Used only to refresh the status after branch_ineligible; never sent to confirm. */
  sourceWorkId: uuid.optional(),
});
const diffSchema = z.object({ ownerId: uuid, draftWorkId: uuid });
const deleteSchema = z.object({ ownerId: uuid, branchId: uuid });
const eligibilitySchema = z.object({ ownerId: uuid, sourceWorkId: uuid });

function fail(code: BranchErrorCode, error: string, retryable = false): BranchFailure {
  return { ok: false, code, error, retryable };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
function hasExactKeys(v: unknown, keys: readonly string[]): v is Obj {
  return isObj(v) && Object.keys(v).length === keys.length && keys.every((k) => Object.prototype.hasOwnProperty.call(v, k));
}

type DbError = { message?: string | null; code?: string | null; details?: string | null };
type RpcOutcome = { data: unknown; error: DbError | null };

/** Calls an RPC; a thrown client/network error becomes an error outcome (never success). */
async function callRpc(supabase: SupabaseClient, fn: string, args: object): Promise<RpcOutcome> {
  try {
    const response = await supabase.rpc(fn, args);
    return { data: response.data, error: (response.error as DbError | null) ?? null };
  } catch {
    return { data: null, error: { message: 'network_error', code: 'network' } };
  }
}

const RETRYABLE_SQLSTATES = new Set(['40001', '40P01', '55P03', '57014', 'network']);

function parseReasons(details: string | null | undefined): EligibilityUnmetReason[] {
  if (!details) return [];
  try {
    const parsed: unknown = JSON.parse(details);
    if (!isObj(parsed) || !Array.isArray(parsed.unmetReasons)) return [];
    const known = ELIGIBILITY_UNMET_REASONS as readonly string[];
    return [...new Set(parsed.unmetReasons.filter((r): r is EligibilityUnmetReason => typeof r === 'string' && known.includes(r)))];
  } catch {
    return [];
  }
}

/** Maps a DB error to a typed failure. Unknown errors are treated as transient. */
function mapDbError(error: DbError): BranchFailure {
  const message = error.message ?? '';
  const has = (token: string) => message.includes(token);
  if (error.code && RETRYABLE_SQLSTATES.has(error.code)) return fail('unavailable', BRANCH_COPY.unavailable, true);
  if (isWriteAccessDbError(message)) return fail('write_suspended', WRITE_SUSPENDED_MESSAGE);
  if (has('world_branch_zero_changes')) return fail('zero_changes', BRANCH_COPY.zeroChanges);
  if (has('world_branch_zero_additions')) return fail('zero_additions', BRANCH_COPY.zeroAdditions);
  if (has('world_branch_inherited_mutation') || has('world_branch_inherited_immutable')) {
    return fail('inherited_mutation', BRANCH_COPY.inheritedMutation);
  }
  if (has('world_branch_confirmed_immutable') || has('world_branch_cross_work_move')) {
    return fail('confirmed_immutable', BRANCH_COPY.confirmedImmutable);
  }
  if (has('world_branch_has_children')) return fail('has_children', BRANCH_COPY.hasChildren);
  if (has('world_branch_title_required')) return fail('invalid_input', BRANCH_COPY.titleRequired);
  if (has('world_branch_kind_invalid')) return fail('invalid_input', BRANCH_COPY.kindInvalid);
  if (has('world_branch_era_') || has('world_branch_fork_era_invalid')) return fail('era_invalid', BRANCH_COPY.eraInvalid);
  if (has('world_branch_request_conflict') || error.code === '23505') return fail('request_conflict', BRANCH_COPY.requestConflict);
  if (has('world_branch_not_found')) return fail('not_found', BRANCH_COPY.notFound);
  if (has('world_tree_forbidden') || has('authentication_required') || has('writer_required')
      || has('world_branch_parent_invalid')) {
    return fail('forbidden', BRANCH_COPY.forbidden);
  }
  // world_tree_timeline_not_ready (0035 not applied yet) and anything unknown: transient.
  return fail('unavailable', BRANCH_COPY.unavailable, true);
}

async function ineligible(
  supabase: SupabaseClient,
  error: DbError,
  refresh: { ownerId: string; sourceWorkId: string } | null,
): Promise<BranchFailure> {
  const unmetReasons = parseReasons(error.details);
  const copy = unmetReasons.includes('parent_not_visible') ? BRANCH_COPY.parentNotVisible : BRANCH_COPY.ineligible;
  let eligibility: BranchEligibilitySummary | null = null;
  if (refresh) {
    const latest = await getBranchEligibility(supabase, refresh);
    eligibility = latest.ok ? latest.eligibility : null;
  }
  return { ok: false, code: 'branch_ineligible', error: copy, retryable: false, unmetReasons, eligibility };
}

async function writeGate(supabase: SupabaseClient, ownerId: string): Promise<BranchFailure | null> {
  const access = await checkWriteAccess(supabase, ownerId);
  if (access.ok) return null;
  return fail(access.code, access.error, access.code === 'write_unavailable');
}

// ---------------------------------------------------------------------------
// Eligibility (owner-only, point-in-time)
// ---------------------------------------------------------------------------

export async function getBranchEligibility(
  supabase: SupabaseClient,
  input: { ownerId: string; sourceWorkId: string },
): Promise<BranchEligibilityResult> {
  const parsed = eligibilitySchema.safeParse(input);
  if (!parsed.success) return fail('invalid_input', BRANCH_COPY.invalidInput);
  const args: GetWorldBranchEligibilityArgs = { p_source_work_id: parsed.data.sourceWorkId };
  const { data, error } = await callRpc(supabase, 'get_world_branch_eligibility', args);
  if (error) {
    const mapped = mapDbError(error);
    if (mapped.code === 'forbidden' || mapped.code === 'write_suspended') return mapped;
    return fail('eligibility_unavailable', BRANCH_COPY.eligibilityUnavailable, true);
  }
  const summary = parseBranchEligibilitySummary(data);
  if (!summary) return fail('eligibility_unavailable', BRANCH_COPY.eligibilityUnavailable, true);
  return { ok: true, eligibility: summary };
}

// ---------------------------------------------------------------------------
// Begin (draft + KB clone + frozen baseline, server side)
// ---------------------------------------------------------------------------

export async function beginBranch(
  supabase: SupabaseClient,
  input: { ownerId: string; sourceWorkId: string; kind: ChildBranchKind; forkEraId?: string | null; requestId: string },
): Promise<BeginBranchResult> {
  const parsed = beginSchema.safeParse(input);
  if (!parsed.success) {
    const kindIssue = parsed.error.issues.some((issue) => issue.path[0] === 'kind');
    return fail('invalid_input', kindIssue ? BRANCH_COPY.kindInvalid : BRANCH_COPY.invalidInput);
  }
  const { ownerId, sourceWorkId, kind, forkEraId, requestId } = parsed.data;

  const denied = await writeGate(supabase, ownerId);
  if (denied) return denied;
  const source = await getWork(supabase, { ownerId, workId: sourceWorkId });
  if (!source) return fail('forbidden', BRANCH_COPY.forbidden);

  const args: BeginWorldBranchArgs = {
    p_source_work_id: sourceWorkId,
    p_kind: kind,
    p_fork_era_id: forkEraId ?? null,
    p_request_id: requestId,
  };
  const { data, error } = await callRpc(supabase, 'begin_world_branch', args);
  if (error) {
    if ((error.message ?? '').includes('branch_ineligible')) return ineligible(supabase, error, { ownerId, sourceWorkId });
    return mapDbError(error);
  }
  if (!hasExactKeys(data, ['draft_work_id']) || !isUuid(data.draft_work_id)) {
    return fail('unavailable', BRANCH_COPY.unavailable, true);
  }
  return { ok: true, draftWorkId: data.draft_work_id, editHref: `/studio/${data.draft_work_id}` };
}

// ---------------------------------------------------------------------------
// Diff (server recomputed; names/categories only)
// ---------------------------------------------------------------------------

const DIFF_ENTRY_FIELDS = ['draftNodeId', 'sourceNodeId', 'name', 'category', 'changeKind'] as const;
const COUNT_FIELDS = ['added', 'modified', 'deleted'] as const;

function parseBranchDiff(raw: unknown): BranchDiff | null {
  if (!hasExactKeys(raw, ['counts', 'entries'])) return null;
  const { counts, entries } = raw;
  if (!hasExactKeys(counts, COUNT_FIELDS) || !Array.isArray(entries)) return null;
  if (!COUNT_FIELDS.every((k) => typeof counts[k] === 'number' && Number.isInteger(counts[k]) && (counts[k] as number) >= 0)) return null;
  const tally = { added: 0, modified: 0, deleted: 0 };
  for (const entry of entries) {
    if (!hasExactKeys(entry, DIFF_ENTRY_FIELDS)) return null;
    if (typeof entry.name !== 'string' || !(KB_CATEGORIES as string[]).includes(entry.category as string)) return null;
    const kind = entry.changeKind;
    if (kind === 'added') {
      if (!isUuid(entry.draftNodeId) || entry.sourceNodeId !== null) return null;
    } else if (kind === 'modified') {
      if (!isUuid(entry.draftNodeId) || !isUuid(entry.sourceNodeId)) return null;
    } else if (kind === 'deleted') {
      if (entry.draftNodeId !== null || !isUuid(entry.sourceNodeId)) return null;
    } else {
      return null;
    }
    tally[kind] += 1;
  }
  if (!COUNT_FIELDS.every((k) => counts[k] === tally[k])) return null;
  return { counts: { ...tally }, entries: entries as BranchDiffEntry[] };
}

export async function getBranchDiff(
  supabase: SupabaseClient,
  input: { ownerId: string; draftWorkId: string },
): Promise<BranchDiffResult> {
  const parsed = diffSchema.safeParse(input);
  if (!parsed.success) return fail('invalid_input', BRANCH_COPY.invalidInput);
  const { draftWorkId } = parsed.data;
  const args: GetWorldBranchDiffArgs = { p_draft_work_id: draftWorkId };
  const { data, error } = await callRpc(supabase, 'get_world_branch_diff', args);
  if (error) return mapDbError(error);
  const diff = parseBranchDiff(data);
  if (!diff) return fail('unavailable', BRANCH_COPY.unavailable, true);
  const editLinks = diff.entries.map((entry) =>
    entry.changeKind === 'deleted' || !entry.draftNodeId ? null : `/studio/${draftWorkId}/kb/${entry.draftNodeId}`);
  return { ok: true, diff, editLinks };
}

// ---------------------------------------------------------------------------
// Confirm (atomic, irreversible; server re-verifies eligibility and the diff)
// ---------------------------------------------------------------------------

export async function confirmBranch(
  supabase: SupabaseClient,
  input: { ownerId: string; draftWorkId: string; title: string; eraId: string; sourceWorkId?: string },
): Promise<ConfirmBranchResult> {
  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) {
    const titleIssue = parsed.error.issues.some((issue) => issue.path[0] === 'title');
    return fail('invalid_input', titleIssue ? BRANCH_COPY.titleRequired : BRANCH_COPY.invalidInput);
  }
  const { ownerId, draftWorkId, title, eraId, sourceWorkId } = parsed.data;

  const denied = await writeGate(supabase, ownerId);
  if (denied) return denied;

  const args: ConfirmWorldBranchArgs = { p_draft_work_id: draftWorkId, p_title: title, p_era_id: eraId };
  const { data, error } = await callRpc(supabase, 'confirm_world_branch', args);
  if (error) {
    if ((error.message ?? '').includes('branch_ineligible')) {
      return ineligible(supabase, error, sourceWorkId ? { ownerId, sourceWorkId } : null);
    }
    return mapDbError(error);
  }
  if (!hasExactKeys(data, ['work_id', 'branch_id']) || !isUuid(data.work_id) || !isUuid(data.branch_id)) {
    return fail('unavailable', BRANCH_COPY.unavailable, true);
  }
  return { ok: true, status: 'confirmed', workId: data.work_id, branchId: data.branch_id, snapshotFixed: true, irreversible: true };
}

// ---------------------------------------------------------------------------
// Delete (blocked while a live child branch exists)
// ---------------------------------------------------------------------------

export async function deleteBranch(
  supabase: SupabaseClient,
  input: { ownerId: string; branchId: string },
): Promise<DeleteBranchResult> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return fail('invalid_input', BRANCH_COPY.invalidInput);
  const { ownerId, branchId } = parsed.data;

  const denied = await writeGate(supabase, ownerId);
  if (denied) return denied;

  const args: SoftDeleteWorldBranchArgs = { p_branch_id: branchId };
  const { data, error } = await callRpc(supabase, 'soft_delete_world_branch', args);
  if (error) return mapDbError(error);
  if (!hasExactKeys(data, ['branch_id', 'work_id']) || !isUuid(data.branch_id) || !isUuid(data.work_id)) {
    return fail('unavailable', BRANCH_COPY.unavailable, true);
  }
  return { ok: true, branchId: data.branch_id, workId: data.work_id };
}
