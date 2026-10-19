import type { SupabaseClient } from '@supabase/supabase-js';
import { checkWriteAccess, isWriteAccessDbError, WRITE_SUSPENDED_MESSAGE, type WriteDenialCode } from '@/lib/auth/write-access';
import type {
  BranchKind,
  Era,
  EraPlacement,
  SaveWorldTimelineArgs,
  TimelineEraInput,
  TimelinePlacementInput,
  Uuid,
  WorldBranch,
} from '@/lib/world-tree/types';

/**
 * World timeline domain (18-03, WTREE-01/02/03/04).
 *
 * - Pure transitions (validateTimeline / movePlacement / setConcurrent / addEra / removeEra) are
 *   shared by the editor's drag and its prev/next/up/down buttons: both call movePlacement with
 *   the same input and get the same output. They never mutate their input and are deterministic.
 * - The module holds no secret and no server-only import, so the client editor (18-08) can use the
 *   pure functions directly. saveTimeline / ensureWorldTree take the caller's Supabase client and
 *   are meant to be called from a Server Action (18-07) with the session user's id.
 * - The server is the authority: save_world_timeline / ensure_world_tree (0035) re-check auth,
 *   ownership, write access, the inherited span and every ordering rule. The checks here only
 *   stop an invalid payload early; a success message is returned only after the RPC answered
 *   with a well-formed result (no optimistic success toast).
 * - Era reordering never uses reorder_chapters (chapter order only).
 * - WTREE-09 (pre-fork locks following the child reader's progress when the parent is private) is
 *   out of scope; "inherited" here only means the copied span is read-only for the writer.
 */

export const TIMELINE_COPY = Object.freeze({
  description:
    '시대 구간은 필수(이름·순서), 연도 숫자는 선택이에요. 작품(열매)을 구간에 배치하고, 같은 시기에 함께 벌어진 작품은 동시 진행으로 표시해요.',
  memoPlaceholder: '예: 본가지 3기 후반에 해당',
  firstConcurrent: '구간의 첫 작품은 동시 진행으로 표시할 앞 작품이 없어요.',
  inheritedLocked: '이어받은 구간은 수정할 수 없어요. 분기 이후 구간에서 편집해 주세요.',
  saved: '연표를 저장했어요. 세계수에 열매 위치가 반영돼요.',
  eraNameRequired: '시대 구간 이름을 입력해 주세요.',
  eraOrderInvalid: '시대 구간 순서를 다시 확인해 주세요.',
  placementOrderInvalid: '구간 안 작품 순서를 다시 확인해 주세요.',
  placementEraMissing: '작품을 놓을 시대 구간을 찾을 수 없어요.',
  duplicateWork: '한 작품은 연표에 한 번만 놓을 수 있어요.',
  memoNotAllowed: '본가지 대응 메모는 잔가지의 독립 구간에만 적을 수 있어요.',
  branchWorkRequired: '이 가지의 작품은 독립 구간에 놓여 있어야 해요.',
  eraNotEmpty: '작품이 있는 구간은 지울 수 없어요. 작품을 먼저 다른 구간으로 옮겨 주세요.',
  forkEraInUse: '다른 가지의 분기 시점인 구간은 지울 수 없어요.',
  workNotPlaceable: '이 작품은 이 연표에 놓을 수 없어요.',
  noTarget: '더 이동할 곳이 없어요.',
  notFound: '연표에서 해당 항목을 찾을 수 없어요.',
  invalidInput: '입력값을 다시 확인해 주세요.',
  invalidTimeline: '연표에 고칠 곳이 있어요. 표시된 항목을 확인해 주세요.',
  forbidden: '이 연표를 편집할 수 없어요.',
  unavailable: '지금은 연표를 저장할 수 없어요. 잠시 후 다시 시도해 주세요.',
});

// ---------------------------------------------------------------------------
// Draft shapes
// ---------------------------------------------------------------------------

export interface TimelineDraftEra {
  id: Uuid;
  position: number;
  name: string;
  yearLabel: string | null;
  memo: string | null;
  inherited: boolean;
}

export type TimelineDraftPlacement = TimelinePlacementInput;

export interface TimelineDraft {
  branchId: Uuid;
  branchKind: BranchKind;
  branchWorkId: Uuid;
  eras: TimelineDraftEra[];
  placements: TimelineDraftPlacement[];
}

