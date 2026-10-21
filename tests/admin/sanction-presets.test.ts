import { describe, expect, it } from 'vitest';
import { SANCTION_DURATION_DAYS, suspensionPresetEndsAt } from '../../lib/admin/sanction-presets';

/*
 * 07-10-02: 1·7·30일 기간 정지 프리셋(Reopen 2026-10-12). 기준 시각은 호출자가 넘기고,
 * 하루는 항상 86,400,000ms(지역 DST 무관)다.
 */

const DAY = 86_400_000;

describe('SANCTION_DURATION_DAYS', () => {
  it('is exactly the three reopened presets', () => {
    expect(SANCTION_DURATION_DAYS).toEqual([1, 7, 30]);
  });
});

describe('suspensionPresetEndsAt', () => {
  const base = Date.parse('2026-10-19T09:15:30.123Z');

  it.each([
    [1, '2026-10-20T09:15:30.123Z'],
    [7, '2026-10-26T09:15:30.123Z'],
    [30, '2026-11-18T09:15:30.123Z'],
  ] as const)('%i day(s) from a fixed base is exact to the millisecond', (days, expected) => {
    expect(suspensionPresetEndsAt(days, base)).toBe(expected);
  });

  it.each([
    ['month end', '2026-01-31T23:59:59.999Z', 1, '2026-02-01T23:59:59.999Z'],
    ['year end', '2026-12-31T12:00:00.000Z', 7, '2027-01-07T12:00:00.000Z'],
    ['leap day', '2028-02-28T00:00:00.000Z', 1, '2028-02-29T00:00:00.000Z'],
    ['across leap February', '2028-02-15T06:30:00.000Z', 30, '2028-03-16T06:30:00.000Z'],
    ['across a US/EU DST change', '2026-03-28T01:00:00.000Z', 7, '2026-04-04T01:00:00.000Z'],
  ] as const)('%s stays a pure UTC offset', (_label, start, days, expected) => {
    const startMs = Date.parse(start);
    const result = suspensionPresetEndsAt(days, startMs);
    expect(result).toBe(expected);
    expect(Date.parse(result) - startMs).toBe(days * DAY);
  });

  it('reusing the same base gives identical preview and request values', () => {
    const preview = suspensionPresetEndsAt(7, base);
    const request = suspensionPresetEndsAt(7, base);
    expect(request).toBe(preview);
  });

  it.each([0, 2, 14, 31, -1, 1.5, Number.NaN, '7' as unknown as number])('rejects duration %s', (days) => {
    expect(() => suspensionPresetEndsAt(days as 1, base)).toThrow(RangeError);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -Number.MAX_VALUE, 8.64e15 + 1, 8.64e15 - DAY + 1, '0' as unknown as number])(
    'rejects base time %s',
    (baseTime) => {
      expect(() => suspensionPresetEndsAt(1, baseTime)).toThrow(RangeError);
    }
  );

  it('returns a string the server-side ISO offset validator accepts', () => {
    expect(suspensionPresetEndsAt(30, base)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
