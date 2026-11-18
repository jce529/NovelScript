import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MIN_SAMPLE_READERS } from '../../lib/reader/completion';
import {
  DROPOFF_BUCKET_COUNT,
  DROPOFF_BUCKET_WIDTH,
  dropoffBucketIndex,
  isValidChapterDropoff,
  isValidWorkChapterMetric,
  isValidWorkChapterMetrics,
  isValidWorkReadingMetrics,
  parseChapterDropoff,
  parseWorkChapterMetrics,
  parseWorkReadingMetrics,
  type ChapterDropoff,
  type DropoffBuckets,
  type WorkChapterMetric,
  type WorkReadingMetrics,
} from '../../lib/reader/reading-metrics';

const ROOT = path.resolve(__dirname, '../..');

function makeZeroBuckets(): DropoffBuckets {
  return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
}

describe('reading-metrics module constants & documentation contract (26-03)', () => {
  it('exports the fixed 20-bucket constants and documents weighted rates and the D-04 pre-open limitation', () => {
    expect(DROPOFF_BUCKET_COUNT).toBe(20);
    expect(DROPOFF_BUCKET_WIDTH).toBe(0.05);

    const source = readFileSync(path.join(ROOT, 'lib/reader/reading-metrics.ts'), 'utf8');
    // D-07: weighted completion rate by chapter reached readers (not simple average)
    expect(source).toMatch(/sum\(completed\)\s*\/\s*sum\(reached\)/);
    // D-04 / D-09: weighted retention rate by chapter completers over valid adjacent live pairs
    expect(source).toMatch(/sum\(nextOpened\)\s*\/\s*sum\(completed\)/);
    // D-04 limitation: pre-opened chapter N+1 before completing N still counts as retained
    expect(source).toMatch(/pre-opened/i);
  });
});

describe('dropoffBucketIndex boundary rules (D-03, D-08)', () => {
  it('maps 0, 0.0499, 0.05, 0.95, and 1.0 to buckets 0, 0, 1, 19, and 19', () => {
    expect(dropoffBucketIndex(0)).toBe(0);
    expect(dropoffBucketIndex(0.0499)).toBe(0);
    expect(dropoffBucketIndex(0.05)).toBe(1);
    expect(dropoffBucketIndex(0.9499)).toBe(18);
    expect(dropoffBucketIndex(0.95)).toBe(19);
    expect(dropoffBucketIndex(0.9999)).toBe(19);
    expect(dropoffBucketIndex(1.0)).toBe(19);
  });

  it('places every [k * 0.05, (k + 1) * 0.05) midpoint into bucket k for all 20 buckets', () => {
    for (let k = 0; k < DROPOFF_BUCKET_COUNT; k++) {
      const midpoint = Number(((k + 0.5) * DROPOFF_BUCKET_WIDTH).toFixed(4));
      expect(dropoffBucketIndex(midpoint)).toBe(k);
    }
  });

  it('throws RangeError for values outside [0, 1] or non-finite numbers', () => {
    for (const invalid of [-0.0001, -1, 1.0001, 2, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => dropoffBucketIndex(invalid)).toThrow(RangeError);
    }
  });
});

describe('WorkReadingMetrics DTO validation (work_reading_metrics)', () => {
  it('accepts valid sufficient and insufficient public summaries and null', () => {
    expect(MIN_SAMPLE_READERS).toBe(5);
    expect(parseWorkReadingMetrics(null)).toBeNull();

    const sufficient: WorkReadingMetrics = {
      workId: 'work-1',
      reachedReaders: 5,
      completionRate: 0.75,
      retentionRate: 0.6,
      sampleSufficient: true,
    };
    expect(isValidWorkReadingMetrics(sufficient)).toBe(true);
    expect(parseWorkReadingMetrics(sufficient)).toEqual(sufficient);

    // Single-chapter work with >= 5 readers has completionRate but null retentionRate (0 valid pairs).
    const singleChapterSufficient: WorkReadingMetrics = {
      workId: 'work-single',
      reachedReaders: 6,
      completionRate: 1,
      retentionRate: null,
      sampleSufficient: true,
    };
    expect(isValidWorkReadingMetrics(singleChapterSufficient)).toBe(true);

    const insufficient: WorkReadingMetrics = {
      workId: 'work-under',
      reachedReaders: 4,
      completionRate: null,
      retentionRate: null,
      sampleSufficient: false,
    };
    expect(isValidWorkReadingMetrics(insufficient)).toBe(true);
    expect(parseWorkReadingMetrics(insufficient)).toEqual(insufficient);
  });

  it('rejects summaries that violate sampleSufficient, null-rate, or [0, 1] rate invariants', () => {
    // Non-null rate when sampleSufficient is false
    expect(
      isValidWorkReadingMetrics({
        workId: 'work-1',
        reachedReaders: 4,
        completionRate: 0.5,
        retentionRate: null,
        sampleSufficient: false,
      })
    ).toBe(false);

    // sampleSufficient=true when reachedReaders < MIN_SAMPLE_READERS (5)
    expect(
      isValidWorkReadingMetrics({
        workId: 'work-1',
        reachedReaders: 4,
        completionRate: 0.5,
        retentionRate: 0.5,
        sampleSufficient: true,
      })
    ).toBe(false);

    // Rate outside [0, 1]
    expect(
      isValidWorkReadingMetrics({
        workId: 'work-1',
        reachedReaders: 5,
        completionRate: 1.01,
        retentionRate: 0.5,
        sampleSufficient: true,
      })
    ).toBe(false);

    expect(() => parseWorkReadingMetrics({ workId: '' })).toThrow(TypeError);
  });
});

