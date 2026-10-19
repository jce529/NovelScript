/**
 * Timed-suspension presets (ADMIN-03, Reopen 2026-10-12: 기간 정지 프리셋 1·7·30일).
 *
 * Pure and shared by the initial suspension form and the current-sanction duration change:
 * the caller captures one base time (e.g. Date.now() when the confirm step opens) and uses it
 * for both the expiry preview and the endsAt it submits, so the two never drift apart.
 * A day is always 86,400,000 ms in UTC; local DST never changes the length.
 */

export const SANCTION_DURATION_DAYS = [1, 7, 30] as const;
export type SanctionDurationDays = (typeof SANCTION_DURATION_DAYS)[number];

const DAY_MS = 86_400_000;
/** ECMAScript Date range limit in ms from the epoch. */
const MAX_TIME_MS = 8.64e15;

export function isSanctionDurationDays(value: unknown): value is SanctionDurationDays {
  return (SANCTION_DURATION_DAYS as readonly unknown[]).includes(value);
}

/** Returns the UTC ISO expiry for a preset; throws RangeError on any invalid input. */
export function suspensionPresetEndsAt(days: SanctionDurationDays, baseTime: number): string {
  if (!isSanctionDurationDays(days)) throw new RangeError('invalid_sanction_duration');
  if (typeof baseTime !== 'number' || !Number.isFinite(baseTime) || Math.abs(baseTime) > MAX_TIME_MS) {
    throw new RangeError('invalid_base_time');
  }
  const endsAt = baseTime + days * DAY_MS;
  if (endsAt > MAX_TIME_MS) throw new RangeError('invalid_base_time');
  return new Date(endsAt).toISOString();
}
