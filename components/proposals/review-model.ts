// Pure view helpers for the Phase 14 review queue and detail (MCP-06/07).
// No I/O, no React: shared by the server pages and the client detail component and
// unit-tested directly. Copy strings come from 14-UI-SPEC.md and the approved mockup.
import type { ProposalFilter, ProposalKind, ProposalStatus, ProposalSummary } from '@/lib/proposals/queries';
import type { HunkKind } from '@/lib/proposals/paragraph-merge';

export const QUEUE_FILTERS: ProposalFilter[] = ['pending', 'done', 'all'];

/** `?status=` -> filter. Anything unknown (or repeated) falls back to the default 'pending'. */
export function parseQueueFilter(value: string | string[] | undefined): ProposalFilter {
  return typeof value === 'string' && (QUEUE_FILTERS as string[]).includes(value) ? (value as ProposalFilter) : 'pending';
}

export function queueHref(workId: string, filter: ProposalFilter): string {
  return filter === 'pending' ? `/studio/${workId}/review` : `/studio/${workId}/review?status=${filter}`;
}

export function reviewHref(workId: string, proposalId: string): string {
  return `/studio/${workId}/review/${proposalId}`;
}

export function filterTabLabel(filter: ProposalFilter, pendingCount: number): string {
  if (filter === 'pending') return `대기 중 ${pendingCount}`;
  return filter === 'done' ? '처리됨' : '전체';
}

export const KIND_LABEL: Record<ProposalKind, string> = {
  chapter_draft: '회차 초안',
  kb_edit: '설정집 수정안',
  kb_create: '설정집 새 문서',
};

export const STATUS_LABEL: Record<ProposalStatus, string> = {
  pending: '검토 대기',
  accepted: '반영됨',
  rejected: '거절함',
  superseded: '새 초안으로 대체됨',
  expired: '만료됨',
  reverted: '되돌림',
};

/** Accepted with fewer hunks than offered reads `일부 반영됨` (UI-SPEC Color 상태 배지). */
export function statusLabel(status: ProposalStatus, partial = false): string {
  return status === 'accepted' && partial ? '일부 반영됨' : STATUS_LABEL[status];
}

/** Muted badge text for the lapsed states (superseded / expired). */
export function isMutedStatus(status: ProposalStatus): boolean {
  return status === 'superseded' || status === 'expired';
}

export function fallbackTitle(kind: ProposalKind): string {
  return kind === 'chapter_draft' ? '제목 없는 회차' : '이름 없는 문서';
}

/** Queue card heading (h3). */
export function cardTitle(p: Pick<ProposalSummary, 'kind' | 'targetTitle'>): string {
  const title = p.targetTitle?.trim() || fallbackTitle(p.kind);
  if (p.kind === 'chapter_draft') return `${title} 초안`;
  if (p.kind === 'kb_edit') return `${title} 수정안`;
  return title;
}

/** Detail page heading (h1). */
export function detailHeading(p: Pick<ProposalSummary, 'kind' | 'targetTitle'>): string {
  const title = p.targetTitle?.trim() || fallbackTitle(p.kind);
  if (p.kind === 'chapter_draft') return `${title} 초안 검토`;
  if (p.kind === 'kb_edit') return `${title} 수정안 검토`;
  return `${title} 새 설정집 문서 검토`;
}

export function cardSummary(p: Pick<ProposalSummary, 'kind' | 'changeCount' | 'proposedCategory'>): string {
  if (p.kind === 'kb_create') return `카테고리 ${p.proposedCategory ?? '-'}`;
  return `바뀐 부분 ${p.changeCount ?? 0}곳`;
}

export function isActionable(status: ProposalStatus): boolean {
  return status === 'pending';
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const KST_OFFSET = 9 * HOUR;

/** KST calendar parts without relying on the runtime's ICU (same text on server and browser). */
function kstParts(iso: string) {
  const d = new Date(Date.parse(iso) + KST_OFFSET);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, day: d.getUTCDate(), h: d.getUTCHours(), min: d.getUTCMinutes() };
}

