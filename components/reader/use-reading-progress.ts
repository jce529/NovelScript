'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import type { ChapterReadingState, ProgressRequest } from '@/lib/reader/chapter-reading';
import {
  SAVE_INTERVAL_MS,
  computeScrollRatio,
  createActiveTimeTracker,
  createSentinelTracker,
  readGeometry,
  restoreScrollTop,
  shouldSendSample,
  type ScrollRoot,
} from '@/lib/reader/scroll-progress';

/**
 * READ-04 (03-15): reading-progress controller and React hook.
 *
 * The controller is plain TypeScript with injected transport/clock/timers so every lifecycle
 * and loss boundary is testable with a mocked clock. It never throws into the reader: a failed
 * save only means the next sample (or a retry of the same one) is tried later.
 */

export type ProgressResult = { ok: true; state: ChapterReadingState } | { ok: false; status: number };
export type ProgressTransport = (req: ProgressRequest, opts: { keepalive: boolean }) => Promise<ProgressResult>;

export const PROGRESS_ENDPOINT = '/api/reader/progress';
const MAX_RETRIES = 3;
const INT4_MAX = 2_147_483_647;
const DEFAULT_MIN_ACTIVE_MS = 30_000;
export const RESTORE_TIMEOUT_MS = 1_500;

/** Network/HTTP failures become `{ ok:false, status }`; status 0 means no response. Never throws. */
export function createFetchTransport(fetchImpl: typeof fetch = (...a) => fetch(...a)): ProgressTransport {
  return async (req, { keepalive }) => {
    try {
      const res = await fetchImpl(PROGRESS_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req),
        keepalive,
        credentials: 'same-origin',
      });
      if (!res.ok) return { ok: false, status: res.status };
      const json = (await res.json()) as { ok?: boolean; state?: ChapterReadingState };
      if (json && json.ok === true && json.state) return { ok: true, state: json.state };
      return { ok: false, status: res.status };
    } catch {
      return { ok: false, status: 0 };
    }
  };
}

export interface ControllerOptions {
  workId: string;
  chapterId: string;
  sessionId: string;
  transport: ProgressTransport;
  clock: () => number;
  schedule: (fn: () => void, ms: number) => unknown;
  cancel: (handle: unknown) => void;
  minActiveMs?: number;
  onComplete?: (state: ChapterReadingState) => void;
}

interface Sample {
  ratio: number;
  activeMs: number;
  endVisibleMs: number;
  complete: boolean;
}

