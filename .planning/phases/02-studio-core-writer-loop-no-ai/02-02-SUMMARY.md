---
phase: 02-studio-core-writer-loop-no-ai
plan: 02
subsystem: studio
tags: [nextjs, supabase, zod, shadcn, server-actions, works]

# Dependency graph
requires:
  - phase: 02-01
    provides: works/kb_nodes/chapters schema, create_work/ensure_account_template_root RPCs, lib/kb/templates.ts (seedTemplateFiles, KB_CATEGORIES), shadcn UI toolkit (Input/Textarea/Select/Button)
provides:
  - lib/works/actions.ts (createWork/listWorks/getWork, zod-validated business logic)
  - /studio writer-role gate + self-healing account-level template provisioning (app/studio/layout.tsx)
  - /studio 작품 목록 (work list) page
  - /studio/works/new 새 작품 만들기 form (shadcn Input/Textarea/Select/Button, client component + useTransition Server Action)
affects: [02-03 (KB tree — needs a real work to attach folders to), 02-04 (chapters — needs a real work to attach chapters to)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "lib/<domain>/actions.ts holds pure, zod-validated business logic taking (supabase client, typed input); app/.../actions.ts is a thin 'use server' wrapper deriving the session user server-side and never trusting a client-supplied owner id (mirrors lib/auth/writer.ts from Phase 1)"
    - "shadcn Select (Base UI-backed) requires a client component driving value/onValueChange state and calling a Server Action directly via useTransition, instead of a <form action={...}> FormData post"

key-files:
  created:
    - lib/works/actions.ts
    - tests/works/work-crud.test.ts
    - app/studio/layout.tsx
    - app/studio/page.tsx
    - app/studio/works/new/page.tsx
    - app/studio/works/new/actions.ts
    - .planning/phases/02-studio-core-writer-loop-no-ai/deferred-items.md
  modified:
    - lib/kb/templates.ts

key-decisions:
  - "seedTemplateFiles's supabase param type loosened from an ad-hoc duck type to the real SupabaseClient type — the duck type caused TS2589 (excessive type instantiation depth) the first time a real client was passed to it"
  - "Base UI Select's onValueChange delivers (value: string | null, eventDetails) — genre state modeled as string | null (not string | undefined) to match without a lossy cast"

patterns-established:
  - "Work-scoped ownership re-derivation: listWorks/getWork always filter by the session-derived ownerId server-side, never trust a workId/ownerId pair supplied by the client alone"

requirements-completed: [KB-02]

# Metrics
duration: ~15min
completed: 2026-08-28
---

# Phase 02 Plan 02: Studio Work Creation & Writer Gate Summary

**createWork/listWorks/getWork business logic (zod-validated, RPC + template seeding) plus the /studio writer-role gate, 작품 목록 list, and shadcn-built 새 작품 만들기 form**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-08-28T04:52:00Z (approx, first commit 2026-08-28T04:52:44Z)
- **Completed:** 2026-08-28T04:56:49Z
- **Tasks:** 2
- **Files modified:** 7 (6 created, 1 modified)

## Accomplishments
- `createWork` atomically seeds a new work's 6 fixed structural folders (via `create_work` RPC) plus the 5 editable template files in its work-level `template/` folder (via `seedTemplateFiles`) — proven by an 11-row `kb_nodes` assertion in the test suite
- Title-only-required creation (D-03): synopsis/cover/genre are optional and never block creation; whitespace-only titles are rejected with the exact UI-SPEC error copy
- `/studio` is gated to writer-role accounts (redirects non-writers to `/write/start`) and self-heals the account-level template root on every request via `ensure_account_template_root` + `seedTemplateFiles`
- 작품 목록 (work list, D-06) is a dedicated page, not a header dropdown; 새 작품 만들기 is built entirely from shadcn `Input`/`Textarea`/`Select`/`Button` — zero raw HTML form elements

## Task Commits

1. **Task 1: Work business logic (createWork/listWorks/getWork) + tests** — TDD (RED → GREEN):
   - `948c6a2` (test) — 6 failing behaviors covering D-03 optional fields, whitespace-title rejection, invalid-genre rejection, 11-row seeding invariant, cross-owner isolation for listWorks/getWork
   - `58bced5` (feat) — implementation + Rule 3 fix to `lib/kb/templates.ts`'s `seedTemplateFiles` param type
2. **Task 2: Studio writer-role gate, work list, new-work form** — `80bdab3` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `lib/works/actions.ts` - `createWork`/`listWorks`/`getWork`/`GENRES`, zod-validated, calls `create_work` RPC then `seedTemplateFiles`
- `tests/works/work-crud.test.ts` - 6 behaviors, all passing (RED confirmed before implementation existed, GREEN after)
- `lib/kb/templates.ts` - `seedTemplateFiles`'s `supabase` param retyped from an ad-hoc duck type to `SupabaseClient` (Rule 3 fix, see Deviations)
- `app/studio/layout.tsx` - writer-role gate + idempotent account-level template root provisioning for the whole `/studio` subtree
- `app/studio/page.tsx` - 작품 목록 (work list, D-06), empty-state CTA
- `app/studio/works/new/page.tsx` - 새 작품 만들기, client component + `useTransition`, shadcn `Input`/`Textarea`/`Select`/`Button` only
- `app/studio/works/new/actions.ts` - `submitCreateWork` Server Action, derives owner id from session, accepts a plain typed object (not `FormData`)

## Decisions Made
- Loosened `seedTemplateFiles`'s client param type to the real `SupabaseClient` type rather than keeping the narrower duck type from Plan 02-01 — see Deviations below for why this was necessary, not optional.
- Modeled the new-work form's `genre` state as `string | null` (matching Base UI `Select`'s `onValueChange` signature) instead of `string | undefined`, avoiding a cast at the call site.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Loosened `seedTemplateFiles`'s supabase param type to fix TS2589**
- **Found during:** Task 1 (`npx tsc --noEmit` after implementing `lib/works/actions.ts`)
- **Issue:** `lib/kb/templates.ts`'s `seedTemplateFiles` (from Plan 02-01) typed its `supabase` param as an ad-hoc duck type (`{ from: (table: string) => { select: ... => Promise<...> } }`). `lib/works/actions.ts` is the first real caller passing an actual `SupabaseClient` instance, and TypeScript's structural comparison against `SupabaseClient`'s deeply generic `.from()` overloads produced `TS2589: Type instantiation is excessively deep and possibly infinite`, blocking a clean `tsc --noEmit`.
- **Fix:** Imported `SupabaseClient` from `@supabase/supabase-js` and retyped the `supabase` param as `SupabaseClient` directly — the function body's calls (`.from().select().eq().eq().is()`, `.from().insert()`) are all valid on the real client; no runtime behavior change.
- **Files modified:** `lib/kb/templates.ts`
- **Verification:** `npx tsc --noEmit` clean except one pre-existing, unrelated error in `app/layout.tsx`; all 17 tests across `tests/works/work-crud.test.ts`, `tests/kb/template-substitution.test.ts`, `tests/studio/schema-smoke.test.ts` still pass.
- **Committed in:** `58bced5` (Task 1 commit)

