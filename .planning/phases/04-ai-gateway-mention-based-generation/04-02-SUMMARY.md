---
phase: 04-ai-gateway-mention-based-generation
plan: 02
subsystem: api
tags: [supabase, server-actions, kb-mentions, vitest]

# Dependency graph
requires:
  - phase: 02-studio-core-writer-loop-no-ai
    provides: lib/kb/actions.ts createNode/deleteNode, lib/kb/templates.ts KB_CATEGORIES/KbCategory, work-scoped kb_nodes schema
provides:
  - "lib/ai/mentions.ts: searchMentionNodes, resolveCategoryFolderId, quickAddMentionNode, getMentionedNodesContent"
  - "searchMentionsAction/quickAddMentionAction Server Actions on the chapter editor route"
affects: [04-04-generate-action, 04-05-mention-chips-panel, 04-06-mention-autocomplete-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "lib/ai/{feature}.ts business logic + thin 'use server' Server Action wrapper in the route's actions.ts, matching Phase 2/3 convention exactly"

key-files:
  created: [lib/ai/mentions.ts, tests/ai/mention-search.test.ts, tests/ai/mention-context.test.ts]
  modified: ["app/studio/[workId]/chapters/[chapterId]/actions.ts"]

key-decisions:
  - "Reused Phase 2's createNode for quick-add instead of duplicating name-collision/template-seeding logic"
  - "getMentionedNodesContent returns content verbatim, never resolving [[ ]] wiki-link syntax, per 02-CONTEXT.md D-13"

patterns-established:
  - "Mention search excludes the 'template' kb_nodes category via KB_CATEGORIES allowlist, not a category != 'template' negation"

requirements-completed: [EDIT-01, EDIT-02]

# Metrics
duration: 25min
completed: 2026-08-30
---

# Phase 4 Plan 2: Mention Search + Quick-Add Backend Summary

**Work-scoped KB mention search/quick-add and generate-time content resolver in `lib/ai/mentions.ts`, wired as authenticated Server Actions on the chapter editor route.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-08-30T05:40:00Z
- **Completed:** 2026-08-30T06:06:20Z
- **Tasks:** 3 completed
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments
- `searchMentionNodes` — work-scoped, partial-name (`ilike`) search over `kb_nodes`, excludes soft-deleted rows and the non-mentionable `template` category, returns `category` so the UI can render a type icon without a second query
- `quickAddMentionNode` — D-04 quick-add flow: resolves the work's fixed category folder and delegates to Phase 2's `createNode` (template seeding, sibling-name collision handling reused verbatim, not duplicated)
- `getMentionedNodesContent` — EDIT-02's generate-time resolver: given a set of node ids, returns each document's content byte-for-byte (including inert `[[ ]]` wiki-link text), excluding any soft-deleted node even if a stale id is passed
- `searchMentionsAction` / `quickAddMentionAction` — new Server Actions on `app/studio/[workId]/chapters/[chapterId]/actions.ts`, following the exact `auth.getUser()` guard shape used by every other export in that file

## Task Commits

Each task was committed atomically:

1. **Task 1: Mention search by name/type + quick-add creation** - `f407a3d` (feat)
2. **Task 2: Resolve full content for currently-mentioned documents (EDIT-02)** - `4072027` (test)
3. **Task 3: Wire mention search + quick-add as Server Actions** - `70acbc2` (feat)

**Plan metadata:** (this commit, docs: complete plan)

_Note: Task 1's commit already contains `getMentionedNodesContent` (all of `lib/ai/mentions.ts` was written in one pass); Task 2's commit is test-only since the function under test was already present on disk from Task 1 — see Deviations._

## Files Created/Modified
- `lib/ai/mentions.ts` - `MentionCandidate`/`MentionedDoc` types, `searchMentionNodes`, `resolveCategoryFolderId`, `quickAddMentionNode`, `getMentionedNodesContent`
- `tests/ai/mention-search.test.ts` - work-scoping, template-category exclusion, whitespace-query short-circuit, quick-add + immediate searchability, empty-name rejection
- `tests/ai/mention-context.test.ts` - verbatim content resolution (including inert `[[ ]]` text), soft-delete exclusion, empty-`nodeIds` short-circuit
- `app/studio/[workId]/chapters/[chapterId]/actions.ts` - added `searchMentionsAction`, `quickAddMentionAction`

## Decisions Made
- None beyond what the plan specified — reused `createNode` for quick-add and left `[[ ]]` content unmodified per D-13, both as directed by the plan's `<action>` blocks.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fast-forwarded this worktree's branch to `master` to pick up Phase 4 planning docs**
- **Found during:** Initial file read (Task setup)
- **Issue:** This isolated git worktree's checked-out branch (`worktree-agent-a43ed9ed263e84538`) was several commits behind `master` and had no `.planning/phases/04-ai-gateway-mention-based-generation/` directory at all — the plan file this executor was told to run did not exist on disk yet.
- **Fix:** Confirmed the worktree's `HEAD` was a strict ancestor of `master` (`git merge-base --is-ancestor`) with a clean working tree, then ran `git merge master --ff-only` to bring in all Phase 3/4 planning and code commits without any local-work loss risk.
- **Files modified:** none directly (git ref update only)
- **Verification:** `.planning/phases/04-ai-gateway-mention-based-generation/04-02-PLAN.md` present and readable after the fast-forward
- **Committed in:** n/a (fast-forward merge of already-existing commits, no new commit created)

**2. [Rule 3 - Blocking] Copied `.env.local` from the main repo checkout into this worktree**
- **Found during:** Pre-flight check before running the plan's `<verify>` tests
- **Issue:** `.env.local` (gitignored, holds `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_DB_URL`/etc.) is not copied into new git worktrees automatically; without it, `tests/helpers/db.ts`'s `adminClient()`/`createTestUser()` cannot reach the real Supabase project and every `tests/ai/*.test.ts` integration test would fail with an env-var error, not a real assertion failure.
- **Fix:** `cp` the main checkout's `.env.local` into this worktree's root; confirmed with `git check-ignore` that the file remains untracked/gitignored in the worktree (never staged or committed).
- **Files modified:** `.env.local` (untracked, not committed)
- **Verification:** `npx vitest run tests/ai/mention-search.test.ts tests/ai/mention-context.test.ts` connects to the real project and passes 9/9
- **Committed in:** n/a (gitignored file, intentionally never committed)

**3. [Rule 3 - Blocking] Logged pre-existing unrelated `tsc` error to `deferred-items.md` instead of fixing it**
- **Found during:** Task 3's `npx tsc --noEmit` verification
- **Issue:** `app/layout.tsx(20,50): error TS2304: Cannot find name 'LayoutProps'` — present since the original `create-next-app` scaffold commit (`191bd39`), completely unrelated to this plan's files.
- **Fix:** Verified via `git show 191bd39:app/layout.tsx` that the error predates any Phase 2/3/4 work; left unfixed per the scope-boundary rule and logged to `.planning/phases/04-ai-gateway-mention-based-generation/deferred-items.md`.
- **Files modified:** `.planning/phases/04-ai-gateway-mention-based-generation/deferred-items.md` (new)
- **Verification:** `npx tsc --noEmit` shows exactly this one pre-existing error and nothing new after Task 3's changes
- **Committed in:** will be included in this plan's metadata commit (docs)

---

**Total deviations:** 3 auto-fixed (all Rule 3 - blocking, none architectural)
**Impact on plan:** All three were prerequisites for being able to execute/verify the plan at all in this isolated worktree; none changed the plan's actual code scope.

## Issues Encountered
- Task 1 and Task 2 in the plan both target `lib/ai/mentions.ts` (Task 2 "appends" to Task 1's file). Since both functions were written to disk in a single `Write` call, Task 1's commit already contains `getMentionedNodesContent`; Task 2's commit is test-only. This does not change any acceptance criteria — both `npx vitest run tests/ai/mention-search.test.ts` and `tests/ai/mention-context.test.ts` pass independently, and `lib/ai/mentions.ts`'s final content matches the plan's `<action>` blocks exactly.

## User Setup Required
None - no external service configuration required by this plan.

## Next Phase Readiness
- `lib/ai/mentions.ts` is ready for Plan 04-04 (`generate` Server Action calls `getMentionedNodesContent` to inject KB content into the Gemini prompt) and Plan 04-06 (`MentionAutocomplete`/`QuickAddDialog` UI calls `searchMentionsAction`/`quickAddMentionAction`).
- No blockers identified for downstream Phase 4 plans.

---
*Phase: 04-ai-gateway-mention-based-generation*
*Completed: 2026-08-30*

## Self-Check: PASSED

- FOUND: `lib/ai/mentions.ts`
- FOUND: `tests/ai/mention-search.test.ts`
- FOUND: `tests/ai/mention-context.test.ts`
- FOUND: `app/studio/[workId]/chapters/[chapterId]/actions.ts`
- FOUND: `.planning/phases/04-ai-gateway-mention-based-generation/deferred-items.md`
- FOUND commit: `f407a3d`
- FOUND commit: `4072027`
- FOUND commit: `70acbc2`
