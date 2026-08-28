---
phase: 02-studio-core-writer-loop-no-ai
plan: 01
subsystem: database
tags: [postgres, supabase, rls, dnd-kit, shadcn, tailwind, vitest, tdd]

# Dependency graph
requires:
  - phase: 01-foundation-wallet-infrastructure
    provides: profiles table (role/deleted_at), lib/supabase/{client,server,admin}.ts, vitest.config.ts, tests/helpers/db.ts (pgPool/adminClient/createTestUser/deleteTestUser), scripts/apply-migration.mjs (0001-only), .env.local SUPABASE_DB_URL
provides:
  - works/kb_nodes/chapters Postgres schema with owner-scoped RLS on the live Supabase project
  - guard_locked_kb_node trigger preventing rename/soft-delete of the 6 fixed structural folders
  - create_work/ensure_account_template_root/reorder_chapters Postgres functions
  - lib/kb/templates.ts pure template-substitution + canonical seed reader + seedTemplateFiles helper
  - @dnd-kit/* installed for the chapter-reorder UI
  - 11 new shadcn components (input/textarea/label/select/dialog/badge/separator/tooltip/dropdown-menu/scroll-area/sonner)
  - indigo accent color live in app/globals.css (light + dark)
affects: [02-02, 02-03, 02-04, 02-05 (all remaining Phase 2 plans: works CRUD, KB tree, chapters, both UI plans)]

# Tech tracking
tech-stack:
  added: ["@dnd-kit/core@6.3.1", "@dnd-kit/sortable@10.0.0", "@dnd-kit/utilities@3.2.2", "shadcn components (input/textarea/label/select/dialog/badge/separator/tooltip/dropdown-menu/scroll-area/sonner)"]
  patterns: ["Postgres functions trust their id parameters (not security definer); RLS enforces ownership on every table statement they touch — same pattern as Phase 1's apply_wallet_delta", "deferrable initially deferred unique constraint for atomic list resequencing", "BEFORE UPDATE trigger guarding immutability of specific rows (is_locked flag) rather than a separate permissions table"]

key-files:
  created: [supabase/migrations/0002_studio.sql, lib/kb/templates.ts, tests/studio/schema-smoke.test.ts, tests/kb/template-substitution.test.ts]
  modified: [package.json, package-lock.json, app/globals.css, scripts/apply-migration.mjs, components/ui/input.tsx, components/ui/textarea.tsx, components/ui/label.tsx, components/ui/select.tsx, components/ui/dialog.tsx, components/ui/badge.tsx, components/ui/separator.tsx, components/ui/tooltip.tsx, components/ui/dropdown-menu.tsx, components/ui/scroll-area.tsx, components/ui/sonner.tsx]

key-decisions:
  - "All @dnd-kit versions installed exactly as pinned in 02-RESEARCH.md (6.3.1/10.0.0/3.2.2) — all resolved from the registry without needing a fallback version"
  - "scripts/apply-migration.mjs generalized to accept migration filename as argv[2], defaulting to 0001_init.sql for backward compatibility — both 0001 and 0002 verified idempotent and re-runnable"

patterns-established:
  - "kb_nodes adjacency-list schema (scope/parent_id/category/is_locked) backs both account-level and work-level template trees with a single table"
  - "Template substitution treats zero placeholder matches as valid (사건 template has none) rather than erroring"

requirements-completed: [KB-01, KB-02, CONT-01, CONT-02, CONT-03]

# Metrics
duration: 12min
completed: 2026-08-28
---

# Phase 02 Plan 01: Studio Core Foundation Summary

**works/kb_nodes/chapters Postgres schema with RLS, a locked-folder guard trigger, and 3 atomic functions (create_work/ensure_account_template_root/reorder_chapters), plus a tested template-substitution library and the full shadcn/dnd-kit UI toolkit for Phase 2**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-08-28T12:35:00+09:00 (approx.)
- **Completed:** 2026-08-28T12:41:44+09:00
- **Tasks:** 3 completed
- **Files modified:** 19

## Accomplishments
- Live Supabase schema for works/kb_nodes/chapters with owner-scoped RLS, proven by a 5-assertion integration smoke test running against the real database
- `guard_locked_kb_node` trigger blocks both rename and soft-delete of any of the 6 fixed structural folders a work is created with
- `reorder_chapters` resequences a full chapter list in one statement using a `deferrable initially deferred` unique constraint, without hitting a premature uniqueness violation
- `ensure_account_template_root` verified idempotent — repeated calls return the same row, never duplicate it
- Pure, unit-tested template-substitution library (`lib/kb/templates.ts`) correctly handles the 사건 template's absent title placeholder as a valid zero-match case
- Full UI toolkit for the rest of Phase 2 installed: `@dnd-kit/*`, 11 shadcn components, indigo accent color live in both light and dark themes

## Task Commits

Each task was committed atomically (Tasks 2 and 3 used TDD RED→GREEN commits):

1. **Task 1: Install @dnd-kit + shadcn components, set indigo accent color** - `d3a24c2` (feat)
2. **Task 2 (RED): schema smoke test** - `daaf20d` (test)
2. **Task 2 (GREEN): works/kb_nodes/chapters schema migration** - `65bf613` (feat)
3. **Task 3 (RED): template-substitution unit test** - `a5844d0` (test)
3. **Task 3 (GREEN): template-substitution library** - `37c08cb` (feat)

_TDD tasks produced RED (failing test) then GREEN (implementation) commits, per plan spec._

## Files Created/Modified
- `supabase/migrations/0002_studio.sql` - works/kb_nodes/chapters tables, RLS, guard_locked_kb_node trigger, create_work/ensure_account_template_root/reorder_chapters functions
- `scripts/apply-migration.mjs` - generalized to accept a migration filename argv, default remains 0001_init.sql
- `tests/studio/schema-smoke.test.ts` - 5 integration assertions against the live Supabase project via raw postgres client
- `lib/kb/templates.ts` - substituteTitle, readCanonicalSeed, buildSeedContent, seedTemplateFiles, KB_CATEGORIES
- `tests/kb/template-substitution.test.ts` - 6 unit assertions including the 사건 zero-match case
- `app/globals.css` - indigo-600 (light) / indigo-500 (dark) accent override on --primary/--primary-foreground/--ring/--sidebar-primary only
- `package.json`, `package-lock.json` - @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities
- `components/ui/{input,textarea,label,select,dialog,badge,separator,tooltip,dropdown-menu,scroll-area,sonner}.tsx` - shadcn components for Wave 1/2 UI

## Decisions Made
- Followed the plan's exact SQL, matching Phase 1's `apply_wallet_delta` convention: functions trust their `p_owner_id`/`p_work_id` parameters and rely on RLS (not `security definer`) for the actual ownership boundary.
- `scripts/apply-migration.mjs` generalization preserves full backward compatibility — verified by re-running with no argv after adding the argv-based generalization.

## Deviations from Plan

None - plan executed exactly as written. All exact `@dnd-kit` versions from 02-RESEARCH.md resolved successfully from the npm registry; no fallback version was needed.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required. Migration was applied directly to the live Supabase project using the existing `.env.local` `SUPABASE_DB_URL`.

## Next Phase Readiness
- Full Phase 2 data model (works, kb_nodes, chapters, RLS, locked-folder guard, all 3 Postgres functions) is live and integration-tested.
- `lib/kb/templates.ts` is ready for Plan 02-02/02-03 to call `seedTemplateFiles` when populating both account-level and work-level template folders.
- UI toolkit (shadcn components + dnd-kit + indigo accent) installed — nothing in Wave 1/2 (works UI, KB tree, chapter list/editor) is blocked on tooling.
- No blockers identified for downstream plans.

---
*Phase: 02-studio-core-writer-loop-no-ai*
*Completed: 2026-08-28*

## Self-Check: PASSED

All created files verified present on disk (supabase/migrations/0002_studio.sql, lib/kb/templates.ts, tests/studio/schema-smoke.test.ts, tests/kb/template-substitution.test.ts, app/globals.css, scripts/apply-migration.mjs, components/ui/{input,dialog,sonner}.tsx). All 5 task commits (d3a24c2, daaf20d, 65bf613, a5844d0, 37c08cb) verified present in git log.
