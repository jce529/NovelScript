import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getWork } from '@/lib/works/actions';
import { checkWriteAccess, isWriteAccessDbError, WRITE_SUSPENDED_MESSAGE, type WriteDenialCode } from '@/lib/auth/write-access';
import { getBranchEligibility } from '@/lib/world-tree/branches';
import { getWorldTree } from '@/lib/world-tree/queries';
import { draftFromTimeline, type TimelineBaseline, type TimelineDraft } from '@/lib/world-tree/timeline';
import {
  BRANCH_KINDS,
  BRANCH_STATUSES,
  type BranchDraft,
  type BranchEligibilitySummary,
  type Era,
  type EraPlacement,
  type MarkBranchNoticeReadArgs,
  type OwnerWorldTreeProjection,
  type Uuid,
  type WorldBranch,
} from '@/lib/world-tree/types';

/**
 * Owner-side world-tree reads and the notice read mark (18-07, WTREE-01/02/03/04/05/07/10).
 *
 * - `ownerId` is the session user a Server Action passes in. Every read is owner-scoped twice:
 *   explicitly (`owner_id = ownerId` / owner-scoped getWork) and by the 0032 owner-only RLS on the
 *   world tables, so a forged id or someone else's work/branch/notice never resolves.
 * - World tables are read with explicit column lists. Setting content, snapshot rows
 *   (world_branch_docs) and KB rows are never read here.
 * - Eligibility comes only from the 18-14 server summary (get_world_branch_eligibility through
 *   18-02 getBranchEligibility). A failed or malformed lookup is `unavailable`, never eligible.
 *   parent_not_visible and isPublished/readerVisible are passed through unchanged for 18-09.
 * - The owner tree is the owner/admin projection only. A reader projection is never passed off
 *   as the owner view (the reader preview is a separate call in the Server Actions).
 * - Source-change notices only report when the source changed and whether it was read. Branch
 *   copies are never updated (rule: snapshot fixed at confirm).
 * - Publishing is not changed here: visibility follows the existing chapter publish paths.
 */

