import { describe, it, expect } from 'vitest';
import {
  computeScrollRatio,
  restoreScrollTop,
  isShortBody,
  readGeometry,
  createActiveTimeTracker,
  createSentinelTracker,
  shouldSendSample,
  IDLE_LIMIT_MS,
  SENTINEL_DWELL_MS,
  SAVE_INTERVAL_MS,
  MIN_RATIO_DELTA,
  type ScrollGeometry,
} from '../../lib/reader/scroll-progress';

// body starts 200px into the scroll content, is 3000px tall, viewport is 800px => scrollable span 2200
const G: ScrollGeometry = { scrollTop: 0, viewportHeight: 800, bodyTop: 200, bodyHeight: 3000 };

describe('computeScrollRatio / restoreScrollTop', () => {
  it('is 0 before the body start and 1 after the body end (clamped)', () => {
    expect(computeScrollRatio({ ...G, scrollTop: 0 })).toBe(0);
    expect(computeScrollRatio({ ...G, scrollTop: 200 })).toBe(0);
    expect(computeScrollRatio({ ...G, scrollTop: 2400 })).toBe(1);
    expect(computeScrollRatio({ ...G, scrollTop: 9000 })).toBe(1);
  });
  it('measures only the body span, not header/footer', () => {
    expect(computeScrollRatio({ ...G, scrollTop: 1300 })).toBeCloseTo(0.5, 5);
  });
  it('restore is the exact inverse of ratio in the same coordinate system', () => {
    for (const r of [0, 0.01, 0.37, 0.5, 0.999, 1]) {
      const top = restoreScrollTop(r, G);
      expect(computeScrollRatio({ ...G, scrollTop: top })).toBeCloseTo(r, 6);
    }
    expect(restoreScrollTop(2, G)).toBe(restoreScrollTop(1, G));
    expect(restoreScrollTop(-1, G)).toBe(200);
  });
  it('short body (not taller than the viewport): ratio 0, flagged short', () => {
    const s = { ...G, bodyHeight: 500 };
    expect(isShortBody(s)).toBe(true);
    expect(computeScrollRatio(s)).toBe(0);
    expect(restoreScrollTop(0.8, s)).toBe(200);
    expect(isShortBody(G)).toBe(false);
  });
});

describe('readGeometry (window and element give the same body-relative geometry)', () => {
  const body = (top: number) => ({ getBoundingClientRect: () => ({ top, height: 3000 }) });
  it('window root', () => {
    const win = { scrollY: 150, innerHeight: 800 };
    const g = readGeometry({ kind: 'window', win }, body(50) as unknown as HTMLElement);
    expect(g).toEqual({ scrollTop: 150, viewportHeight: 800, bodyTop: 200, bodyHeight: 3000 });
  });
  it('element root', () => {
    const root = { scrollTop: 150, clientHeight: 800, getBoundingClientRect: () => ({ top: 100 }) };
    // body rect top 150 relative to viewport, root rect top 100 => 50 inside root viewport => +scrollTop 150 = 200
    const g = readGeometry({ kind: 'element', el: root as unknown as HTMLElement }, body(150) as unknown as HTMLElement);
    expect(g).toEqual({ scrollTop: 150, viewportHeight: 800, bodyTop: 200, bodyHeight: 3000 });
  });
});

describe('active time tracker', () => {
  it('accumulates visible time with recent interaction', () => {
    const t = createActiveTimeTracker(0);
    expect(t.read(10_000)).toBe(10_000);
  });
  it('hidden time counts zero', () => {
    const t = createActiveTimeTracker(0);
    t.setVisible(false, 5_000);
    expect(t.read(60_000)).toBe(5_000);
    t.setVisible(true, 60_000);
    t.activity(60_000);
    expect(t.read(65_000)).toBe(10_000);
  });
  it('stops after the 120s idle limit and resumes on real activity', () => {
    const t = createActiveTimeTracker(0);
    expect(t.read(IDLE_LIMIT_MS + 50_000)).toBe(IDLE_LIMIT_MS);
    t.activity(300_000);
    expect(t.read(310_000)).toBe(IDLE_LIMIT_MS + 10_000);
  });
  it('read is idempotent for the same instant', () => {
    const t = createActiveTimeTracker(0);
    expect(t.read(1000)).toBe(1000);
    expect(t.read(1000)).toBe(1000);
  });
});

describe('sentinel tracker (100% visible for 1000ms continuously)', () => {
  it('999ms is not enough, 1000ms is', () => {
    const s = createSentinelTracker();
    s.setFullyVisible(true, 0);
    expect(s.isReached(SENTINEL_DWELL_MS - 1)).toBe(false);
    expect(s.isReached(SENTINEL_DWELL_MS)).toBe(true);
    expect(s.visibleMs(2500)).toBe(2500);
  });
  it('leaving resets the continuous time', () => {
    const s = createSentinelTracker();
    s.setFullyVisible(true, 0);
    s.setFullyVisible(false, 900);
    s.setFullyVisible(true, 1000);
    expect(s.isReached(1999)).toBe(false);
    expect(s.isReached(2000)).toBe(true);
  });
  it('hidden/reset clears it', () => {
    const s = createSentinelTracker();
    s.setFullyVisible(true, 0);
    s.reset();
    expect(s.isReached(5000)).toBe(false);
    expect(s.visibleMs(5000)).toBe(0);
  });
});

describe('shouldSendSample (5s throttle, 1%p generic skip)', () => {
  const base = { now: 10_000, lastSentAt: 0, ratio: 0.5, lastSentRatio: 0.5, activeMs: 1000, lastSentActiveMs: 1000, completeCandidate: false, lastSentComplete: false };
  it('waits for the 5s interval', () => {
    expect(shouldSendSample({ ...base, now: SAVE_INTERVAL_MS - 1, ratio: 0.9 })).toBe(false);
    expect(shouldSendSample({ ...base, now: SAVE_INTERVAL_MS, ratio: 0.9 })).toBe(true);
  });
  it('skips when nothing changed', () => {
    expect(shouldSendSample(base)).toBe(false);
  });
  it('skips ratio change below 1%p when active time did not move', () => {
    expect(shouldSendSample({ ...base, ratio: 0.5 + MIN_RATIO_DELTA / 2 })).toBe(false);
    expect(shouldSendSample({ ...base, ratio: 0.5 + MIN_RATIO_DELTA })).toBe(true);
  });
  it('active time growth alone is saved even with no scroll', () => {
    expect(shouldSendSample({ ...base, activeMs: 6000 })).toBe(true);
  });
  it('a new complete candidate is saved', () => {
    expect(shouldSendSample({ ...base, completeCandidate: true })).toBe(true);
    expect(shouldSendSample({ ...base, completeCandidate: true, lastSentComplete: true })).toBe(false);
  });
});
