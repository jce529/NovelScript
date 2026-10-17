---
phase: 03-reader-core-reading-loop-no-payment
plan: "13"
subsystem: reader-progress
tags: [reading-progress, route-handler, rpc-adapter, tdd, READ-04]
requires:
  - "0024 open_chapter_reading / save_chapter_reading + snapshot jsonb (03-11)"
  - "0025 complete_chapter (03-12)"
provides:
  - "lib/reader/chapter-reading.ts (ChapterReadingState, parseProgressRequest, open/get/save/completeChapterReading, ChapterReadingError)"
  - "POST /api/reader/progress (app/api/reader/progress/route.ts)"
  - "trackChapterOpenAction(workId, chapterId, locked, sessionId?) -> ChapterReadingState | null"
  - "ViewTracker visitKey + chapterVisitKey + visitOpenEffect"
affects: ["03-15", "03-16", "03-19"]
tech-stack:
  added: []
  patterns: ["Route Handler instead of Server Action for periodic saves (no sequential action queue)", "strict DTO with unknown-key rejection", "stable error codes only, raw DB text never kept", "ref-guarded effect keyed per visit"]
key-files:
  created:
    - lib/reader/chapter-reading.ts
    - app/api/reader/progress/route.ts
    - tests/reader/chapter-reading.test.ts
    - tests/reader/progress-route.test.ts
    - tests/reader/chapter-open.test.ts
  modified:
    - app/works/[workId]/chapters/[chapterId]/actions.ts
    - components/reader/view-tracker.tsx
    - components/reader/viewer-shell.tsx
    - tests/admin/user-flows.test.ts
decisions:
  - "ChapterReadingState.sessionId is typed string | null: 0024/0025 return a zero snapshot with sessionId null for a never-opened chapter"
  - "Route check order: same-origin (403) -> application/json (400) -> 8KB streamed limit (413) -> strict DTO (400) -> session user (401) -> RPC. Unknown keys such as userId/completedAt/charCount are 400"
  - "DB code -> HTTP: authentication_required 401, write_access_denied 403, chapter_not_readable 403, chapter_unavailable 404, invalid_input 400, active_time_exceeds_elapsed 400, anything else 500 internal_error. Responses are { ok, state } or { ok:false, error } with Cache-Control no-store"
  - "Same-origin uses Origin host vs x-forwarded-host (first value) or host; missing or 'null' Origin is 403"
  - "complete always runs save with the same sample first, then complete_chapter; if save fails, complete is not called"
  - "Open action: legacy 3-arg call keeps canView + upsertReadingProgress and now resolves null; with a sessionId it skips the upsert and calls only open_chapter_reading. locked=true, guest or a non-UUID session returns null without the RPC"
  - "visitKey = chapterId:sessionId:readable|locked, so a purchase that makes a chapter readable starts a new bootstrap. Without visitKey, ViewTracker fires once per mount (StrictMode re-run no longer double-counts views in dev)"
metrics:
  duration: "~20m"
  completed: "2026-10-17"
requirements: [READ-04]
---

# Phase 3 Plan 13: Progress Route Handler, RPC adapter and per-visit open bootstrap Summary

Progress saves now go to a Route Handler, `POST /api/reader/progress`, instead of a Server Action, so they do not wait in the Server Action queue behind report or like actions. The handler identifies the reader from the session cookie and writes only through the 0024/0025 RPCs. The chapter-open Server Action can now start a per-visit session through `open_chapter_reading` and returns the snapshot. `ViewTracker` opens once per visit key, so a StrictMode effect re-run does not open twice.

## Tasks

| # | Task | Commits | Files |
|---|------|---------|-------|
| 1 | RPC DTO and POST save/complete path (TDD) | 7b2c455 (RED), e75dc0f (GREEN) | lib/reader/chapter-reading.ts, app/api/reader/progress/route.ts, tests/reader/chapter-reading.test.ts, tests/reader/progress-route.test.ts |
| 2 | Open action and tracker as per-visit bootstrap (TDD) | c34cb97 (RED), d9b6798 (GREEN) | app/works/[workId]/chapters/[chapterId]/actions.ts, components/reader/view-tracker.tsx, tests/reader/chapter-open.test.ts (+ viewer-shell.tsx, tests/admin/user-flows.test.ts) |

## What was built