/** `2026. 11. 6.` (KST). */
export function formatKstDate(iso: string): string {
  const { y, m, day } = kstParts(iso);
  return `${y}. ${m}. ${day}.`;
}

/** `2026. 11. 6. 오후 3:12` (KST). */
export function formatKstDateTime(iso: string): string {
  const { h, min } = kstParts(iso);
  const meridiem = h < 12 ? '오전' : '오후';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${formatKstDate(iso)} ${meridiem} ${hour12}:${String(min).padStart(2, '0')}`;
}

/** Arrival time: `방금 전` (< 1분), `n분 전` (< 1시간), `n시간 전` (< 24시간), else absolute KST. */
export function formatArrival(iso: string, now: number): string {
  const diff = now - Date.parse(iso);
  if (!Number.isFinite(diff)) return '';
  if (diff < MINUTE) return '방금 전';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}분 전`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}시간 전`;
  return formatKstDateTime(iso);
}

/** `만료까지 n일` only for a live pending proposal expiring within 7 days. */
export function expiryNotice(p: Pick<ProposalSummary, 'status' | 'expiresAt'>, now: number): string | null {
  if (p.status !== 'pending') return null;
  const left = Date.parse(p.expiresAt) - now;
  if (!Number.isFinite(left) || left <= 0 || left > 7 * DAY) return null;
  return `만료까지 ${Math.max(1, Math.ceil(left / DAY))}일`;
}

export function emptyQueueCopy(filter: ProposalFilter): { heading: string; body: string; showConnectorLink: boolean } {
  if (filter === 'pending') {
    return {
      heading: '검토할 제안이 없어요',
      body: '연결된 AI가 초안이나 설정집 제안을 보내면 이곳에 도착해요. 제안은 도착한 지 30일이 지나면 만료돼요.',
      showConnectorLink: true,
    };
  }
  return { heading: '처리한 제안이 아직 없어요', body: '수락하거나 거절한 제안이 여기에 쌓여요.', showConnectorLink: false };
}

// ---------------------------------------------------------------------------
// Detail: chunk selection (A안 — unchecked = not applied)
// ---------------------------------------------------------------------------

export interface ChunkLike {
  index: number;
  kind: HunkKind;
  after: string;
  applicable: boolean;
}

export function selectableIndexes(hunks: ChunkLike[]): number[] {
  return hunks.filter((h) => h.applicable).map((h) => h.index);
}

/** 전체 선택 skips 적용할 수 없음 chunks. */
export function selectAll(hunks: ChunkLike[]): number[] {
  return selectableIndexes(hunks);
}

export function toggleSelection(selected: number[], index: number, hunks: ChunkLike[]): number[] {
  if (!selectableIndexes(hunks).includes(index)) return selected;
  return selected.includes(index) ? selected.filter((i) => i !== index) : [...selected, index].sort((a, b) => a - b);
}

/** 직접 고치기 exists only on applicable 추가/바뀜 chunks. */
export function canEditChunk(h: ChunkLike): boolean {
  return h.applicable && h.kind !== '삭제';
}

/** An edit counts only when it differs from the AI text (pre-filled with hunk.after, trailing newlines included). */
export function isEdited(h: ChunkLike, edits: Record<number, string>): boolean {
  const value = edits[h.index];
  return canEditChunk(h) && value !== undefined && value !== h.after;
}

/** Accept payload selections: only checked chunks; editedText only when 직접 고침 differs. */
export function buildSelections(
  hunks: ChunkLike[], selected: number[], edits: Record<number, string>,
): Array<{ index: number; accepted: true; editedText?: string }> {
  return hunks
    .filter((h) => h.applicable && selected.includes(h.index))
    .map((h) => (isEdited(h, edits) ? { index: h.index, accepted: true as const, editedText: edits[h.index] } : { index: h.index, accepted: true as const }));
}

/**
 * Accept action input. Never carries chunk text except the writer's own 직접 고침;
 * seenHash is the opaque token from the server detail, folder ids/versions come from
 * the server's candidate list (kb_create only).
 */
export function buildAcceptInput(
  view: { workId: string; id: string; kind: ProposalKind; seenHash: string | null; hunks: ChunkLike[] },
  selected: number[], edits: Record<number, string>, folder: { id: string; version: string } | null,
) {
  if (view.kind === 'kb_create') {
    return { workId: view.workId, proposalId: view.id, selections: [], ...(folder ? { folderId: folder.id, folderVersion: folder.version } : {}) };
  }
  return {
    workId: view.workId, proposalId: view.id,
    ...(view.seenHash ? { seenHash: view.seenHash } : {}),
    selections: buildSelections(view.hunks, selected, edits),
  };
}

/**
 * What the completed (read-only) view shows for one chunk. Right after an accept in this
 * session the submitted 직접 고침 text is known and shown; after a reload the server only
 * keeps edited_indexes (the merged text lives in the chapter / document), so the AI text
 * is shown with a note that the writer's own text was applied.
 */
export function completedChunkText(
  h: { index: number; after: string },
  decision: { acceptedIndexes: number[]; editedIndexes: number[] } | null,
  submittedTexts: Record<number, string> | null,
): { text: string; edited: boolean; note: string | null } {
  const edited = decision?.editedIndexes.includes(h.index) ?? false;
  if (!edited) return { text: h.after, edited: false, note: null };
  const submitted = submittedTexts?.[h.index];
  if (submitted !== undefined) return { text: submitted, edited: true, note: null };
  return { text: h.after, edited: true, note: '직접 고친 내용으로 반영했어요. 반영된 글은 원문에서 확인해 주세요.' };
}

/**
 * Accept success -> outcome that freezes the exact detail (hunks) the writer saw and
 * submitted against (incl. a stale re-compare), the accepted indexes and the 직접 고침 texts,
 * so the completed view matches what was applied even before / after the server refresh.
 */
export function acceptedOutcome<T extends { kind: ProposalKind; hunks: ChunkLike[] }>(
  shown: T, chosen: number[], edits: Record<number, string>,
  result: { appliedCount: number; undoUntil: string | null; createdNodeId: string | null },
  folderName: string | null,
) {
  const selections = shown.kind === 'kb_create' ? [] : buildSelections(shown.hunks, chosen, edits);
  const texts: Record<number, string> = {};
  for (const s of selections) if (s.editedText !== undefined) texts[s.index] = s.editedText;
  return {
    kind: 'accepted' as const,
    snapshot: shown,
    appliedCount: result.appliedCount,
    indexes: selections.map((s) => s.index),
    edited: selections.filter((s) => s.editedText !== undefined).map((s) => s.index),
    texts,
    undoUntil: result.undoUntil,
    createdNodeId: result.createdNodeId,
    folderName,
  };
}

export type DialogAlertTarget = 'reject-error' | 'revert-error' | 'revert-warning' | null;

/** Which in-dialog alert should receive focus when it appears (UI-SPEC Interaction 20). */
export function dialogAlertTarget(dialog: 'accept' | 'reject' | 'revert' | null, error: string, revertWarning: boolean): DialogAlertTarget {
  if (dialog === 'reject') return error ? 'reject-error' : null;
  if (dialog === 'revert') return error ? 'revert-error' : revertWarning ? 'revert-warning' : null;
  return null;
}

export function selectionStatus(selectedCount: number, total: number): string {
  return `${selectedCount}/${total}개 선택`;
}

/** Long chunks fold to 6 lines on mobile; one-sided (추가/삭제) and non-applicable chunks never fold. */
export function isFoldable(h: ChunkLike & { currentText: string }): boolean {
  if (!h.applicable || h.kind !== '바뀜') return false;
  const lines = (s: string) => s.split('\n').length;
  return h.after.length + h.currentText.length > 240 || Math.max(lines(h.after), lines(h.currentText)) > 6;
}

/** Folder option label: root shows the category root name with `최상위`, others `root / path`. */
export function folderOptionLabel(folder: { isRoot: boolean; name: string; path: string }, rootName: string): string {
  return folder.isRoot ? rootName : `${rootName} / ${folder.path || folder.name}`;
}
