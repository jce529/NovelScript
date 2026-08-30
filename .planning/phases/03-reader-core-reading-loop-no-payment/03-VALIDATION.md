---
phase: 03
slug: reader-core-reading-loop-no-payment
status: final
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-29
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.11 |
| **Config file** | `vitest.config.ts` (root) |
| **Quick run command** | `npm test -- tests/reader` (once new test dir exists) |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30 seconds (integration tests against a live Supabase project) |

Existing tests are **integration tests against a live Supabase project** (using `tests/helpers/db.ts`'s `adminClient()`/`createTestUser()`), not mocks. Reader-phase tests follow the same convention, plus at least one non-admin-client test per new public RLS policy (Pitfall 2).

---

## Sampling Rate

- **After every task commit:** Run targeted `npx vitest run <new test file>`
- **After every plan wave:** Run `npm test` (full suite, matches existing Phase 1/2 convention)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01 Task 1-N | 03-01 | 1 | schema foundation | integration | `npx tsc --noEmit` / migration apply | pre-existing plan tasks | done |
| 03-02 Task 1-N | 03-02 | 2 | READ-01, READ-02 | integration | `npx vitest run tests/discovery/feed.test.ts`, `npx vitest run tests/discovery/public-read-rls.test.ts`, `npx vitest run tests/viewer/chapter-read.test.ts`, `npx vitest run tests/viewer/paid-lock.test.ts` | landed | done |
| 03-03 Task 1 | 03-03 | 2 | D-09 (view count) | integration | `npx vitest run tests/viewer/view-count.test.ts` | landed | done |
| 03-03 Task 2 | 03-03 | 2 | READ-04 | integration | `npx vitest run tests/reader/reading-progress.test.ts` | landed | done |
| 03-04 Task 1-N | 03-04 | 2 | D-08 (likes), READ-05 (report), READ-07 (알림), READ-08 (선호작) | integration | `npx vitest run tests/reader/likes.test.ts`, `npx vitest run tests/reader/reports.test.ts` (and subscription/bookmark lib tests) | landed | done |
| 03-05 Task 1-N | 03-05 | 3 | READ-01 (feed UI), READ-09 (promo banner) | automated (`npx tsc --noEmit`) | — | landed | done |
| 03-06 Task 1 | 03-06 | 3 | READ-04, READ-07, READ-08 | automated (`npx tsc --noEmit`) | — | landed | done |
| 03-06 Task 2 | 03-06 | 3 | READ-07, READ-08 | automated (`npx tsc --noEmit`) | — | landed | done |
| 03-06 Task 3 | 03-06 | 3 | READ-04, READ-05 | automated (`npx tsc --noEmit`) | — | landed | done |
| 03-07 Task 1 | 03-07 | 4 | READ-02, READ-03 | automated (`npx tsc --noEmit`) | — | landed | done |
| 03-07 Task 2 | 03-07 | 4 | READ-03, READ-05 | automated (`npx tsc --noEmit`) | — | landed | done |
| 03-07 Task 3 | 03-07 | 4 | READ-02, READ-04 | automated (`npm test`, full suite) | — | landed | done |

*Every task across 03-01 through 03-07 has an `<automated>` verify command in its PLAN.md — no `MISSING` markers were used, so no dedicated Wave 0 test-scaffold plan was needed. Prior versions of this file used placeholder `03-TBD` IDs before plan numbers were finalized; the table above reflects the actual landed plan/wave assignments.*

---

## Wave 0 Requirements

- [x] `tests/discovery/feed.test.ts` — covers READ-01 (landed in 03-02)
- [x] `tests/discovery/public-read-rls.test.ts` — covers READ-01, anon-client RLS proof (landed in 03-02)
- [x] `tests/viewer/chapter-read.test.ts` — covers READ-02 (landed in 03-02)
- [x] `tests/viewer/paid-lock.test.ts` — covers READ-02, content-leak guard (landed in 03-02)
- [x] `tests/viewer/view-count.test.ts` — covers D-09 (landed in 03-03)
- [x] `tests/reader/reading-progress.test.ts` — covers READ-04 (landed in 03-03)
- [x] `tests/reader/reports.test.ts` — covers READ-05 (landed in 03-04)
- [x] `tests/reader/likes.test.ts` — covers D-08 (landed in 03-04)
- [x] Extend `tests/helpers/db.ts` with an `anonClient()` factory — needed for RLS-proof tests (landed in 03-01/03-02)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Font size / theme toggle applies immediately and visually | READ-03 | Client-only UI state, not server-testable | Open a chapter in the viewer, open 보기 설정, step font size 17→19→21→24, switch 라이트/세피아/다크, confirm each change is reflected immediately in the reading pane |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (none existed — every task shipped with a real automated command)
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-08-29
