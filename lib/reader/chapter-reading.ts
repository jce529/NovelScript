import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * READ-04 (03-13): typed adapter over the 0024/0025 reading-state RPCs.
 *
 * Writes go ONLY through the SECURITY DEFINER RPCs (open/save/complete), which resolve the
 * reader from auth.uid() and recheck readability. Nothing here accepts a userId, completedAt
 * or charCount from a client, and no service-role client is used.
 */

/** 0024 `chapter_reading_snapshot` jsonb. `sessionId` is null only in the zero snapshot that
 * save/complete return for a chapter that was never opened (no row). */
export interface ChapterReadingState {
  chapterId: string;
  workId: string;
  scrollRatio: number;
  maxScrollRatio: number;
  activeMs: number;
  completedAt: string | null;
  sessionId: string | null;
  sessionActiveMs: number;
  lastSequence: number;
}

/** Stable codes raised by 0024/0025 (`raise exception '<code>'`). Anything else is 'unknown'. */
export const CHAPTER_READING_ERROR_CODES = [
  'authentication_required',
  'invalid_input',
  'write_access_denied',
  'chapter_unavailable',
  'chapter_not_readable',
  'active_time_exceeds_elapsed',
] as const;
export type ChapterReadingErrorCode = (typeof CHAPTER_READING_ERROR_CODES)[number] | 'unknown';