export function createReadingProgressController(opts: ControllerOptions) {
  const { transport, clock, schedule, cancel } = opts;
  const minActiveMs = opts.minActiveMs ?? DEFAULT_MIN_ACTIVE_MS;
  const startedAt = clock();
  const active = createActiveTimeTracker(startedAt);
  const sentinel = createSentinelTracker();

  let bootstrapped = false;
  let disposed = false;
  let blocked = false;
  let restoring = false;
  let ratio = 0;
  let completedAt: string | null = null;
  let completeRequested = false;
  let sequence = 0;
  let timer: unknown = null;

  let lastSentAt = startedAt - SAVE_INTERVAL_MS;
  let lastSentRatio = 0;
  let lastSentActive = 0;
  let lastSentComplete = false;

  let inFlight = false;
  let pending = false;
  let failed: { req: ProgressRequest; retries: number } | null = null;

  const build = (now: number): Sample => {
    const activeMs = Math.floor(active.read(now));
    return {
      ratio,
      activeMs,
      endVisibleMs: Math.min(INT4_MAX, Math.floor(sentinel.visibleMs(now))),
      complete: completedAt === null && !completeRequested && sentinel.isReached(now) && activeMs >= minActiveMs,
    };
  };

  const toRequest = (s: Sample, seq: number): ProgressRequest => ({
    operation: s.complete ? 'complete' : 'save',
    workId: opts.workId,
    chapterId: opts.chapterId,
    sessionId: opts.sessionId,
    sequence: seq,
    scrollRatio: s.ratio,
    sessionActiveMs: s.activeMs,
    endVisibleMs: s.endVisibleMs,
  });

  const changed = (s: Sample) =>
    s.ratio !== lastSentRatio || s.activeMs > lastSentActive || (s.complete && !lastSentComplete);

  const handle = (req: ProgressRequest, result: ProgressResult, keepalive: boolean) => {
    if (result.ok) {
      if (failed && failed.req.sequence <= req.sequence) failed = null;
      if (result.state.completedAt && completedAt === null) {
        completedAt = result.state.completedAt;
        if (req.operation === 'complete') opts.onComplete?.(result.state);
      }
      return;
    }
    const s = result.status;
    if (s === 401 || s === 403 || s === 404) {
      blocked = true;
      failed = null;
      return;
    }
    if (s === 0 || s === 429 || s >= 500) {
      // keep the newest failed sample only; retries reuse the same sequence
      const retries = failed && failed.req.sequence === req.sequence ? failed.retries : 0;
      if (!failed || req.sequence >= failed.req.sequence) failed = { req, retries };
    }
    void keepalive;
  };

  const dispatch = (req: ProgressRequest, keepalive: boolean) => {
    if (!keepalive) inFlight = true;
    let promise: Promise<ProgressResult>;
    try {
      promise = transport(req, { keepalive });
    } catch {
      promise = Promise.resolve({ ok: false, status: 0 } as ProgressResult);
    }
    void promise
      .catch((): ProgressResult => ({ ok: false, status: 0 }))
      .then((result) => {
        handle(req, result, keepalive);
        if (!keepalive) {
          inFlight = false;
          if (pending && !disposed && !blocked) {
            pending = false;
            sendFresh(false);
          }
        }
      });
  };

  /** Builds and sends a new sample with the next sequence. */
  function sendFresh(keepalive: boolean) {
    const now = clock();
    const s = build(now);
    failed = null;
    sequence += 1;
    lastSentAt = now;
    lastSentRatio = s.ratio;
    lastSentActive = s.activeMs;
    if (s.complete) {
      lastSentComplete = true;
      completeRequested = true;
    }
    dispatch(toRequest(s, sequence), keepalive);
  }

  function evaluate() {
    if (!bootstrapped || disposed || blocked) return;
    const now = clock();
    const s = build(now);
    const due = shouldSendSample({
      now, lastSentAt, ratio: s.ratio, lastSentRatio, activeMs: s.activeMs, lastSentActiveMs: lastSentActive,
      completeCandidate: s.complete, lastSentComplete,
    });
    if (due) {
      if (inFlight) pending = true;
      else sendFresh(false);
      return;
    }
    if (failed && !inFlight && now - lastSentAt >= SAVE_INTERVAL_MS) {
      if (failed.retries >= MAX_RETRIES) {
        failed = null;
        return;
      }
      const retry = { req: failed.req, retries: failed.retries + 1 };
      failed = retry;
      lastSentAt = now;
      dispatch(retry.req, false);
    }
  }

  function arm() {
    if (disposed) return;
    timer = schedule(() => {
      timer = null;
      evaluate();
      arm();
    }, SAVE_INTERVAL_MS);
  }

  function flush() {
    if (!bootstrapped || disposed || blocked) return;
    const now = clock();
    const s = build(now);
    if (changed(s)) {
      // best-effort exit save: a larger sequence goes out immediately, never queued behind
      // an in-flight request; the server's stale-sequence guard keeps ordering safe
      sendFresh(true);
    } else if (failed) {
      dispatch(failed.req, true);
    }
  }

  return {
    bootstrap(state: ChapterReadingState | null) {
      if (disposed || bootstrapped) return;
      if (!state) {
        blocked = true; // no server-side visit was opened; reading continues untouched
        return;
      }
      bootstrapped = true;
      sequence = state.lastSequence;
      ratio = state.scrollRatio;
      lastSentRatio = state.scrollRatio;
      completedAt = state.completedAt;
      lastSentAt = clock() - SAVE_INTERVAL_MS;
      arm();
    },
    setRatio(next: number) {
      if (disposed) return;
      ratio = Math.min(1, Math.max(0, Number.isFinite(next) ? next : 0));
      if (!restoring) active.activity(clock());
    },
    activity() {
      if (disposed || restoring) return;
      active.activity(clock());
    },
    setVisible(visible: boolean) {
      if (disposed) return;
      const now = clock();
      active.setVisible(visible, now);
      if (!visible) {
        sentinel.reset();
        flush();
      }
    },
    setSentinel(full: boolean) {
      if (disposed || restoring) return;
      sentinel.setFullyVisible(full, clock());
    },
    beginRestore() {
      restoring = true;
    },
    endRestore() {
      restoring = false;
      sentinel.reset();
    },
    flush,
    dispose() {
      if (disposed) return;
      flush();
      disposed = true;
      if (timer !== null) cancel(timer);
      timer = null;
    },
  };
}

