/**
 * 03-12 (READ-04) / 26-01 (RDATA-02, D-01, D-02, D-10): chapter-completion thresholds (client copy).
 *
 * Single source of truth: `reading_completion_config()` in `supabase/migrations/0053_reader_completion_config.sql`.
 * This TypeScript module is a read-only client-side copy used only for display and flush-candidate
 * decisions (progress UI, `use-reading-progress` completion candidate check, unit tests). It does NOT
 * decide completion: the authoritative decision is `complete_chapter` (0053, preserving 0039 OAuth guard
 * and 0052 verified-account gate) reading `reading_completion_config()` and server-stored state.
 *
 * `tests/reader/completion-migration.test.ts` pins every constant and formula here against `0053`.
 * For beta recalibration (p5 of `active_ms / char_count`), see `.planning/phases/26-reader-reading-data/26-READING-CALIBRATION.md`.
 * Every threshold is inclusive ("이상"): reaching the value exactly counts as met.
 */

/** Reopen provisional reading speed: 1,200 characters per minute (DB: `reading_completion_config().chars_per_minute`). */
export const READING_CHARS_PER_MINUTE = 1200;
/** Share of nominal reading time that must be actively spent (DB: `reading_completion_config().minimum_reading_ratio`). */
export const MINIMUM_READING_RATIO = 0.5;
/** Lower bound for any chapter, including empty or very short ones (DB: `reading_completion_config().minimum_reading_floor_ms`). */
export const MINIMUM_READING_FLOOR_MS = 30_000;
/** Client stops counting active time after this long without input (client-only idle cutoff). */
export const IDLE_TIMEOUT_MS = 120_000;
/** The end sentinel must stay fully visible this long (DB: `reading_completion_config().end_sentinel_visible_ms`). */
export const END_SENTINEL_VISIBLE_MS = 1000;
/** max_scroll_ratio that counts as "reached the end" (DB: `reading_completion_config().completion_scroll_ratio`). */
export const COMPLETION_SCROLL_RATIO = 0.98;
/** Server slack over DB-measured session elapsed time (DB: `reading_completion_config().active_time_slack_ms`). */
export const ACTIVE_TIME_SLACK_MS = 5000;
/** Minimum reached readers required before public work-level rates are exposed (D-10, DB: `reading_completion_config().min_sample_readers`). */
export const MIN_SAMPLE_READERS = 5;

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
