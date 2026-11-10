import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readChapterContent } from '../access/actions';
import { listCategoryFolderCandidates, type FolderCandidatesResult } from '../kb/actions';
import { listMcpConnections } from '../mcp/connections';
import { hashContent } from './hash';
import { computeHunks, tokenize, type Hunk } from './paragraph-merge';

/**
 * Phase 14 (MCP-06/07) review queue reads. Always called with the writer's
 * browser-session client and the user ID derived from that session (never from
 * client input). RLS already limits mcp_proposals to owner_id = auth.uid(); every
 * query here also filters by owner and work so a foreign ID is indistinguishable
 * from a missing one (same not_found).
 *
 * Expiry has no scheduler: a pending row with expires_at <= now() is treated as
 * expired everywhere here (not counted, not reviewable, shown under 'done').
 * Hashes are only carried as the opaque seenHash token for the accept action;
 * the stored base_hash never leaves this module.
 */

export type ProposalKind = 'chapter_draft' | 'kb_edit' | 'kb_create';
export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'superseded' | 'expired' | 'reverted';
export type ProposalFilter = 'pending' | 'done' | 'all';

export const PROPOSAL_LIST_LIMIT = 200;
/** Live works considered for the inbox and the header count. */
const WORK_LIST_LIMIT = 1000;
/** kb_edit targets: same category set as 0041/0042. */
const KB_EDIT_CATEGORIES = ['인물', '장소', '사건', '세력', '아이템', 'custom'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);

export interface ProposalSource {
  /** Snapshot taken by the propose RPC; shown even after the connection is revoked. */
  clientName: string;
  host: string;
  disconnected: boolean;
}

export interface ProposalSummary {
  id: string;
  kind: ProposalKind;
  /** Effective status: a pending row past expires_at is 'expired'. */
  status: ProposalStatus;
  createdAt: string;
  expiresAt: string;
  decidedAt: string | null;
  /** Chapter title, document name, or the proposed name for kb_create. */
  targetTitle: string | null;
  proposedCategory: string | null;
  /** Paragraph change count (base -> draft); null for kb_create. */
  changeCount: number | null;
  source: ProposalSource;
}

export type ListWorkProposalsResult =
  | { ok: true; work: { id: string; title: string }; filter: ProposalFilter; pendingCount: number; proposals: ProposalSummary[] }
  | { ok: false; reason: 'not_found' | 'error' };

export interface DetailHunk extends Hunk {
  /** Paragraphs of the current text the hunk replaces (before, when not applicable). */
  currentText: string;
}

export type TargetState = 'ok' | 'locked' | 'missing';

export interface ProposalDetail extends ProposalSummary {
  workId: string;
  workTitle: string;
  target: { chapterId: string | null; nodeId: string | null; title: string | null; state: TargetState };
  /** The proposed full text (AI draft / document). */
  draft: string;
  /** Current original text (chapter / kb_edit with a live target), else null. */
  currentContent: string | null;
  hunks: DetailHunk[];
  /** True when the original differs from what the AI based its proposal on. */
  isStale: boolean;
  /**
   * Opaque token = hash of the current original the hunks were computed on.
   * Sent back unchanged by the accept action; never rendered. Null when the
   * proposal cannot be accepted right now (not pending, expired, locked, missing, kb_create).
   */
  seenHash: string | null;
  undoUntil: string | null;
  canRevert: boolean;
  decision: { acceptedIndexes: number[]; editedIndexes: number[] } | null;
  /** kb_create while pending: folder candidates of the proposed category. */
  folders: FolderCandidatesResult | null;
  savedFolderId: string | null;
  createdNodeId: string | null;
}

export type ProposalDetailResult =
  | { ok: true; detail: ProposalDetail }
  | { ok: false; reason: 'not_found' | 'error' };

