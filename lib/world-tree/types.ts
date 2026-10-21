/**
 * Phase 18 world-tree data contracts (owned by 18-01; later plans import only).
 *
 * Layers:
 *  - DB row shapes (owner/admin side, real UUIDs as string) mirroring
 *    supabase/migrations/0032_world_tree_schema.sql.
 *  - Owner/admin DTOs: real IDs and unpublished meta, never setting content/source refs.
 *  - Reader DTOs: ReaderWorkNode | BrokenBranchStub discriminated union keyed by per-response
 *    opaque keys (n0, n1, ...). No DB UUID hash/encryption/alias is ever used as a key.
 *  - RPC argument/result contracts for 0033~0036, and fail-closed parsers: any abnormal
 *    response closes as `{ status: 'unavailable' }` (tree) or `null` (eligibility).
 *
 * Visibility is the work's own publish state only (rule 8 revised / WTREE-07): a work is
 * published while it has >= 1 live published chapter. There is no per-connection toggle.
 * WTREE-09 (pre-fork document locks follow the child reader's progress when the parent is
 * private) is out of scope here — no progress/lock contract is defined.
 */
import type { KbCategory } from '@/lib/kb/categories';

export type Uuid = string;

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const BRANCH_KINDS = ['trunk', 'if', 'expand'] as const;
export type BranchKind = (typeof BRANCH_KINDS)[number];
/** Kinds a writer can start from an existing work (the trunk is created implicitly). */
export type ChildBranchKind = Exclude<BranchKind, 'trunk'>;

export const BRANCH_STATUSES = ['draft', 'confirmed'] as const;
export type BranchStatus = (typeof BRANCH_STATUSES)[number];

export const BRANCH_DOC_CHANGE_KINDS = ['unchanged', 'added', 'modified', 'deleted'] as const;
export type BranchDocChangeKind = (typeof BRANCH_DOC_CHANGE_KINDS)[number];

/** Setting categories that count for diffs (template/folders/chapters never count). */
export type WorldSettingCategory = KbCategory;

// ---------------------------------------------------------------------------
// DB rows (owner/admin side)
// ---------------------------------------------------------------------------

/** world_branches row. The root is a `trunk` row whose workId === rootWorkId. */
export interface WorldBranch {
  id: Uuid;
  rootWorkId: Uuid;
  workId: Uuid;
  ownerId: Uuid;
  parentBranchId: Uuid | null;
  kind: BranchKind;
  status: BranchStatus;
  forkEraId: Uuid | null;
  confirmedAt: string | null;
  deletedAt: string | null;
}

/** Owner draft DTO (studio only). Carries no setting content and no source node refs. */
export interface BranchDraft {
  branchId: Uuid;
  draftWorkId: Uuid;
  sourceWorkId: Uuid;
  rootWorkId: Uuid;
  kind: ChildBranchKind;
  status: 'draft';
  forkEraId: Uuid | null;
  requestId: Uuid;
  createdAt: string;
}

/** world_eras row. inherited=true rows are copies of the parent's eras before the fork. */
export interface Era {
  id: Uuid;
  branchId: Uuid;
  sourceEraId: Uuid | null;
  position: number;
  name: string;
  yearLabel: string | null;
  memo: string | null;
  inherited: boolean;
  deletedAt: string | null;
}

/** world_era_placements row. One branch line may hold several fruits (works). */
export interface EraPlacement {
  id: Uuid;
  branchId: Uuid;
  eraId: Uuid;
  workId: Uuid;
  orderIndex: number;
  concurrentWithPrev: boolean;
  relationLabel: string | null;
}

/** world_branch_notices row: minimal source-changed notice (no global notification centre). */
export interface BranchNotice {
  id: Uuid;
  sourceWorkId: Uuid;
  branchId: Uuid;
  eventKey: string;
  createdAt: string;
  readAt: string | null;
}

export interface BranchDiffCounts {
  added: number;
  modified: number;
  deleted: number;
}

