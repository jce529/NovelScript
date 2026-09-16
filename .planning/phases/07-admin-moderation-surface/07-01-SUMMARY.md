---
phase: 07-admin-moderation-surface
plan: "01"
subsystem: admin-moderation
tags: [supabase, rls, column-privileges, audit, authorization, moderation]
requires:
  - 0005_commerce.sql (chapters_id_work_unique, chapter column SELECT grant)
  - lib/supabase/admin.ts, lib/supabase/server.ts
provides:
  - admin_users / admin_actions / user_sanctions / warning_acknowledgements / moderation_review_requests
  - works.admin_blinded*, chapters.admin_blinded*, profiles.sanction_kind + sanctioned_until
  - grant_admin / revoke_admin (privileged SQL only), apply_user_sanction (service_role), acknowledge_warning (authenticated)
  - lib/admin/auth.ts checkAdmin / requireAdmin / requireAdminPage / withAdminAction
  - lib/admin/types.ts moderation DTOs and AdminResult
affects:
  - 07-02 (operation RPCs build on apply_user_sanction and admin_actions)
  - 07-03 (write enforcement reads profiles sanction cache)
  - 07-04 (blinding reads admin_blinded flags)
tech-stack:
  added: []
  patterns:
    - revoke table-wide INSERT/UPDATE then grant explicit owner-editable columns
    - transaction-local GUC gate so a trigger allows cache writes only from the single derivation function
    - append-only tables enforced by BEFORE UPDATE/DELETE triggers
    - DI deps for session/service clients so the admin guard is unit-testable
key-files:
  created:
    - supabase/migrations/0006_admin_foundation.sql
    - lib/admin/types.ts
    - lib/admin/auth.ts
    - tests/admin/foundation.database.test.ts
    - tests/admin/authorization.test.ts
    - docs/admin-bootstrap.md
  modified: []
decisions:
  - "Sanction cache derivation: after the latest 'lift', permanent dominates, otherwise the furthest timed expiry wins; warnings never touch the cache and only 'lift' can reduce a sanction"
  - "apply_user_sanction requires a pre-existing matching admin_actions row (same actor, target user, action type), so a sanction cannot exist without its audit entry"
  - "grant_admin/revoke_admin are not executable by anon, authenticated or service_role; a leaked service key cannot mint administrators"
  - "Denied admin Server Actions return a generic not_found; page requests call notFound(); an authorization backend failure throws rather than 404"
  - "Review-request insert is allowed directly for the owning writer only when the exact target (work or chapter) is currently admin_blinded; status/resolution columns are not insertable"
metrics:
  duration: 25min
  completed: 2026-09-16
---

# Phase 7 Plan 01: Moderation Foundation and Admin Trust Boundary Summary

A separate `admin_users` membership table with immutable, audited grant and revoke functions that only privileged SQL can run. Append-only audit and sanction history, with a profile sanction cache that can only be written through one locked function. Blind flags on works and chapters that owners cannot write. A server-only `requireAdmin` guard that checks the session and active membership again on every call.

## What was built

**Task 01-01: `0006_admin_foundation.sql` + `lib/admin/types.ts` (commit cf4054f)**
- `admin_users` stores grant and revoke history, with a partial unique index that allows one active row per user. A trigger blocks DELETE and allows only a one-way revocation UPDATE.
- `admin_actions` is the append-only audit log. It records actor or manual-SQL label, action type, target work/chapter (composite FK) or user, report IDs, reason, public reason and an idempotency key (unique per actor).
- `user_sanctions` is append-only and is the source of truth. `permanent_suspension` is its own kind rather than a null timestamp. `warning_acknowledgements` has a composite FK that forces the row to point at a `warning` for the same user.
- `moderation_review_requests` has a composite FK that keeps the chapter inside its work. It has two partial unique indexes, one for open work-level requests (`chapter_id is null`) and one for open chapter-level requests.
- `works`/`chapters` get `admin_blinded`, `admin_blind_reason` and `admin_blinded_at`, with a shape CHECK. `is_published` is not touched.
- `profiles` gets `sanction_kind` (`none|suspension|permanent_suspension`) and `sanctioned_until`, with a shape CHECK. A trigger rejects any change unless the transaction-local `app.sanction_cache_writer` is set by `refresh_sanction_cache`.
- Privileges:
  - Table-wide INSERT/UPDATE/DELETE was revoked on profiles, works and chapters for anon and authenticated.
  - Owner-editable columns were granted back explicitly. For chapters: title, content, order, publish fields, price tier, folder, updated_at, deleted_at. For works: id, owner, title, synopsis, cover, genre. For profiles: role, pen_name, bio, pen_name_set_at, updated_at.
  - New public blind metadata was added to the chapter column SELECT grant. Chapter content stays protected.