export type ReadingProgressController = ReturnType<typeof createReadingProgressController>;

/** Runs the restore and ALWAYS releases (finally + timeout), so content never stays hidden. */
export async function restoreWithRelease(o: {
  restore: () => Promise<void>;
  release: () => void;
  schedule: (fn: () => void, ms: number) => unknown;
  cancel: (handle: unknown) => void;
  timeoutMs?: number;
}): Promise<void> {
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    o.release();
  };
  const handle = o.schedule(release, o.timeoutMs ?? RESTORE_TIMEOUT_MS);
  try {
    await o.restore();
  } catch {
    // a failed restore only means the reader starts at the top
  } finally {
    o.cancel(handle);
    release();
  }
}

export interface UseReadingProgressOptions {
  chapterId: string;
  workId: string;
  readable: boolean;
  loggedIn: boolean;
  bodyRef: RefObject<HTMLElement | null>;
  /** null/undefined = window scrolls; otherwise the element that scrolls (verified live in 03-19). */
  scrollRoot?: RefObject<HTMLElement | null> | null;
  /** Bottom sentinel; 03-16 renders it. Without it no completion candidate is produced. */
  sentinelRef?: RefObject<HTMLElement | null>;
  /** Snapshot returned by the 03-13 open action. null = open failed, undefined = not yet returned. */
  initialState?: ChapterReadingState | null;
  /** Per-visit id. Pass the same id used for the open action; generated when omitted. */
  sessionId?: string;
  onLastChapterEnd?: (state: ChapterReadingState) => void;
}

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
const SAFE_AREA_PX = 56;