type ProposalRow = {
  id: string;
  owner_id: string;
  work_id: string;
  kind: ProposalKind;
  chapter_id: string | null;
  node_id: string | null;
  proposed_category: string | null;
  proposed_name: string | null;
  content: string;
  base_content: string | null;
  status: ProposalStatus;
  source_client_id: string;
  source_client_name: string;
  source_host: string;
  created_at: string;
  expires_at: string;
  decided_at: string | null;
  decision: unknown;
  undo_until: string | null;
  created_node_id: string | null;
};

// Single literal so supabase-js can infer the selected shape.
const PROPOSAL_COLUMNS = 'id, owner_id, work_id, kind, chapter_id, node_id, proposed_category, proposed_name, content, base_content, status, source_client_id, source_client_name, source_host, created_at, expires_at, decided_at, decision, undo_until, created_node_id';

const nowIso = () => new Date().toISOString();
const isPast = (ts: string | null) => ts !== null && Date.parse(ts) <= Date.now();

export function effectiveStatus(row: { status: ProposalStatus; expires_at: string }): ProposalStatus {
  return row.status === 'pending' && isPast(row.expires_at) ? 'expired' : row.status;
}

async function findOwnedWork(supabase: SupabaseClient, userId: string, workId: string) {
  if (!isUuid(userId) || !isUuid(workId)) return null;
  const { data, error } = await supabase.from('works').select('id, title')
    .eq('id', workId).eq('owner_id', userId).is('deleted_at', null).maybeSingle();
  if (error) throw new Error('work lookup failed');
  return (data as { id: string; title: string } | null) ?? null;
}

/** Active connections as client IDs plus (name, host) pairs: reconnecting the same
 * client (0037 mcp_connect) revokes the old client ID but is still connected. */
async function loadConnectionIndex(supabase: SupabaseClient, userId: string) {
  const listed = await listMcpConnections(supabase, userId);
  if (!listed.ok) return null;
  return {
    ids: new Set(listed.connections.map((c) => c.clientId)),
    pairs: new Set(listed.connections.map((c) => `${c.clientName}\u0000${c.redirectHost}`)),
  };
}

function toSource(row: ProposalRow, index: Awaited<ReturnType<typeof loadConnectionIndex>>): ProposalSource {
  const disconnected = index !== null
    && !index.ids.has(row.source_client_id)
    && !index.pairs.has(`${row.source_client_name}\u0000${row.source_host}`);
  return { clientName: row.source_client_name, host: row.source_host, disconnected };
}

function changeCount(row: ProposalRow): number | null {
  if (row.kind === 'kb_create' || row.base_content === null) return null;
  return computeHunks(row.base_content, row.content, row.base_content).length;
}

async function loadTitles(supabase: SupabaseClient, userId: string, workId: string, rows: ProposalRow[]) {
  const chapterIds = [...new Set(rows.map((r) => r.chapter_id).filter((v): v is string => v !== null))];
  const nodeIds = [...new Set(rows.map((r) => r.node_id).filter((v): v is string => v !== null))];
  const titles = new Map<string, string>();
  if (chapterIds.length) {
    const { data } = await supabase.from('chapters').select('id, title').eq('work_id', workId).in('id', chapterIds);
    for (const c of (data ?? []) as Array<{ id: string; title: string }>) titles.set(c.id, c.title);
  }
  if (nodeIds.length) {
    const { data } = await supabase.from('kb_nodes').select('id, name')
      .eq('owner_id', userId).eq('work_id', workId).in('id', nodeIds);
    for (const n of (data ?? []) as Array<{ id: string; name: string }>) titles.set(n.id, n.name);
  }
  return titles;
}

function summarize(row: ProposalRow, title: string | null, index: Awaited<ReturnType<typeof loadConnectionIndex>>): ProposalSummary {
  return {
    id: row.id,
    kind: row.kind,
    status: effectiveStatus(row),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    decidedAt: row.decided_at,
    targetTitle: row.kind === 'kb_create' ? row.proposed_name : title,
    proposedCategory: row.proposed_category,
    changeCount: changeCount(row),
    source: toSource(row, index),
  };
}

