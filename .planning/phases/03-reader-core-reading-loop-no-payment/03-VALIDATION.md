---
phase: 03
slug: reader-core-reading-loop-no-payment
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| 03-TBD | TBD | 0 | READ-01 | integration | `npx vitest run tests/discovery/feed.test.ts` | ❌ W0 | ⬜ pending |
| 03-TBD | TBD | 0 | READ-01 | integration | `npx vitest run tests/discovery/public-read-rls.test.ts` | ❌ W0 | ⬜ pending |
| 03-TBD | TBD | 0 | READ-02 | integration | `npx vitest run tests/viewer/chapter-read.test.ts` | ❌ W0 | ⬜ pending |
| 03-TBD | TBD | 0 | READ-02 | integration | `npx vitest run tests/viewer/paid-lock.test.ts` | ❌ W0 | ⬜ pending |
| 03-TBD | TBD | 0 | READ-03 | manual | — | n/a | ⬜ pending |
| 03-TBD | TBD | 0 | READ-04 | integration | `npx vitest run tests/reader/reading-progress.test.ts` | ❌ W0 | ⬜ pending |
| 03-TBD | TBD | 0 | READ-05 | integration | `npx vitest run tests/reader/reports.test.ts` | ❌ W0 | ⬜ pending |
| 03-TBD | TBD | 0 | D-08 (likes) | integration | `npx vitest run tests/reader/likes.test.ts` | ❌ W0 | ⬜ pending |
| 03-TBD | TBD | 0 | D-09 (view count) | integration | `npx vitest run tests/viewer/view-count.test.ts` | ❌ W0 | ⬜ pending |

*Task IDs/plan/wave columns will be finalized once the planner assigns actual plan numbers.*

---

## Wave 0 Requirements

- [ ] `tests/discovery/feed.test.ts` — covers READ-01
- [ ] `tests/discovery/public-read-rls.test.ts` — covers READ-01 (anon-client RLS proof)
- [ ] `tests/viewer/chapter-read.test.ts` — covers READ-02
- [ ] `tests/viewer/paid-lock.test.ts` — covers READ-02, content-leak guard
- [ ] `tests/viewer/view-count.test.ts` — covers D-09
- [ ] `tests/reader/reading-progress.test.ts` — covers READ-04
- [ ] `tests/reader/reports.test.ts` — covers READ-05
- [ ] `tests/reader/likes.test.ts` — covers D-08
- [ ] Extend `tests/helpers/db.ts` with an `anonClient()` factory (only `adminClient()` exists today) — needed for RLS-proof tests

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Font size / theme toggle persists and applies | READ-03 | Client-only UI state, not server-testable | Open reader, change font size/theme, reload page, confirm setting persisted (localStorage) and applied |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