/** Owner-only diff entry: names are visible to the owner, setting content never is. */
export interface BranchDiffEntry {
  draftNodeId: Uuid | null;
  sourceNodeId: Uuid | null;
  name: string;
  category: WorldSettingCategory;
  changeKind: Exclude<BranchDocChangeKind, 'unchanged'>;
}

/** Server-recomputed diff (baseline vs draft). Clients never send counts. */
export interface BranchDiff {
  counts: BranchDiffCounts;
  entries: BranchDiffEntry[];
}

export function totalDiffCount(diff: Pick<BranchDiff, 'counts'>): number {
  return diff.counts.added + diff.counts.modified + diff.counts.deleted;
}

// ---------------------------------------------------------------------------
// Eligibility (WORLD-TREE rule 22). Threshold VALUES are owned by 18-13.
// ---------------------------------------------------------------------------

export type EligibilityCategory = Extract<KbCategory, '인물' | '장소' | '사건'>;
export const ELIGIBILITY_CATEGORIES: readonly EligibilityCategory[] = ['인물', '장소', '사건'];

export const ELIGIBILITY_UNMET_REASONS = [
  'parent_not_visible',
  'published_chapters_insufficient',
  'qualifying_documents_insufficient',
  'character_documents_insufficient',
  'place_documents_insufficient',
  'event_documents_insufficient',
] as const;
export type EligibilityUnmetReason = (typeof ELIGIBILITY_UNMET_REASONS)[number];

export interface BranchEligibilityThresholds {
  minPublishedChapters: number;
  minDocumentChars: number;
  minQualifyingDocuments: number;
  minCategoryDocuments: Record<EligibilityCategory, number>;
}

/**
 * isPublished = the work has >= 1 live published chapter.
 * readerVisible = world_work_reader_visible(source) (18-14): false for deleted, branch draft,
 * no published chapter, admin blind / access rule. A blinded parent is isPublished=true but
 * readerVisible=false. When readerVisible=false the evaluation short-circuits:
 * eligible=false, unmetReasons=['parent_not_visible'], all counts 0 (= "not aggregated",
 * the UI must not render them as shortfalls). Owner/admin full view never bypasses this.
 */
export interface BranchEligibilitySummary {
  eligible: boolean;
  isPublished: boolean;
  readerVisible: boolean;
  publishedChapterCount: number;
  qualifyingDocumentCount: number;
  categoryCounts: Record<EligibilityCategory, number>;
  thresholds: BranchEligibilityThresholds;
  unmetReasons: EligibilityUnmetReason[];
}

// ---------------------------------------------------------------------------
// Fruit metrics (WTREE-08 temporary adapter input — raw only, computed elsewhere)
// ---------------------------------------------------------------------------

export interface FruitMetricRaw {
  totalViews: number;
  likeCount: number;
  ctr: number;
}

// ---------------------------------------------------------------------------
// Reader projection
// ---------------------------------------------------------------------------

/** Reader-visible era on one visible work line. eraKey is per-response opaque (e0, e1, ...). */
export interface ReaderEra {
  eraKey: string;
  nodeKey: string;
  position: number;
  name: string;
  yearLabel: string | null;
  inherited: boolean;
}

export interface ReaderPlacement {
  eraKey: string;
  orderIndex: number;
  concurrentWithPrev: boolean;
}

/** A published work in the reader tree. */
export interface ReaderWorkNode {
  nodeType: 'work';
  nodeKey: string;
  parentNodeKey: string | null;
  workId: Uuid;
  title: string;
  kind: BranchKind;
  placement: ReaderPlacement | null;
  /** Setting change count for the branch (null for the trunk). Never document names. */
  diffCount: number | null;
  metrics: FruitMetricRaw;
}

/**
 * Broken branch (rule 23): a private parent shown only as "a work was here". No work/branch/
 * parent/root id, title, cover, chapters, metrics, documents, source refs or original era.
 */
export interface BrokenBranchStub {
  nodeType: 'broken';
  nodeKey: string;
  parentNodeKey: string | null;
  /** Normalised placement order derived from visible children and tree links only. */
  positionHint: number;
}

export type ReaderTreeNode = ReaderWorkNode | BrokenBranchStub;

