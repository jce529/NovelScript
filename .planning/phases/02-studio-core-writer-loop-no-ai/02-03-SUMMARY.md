---
phase: 02-studio-core-writer-loop-no-ai
plan: 03
subsystem: api
tags: [supabase, postgres, server-actions, kb-tree, template-resolution, rls, ownership-guard]

# Dependency graph
requires:
  - phase: 02-studio-core-writer-loop-no-ai plan 01
    provides: works/kb_nodes/chapters schema + RLS + create_work/ensure_account_template_root functions, lib/kb/templates.ts (substituteTitle/readCanonicalSeed/buildSeedContent)
provides:
  - "lib/kb/tree.ts: pure buildTree(flatNodes) -> nested TreeNode[] builder"
  - "lib/kb/actions.ts: getKbTree, listTemplateOptions, createNode, renameNode, deleteNode, saveNodeContent"
  - "Two-tier template resolution (Pattern 3: work-local > account-level > canonical) at both auto-resolve and D-10 explicit-picker create-time"
  - "Defense-in-depth ownership (owner_id re-derivation, Pitfall 1) and locked-folder (guard_locked_kb_node trigger mapping, Pitfall 2) enforcement at the Server-Action layer"
affects: [02-05 (Studio UI wiring the tree + CreateNodeDialog + editor to these functions), 02-04 (chapters plan, shares the ownership-guard pattern)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Adjacency-list tree flattened by DB query, nested client-side via one-pass buildTree (no recursive CTE, no tree library)"
    - "Every mutating Server Action re-derives ownership via .eq('owner_id', ownerId) in addition to relying on RLS (Pitfall 1 defense-in-depth)"
    - "DB trigger error message ('locked_node_immutable') caught by string-matching and mapped to Korean UI-SPEC copy in the action layer"
    - "D-10 create-time template picker: listTemplateOptions surfaces every kb_nodes template file (work + account) plus a synthetic canonical option, flags exactly one isDefault by category-name match; createNode accepts an optional templateOverrideContent that bypasses auto-resolution entirely when explicitly provided (including null for 'writer picked canonical')"

key-files:
  created:
    - lib/kb/tree.ts
    - tests/kb/tree-query.test.ts
    - tests/kb/document-crud.test.ts
    - tests/kb/template-options.test.ts
    - tests/kb/locked-folder-guard.test.ts
    - tests/kb/ownership-guard.test.ts
    - .planning/phases/02-studio-core-writer-loop-no-ai/deferred-items.md
  modified:
    - lib/kb/actions.ts

key-decisions:
  - "Copied the shared repo's .env.local into this git-worktree checkout (gitignored, untracked) so integration tests could run against the real hosted Supabase project — no code change, not committed."
  - "D-10 no-name-match test scenario uses a second, isolated test user rather than reusing the first describe block's owner, since the owner-level account_template root is shared across all of that owner's works and the first block had already seeded an account-level 인물 match."

patterns-established:
  - "TemplateOption shape ({ id, name, scope, content, isDefault }) is the stable contract Plan 02-05's CreateNodeDialog will consume for the create-time template picker."

requirements-completed: [KB-01, KB-02]

# Metrics
duration: 6min
completed: 2026-08-28
---

# Phase 02 Plan 03: KB Tree Query + Node CRUD Summary

**Full KB-01/KB-02 business-logic layer: buildTree + getKbTree tree query, createNode/renameNode/deleteNode/saveNodeContent CRUD, and listTemplateOptions' D-10 create-time template picker across work/account/canonical tiers — with owner_id re-derivation and locked-folder-trigger enforcement proven at the Server-Action layer, independent of any UI.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-08-28T13:53:00+09:00
- **Completed:** 2026-08-28T13:56:26+09:00
- **Tasks:** 2
- **Files modified:** 8 (2 lib files, 5 test files, 1 deferred-items log)

## Accomplishments
- `buildTree` nests a flat `kb_nodes` row list in one pass, defensively treating any node whose `parent_id` isn't present as a root instead of throwing; `getKbTree` merges a work's own nodes with the owner's account-level `template/` root + children, scoped by `owner_id`.
- Full KB CRUD (`createNode`/`renameNode`/`deleteNode`/`saveNodeContent`) works across all 5 categories, correctly seeding from `buildSeedContent` including the 사건 no-placeholder edge case (Pitfall 3), and rejects sibling-name collisions with the exact UI-SPEC Korean copy.
- `listTemplateOptions` implements D-10's full create-time template picker: every work-level and account-level `template/` file (regardless of filename) plus a synthetic canonical option are all listed, with exactly one flagged `isDefault` per Pattern 3's work > account > canonical precedence; `createNode`'s `templateOverrideContent` param lets an explicit pick bypass auto-resolution entirely.
- Locked folders reject `renameNode`/`deleteNode` called directly with their real id (Pitfall 2, proven independent of any UI), and cross-owner mutation attempts on another writer's node have zero effect on the victim row (Pitfall 1), both verified by re-selecting and asserting the row is unchanged, not just that the call returned an error.

## Task Commits

Each task was committed atomically (TDD RED then GREEN):

1. **Task 1: Tree-building helper + tree query + test**
   - `6ace0f4` (test) — failing `tests/kb/tree-query.test.ts`
   - `40a7fb0` (feat) — `lib/kb/tree.ts` (`buildTree`) + `lib/kb/actions.ts` (`getKbTree`)
2. **Task 2: KB node CRUD + template-options picker + locked-folder + ownership guards**
   - `5cad057` (test) — failing `tests/kb/document-crud.test.ts`, `template-options.test.ts`, `locked-folder-guard.test.ts`, `ownership-guard.test.ts`
   - `3d864d0` (feat) — `lib/kb/actions.ts` appended with `createNode`, `renameNode`, `deleteNode`, `saveNodeContent`, `listTemplateOptions`

_Note: TDD tasks have separate test → feat commits per RED/GREEN._

## Files Created/Modified
- `lib/kb/tree.ts` - Pure `buildTree(flatNodes) -> TreeNode[]`, one-pass Map-based nesting with defensive orphan-parent handling
- `lib/kb/actions.ts` - `getKbTree`, `listTemplateOptions`, `createNode`, `renameNode`, `deleteNode`, `saveNodeContent` — all Server-Action-shaped functions taking an injected `SupabaseClient`, ownership-scoped
- `tests/kb/tree-query.test.ts` - 3 pure `buildTree` unit tests + 2 `getKbTree` integration tests (merge + cross-owner leakage)
- `tests/kb/document-crud.test.ts` - Create across categories (incl. 사건), name-collision rejection, rename/delete/save
- `tests/kb/template-options.test.ts` - D-10 picker: 4-option listing with default flagging, no-name-match fallback, explicit-override bypass
- `tests/kb/locked-folder-guard.test.ts` - Direct `renameNode`/`deleteNode` calls on a locked folder id
- `tests/kb/ownership-guard.test.ts` - Cross-owner `renameNode`/`deleteNode`/`saveNodeContent` have no effect on the victim row
- `.planning/phases/02-studio-core-writer-loop-no-ai/deferred-items.md` - Logged one pre-existing, out-of-scope `tsc` error unrelated to this plan

## Decisions Made
- Copied `.env.local` from the shared repo checkout into this git-worktree (gitignored, never committed) purely to let integration tests reach the real hosted Supabase project from this isolated worktree — matches the pattern Plan 02-01 already relied on for its own DB-backed tests.
- The "no category-name match" D-10 test case uses a fresh, isolated test user (rather than reusing the first template-options describe block's fixtures) because an owner's account-level `template/` root is shared across all of that owner's works — reusing the same owner would have left a lingering account-level `인물` match from the first scenario.

## Deviations from Plan

None - plan executed exactly as written. The plan's `<action>` blocks provided the exact implementation and this was followed directly; all 4 test files were authored from the plan's `<behavior>` bullets before implementation existed (TDD RED confirmed via `npx vitest run` failing with "is not a function" / "Cannot find module" errors), then made to pass without modification to the action code beyond moving one `import` statement to the top of the file for lint cleanliness (no behavior change).

## Issues Encountered
- `npx tsc --noEmit` surfaced one pre-existing error in `app/layout.tsx` (`Cannot find name 'LayoutProps'`) unrelated to any file this plan touches — traced to the original `create-next-app` scaffold commit, not introduced by this plan. Logged to `deferred-items.md` per the scope-boundary rule rather than fixed.

## User Setup Required

None - no external service configuration required. (`.env.local` used for local test execution was copied from the existing, already-configured shared checkout, not newly created.)

## Next Phase Readiness
- `lib/kb/actions.ts`'s full exported surface (`getKbTree`, `listTemplateOptions`, `createNode`, `renameNode`, `deleteNode`, `saveNodeContent`) is ready for Plan 02-05 to wire into the Studio tree UI, KB document editor, and `CreateNodeDialog`'s D-10 template picker with no further business-logic changes needed.
- `npx vitest run tests/kb/` passes (6 files, 25 tests); full suite `npx vitest run` passes (13 files, 51 tests) with no regressions to Phase 1 or Plan 02-01's tests.
- No blockers for Plan 02-04 (chapters) — that plan's `tests/chapters/ownership-guard.test.ts` mirrors this plan's `tests/kb/ownership-guard.test.ts` pattern independently, as noted in this plan's `must_haves`.

## Self-Check: PASSED

All claimed files verified present via Glob (`lib/kb/tree.ts`, `lib/kb/actions.ts`, all 5 new test files, `deferred-items.md`). All 4 task commits (`6ace0f4`, `40a7fb0`, `5cad057`, `3d864d0`) verified present in `git log --oneline --all`.

---
*Phase: 02-studio-core-writer-loop-no-ai*
*Completed: 2026-08-28*
