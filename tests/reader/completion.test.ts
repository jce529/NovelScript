import { describe, it, expect } from 'vitest';
import {
  ACTIVE_TIME_SLACK_MS,
  COMPLETION_SCROLL_RATIO,
  END_SENTINEL_VISIBLE_MS,
  IDLE_TIMEOUT_MS,
  MINIMUM_READING_FLOOR_MS,
  MINIMUM_READING_RATIO,
  READING_CHARS_PER_MINUTE,
  completionEligible,
  minimumReadingMs,
} from '../../lib/reader/completion';

// 03-12 (READ-04): provisional completion thresholds. This module is the client display/unit
// contract only; the final decision is complete_chapter (0025) on server-stored values.

describe('provisional constants (LOW confidence, research defaults)', () => {
  it('pins 1,200 chars/min, ratio 0.5, 30 s floor, 120 s idle, 1 s sentinel, 0.98 ratio, 5 s slack', () => {
    expect(READING_CHARS_PER_MINUTE).toBe(1200);
    expect(MINIMUM_READING_RATIO).toBe(0.5);
    expect(MINIMUM_READING_FLOOR_MS).toBe(30_000);
    expect(IDLE_TIMEOUT_MS).toBe(120_000);
    expect(END_SENTINEL_VISIBLE_MS).toBe(1000);
    expect(COMPLETION_SCROLL_RATIO).toBe(0.98);
    expect(ACTIVE_TIME_SLACK_MS).toBe(5000);
  });
});

describe('minimumReadingMs', () => {
  it.each([
    [0, 30_000],
    [1, 30_000],
    [1200, 30_000],
    [2400, 60_000],
    [5000, 125_000],
    [10_000, 250_000],
  ])('%i chars -> %i ms', (chars, ms) => {
    expect(minimumReadingMs(chars)).toBe(ms);
  });

  it('switches from the 30 s floor exactly at 1,200 chars and rounds up afterwards', () => {
    expect(minimumReadingMs(1199)).toBe(30_000);
    expect(minimumReadingMs(1201)).toBe(30_025);
    // 1 char = 25 ms at the provisional values; no float drift on large counts.
    expect(minimumReadingMs(123_457)).toBe(3_086_425);
  });

  it.each([NaN, -1, 1.5, Infinity, -Infinity])('rejects invalid char count %s', (bad) => {
    expect(() => minimumReadingMs(bad)).toThrow(RangeError);
  });

  it('rejects non-number input at runtime', () => {
    expect(() => minimumReadingMs('5000' as unknown as number)).toThrow(RangeError);
    expect(() => minimumReadingMs(null as unknown as number)).toThrow(RangeError);
  });
});

describe('completionEligible (all three conditions, equality counts as met)', () => {
  const base = { charCount: 5000, maxScrollRatio: 0.98, endVisibleMs: 1000, activeMs: 125_000 };

  it('accepts the exact boundary of every condition', () => {
    expect(completionEligible(base)).toBe(true);
  });

  it('minimum time: just before / equal / just after', () => {
    expect(completionEligible({ ...base, activeMs: 124_999 })).toBe(false);
    expect(completionEligible({ ...base, activeMs: 125_000 })).toBe(true);
    expect(completionEligible({ ...base, activeMs: 125_001 })).toBe(true);
  });

  it('scroll ratio .9799 is not the end, .98 and 1 are', () => {
    expect(completionEligible({ ...base, maxScrollRatio: 0.9799 })).toBe(false);
    expect(completionEligible({ ...base, maxScrollRatio: 0.98 })).toBe(true);
    expect(completionEligible({ ...base, maxScrollRatio: 1 })).toBe(true);
  });

  it('end sentinel visible 999 ms is not enough, 1000 ms is', () => {
    expect(completionEligible({ ...base, endVisibleMs: 999 })).toBe(false);
    expect(completionEligible({ ...base, endVisibleMs: 1000 })).toBe(true);
  });

  it('short and empty chapters still need the 30 s floor and the end', () => {
    expect(completionEligible({ charCount: 0, maxScrollRatio: 1, endVisibleMs: 1000, activeMs: 29_999 })).toBe(false);
    expect(completionEligible({ charCount: 0, maxScrollRatio: 1, endVisibleMs: 1000, activeMs: 30_000 })).toBe(true);
    expect(completionEligible({ charCount: 0, maxScrollRatio: 0.5, endVisibleMs: 1000, activeMs: 60_000 })).toBe(false);
  });

  it('10,000 chars needs 250 s', () => {
    const long = { ...base, charCount: 10_000 };
    expect(completionEligible({ ...long, activeMs: 249_999 })).toBe(false);
    expect(completionEligible({ ...long, activeMs: 250_000 })).toBe(true);
  });

  it.each([
    { maxScrollRatio: NaN },
    { maxScrollRatio: -0.1 },
    { maxScrollRatio: 1.01 },
    { endVisibleMs: NaN },
    { endVisibleMs: -1 },
    { activeMs: NaN },
    { activeMs: -1 },
    { activeMs: Infinity },
    { charCount: NaN },
    { charCount: -1 },
    { charCount: 2.5 },
  ])('invalid input %o is never eligible (no throw)', (patch) => {
    expect(completionEligible({ ...base, activeMs: 10_000_000, ...patch })).toBe(false);
  });
});
