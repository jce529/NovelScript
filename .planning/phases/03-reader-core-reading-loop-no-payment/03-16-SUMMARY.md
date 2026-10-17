---
phase: 03-reader-core-reading-loop-no-payment
plan: "16"
subsystem: reader-viewer
tags: [viewer, chrome, reading-progress, cookie-preferences, READ-02, READ-03, READ-04, READ-05, READ-07]
requires: ["03-08", "03-13", "03-14", "03-15"]
provides:
  - "lib/reader/viewer-chrome.ts (pure chrome reducer, tap rules, prev/next boundary, end-dialog one-shot)"
  - "ViewerShell wired to cookie preferences, useReadingProgress, ViewerSettingsPopover, TocSheet"
  - "Viewer page: ns_viewer cookie decode, reading state + subscription state, viewportFit cover"
affects: ["03-19"]
key-files:
  created: [lib/reader/viewer-chrome.ts, tests/reader/viewer-chrome.test.ts, tests/reader/viewer-wiring.test.ts]
  modified: [components/reader/viewer-shell.tsx, components/reader/toc-sheet.tsx, "app/works/[workId]/chapters/[chapterId]/page.tsx"]
decisions:
  - "Page keys ViewerShell by chapter.id so each chapter is a new visit (fresh sessionId, scroll start)"
  - "Hook initialState waits for the trackChapterOpenAction snapshot (same sessionId); open failure falls back to the server initialReadingState"
  - "End dialog uses its own 1s full-sentinel observer armed only by real user interaction, so restore/reflow cannot trigger it; hook onLastChapterEnd is not used (it fires only after a successful complete save)"
  - "Legacy ViewerSettingsSheet and sepia theme are no longer used by the shell"
metrics:
  tasks: 2
  completed: 2026-10-17
---

# Phase 3 Plan 16: Viewer chrome and progress wiring Summary

Tap-to-reveal viewer with hidden-by-default fixed bars, cookie-backed 5-key preferences, and the 03-15 progress hook sharing one session id with the chapter-open action.

## Commits
- 276aa62 feat(03-16): viewer chrome tap/overlay/boundary reducer
- 527a60d feat(03-16): wire cookie prefs, progress hook, chrome bars and end dialog into viewer

## What was built
- Chrome reducer: initial hidden; tap toggles only if moved <10px, no selection, no interactive ancestor; overlays (toc/settings/report) pin the bar and refuse hide; first chapter prev disabled; last chapter next is a muted button opening a "마지막 화예요 / 새 회차 알림 켜기" dialog; sentinel opens it once per visit, explicit next click reopens; already-subscribed or guest never calls toggleSubscriptionAction.
- Shell: fixed top (home, TOC, title, settings popover) and bottom (prev, disabled "댓글 (준비 중)", next) bars using transform slide, `inert`/`aria-hidden` when hidden, env safe-area insets, motion-reduce, an always-focusable "읽기 메뉴 열기" button, Escape hides. Preferences apply via viewer.module.css root class plus 5 CSS variables and data attributes. Prev/next/TOC use `Link scroll={false}` and flush the controller. Body ref and sentinel feed useReadingProgress; blinded/purchase/unavailable/guest keep the controller disabled and never render content.
- Page: preserves notFound/pair check, reads `ns_viewer` via `await cookies()`, loads getChapterReadingState only for a logged-in reader of a readable chapter (failure -> null), loads getSubscriptionState, exports `viewport = { viewportFit: 'cover' }`.

## Verification
- `npx vitest run tests/reader/viewer-wiring.test.ts tests/reader/viewer-chrome.test.ts tests/reader/reading-progress-controller.test.ts`: 48 passed.
- `tsc --noEmit` (excluding pre-existing tests/payments) and eslint on changed files: clean.
- `vitest run tests/reader tests/studio/client-bundle-fs-free.test.ts`: 322 passed; 2 failures in `tests/reader/subscriptions.test.ts` (|db| tests, no live DB available, unrelated to this plan).

## Deviations from Plan
None requiring a rule change. Notes: the SSR wiring test mocks `useReadingProgress` to capture its options (hook lifecycle stays covered by 03-15 tests). Python was unavailable so edits were done with the Edit tool.

## Known gaps (gate 03-19, not faked)
- Real browser geometry, focus return after overlays, tap-vs-selection on touch, sticky-bar no-reflow, scroll restore with the window as scroll root, and IntersectionObserver end-dialog timing are unverified.
- No live DB: open snapshot -> restore, and toggleSubscriptionAction end-to-end not exercised.
- Per instructions STATE.md, ROADMAP.md and graphify were not touched; 03-20 owns doc sync. `graphify update .` and `graph-link-requirements.py` still pending.

## Known Stubs
- "댓글 (준비 중)" disabled button is an intentional placeholder (comments out of scope per plan).

## Self-Check: PASSED
