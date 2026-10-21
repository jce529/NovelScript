/**
 * READ-04 (03-15): pure scroll geometry, active-time and sentinel state machines.
 *
 * No DOM or timers live here; every function takes explicit time/geometry so it is
 * deterministic in node tests. The provisional thresholds (30s floor, 120s idle, 1s sentinel)
 * come from 03-RESEARCH-REOPEN and are server-judged again by complete_chapter.
 */

export const IDLE_LIMIT_MS = 120_000;
export const SENTINEL_DWELL_MS = 1_000;
export const SAVE_INTERVAL_MS = 5_000;
export const MIN_RATIO_DELTA = 0.01;

/** Body-relative geometry, all in one coordinate system (scroll content px). */
export interface ScrollGeometry {
  scrollTop: number;
  viewportHeight: number;
  /** Offset of the body's top edge from the top of the scroll content. */
  bodyTop: number;
  bodyHeight: number;
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const span = (g: ScrollGeometry) => g.bodyHeight - g.viewportHeight;

/** A body that fits in the viewport has no scroll span; the end is judged by the sentinel. */
export function isShortBody(g: ScrollGeometry): boolean {
  return span(g) <= 0;
}

/** ratio = (scrollTop - bodyTop) / (bodyHeight - viewportHeight), clamped to 0..1. Header,
 * footer and lock notices are outside the body so they never enter the denominator. */
export function computeScrollRatio(g: ScrollGeometry): number {
  if (isShortBody(g)) return 0;
  return clamp01((g.scrollTop - g.bodyTop) / span(g));
}

/** Inverse of computeScrollRatio in the same coordinate system. */
export function restoreScrollTop(ratio: number, g: ScrollGeometry): number {
  return g.bodyTop + clamp01(ratio) * Math.max(0, span(g));
}

/**
 * The scroll root is an interface, not an assumption. viewer-shell markup (outer
 * `min-h-screen`, `main` with `flex-1 overflow-y-auto` but no fixed height) suggests the
 * window scrolls, yet markup alone does not prove it; the live check is gate 03-19.
 */
export type ScrollRoot =
  | { kind: 'window'; win: { scrollY: number; innerHeight: number } }
  | { kind: 'element'; el: HTMLElement };

export function readGeometry(root: ScrollRoot, body: HTMLElement): ScrollGeometry {
  const rect = body.getBoundingClientRect();
  if (root.kind === 'window') {
    return {
      scrollTop: root.win.scrollY,
      viewportHeight: root.win.innerHeight,
      bodyTop: rect.top + root.win.scrollY,
      bodyHeight: rect.height,
    };
  }
  const rootRect = root.el.getBoundingClientRect();
  return {
    scrollTop: root.el.scrollTop,
    viewportHeight: root.el.clientHeight,
    bodyTop: rect.top - rootRect.top + root.el.scrollTop,
    bodyHeight: rect.height,
  };
}

/** Counts a time slice only while visible AND within IDLE_LIMIT_MS of the last interaction. */
export function createActiveTimeTracker(startAt: number, idleMs: number = IDLE_LIMIT_MS) {
  let total = 0;
  let mark = startAt;
  let lastInteraction = startAt;
  let visible = true;

  const advance = (now: number) => {
    if (now <= mark) return;
    if (visible) {
      const end = Math.min(now, lastInteraction + idleMs);
      if (end > mark) total += end - mark;
    }
    mark = now;
  };

  return {
    read(now: number): number {
      advance(now);
      return total;
    },
    activity(now: number): void {
      advance(now);
      lastInteraction = Math.max(lastInteraction, now);
    },
    setVisible(next: boolean, now: number): void {
      advance(now);
      visible = next;
    },
  };
}

/** Tracks continuous 100% sentinel visibility. Any gap restarts the dwell. */
export function createSentinelTracker(dwellMs: number = SENTINEL_DWELL_MS) {
  let since: number | null = null;
  return {
    setFullyVisible(full: boolean, now: number): void {
      if (full) {
        if (since === null) since = now;
      } else {
        since = null;
      }
    },
    reset(): void {
      since = null;
    },
    visibleMs(now: number): number {
      return since === null ? 0 : Math.max(0, now - since);
    },
    isReached(now: number): boolean {
      return since !== null && now - since >= dwellMs;
    },
  };
}

export interface SampleDecisionInput {
  now: number;
  lastSentAt: number;
  ratio: number;
  lastSentRatio: number;
  activeMs: number;
  lastSentActiveMs: number;
  completeCandidate: boolean;
  lastSentComplete: boolean;
}

/** 5s throttle; a ratio move under 1%p is skipped, but active-time growth or a new complete
 * candidate is always worth saving even without any scroll change. */
export function shouldSendSample(i: SampleDecisionInput): boolean {
  if (i.now - i.lastSentAt < SAVE_INTERVAL_MS) return false;
  if (i.completeCandidate && !i.lastSentComplete) return true;
  if (i.activeMs > i.lastSentActiveMs) return true;
  return Math.abs(i.ratio - i.lastSentRatio) >= MIN_RATIO_DELTA - 1e-9;
}
