---
phase: 02-studio-core-writer-loop-no-ai
verified: 2026-08-28T00:00:00Z
status: passed
score: 5/5 must-haves verified (35/35 plan-level sub-truths verified)
---

# Phase 2: Studio Core (Writer Loop, No AI) Verification Report

**Phase Goal:** Writers can build a knowledge base and draft/publish chapters, independent of AI assistance.
**Verified:** 2026-08-28
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Writer can create, edit, and delete KB documents across all 5 templates (인물/장소/사건/세력/아이템) | VERIFIED | `lib/kb/actions.ts` `createNode`/`saveNodeContent`/`deleteNode`, wired to UI via `components/studio/kb-node-dialogs.tsx` (`CreateNodeDialog`/`DeleteNodeDialog`) and `app/studio/[workId]/kb/[nodeId]/page.tsx` (single-textarea editor). `tests/kb/document-crud.test.ts` proves correct seeding for all 5 categories including the 사건 edge case. All 51 vitest tests pass against the live Supabase project. |
| 2 | Writer can view their KB documents in an IDE-style folder/file tree, organized by template type, scoped per work | VERIFIED | `lib/kb/tree.ts` (`buildTree`) + `lib/kb/actions.ts` (`getKbTree`, merges work-scoped + account-level template root) wired into `app/studio/[workId]/layout.tsx` → `components/studio/kb-tree.tsx`. `tests/kb/tree-query.test.ts` proves nesting + account-root merge + cross-owner isolation. |
| 3 | Writer can create and save a chapter draft with a title and order | VERIFIED | `lib/chapters/actions.ts` `createChapter`/`saveChapterContent` wired to `app/studio/[workId]/chapters/new/page.tsx` and `[chapterId]/page.tsx`. `tests/chapters/draft.test.ts` proves default order = max+1. |
| 4 | Writer can publish a chapter, marking it free or paid with a price | VERIFIED | `lib/chapters/actions.ts` `publishChapter` (zod-restricted to `PRICE_TIERS = [10,30,50,100]`) wired to `[chapterId]/page.tsx`'s free/paid `Button` toggle + `Select`. `tests/chapters/publish.test.ts` proves out-of-set tiers (e.g. 25) are rejected before any DB write. |
| 5 | Writer can edit or unpublish a chapter after publishing | VERIFIED | `saveChapterContent` works identically regardless of `is_published` (D-21); `unpublishChapter` is a distinct action that never touches `content` (D-22), confirmed byte-for-byte unchanged in `tests/chapters/edit-unpublish.test.ts`. UI's unpublish confirmation dialog uses `variant="outline"` only — never `destructive`. |

**Score:** 5/5 ROADMAP success criteria verified.

### Plan-Level Must-Haves (granular, from PLAN frontmatter)

