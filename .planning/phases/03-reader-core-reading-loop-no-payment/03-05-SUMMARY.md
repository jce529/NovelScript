---
phase: 03-reader-core-reading-loop-no-payment
plan: 05
subsystem: ui
tags: [nextjs, react, server-components, base-ui, tailwind, discovery-feed]

# Dependency graph
requires:
  - phase: 03-reader-core-reading-loop-no-payment (03-02)
    provides: lib/discovery/actions.ts listFeed (trending-score computation, genre filter, sort modes)
  - phase: 03-reader-core-reading-loop-no-payment (03-03)
    provides: lib/reader/progress.ts listRecentlyRead (cross-work reading history)
provides:
  - "Home route (app/page.tsx) is the reader's discovery feed entry point, no longer the create-next-app scaffold"
  - "components/reader/feed-card.tsx (FeedCard) — cover-centric grid card with trending badge tooltip"
  - "components/reader/feed-filters.tsx (FeedFilters) — client genre + 최신/인기 + ranking-basis controls driving URL searchParams"
  - "components/reader/promo-banner.tsx (PromoBanner) — static D-20 promotional slot"
  - "components/reader/recently-read-section.tsx (RecentlyReadSection) — D-15b cross-work resume list, null when logged out"
affects: [03-06, 03-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server Component page (app/page.tsx) parses awaited searchParams, fetches via already-tested lib functions, passes plain data down to presentational components — no new business logic in this plan"
    - "base-ui Select/Tooltip render-prop convention (TooltipTrigger render={...}, SelectValue render-prop children) reused from components/studio/kb-tree.tsx"
    - "base-ui Select onValueChange callback types its value param as Value | null (not undefined) — client wrappers must normalize null to undefined explicitly"

key-files:
  created:
    - components/reader/feed-card.tsx
    - components/reader/feed-filters.tsx
    - components/reader/promo-banner.tsx
    - components/reader/recently-read-section.tsx
  modified:
    - app/page.tsx

key-decisions:
  - "Fixed base-ui Select onValueChange typing (Value | null, not Value | undefined) in FeedFilters — a genuine TS2322 blocking error caught by npx tsc --noEmit, not present in the plan's illustrative code"

patterns-established:
  - "Feed/detail cards use formatKoreanCount for view/like counts and a Tooltip-wrapped composite trending badge, matching UI-SPEC's Copywriting Contract"

requirements-completed: [READ-01, READ-04, READ-09]

# Metrics
duration: 12min
completed: 2026-08-30
---

# Phase 3 Plan 05: Discovery Feed Home Screen Summary

**Replaced the create-next-app scaffold at `app/page.tsx` with the reader's discovery-feed entry point: promo banner, cross-work 최근 읽은 작품, a titled 주간 랭킹 section, and a genre/sort-filterable trending-badge grid — all sourced from already-tested `listFeed`/`listRecentlyRead`.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-30T00:12:00Z (approx.)
- **Completed:** 2026-08-30T00:24:29Z
- **Tasks:** 2 completed
- **Files modified:** 5 (1 modified, 4 created)

## Accomplishments
- `/` now renders a live discovery feed backed by `listFeed` (genre filter, 최신/인기 toggle, and 4-way ranking-basis switch for 인기 mode) instead of the Next.js scaffold
- Added a cover-centric `FeedCard` grid with a trending-score badge + tooltip explaining the composite metric (조회수·좋아요·다음화 이동률)
- Added the D-20 promo banner and D-15b cross-work "최근 읽은 작품" resume list, separated from the ranking grid by a visible divider (D-21), with the resume list correctly hidden entirely for logged-out readers

## Task Commits

Each task was committed atomically:

1. **Task 1: Feed grid — cards, genre filter, 최신/인기 + ranking-basis controls** - `1276193` (feat)
2. **Task 2: Promotional banner + 최근 읽은 작품 + ranking section divider** - `9b49452` (feat)

**Plan metadata:** (this commit) `docs(03-05): complete discovery feed home screen plan`

## Files Created/Modified
- `app/page.tsx` - Discovery feed Server Component: parses searchParams, fetches `listFeed`/`listRecentlyRead` in parallel, renders PromoBanner → RecentlyReadSection → Separator → titled ranking section → FeedFilters → FeedCard grid
- `components/reader/feed-card.tsx` - `FeedCard`: 3:4 cover, title/synopsis clamp, genre badge, trending badge with tooltip, view/like counts via `formatKoreanCount`
- `components/reader/feed-filters.tsx` - `FeedFilters`: client genre Select + 최신/인기 Buttons + ranking-basis Select (only shown in 인기 mode), all pushing to URL searchParams
- `components/reader/promo-banner.tsx` - `PromoBanner`: static neutral-surface slot with NEW eyebrow pill, no gradient (per corrected UI-SPEC)
- `components/reader/recently-read-section.tsx` - `RecentlyReadSection`: returns `null` when logged out; empty state and horizontal-scroll list otherwise

## Decisions Made
- None beyond the auto-fix documented below — plan's component structure and copy followed as written.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed base-ui Select `onValueChange` null-typing in FeedFilters**
- **Found during:** Task 1 (`npx tsc --noEmit` verification)
- **Issue:** The plan's illustrative `FeedFilters` code passed `(value) => updateParams({ genre: ... })` directly to `Select`'s `onValueChange`. base-ui's `SelectRoot.Props['onValueChange']` types its value param as `SelectValueType<Value, Multiple> | null` (not `| undefined`) when `Multiple` is false, so TypeScript rejected passing that value straight into `updateParams`'s `Record<string, string | undefined>` parameter (TS2322, two call sites: genre Select and ranking-basis Select).
- **Fix:** Explicitly typed the callback params as `string | null` / `FeedSortBasis | null` and normalized `null` to `undefined` before calling `updateParams`.
- **Files modified:** `components/reader/feed-filters.tsx`
- **Verification:** `npx tsc --noEmit` — no errors introduced by this plan (only the pre-existing, unrelated `app/layout.tsx` `LayoutProps` baseline error remains, logged to deferred-items.md)
- **Committed in:** `1276193` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for a clean `tsc` pass; no scope creep — same component structure and behavior as specified.

## Issues Encountered
- This worktree branch (`worktree-agent-a19359021f05c4fe1`) was stale — it branched from master before Wave 2 (plans 03-01 through 03-04) and the phase plan files (03-05 through 03-07, 03-VALIDATION.md) were merged in. Ran `git merge master --no-edit --no-verify` (clean, no conflicts) before starting execution to bring in `lib/discovery/actions.ts`, `lib/reader/progress.ts`, and the plan files this plan depends on.
- This worktree had no `node_modules` (gitignored, not shared across worktrees). Created a Windows directory junction (`mklink /J node_modules ...`) to the main repo's `node_modules` rather than reinstalling, to keep `npx tsc --noEmit` fast and avoid drifting from the main repo's installed versions.
- Baseline `npx tsc --noEmit` (before this plan's changes) already reported one unrelated error: `app/layout.tsx(20,50): error TS2304: Cannot find name 'LayoutProps'`. Out of scope per the deviation rules' scope boundary (pre-existing, unrelated file) — left untouched, not fixed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Home route is now the reader's real entry point; `/works/[workId]` and `/works/[workId]/chapters/[chapterId]` (Plans 03-06/03-07) are reachable via `FeedCard`/`RecentlyReadSection` links
- No blockers for subsequent plans in this phase

---
*Phase: 03-reader-core-reading-loop-no-payment*
*Completed: 2026-08-30*

## Self-Check: PASSED

All created files (`app/page.tsx`, `components/reader/feed-card.tsx`, `components/reader/feed-filters.tsx`, `components/reader/promo-banner.tsx`, `components/reader/recently-read-section.tsx`, this SUMMARY.md) verified present on disk. Both task commits (`1276193`, `9b49452`) verified present in `git log`.
