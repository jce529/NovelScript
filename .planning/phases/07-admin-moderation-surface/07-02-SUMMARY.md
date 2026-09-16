---
phase: 07-admin-moderation-surface
plan: "02"
subsystem: admin-moderation
tags: [supabase, rpc, idempotency, audit, moderation, zod, server-only]
requires:
  - 0006_admin_foundation.sql (admin_users, admin_actions, apply_user_sanction, blind flags, review requests)
  - lib/admin/auth.ts withAdminAction
provides:
  - moderate_report_group / unblind_moderation_target / resolve_review_request (service_role only)
  - list_report_groups / get_report_group_detail / list_review_requests / get_review_request_detail (service_role only)
  - lib/admin/queries.ts listReportGroups, getReportDetail, listReviewRequests, getReviewRequestDetail
  - lib/admin/actions.ts moderateReportGroup, unblindTarget, resolveReviewRequest
affects:
  - 07-05 (admin UI and Server Actions wrap these functions)
  - 07-06 (writer review requests end in maintained/unblinded here)
  - 07-07 (live DB apply and two-session concurrency tests for 0007)
tech-stack:
  added: []
  patterns:
    - one admin_actions row per operation carries idempotency key, report_ids and reasons, written in the same transaction
    - opaque target version (md5 of blind state + audit trail on the exact target) for stale detection that ignores late reports
    - advisory xact lock on (actor, key) before membership lock so same-key retries serialize
    - read RPCs return rows/jsonb; TypeScript maps field by field into DTOs
key-files:
  created:
    - supabase/migrations/0007_admin_operations.sql
    - lib/admin/actions.ts
    - lib/admin/queries.ts
    - tests/admin/operations.database.test.ts
    - tests/admin/moderation.test.ts
  modified:
    - lib/admin/types.ts
decisions:
  - "Stale check = reviewed report no longer open OR target version changed; version excludes reports so late reports never invalidate a review and stay open"
  - "Operative actions (blind/warn/suspend/permanent_suspend) need both internal reason (resolution_note, audit reason, sanction internal_note) and public reason (blind reason, sanction public_reason); resolve/dismiss notes optional; unblind and review outcomes require a reason"
  - "Sanctions from a report group target the work owner; the actor cannot sanction themself"
  - "Direct unblind also closes an open review request on that target as 'unblinded' in the same transaction"
  - "Blinding an already-blinded target raises stale_target rather than silently re-blinding"
  - "Exported lib/admin functions authorize first, then validate, so unauthorized callers learn nothing about input shape"
metrics:
  duration: 35min
  completed: 2026-09-16
---

# Phase 7 Plan 02: Transactional Moderation and Grouped Queue Services Summary

Service-role-only SQL commands that resolve, dismiss, blind, warn or suspend exactly the reports an operator reviewed. Each one writes a single audit row with an idempotency key in the same transaction. Grouped queue and detail reads sit next to them, and server-only TypeScript wrappers re-authorize on every call, validate with Zod and return safe error codes.

## What was built

**Task 02-01: `0007_admin_operations.sql` + `tests/admin/operations.database.test.ts` (commit 8a5d8b0)**
- `moderate_report_group(actor, key, work, chapter, report_ids[], expected_version, action, reason, public_reason, ends_at)` does the following in order:
  1. Validates the arguments and takes an advisory lock on (actor, key).
  2. Re-checks active membership.
  3. Looks for an existing action with the same key. The identical operation returns the recorded ID; a different operation raises `idempotency_conflict`.
  4. Locks the author profile (sanctions only), then the target content, then the reports in ID order.
  5. Checks that every ID matches the exact target, including null-chapter work targets. Then it raises `stale_target` if a reviewed report is no longer open or the version changed.
  6. Blinds the target, writes the audit row, applies the sanction through the existing `apply_user_sanction`, and resolves or dismisses only the reviewed IDs.
- `unblind_moderation_target` clears a blind (D-15) and closes any open review request on that target.
- `resolve_review_request` sets the terminal state `maintained` or `unblinded` (D-16). Both commands are audited and idempotent and check the target version.
- Read functions:
  - `list_report_groups(status, limit, offset)` aggregates by (work_id, chapter_id), sorts oldest group first with a stable tie-break, and paginates by groups.
  - `get_report_group_detail(anchor)` returns all reports on the target, the body (chapter content or work synopsis), open reviewed IDs, the target version, and the author's report and action history (50 entries each).
  - `list_review_requests` and `get_review_request_detail` cover the re-review queue.