- **Adapter (`lib/reader/chapter-reading.ts`):**
  - `parseChapterReadingState` validates the RPC JSON.
  - `parseProgressRequest` is a strict DTO validator. It requires exactly 8 keys, UUIDs, a safe-integer sequence of 1 or more, a finite ratio from 0 to 1, non-negative safe-integer times, and `endVisibleMs` within int4.
  - `openChapterReading`, `saveChapterReading` and `completeChapterReading` are thin wrappers over the RPCs.
  - `getChapterReadingState` reads only the reader's own row (owner SELECT).
  - Errors are `ChapterReadingError` and carry only a stable code. The raw DB message is not kept.
- **Route (`app/api/reader/progress/route.ts`):**
  - Checks same-origin and content type, reads at most 8KB as a stream, validates the DTO, then authenticates with `auth.getUser`.
  - `save` calls `save_chapter_reading`. `complete` saves the same sample first, then calls `complete_chapter`.
  - A stale or duplicate sequence gets the unchanged snapshot back from the RPC.
  - It has no `revalidatePath`, no service role and no client-supplied identity.
- **Open action:** the 4th parameter `sessionId` switches to the RPC path.
  - The view count still runs on every visit, including anonymous ones, as before.
  - Suspended, blinded or unreadable readers, a forged `locked=false`, or any failure all resolve to `null`. Reading is never blocked.
- **ViewTracker:** has an optional `visitKey` prop, and `visitOpenEffect` is exported so it can be tested.
  - A ref guard survives the StrictMode cleanup and re-run.
  - `onOpen` is read from a ref that always holds the latest callback, so the effect depends only on the key.
  - A rejected `onOpen` is swallowed.

## Verification

- `npx vitest run tests/reader/progress-route.test.ts tests/reader/chapter-reading.test.ts`: 50 passed.
- `npx vitest run tests/reader/chapter-open.test.ts tests/reader/progress-route.test.ts tests/admin/user-flows.test.ts`: 64 passed.
- `npx vitest run --project unit`: 1335 passed. 3 files fail to load, all in the untracked `tests/payments/*`, which predate this plan and are not part of it.
- `npx tsc --noEmit`: clean except the same 3 pre-existing `tests/payments/*` errors.
- `npx eslint` on all touched files: clean.
- Route tests call the real `POST` with only the Supabase server factory mocked. Action tests call the real action. The tracker tests drive the real effect function through a harness that simulates mount, StrictMode cleanup and re-run, and key changes.

## Pending gates (not claimed as done)

- **0024/0025 are still unapplied.** The RPC names, parameter names and error codes are taken from the migration SQL and checked only by mocks. The live behaviour belongs to 03-19 (`READING_STATE_DB_TEST=1` / `COMPLETION_DB_TEST=1`). That covers session and sequence rejection on direct RPC calls, the owner-SELECT RLS for `getChapterReadingState`, and the pointer move inside `open_chapter_reading`.
- No browser has exercised the route: real cookies, Origin and Host behind the deployed proxy, and `keepalive` fetch. This is for 03-19.
- `graphify update .` and `scripts/graph-link-requirements.py` were not run, as the orchestrator instructed.

## Deviations from Plan

- **[Rule 3 - Blocking] `components/reader/viewer-shell.tsx`** is not in files_modified. The action now returns `Promise<ChapterReadingState | null>`, which no longer fits `onOpen: () => Promise<void>`. I wrapped the call as `async () => { await ... }` and kept it on the legacy 3-arg path. Passing a session id and `visitKey` belongs to the hook plans (03-15/03-16).
- **[Rule 3 - Blocking] `tests/admin/user-flows.test.ts`:** 3 assertions changed from `resolves.toBeUndefined()` to `resolves.toBeNull()` because of the new return type. The behaviour they check is unchanged.
- **[Rule 1 - Correctness] `sessionId: string | null`** instead of the interface's `string`, to match the zero snapshot that 0024/0025 actually return.
- **[Rule 2 - Correctness]** A non-UUID session id is rejected before the RPC. A missing or `null` Origin is treated as cross-origin (403). The content type must be `application/json`, otherwise 400.

## Known Stubs

- The viewer still calls `trackChapterOpenAction` with 3 arguments (legacy chapter-level upsert), and nothing calls `/api/reader/progress` yet. That is intentional. 03-15 adds `useReadingProgress` (the transport to this route, bootstrapped from the action snapshot) and 03-16 wires it into the viewer with `visitKey`. Until then, scroll progress is not saved in the running app.

## Self-Check: PASSED

- FOUND: lib/reader/chapter-reading.ts, app/api/reader/progress/route.ts, tests/reader/chapter-reading.test.ts, tests/reader/progress-route.test.ts, tests/reader/chapter-open.test.ts
- FOUND: 7b2c455, e75dc0f, c34cb97, d9b6798