**2. [Rule 1 - Bug] Fixed Select onValueChange type mismatch in the new-work form**
- **Found during:** Task 2 (`npx tsc --noEmit` after implementing `app/studio/works/new/page.tsx`)
- **Issue:** shadcn's Base UI-backed `Select` delivers `onValueChange: (value: string | null, eventDetails) => void`, incompatible with a bare `useState<string | undefined>` setter passed directly.
- **Fix:** Changed `genre` state to `string | null` and wrapped the handler as `(value) => setGenre(value)`.
- **Files modified:** `app/studio/works/new/page.tsx`
- **Verification:** `npx tsc --noEmit` clean for this file.
- **Committed in:** `80bdab3` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes were required for `npx tsc --noEmit` to pass cleanly; neither changes runtime behavior described in the plan. No scope creep.

## Issues Encountered
- `.env.local` (gitignored) was missing in this worktree, causing `adminClient()` to throw `supabaseUrl is required.` when running the integration test. Copied `.env.local` from the parent repo checkout into the worktree — this is standard worktree setup, not a code change, and was not committed (still gitignored).

## Deferred Items (logged, not fixed — out of scope for this plan)
- `app/layout.tsx(20,50): error TS2304: Cannot find name 'LayoutProps'.` — pre-existing since the initial `create-next-app` scaffold commit, unrelated to any file this plan touches. Logged in `.planning/phases/02-studio-core-writer-loop-no-ai/deferred-items.md`.
- `prefer-const` ESLint error on `let users: string[] = []` in `tests/works/work-crud.test.ts` — matches the exact same pre-existing pattern already present in `tests/auth/writer-upgrade.test.ts`, `tests/studio/schema-smoke.test.ts`, and `tests/wallet/ledger.concurrency.test.ts` (confirmed via `npx eslint .` before this plan's changes). Left consistent with the established test-file convention rather than diverging unilaterally; a repo-wide lint cleanup is a separate, cross-cutting concern.

## Known Stubs
None. `app/studio/page.tsx` links to `/studio/${work.id}`, which does not exist as a route yet — this is expected and intentional: Plan 02-03 (KB tree) and Plan 02-04 (chapters) build that route next, per this plan's explicit objective of unblocking them with a real work to attach to.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `lib/works/actions.ts` (`createWork`/`listWorks`/`getWork`/`GENRES`) is ready for Plan 02-03/02-04 to import and build the KB tree / chapter list on top of a real work.
- `/studio` writer-role gate and account-level template self-heal are in place for the whole `/studio` subtree — no further gating work needed in downstream plans.
- No blockers identified for Plan 02-03 or 02-04.

---
*Phase: 02-studio-core-writer-loop-no-ai*
*Completed: 2026-08-28*

## Self-Check: PASSED

All 7 created files confirmed present on disk (lib/works/actions.ts, tests/works/work-crud.test.ts, app/studio/layout.tsx, app/studio/page.tsx, app/studio/works/new/page.tsx, app/studio/works/new/actions.ts, this SUMMARY.md). All 3 task commits confirmed in git log (948c6a2, 58bced5, 80bdab3).
