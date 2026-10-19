import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BRANCH_KINDS,
  BRANCH_STATUSES,
  parseWorldTreeResponse,
  type GetWorldTreeArgs,
  type OwnerWorldTreeProjection,
  type ReaderWorldTreeProjection,
} from '@/lib/world-tree/types';

/**
 * World-tree read queries (18-04, WTREE-06/07/08/10). Strict domain wrappers over the 0036 RPCs
 * get_world_tree(p_work_id, p_reader_preview) and get_world_tree_metric_baseline().
 *
 * - Callers pass the request's normal session client (anon or signed-in). The audience is decided
 *   by the database from auth.uid(); this module never uses the service-role client and never
 *   builds a reader view out of an owner payload.
 * - mode = reader | owner | admin comes from the server answer and is checked against the
 *   request: a reader preview must come back as a reader projection.
 * - Reader payloads are validated by strict zod schemas (ReaderWorkNode / BrokenBranchStub
 *   whitelists) plus whole-response checks: parent links inside the response, no cycles, focus on
 *   a published work, eras only on visible work lines, header = a visible work title or "세계수",
 *   and no UUID anywhere except the workId of a visible work. Anything else closes as a typed
 *   failure, never as an empty or partially cleaned tree.
 * - Per-response node keys (n0, n1, ...) are returned as they are. They are never mapped back to
 *   DB ids and never cached here.
 * - An RPC/network error is a retryable failure; `unavailable` (not public / not found) is a
 *   normal answer the page renders as such.
 */

export const WORLD_TREE_QUERY_COPY = Object.freeze({
  invalidInput: '작품 정보를 다시 확인해 주세요.',
  unavailable: '세계수를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
  invalidResponse: '세계수를 표시할 수 없어요.',
  baselineUnavailable: '열매 크기 기준을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
});

export const WORLD_TREE_FALLBACK_TITLE = '세계수';

export type WorldTreeQueryErrorCode = 'invalid_input' | 'rpc_failed' | 'invalid_response';

export interface WorldTreeQueryFailure {
  ok: false;
  code: WorldTreeQueryErrorCode;
  retryable: boolean;
  error: string;
}

export type WorldTreeQueryResult =
  | { ok: true; status: 'ok'; mode: 'reader'; projection: ReaderWorldTreeProjection }
  | { ok: true; status: 'ok'; mode: 'owner' | 'admin'; projection: OwnerWorldTreeProjection }
  | { ok: true; status: 'unavailable' }
  | WorldTreeQueryFailure;

export interface WorldTreeMetricBaseline {
  maxTotalViews: number;
  maxLikeCount: number;
  /** Signed-in author opens are excluded from this time on; earlier counts stay mixed. */
  authorViewsExcludedSince: string;
}

export type WorldTreeMetricBaselineResult = { ok: true; baseline: WorldTreeMetricBaseline } | WorldTreeQueryFailure;

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_ANYWHERE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const uuid = z.string().regex(UUID_RE);
const nodeKey = z.string().regex(/^n\d+$/);
const eraKey = z.string().regex(/^e\d+$/);
const count = z.number().int().nonnegative();
const nonNeg = z.number().nonnegative();
const text = z.string().refine((v) => v.trim().length > 0);

const metrics = z.strictObject({ totalViews: nonNeg, likeCount: nonNeg, ctr: nonNeg });
const header = z.strictObject({ title: text });

const readerPlacement = z.strictObject({ eraKey, orderIndex: count, concurrentWithPrev: z.boolean() });

const readerWorkNode = z.strictObject({
  nodeType: z.literal('work'),
  nodeKey,
  parentNodeKey: nodeKey.nullable(),
  workId: uuid,
  title: text,
  kind: z.enum(BRANCH_KINDS),
  placement: readerPlacement.nullable(),
  diffCount: count.nullable(),
  metrics,
});

const brokenBranchStub = z.strictObject({
  nodeType: z.literal('broken'),
  nodeKey,
  parentNodeKey: nodeKey.nullable(),
  positionHint: count,
});

const readerEra = z.strictObject({
  eraKey,
  nodeKey,
  position: count,
  name: text,
  yearLabel: z.string().nullable(),
  inherited: z.boolean(),
});