export interface ReaderWorldTreeProjection {
  status: 'ok';
  audience: 'reader';
  /** Requested published work title or "세계수" — never a private root title. */
  header: { title: string };
  focusNodeKey: string;
  eras: ReaderEra[];
  nodes: ReaderTreeNode[];
}

/** Owner/admin node: real IDs and unpublished meta, still no setting content. */
export interface OwnerTreeNode {
  branchId: Uuid;
  workId: Uuid;
  parentBranchId: Uuid | null;
  title: string;
  kind: BranchKind;
  status: BranchStatus;
  isPublished: boolean;
  readerVisible: boolean;
  forkEraId: Uuid | null;
  diffCount: number | null;
  metrics: FruitMetricRaw;
}

export interface OwnerWorldTreeProjection {
  status: 'ok';
  audience: 'owner' | 'admin';
  header: { title: string };
  focusWorkId: Uuid;
  rootWorkId: Uuid;
  branches: OwnerTreeNode[];
  eras: Era[];
  placements: EraPlacement[];
}

export type WorldTreeProjection = ReaderWorldTreeProjection | OwnerWorldTreeProjection;
export interface WorldTreeUnavailable {
  status: 'unavailable';
}
export type WorldTreeResponse = WorldTreeProjection | WorldTreeUnavailable;

export const WORLD_TREE_UNAVAILABLE: WorldTreeUnavailable = Object.freeze({ status: 'unavailable' }) as WorldTreeUnavailable;

// ---------------------------------------------------------------------------
// Layout (built by 18-06 buildWorldTreeLayout from a projection)
// ---------------------------------------------------------------------------

export interface WorldTreeLayoutNode {
  nodeKey: string;
  nodeType: ReaderTreeNode['nodeType'];
  x: number;
  y: number;
}

export interface WorldTreeLayoutPath {
  fromKey: string;
  toKey: string;
  d: string;
  broken: boolean;
}

export interface WorldTreeLayout {
  extent: { width: number; height: number };
  nodes: WorldTreeLayoutNode[];
  paths: WorldTreeLayoutPath[];
  /** Deterministic list-view order (era order -> placement order -> key). */
  listOrder: string[];
}

// ---------------------------------------------------------------------------
// RPC contracts (new, implemented by 0033~0036). Inputs never carry visibility choices,
// client counts, eligibility or thresholds.
// ---------------------------------------------------------------------------

export interface BeginWorldBranchArgs {
  p_source_work_id: Uuid;
  p_kind: ChildBranchKind;
  p_fork_era_id: Uuid | null;
  p_request_id: Uuid;
}
export interface BeginWorldBranchResult {
  draft_work_id: Uuid;
}

export interface GetWorldBranchDiffArgs {
  p_draft_work_id: Uuid;
}
export type GetWorldBranchDiffResult = BranchDiff;

export interface ConfirmWorldBranchArgs {
  p_draft_work_id: Uuid;
  p_title: string;
  p_era_id: Uuid | null;
}
export interface ConfirmWorldBranchResult {
  work_id: Uuid;
  branch_id: Uuid;
}

export interface SoftDeleteWorldBranchArgs {
  p_branch_id: Uuid;
}

export interface GetWorldBranchEligibilityArgs {
  p_source_work_id: Uuid;
}
export type GetWorldBranchEligibilityResult = BranchEligibilitySummary;

export interface GetWorldTreeArgs {
  p_work_id: Uuid;
  p_reader_preview?: boolean;
}
export type GetWorldTreeResult = WorldTreeResponse;

export interface TimelineEraInput {
  id: Uuid | null;
  position: number;
  name: string;
  yearLabel: string | null;
  memo: string | null;
}
export interface TimelinePlacementInput {
  eraId: Uuid;
  workId: Uuid;
  orderIndex: number;
  concurrentWithPrev: boolean;
  relationLabel: string | null;
}
export interface SaveWorldTimelineArgs {
  p_branch_id: Uuid;
  p_eras: TimelineEraInput[];
  p_placements: TimelinePlacementInput[];
}