/** Stored state the draft is checked against (owner projection rows of this branch). */
export interface TimelineBaseline {
  eras: Era[];
  placements: EraPlacement[];
  /** Eras of this branch that are a live child's fork point (cannot be removed). */
  forkEraIds?: Uuid[];
}

export type TimelineIssueCode =
  | 'era_name_required'
  | 'era_order_invalid'
  | 'era_duplicate'
  | 'first_concurrent'
  | 'placement_order_invalid'
  | 'placement_era_missing'
  | 'duplicate_work'
  | 'memo_not_allowed'
  | 'inherited_locked'
  | 'branch_work_required'
  | 'era_not_empty'
  | 'fork_era_in_use';

export interface TimelineIssue {
  code: TimelineIssueCode;
  message: string;
  eraId?: Uuid;
  workId?: Uuid;
}

export type ValidateTimelineResult =
  | { ok: true; args: SaveWorldTimelineArgs }
  | { ok: false; issues: TimelineIssue[] };

const ISSUE_COPY: Record<TimelineIssueCode, string> = {
  era_name_required: TIMELINE_COPY.eraNameRequired,
  era_order_invalid: TIMELINE_COPY.eraOrderInvalid,
  era_duplicate: TIMELINE_COPY.eraOrderInvalid,
  first_concurrent: TIMELINE_COPY.firstConcurrent,
  placement_order_invalid: TIMELINE_COPY.placementOrderInvalid,
  placement_era_missing: TIMELINE_COPY.placementEraMissing,
  duplicate_work: TIMELINE_COPY.duplicateWork,
  memo_not_allowed: TIMELINE_COPY.memoNotAllowed,
  inherited_locked: TIMELINE_COPY.inheritedLocked,
  branch_work_required: TIMELINE_COPY.branchWorkRequired,
  era_not_empty: TIMELINE_COPY.eraNotEmpty,
  fork_era_in_use: TIMELINE_COPY.forkEraInUse,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);
const isIndex = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
function hasExactKeys(v: unknown, keys: readonly string[]): v is Obj {
  return isObj(v) && Object.keys(v).length === keys.length && keys.every((k) => Object.prototype.hasOwnProperty.call(v, k));
}

/** Same normalisation as save_world_timeline: trimmed, empty -> null. */
function optText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function byPosition<T extends { position: number; id: string }>(a: T, b: T): number {
  return a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Era position lookup for ordering placements (unknown eras sort last). */
function eraRank(eras: readonly TimelineDraftEra[]): Map<string, number> {
  return new Map([...eras].sort(byPosition).map((e, i) => [e.id, i]));
}

function sortPlacements(eras: readonly TimelineDraftEra[], placements: readonly TimelineDraftPlacement[]): TimelineDraftPlacement[] {
  const rank = eraRank(eras);
  return [...placements].sort((a, b) =>
    (rank.get(a.eraId) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.eraId) ?? Number.MAX_SAFE_INTEGER)
    || a.orderIndex - b.orderIndex
    || (a.workId < b.workId ? -1 : a.workId > b.workId ? 1 : 0));
}

const placementKey = (p: { eraId: string; workId: string; orderIndex: number; concurrentWithPrev: boolean; relationLabel: string | null }) =>
  JSON.stringify([p.eraId, p.workId, p.orderIndex, p.concurrentWithPrev, optText(p.relationLabel)]);

function isDense(values: number[]): boolean {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.every((v, i) => v === i);
}

// ---------------------------------------------------------------------------
// Draft construction
// ---------------------------------------------------------------------------

/** Builds an editable draft from the stored rows of one branch (deleted rows dropped). */
export function draftFromTimeline(branch: WorldBranch, eras: Era[], placements: EraPlacement[]): TimelineDraft {
  const liveEras = eras
    .filter((e) => e.branchId === branch.id && e.deletedAt === null)
    .sort(byPosition)
    .map<TimelineDraftEra>((e) => ({
      id: e.id, position: e.position, name: e.name, yearLabel: e.yearLabel, memo: e.memo, inherited: e.inherited,
    }));
  const liveIds = new Set(liveEras.map((e) => e.id));
  const draftPlacements = placements
    .filter((p) => p.branchId === branch.id && liveIds.has(p.eraId))
    .map<TimelineDraftPlacement>((p) => ({
      eraId: p.eraId, workId: p.workId, orderIndex: p.orderIndex, concurrentWithPrev: p.concurrentWithPrev, relationLabel: p.relationLabel,
    }));
  return {
    branchId: branch.id,
    branchKind: branch.kind,
    branchWorkId: branch.workId,
    eras: liveEras,
    placements: sortPlacements(liveEras, draftPlacements),
  };
}