describe('WorkChapterMetrics DTO validation (work_chapter_metrics)', () => {
  it('accepts empty arrays and valid per-chapter metric items', () => {
    expect(parseWorkChapterMetrics([])).toEqual([]);

    const rows: WorkChapterMetric[] = [
      {
        chapterId: 'ch-1',
        orderIndex: 0,
        reached: 5,
        completed: 4,
        completionRate: 0.8,
        nextOpened: 2,
        retentionRate: 0.5,
      },
      {
        chapterId: 'ch-2',
        orderIndex: 1,
        reached: 0,
        completed: 0,
        completionRate: null,
        nextOpened: 0,
        retentionRate: null,
      },
    ];
    expect(isValidWorkChapterMetrics(rows)).toBe(true);
    expect(parseWorkChapterMetrics(rows)).toEqual(rows);
  });

  it('rejects impossible denominator/numerator combinations', () => {
    // completed > reached
    expect(
      isValidWorkChapterMetric({
        chapterId: 'ch-1',
        orderIndex: 0,
        reached: 2,
        completed: 3,
        completionRate: 1,
        nextOpened: 0,
        retentionRate: null,
      })
    ).toBe(false);

    // nextOpened > completed
    expect(
      isValidWorkChapterMetric({
        chapterId: 'ch-1',
        orderIndex: 0,
        reached: 4,
        completed: 2,
        completionRate: 0.5,
        nextOpened: 3,
        retentionRate: 1,
      })
    ).toBe(false);

    // reached === 0 with non-null completionRate
    expect(
      isValidWorkChapterMetric({
        chapterId: 'ch-1',
        orderIndex: 0,
        reached: 0,
        completed: 0,
        completionRate: 0,
        nextOpened: 0,
        retentionRate: null,
      })
    ).toBe(false);

    // completed === 0 with non-null retentionRate
    expect(
      isValidWorkChapterMetric({
        chapterId: 'ch-1',
        orderIndex: 0,
        reached: 3,
        completed: 0,
        completionRate: 0,
        nextOpened: 0,
        retentionRate: 0,
      })
    ).toBe(false);

    expect(() => parseWorkChapterMetrics([null])).toThrow(TypeError);
  });
});

describe('ChapterDropoff DTO validation (chapter_dropoff)', () => {
  it('accepts zero-reach and populated 20-bucket dropoff payloads when sum(buckets) === reached - completed', () => {
    const empty: ChapterDropoff = {
      chapterId: 'ch-empty',
      bucketCount: 20,
      buckets: makeZeroBuckets(),
      reached: 0,
      completed: 0,
    };
    expect(isValidChapterDropoff(empty)).toBe(true);
    expect(parseChapterDropoff(empty)).toEqual(empty);

    const buckets = makeZeroBuckets();
    buckets[0] = 2;
    buckets[1] = 1;
    buckets[19] = 2;
    const populated: ChapterDropoff = {
      chapterId: 'ch-1',
      bucketCount: 20,
      buckets,
      reached: 7,
      completed: 2,
    };
    expect(isValidChapterDropoff(populated)).toBe(true);
    expect(parseChapterDropoff(populated)).toEqual(populated);
  });

  it('rejects non-20 bucket arrays, negative/non-integer bucket counts, or sum(buckets) !== reached - completed', () => {
    // 19 buckets instead of 20
    expect(
      isValidChapterDropoff({
        chapterId: 'ch-1',
        bucketCount: 20,
        buckets: Array.from({ length: 19 }, () => 0),
        reached: 0,
        completed: 0,
      })
    ).toBe(false);

    // bucket sum (1) !== reached (3) - completed (1)
    const mismatched = makeZeroBuckets();
    mismatched[0] = 1;
    expect(
      isValidChapterDropoff({
        chapterId: 'ch-1',
        bucketCount: 20,
        buckets: mismatched,
        reached: 3,
        completed: 1,
      })
    ).toBe(false);

    expect(() =>
      parseChapterDropoff({
        chapterId: 'ch-1',
        bucketCount: 20,
        buckets: mismatched,
        reached: 3,
        completed: 1,
      })
    ).toThrow(TypeError);
  });
});