export const OWNER_COPY = Object.freeze({
  invalidInput: '입력값을 다시 확인해 주세요.',
  unauthenticated: '로그인이 필요해요.',
  forbidden: '이 작품의 세계관을 관리할 수 없어요.',
  unavailable: '세계관 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
  treeUnavailable: '세계수를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
  hasChildren: '하위 가지를 먼저 정리해 주세요.',
  noTree: '아직 세계수가 없어요. 세계수를 먼저 만들어 주세요.',
  noticeSourceChanged: '원본 세계관이 바뀌었어요. 이 가지의 설정은 확정한 시점 그대로 유지돼요.',
  noticeSourceChangedBeforeConfirm: '가지를 만드는 동안 원본 세계관이 바뀌었어요. 이 가지의 설정은 확정한 시점 그대로 유지돼요.',
  noticeReadFailed: '알림을 읽음으로 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.',
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OwnerErrorCode = 'invalid_input' | 'forbidden' | 'unavailable' | WriteDenialCode;

export interface OwnerFailure {
  ok: false;
  code: OwnerErrorCode;
  error: string;
  retryable: boolean;
}

/** world_branches row as the owner sees it (real ids; studio only). */
export interface OwnedBranch extends WorldBranch {
  requestId: Uuid | null;
  createdAt: string;
}

export type OwnerNoticeKind = 'source_changed' | 'source_changed_before_confirm';

/** Minimal source-changed notice. No event key, node id or setting content. */
export interface OwnerBranchNotice {
  id: Uuid;
  branchId: Uuid;
  sourceWorkId: Uuid;
  kind: OwnerNoticeKind;
  createdAt: string;
  readAt: string | null;
  read: boolean;
  message: string;
}

export type OwnerEligibilitySection =
  | { status: 'ok'; summary: BranchEligibilitySummary }
  | { status: 'forbidden'; error: string; retryable: false }
  | { status: 'unavailable'; error: string; retryable: true };

/** Owner/admin full projection only — the reader projection has its own type and call. */
export type OwnerTreeSection =
  | { status: 'ok'; mode: 'owner' | 'admin'; projection: OwnerWorldTreeProjection }
  | { status: 'unavailable' }
  | { status: 'error'; error: string; retryable: boolean };

export type DeleteBlockReason = 'has_children' | 'not_in_tree';

export interface OwnerDeletionState {
  /** From the live child rows in the DB; soft_delete_world_branch still re-checks. */
  canDelete: boolean;
  reason: DeleteBlockReason | null;
  message: string | null;
}

export interface OwnedTimeline {
  branch: OwnedBranch;
  baseline: TimelineBaseline;
}

export interface WorldTreeOwnerState {
  work: { id: Uuid; title: string };
  branch: OwnedBranch | null;
  draft: BranchDraft | null;
  timeline: { draft: TimelineDraft; baseline: TimelineBaseline } | null;
  deletion: OwnerDeletionState;
  notices: OwnerBranchNotice[];
  eligibility: OwnerEligibilitySection;
  tree: OwnerTreeSection;
}

export type WorldTreeOwnerStateResult = { ok: true; state: WorldTreeOwnerState } | OwnerFailure;
export type OwnedBranchResult = { ok: true; branch: OwnedBranch | null } | OwnerFailure;
export type OwnedTimelineResult = { ok: true; timeline: OwnedTimeline | null } | OwnerFailure;
export type MarkNoticeReadResult = { ok: true; noticeId: Uuid; readAt: string } | OwnerFailure;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const uuid = z.string().uuid();
const ownerWorkSchema = z.object({ ownerId: uuid, workId: uuid });
const noticeSchema = z.object({ ownerId: uuid, noticeId: uuid });
const branchLookupSchema = z.union([
  z.object({ ownerId: uuid, branchId: uuid }).strict(),
  z.object({ ownerId: uuid, workId: uuid }).strict(),
  z.object({ ownerId: uuid, requestId: uuid }).strict(),
]);

function fail(code: OwnerErrorCode, error: string, retryable = false): OwnerFailure {
  return { ok: false, code, error, retryable };
}
const unavailable = () => fail('unavailable', OWNER_COPY.unavailable, true);

const BRANCH_COLUMNS =
  'id, root_work_id, work_id, owner_id, parent_branch_id, kind, status, fork_era_id, confirmed_at, deleted_at, request_id, created_at';
const ERA_COLUMNS = 'id, branch_id, source_era_id, position, name, year_label, memo, inherited, deleted_at';
const PLACEMENT_COLUMNS = 'id, branch_id, era_id, work_id, order_index, concurrent_with_prev, relation_label';
const CHILD_COLUMNS = 'id, fork_era_id';
const NOTICE_COLUMNS = 'id, source_work_id, branch_id, event_key, created_at, read_at';

type Row = Record<string, unknown>;
type ListOutcome = { rows: Row[] } | null;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);
const isNullableUuid = (v: unknown): v is string | null => v === null || isUuid(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isNullableText = (v: unknown): v is string | null => v === null || typeof v === 'string';
const isIndex = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);
const isObj = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Awaits a query builder; a thrown client error or a non-array answer is a failure. */
async function list(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<ListOutcome> {
  try {
    const { data, error } = await query;
    if (error || !Array.isArray(data)) return null;
    return { rows: data.filter(isObj) };
  } catch {
    return null;
  }
}

function toBranch(row: Row): OwnedBranch | null {
  if (!isUuid(row.id) || !isUuid(row.root_work_id) || !isUuid(row.work_id) || !isUuid(row.owner_id)) return null;
  if (!isNullableUuid(row.parent_branch_id) || !isNullableUuid(row.fork_era_id) || !isNullableUuid(row.request_id ?? null)) return null;
  if (!isOneOf(BRANCH_KINDS, row.kind) || !isOneOf(BRANCH_STATUSES, row.status)) return null;
  if (!isNullableText(row.confirmed_at) || !isNullableText(row.deleted_at) || !isText(row.created_at)) return null;
  return {
    id: row.id, rootWorkId: row.root_work_id, workId: row.work_id, ownerId: row.owner_id,
    parentBranchId: row.parent_branch_id, kind: row.kind, status: row.status, forkEraId: row.fork_era_id,
    confirmedAt: row.confirmed_at, deletedAt: row.deleted_at, requestId: (row.request_id ?? null) as string | null,
    createdAt: row.created_at,
  };
}

function toEra(row: Row): Era | null {
  if (!isUuid(row.id) || !isUuid(row.branch_id) || !isNullableUuid(row.source_era_id) || !isIndex(row.position)) return null;
  if (!isText(row.name) || !isNullableText(row.year_label) || !isNullableText(row.memo) || typeof row.inherited !== 'boolean') return null;
  if (!isNullableText(row.deleted_at)) return null;
  return {
    id: row.id, branchId: row.branch_id, sourceEraId: row.source_era_id, position: row.position, name: row.name,
    yearLabel: row.year_label, memo: row.memo, inherited: row.inherited, deletedAt: row.deleted_at,
  };
}

function toPlacement(row: Row): EraPlacement | null {
  if (!isUuid(row.id) || !isUuid(row.branch_id) || !isUuid(row.era_id) || !isUuid(row.work_id) || !isIndex(row.order_index)) return null;
  if (typeof row.concurrent_with_prev !== 'boolean' || !isNullableText(row.relation_label)) return null;
  return {
    id: row.id, branchId: row.branch_id, eraId: row.era_id, workId: row.work_id, orderIndex: row.order_index,
    concurrentWithPrev: row.concurrent_with_prev, relationLabel: row.relation_label,
  };
}

function toNotice(row: Row): OwnerBranchNotice | null {
  if (!isUuid(row.id) || !isUuid(row.branch_id) || !isUuid(row.source_work_id) || !isText(row.event_key)) return null;
  if (!isText(row.created_at) || !isNullableText(row.read_at)) return null;
  const kind: OwnerNoticeKind = row.event_key === 'source_changed_before_confirm' ? 'source_changed_before_confirm' : 'source_changed';
  return {
    id: row.id, branchId: row.branch_id, sourceWorkId: row.source_work_id, kind, createdAt: row.created_at,
    readAt: row.read_at, read: row.read_at !== null,
    message: kind === 'source_changed' ? OWNER_COPY.noticeSourceChanged : OWNER_COPY.noticeSourceChangedBeforeConfirm,
  };
}

/** Maps every row or fails as a whole (a malformed row is never silently dropped). */
function mapAll<T>(rows: Row[], map: (row: Row) => T | null): T[] | null {
  const out: T[] = [];
  for (const row of rows) {
    const value = map(row);
    if (value === null) return null;
    out.push(value);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Branch lookup (owner-scoped, live rows only)
// ---------------------------------------------------------------------------

export async function getOwnedBranch(
  supabase: SupabaseClient,
  input: { ownerId: string; branchId: string } | { ownerId: string; workId: string } | { ownerId: string; requestId: string },
): Promise<OwnedBranchResult> {
  const parsed = branchLookupSchema.safeParse(input);
  if (!parsed.success) return fail('invalid_input', OWNER_COPY.invalidInput);
  const data = parsed.data as { ownerId: string; branchId?: string; workId?: string; requestId?: string };
  const [column, value] = data.branchId ? ['id', data.branchId] : data.workId ? ['work_id', data.workId] : ['request_id', data.requestId!];

  const outcome = await list(
    supabase.from('world_branches').select(BRANCH_COLUMNS)
      .eq(column, value).eq('owner_id', data.ownerId).is('deleted_at', null).limit(2),
  );
  if (!outcome || outcome.rows.length > 1) return unavailable();
  if (outcome.rows.length === 0) return { ok: true, branch: null };
  const branch = toBranch(outcome.rows[0]);
  if (!branch || branch.ownerId !== data.ownerId) return unavailable();
  return { ok: true, branch };
}

async function loadBaseline(supabase: SupabaseClient, branch: OwnedBranch): Promise<{ baseline: TimelineBaseline; childCount: number } | null> {
  const [eraRows, placementRows, childRows] = await Promise.all([
    list(supabase.from('world_eras').select(ERA_COLUMNS).eq('branch_id', branch.id).is('deleted_at', null).order('position')),
    list(supabase.from('world_era_placements').select(PLACEMENT_COLUMNS).eq('branch_id', branch.id).is('deleted_at', null).order('order_index')),
    list(supabase.from('world_branches').select(CHILD_COLUMNS).eq('parent_branch_id', branch.id).is('deleted_at', null)),
  ]);
  if (!eraRows || !placementRows || !childRows) return null;
  const eras = mapAll(eraRows.rows, toEra);
  const placements = mapAll(placementRows.rows, toPlacement);
  if (!eras || !placements) return null;
  if (eras.some((e) => e.branchId !== branch.id) || placements.some((p) => p.branchId !== branch.id)) return null;
  const forkEraIds: Uuid[] = [];
  for (const child of childRows.rows) {
    if (!isUuid(child.id) || !isNullableUuid(child.fork_era_id)) return null;
    if (child.fork_era_id && !forkEraIds.includes(child.fork_era_id)) forkEraIds.push(child.fork_era_id);
  }
  return { baseline: { eras, placements, forkEraIds }, childCount: childRows.rows.length };
}

/** The work's own branch line and its stored timeline (the save baseline is never client data). */
export async function getOwnedTimeline(
  supabase: SupabaseClient,
  input: { ownerId: string; workId: string },
): Promise<OwnedTimelineResult> {
  const parsed = ownerWorkSchema.safeParse(input);
  if (!parsed.success) return fail('invalid_input', OWNER_COPY.invalidInput);
  const found = await getOwnedBranch(supabase, parsed.data);
  if (!found.ok) return found;
  if (!found.branch) return { ok: true, timeline: null };
  const loaded = await loadBaseline(supabase, found.branch);
  if (!loaded) return unavailable();
  return { ok: true, timeline: { branch: found.branch, baseline: loaded.baseline } };
}

// ---------------------------------------------------------------------------
// Owner state
// ---------------------------------------------------------------------------

async function loadEligibility(supabase: SupabaseClient, ownerId: string, workId: string): Promise<OwnerEligibilitySection> {
  const result = await getBranchEligibility(supabase, { ownerId, sourceWorkId: workId });
  if (result.ok) return { status: 'ok', summary: result.eligibility };
  if (result.code === 'forbidden') return { status: 'forbidden', error: result.error, retryable: false };
  return { status: 'unavailable', error: result.error, retryable: true };
}

async function loadOwnerTree(supabase: SupabaseClient, workId: string): Promise<OwnerTreeSection> {
  const result = await getWorldTree(supabase, { workId });
  if (!result.ok) return { status: 'error', error: result.error, retryable: result.retryable };
  if (result.status === 'unavailable') return { status: 'unavailable' };
  if (result.mode === 'reader') return { status: 'error', error: OWNER_COPY.treeUnavailable, retryable: true };
  return { status: 'ok', mode: result.mode, projection: result.projection };
}

/**
 * Everything the studio world-tree settings screen needs for one owned work: branch row,
 * draft DTO, editable timeline + server baseline, delete block reason, notices, the server
 * eligibility summary and the owner/admin tree projection.
 */
export async function getWorldTreeOwnerState(
  supabase: SupabaseClient,
  input: { ownerId: string; workId: string },
): Promise<WorldTreeOwnerStateResult> {
  const parsed = ownerWorkSchema.safeParse(input);
  if (!parsed.success) return fail('invalid_input', OWNER_COPY.invalidInput);
  const { ownerId, workId } = parsed.data;

  let work: { id: unknown; title: unknown; owner_id?: unknown } | null;
  try {
    work = await getWork(supabase, { ownerId, workId });
  } catch {
    return unavailable();
  }
  if (!work || work.id !== workId || (work.owner_id !== undefined && work.owner_id !== ownerId) || typeof work.title !== 'string') {
    return fail('forbidden', OWNER_COPY.forbidden);
  }

  const found = await getOwnedBranch(supabase, { ownerId, workId });
  if (!found.ok) return found;
  const branch = found.branch;

  let timeline: WorldTreeOwnerState['timeline'] = null;
  let notices: OwnerBranchNotice[] = [];
  let draft: BranchDraft | null = null;
  let deletion: OwnerDeletionState = { canDelete: false, reason: 'not_in_tree', message: null };

  if (branch) {
    const [loaded, noticeRows, parentRow] = await Promise.all([
      loadBaseline(supabase, branch),
      list(supabase.from('world_branch_notices').select(NOTICE_COLUMNS).eq('branch_id', branch.id).order('created_at', { ascending: false })),
      branch.status === 'draft' && branch.parentBranchId
        ? getOwnedBranch(supabase, { ownerId, branchId: branch.parentBranchId })
        : Promise.resolve(null),
    ]);
    if (!loaded || !noticeRows) return unavailable();
    const mappedNotices = mapAll(noticeRows.rows, toNotice);
    if (!mappedNotices || mappedNotices.some((n) => n.branchId !== branch.id)) return unavailable();
    notices = mappedNotices;
    timeline = { draft: draftFromTimeline(branch, loaded.baseline.eras, loaded.baseline.placements), baseline: loaded.baseline };
    deletion = loaded.childCount > 0
      ? { canDelete: false, reason: 'has_children', message: OWNER_COPY.hasChildren }
      : { canDelete: true, reason: null, message: null };

    if (branch.status === 'draft') {
      if (!parentRow || !parentRow.ok || !parentRow.branch || branch.kind === 'trunk' || !branch.requestId) return unavailable();
      draft = {
        branchId: branch.id, draftWorkId: branch.workId, sourceWorkId: parentRow.branch.workId, rootWorkId: branch.rootWorkId,
        kind: branch.kind, status: 'draft', forkEraId: branch.forkEraId, requestId: branch.requestId, createdAt: branch.createdAt,
      };
    }
  }

  const [eligibility, tree] = await Promise.all([
    loadEligibility(supabase, ownerId, workId),
    loadOwnerTree(supabase, workId),
  ]);

  return {
    ok: true,
    state: { work: { id: workId, title: work.title }, branch, draft, timeline, deletion, notices, eligibility, tree },
  };
}

// ---------------------------------------------------------------------------
// Notice read (0036 mark_branch_notice_read; changes read_at only)
// ---------------------------------------------------------------------------

const RETRYABLE_SQLSTATES = new Set(['40001', '40P01', '55P03', '57014', 'network']);

/**
 * Marks one source-change notice read. The UI must keep the unread state until this returns
 * ok: a failed, mismatched or malformed answer is `unavailable` (retryable). Snapshots and branch
 * copies are never written; the RPC re-checks auth.uid(), the writer role and ownership.
 */
export async function markBranchNoticeRead(
  supabase: SupabaseClient,
  input: { ownerId: string; noticeId: string },
): Promise<MarkNoticeReadResult> {
  const parsed = noticeSchema.safeParse(input);
  if (!parsed.success) return fail('invalid_input', OWNER_COPY.invalidInput);
  const { ownerId, noticeId } = parsed.data;

  const access = await checkWriteAccess(supabase, ownerId);
  if (!access.ok) return fail(access.code, access.error, access.code === 'write_unavailable');

  const args: MarkBranchNoticeReadArgs = { p_notice_id: noticeId };
  let data: unknown;
  let error: { message?: string | null; code?: string | null } | null;
  try {
    const response = await supabase.rpc('mark_branch_notice_read', args);
    data = response.data;
    error = (response.error as typeof error) ?? null;
  } catch {
    return fail('unavailable', OWNER_COPY.noticeReadFailed, true);
  }
  if (error) {
    const message = error.message ?? '';
    if (error.code && RETRYABLE_SQLSTATES.has(error.code)) return fail('unavailable', OWNER_COPY.noticeReadFailed, true);
    if (isWriteAccessDbError(message)) return fail('write_suspended', WRITE_SUSPENDED_MESSAGE);
    if (message.includes('world_tree_forbidden') || message.includes('authentication_required') || message.includes('writer_required')) {
      return fail('forbidden', OWNER_COPY.forbidden);
    }
    return fail('unavailable', OWNER_COPY.noticeReadFailed, true);
  }
  if (!isObj(data) || Object.keys(data).length !== 2 || data.notice_id !== noticeId) {
    return fail('unavailable', OWNER_COPY.noticeReadFailed, true);
  }
  const readAt = data.read_at;
  if (typeof readAt !== 'string' || Number.isNaN(Date.parse(readAt))) return fail('unavailable', OWNER_COPY.noticeReadFailed, true);
  return { ok: true, noticeId, readAt };
}
