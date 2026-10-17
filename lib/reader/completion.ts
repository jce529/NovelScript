/**
 * 03-12 (READ-04): provisional chapter-completion thresholds.
 *
 * This module is the client-side display/unit contract (progress UI, flush decisions, tests). It does
 * NOT decide completion: the final decision is `complete_chapter` (supabase/migrations/0025) using
 * server-stored active time, scroll ratio, sentinel time and `chapters.char_count`. Both sides use the
 * same formula and boundaries; tests/reader/completion-migration.test.ts pins them against each other.
 *
 * All values are LOW-confidence provisional defaults (03-CONTEXT Reopen "분당 1,200자",
 * 03-RESEARCH-REOPEN ratio 0.5 / 30 s floor / 120 s idle / 1 s end sentinel). There is no Korean
 * silent-reading speed source; recalibrate from beta data (p5 of active_ms / char_count among
 * completions). Every threshold is inclusive ("이상"): reaching the value exactly counts as met.
 */

/** Reopen provisional reading speed: 1,200 characters per minute. */
export const READING_CHARS_PER_MINUTE = 1200;
/** Research provisional share of the nominal reading time that must be actively spent. */
export const MINIMUM_READING_RATIO = 0.5;
/** Lower bound for any chapter, including empty or very short ones. */
export const MINIMUM_READING_FLOOR_MS = 30_000;
/** Client stops counting active time after this long without input (not used by the server). */
export const IDLE_TIMEOUT_MS = 120_000;
/** The end sentinel must stay fully visible this long. */
export const END_SENTINEL_VISIBLE_MS = 1000;
/** max_scroll_ratio that counts as "reached the end". */
export const COMPLETION_SCROLL_RATIO = 0.98;
/** Server slack over DB-measured session elapsed time (0024/0025). */
export const ACTIVE_TIME_SLACK_MS = 5000;

const isNonNegativeFinite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

/**
 * max(30 000, ceil(charCount / 1200 × 60 000 × 0.5)) ms.
 * Multiplication happens before division so integer inputs stay exact (5 000 → 125 000).
 * Throws RangeError for NaN, negative, non-integer, infinite or non-number counts.
 */
export function minimumReadingMs(charCount: number): number {
  if (!isNonNegativeFinite(charCount) || !Number.isInteger(charCount)) {
    throw new RangeError(`invalid char count: ${String(charCount)}`);
  }
  const nominal = Math.ceil((charCount * 60_000 * MINIMUM_READING_RATIO) / READING_CHARS_PER_MINUTE);
  return Math.max(MINIMUM_READING_FLOOR_MS, nominal);
}

export type CompletionInput = {
  charCount: number;
  maxScrollRatio: number;
  endVisibleMs: number;
  activeMs: number;
};

/**
 * maxScrollRatio >= 0.98 AND endVisibleMs >= 1000 AND activeMs >= minimumReadingMs(charCount).
 * Invalid input is never eligible and never throws.
 */
export function completionEligible({ charCount, maxScrollRatio, endVisibleMs, activeMs }: CompletionInput): boolean {
  if (!isNonNegativeFinite(maxScrollRatio) || maxScrollRatio > 1) return false;
  if (!isNonNegativeFinite(endVisibleMs) || !isNonNegativeFinite(activeMs)) return false;
  if (!isNonNegativeFinite(charCount) || !Number.isInteger(charCount)) return false;
  return (
    maxScrollRatio >= COMPLETION_SCROLL_RATIO &&
    endVisibleMs >= END_SENTINEL_VISIBLE_MS &&
    activeMs >= minimumReadingMs(charCount)
  );
}