const readerProjection = z.strictObject({
  status: z.literal('ok'),
  audience: z.literal('reader'),
  header,
  focusNodeKey: nodeKey,
  eras: z.array(readerEra),
  nodes: z.array(z.discriminatedUnion('nodeType', [readerWorkNode, brokenBranchStub])).min(1),
});

const ownerNode = z.strictObject({
  branchId: uuid,
  workId: uuid,
  parentBranchId: uuid.nullable(),
  title: text,
  kind: z.enum(BRANCH_KINDS),
  status: z.enum(BRANCH_STATUSES),
  isPublished: z.boolean(),
  readerVisible: z.boolean(),
  forkEraId: uuid.nullable(),
  diffCount: count.nullable(),
  metrics,
});

const ownerEra = z.strictObject({
  id: uuid,
  branchId: uuid,
  sourceEraId: uuid.nullable(),
  position: count,
  name: text,
  yearLabel: z.string().nullable(),
  memo: z.string().nullable(),
  inherited: z.boolean(),
  deletedAt: z.string().nullable(),
});

const ownerPlacement = z.strictObject({
  id: uuid,
  branchId: uuid,
  eraId: uuid,
  workId: uuid,
  orderIndex: count,
  concurrentWithPrev: z.boolean(),
  relationLabel: z.string().nullable(),
});

const ownerProjection = z.strictObject({
  status: z.literal('ok'),
  audience: z.enum(['owner', 'admin']),
  header,
  focusWorkId: uuid,
  rootWorkId: uuid,
  branches: z.array(ownerNode),
  eras: z.array(ownerEra),
  placements: z.array(ownerPlacement),
});

const unavailableResponse = z.strictObject({ status: z.literal('unavailable') });

const baselineSchema = z.strictObject({
  maxTotalViews: nonNeg,
  maxLikeCount: count,
  authorViewsExcludedSince: z.string().refine((v) => /^\d{4}-\d{2}-\d{2}T/.test(v) && !Number.isNaN(Date.parse(v))),
});

const inputSchema = z.strictObject({ workId: uuid, readerPreview: z.boolean().optional() });

// ---------------------------------------------------------------------------
// Whole-response checks
// ---------------------------------------------------------------------------

function collectStrings(value: unknown, out: string[]): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      collectStrings(v, out);
    }
  }
  return out;
}

function isSoundReaderTree(p: ReaderWorldTreeProjection): boolean {
  const links = new Map<string, string | null>();
  const works = new Map<string, { workId: string; title: string }>();
  for (const node of p.nodes) {
    if (links.has(node.nodeKey)) return false;
    links.set(node.nodeKey, node.parentNodeKey);
    if (node.nodeType === 'work') works.set(node.nodeKey, { workId: node.workId, title: node.title });
  }
  // Exactly one top node; every parent link inside the response; no cycle.
  if ([...links.values()].filter((parent) => parent === null).length !== 1) return false;
  for (const [key, parent] of links) {
    if (parent !== null && !links.has(parent)) return false;
    const seen = new Set([key]);
    for (let cursor = parent; cursor !== null; cursor = links.get(cursor) ?? null) {
      if (seen.has(cursor)) return false;
      seen.add(cursor);
    }
  }
  if (!works.has(p.focusNodeKey)) return false;

  const eraKeys = new Set<string>();
  for (const era of p.eras) {
    if (eraKeys.has(era.eraKey) || !works.has(era.nodeKey)) return false;
    eraKeys.add(era.eraKey);
  }
  for (const node of p.nodes) {
    if (node.nodeType === 'work' && node.placement && !eraKeys.has(node.placement.eraKey)) return false;
  }

  const titles = new Set([...works.values()].map((w) => w.title));
  if (p.header.title !== WORLD_TREE_FALLBACK_TITLE && !titles.has(p.header.title)) return false;

  // No UUID anywhere except the workId of a visible work (keys, titles, era names included).
  const allowed = new Set([...works.values()].map((w) => w.workId.toLowerCase()));
  for (const value of collectStrings(p, [])) {
    const matches = value.match(UUID_ANYWHERE);
    if (matches && !(matches.length === 1 && matches[0].length === value.length && allowed.has(value.toLowerCase()))) {
      return false;
    }
  }
  // ...and only in workId fields.
  for (const node of p.nodes) {
    if (node.nodeType === 'work' && collectStrings({ ...node, workId: '' }, []).some((v) => UUID_RE.test(v))) return false;
  }
  return true;
}