const selectProposalRows = (supabase: SupabaseClient) => supabase.from('mcp_proposals').select(PROPOSAL_COLUMNS);
type RowQuery = ReturnType<typeof selectProposalRows>;

/** Rows for one filter: pending = live pending, done = decided or lapsed (by decision time), all = newest first. */
async function fetchProposalRows(base: () => RowQuery, filter: ProposalFilter, now: string): Promise<ProposalRow[] | null> {
  if (filter === 'pending') {
    const { data, error } = await base().eq('status', 'pending').gt('expires_at', now)
      .order('created_at', { ascending: false }).limit(PROPOSAL_LIST_LIMIT);
    return error || !Array.isArray(data) ? null : (data as ProposalRow[]);
  }
  if (filter === 'done') {
    const [decided, lapsed] = await Promise.all([
      base().neq('status', 'pending').order('created_at', { ascending: false }).limit(PROPOSAL_LIST_LIMIT),
      base().eq('status', 'pending').lte('expires_at', now).order('created_at', { ascending: false }).limit(PROPOSAL_LIST_LIMIT),
    ]);
    if (decided.error || lapsed.error || !Array.isArray(decided.data) || !Array.isArray(lapsed.data)) return null;
    const doneAt = (r: ProposalRow) => Date.parse(r.decided_at ?? r.expires_at);
    return [...(decided.data as ProposalRow[]), ...(lapsed.data as ProposalRow[])]
      .sort((a, b) => doneAt(b) - doneAt(a) || Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, PROPOSAL_LIST_LIMIT);
  }
  const { data, error } = await base().order('created_at', { ascending: false }).limit(PROPOSAL_LIST_LIMIT);
  return error || !Array.isArray(data) ? null : (data as ProposalRow[]);
}