export interface MarkBranchNoticeReadArgs {
  p_notice_id: Uuid;
}

// ---------------------------------------------------------------------------
// Field whitelists
// ---------------------------------------------------------------------------

export const READER_WORK_NODE_FIELDS = [
  'nodeType', 'nodeKey', 'parentNodeKey', 'workId', 'title', 'kind', 'placement', 'diffCount', 'metrics',
] as const satisfies readonly (keyof ReaderWorkNode)[];

export const BROKEN_BRANCH_STUB_FIELDS = [
  'nodeType', 'nodeKey', 'parentNodeKey', 'positionHint',
] as const satisfies readonly (keyof BrokenBranchStub)[];

/** Keys that must never appear anywhere in a reader payload. */
export const READER_FORBIDDEN_FIELDS = [
  'content', 'documentName', 'sourceNodeId', 'source_node_id', 'branchId', 'parentId',
  'parentBranchId', 'rootWorkId', 'ownerId', 'cover', 'coverImageUrl', 'chapters', 'memo',
] as const;

const READER_PROJECTION_FIELDS = ['status', 'audience', 'header', 'focusNodeKey', 'eras', 'nodes'] as const;
const READER_ERA_FIELDS = ['eraKey', 'nodeKey', 'position', 'name', 'yearLabel', 'inherited'] as const;
const READER_PLACEMENT_FIELDS = ['eraKey', 'orderIndex', 'concurrentWithPrev'] as const;
const METRIC_FIELDS = ['totalViews', 'likeCount', 'ctr'] as const;
const OWNER_PROJECTION_FIELDS = ['status', 'audience', 'header', 'focusWorkId', 'rootWorkId', 'branches', 'eras', 'placements'] as const;
const OWNER_NODE_FIELDS = [
  'branchId', 'workId', 'parentBranchId', 'title', 'kind', 'status', 'isPublished', 'readerVisible', 'forkEraId', 'diffCount', 'metrics',
] as const satisfies readonly (keyof OwnerTreeNode)[];
const ERA_FIELDS = ['id', 'branchId', 'sourceEraId', 'position', 'name', 'yearLabel', 'memo', 'inherited', 'deletedAt'] as const satisfies readonly (keyof Era)[];
const PLACEMENT_FIELDS = ['id', 'branchId', 'eraId', 'workId', 'orderIndex', 'concurrentWithPrev', 'relationLabel'] as const satisfies readonly (keyof EraPlacement)[];
const ELIGIBILITY_FIELDS = [
  'eligible', 'isPublished', 'readerVisible', 'publishedChapterCount', 'qualifyingDocumentCount', 'categoryCounts', 'thresholds', 'unmetReasons',
] as const satisfies readonly (keyof BranchEligibilitySummary)[];
const THRESHOLD_FIELDS = ['minPublishedChapters', 'minDocumentChars', 'minQualifyingDocuments', 'minCategoryDocuments'] as const;

// ---------------------------------------------------------------------------
// Fail-closed parsers
// ---------------------------------------------------------------------------

const NODE_KEY = /^n\d+$/;
const ERA_KEY = /^e\d+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function hasExactKeys(value: unknown, keys: readonly string[]): value is Obj {
  if (!isObj(value)) return false;
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}
const isNonNegInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isNonNegNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isNullableText = (v: unknown) => v === null || typeof v === 'string';
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const isNullableUuid = (v: unknown) => v === null || isUuid(v);
const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);

function isMetrics(v: unknown): boolean {
  return hasExactKeys(v, METRIC_FIELDS) && METRIC_FIELDS.every((key) => isNonNegNum(v[key]));
}
function isHeader(v: unknown): boolean {
  return hasExactKeys(v, ['title']) && isText(v.title);
}

/** Every parent link resolves inside `keys` and following links never loops. */
function isAcyclicForest(links: Map<string, string | null>): boolean {
  for (const [key, parent] of links) {
    if (parent !== null && !links.has(parent)) return false;
    const seen = new Set<string>([key]);
    let cursor = parent;
    while (cursor !== null) {
      if (seen.has(cursor)) return false;
      seen.add(cursor);
      cursor = links.get(cursor) ?? null;
    }
  }
  return true;
}