export function useReadingProgress(options: UseReadingProgressOptions) {
  const { chapterId, workId, readable, loggedIn, bodyRef, scrollRoot, sentinelRef, initialState } = options;
  const [generatedSession] = useState(() => crypto.randomUUID());
  const sessionId = options.sessionId ?? generatedSession;
  const [restoring, setRestoring] = useState(false);
  const controllerRef = useRef<ReadingProgressController | null>(null);
  const restoreRef = useRef<(ratio: number) => void>(() => {});
  const onEndRef = useRef(options.onLastChapterEnd);
  const enabled = readable && loggedIn;

  useEffect(() => {
    onEndRef.current = options.onLastChapterEnd;
  });

  useEffect(() => {
    if (!enabled) return;
    const rootEl = scrollRoot?.current ?? null;
    const root: ScrollRoot = rootEl ? { kind: 'element', el: rootEl } : { kind: 'window', win: window };
    const target: HTMLElement | Window = rootEl ?? window;
    const controller = createReadingProgressController({
      workId, chapterId, sessionId,
      transport: createFetchTransport(),
      clock: () => Date.now(),
      schedule: (fn, ms) => window.setTimeout(fn, ms),
      cancel: (h) => window.clearTimeout(h as number),
      onComplete: (state) => onEndRef.current?.(state),
    });
    controllerRef.current = controller;
    let suppressScrollUntil = 0;
    let sentinelFull = false;
    let disposed = false;

    const geometry = () => (bodyRef.current ? readGeometry(root, bodyRef.current) : null);

    const onScroll = () => {
      if (performance.now() < suppressScrollUntil) return;
      const g = geometry();
      if (g) controller.setRatio(computeScrollRatio(g));
    };
    const onActivity = () => controller.activity();
    const onVisibility = () => controller.setVisible(document.visibilityState === 'visible');
    const onPageHide = () => controller.flush();

    const scrollToRatio = (ratio: number) => {
      const g = geometry();
      if (!g) return;
      suppressScrollUntil = performance.now() + 150;
      const top = restoreScrollTop(ratio, g);
      if (rootEl) rootEl.scrollTo({ top, behavior: 'instant' });
      else window.scrollTo({ top, behavior: 'instant' });
    };
    restoreRef.current = scrollToRatio;

    target.addEventListener('scroll', onScroll, { passive: true });
    for (const e of ACTIVITY_EVENTS) window.addEventListener(e, onActivity, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);

    let io: IntersectionObserver | null = null;
    if (sentinelRef?.current && typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(
        (entries) => {
          const last = entries[entries.length - 1];
          sentinelFull = !!last && last.isIntersecting && last.intersectionRatio >= 1;
          controller.setSentinel(sentinelFull);
        },
        { root: rootEl, threshold: 1, rootMargin: `0px 0px -${SAFE_AREA_PX}px 0px` },
      );
      io.observe(sentinelRef.current);
    }

    // font size / margin changes reflow the body: keep the reading position by ratio
    let ro: ResizeObserver | null = null;
    let lastHeight = bodyRef.current?.getBoundingClientRect().height ?? 0;
    let lastRatio = 0;
    const trackRatio = () => { const g = geometry(); if (g) lastRatio = computeScrollRatio(g); };
    target.addEventListener('scroll', trackRatio, { passive: true });
    if (bodyRef.current && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        const h = bodyRef.current?.getBoundingClientRect().height ?? 0;
        if (h === lastHeight) return;
        lastHeight = h;
        controller.beginRestore();
        scrollToRatio(lastRatio);
        requestAnimationFrame(() => {
          controller.endRestore();
          if (!disposed) controller.setSentinel(sentinelFull);
        });
      });
      ro.observe(bodyRef.current);
    }

    return () => {
      disposed = true;
      target.removeEventListener('scroll', onScroll);
      target.removeEventListener('scroll', trackRatio);
      for (const e of ACTIVITY_EVENTS) window.removeEventListener(e, onActivity);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      io?.disconnect();
      ro?.disconnect();
      controller.dispose();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [enabled, chapterId, workId, sessionId, bodyRef, scrollRoot, sentinelRef]);

  // bootstrap with the open-action snapshot, then restore the saved position
  useEffect(() => {
    const controller = controllerRef.current;
    if (!enabled || !controller || initialState === undefined) return;
    controller.bootstrap(initialState);
    const saved = initialState?.scrollRatio ?? 0;
    if (saved <= 0) return;
    let cancelled = false;
    controller.beginRestore();
    queueMicrotask(() => { if (!cancelled) setRestoring(true); });
    void restoreWithRelease({
      restore: async () => {
        await (document.fonts?.ready ?? Promise.resolve());
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        if (!cancelled) restoreRef.current(saved);
      },
      release: () => {
        controller.endRestore();
        if (!cancelled) setRestoring(false);
      },
      schedule: (fn, ms) => window.setTimeout(fn, ms),
      cancel: (h) => window.clearTimeout(h as number),
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, initialState]);

  return {
    sessionId,
    /** True only while a saved position is being restored; the viewer fades the body with it. */
    restoring: enabled && restoring,
    flush: () => controllerRef.current?.flush(),
  };
}