| Plan | Truth | Status |
|------|-------|--------|
| 02-01 | works/kb_nodes/chapters schema live with ownership-scoped RLS | VERIFIED — `supabase/migrations/0002_studio.sql` applied; `tests/studio/schema-smoke.test.ts` passes |
| 02-01 | 6 fixed structural folders created atomically, immutable | VERIFIED — `guard_locked_kb_node` trigger + smoke test |
| 02-01 | Account-level template root idempotent | VERIFIED — `ensure_account_template_root` double-call test |
| 02-01 | Chapter reorder resequences without premature uniqueness violation | VERIFIED — `deferrable initially deferred` constraint + smoke test |
| 02-01 | 사건 template substitution handles missing placeholder | VERIFIED — `tests/kb/template-substitution.test.ts` |
| 02-02 | Writer creates work with title-only (D-03) | VERIFIED — `tests/works/work-crud.test.ts` |
| 02-02 | Work creation seeds 6 folders + 5 template files atomically (11 rows) | VERIFIED — asserted directly in test |
| 02-02 | Writer sees all works on dedicated 작품 목록 page (D-06) | VERIFIED — `app/studio/page.tsx` |
| 02-02 | Non-writer accounts blocked from /studio | VERIFIED — `app/studio/layout.tsx` redirects to `/write/start` |
| 02-02 | Writer never sees another writer's works | VERIFIED — `listWorks` scoped by `owner_id`, test asserts isolation |
| 02-02 | Genre select uses shadcn Select | VERIFIED — `app/studio/works/new/page.tsx` |
| 02-03 | Nested tree merges account-level template root | VERIFIED — `tests/kb/tree-query.test.ts` |
| 02-03 | New document seeded from correct template per Pattern 3 | VERIFIED — `tests/kb/document-crud.test.ts` |
| 02-03 | D-10 create-time template picker (arbitrary-named templates selectable) | VERIFIED — `tests/kb/template-options.test.ts`, `listTemplateOptions` |
| 02-03 | Locked folders reject rename/delete via direct Server Action call | VERIFIED — `tests/kb/locked-folder-guard.test.ts` |
| 02-03 | Cross-owner KB node mutation has no effect | VERIFIED — `tests/kb/ownership-guard.test.ts` |
| 02-03 | Sibling name collision rejected | VERIFIED — `createNode` catches Postgres `23505` |
| 02-04 | Chapter draft create/save + default order | VERIFIED — `tests/chapters/draft.test.ts` |
| 02-04 | Publish free/paid, fixed tiers only | VERIFIED — `tests/chapters/publish.test.ts` |
| 02-04 | Immediate edit while published (D-21) | VERIFIED — `tests/chapters/edit-unpublish.test.ts` |
| 02-04 | Unpublish distinct, content-preserving (D-22) | VERIFIED — same test file |
| 02-04 | Reorder resequences in one transaction (Pitfall 4) | VERIFIED — `tests/chapters/reorder.test.ts`, 3-chapter cyclic swap |
| 02-04 | Cross-owner chapter mutation rejected | VERIFIED — `tests/chapters/ownership-guard.test.ts`, 4 mutation fns |
| 02-05 | Writer opens work, sees 6-folder tree + account root nested | VERIFIED — `app/studio/[workId]/layout.tsx` calls `getKbTree`+`buildTree`, renders `KbTree` |
| 02-05 | Writer can create/rename/delete KB docs+folders via UI, locked folders protected | VERIFIED — `KbTreeActions` in `kb-node-dialogs.tsx`, conditionally hides rename/delete for `is_locked` nodes |
| 02-05 | Writer can open KB doc, edit full raw content, save | VERIFIED — `app/studio/[workId]/kb/[nodeId]/page.tsx` hydrates via `getNodeContentAction`, saves via `saveNodeContentAction` |
| 02-05 | Icon-only tree actions have tooltip/aria-label | VERIFIED — `IconButton` wraps every action in `Tooltip` + `aria-label` |
| 02-05 | Pinned 회차 nav link always visible while browsing KB tree (D-14) | VERIFIED — `ChaptersNavLink` rendered in `[workId]/layout.tsx` alongside (not inside) `KbTree` |
| 02-05 | D-10 create-time template picker surfaced in UI | VERIFIED — `CreateNodeDialog` fetches `listTemplateOptionsAction`, renders `Select` defaulting to `isDefault` |
| 02-06 | Chapters visible in order, drag-reorder persists after reload | VERIFIED — `ChapterList` uses `DndContext`/`useSortable`, `onDragEnd` calls `reorderChaptersAction` which `revalidatePath`s |
| 02-06 | New chapter draft appears at end of list | VERIFIED — `submitCreateChapter` → `createChapter` (default order = max+1) |
| 02-06 | Edit chapter content regardless of publish state | VERIFIED — `[chapterId]/page.tsx` `save()` always enabled once loaded |
| 02-06 | Publish free/paid via dropdown, never freeform | VERIFIED — shadcn `Select` renders exactly `PRICE_TIERS` |
| 02-06 | Unpublish distinct, non-destructive-styled confirmation | VERIFIED — confirmation dialog uses `variant="outline"` only, contains exact UI-SPEC copy |
| 02-06 | Forms built entirely from shadcn components | VERIFIED — zero raw `<input`/`<select`/`<button` in `chapters/new/page.tsx` and `[chapterId]/page.tsx` |

