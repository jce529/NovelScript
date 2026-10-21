---
phase: 18-world-tree
plan: "11"
subsystem: world-tree
tags: [world-tree, routes, reader-tab, studio, entrypoints, tdd]
requires: ["18-04", "18-05", "18-07", "18-08", "18-09", "18-10", "18-14", "03-08"]
provides:
  - "components/world-tree/world-tree-tab.tsx: WorldTreeTab({workId}) / loadReaderWorldTree(supabase, workId) / WorldTreeReaderPanel"
  - "components/world-tree/world-tree-client.tsx: ReaderWorldTreeClient / OwnerWorldTreeClient / EnsureWorldTreeButton"
  - "app/works/[workId]/world-tree/page.tsx: standalone large reader view"
  - "app/studio/[workId]/world/page.tsx: owner world settings page (WorldSettings + WorldTreeView + validated ?draft=)"
  - "app/studio/[workId]/world/actions.ts: getReaderPreviewWithMetricsAction"
affects: ["18-12"]
tech-stack:
  added: []
  patterns:
    - "Reader surfaces re-ask get_world_tree with p_reader_preview for owner/admin viewers; anything that is not a reader projection is an error state"
    - "Thin 'use client' wrappers add only router.refresh() retry and Server Action reader preview around WorldTreeView"
    - "Query params that name rows (?draft=) are re-resolved owner-scoped on the server before use"
key-files:
  created:
    - components/world-tree/world-tree-tab.tsx
    - components/world-tree/world-tree-client.tsx
    - app/works/[workId]/world-tree/page.tsx
    - app/studio/[workId]/world/page.tsx
    - tests/world-tree/entrypoints.test.ts
  modified:
    - app/works/[workId]/page.tsx
    - app/studio/[workId]/page.tsx
    - app/studio/[workId]/world/actions.ts
    - components/world-tree/world-settings.tsx
requirements: [WTREE-01, WTREE-02, WTREE-03, WTREE-04, WTREE-05, WTREE-06, WTREE-07, WTREE-08, WTREE-10]
decisions:
  - "On the public work detail / large view, an owner or admin viewer still gets only the reader projection: the loader re-calls getWorldTree({readerPreview:true}) and fails closed unless the answer is audience 'reader'. The owner sees an extra '세계관 설정에서 전체 보기' link to /studio/{id}/world for the full view."
  - "The lore tab is wrapped in <Suspense> so the world-tree RPCs do not block the rest of the work detail page."
  - "The standalone page uses static metadata title '세계수' so a private root title cannot reach the document title; the visible heading is the reader projection header (the requested published work)."
  - "Unavailable entry: the standalone page is notFound (same as any unavailable work); inside the tab it is a neutral '아직 세계수에 보일 작품이 없어요.' notice (the detail page itself already 404s for unpublished works via getPublicWork/RLS)."
  - "Invalid ?draft= (not a UUID, not owned, not a live draft, parent not this work, root mismatch) is notFound; a transient lookup failure shows an alert instead of silently ignoring the draft."
  - "The trunk is created only by an explicit owner click (EnsureWorldTreeButton -> ensureWorldTreeAction -> idempotent ensure_world_tree), never on page render. begin_world_branch also creates the trunk implicitly, so branching does not depend on it."
  - "When the owner's work is not reader-visible, the injected tree view's reader preview shows an empty reader projection ('아직 발행된 작품이 없어요.') instead of the generic error."
  - "WorldSettings shows only one author/reader switch: when ownerTreeSlot is injected the slot (WorldTreeView) owns the switch and the server reader preview."
metrics:
  duration: "~35m"
  completed: "2026-10-19"
  tasks: 2
  files: 9
---

# Phase 18 Plan 11: Lore slot, standalone world tree and studio entry points Summary

The 03-08 work detail `세계관` tab now renders the reader world tree. `/works/{id}/world-tree` is the large view, and `/studio/{id}/world` puts the 18-07 owner state, the 18-09 WorldSettings/BranchWizard and the 18-10 WorldTreeView on one page. The studio work home links to that page. Reader surfaces only ever receive the server's reader projection.

## Tasks

| Task | Phase | Commit | Files |
| ---- | ----- | ------ | ----- |
| 1 | RED | 7411587 | tests/world-tree/entrypoints.test.ts |
| 1 | GREEN | e3401e7 | world-tree-tab.tsx, world-tree-client.tsx, app/works/[workId]/page.tsx, app/works/[workId]/world-tree/page.tsx, world/actions.ts, test |
| 2 | RED | 7a25dcf | tests/world-tree/entrypoints.test.ts |
| 2 | GREEN | 58b832c | app/studio/[workId]/world/page.tsx, app/studio/[workId]/page.tsx, world-settings.tsx |

I made no REFACTOR commits because nothing needed changing.

## Hand-offs resolved

1. **WorldTreeView was not rendered by any route.** It is now rendered in three places:
   - In the reader tab and the large view, through `ReaderWorldTreeClient` (mode `reader`, retry = `router.refresh()`).
   - On the studio world page, through `OwnerWorldTreeClient`. That one gets the owner projection, `studioLinks` (`/studio/{id}/world/timeline` and `/studio/{id}/world#world-branching`), and `onReaderPreview`.
   - `onReaderPreview` uses the new `getReaderPreviewWithMetricsAction`. It wraps 18-07's `getReaderPreviewAction` and adds the reader-keyed scores.

   Scores come from `loadWorldTreePopularity`. The reader view passes `projection.nodes` (keyed by nodeKey; stubs are skipped). The owner view passes `branches.map(b => ({nodeType:'work', nodeKey: b.workId, metrics}))`.

   The reader view gets only a reader projection. For an owner/admin viewer, `loadReaderWorldTree` asks again with `readerPreview:true`. Any answer that is not `audience:'reader'` becomes the error state, and the metric adapter is not called. 18-10's own fail-closed check stays in place as a second layer.