// ---------------------------------------------------------------------------
// Validation (mirrors save_world_timeline; the server stays authoritative)
// ---------------------------------------------------------------------------

export function validateTimeline(draft: TimelineDraft, baseline: TimelineBaseline): ValidateTimelineResult {
  const issues: TimelineIssue[] = [];
  const seen = new Set<string>();
  const add = (code: TimelineIssueCode, ref: { eraId?: Uuid; workId?: Uuid } = {}) => {
    const key = `${code}|${ref.eraId ?? ''}|${ref.workId ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    const issue: TimelineIssue = { code, message: ISSUE_COPY[code] };
    if (ref.eraId !== undefined) issue.eraId = ref.eraId;
    if (ref.workId !== undefined) issue.workId = ref.workId;
    issues.push(issue);
  };

  const eras = [...draft.eras].sort(byPosition);
  const draftEraById = new Map(eras.map((e) => [e.id, e]));

  // Stored rows of this branch only.
  const storedEras = baseline.eras.filter((e) => e.branchId === draft.branchId && e.deletedAt === null);
  const storedInherited = storedEras.filter((e) => e.inherited);
  const storedInheritedIds = new Set(storedInherited.map((e) => e.id));
  const lastInherited = storedInherited.reduce((max, e) => Math.max(max, e.position), -1);
  const storedPlacements = baseline.placements.filter((p) => p.branchId === draft.branchId);

  // 1. eras: unique ids, names, dense order
  if (draftEraById.size !== eras.length) add('era_duplicate');
  for (const era of eras) {
    if (!isUuid(era.id)) add('era_order_invalid', { eraId: era.id });
    if (typeof era.name !== 'string' || era.name.trim().length === 0) add('era_name_required', { eraId: era.id });
  }
  if (eras.length === 0 || !eras.every((e) => isIndex(e.position)) || !isDense(eras.map((e) => e.position))) {
    add('era_order_invalid');
  }

  // 2. inherited span: resent exactly, nothing new inside or before it
  for (const stored of storedInherited) {
    const sent = draftEraById.get(stored.id);
    if (!sent || !sent.inherited || sent.position !== stored.position || optText(sent.name) !== optText(stored.name)
        || optText(sent.yearLabel) !== optText(stored.yearLabel) || optText(sent.memo) !== null) {
      add('inherited_locked', { eraId: stored.id });
    }
  }
  for (const era of eras) {
    if (storedInheritedIds.has(era.id)) continue;
    if (era.inherited || era.position <= lastInherited) add('inherited_locked', { eraId: era.id });
  }

  // 3. memo: only on an independent era of a child branch
  for (const era of eras) {
    if (optText(era.memo) === null) continue;
    if (draft.branchKind === 'trunk' || era.inherited || storedInheritedIds.has(era.id)) add('memo_not_allowed', { eraId: era.id });
  }

  // 4. placements: era exists, one row per work, dense order, first never concurrent
  const works = new Set<string>();
  const perEra = new Map<string, TimelineDraftPlacement[]>();
  for (const p of draft.placements) {
    if (!draftEraById.has(p.eraId)) add('placement_era_missing', { eraId: p.eraId, workId: p.workId });
    if (works.has(p.workId)) add('duplicate_work', { workId: p.workId });
    works.add(p.workId);
    const list = perEra.get(p.eraId) ?? [];
    list.push(p);
    perEra.set(p.eraId, list);
  }
  for (const [eraId, list] of [...perEra].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (!list.every((p) => isIndex(p.orderIndex)) || !isDense(list.map((p) => p.orderIndex))) {
      add('placement_order_invalid', { eraId });
    }
    for (const p of list) {
      if (p.orderIndex === 0 && p.concurrentWithPrev) add('first_concurrent', { eraId, workId: p.workId });
    }
  }

  // 5. placements inside the inherited span equal the stored copies exactly
  const storedInheritedPlacements = new Set(storedPlacements.filter((p) => storedInheritedIds.has(p.eraId)).map(placementKey));
  const sentInheritedPlacements = new Set(draft.placements.filter((p) => storedInheritedIds.has(p.eraId)).map(placementKey));
  if (storedInheritedPlacements.size !== sentInheritedPlacements.size
      || [...storedInheritedPlacements].some((k) => !sentInheritedPlacements.has(k))) {
    add('inherited_locked');
  }

  // 6. the branch's own work stays on an independent era
  if (!draft.placements.some((p) => p.workId === draft.branchWorkId && !storedInheritedIds.has(p.eraId) && draftEraById.has(p.eraId))) {
    add('branch_work_required', { workId: draft.branchWorkId });
  }

  // 7. removed independent eras: never a live fork point, never one still holding a stored work
  const forkEras = new Set(baseline.forkEraIds ?? []);
  for (const stored of storedEras) {
    if (stored.inherited || draftEraById.has(stored.id)) continue;
    if (forkEras.has(stored.id)) add('fork_era_in_use', { eraId: stored.id });
    if (storedPlacements.some((p) => p.eraId === stored.id && !works.has(p.workId))) add('era_not_empty', { eraId: stored.id });
  }

  if (issues.length > 0) return { ok: false, issues };

  const p_eras: TimelineEraInput[] = eras.map((e) => ({
    id: e.id, position: e.position, name: e.name.trim(), yearLabel: optText(e.yearLabel), memo: optText(e.memo),
  }));
  const p_placements: TimelinePlacementInput[] = sortPlacements(eras, draft.placements).map((p) => ({
    eraId: p.eraId, workId: p.workId, orderIndex: p.orderIndex, concurrentWithPrev: p.concurrentWithPrev, relationLabel: optText(p.relationLabel),
  }));
  return { ok: true, args: { p_branch_id: draft.branchId, p_eras, p_placements } };
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

export type TimelineFailureReason = 'not_found' | 'no_target' | 'inherited_locked' | 'first_concurrent' | 'era_not_empty' | 'era_name_required' | 'invalid_input' | 'memo_not_allowed';

export interface TransitionFailure {
  ok: false;
  reason: TimelineFailureReason;
  message: string;
}

const REASON_COPY: Record<TimelineFailureReason, string> = {
  not_found: TIMELINE_COPY.notFound,
  no_target: TIMELINE_COPY.noTarget,
  inherited_locked: TIMELINE_COPY.inheritedLocked,
  first_concurrent: TIMELINE_COPY.firstConcurrent,
  era_not_empty: TIMELINE_COPY.eraNotEmpty,
  era_name_required: TIMELINE_COPY.eraNameRequired,
  invalid_input: TIMELINE_COPY.invalidInput,
  memo_not_allowed: TIMELINE_COPY.memoNotAllowed,
};

function refuse(reason: TimelineFailureReason): TransitionFailure {
  return { ok: false, reason, message: REASON_COPY[reason] };
}

/** Buttons send a direction; a drop sends the target era and insertion index. */
export type MoveTarget = 'prevEra' | 'nextEra' | 'up' | 'down' | { eraId: Uuid; index: number };

export type MovePlacementResult =
  | { ok: true; draft: TimelineDraft; released: Uuid[] }
  | TransitionFailure;

function cloneDraft(draft: TimelineDraft): TimelineDraft {
  return {
    ...draft,
    eras: draft.eras.map((e) => ({ ...e })),
    placements: draft.placements.map((p) => ({ ...p })),
  };
}

function eraLists(draft: TimelineDraft): Map<string, TimelineDraftPlacement[]> {
  const lists = new Map<string, TimelineDraftPlacement[]>(draft.eras.map((e) => [e.id, []]));
  for (const p of sortPlacements(draft.eras, draft.placements)) lists.get(p.eraId)?.push(p);
  return lists;
}

/**
 * Moves one work (button or drop, same transition). Order inside the touched eras is re-densified
 * and any "concurrent with previous" link whose previous work changed is released (set to false)
 * and reported, so a concurrent work never lands first.
 */
export function movePlacement(draft: TimelineDraft, input: { workId: Uuid; to: MoveTarget }): MovePlacementResult {
  const current = draft.placements.find((p) => p.workId === input.workId);
  if (!current) return refuse('not_found');
  const eras = [...draft.eras].sort(byPosition);
  const eraIndex = eras.findIndex((e) => e.id === current.eraId);
  if (eraIndex < 0) return refuse('not_found');
  if (eras[eraIndex].inherited) return refuse('inherited_locked');

  const lists = eraLists(draft);
  const source = lists.get(current.eraId) ?? [];
  const fromIndex = source.findIndex((p) => p.workId === input.workId);

  let targetEraId: string;
  let targetIndex: number;
  const to = input.to;
  if (to === 'prevEra' || to === 'nextEra') {
    const target = eras[eraIndex + (to === 'nextEra' ? 1 : -1)];
    if (!target) return refuse('no_target');
    if (target.inherited) return refuse('inherited_locked');
    targetEraId = target.id;
    targetIndex = (lists.get(target.id) ?? []).length;
  } else if (to === 'up' || to === 'down') {
    targetEraId = current.eraId;
    targetIndex = fromIndex + (to === 'down' ? 1 : -1);
    if (targetIndex < 0 || targetIndex >= source.length) return refuse('no_target');
  } else {
    if (!isObj(to) || !isIndex(to.index)) return refuse('no_target');
    const target = eras.find((e) => e.id === to.eraId);
    if (!target) return refuse('no_target');
    if (target.inherited) return refuse('inherited_locked');
    targetEraId = target.id;
    const others = (lists.get(target.id) ?? []).filter((p) => p.workId !== input.workId).length;
    targetIndex = Math.min(to.index, others);
  }

  // Previous neighbour of every work before the move.
  const prevBefore = new Map<string, string | null>();
  for (const list of lists.values()) list.forEach((p, i) => prevBefore.set(p.workId, i > 0 ? list[i - 1].workId : null));

  const next = cloneDraft(draft);
  const nextLists = eraLists(next);
  const moving = nextLists.get(current.eraId)!.find((p) => p.workId === input.workId)!;
  nextLists.set(current.eraId, nextLists.get(current.eraId)!.filter((p) => p.workId !== input.workId));
  const targetList = nextLists.get(targetEraId)!;
  targetList.splice(targetIndex, 0, moving);
  moving.eraId = targetEraId;

  const released: string[] = [];
  const ordered: TimelineDraftPlacement[] = [];
  for (const era of eras) {
    const list = nextLists.get(era.id) ?? [];
    list.forEach((p, i) => {
      p.orderIndex = i;
      const prev = i > 0 ? list[i - 1].workId : null;
      if (p.concurrentWithPrev && (prev === null || prev !== prevBefore.get(p.workId))) {
        p.concurrentWithPrev = false;
        released.push(p.workId);
      }
      ordered.push(p);
    });
  }
  // Placements on eras missing from the draft (invalid drafts) are kept as-is.
  const placedIds = new Set(ordered.map((p) => p.workId));
  next.placements = [...ordered, ...next.placements.filter((p) => !placedIds.has(p.workId))];
  return { ok: true, draft: next, released };
}

export type DraftTransitionResult = { ok: true; draft: TimelineDraft } | TransitionFailure;

/** Toggles "concurrent with previous". The first work of an era can never be concurrent. */
export function setConcurrent(draft: TimelineDraft, workId: Uuid, concurrent: boolean): DraftTransitionResult {
  const current = draft.placements.find((p) => p.workId === workId);
  if (!current) return refuse('not_found');
  const era = draft.eras.find((e) => e.id === current.eraId);
  if (!era) return refuse('not_found');
  if (era.inherited) return refuse('inherited_locked');
  const first = (eraLists(draft).get(era.id) ?? [])[0];
  if (concurrent && first?.workId === workId) return refuse('first_concurrent');
  const next = cloneDraft(draft);
  next.placements = next.placements.map((p) => (p.workId === workId ? { ...p, concurrentWithPrev: concurrent } : p));
  return { ok: true, draft: next };
}

/** Adds an independent era at the end (always after the inherited span). */
export function addEra(
  draft: TimelineDraft,
  input: { id: Uuid; name: string; yearLabel?: string | null; memo?: string | null },
): DraftTransitionResult {
  if (!isUuid(input.id) || draft.eras.some((e) => e.id === input.id)) return refuse('invalid_input');
  if (typeof input.name !== 'string' || input.name.trim().length === 0) return refuse('era_name_required');
  const memo = optText(input.memo);
  if (memo !== null && draft.branchKind === 'trunk') return refuse('memo_not_allowed');
  const next = cloneDraft(draft);
  const position = next.eras.reduce((max, e) => Math.max(max, e.position), -1) + 1;
  next.eras = [...next.eras, { id: input.id, position, name: input.name.trim(), yearLabel: optText(input.yearLabel), memo, inherited: false }];
  return { ok: true, draft: next };
}

/** Removes an empty independent era and re-densifies positions. */
export function removeEra(draft: TimelineDraft, eraId: Uuid): DraftTransitionResult {
  const era = draft.eras.find((e) => e.id === eraId);
  if (!era) return refuse('not_found');
  if (era.inherited) return refuse('inherited_locked');
  if (draft.placements.some((p) => p.eraId === eraId)) return refuse('era_not_empty');
  const next = cloneDraft(draft);
  next.eras = next.eras
    .filter((e) => e.id !== eraId)
    .sort(byPosition)
    .map((e, i) => ({ ...e, position: i }));
  return { ok: true, draft: next };
}

// ---------------------------------------------------------------------------
// Server wrappers (save_world_timeline / ensure_world_tree)
// ---------------------------------------------------------------------------

export type TimelineErrorCode =
  | 'invalid_input'
  | 'invalid_timeline'
  | 'forbidden'
  | WriteDenialCode
  | 'inherited_locked'
  | 'first_concurrent'
  | 'memo_not_allowed'
  | 'duplicate_work'
  | 'era_not_empty'
  | 'fork_era_in_use'
  | 'era_name_required'
  | 'order_invalid'
  | 'era_invalid'
  | 'branch_work_required'
  | 'work_not_placeable'
  | 'unavailable';

export interface TimelineFailure {
  ok: false;
  code: TimelineErrorCode;
  error: string;
  retryable: boolean;
  /** invalid_timeline only: the client-side issues that stopped the save. */
  issues?: TimelineIssue[];
}

export type SaveTimelineResult =
  | { ok: true; message: string; branchId: Uuid; eras: { id: Uuid; position: number }[]; placementCount: number }
  | TimelineFailure;

export type EnsureWorldTreeResult =
  | { ok: true; branchId: Uuid; rootWorkId: Uuid; created: boolean }
  | TimelineFailure;

function fail(code: TimelineErrorCode, error: string, retryable = false): TimelineFailure {
  return { ok: false, code, error, retryable };
}

type DbError = { message?: string | null; code?: string | null };
type RpcOutcome = { data: unknown; error: DbError | null };

async function callRpc(supabase: SupabaseClient, fn: string, args: object): Promise<RpcOutcome> {
  try {
    const response = await supabase.rpc(fn, args);
    return { data: response.data, error: (response.error as DbError | null) ?? null };
  } catch {
    return { data: null, error: { message: 'network_error', code: 'network' } };
  }
}

const RETRYABLE_SQLSTATES = new Set(['40001', '40P01', '55P03', '57014', 'network']);

const DB_RULES: Array<[string, TimelineErrorCode, string]> = [
  ['world_timeline_inherited_locked', 'inherited_locked', TIMELINE_COPY.inheritedLocked],
  ['world_timeline_first_concurrent', 'first_concurrent', TIMELINE_COPY.firstConcurrent],
  ['world_timeline_memo_not_allowed', 'memo_not_allowed', TIMELINE_COPY.memoNotAllowed],
  ['world_timeline_duplicate_work', 'duplicate_work', TIMELINE_COPY.duplicateWork],
  ['world_timeline_era_not_empty', 'era_not_empty', TIMELINE_COPY.eraNotEmpty],
  ['world_timeline_fork_era_in_use', 'fork_era_in_use', TIMELINE_COPY.forkEraInUse],
  ['world_timeline_era_name_required', 'era_name_required', TIMELINE_COPY.eraNameRequired],
  ['world_timeline_order_invalid', 'order_invalid', TIMELINE_COPY.eraOrderInvalid],
  ['world_timeline_era_invalid', 'era_invalid', TIMELINE_COPY.placementEraMissing],
  ['world_timeline_branch_work_required', 'branch_work_required', TIMELINE_COPY.branchWorkRequired],
  ['world_timeline_work_not_placeable', 'work_not_placeable', TIMELINE_COPY.workNotPlaceable],
  ['world_timeline_placement_invalid', 'invalid_input', TIMELINE_COPY.invalidInput],
  ['world_timeline_input_invalid', 'invalid_input', TIMELINE_COPY.invalidInput],
  ['world_tree_cross_world', 'forbidden', TIMELINE_COPY.forbidden],
  ['world_tree_forbidden', 'forbidden', TIMELINE_COPY.forbidden],
  ['authentication_required', 'forbidden', TIMELINE_COPY.forbidden],
  ['writer_required', 'forbidden', TIMELINE_COPY.forbidden],
];

/** Maps a DB error to a typed failure. Unknown errors are treated as transient. */
function mapDbError(error: DbError): TimelineFailure {
  const message = error.message ?? '';
  if (error.code && RETRYABLE_SQLSTATES.has(error.code)) return fail('unavailable', TIMELINE_COPY.unavailable, true);
  if (isWriteAccessDbError(message)) return fail('write_suspended', WRITE_SUSPENDED_MESSAGE);
  for (const [token, code, copy] of DB_RULES) {
    if (message.includes(token)) return fail(code, copy);
  }
  return fail('unavailable', TIMELINE_COPY.unavailable, true);
}

async function writeGate(supabase: SupabaseClient, ownerId: string): Promise<TimelineFailure | null> {
  const access = await checkWriteAccess(supabase, ownerId);
  if (access.ok) return null;
  return fail(access.code, access.error, access.code === 'write_unavailable');
}

function parseSaveResult(data: unknown, args: SaveWorldTimelineArgs): { eras: { id: Uuid; position: number }[]; placementCount: number } | null {
  if (!hasExactKeys(data, ['branch_id', 'eras', 'placementCount'])) return null;
  if (data.branch_id !== args.p_branch_id || !isIndex(data.placementCount) || !Array.isArray(data.eras)) return null;
  if (data.placementCount !== args.p_placements.length || data.eras.length !== args.p_eras.length) return null;
  const eras: { id: Uuid; position: number }[] = [];
  for (let i = 0; i < data.eras.length; i += 1) {
    const era: unknown = data.eras[i];
    if (!hasExactKeys(era, ['id', 'position']) || !isUuid(era.id) || !isIndex(era.position)) return null;
    if (era.id !== args.p_eras[i].id || era.position !== args.p_eras[i].position) return null;
    eras.push({ id: era.id, position: era.position });
  }
  return { eras, placementCount: data.placementCount };
}

/**
 * Saves one branch timeline through save_world_timeline only. The RPC is never called for an
 * invalid draft, a malformed owner id or a writer blocked by the write gate. Success is reported
 * only for a well-formed RPC result that matches the payload that was sent.
 */
export async function saveTimeline(
  supabase: SupabaseClient,
  input: { ownerId: string; draft: TimelineDraft; baseline: TimelineBaseline },
): Promise<SaveTimelineResult> {
  if (!isUuid(input.ownerId) || !isObj(input.draft) || !isUuid(input.draft.branchId)) {
    return fail('invalid_input', TIMELINE_COPY.invalidInput);
  }
  const checked = validateTimeline(input.draft, input.baseline);
  if (!checked.ok) return { ...fail('invalid_timeline', TIMELINE_COPY.invalidTimeline), issues: checked.issues };

  const denied = await writeGate(supabase, input.ownerId);
  if (denied) return denied;

  const { data, error } = await callRpc(supabase, 'save_world_timeline', checked.args);
  if (error) return mapDbError(error);
  const saved = parseSaveResult(data, checked.args);
  if (!saved) return fail('unavailable', TIMELINE_COPY.unavailable, true);
  return { ok: true, message: TIMELINE_COPY.saved, branchId: checked.args.p_branch_id, ...saved };
}

/** Creates (idempotently) the trunk, first era and original placement for an owned work. */
export async function ensureWorldTree(
  supabase: SupabaseClient,
  input: { ownerId: string; workId: string },
): Promise<EnsureWorldTreeResult> {
  if (!isUuid(input.ownerId) || !isUuid(input.workId)) return fail('invalid_input', TIMELINE_COPY.invalidInput);

  const denied = await writeGate(supabase, input.ownerId);
  if (denied) return denied;

  const { data, error } = await callRpc(supabase, 'ensure_world_tree', { p_work_id: input.workId });
  if (error) return mapDbError(error);
  if (!hasExactKeys(data, ['branch_id', 'root_work_id', 'created']) || !isUuid(data.branch_id)
      || !isUuid(data.root_work_id) || typeof data.created !== 'boolean') {
    return fail('unavailable', TIMELINE_COPY.unavailable, true);
  }
  return { ok: true, branchId: data.branch_id, rootWorkId: data.root_work_id, created: data.created };
}