/** Queue for one owned work. Default filter 'pending'; newest first ('done' by decision time). */
export async function listWorkProposals(
  supabase: SupabaseClient, userId: string, workId: string, filter: ProposalFilter = 'pending',
): Promise<ListWorkProposalsResult> {
  try {
    const work = await findOwnedWork(supabase, userId, workId);
    if (!work) return { ok: false, reason: 'not_found' };
    const now = nowIso();
    const base = () => selectProposalRows(supabase).eq('owner_id', userId).eq('work_id', workId);

    const rows = await fetchProposalRows(base, filter, now);
    if (!rows) return { ok: false, reason: 'error' };

    const [titles, index, counts] = await Promise.all([
      loadTitles(supabase, userId, workId, rows),
      loadConnectionIndex(supabase, userId),
      countPendingProposalsByWork(supabase, userId, [workId]),
    ]);
    const proposals = rows.map((row) => summarize(row, titles.get(row.chapter_id ?? row.node_id ?? '') ?? null, index));
    return { ok: true, work, filter, pendingCount: counts[workId] ?? 0, proposals };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/** Home badges: one query for all works (no N+1). Missing / failed -> 0. */
export async function countPendingProposalsByWork(
  supabase: SupabaseClient, userId: string, workIds: string[],
): Promise<Record<string, number>> {
  const ids = [...new Set(workIds.filter(isUuid))];
  const counts: Record<string, number> = Object.fromEntries(workIds.map((w) => [w, 0]));
  if (ids.length === 0 || !isUuid(userId)) return counts;
  try {
    const { data, error } = await supabase.from('mcp_proposals').select('work_id')
      .eq('owner_id', userId).eq('status', 'pending').gt('expires_at', nowIso()).in('work_id', ids);
    if (error || !Array.isArray(data)) return counts;
    for (const row of data as Array<{ work_id: string }>) {
      if (row.work_id in counts) counts[row.work_id] += 1;
    }
    return counts;
  } catch {
    return counts;
  }
}

/** "이 회차/문서에 대기 제안 n건": live pending proposals for one chapter or document. */
export async function countPendingProposalsForTarget(
  supabase: SupabaseClient, userId: string, workId: string, kind: 'chapter' | 'node', targetId: string,
): Promise<{ count: number; proposalIds: string[] }> {
  const empty = { count: 0, proposalIds: [] as string[] };
  if (!isUuid(userId) || !isUuid(workId) || !isUuid(targetId)) return empty;
  try {
    const { data, error } = await supabase.from('mcp_proposals').select('id')
      .eq('owner_id', userId).eq('work_id', workId).eq('status', 'pending')
      .eq(kind === 'chapter' ? 'chapter_id' : 'node_id', targetId)
      .gt('expires_at', nowIso()).order('created_at', { ascending: false });
    if (error || !Array.isArray(data)) return empty;
    const proposalIds = (data as Array<{ id: string }>).map((r) => r.id);
    return { count: proposalIds.length, proposalIds };
  } catch {
    return empty;
  }
}

export type InboxKind = 'all' | 'draft' | 'kb';

export interface InboxProposal extends ProposalSummary {
  workId: string;
  workTitle: string;
}

export interface InboxWork {
  id: string;
  title: string;
  pendingCount: number;
}

export interface InboxScope {
  workId: string | null;
  chapterId: string | null;
}

export type ListInboxResult =
  | {
    ok: true;
    filter: ProposalFilter;
    kind: InboxKind;
    scope: InboxScope;
    /** Live pending proposals over all works (the header badge number). */
    pendingTotal: number;
    works: InboxWork[];
    proposals: InboxProposal[];
  }
  | { ok: false };

/** Owned, not deleted works (the only ones whose proposals are shown anywhere). */
async function listLiveWorks(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase.from('works').select('id, title')
    .eq('owner_id', userId).is('deleted_at', null).order('created_at', { ascending: false }).limit(WORK_LIST_LIMIT);
  if (error || !Array.isArray(data)) return null;
  return data as Array<{ id: string; title: string }>;
}

/**
 * Live pending proposals over the writer's live works (a deleted work's rows are hidden everywhere,
 * so they are not counted either). Failure -> null (the header omits the badge).
 */
export async function countPendingProposalsTotal(supabase: SupabaseClient, userId: string): Promise<number | null> {
  if (!isUuid(userId)) return null;
  try {
    const works = await listLiveWorks(supabase, userId);
    if (!works) return null;
    if (works.length === 0) return 0;
    const { data, error } = await supabase.from('mcp_proposals').select('id')
      .eq('owner_id', userId).eq('status', 'pending').gt('expires_at', nowIso())
      .in('work_id', works.map((w) => w.id));
    if (error || !Array.isArray(data)) return null;
    return data.length;
  } catch {
    return null;
  }
}

/** Chapter tree badges: live pending drafts per chapter of one work. Failure -> {} (no badges). */
export async function countPendingDraftsByChapter(
  supabase: SupabaseClient, userId: string, workId: string,
): Promise<Record<string, number>> {
  if (!isUuid(userId) || !isUuid(workId)) return {};
  try {
    const { data, error } = await supabase.from('mcp_proposals').select('chapter_id')
      .eq('owner_id', userId).eq('work_id', workId).eq('kind', 'chapter_draft')
      .eq('status', 'pending').gt('expires_at', nowIso());
    if (error || !Array.isArray(data)) return {};
    const counts: Record<string, number> = {};
    for (const row of data as Array<{ chapter_id: string | null }>) {
      if (row.chapter_id) counts[row.chapter_id] = (counts[row.chapter_id] ?? 0) + 1;
    }
    return counts;
  } catch {
    return {};
  }
}

/**
 * Global inbox: proposals of all owned works in one list. Optional scope narrows to one work and
 * one chapter (tree shortcut). A scope that does not belong to the writer shows an empty list
 * (indistinguishable from "nothing there"), never another writer's rows.
 */
export async function listInboxProposals(
  supabase: SupabaseClient, userId: string,
  options: { filter?: ProposalFilter; kind?: InboxKind; workId?: string | null; chapterId?: string | null } = {},
): Promise<ListInboxResult> {
  const filter = options.filter ?? 'pending';
  const kind = options.kind ?? 'all';
  const scope: InboxScope = {
    workId: isUuid(options.workId) ? options.workId : null,
    chapterId: isUuid(options.chapterId) ? options.chapterId : null,
  };
  if (!isUuid(userId)) return { ok: false };
  try {
    const ownedWorks = await listLiveWorks(supabase, userId);
    if (!ownedWorks) return { ok: false };
    const workTitle = new Map(ownedWorks.map((w) => [w.id, w.title]));
    const liveIds = ownedWorks.map((w) => w.id);
    // A scope on a deleted or foreign work is an empty list, never another work's rows.
    const scopedOut = scope.workId !== null && !workTitle.has(scope.workId);

    const now = nowIso();
    const base = () => {
      let query = selectProposalRows(supabase).eq('owner_id', userId);
      if (kind === 'draft') query = query.eq('kind', 'chapter_draft');
      if (kind === 'kb') query = query.in('kind', ['kb_edit', 'kb_create']);
      query = scope.workId ? query.eq('work_id', scope.workId) : query.in('work_id', liveIds);
      if (scope.chapterId) query = query.eq('chapter_id', scope.chapterId);
      return query;
    };
    const [fetched, index, counts] = await Promise.all([
      scopedOut || liveIds.length === 0 ? Promise.resolve<ProposalRow[]>([]) : fetchProposalRows(base, filter, now),
      loadConnectionIndex(supabase, userId),
      countPendingProposalsByWork(supabase, userId, liveIds),
    ]);
    if (!fetched) return { ok: false };
    // Defensive: the query is already limited to live works.
    const rows = fetched.filter((r) => workTitle.has(r.work_id));

    const titles = new Map<string, string>();
    await Promise.all([...new Set(rows.map((r) => r.work_id))].map(async (id) => {
      const forWork = await loadTitles(supabase, userId, id, rows.filter((r) => r.work_id === id));
      for (const [key, value] of forWork) titles.set(key, value);
    }));

    return {
      ok: true,
      filter,
      kind,
      scope,
      pendingTotal: Object.values(counts).reduce((sum, n) => sum + n, 0),
      works: ownedWorks.map((w) => ({ id: w.id, title: w.title, pendingCount: counts[w.id] ?? 0 })),
      proposals: rows.map((row) => ({
        ...summarize(row, titles.get(row.chapter_id ?? row.node_id ?? '') ?? null, index),
        workId: row.work_id,
        workTitle: workTitle.get(row.work_id) ?? '',
      })),
    };
  } catch {
    return { ok: false };
  }
}

function parseDecision(value: unknown): ProposalDetail['decision'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const ints = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is number => Number.isInteger(x)) : []);
  if (!('accepted_indexes' in record)) return null;
  return { acceptedIndexes: ints(record.accepted_indexes), editedIndexes: ints(record.edited_indexes) };
}