function isReaderProjection(raw: Obj): boolean {
  if (!hasExactKeys(raw, READER_PROJECTION_FIELDS) || !isHeader(raw.header)) return false;
  if (!Array.isArray(raw.nodes) || !Array.isArray(raw.eras) || raw.nodes.length === 0) return false;

  const links = new Map<string, string | null>();
  const workKeys = new Set<string>();
  for (const node of raw.nodes) {
    if (!isObj(node) || !NODE_KEY.test(String(node.nodeKey))) return false;
    if (node.parentNodeKey !== null && !NODE_KEY.test(String(node.parentNodeKey))) return false;
    if (links.has(node.nodeKey as string)) return false;
    if (node.nodeType === 'broken') {
      if (!hasExactKeys(node, BROKEN_BRANCH_STUB_FIELDS) || !isNonNegInt(node.positionHint)) return false;
    } else if (node.nodeType === 'work') {
      if (!hasExactKeys(node, READER_WORK_NODE_FIELDS)) return false;
      if (!isUuid(node.workId) || !isText(node.title) || !isOneOf(BRANCH_KINDS, node.kind)) return false;
      if (!(node.diffCount === null || isNonNegInt(node.diffCount)) || !isMetrics(node.metrics)) return false;
      workKeys.add(node.nodeKey as string);
    } else {
      return false;
    }
    links.set(node.nodeKey as string, node.parentNodeKey as string | null);
  }
  if (!isAcyclicForest(links) || !workKeys.has(raw.focusNodeKey as string)) return false;

  const eraKeys = new Set<string>();
  for (const era of raw.eras) {
    if (!hasExactKeys(era, READER_ERA_FIELDS) || !ERA_KEY.test(String(era.eraKey)) || eraKeys.has(era.eraKey as string)) return false;
    // Eras belong to visible work lines only; a stub never exposes its own timeline.
    if (!workKeys.has(era.nodeKey as string)) return false;
    if (!isNonNegInt(era.position) || !isText(era.name) || !isNullableText(era.yearLabel) || typeof era.inherited !== 'boolean') return false;
    eraKeys.add(era.eraKey as string);
  }
  for (const node of raw.nodes as Obj[]) {
    if (node.nodeType !== 'work' || node.placement === null) continue;
    const p = node.placement;
    if (!hasExactKeys(p, READER_PLACEMENT_FIELDS) || !eraKeys.has(p.eraKey as string)) return false;
    if (!isNonNegInt(p.orderIndex) || typeof p.concurrentWithPrev !== 'boolean') return false;
  }
  return true;
}

function isOwnerProjection(raw: Obj): boolean {
  if (!hasExactKeys(raw, OWNER_PROJECTION_FIELDS) || !isHeader(raw.header)) return false;
  if (!isUuid(raw.focusWorkId) || !isUuid(raw.rootWorkId)) return false;
  if (!Array.isArray(raw.branches) || !Array.isArray(raw.eras) || !Array.isArray(raw.placements)) return false;
  for (const b of raw.branches) {
    if (!hasExactKeys(b, OWNER_NODE_FIELDS)) return false;
    if (!isUuid(b.branchId) || !isUuid(b.workId) || !isNullableUuid(b.parentBranchId) || !isNullableUuid(b.forkEraId)) return false;
    if (!isText(b.title) || !isOneOf(BRANCH_KINDS, b.kind) || !isOneOf(BRANCH_STATUSES, b.status)) return false;
    if (typeof b.isPublished !== 'boolean' || typeof b.readerVisible !== 'boolean') return false;
    if (!(b.diffCount === null || isNonNegInt(b.diffCount)) || !isMetrics(b.metrics)) return false;
  }
  for (const e of raw.eras) {
    if (!hasExactKeys(e, ERA_FIELDS) || !isUuid(e.id) || !isUuid(e.branchId) || !isNullableUuid(e.sourceEraId)) return false;
    if (!isNonNegInt(e.position) || !isText(e.name) || !isNullableText(e.yearLabel) || !isNullableText(e.memo)) return false;
    if (typeof e.inherited !== 'boolean' || !isNullableText(e.deletedAt)) return false;
  }
  for (const p of raw.placements) {
    if (!hasExactKeys(p, PLACEMENT_FIELDS) || !isUuid(p.id) || !isUuid(p.branchId) || !isUuid(p.eraId) || !isUuid(p.workId)) return false;
    if (!isNonNegInt(p.orderIndex) || typeof p.concurrentWithPrev !== 'boolean' || !isNullableText(p.relationLabel)) return false;
  }
  return true;
}