2. **WorldSettings had no page.**
   - `ownerTreeSlot` is set to `OwnerWorldTreeClient`. If the tree failed to load, the slot shows the error state with retry.
   - `timelineHref` is `/studio/{id}/world/timeline` and `publishHref` is `/studio/{id}/chapters`.
   - `?draft=` is checked on the server before the page passes it on as `resumeDraft`. It must be a UUID. `getOwnedBranch({ownerId, workId: draft})` must return a live branch owned by the user, with status `draft`, a kind other than trunk, and a requestId. `getOwnedBranch({branchId: parentBranchId})` must return a parent whose `workId` is this page's work and whose root is the same. If any check fails, the page is notFound.
3. **No way to create a tree.** If the owner state has no branch, the page shows the owner-only `EnsureWorldTreeButton` ("세계수 시작하기 / 세계수 만들기"). It calls the session-checked `ensureWorldTreeAction` and then `router.refresh()`. Rendering the page never writes. Someone else's work is notFound before anything is shown.
   - I did not change the 18-08 timeline page's "no tree" text notice. The way to create a tree is now the world settings page, which the work home links to.
4. **Reader tab and route.**
   - In `app/works/[workId]/page.tsx`, I replaced only the content of `<TabsContent value="lore">` with `<Suspense><WorldTreeTab workId={workId} /></Suspense>`. intro, chapters and reviews, the tab order and values, the single report button outside the tabs, the header and stats, and the blinded early return are unchanged.
   - `app/works/[workId]/world-tree/page.tsx` added (await params, UUID check, notFound when unavailable, existing SiteHeader).
   - Broken-branch stubs never show a title, id or work link. Tests check that the root title, `rootWork` and `rootBranch` UUIDs, and a `/works/{root}` link are absent from the HTML.

## Verification

- RED: both RED commits failed on import (`world-tree/page`, then `studio/[workId]/world/page`).
- `npx vitest run --project unit tests/world-tree/entrypoints.test.ts tests/world-tree/projection.test.ts`: passed (entrypoints 35 tests).
- `npx vitest run --project unit tests/world-tree tests/reader tests/studio`: 53 files, 911 tests passed. This includes the existing 03-08 `tests/reader/work-detail-shell.test.ts`, which still passes with the async tab inside Suspense, and the 18-07 `actions.test.ts`.
- `npx tsc --noEmit -p .`: clean across the repo (0 errors).
- eslint on all touched files: 0 errors. The only warning is the existing `era-board.tsx` exhaustive-deps warning from 18-08, which this plan did not touch.
- Next docs read before writing: 03-layouts-and-pages (async `params`/`searchParams`), 05-server-and-client-components (serializable props, client wrappers for callbacks), 07-mutating-data (refresh after mutations).

## Deviations from Plan

- **[Rule 3 - Blocking] New client wrapper file `components/world-tree/world-tree-client.tsx`.** A Server Component cannot pass `onRetry`/`onReaderPreview` functions to WorldTreeView, so a small `'use client'` wrapper was needed. It is not in the plan's file list.
- **[Rule 2 - Correctness] `getReaderPreviewWithMetricsAction` added to the 18-07 actions file.** The owner reader preview would otherwise always show "metric failed". It reuses `getReaderPreviewAction` (same session and owner checks) and adds nothing else.
- **[Rule 1 - UX bug] WorldSettings showed two author/reader switches once a tree view was injected.** It now hides its own switch when `ownerTreeSlot` is set. This is a minimal edit to the 18-09 file.
- The work home links are shown only when the owner-scoped `getWork` returns the work. The rest of the existing home is preserved.

## Gaps (gate 18-12)

- **Browser not verified:**
  - Real 4-tab DOM switching and lazy mounting of the lore tab.
  - Suspense streaming of the lore tab.
  - `router.refresh()` retry, the EnsureWorldTreeButton refresh, and the `?draft=` reload after begin (BranchWizard `router.replace`).
  - Editor-return diff refetch.
  - Owner reader-preview toggle inside the settings page.
  - Mobile layout of the large view.
- **Live DB not run:**
  - `get_world_tree` audience switching for an owner on the public page.
  - `get_world_tree_metric_baseline` grant for anon/authenticated (the tab calls it for signed-out readers).
  - `ensure_world_tree` idempotency on revisit. The page never calls it on render; the RPC's own idempotency is 18-03/18-12's to prove.
  - No `--project db` or `*.database.test.ts` suites were run.
- **Publish changes:** stubs restored after a publish change are re-read on the next request (no cache; checked by consecutive loader calls in tests). 18-07 actions revalidate `/works/{id}`, but the existing chapter publish actions (Phase 2) do not revalidate `/works/{id}/world-tree` or the root's paths. The page is dynamic (session cookie), so this matters only for client router cache staleness. Confirm this in 18-12.
- An owner who opens `/works/{id}` gets two `get_world_tree` calls (full, then reader preview). Readers get one.
- Not run, per orchestrator instruction: `graphify update .`, `scripts/graph-link-requirements.py`, STATE.md and ROADMAP.md.

## Known Stubs

None. The empty reader projection used by the owner preview when the work is not reader-visible is intentional: it renders the UI-SPEC "아직 발행된 작품이 없어요." state and carries no data.

## Self-Check: PASSED

- FOUND: components/world-tree/world-tree-tab.tsx, components/world-tree/world-tree-client.tsx, app/works/[workId]/world-tree/page.tsx, app/studio/[workId]/world/page.tsx, tests/world-tree/entrypoints.test.ts
- FOUND commits: 7411587, e3401e7, 7a25dcf, 58b832c