function withCurrentText(hunks: Hunk[], current: string): DetailHunk[] {
  const tokens = tokenize(current);
  return hunks.map((h) => ({
    ...h,
    currentText: h.anchor ? tokens.slice(h.anchor.start, h.anchor.end).join('') : h.before,
  }));
}

async function readTarget(
  supabase: SupabaseClient, userId: string, workId: string, row: ProposalRow, withContent: boolean,
) {
  if (row.kind === 'chapter_draft') {
    const { data, error } = await supabase.from('chapters').select('id, title, deleted_at')
      .eq('id', row.chapter_id as string).eq('work_id', workId).maybeSingle();
    if (error) throw new Error('chapter lookup failed');
    const chapter = data as { id: string; title: string; deleted_at: string | null } | null;
    if (!chapter || chapter.deleted_at) return { title: chapter?.title ?? null, state: 'missing' as const, content: null };
    // chapters.content is column-revoked for authenticated (0005); the owner reads it
    // through read_chapter_content (0039 owner branch). Null content == '' like the RPCs.
    const content = withContent ? (await readChapterContent(supabase, chapter.id)) ?? '' : null;
    return { title: chapter.title, state: 'ok' as const, content };
  }
  if (row.kind === 'kb_edit') {
    const { data, error } = await supabase.from('kb_nodes')
      .select('id, name, content, is_locked, scope, node_type, category, deleted_at')
      .eq('id', row.node_id as string).eq('owner_id', userId).eq('work_id', workId).maybeSingle();
    if (error) throw new Error('node lookup failed');
    const node = data as {
      name: string; content: string | null; is_locked: boolean; scope: string; node_type: string;
      category: string; deleted_at: string | null;
    } | null;
    if (!node || node.deleted_at || node.scope !== 'work' || node.node_type !== 'file'
      || !KB_EDIT_CATEGORIES.includes(node.category)) {
      return { title: node?.name ?? null, state: 'missing' as const, content: null };
    }
    if (node.is_locked) return { title: node.name, state: 'locked' as const, content: node.content ?? '' };
    return { title: node.name, state: 'ok' as const, content: node.content ?? '' };
  }
  return { title: row.proposed_name, state: 'ok' as const, content: null };
}

