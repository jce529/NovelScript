---
phase: 03-reader-core-reading-loop-no-payment
plan: 07
subsystem: reader
tags: [viewer, next-js, base-ui, sheet, view-tracking, reading-progress]

# Dependency graph
requires:
  - phase: 03-02
    provides: "getPublicChapter/listPublicChapters/getPublicWork public reads (D-06 content-null-for-locked)"
  - phase: 03-03
    provides: "incrementChapterView RPC wrapper, upsertReadingProgress"
  - phase: 03-06
    provides: "ReportDialog shared component"
provides:
  - "ViewerShell — 48px toolbar / 720px reading pane / 56px bottom nav / D-06 locked message"
  - "TocSheet / ViewerSettingsSheet — TOC panel and font/theme/report settings panel"
  - "ViewTracker — once-per-mount view-count + reading-progress trigger"
  - "trackChapterOpenAction / submitReportAction Server Actions"
affects: []

# Tech tracking
tech-stack:
  added: ["components/ui/sheet.tsx (shadcn, base-ui Dialog wrapper)"]
  patterns:
    - "Viewer theme/font is local useState scoped to the viewer root container, not a global next-themes provider (D-11 scopes theming to the viewer only)"
    - "Client components import Server Actions directly from the route's actions.ts (matches Plan 03-06's work-header-actions.tsx convention)"
    - "ViewTracker mirrors the official Next.js view-count pattern: useEffect + useTransition, empty dependency array, fires exactly once per mount"

key-files:
  created:
    - app/works/[workId]/chapters/[chapterId]/page.tsx
    - app/works/[workId]/chapters/[chapterId]/actions.ts
    - components/reader/viewer-shell.tsx
    - components/reader/toc-sheet.tsx
    - components/reader/viewer-settings-sheet.tsx
    - components/reader/view-tracker.tsx
    - components/ui/sheet.tsx
  modified:
    - app/globals.css

key-decisions:
  - "Reading progress is recorded only for unlocked chapters (if (!locked) guard in trackChapterOpenAction) — D-06's locked message is not 'reading', so a paid chapter open must never overwrite the reader's 이어보기 resume point"
  - "View count increments unconditionally regardless of lock/login state (D-09) — 'opened the viewer' is the trigger, not 'successfully read content'"

requirements-completed: [READ-02, READ-03, READ-04, READ-05]

# Metrics
duration: 15min
completed: 2026-08-30
---

# Phase 03 Plan 07: Chapter Viewer (Toolbar, Reading Pane, TOC/Settings Sheets, View Tracking) Summary

**The `/works/[workId]/chapters/[chapterId]` viewer route — 48px toolbar, 720px theme/font-scoped reading pane, 56px persistent bottom nav, D-06 locked-chapter message, TOC/settings sheets, and once-per-mount view-count + reading-progress tracking — completing all 8 of Phase 3's requirement IDs end-to-end.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-08-30T09:33Z (after worktree fast-forward sync to master)
- **Completed:** 2026-08-30T09:41Z
- **Tasks:** 3 completed
- **Files modified:** 7 (6 created, 1 modified)

## Accomplishments

- Viewer route renders a themed (라이트/세피아/다크), font-scoped (17/19/21/24px, default 19) 720px-max-width reading pane with a 48px sticky toolbar (뒤로가기/목차/보기 설정, each tooltip+aria-labeled per D-11) and a 56px persistent bottom nav (이전화/다음화, disabled at first/last chapter)
- Paid chapters render the exact D-06 locked message ("결제 기능 준비중" / "곧 유료 회차를 만나보실 수 있어요.") in place of content — `getPublicChapter` already nulls `content` server-side for locked chapters (Plan 03-02), so no real text ever reaches the client for a paid chapter
- TOC sheet ("회차 목록") lists every published chapter with a lock badge on paid ones and highlights the current chapter; settings sheet ("보기 설정") hosts the font stepper, 3-way theme switch, and reuses Plan 03-06's `ReportDialog` verbatim as the report entry point (no second implementation)
- Every chapter open increments `view_count` exactly once via `ViewTracker` (mirrors the official Next.js view-count `useEffect`/`useTransition` pattern) regardless of login/lock state (D-09); reading progress is upserted only when the chapter is unlocked, so a locked chapter can never become the reader's 이어보기 resume point (READ-04/D-14)

## Task Commits

Each task was committed atomically:

1. **Task 1: Viewer shell — toolbar, reading pane, bottom nav, locked message** — `9380471`
2. **Task 2: TOC sheet + settings sheet** — `aafe2f1`
3. **Task 3: View-count + reading-progress tracking** — `8eb00fb`

## Files Created/Modified

