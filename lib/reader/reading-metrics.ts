/**
 * 26-03 (RDATA-03, RDATA-04, D-03..D-10): consumer DTO contracts and boundary validators for
 * the three reading-data real-time aggregation RPCs:
 *   - `work_reading_metrics(work_id)`   (0054_work_reading_metrics.sql, public work summary)
 *   - `work_chapter_metrics(work_id)`   (0054_work_reading_metrics.sql, owner-only per-chapter rates)
 *   - `chapter_dropoff(chapter_id)`     (0055_chapter_dropoff.sql, owner-only 20-bucket dropoff)
 *
 * Key aggregation semantics & limitations (must be preserved if backing storage ever moves from
 * real-time RPCs to summary tables in a future phase):
 *   1. Work completion rate (`WorkReadingMetrics.completionRate`, D-07):
 *      - Weighted average by chapter reached readers: `sum(completed) / sum(reached)` across
 *        currently published, non-deleted, non-blinded chapters.
 *      - It is NOT the simple unweighted average of per-chapter completion rates.
 *   2. Work retention rate (`WorkReadingMetrics.retentionRate`, D-04, D-09):
 *      - Weighted sum by chapter completers over valid adjacent live chapter pairs (`N -> N+1` in
 *        `(order_index, id)` order where both N and N+1 are currently published, non-deleted, and
 *        non-blinded): `sum(nextOpened) / sum(completed)`.
 *      - Unpublished, deleted, or blinded chapters are NOT skipped to bridge a pair, and the last
 *        chapter has no successor pair.
 *   3. Pre-opened chapter limitation (D-04, 26-RESEARCH §3.4):
 *      - `nextOpened` counts valid completers of chapter N who have any `chapter_reading_state` row
 *        for chapter N+1 regardless of timestamp order (`opened_at` vs `completed_at`).
 *      - Therefore, a reader who pre-opened (skipped ahead to) chapter N+1 before completing
 *        chapter N is still counted as retained (`nextOpened`). Order-of-reading correction is
 *        intentionally not applied.
 *   4. Valid reader filter (D-06):
 *      - Every denominator and numerator (`reachedReaders`, `reached`, `completed`, `nextOpened`,
 *        `buckets`) excludes: (a) the work owner (`works.owner_id`), (b) unverified accounts
 *        (`user_is_verified(user_id) = false`), and (c) soft-deleted profiles (`profiles.deleted_at`).
 *   5. Chapter dropoff histogram (`ChapterDropoff`, D-03, D-08):
 *      - 20 buckets of 5% scroll ratio each (`bucketCount = 20`).
 *      - `buckets[k]` (`k = 0..19`) counts incomplete valid readers (`completed_at is null`) whose
 *        `max_scroll_ratio` falls in `[k * 0.05, (k + 1) * 0.05)`, with `1.0` clamped into the last
 *        bucket (`buckets[19]`, `[0.95, 1.0]`).
 *      - Completed readers (`completed_at is not null`) are excluded from `buckets`, so
 *        `sum(buckets) === reached - completed` always holds.
 *
 * RPC call sites, studio dashboard UI (Phase 30), discovery/ranking popularity replacement
 * (Phases 21/23), and World Tree thickness (WTREE-08) belong to downstream phases.
 */

import { MIN_SAMPLE_READERS } from './completion';

/** Fixed number of 5% scroll-ratio dropoff buckets per chapter (D-03). */
export const DROPOFF_BUCKET_COUNT = 20 as const;
/** Width of each scroll-ratio bucket (`1 / 20 = 0.05`, D-03). */
export const DROPOFF_BUCKET_WIDTH = 0.05 as const;

/** Fixed-length 20-element integer tuple representing 5% scroll-ratio buckets `0..19`. */
export type DropoffBuckets = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

/**
 * Public work-level reading summary returned by `work_reading_metrics(work_id)` (D-04, D-07, D-10).
 *
 * - `completionRate`: `sum(completed) / sum(reached)` weighted by reached readers per live chapter,
 *   or `null` when `!sampleSufficient` (`reachedReaders < MIN_SAMPLE_READERS`) or `sum(reached) === 0`.
 * - `retentionRate`: `sum(nextOpened) / sum(completed)` weighted by completers across valid adjacent
 *   live chapter pairs (`N -> N+1`), including readers who pre-opened `N+1` before completing `N`
 *   (D-04 limitation), or `null` when `!sampleSufficient` or pair completers sum to `0`.
 */
