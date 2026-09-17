---
phase: 07-admin-moderation-surface
plan: "07"
subsystem: admin-moderation
tags: [supabase, concurrency, uat, verification]
requires:
  - 0006-0009 migrations (already applied on the test Supabase project)
  - 07-01..07-06 implementation
provides:
  - tests/admin/concurrency.database.test.ts (two-session races on committed disposable schema)
  - docs/admin-moderation.md (target, live privileges, race results, regression record)
  - 07-UAT.md (22 observed browser journeys)
affects:
  - Phase 7 completion (accepted with 2 deferred browser checks)
key-files:
  created:
    - tests/admin/concurrency.database.test.ts
    - docs/admin-moderation.md
    - .planning/phases/07-admin-moderation-surface/07-UAT.md
    - .planning/todos/pending/2026-09-17-phase-07-deferred-browser-checks.md
  modified:
    - tests/admin/blinding.test.ts
    - components/reader/feed-card.tsx
    - components/moderation/review-request.tsx
    - .planning/phases/07-admin-moderation-surface/07-VALIDATION.md
decisions:
  - "Migrations 0006-0009 were already live on the test project; verified by inspection instead of replaying"
  - "Races use a committed disposable schema + pg_stat_activity lock-wait barrier, dropped in afterAll"
  - "User accepted Phase 7 as complete with 2 browser checks deferred to a tracked todo"
metrics:
  completed: 2026-09-17
---

# 07-07 Summary: real DB, concurrency and browser verification

## Result

Phase 7 was **marked complete at the user's direction**. Two browser acceptance items are still unobserved and are tracked in
`.planning/todos/pending/2026-09-17-phase-07-deferred-browser-checks.md`:

1. Warning acknowledgement, including persistence after reload.
2. The suspended user's own UI.

## Tasks

- **07-01 DB target.**
  - Target: test Supabase project (session pooler in `ap-northeast-2`, PostgreSQL 17.6).
  - Migrations 0006–0009 were already applied. Live grants, RESTRICTIVE policies and column privileges were inspected read-only.
  - The 4 DB suites passed 44/44 with 0 skipped.
- **07-02 Races.**
  - `concurrency.database.test.ts` has 8 cases: competing resolutions, a late report, a duplicate retry, a holder rollback, warning/suspension in both orders, payment then blind, and blind then payment.
  - Three consecutive runs passed 8/8. A mutation check (blind checks removed from the purchase functions) was caught.
  - No schemas were left over.
- **07-03 Browser UAT.**
  - 22/22 observed journeys passed at 1440x900 and 390x844, in light and dark mode.
  - Covered: 404 for anonymous visitors and non-admins, the grouped queue and detail, validation, dialog focus and Escape, blind/suspend/warn, stale conflict, the writer's re-review request and the admin's unblind, and a purchased chapter restored with the wallet unchanged.

## Checks actually run

| Command | Result |
|---------|--------|
| 4 admin DB suites | 44/44, 0 skipped |
| `tests/admin/concurrency.database.test.ts` ×3 | 8/8 each run |
| `npx vitest run tests/admin` | 11 files, 275 passed |
| `npx vitest run --no-file-parallelism` | 52 files, 483 passed, 0 skipped |
| `npx vitest run` (parallel) | 12 failed (remote timeouts plus 1 real fake-client defect, now fixed) |
| `npx tsc --noEmit` | pass |
| `npm run lint` | 23 errors and 6 warnings, all in files from before Phase 7 |
| `next build` | not run |

## Commits

- `2ffc33b` test(07-07): two-session races, blinding fake-client fix, docs/admin-moderation.md
- `23ffc54` fix(feed): hydration mismatch on trending badge
- `e605d3a` fix(07-07): "이 회차는" particle
- `daca488`, `bfe48e5` docs(07-07): UAT and validation

## Deviations

- Codex delegation was blocked, because running Codex with sandbox network access was denied. Claude executed the plan directly.
- `tests/admin/blinding.test.ts`: the fake client gained `.range()`. It had been broken since feed commit 8916975.
- Home feed hydration fix (not in plan scope). It was reported by the user during UAT.
- Browser UAT used the user's own Kakao account as admin. Admin was granted via `grant_admin` with an audit row and is still active on the test DB. Fixture users (`uat-0707-*@novelscript.test`) and 50 test tokens (`UAT_GRANT`) remain.

## Deferred / known issues

See the todo file for full steps.

- Warning acknowledgement and the suspended user's UI are not observed in a browser.
- F-2: self-sanction attempts show generic validation copy.
- F-3: reader DB tests leave "테스트 작품" reports in the shared test DB.
- The parallel full suite times out against remote Supabase.