/** Carries only a stable code. The raw DB message is never kept, so it cannot leak. */
export class ChapterReadingError extends Error {
  readonly code: ChapterReadingErrorCode;
  constructor(code: ChapterReadingErrorCode) {
    super(`chapter_reading:${code}`);
    this.name = 'ChapterReadingError';
    this.code = code;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INT4_MAX = 2_147_483_647;

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const isRatio = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const isNonNegativeSafeInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validates an RPC/row payload into the DTO. Returns null for anything malformed. */
export function parseChapterReadingState(value: unknown): ChapterReadingState | null {
  if (!isPlainObject(value)) return null;
  const v = value;
  if (!isUuid(v.chapterId) || !isUuid(v.workId)) return null;
  if (!isRatio(v.scrollRatio) || !isRatio(v.maxScrollRatio)) return null;
  if (!isNonNegativeSafeInt(v.activeMs) || !isNonNegativeSafeInt(v.sessionActiveMs) || !isNonNegativeSafeInt(v.lastSequence)) return null;
  if (v.completedAt !== null && typeof v.completedAt !== 'string') return null;
  if (v.sessionId !== null && !isUuid(v.sessionId)) return null;
  return {
    chapterId: v.chapterId,
    workId: v.workId,
    scrollRatio: v.scrollRatio,
    maxScrollRatio: v.maxScrollRatio,
    activeMs: v.activeMs,
    completedAt: v.completedAt as string | null,
    sessionId: v.sessionId as string | null,
    sessionActiveMs: v.sessionActiveMs,
    lastSequence: v.lastSequence,
  };
}

export type ProgressOperation = 'save' | 'complete';

/** POST /api/reader/progress body. Exactly these keys; identity and results come from the DB. */
export interface ProgressRequest {
  operation: ProgressOperation;
  workId: string;
  chapterId: string;
  sessionId: string;
  sequence: number;
  scrollRatio: number;
  sessionActiveMs: number;
  endVisibleMs: number;
}

export const PROGRESS_BODY_LIMIT_BYTES = 8 * 1024;

const PROGRESS_KEYS: ReadonlyArray<keyof ProgressRequest> = [
  'operation', 'workId', 'chapterId', 'sessionId', 'sequence', 'scrollRatio', 'sessionActiveMs', 'endVisibleMs',
];

/** Strict DTO validator: unknown keys (userId, completedAt, charCount, ...) are rejected. */
export function parseProgressRequest(body: unknown): { ok: true; value: ProgressRequest } | { ok: false } {
  if (!isPlainObject(body)) return { ok: false };
  const keys = Object.keys(body);
  if (keys.length !== PROGRESS_KEYS.length || !keys.every((k) => (PROGRESS_KEYS as string[]).includes(k))) {
    return { ok: false };
  }
  const b = body;
  if (b.operation !== 'save' && b.operation !== 'complete') return { ok: false };
  if (!isUuid(b.workId) || !isUuid(b.chapterId) || !isUuid(b.sessionId)) return { ok: false };
  if (!isNonNegativeSafeInt(b.sequence) || b.sequence < 1) return { ok: false };
  if (!isRatio(b.scrollRatio)) return { ok: false };
  if (!isNonNegativeSafeInt(b.sessionActiveMs)) return { ok: false };
  if (!isNonNegativeSafeInt(b.endVisibleMs) || b.endVisibleMs > INT4_MAX) return { ok: false };
  return {
    ok: true,
    value: {
      operation: b.operation,
      workId: b.workId,
      chapterId: b.chapterId,
      sessionId: b.sessionId,
      sequence: b.sequence,
      scrollRatio: b.scrollRatio,
      sessionActiveMs: b.sessionActiveMs,
      endVisibleMs: b.endVisibleMs,
    },
  };
}

function errorCode(error: unknown): ChapterReadingErrorCode {
  const message = isPlainObject(error) && typeof error.message === 'string' ? error.message.trim() : '';
  return (CHAPTER_READING_ERROR_CODES as readonly string[]).includes(message)
    ? (message as ChapterReadingErrorCode)
    : 'unknown';
}

async function callSnapshotRpc(supabase: SupabaseClient, fn: string, params: Record<string, unknown>): Promise<ChapterReadingState> {
  const { data, error } = await supabase.rpc(fn, params);
  if (error) throw new ChapterReadingError(errorCode(error));
  const state = parseChapterReadingState(data);
  if (!state) throw new ChapterReadingError('unknown');
  return state;
}

/** Starts (or continues) a visit: rechecks readability and moves the 이어보기 pointer atomically. */
export function openChapterReading(
  supabase: SupabaseClient,
  { workId, chapterId, sessionId }: { workId: string; chapterId: string; sessionId: string },
): Promise<ChapterReadingState> {
  return callSnapshotRpc(supabase, 'open_chapter_reading', {
    p_work_id: workId, p_chapter_id: chapterId, p_session_id: sessionId,
  });
}

/** Stores one progress sample. Stale/duplicate sequences return the unchanged snapshot. */
export function saveChapterReading(
  supabase: SupabaseClient,
  sample: Omit<ProgressRequest, 'operation'> & { operation?: ProgressOperation },
): Promise<ChapterReadingState> {
  return callSnapshotRpc(supabase, 'save_chapter_reading', {
    p_work_id: sample.workId,
    p_chapter_id: sample.chapterId,
    p_session_id: sample.sessionId,
    p_sequence: sample.sequence,
    p_scroll_ratio: sample.scrollRatio,
    p_session_active_ms: sample.sessionActiveMs,
    p_end_visible_ms: sample.endVisibleMs,
  });
}

/** Asks the server to judge completion from stored values only (0025). */
export function completeChapterReading(
  supabase: SupabaseClient,
  { workId, chapterId, sessionId }: { workId: string; chapterId: string; sessionId: string },
): Promise<ChapterReadingState> {
  return callSnapshotRpc(supabase, 'complete_chapter', {
    p_work_id: workId, p_chapter_id: chapterId, p_session_id: sessionId,
  });
}

/** Owner SELECT (RLS owner_select) of the reader's own row; null when none. */
export async function getChapterReadingState(
  supabase: SupabaseClient,
  { userId, chapterId }: { userId: string; chapterId: string },
): Promise<ChapterReadingState | null> {
  const { data, error } = await supabase
    .from('chapter_reading_state')
    .select('chapter_id, work_id, scroll_ratio, max_scroll_ratio, active_ms, completed_at, session_id, session_active_ms, last_sequence')
    .eq('user_id', userId)
    .eq('chapter_id', chapterId)
    .maybeSingle();
  if (error) throw new ChapterReadingError('unknown');
  if (!data) return null;
  const row = data as Record<string, unknown>;
  const state = parseChapterReadingState({
    chapterId: row.chapter_id,
    workId: row.work_id,
    scrollRatio: Number(row.scroll_ratio),
    maxScrollRatio: Number(row.max_scroll_ratio),
    activeMs: Number(row.active_ms),
    completedAt: row.completed_at ?? null,
    sessionId: row.session_id,
    sessionActiveMs: Number(row.session_active_ms),
    lastSequence: Number(row.last_sequence),
  });
  if (!state) throw new ChapterReadingError('unknown');
  return state;
}