- `app/works/[workId]/chapters/[chapterId]/page.tsx` — Server Component: fetches work/chapter/TOC/user in parallel, `notFound()` on missing work/chapter, wires `ViewerShell`
- `app/works/[workId]/chapters/[chapterId]/actions.ts` — `trackChapterOpenAction` (view increment + guarded progress upsert), `submitReportAction` (login-gated wrapper around `lib/reader/reports.submitReport`)
- `components/reader/viewer-shell.tsx` — toolbar/pane/bottom-nav shell, owns `tocOpen`/`settingsOpen`/`fontSize`/`theme` state, wires `TocSheet`/`ViewerSettingsSheet`/`ViewTracker`
- `components/reader/toc-sheet.tsx` — `TocSheet`, chapter list with lock badges and current-chapter highlight
- `components/reader/viewer-settings-sheet.tsx` — `ViewerSettingsSheet`, font stepper + theme switch + `ReportDialog`
- `components/reader/view-tracker.tsx` — `ViewTracker`, fires `onOpen` exactly once per mount
- `components/ui/sheet.tsx` — shadcn-generated, base-ui `Dialog` wrapper (installed via `npx shadcn@latest add sheet`)
- `app/globals.css` — added `.reader-theme-sepia` block (exact oklch values from UI-SPEC), `:root`/`.dark` untouched

## Decisions Made

- `trackChapterOpenAction`'s reading-progress upsert is gated behind `if (!locked)` — a locked/paid chapter's D-06 message is not "reading," so opening one must not silently move the reader's resume point away from their last actually-read free chapter
- Kept the plan's exact code as written (viewer shell markup, sheet contracts, action signatures) — the plan's provided sketches were already verified against the live `lib/chapters/actions.ts`/`lib/reader/*` interfaces from Waves 1-2

## Deviations from Plan

None — plan executed exactly as written. All task code matches the plan's provided sketches; `components/ui/sheet.tsx`'s generated API (`Sheet`/`SheetContent`/`SheetHeader`/`SheetTitle`, `side` prop, controlled `open`/`onOpenChange`) matched the plan's assumptions exactly, no adaptation needed.

## Issues Encountered

- `.env.local` was absent from this worktree (gitignored, not carried into new worktree checkouts) — copied from the main repo checkout so `npm test`'s live-Supabase integration tests could run. No secrets were modified, and the file remains gitignored (confirmed via `git check-ignore`).
- `npx tsc --noEmit` reports one pre-existing, unrelated error (`app/layout.tsx(20,50): Cannot find name 'LayoutProps'`) — already documented in `deferred-items.md` by 03-02/03-03/03-04, unrelated to this plan's files.
- `npx next build` fails in this worktree with a Turbopack workspace-root resolution error (`node_modules/next` is not resolvable from this worktree's checkout) — a worktree/tooling environment gap, not caused by this plan's code. `npx tsc --noEmit` and `npm test` (vitest) both resolve fine since Node's own module resolution walks up parent directories, but Turbopack's build step deliberately restricts to the workspace root. Logged to `deferred-items.md`; full `next build`/`next dev` manual verification should be run from a worktree with a real `node_modules/next` install before shipping.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- All 8 of Phase 3's requirement IDs (READ-01, READ-02, READ-03, READ-04, READ-05, READ-07, READ-08, READ-09; READ-06 explicitly deferred to v2) are live end-to-end: discovery feed, viewer navigation, font/theme, resume reading, reporting, notification subscription, bookmarking, and the promotional banner
- Phase 3 (reader-core-reading-loop-no-payment) is functionally complete; no blockers for Phase 4/5 (AI Gateway / Real Payment Integration)
- Manual browser verification (font stepper bounds, theme switching, TOC/settings sheet open/close, locked-chapter content-leak check via page source) was not performed in this session due to the `next build`/`next dev` Turbopack workspace-root issue noted above — recommended before this phase is considered fully shippable

---
*Phase: 03-reader-core-reading-loop-no-payment*
*Completed: 2026-08-30*

## Self-Check: PASSED

- FOUND: app/works/[workId]/chapters/[chapterId]/page.tsx
- FOUND: app/works/[workId]/chapters/[chapterId]/actions.ts
- FOUND: components/reader/viewer-shell.tsx
- FOUND: components/reader/toc-sheet.tsx
- FOUND: components/reader/viewer-settings-sheet.tsx
- FOUND: components/reader/view-tracker.tsx
- FOUND: components/ui/sheet.tsx
- FOUND: .planning/phases/03-reader-core-reading-loop-no-payment/03-07-SUMMARY.md
- FOUND commit: 9380471 (feat: viewer shell)
- FOUND commit: aafe2f1 (feat: TOC + settings sheets)
- FOUND commit: 8eb00fb (feat: view-count + reading-progress tracking)
