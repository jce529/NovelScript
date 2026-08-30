---
phase: 03-reader-core-reading-loop-no-payment
plan: 06
subsystem: ui
tags: [nextjs, server-actions, base-ui, shadcn, tabs]

# Dependency graph
requires:
  - phase: 03-reader-core-reading-loop-no-payment
    provides: "Plan 03-02's getPublicWork/listPublicChapters, Plan 03-03's getReadingProgress, Plan 03-04's toggleLike/toggleSubscription/toggleBookmark/submitReport/REPORT_CATEGORIES"
provides:
  - "app/works/[workId]/page.tsx — public work detail Server Component (header row, 3 tabs, chapter list, CTA)"
  - "app/works/[workId]/actions.ts — toggleLikeAction/toggleSubscriptionAction/toggleBookmarkAction/submitReportAction, each login-gated at the action layer"
  - "components/reader/report-dialog.tsx — shared ReportDialog (fixed categories from REPORT_CATEGORIES)"
  - "components/reader/like-button.tsx, components/reader/work-header-actions.tsx — login-gated toggle UI"
  - "components/ui/tabs.tsx — newly installed shadcn tabs (base-ui render-prop)"
affects: [03-07]

# Tech tracking
tech-stack:
  added: ["shadcn tabs component (@base-ui/react/tabs)"]
  patterns:
    - "Server Component fetches all read-side state (work, chapters, progress, like/subscribe/bookmark state) in one Promise.all, passes as initial* props to client toggle components — no client-side fetch-on-mount"
    - "Every write-capable client component takes a loggedIn boolean prop and short-circuits to a sonner login-required toast before ever calling its Server Action, in addition to the Server Action's own auth.getUser() gate (defense in depth, matches Plan 03-04's precedent)"
    - "ReportDialog takes an onSubmit callback prop rather than importing a fixed Server Action directly, so Plan 03-07's viewer can reuse the same component with a chapterId-bound submit handler"

key-files:
  created: [components/ui/tabs.tsx, app/works/[workId]/page.tsx, app/works/[workId]/actions.ts, components/reader/work-header-actions.tsx, components/reader/like-button.tsx, components/reader/report-dialog.tsx]
  modified: []

key-decisions:
  - "None beyond the plan — all three tasks implemented per 03-06-PLAN.md's action blocks verbatim, including the exact base-ui Tabs/Select render-prop conventions confirmed against the newly-generated tabs.tsx and existing select.tsx usage in app/studio"

patterns-established:
  - "3-tab work detail page (소개/작품설정/회차) with a public, no-ownership-gate Server Component, distinct header-row icon group (알림/선호작) vs. lower-page icon group (좋아요/신고) per D-07/D-18/D-19"

requirements-completed: [READ-04, READ-05, READ-07, READ-08]

# Metrics
duration: 25min
completed: 2026-08-30
---

# Phase 03 Plan 06: Work Detail Page (3-Tab Structure, CTA, Report/Like/Subscribe/Bookmark) Summary

**Public work detail page at `/works/[workId]` with a 3-tab structure (소개/작품설정/회차), a header row carrying login-gated 알림/선호작 icon toggles distinct from the lower-page 좋아요/신고 controls, a reading-progress-aware 이어보기/읽기 시작 CTA, and the shared `ReportDialog` component Plan 03-07's viewer will reuse without duplication.**

## Performance

- **Duration:** ~25 min (including worktree sync)
- **Tasks:** 3
- **Files modified:** 6 (all newly created — no existing files touched)