**Score:** 35/35 plan-level must-have truths verified.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/0002_studio.sql` | works/kb_nodes/chapters schema, RLS, guard trigger, 3 functions | VERIFIED | Applied to live Supabase; contains `create_work`, `ensure_account_template_root`, `reorder_chapters`, `guard_locked_kb_node`, `deferrable initially deferred` |
| `lib/kb/templates.ts` | Template substitution + seed helpers | VERIFIED | Exports `substituteTitle`, `readCanonicalSeed`, `buildSeedContent`, `seedTemplateFiles`, `KB_CATEGORIES` |
| `lib/kb/tree.ts` | Pure tree builder | VERIFIED | Exports `buildTree` |
| `lib/kb/actions.ts` | KB CRUD + tree query + template picker | VERIFIED | Exports `getKbTree`, `listTemplateOptions`, `createNode`, `renameNode`, `deleteNode`, `saveNodeContent` |
| `lib/works/actions.ts` | Work CRUD | VERIFIED | Exports `createWork`, `listWorks`, `getWork`, `GENRES` |
| `lib/chapters/actions.ts` | Chapter CRUD/publish/reorder | VERIFIED | Exports `createChapter`, `saveChapterContent`, `publishChapter`, `unpublishChapter`, `reorderChapters`, `listChapters`, `PRICE_TIERS` |
| `app/studio/layout.tsx` | Writer-role gate + account template provisioning | VERIFIED | Redirects non-writers, calls `ensure_account_template_root` + `seedTemplateFiles` every request |
| `app/studio/page.tsx` | 작품 목록 | VERIFIED | Contains literal string, calls `listWorks` |
| `app/studio/works/new/page.tsx` | 새 작품 만들기 form | VERIFIED | shadcn Input/Textarea/Select/Button only |
| `app/studio/[workId]/layout.tsx` | Work-scoped shell: tree + pinned chapters link | VERIFIED | Calls `getKbTree`, renders `ChaptersNavLink` + `KbTree` |
| `app/studio/[workId]/kb/[nodeId]/page.tsx` | KB document editor | VERIFIED | Single textarea, hydrates real content, saves via `saveNodeContentAction` |
| `components/studio/kb-tree.tsx` | Recursive tree component | VERIFIED | Exports `KbTree`, renders `Lock` icon w/ `aria-label` for locked nodes |
| `components/studio/kb-node-dialogs.tsx` | Create/Rename/Delete dialogs + D-10 picker | VERIFIED | Exports `KbTreeActions`, `CreateNodeDialog`, `RenameNodeDialog`, `DeleteNodeDialog` |
| `components/studio/chapters-nav-link.tsx` | Pinned 회차 nav | VERIFIED | Exports `ChaptersNavLink` |
| `components/studio/chapter-list.tsx` | dnd-kit sortable chapter list | VERIFIED | Contains `DndContext`, `useSortable`, calls `reorderChaptersAction` |
| `app/studio/[workId]/chapters/[chapterId]/page.tsx` | Chapter editor + publish controls | VERIFIED | Contains `publishChapter` flow, shadcn Select for price tiers |

All 16 artifacts across all 6 plans: exist, are substantive (no stubs/placeholders found), and are wired (see Key Link Verification below).

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `lib/works/actions.ts` (`createWork`) | `supabase/migrations/0002_studio.sql` | `create_work` RPC → `seedTemplateFiles` | WIRED | `supabase.rpc('create_work', ...)` at line 34, followed by `seedTemplateFiles` call |
| `app/studio/layout.tsx` | `supabase/migrations/0002_studio.sql` | `ensure_account_template_root` RPC | WIRED | Called every request, followed by `seedTemplateFiles` |
| `lib/kb/actions.ts` (`createNode`) | `lib/kb/templates.ts` | `buildSeedContent` | WIRED | Explicit call with resolved override |
| `app/studio/[workId]/layout.tsx` | `lib/kb/actions.ts`/`lib/kb/tree.ts` | `getKbTree` → `buildTree` | WIRED | Both called, tree passed to `KbTree` component |
| `components/studio/kb-tree.tsx` | `components/studio/kb-node-dialogs.tsx` | `renderRowActions` render-prop → `KbTreeActions` | WIRED | Layout supplies `renderRowActions={(node) => <KbTreeActions .../>}` |
| `components/studio/kb-node-dialogs.tsx` (`CreateNodeDialog`) | `lib/kb/actions.ts` | `listTemplateOptionsAction` → `listTemplateOptions` | WIRED | Fetched on dialog open, `Select` rendered from result |
| `components/studio/chapter-list.tsx` | `lib/chapters/actions.ts` | `reorderChaptersAction` → `reorderChapters` | WIRED | Called from `onDragEnd`, followed by `revalidatePath` |
| `app/studio/[workId]/chapters/[chapterId]/page.tsx` | `lib/chapters/actions.ts` | `publishChapterAction`/`unpublishChapterAction` | WIRED | Called from Button handlers, state updated on success |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `app/studio/page.tsx` | `works` | `listWorks(supabase, {ownerId})` → real `works` table query, `.eq('owner_id')` | Yes | FLOWING |
| `app/studio/[workId]/layout.tsx` | `flatNodes`/`tree` | `getKbTree` → real `kb_nodes` table query (two parallel selects) | Yes | FLOWING |
| `app/studio/[workId]/chapters/page.tsx` | `chapters` | `listChapters` → real `chapters` table query, ownership-verified | Yes | FLOWING |
| `app/studio/[workId]/kb/[nodeId]/page.tsx` | `content` | `getNodeContentAction` → real `kb_nodes.content` select | Yes | FLOWING |
| `app/studio/[workId]/chapters/[chapterId]/page.tsx` | `content`/`isPublished`/`priceTier` | `getChapterAction` → real `chapters` select via `works!inner(owner_id)` join | Yes | FLOWING |

No hardcoded/empty data sources found; all list/detail pages query the live Supabase tables established in `0002_studio.sql`.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full business-logic test suite (schema, works, KB, chapters — 13 files) | `npx vitest run tests/kb/ tests/works/ tests/chapters/ tests/studio/` | 51/51 tests passed against live Supabase | PASS |
| Whole-repo type check | `npx tsc --noEmit` | 0 errors | PASS |
| Migration idempotency / schema presence | grep for `create_work`, `ensure_account_template_root`, `reorder_chapters`, `guard_locked_kb_node`, `deferrable initially deferred` in `0002_studio.sql` | all present | PASS |
| Indigo accent applied | grep `var(--color-indigo-600)` / `var(--color-indigo-500)` in `app/globals.css` | present in both `:root` and `.dark` | PASS |
| No raw form elements in shadcn-mandated forms | grep `<input\|<select\|<button` across `works/new`, `chapters/new`, `chapters/[chapterId]` pages | zero matches | PASS |
| No `destructive` styling on unpublish confirmation | grep `destructive` in `chapters/[chapterId]/page.tsx` | zero matches | PASS |

Note: I did not start a dev server (`next dev`) to click through the UI live — this is covered under Human Verification below per 02-VALIDATION.md's own "Manual-Only Verifications" contract, which explicitly defers UI feel/interaction checks to a human QA pass.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| KB-01 | 02-01, 02-03, 02-05 | Writer can create, edit, and delete KB documents across 5 templates | SATISFIED | `lib/kb/actions.ts` CRUD + UI wiring, `tests/kb/document-crud.test.ts` |
| KB-02 | 02-01, 02-02, 02-03, 02-05 | Writer can browse KB documents in an IDE-style folder/file tree, scoped per work | SATISFIED | `lib/kb/tree.ts`/`getKbTree` + `components/studio/kb-tree.tsx`, `tests/kb/tree-query.test.ts` |
| CONT-01 | 02-01, 02-04, 02-06 | Writer can create and save chapter drafts with title and order | SATISFIED | `createChapter`/`saveChapterContent`, `tests/chapters/draft.test.ts`, `tests/chapters/reorder.test.ts` |
| CONT-02 | 02-01, 02-04, 02-06 | Writer can publish a chapter, marking it free or paid with a price | SATISFIED | `publishChapter` (fixed tiers), `tests/chapters/publish.test.ts` |
| CONT-03 | 02-04, 02-06 | Writer can edit or unpublish their own chapters after publishing | SATISFIED | `saveChapterContent` (works while published) + `unpublishChapter`, `tests/chapters/edit-unpublish.test.ts` |

All 5 requirement IDs declared for Phase 2 across the 6 plans' frontmatter are accounted for and marked `[x]` in `.planning/REQUIREMENTS.md`. Cross-referencing `.planning/ROADMAP.md`'s requirements-coverage table confirms no additional IDs are mapped to Phase 2 beyond these 5 — no orphaned requirements found.

### Anti-Patterns Found

None. Scanned all Phase 2 files (`lib/kb/*`, `lib/chapters/*`, `lib/works/*`, `app/studio/**`, `components/studio/*`) for TODO/FIXME/placeholder comments, empty implementations, hardcoded empty data, empty event handlers, and console.log-only implementations. No matches beyond a documentation comment referencing "the placeholder stays literal" (accurately describing intended template behavior, not a stub marker).

One pre-existing, unrelated `tsc` error documented in `deferred-items.md` (`app/layout.tsx` `LayoutProps` type) was checked and found to no longer reproduce — `npx tsc --noEmit` is fully clean across the whole repo at verification time.

### Human Verification Required

These items are explicitly called out in `02-VALIDATION.md`'s "Manual-Only Verifications" table as requiring interactive UI judgment that integration tests cannot meaningfully assert. All underlying business logic and wiring for these flows is verified above; only the felt UX quality remains unverified.

### 1. Drag-and-drop feel for chapter reorder

**Test:** Open `/studio/[workId]/chapters`, drag a chapter row to a new position using the grip handle.
**Expected:** Smooth visual feedback during drag; after releasing, the new order persists across a page reload (confirms `reorderChaptersAction` → `revalidatePath` round-trip feels correct, not just functionally correct).
**Why human:** Pointer/touch interaction quality and visual smoothness are not assertable via integration tests; `tests/chapters/reorder.test.ts` only proves the underlying DB resequencing is correct.

### 2. Locked-folder visual cues in the tree

**Test:** Open a work's Studio tree, inspect the 6 fixed folders (template/인물/장소/사건/세력/아이템) versus a user-created folder/file.
**Expected:** Locked folders show a `Lock` icon with tooltip and have no rename/delete action buttons rendered; user-created nodes show full action affordances.
**Why human:** Visual/UX distinction judgment; code confirms the icon and conditional rendering exist (`is_locked` gates the action buttons in `KbTreeActions`), but the actual visual clarity/discoverability needs a human eye.

### 3. Full Studio writer-loop walkthrough

**Test:** Starting from `/studio`, create a new work → open its tree → create a KB document (with an explicit non-default template choice via the D-10 picker) → edit and save it → navigate via the pinned 회차 link → create a chapter draft → edit content → publish as paid (30 토큰) → confirm it displays as published → unpublish it via the non-destructive confirmation → confirm content is unchanged.
**Expected:** Every step completes without error, with UI copy matching UI-SPEC exactly and no broken navigation.
**Why human:** End-to-end UX coherence across the whole writer loop — the individual pieces are each proven correct in isolation (51 passing tests + clean typecheck + wiring verification above), but a full walkthrough catches integration issues (e.g., stale cache, unexpected redirect loops, layout shift) that unit/integration tests don't cover by design. This is explicitly deferred to a human QA pass per `02-VALIDATION.md`.

### Gaps Summary

No gaps found. All 5 ROADMAP success criteria are verified with passing automated tests (51/51) against the live Supabase schema, a clean whole-repo `tsc --noEmit`, and confirmed wiring from UI through Server Actions through business logic through the database for every truth in scope. All 5 requirement IDs (KB-01, KB-02, CONT-01, CONT-02, CONT-03) are satisfied and cross-referenced with no orphans. The only remaining items are 3 human-verification checks for interactive UX feel, which were already flagged as manual-only in the phase's own validation strategy and do not block goal achievement — the underlying functionality they'd be judging is fully verified.

---

*Verified: 2026-08-28*
*Verifier: Claude (gsd-verifier)*
