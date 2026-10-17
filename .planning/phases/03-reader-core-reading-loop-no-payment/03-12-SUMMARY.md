---
phase: 03-reader-core-reading-loop-no-payment
plan: "12"
subsystem: reader-db
tags: [completion, security-definer, migration, tdd, READ-04]
requires:
  - "0024 chapter_reading_state, chapters.char_count, assert_chapter_reading_access, chapter_reading_snapshot (03-11)"
provides:
  - "lib/reader/completion.ts (provisional constants, minimumReadingMs, completionEligible)"
  - "supabase/migrations/0025_reader_completion.sql (complete_chapter RPC, chapter_minimum_reading_ms helper)"
affects: ["03-13", "03-19"]
tech-stack:
  added: []
  patterns: ["server judges only stored values", "coalesce-only idempotent timestamp", "SQL/unit formula parity fixtures"]
key-files:
  created:
    - lib/reader/completion.ts
    - tests/reader/completion.test.ts
    - supabase/migrations/0025_reader_completion.sql
    - tests/reader/completion-migration.test.ts
    - tests/reader/completion.database.test.ts
  modified: []
decisions:
  - "Provisional thresholds (LOW confidence): 1,200 chars/min, ratio 0.5, 30 s floor, 120 s idle (client only), end sentinel 1000 ms, max ratio 0.98, 5 s slack. Every threshold is inclusive (equality counts as met)"
  - "minimumReadingMs multiplies before dividing (exact for integers, 1 char = 25 ms); invalid/negative/non-integer counts throw RangeError; completionEligible returns false for invalid input and never throws"
  - "complete_chapter returns the unchanged ChapterReadingState snapshot (completedAt shows the result, no extra key); missing row returns the zero snapshot with sessionId null, same as save"
  - "Already-complete rows return immediately (first completedAt kept across retries and later visits); a different/previous session id is a normal not-complete snapshot, not an error"
  - "session_active_ms > DB elapsed + 5000 is treated as an unmet condition (not an exception) in complete_chapter, since save already raises active_time_exceeds_elapsed"
  - "Real-DB suite is opt-in via COMPLETION_DB_TEST=1 (visible todo otherwise; loud failure if env or 0024/0025 missing)"
metrics:
  duration: "~10m"
  completed: "2026-10-17"
requirements: [READ-04]
---

# Phase 3 Plan 12: Server completion judgement (0025) Summary

`complete_chapter(p_work_id, p_chapter_id, p_session_id)` decides completion only from what 0024 stored (max scroll ratio, latest end-sentinel time, cumulative active time, session clock) plus the private `chapters.char_count`, and writes nothing but `completed_at = coalesce(completed_at, now())`. `lib/reader/completion.ts` holds the same provisional formula for the client, and a static test compares the two with exact integer fixtures.

## Tasks

| # | Task | Commits | Files |
|---|------|---------|-------|
| 1 | Provisional thresholds and boundaries (TDD) | 50e0417 (RED), 7e2fae3 (GREEN) | lib/reader/completion.ts, tests/reader/completion.test.ts |
| 2 | complete_chapter RPC judged from DB values + regression tests (TDD) | 945d3b0 (RED), 7273975 (GREEN) | supabase/migrations/0025_reader_completion.sql, tests/reader/completion-migration.test.ts, tests/reader/completion.database.test.ts |

## What was built

- **Unit contract:** `minimumReadingMs(c) = max(30000, ceil(c*60000*0.5/1200))`. 0 chars -> 30000, 5000 -> 125000, 10000 -> 250000. `completionEligible` = ratio >= .98 AND sentinel >= 1000 AND active >= min. The module states that it does not replace the server decision.
- **`chapter_minimum_reading_ms(integer)`:** internal immutable SQL helper with numeric (exact) arithmetic. Execute is revoked from public/anon/authenticated/service_role.
- **`complete_chapter`:** SECURITY DEFINER with `search_path = public`. Order of steps: the shared 0024 gate (auth.uid -> profile FOR SHARE -> user_can_write -> chapter/work FOR SHARE with the real pair -> `get_chapter_access_state = 'readable'`, so blind, revoked-entitlement and sanction checks all run first), session null check, `char_count` read, state row FOR UPDATE (the same lock order as save). It uses only stored values and never changes active_ms. Execute is granted to authenticated only. There are no new tables, policies, profiles changes, metrics or ranking changes.

## Verification

- `npx vitest run tests/reader/completion.test.ts tests/reader/completion-migration.test.ts`: **57 passed, 0 failed** (31 unit + 26 static).
- The 0024 static test still passes (15/15).
- `npx vitest run tests/reader/completion.database.test.ts` without the opt-in flag: 1 todo, 16 skipped (by design).
- `npx tsc --noEmit`: no errors in plan files. The only errors are 3 pre-existing ones in the untracked `tests/payments/*`, which are outside this plan.
- `npx eslint` on all plan files: clean.

## Pending gates (not claimed as done)

- **0025 has not been applied to any database, and PostgreSQL has not executed the SQL.** It depends on 0024, which is also unapplied. Syntax and runtime behaviour are checked only by the static contract test.
- **The real-DB suite has not been run.** In 03-19, apply 0024 then 0025 and run:
  `COMPLETION_DB_TEST=1 npx vitest run tests/reader/completion.database.test.ts`
  It covers SQL/unit formula parity, 124999/125000, .9799/.98, 999/1000, the empty-chapter floor, completedAt idempotence (retry, concurrent and later visit), active time not double-counted, spoofed params, a clock moved forward (fake active time), previous or foreign session ids, another user, anon, a pair mismatch, paid locked/entitled/revoked, blind after reaching the end, a sanction after reaching the end, and direct completed_at forgery. RLS, grants and lock-order behaviour count as PASS only after that run.
- Wiring complete_chapter into the progress Route Handler is out of scope here (03-13).

## Deviations from Plan

- **[Rule 2 - Correctness] Internal SQL helper `chapter_minimum_reading_ms`.** The plan asks for the formula in SQL. A separate internal helper keeps it in one place, lets the static test check its constants against the unit module, and lets the DB suite compare the two directly. It has no API grants.
- **[Rule 2 - Correctness] Opt-in gate `COMPLETION_DB_TEST=1`** for the real-DB suite, following 03-11. This matches the orchestrator instruction and keeps `npm test` on the shared project from failing before 03-19.
- The `char_count` read also filters on `c.work_id = p_work_id`, as a defensive check on top of the gate's pair check.

## Known Stubs

None. No UI or route is wired here. 03-13 consumes `complete_chapter`.

## Self-Check: PASSED

- FOUND: lib/reader/completion.ts, tests/reader/completion.test.ts, supabase/migrations/0025_reader_completion.sql, tests/reader/completion-migration.test.ts, tests/reader/completion.database.test.ts
- FOUND: 50e0417, 7e2fae3, 945d3b0, 7273975