- Operational tables: service_role can SELECT only, plus INSERT on `admin_actions`. Browser roles can see only their own sanctions (safe columns), acknowledgements and review requests.
- `reports` keeps its reporter policies and category CHECK. Only a `(status, created_at)` index was added.
- Optional seed: it runs only when `app.bootstrap_admin_user_id` is supplied in the same session, and does nothing otherwise.
- `types.ts` has constant tuples that mirror every CHECK, plus camelCase DTOs: `ReportGroupSummary`, `AdminReportDetail`, `ReviewRequestSummary`, `UserSanctionRecord`, `WarningNotice`, `EffectiveSanction`, `AdminActor`, `AdminResult`/`AdminErrorCode`.

**Task 01-02: `lib/admin/auth.ts` + runbook (commit 977f8e2)**
- `checkAdmin(deps)` follows this order: `auth.getUser()` on the session client → a non-deleted profile via the service-role client → an active `admin_users` row. It fails closed with `unauthenticated`, `not_admin` or `unavailable`. Nothing is cached.
- `requireAdmin` throws `AdminAccessDenied`. `requireAdminPage` calls `notFound()` for denied requests and throws a generic error when authorization is unavailable. `withAdminAction(op)` never runs `op` for a denied caller, and it passes only the actor derived from the session.
- `docs/admin-bootstrap.md` covers:
  - looking up the explicit UUID
  - transactional `grant_admin`/`revoke_admin` with audit checks
  - the opt-in seed
  - checking that `authenticated`/`service_role` cannot execute the grant functions

  There is no route for managing admins.

## Verification (actual results)

| Check | Result |
|---|---|
| `npx vitest run tests/admin/authorization.test.ts --passWithNoTests=false` | **17/17 passed** |
| `npx vitest run tests/admin/foundation.database.test.ts --passWithNoTests=false` against `SUPABASE_DB_URL` | **BLOCKED**: the Supabase pooler returns `tenant/user postgres.ymudwgsojikwqrhzkmav not found` (9 tests skipped because `beforeAll` failed to connect). The existing `tests/commerce/database.test.ts` fails the same way, so the environment is the cause, not this plan. |
| Same DB suite run on PGlite (Postgres 17 WASM, in the scratchpad, not added to the repo) with Supabase roles `anon`/`authenticated`/`service_role` (BYPASSRLS) and `auth.uid()` emulated, plus Supabase-style default privileges | **9/9 passed** |
| Mutation check on PGlite: removed the works privilege revoke and the cache-writer GUC | 3 tests failed as expected, then passed again after restoring |
| `npx tsc --noEmit` | clean |
| `npx eslint lib/admin tests/admin` | clean |

The PGlite run shows that the SQL is valid and that the privilege, trigger and RLS logic behaves as intended on real Postgres. It does **not** stand in for applying the migration to the real Supabase project. Plan 07-07 is still responsible for that.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Verified on a local PGlite database because the configured DB is unreachable**
- **Found during:** Task 01-01 verify
- **Issue:** `SUPABASE_DB_URL` fails with "tenant/user not found", so no real-role test could run.
- **Fix:** Ran the unchanged test file through a temporary vitest config in the session scratchpad. The config aliases `postgres` to a PGlite shim that sets up Supabase roles and `auth.uid()`. No project files or dependencies were changed.
- **Commit:** none (outside the repo)

**2. [Rule 2 - Security] Grant functions are also denied to `service_role`, and sanctions require a matching audit row**
- The plan asked for "no public bootstrap" and "attributable history". The functions go further on both points, so a leaked service key cannot create an admin and a sanction cannot be written without its audit entry.

**3. [Rule 2 - Security] Tightened owner privileges beyond the new columns**
- Revoking table-wide privileges also takes away owner writes to `profiles.deleted_at` (un-deleting an account), `chapters.view_count`, and hard DELETE on works/chapters. No app path uses these: soft delete goes through the admin client, and view counts go through a definer RPC. Every column the app actually edits was granted back, and the test checks this.

None of these required an architectural change.

## Known Stubs

None. The DTO types in `lib/admin/types.ts` are contracts for plans 07-02 to 07-06. No UI uses them yet, and that is intentional.

## Deferred / Follow-ups

- Apply `0006_admin_foundation.sql` to a reachable Supabase target and rerun `tests/admin/foundation.database.test.ts` without skips (blocking for 07-07). First check which project and migration history the target has, because the runner executes raw SQL.
- `acknowledge_warning` is created here. Plan 07-03 decides how it interacts with suspended write enforcement.
- The `graphify update .` output was regenerated and left uncommitted, since graphify-out is expected to be dirty.

## Self-Check: PASSED

- FOUND: supabase/migrations/0006_admin_foundation.sql, lib/admin/types.ts, lib/admin/auth.ts, tests/admin/foundation.database.test.ts, tests/admin/authorization.test.ts, docs/admin-bootstrap.md
- FOUND commits: cf4054f, 977f8e2