export type WorkReadingMetrics = {
  workId: string;
  reachedReaders: number;
  completionRate: number | null;
  retentionRate: number | null;
  sampleSufficient: boolean;
};
export type WorkReadingMetricsDto = WorkReadingMetrics;

/**
 * Owner-only per-chapter reading metric item returned by `work_chapter_metrics(work_id)` (D-04, D-07, D-09, D-10).
 *
 * - `completionRate`: `completed / reached`, or `null` only when `reached === 0`.
 * - `nextOpened`: valid completers of this chapter who also have a `chapter_reading_state` row on the
 *   immediate next live chapter (pre-opened visits included per D-04; `0` when no valid adjacent live
 *   successor exists).
 * - `retentionRate`: `nextOpened / completed` when an immediate next live chapter exists and
 *   `completed > 0`, otherwise `null`.
 */
export type WorkChapterMetric = {
  chapterId: string;
  orderIndex: number;
  reached: number;
  completed: number;
  completionRate: number | null;
  nextOpened: number;
  retentionRate: number | null;
};
export type WorkChapterMetricDto = WorkChapterMetric;
export type WorkChapterMetrics = WorkChapterMetric[];
export type WorkChapterMetricsDto = WorkChapterMetrics;

/**
 * Owner-only per-chapter dropoff histogram returned by `chapter_dropoff(chapter_id)` (D-03, D-08, D-10).
 *
 * - `bucketCount`: always `20`.
 * - `buckets[k]`: number of incomplete valid readers (`completed_at is null`) with `max_scroll_ratio`
 *   in `[k * 0.05, (k + 1) * 0.05)` (`1.0` is placed in `buckets[19]`).
 * - `reached` and `completed` use the same valid reader set as `buckets`, so
 *   `sum(buckets) === reached - completed`.
 */
export type ChapterDropoff = {
  chapterId: string;
  bucketCount: typeof DROPOFF_BUCKET_COUNT;
  buckets: DropoffBuckets;
  reached: number;
  completed: number;
};
export type ChapterDropoffDto = ChapterDropoff;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

const isRateOrNull = (value: unknown): value is number | null =>
  value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1);

/**
 * Maps a `max_scroll_ratio` in `[0, 1]` to its 5% dropoff bucket index `0..19` (D-03, D-08).
 * Mirrors the SQL expression `least(19, greatest(0, floor(least(max_scroll_ratio, 1) * 20)::integer))`:
 *   - `0`      -> `0`
 *   - `0.0499` -> `0`
 *   - `0.05`   -> `1`
 *   - `0.95`   -> `19`
 *   - `1.0`    -> `19`
 * Throws `RangeError` if `maxScrollRatio` is outside `[0, 1]` or not a finite number.
 */
export function dropoffBucketIndex(maxScrollRatio: number): number {
  if (typeof maxScrollRatio !== 'number' || !Number.isFinite(maxScrollRatio) || maxScrollRatio < 0 || maxScrollRatio > 1) {
    throw new RangeError(`invalid maxScrollRatio: ${String(maxScrollRatio)}`);
  }
  const scaled = Math.floor(Math.min(maxScrollRatio, 1) * DROPOFF_BUCKET_COUNT);
  return Math.min(DROPOFF_BUCKET_COUNT - 1, Math.max(0, scaled));
}

