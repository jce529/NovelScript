---
phase: 03-reader-core-reading-loop-no-payment
plan: "15"
subsystem: reader-progress
tags: [scroll-progress, reading-progress, controller, tdd, READ-04]
requires:
  - "POST /api/reader/progress + ChapterReadingState (03-13)"
provides:
  - "lib/reader/scroll-progress.ts (computeScrollRatio, restoreScrollTop, readGeometry, createActiveTimeTracker, createSentinelTracker, shouldSendSample)"
  - "components/reader/use-reading-progress.ts (createReadingProgressController, createFetchTransport, restoreWithRelease, useReadingProgress)"
affects: ["03-16", "03-19"]
tech-stack:
  added: []
  patterns: ["injected clock/schedule/transport controller", "ScrollRoot window|element interface", "keepalive fetch exit flush, no sendBeacon"]
key-files:
  created:
    - lib/reader/scroll-progress.ts
    - components/reader/use-reading-progress.ts
    - tests/reader/scroll-progress.test.ts
    - tests/reader/reading-progress-controller.test.ts
  modified: []
decisions:
  - "Scroll root is an interface (window | element). viewer-shell markup (outer min-h-screen, main flex-1 overflow-y-auto without fixed height) suggests the window scrolls, but this is not proven; the live check is 03-19"
  - "Complete is attempted once per visit (the sample that first meets 30s active + 1s sentinel). If the server answers without completedAt, no automatic second attempt; a transport failure retries the same sequence"
  - "Retries reuse the failed sample and sequence up to 3 times at the 5s tick; a fresh due sample supersedes it with the next sequence. 401/403/404 stop saving for the visit; 400 drops the sample; 0/429/5xx are retryable"
  - "bootstrap(null) (open action failed) disables saving for the visit; reading is unaffected"
  - "Hidden/pagehide/dispose flush sends a larger sequence immediately with keepalive, bypassing the in-flight slot; the server stale-sequence guard orders them"
  - "Restore and body-resize re-anchoring run in a restoring window: no activity, no sentinel. After it ends the sentinel dwell restarts, so a saved ratio of 1 cannot instantly yield a complete candidate"
metrics:
  duration: "~25m"
  completed: "2026-10-17"
requirements: [READ-04]
---

# Phase 3 Plan 15: Scroll geometry, active time and progress controller Summary

Added the body-relative scroll ratio and restore math, the hidden/idle-aware active-time tracker, the sentinel dwell tracker, and a mock-clock-testable controller that sends progress to `/api/reader/progress`. A `useReadingProgress` hook is built on it but is not wired into the viewer yet (03-16).

## Tasks

| # | Task | Commits | Files |
|---|------|---------|-------|
| 1 | Position and active-time state machines (TDD) | 8d8031b (RED), 4c7f14e (GREEN) | lib/reader/scroll-progress.ts, tests/reader/scroll-progress.test.ts |
| 2 | Lifecycle and fetch controller plus hook (TDD) | 071d3fa (RED), 10e7896 (GREEN) | components/reader/use-reading-progress.ts, tests/reader/reading-progress-controller.test.ts |

## What was built

- **scroll-progress.ts:** ratio = (scrollTop - bodyTop) / (bodyHeight - viewport), clamped 0..1, with the exact inverse `restoreScrollTop`. A body not taller than the viewport is "short": ratio 0, end decided by the sentinel only. `readGeometry` gives identical body-relative geometry for window and element roots. The active-time tracker counts only visible time within 120s of the last interaction. The sentinel tracker needs 1000ms continuous 100% visibility and resets on any gap. `shouldSendSample` applies the 5s throttle and skips ratio moves under 1%p, but active-time growth or a new complete candidate is always saved.
- **Controller:** nothing is sent before `bootstrap(snapshot)`, but visible time counts from session start. One in-flight request plus a single latest pending sample. Sequences are monotonic from `snapshot.lastSequence + 1`. The payload is exactly the 8 DTO keys (well under 8KB). Errors never throw into the reader.
- **Hook:** `useReadingProgress({chapterId, workId, readable, loggedIn, bodyRef, scrollRoot, initialState, onLastChapterEnd})`, plus optional `sentinelRef` and `sessionId`. Disabled unless `readable && loggedIn`. It registers scroll, activity, visibilitychange, pagehide, an IntersectionObserver (threshold 1, 56px bottom safe area) and a ResizeObserver that keeps the ratio after font/margin reflow, and removes all of them on cleanup. It restores after `document.fonts.ready` plus rAF; the `restoring` flag (for the body opacity) is released in finally and by a 1.5s timeout. `onLastChapterEnd` fires when a complete is accepted.

## Verification

- `npx vitest run tests/reader/reading-progress-controller.test.ts tests/reader/scroll-progress.test.ts`: 42 passed.
- `npx vitest run tests/reader`: 298 passed, 36 skipped (DB suites).
- `npx tsc --noEmit`: clean except the pre-existing `tests/payments/*` errors. `npx eslint` on the 4 files: clean.
- Local Next guides (server-and-client-components.md, link.md) were read; nothing here conflicts (client-only hook file with `'use client'`).

## Pending gates (not claimed as done)

- No browser run: the actual scroll root (window vs element), real `keepalive` fetch on pagehide, IntersectionObserver with the safe-area margin, ResizeObserver re-anchoring, and fonts/rAF restore are untested in a DOM. The hook itself has no unit test (node environment); only the controller, transport and restore helper are. All belong to 03-19.
- 0024/0025 are still unapplied, so the end-to-end save and complete path is unverified.
- The viewer does not call the hook yet: nothing saves scroll progress in the running app until 03-16 wires it, passes the same `sessionId` to `trackChapterOpenAction`, and renders the sentinel and `bodyRef`.
- `graphify update .` and the requirements link script were not run, as instructed. STATE.md and ROADMAP.md were not edited, as instructed.

## Deviations from Plan

- **[Rule 2 - Scope] Extra hook options** `sentinelRef` and `sessionId` beyond the listed signature: the sentinel element and the shared per-visit session id are needed by 03-16 and cannot be derived otherwise.
- **[Rule 3 - Lint]** `setRestoring(true)` is deferred with `queueMicrotask` to satisfy the `react-hooks/set-state-in-effect` rule.

## Known Stubs

None. The hook is intentionally unwired until 03-16 (see above).

## Self-Check: PASSED

- FOUND: lib/reader/scroll-progress.ts, components/reader/use-reading-progress.ts, tests/reader/scroll-progress.test.ts, tests/reader/reading-progress-controller.test.ts
- FOUND: 8d8031b, 4c7f14e, 071d3fa, 10e7896
