---
phase: 03-reader-core-reading-loop-no-payment
plan: 01
subsystem: database
tags: [supabase, postgres, rls, security-definer, vitest]

# Dependency graph
requires:
  - phase: 02-studio-core-writer-loop-no-ai
    provides: works/chapters schema, owner-only RLS policies (works_owner_all, chapters_owner_all), create_work RPC, apply-migration.mjs script
provides:
  - Additive public-read RLS on works/chapters (non-owner/anonymous clients can now SELECT published, non-deleted rows)
  - chapters.view_count column + increment_chapter_view SECURITY DEFINER RPC, callable by anon/authenticated
  - work_likes, reading_progress, reports, work_subscriptions, work_bookmarks tables with ownership-scoped RLS
  - anonClient() test helper (anon-key client, distinct from adminClient's service-role client)
  - Automated regression test proving RLS actually permits non-owner reads (not just admin-client reads)
affects: [03-02, 03-03, 03-04, 03-05, 03-06, 03-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SECURITY DEFINER RPC scoped to one column/condition (increment_chapter_view) instead of a general anon UPDATE policy — reuses handle_new_user() precedent from 0001_init.sql"
    - "RLS policies are additive/OR'd, not replacing — public-read policies coexist with owner-all policies from 0002_studio.sql without weakening owner access"
    - "Test with anonClient() (anon key), not just adminClient() (service role) — service role bypasses RLS entirely and would silently mask an RLS policy gap (empty array, not an error)"

key-files:
  created: [supabase/migrations/0003_reader.sql, tests/discovery/public-read-rls.test.ts]
  modified: [tests/helpers/db.ts]

key-decisions:
  - "work_subscriptions and work_bookmarks (READ-07/READ-08, added to CONTEXT.md after 03-RESEARCH.md ran) follow the same owner-only shape as work_likes but without a public-read policy, since neither needs to be read by anyone but their own owner in v1"

patterns-established:
  - "Pitfall 1/2 regression guard: every future Phase 3 plan that adds RLS-gated reader functionality should add an anonClient()-based assertion, not just adminClient()-based ones"

requirements-completed: [READ-01, READ-02, READ-03, READ-04, READ-05, READ-07, READ-08, READ-09]

# Metrics
duration: 20min
completed: 2026-08-29
---

# Phase 03 Plan 01: Reader Schema Migration Summary

**Additive public-read RLS on works/chapters, chapters.view_count + increment_chapter_view SECURITY DEFINER RPC, and 5 new reader tables (likes/progress/reports/subscriptions/bookmarks) — proven by an anon-key integration test, not just admin-client reads.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-08-29T23:53:05Z
- **Tasks:** 2
- **Files modified:** 3 (1 created migration, 1 created test, 1 modified test helper)

## Accomplishments
- Fixed the reader-facing RLS gap: before this migration, `works_owner_all`/`chapters_owner_all` were the *only* SELECT policies on works/chapters, so every non-owner (including anonymous readers) got a silent empty result from any query — the new `works_public_read`/`chapters_public_read` policies (additive, OR'd with the owner policies) fix this.
- Added `chapters.view_count` and a `SECURITY DEFINER` RPC (`increment_chapter_view`) that lets any caller (including `anon`) increment a published chapter's view count without opening a general UPDATE policy.
- Landed the full reader data model — `work_likes`, `reading_progress`, `reports`, `work_subscriptions`, `work_bookmarks` — each with its own ownership-scoped RLS, live on the Supabase project.
- Proved the fix works with a real anon-key client (`anonClient()`), not the admin/service-role client — directly guards against RESEARCH.md's documented Pitfall 1/2 (RLS silently returns `[]`, not an error, so admin-only testing would mask the gap).

## Task Commits

Each task was committed atomically:

1. **Task 1: Reader schema migration — RLS gap fix, view_count, view RPC, 5 new tables** - `c77e6c0` (feat)
2. **Task 2: anonClient() helper + non-owner RLS proof test** - `7d074ef` (test)

**Plan metadata:** (this commit)

## Files Created/Modified
- `supabase/migrations/0003_reader.sql` - Additive public-read RLS, view_count column, increment_chapter_view RPC, 5 new reader tables + RLS
- `tests/helpers/db.ts` - Added `anonClient()` export alongside existing `pgPool`/`adminClient`/`createTestUser`/`deleteTestUser`
- `tests/discovery/public-read-rls.test.ts` - 4 tests proving anon-key reads/RPC calls work as designed

## Decisions Made
- `work_subscriptions`/`work_bookmarks` (READ-07/READ-08) were added to CONTEXT.md a day after 03-RESEARCH.md ran, so they aren't covered by a named RESEARCH.md pattern. They mirror `work_likes`'s shape exactly, minus the public-read policy, since v1 never surfaces "who subscribed/bookmarked this" to anyone but the row's own owner.

## Deviations from Plan

None - plan executed exactly as written. One environment note (not a plan deviation): this worktree branch was several commits behind `master` (missing all of 03-01 through 03-07 PLAN.md files and `.env.local`), so it was fast-forward merged to `master` and `.env.local` was copied in locally (gitignored, not committed) before execution could begin.

## Issues Encountered
None - migration applied cleanly on first attempt, idempotent re-run and 0002_studio.sql backward-compatibility both verified, all 4 new tests pass, and the full existing suite (77 tests across 20 files) still passes with no regressions.

## User Setup Required
None - no external service configuration required. Migration was applied directly to the existing live Supabase project using credentials already provisioned in `.env.local`.

## Next Phase Readiness
- The full reader data model is live and RLS-proven — Wave 2/3/4 plans (discovery, chapter reading pane, likes, progress, reports, subscriptions, bookmarks business logic) are unblocked.
- `anonClient()` is now available in `tests/helpers/db.ts` for any future plan that needs to prove non-owner/anonymous read access.

---
*Phase: 03-reader-core-reading-loop-no-payment*
*Completed: 2026-08-29*

## Self-Check: PASSED

- FOUND: supabase/migrations/0003_reader.sql
- FOUND: tests/discovery/public-read-rls.test.ts
- FOUND: tests/helpers/db.ts
- FOUND commit: c77e6c0
- FOUND commit: 7d074ef