## Accomplishments
- `app/works/[workId]/page.tsx` renders a public (no ownership check) Server Component: back button + 알림/선호작 header row (44px row height per UI-SPEC), work title/genre, and 3 tabs (소개/작품설정/회차) built on the newly-installed shadcn `tabs` component (`@base-ui/react/tabs`, confirmed render-prop-free plain composition — `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` match the plan's assumed API exactly).
- `작품설정` tab renders the D-22 structural placeholder ("작품 설정 준비중") with no CTA, per spec.
- `회차` tab lists all published chapters via `listPublicChapters`, showing a `Lock` icon badge (muted-foreground, never accent/destructive) on paid chapters, with the primary CTA branching between "읽기 시작" (no prior progress) and "이어보기 · {N}화부터" (progress exists) based on `getReadingProgress`.
- `app/works/[workId]/actions.ts` exports 4 Server Actions (`toggleLikeAction`, `toggleSubscriptionAction`, `toggleBookmarkAction`, `submitReportAction`), each independently deriving the user from `supabase.auth.getUser()` and returning `{ ok: false, error: '로그인이 필요해요.' }` when absent — login enforcement lives at the action layer, not just the UI layer.
- `components/reader/report-dialog.tsx` exports the shared `ReportDialog`, driven entirely by `REPORT_CATEGORIES` from `lib/reader/reports.ts` (no retyped category list) with the detail `Textarea` conditionally shown only for `기타`, and an `onSubmit` callback prop so Plan 03-07's viewer can reuse this exact component bound to its own chapter-scoped submit handler.
- `components/reader/like-button.tsx` and `components/reader/work-header-actions.tsx` both implement the same pattern: optimistic local state updated from the Server Action's response, a `loggedIn` prop that short-circuits to a sonner "로그인이 필요해요." toast (with a "로그인하기" action button) before ever calling the Server Action.

## Task Commits

Each task was committed atomically:

1. **Task 1: Install tabs; page shell — header row, 3-tab structure, 소개/작품설정 tab content** - `19251ef`
2. **Task 2: Server Actions — like/subscription/bookmark toggles, all login-gated** - `4e65bce`
3. **Task 3: 회차 tab (chapter list + CTA) + like button + shared ReportDialog** - `b421595`

## Files Created/Modified
- `components/ui/tabs.tsx` - shadcn-generated, `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` on `@base-ui/react/tabs`
- `app/works/[workId]/page.tsx` - work detail Server Component (header, tabs, chapter list, CTA)
- `app/works/[workId]/actions.ts` - `toggleLikeAction`, `toggleSubscriptionAction`, `toggleBookmarkAction`, `submitReportAction`
- `components/reader/work-header-actions.tsx` - 알림/선호작 icon toggles (client, login-gated)
- `components/reader/like-button.tsx` - toggleable 좋아요 button (client, login-gated)
- `components/reader/report-dialog.tsx` - shared `ReportDialog`, reused by Plan 03-07

## Decisions Made
None beyond the plan. All three tasks were implemented per `03-06-PLAN.md`'s action blocks near-verbatim; the tabs/select base-ui conventions were verified against the actually-generated/existing component source before wiring (`components/ui/tabs.tsx`, `components/ui/select.tsx`, and `app/studio/works/new/page.tsx`'s existing `Select value={...} onValueChange={...}` usage) rather than assumed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree branch was several commits behind master, missing the phase plan file itself and all of Waves 1-2's landed lib modules**
- **Found during:** Initial file read (`03-06-PLAN.md` did not exist in this worktree's checked-out branch, `worktree-agent-a026363e6efae6e9b`)
- **Issue:** This worktree's branch was forked before commit `1a06e6c` ("docs(03): create phase plan") and before the wave-2 merge commits landed on `master`. Neither the plan file nor `lib/works/actions.ts`'s `getPublicWork`, `lib/chapters/actions.ts`'s `listPublicChapters`, nor any of `lib/reader/{likes,subscriptions,bookmarks,reports,progress}.ts` were present.
- **Fix:** Fast-forward merged `master` (`0154ee7`) into the worktree branch (`git merge master`, clean fast-forward, no local commits to lose, no conflicts).
- **Files modified:** None (merge only — pulled in 38 files already committed on `master` by Plans 03-01 through 03-04 and the phase-plan-creation commit)
- **Verification:** `git log` after merge shows `03-06-PLAN.md` and all Wave 1-2 `lib/reader/*.ts`/`lib/chapters/actions.ts`/`lib/works/actions.ts` present; this same environment issue is independently documented in sibling worktrees' summaries (e.g. 03-04-SUMMARY.md).
- **Committed in:** Fast-forward merge, no new commit hash (nothing to merge-commit)

**2. [Rule 1 - Bug] `Select`'s `onValueChange` type mismatch in `ReportDialog`**
- **Found during:** Task 3's `npx tsc --noEmit` verification
- **Issue:** `components/ui/select.tsx`'s base-ui `onValueChange` signature is `(value: string | null, ...) => void`, but the plan's literal code passed `setCategory` (a `Dispatch<SetStateAction<string>>`) directly, which rejects `null` — `npx tsc --noEmit` reported `TS2322`.
- **Fix:** Wrapped in `(value) => { if (value) setCategory(value); }`, discarding the (practically unreachable, since this select always has a selected value) `null` case rather than widening `category`'s state type.
- **Files modified:** `components/reader/report-dialog.tsx`
- **Verification:** `npx tsc --noEmit` after the fix reports only the pre-existing, unrelated `app/layout.tsx(20,50): Cannot find name 'LayoutProps'` error (confirmed present before this plan's changes, unrelated to any file this plan touches).
- **Committed in:** `b421595`

---

**Total deviations:** 2 auto-fixed (1 Rule 3 - blocking environment sync, 1 Rule 1 - bug fix). No scope creep — one was worktree setup, the other a one-line type-correctness fix required for the plan's own literal code to compile.
**Impact on plan:** None on the plan's actual deliverables or UI-SPEC contract. Both fixes were prerequisites for executing/verifying the plan.

## Issues Encountered
- `npx tsc --noEmit` reports a pre-existing `app/layout.tsx(20,50): Cannot find name 'LayoutProps'` error, unrelated to any file this plan touches. Not fixed here (out of scope per the scope-boundary rule — already logged by prior plans' summaries in this phase).

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- `ReportDialog` is ready for Plan 03-07's viewer to import directly (same component, no duplication) with a chapter-scoped `chapterId`/`onSubmit`.
- `app/works/[workId]/page.tsx`'s chapter list links (`/works/${workId}/chapters/${chapter.id}`) and CTA both point at the route Plan 03-07 will implement (the viewer) — those routes do not exist yet, which is expected and out of this plan's scope.
- No blockers for downstream plans.

---
*Phase: 03-reader-core-reading-loop-no-payment*
*Completed: 2026-08-30*

## Self-Check: PASSED

- FOUND: components/ui/tabs.tsx
- FOUND: app/works/[workId]/page.tsx
- FOUND: app/works/[workId]/actions.ts
- FOUND: components/reader/work-header-actions.tsx
- FOUND: components/reader/like-button.tsx
- FOUND: components/reader/report-dialog.tsx
- FOUND commit: 19251ef
- FOUND commit: 4e65bce
- FOUND commit: b421595