/** Validates a get_world_tree payload. Anything unexpected closes as unavailable. */
export function parseWorldTreeResponse(raw: unknown): WorldTreeResponse {
  if (!isObj(raw)) return WORLD_TREE_UNAVAILABLE;
  if (raw.status === 'unavailable' && hasExactKeys(raw, ['status'])) return WORLD_TREE_UNAVAILABLE;
  if (raw.status !== 'ok') return WORLD_TREE_UNAVAILABLE;
  if (raw.audience === 'reader') return isReaderProjection(raw) ? (raw as unknown as ReaderWorldTreeProjection) : WORLD_TREE_UNAVAILABLE;
  if (raw.audience === 'owner' || raw.audience === 'admin') {
    return isOwnerProjection(raw) ? (raw as unknown as OwnerWorldTreeProjection) : WORLD_TREE_UNAVAILABLE;
  }
  return WORLD_TREE_UNAVAILABLE;
}

export function isBrokenBranchStub(node: ReaderTreeNode): node is BrokenBranchStub {
  return node.nodeType === 'broken';
}

function isCategoryCounts(v: unknown): v is Record<EligibilityCategory, number> {
  return hasExactKeys(v, ELIGIBILITY_CATEGORIES) && ELIGIBILITY_CATEGORIES.every((c) => isNonNegInt(v[c]));
}

/**
 * Validates a get_world_branch_eligibility payload and its invariants. Returns null for any
 * malformed or self-contradicting summary (callers treat that as an error, never as eligible).
 */
export function parseBranchEligibilitySummary(raw: unknown): BranchEligibilitySummary | null {
  if (!hasExactKeys(raw, ELIGIBILITY_FIELDS)) return null;
  const { eligible, isPublished, readerVisible, publishedChapterCount, qualifyingDocumentCount, categoryCounts, thresholds, unmetReasons } = raw;
  if (typeof eligible !== 'boolean' || typeof isPublished !== 'boolean' || typeof readerVisible !== 'boolean') return null;
  if (!isNonNegInt(publishedChapterCount) || !isNonNegInt(qualifyingDocumentCount) || !isCategoryCounts(categoryCounts)) return null;
  if (!hasExactKeys(thresholds, THRESHOLD_FIELDS)) return null;
  if (!isNonNegInt(thresholds.minPublishedChapters) || !isNonNegInt(thresholds.minDocumentChars)) return null;
  if (!isNonNegInt(thresholds.minQualifyingDocuments) || !isCategoryCounts(thresholds.minCategoryDocuments)) return null;
  if (!Array.isArray(unmetReasons) || !unmetReasons.every((r) => isOneOf(ELIGIBILITY_UNMET_REASONS, r))) return null;
  if (new Set(unmetReasons).size !== unmetReasons.length) return null;

  // readerVisible implies published (no live published chapter -> not reader-visible).
  if (readerVisible && !isPublished) return null;
  if (!readerVisible) {
    const notAggregated =
      publishedChapterCount === 0 && qualifyingDocumentCount === 0 && ELIGIBILITY_CATEGORIES.every((c) => categoryCounts[c] === 0);
    if (eligible || !notAggregated || unmetReasons.length !== 1 || unmetReasons[0] !== 'parent_not_visible') return null;
  } else {
    if (unmetReasons.includes('parent_not_visible')) return null;
    if (eligible !== (unmetReasons.length === 0)) return null;
  }
  return raw as unknown as BranchEligibilitySummary;
}