/** Checks whether `value` satisfies the `WorkReadingMetrics` DTO and its null/sample invariants. */
export function isValidWorkReadingMetrics(value: unknown): value is WorkReadingMetrics {
  if (!isRecord(value)) return false;
  const { workId, reachedReaders, completionRate, retentionRate, sampleSufficient } = value;
  if (!isNonEmptyString(workId)) return false;
  if (!isNonNegativeInteger(reachedReaders)) return false;
  if (typeof sampleSufficient !== 'boolean') return false;
  if (!isRateOrNull(completionRate) || !isRateOrNull(retentionRate)) return false;

  // D-10 sample threshold invariant: sampleSufficient must match reachedReaders >= MIN_SAMPLE_READERS,
  // and insufficient samples or 0 reached readers must never expose non-null rates.
  if (sampleSufficient !== (reachedReaders >= MIN_SAMPLE_READERS)) return false;
  if (!sampleSufficient || reachedReaders === 0) {
    if (completionRate !== null || retentionRate !== null) return false;
  }
  return true;
}

/** Checks whether `value` satisfies a single `WorkChapterMetric` DTO and its denominator/rate invariants. */
export function isValidWorkChapterMetric(value: unknown): value is WorkChapterMetric {
  if (!isRecord(value)) return false;
  const { chapterId, orderIndex, reached, completed, completionRate, nextOpened, retentionRate } = value;
  if (!isNonEmptyString(chapterId)) return false;
  if (!isNonNegativeInteger(orderIndex)) return false;
  if (!isNonNegativeInteger(reached) || !isNonNegativeInteger(completed)) return false;
  if (completed > reached) return false;
  if (!isNonNegativeInteger(nextOpened) || nextOpened > completed) return false;
  if (!isRateOrNull(completionRate) || !isRateOrNull(retentionRate)) return false;

  if (reached === 0) {
    if (completionRate !== null) return false;
  } else if (completionRate === null) {
    return false;
  }

  if (completed === 0 && retentionRate !== null) {
    return false;
  }
  if (retentionRate === null && nextOpened > 0) {
    return false;
  }
  return true;
}

/** Checks whether `value` is a valid `WorkChapterMetric[]` array. */
export function isValidWorkChapterMetrics(value: unknown): value is WorkChapterMetrics {
  return Array.isArray(value) && value.every((item) => isValidWorkChapterMetric(item));
}

/**
 * Checks whether `value` satisfies the `ChapterDropoff` DTO and its 20-bucket / sum invariants:
 *   - `bucketCount === 20`
 *   - `buckets.length === 20` with non-negative integers
 *   - `0 <= completed <= reached`
 *   - `sum(buckets) === reached - completed`
 */
export function isValidChapterDropoff(value: unknown): value is ChapterDropoff {
  if (!isRecord(value)) return false;
  const { chapterId, bucketCount, buckets, reached, completed } = value;
  if (!isNonEmptyString(chapterId)) return false;
  if (bucketCount !== DROPOFF_BUCKET_COUNT) return false;
  if (!isNonNegativeInteger(reached) || !isNonNegativeInteger(completed)) return false;
  if (completed > reached) return false;
  if (!Array.isArray(buckets) || buckets.length !== DROPOFF_BUCKET_COUNT) return false;
  if (!buckets.every((count) => isNonNegativeInteger(count))) return false;

  const bucketSum = (buckets as number[]).reduce((sum, count) => sum + count, 0);
  return bucketSum === reached - completed;
}

/** Parses a `work_reading_metrics` RPC payload (`WorkReadingMetrics | null`), throwing `TypeError` on contract violations. */
export function parseWorkReadingMetrics(value: unknown): WorkReadingMetrics | null {
  if (value === null) return null;
  if (!isValidWorkReadingMetrics(value)) {
    throw new TypeError('Invalid WorkReadingMetrics DTO');
  }
  return value;
}

/** Parses a `work_chapter_metrics` RPC payload (`WorkChapterMetric[]`), throwing `TypeError` on contract violations. */
export function parseWorkChapterMetrics(value: unknown): WorkChapterMetrics {
  if (!isValidWorkChapterMetrics(value)) {
    throw new TypeError('Invalid WorkChapterMetrics DTO');
  }
  return value;
}

/** Parses a `chapter_dropoff` RPC payload (`ChapterDropoff`), throwing `TypeError` on contract violations. */
export function parseChapterDropoff(value: unknown): ChapterDropoff {
  if (!isValidChapterDropoff(value)) {
    throw new TypeError('Invalid ChapterDropoff DTO');
  }
  return value;
}
