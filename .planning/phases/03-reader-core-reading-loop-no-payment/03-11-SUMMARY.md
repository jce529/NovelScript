---
phase: 03-reader-core-reading-loop-no-payment
plan: "11"
subsystem: reader-db
tags: [reading-progress, rls, security-definer, migration, READ-04]
requires:
  - "0003 reading_progress, 0005 chapters column grants, 0008 user_can_write/current_user_can_write, 0009 get_chapter_access_state"
provides:
  - "supabase/migrations/0024_chapter_reading_state.sql (chapters.char_count, chapter_reading_state, open_chapter_reading, save_chapter_reading)"
  - "ChapterReadingState snapshot jsonb DTO for 03-12 (complete RPC) and 03-13 (route/adapter)"
affects: ["03-12", "03-13", "03-19"]
tech-stack:
  added: []
  patterns: ["SECURITY DEFINER RPC-only writes", "0008 restrictive guards on new table", "session/sequence idempotence"]
key-files:
  created:
    - supabase/migrations/0024_chapter_reading_state.sql
    - tests/reader/reading-state-migration.test.ts
    - tests/reader/reading-state.database.test.ts
  modified: []
decisions:
  - "Access errors are raised as stable codes (authentication_required, invalid_input, write_access_denied, chapter_unavailable, chapter_not_readable, active_time_exceeds_elapsed); stale/duplicate/previous-session samples return the unchanged snapshot instead"
  - "save on a never-opened chapter returns a zero snapshot with sessionId null (no row created)"
  - "A save with sequence higher but session_active_ms lower than stored is treated as out-of-order (unchanged snapshot)"
  - "end_visible_ms stores the latest valid value (0..elapsed+5000); invalid values keep the previous one"
  - "Real-DB suite is opt-in via READING_STATE_DB_TEST=1 (visible todo otherwise; loud failure if env or 0024 missing)"
metrics:
  duration: "~25m"
  completed: "2026-10-17"
requirements: [READ-04]
---

# Phase 3 Plan 11: chapter_reading_state (0024) Summary

0024 adds a private plain-text `chapters.char_count`, an owner-SELECT-only `chapter_reading_state` table, and two SECURITY DEFINER RPCs (`open_chapter_reading` / `save_chapter_reading`) that re-check auth, write access, chapter/work pairing and `get_chapter_access_state` under the 0008/0009 lock order, with session/sequence idempotence so replays and late flushes cannot inflate active time or rewind the continue-reading pointer.

## Tasks

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Plain-text/permission fact check, 0024 schema + open/save RPCs, static contract test | bae7502 | supabase/migrations/0024_chapter_reading_state.sql, tests/reader/reading-state-migration.test.ts |
| 2 | Real-DB regression suite (written, not executed; reserved for 03-19) | a193819 | tests/reader/reading-state.database.test.ts |

## What was built

- **Premise check:** `saveChapterContent` writes the studio `<Textarea>` string verbatim to `chapters.content` (plain text). The static test pins that premise so a switch to HTML/JSON would fail it.
- **`chapters.char_count`:** `char_length(regexp_replace(content, '\s', '', 'g'))` generated stored. No grant (chapters has no table-level SELECT since 0005); `content` grants untouched.
- **`chapter_reading_state`:** PK (user_id, chapter_id), FK work_id, composite FK (chapter_id, work_id) -> chapters, ratios numeric(5,4) in 0..1 with scroll<=max, bigint active/session times, last_sequence, end_visible_ms, session_id/session_started_at. RLS on, only `owner_select` policy, `revoke all` from public/anon/authenticated then `grant select` to authenticated, plus three restrictive `current_user_can_write()` guards (0008 left untouched).
- **Gate `assert_chapter_reading_access`** (internal): auth.uid -> profile FOR SHARE (non-deleted) -> user_can_write -> chapters/works FOR SHARE with real pair -> `get_chapter_access_state = 'readable'` (blind first, owner reading own published paid chapter allowed).
- **`open_chapter_reading`:** upsert keeps first opened_at; same session keeps session clock/sequence; new session resets session_active_ms/last_sequence/end_visible_ms and starts at DB now(). Moves `reading_progress.chapter_id` in the same transaction.
- **`save_chapter_reading`:** row FOR UPDATE; accepts only the current session and a strictly larger sequence with non-decreasing session time; rejects session_active_ms > DB elapsed + 5000 ms; scroll overwritten, max = greatest, active_ms += max(delta, 0). Never touches reading_progress or completed_at.
- Execute: revoked from public/anon/authenticated/service_role, granted to authenticated only. Helpers revoked from everyone. Migration is wrapped in begin/commit with `notify pgrst, 'reload schema'`.

## Verification

- `npx vitest run tests/reader/reading-state-migration.test.ts`: **15 passed, 0 failed**.
- `npx vitest run tests/reader/reading-state.database.test.ts` (no opt-in): 1 todo, 20 skipped (by design, see gap below).
- `npx tsc --noEmit`: no errors in plan files. The only errors are 3 pre-existing ones in the untracked `tests/payments/*` (missing toss routes), which are not part of this plan.
- `npx eslint` on both new test files: clean.

## Pending gates (not claimed as done)

- **0024 has not been applied to any database** and the SQL has not been run by PostgreSQL (no local Postgres in this environment; the shared project must not be migrated here). Syntax and runtime behaviour are verified only by the static contract test.
- **The real-DB suite was not executed.** 03-19 Task 1 must apply 0024 to the test project and run:
  `READING_STATE_DB_TEST=1 npx vitest run tests/reader/reading-state.database.test.ts`
  Note the env flag: the 03-19 verify command lists the file without it, and without the flag the suite only shows a todo. RLS, grants, lock order and race behaviour count as PASS only after that run.

## Deviations from Plan

- **[Rule 2 - Correctness] Opt-in gate for the real-DB suite.** The plan says not to skip silently. The orchestrator asked for opt-in live-DB suites. Both are met: without `READING_STATE_DB_TEST=1` the suite shows as a visible `it.todo`, and with the flag a missing env or an unapplied 0024 fails in beforeAll. This also keeps `npm test` on the shared project from failing before 03-19 applies 0024.
- **[Rule 2 - Correctness] Shared internal gate function.** The open/save access checks are factored into `assert_chapter_reading_access` (SECURITY DEFINER, no execute grants), so both RPCs run the identical lock-order/readable check. The `chapter_reading_snapshot` helper is also internal. Neither replaces an existing function.
- Additional defensive constraints not spelled out in the plan: `check (scroll_ratio <= max_scroll_ratio)` and the composite FK (chapter_id, work_id).

## Known Stubs

None. No UI or data flow is wired in this plan. The route/adapter (03-13) and the completion RPC (03-12) consume this.

## Self-Check: PASSED

- FOUND: supabase/migrations/0024_chapter_reading_state.sql
- FOUND: tests/reader/reading-state-migration.test.ts
- FOUND: tests/reader/reading-state.database.test.ts
- FOUND: bae7502, a193819