/** Detail with server-computed hunks against the CURRENT original (pending only). */
export async function getProposalDetail(
  supabase: SupabaseClient, userId: string, workId: string, proposalId: string,
): Promise<ProposalDetailResult> {
  try {
    if (!isUuid(proposalId)) return { ok: false, reason: 'not_found' };
    const work = await findOwnedWork(supabase, userId, workId);
    if (!work) return { ok: false, reason: 'not_found' };
    const { data, error } = await supabase.from('mcp_proposals').select(PROPOSAL_COLUMNS)
      .eq('id', proposalId).eq('owner_id', userId).eq('work_id', workId).maybeSingle();
    if (error) return { ok: false, reason: 'error' };
    if (!data) return { ok: false, reason: 'not_found' };
    const row = data as ProposalRow;

    const status = effectiveStatus(row);
    const live = status === 'pending';
    const [target, index] = await Promise.all([
      readTarget(supabase, userId, workId, row, live),
      loadConnectionIndex(supabase, userId),
    ]);

    let hunks: DetailHunk[] = [];
    let currentContent: string | null = null;
    let seenHash: string | null = null;
    let isStale = false;
    if (row.kind !== 'kb_create' && row.base_content !== null && target.state !== 'missing') {
      if (live && target.state === 'ok' && target.content !== null) {
        currentContent = target.content;
        hunks = withCurrentText(computeHunks(row.base_content, row.content, currentContent), currentContent);
        seenHash = hashContent(currentContent);
        isStale = currentContent !== row.base_content;
      } else {
        // Read-only views (decided, expired, locked): the proposal's own diff.
        hunks = withCurrentText(computeHunks(row.base_content, row.content, row.base_content), row.base_content);
      }
    }

    const folders = row.kind === 'kb_create' && live && row.proposed_category
      ? await listCategoryFolderCandidates(supabase, { ownerId: userId, workId, category: row.proposed_category })
      : null;
    const decisionRecord = row.decision && typeof row.decision === 'object' ? row.decision as Record<string, unknown> : {};

    const detail: ProposalDetail = {
      ...summarize(row, target.title, index),
      workId,
      workTitle: work.title,
      target: { chapterId: row.chapter_id, nodeId: row.node_id, title: target.title, state: target.state },
      draft: row.content,
      currentContent,
      hunks,
      isStale,
      seenHash,
      undoUntil: row.undo_until,
      canRevert: row.status === 'accepted' && row.undo_until !== null && !isPast(row.undo_until),
      decision: parseDecision(row.decision),
      folders,
      savedFolderId: typeof decisionRecord.folder_id === 'string' ? decisionRecord.folder_id : null,
      createdNodeId: row.created_node_id,
    };
    return { ok: true, detail };
  } catch {
    return { ok: false, reason: 'error' };
  }
}