function isSoundOwnerTree(p: OwnerWorldTreeProjection): boolean {
  const branchIds = new Set(p.branches.map((b) => b.branchId));
  if (branchIds.size !== p.branches.length) return false;
  for (const b of p.branches) {
    if (b.parentBranchId !== null && !branchIds.has(b.parentBranchId)) return false;
  }
  for (const e of p.eras) if (!branchIds.has(e.branchId)) return false;
  for (const pl of p.placements) if (!branchIds.has(pl.branchId)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

const invalidResponse = (): WorldTreeQueryFailure => ({
  ok: false, code: 'invalid_response', retryable: false, error: WORLD_TREE_QUERY_COPY.invalidResponse,
});
const rpcFailed = (error: string): WorldTreeQueryFailure => ({ ok: false, code: 'rpc_failed', retryable: true, error });

/**
 * Loads the world tree for a work through get_world_tree. `readerPreview` asks the database for
 * the reader projection as an owner/admin (it answers unavailable for anyone else).
 */
export async function getWorldTree(
  supabase: SupabaseClient,
  input: { workId: string; readerPreview?: boolean },
): Promise<WorldTreeQueryResult> {
  const parsedInput = inputSchema.safeParse(input);
  if (!parsedInput.success) {
    return { ok: false, code: 'invalid_input', retryable: false, error: WORLD_TREE_QUERY_COPY.invalidInput };
  }
  const readerPreview = parsedInput.data.readerPreview === true;
  const args: Required<GetWorldTreeArgs> = { p_work_id: parsedInput.data.workId, p_reader_preview: readerPreview };

  let data: unknown;
  try {
    const result = await supabase.rpc('get_world_tree', args);
    if (result.error) return rpcFailed(WORLD_TREE_QUERY_COPY.unavailable);
    data = result.data;
  } catch {
    return rpcFailed(WORLD_TREE_QUERY_COPY.unavailable);
  }

  if (unavailableResponse.safeParse(data).success) return { ok: true, status: 'unavailable' };

  const audience = data && typeof data === 'object' ? (data as { audience?: unknown }).audience : undefined;
  if (audience === 'reader') {
    const parsed = readerProjection.safeParse(data);
    if (!parsed.success) return invalidResponse();
    const projection = parsed.data as ReaderWorldTreeProjection;
    if (!isSoundReaderTree(projection) || parseWorldTreeResponse(data).status !== 'ok') return invalidResponse();
    return { ok: true, status: 'ok', mode: 'reader', projection };
  }
  if ((audience === 'owner' || audience === 'admin') && !readerPreview) {
    const parsed = ownerProjection.safeParse(data);
    if (!parsed.success) return invalidResponse();
    const projection = parsed.data as OwnerWorldTreeProjection;
    if (!isSoundOwnerTree(projection) || parseWorldTreeResponse(data).status !== 'ok') return invalidResponse();
    return { ok: true, status: 'ok', mode: projection.audience, projection };
  }
  return invalidResponse();
}

/** Global public maxima for the WTREE-08 fruit-size adapter (18-05) plus the author-view cutoff. */
export async function getWorldTreeMetricBaseline(supabase: SupabaseClient): Promise<WorldTreeMetricBaselineResult> {
  let data: unknown;
  try {
    const result = await supabase.rpc('get_world_tree_metric_baseline');
    if (result.error) return rpcFailed(WORLD_TREE_QUERY_COPY.baselineUnavailable);
    data = result.data;
  } catch {
    return rpcFailed(WORLD_TREE_QUERY_COPY.baselineUnavailable);
  }
  const parsed = baselineSchema.safeParse(data);
  if (!parsed.success) return invalidResponse();
  return { ok: true, baseline: parsed.data };
}