- Privileges: every function has pinned `search_path = public` and revokes PUBLIC/anon/authenticated. Only the 7 public entry points are granted to service_role; internal helpers are not granted to anyone.

**Task 02-02: `lib/admin/queries.ts`, `lib/admin/actions.ts`, `tests/admin/moderation.test.ts` (commit 7d90b4a)**
- Every export uses the same order: `withAdminAction` (fresh session and membership check), then Zod, then one RPC. The actor is always `actor.userId`, and forged `actorId` input is stripped.
- Queries default to status open and page 1. They request 26 rows to work out `hasNext` and map fields explicitly, so extra DB keys never appear in DTOs.
- Commands trim reasons and require them for operative actions (`reason_required` with `fieldErrors`). Timed suspension needs a future ISO expiry, and other actions cannot have one.
- DB errors map to `stale_target`, `conflict`, `validation_failed`, `not_found` or `unavailable`. Raw messages never come back.
- `types.ts` gained:
  - `reporterCount`, `blinded` and `targetVersion`
  - `target` on report items
  - `ReviewRequestDetail` and `AdminPage`
  - `MODERATION_ACTIONS`, `OPERATIVE_MODERATION_ACTIONS` and `REVIEW_OUTCOMES`

## Verification (actual results)

| Check | Result |
|---|---|
| `npx vitest run tests/admin/moderation.test.ts tests/admin/authorization.test.ts --passWithNoTests=false` | **71/71 passed** |
| `npx vitest run tests/admin/operations.database.test.ts` against `SUPABASE_DB_URL` | **BLOCKED**: `tenant/user postgres.ymudwgsojikwqrhzkmav not found`, 15 skipped. Same environment failure as 07-01 |
| Same DB suite on the scratchpad PGlite (Postgres 17) harness with Supabase roles emulated (outside the repo) | **15/15 passed**; with 0006 foundation suite **24/24** |
| Mutation checks on PGlite: removed the reviewed-report status check, the idempotent replay and the actor membership recheck | Each was caught by a failing test, then passed again once the code was restored. The first mutation initially survived because the version check masked it, so an independent assertion was added |
| `npx tsc --noEmit` | clean |
| `npx eslint lib/admin tests/admin` | clean |
| Full `npx vitest run` | 86 failures, all in live-Supabase integration suites (`AuthRetryableFetchError: fetch failed` / tenant not found). They also fail with this plan's type changes stashed, so they come from the environment and not from this plan |

The rollback test adds a trigger that makes the audit insert fail, and also uses a suspension whose expiry is rejected after the audit insert. In both cases the blind flags, report status, sanctions and audit rows stay unchanged.

PGlite is a single connection, so real two-session races (competing operators, concurrent same-key retries) are **not** verified here. Plan 07-07 still owns them, along with applying 0007 to a real Supabase target.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Database verification on PGlite because the configured DB is unreachable**
- Reused the 07-01 scratchpad harness unchanged. No project dependencies or config were added.

**2. [Rule 3 - Blocking] SQL names are not schema-qualified; safety comes from a pinned `set search_path = public` instead**
- The plan asked for qualified SQL names. The repository's isolated-schema DB test pattern rewrites `search_path = public` to a throwaway schema. Hard-coding `public.` would make tests hit the real schema. 0006 made the same choice.

**3. [Rule 2 - Missing critical] Extended `lib/admin/types.ts` (not listed in files_modified)**
- Stale detection and the UI contract need `targetVersion`, `reporterCount`, the blind state and a detail type for review requests.

**4. [Rule 2 - Correctness] Added review-request read functions and `unblind_moderation_target`**
- D-15 and D-16 need an operator path to clear blinds and read the separate review tab. Without these, 07-05 would have no service to call.

## Known Stubs

None. There is no UI yet (07-05).

## Deferred / Follow-ups

- No command lifts a sanction early (`user_sanction_lift`). The UI-SPEC action list does not include one, so it was left out. If operators need early reversal, add it later.
- `totalCount` is 0 when a page past the end is requested, because the count comes back in the page rows.
- Blocking for 07-07: apply 0007 to a reachable DB and rerun `tests/admin/operations.database.test.ts`, then add two-session concurrency tests.
- ADMIN-01 to 04 are **not** marked complete. The user-facing surface (07-05, 07-06) and enforcement (07-03, 07-04) are still missing.

## Self-Check: PASSED

- FOUND: supabase/migrations/0007_admin_operations.sql, lib/admin/actions.ts, lib/admin/queries.ts, tests/admin/operations.database.test.ts, tests/admin/moderation.test.ts
- FOUND commits: 8a5d8b0, 7d90b4a
