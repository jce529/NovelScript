---
phase: 01-foundation-wallet-infrastructure
plan: 05
subsystem: auth
tags: [supabase, postgres, unique-index, soft-delete, server-actions]

# Dependency graph
requires:
  - phase: 01-02
    provides: profiles/wallets/ledger_entries schema, profiles_pen_name_unique index, tests/helpers/db.ts
  - phase: 01-03
    provides: lib/supabase/server.ts (createClient), lib/supabase/admin.ts (createAdminClient)
provides:
  - lib/auth/writer.ts — upgradeToWriter(supabase, { userId, penName, bio }), D-04/D-05
  - lib/auth/account.ts — softDeleteAccount(admin, userId) + isAccountActive(profile), D-08
  - app/write/start/{page.tsx,actions.ts} — pen-name/bio form, first-conversion-only
  - app/account/{page.tsx,actions.ts} — profile display + working delete flow
affects: [phase-02, any future phase adding a DAL/session gate that must check isAccountActive]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pen-name uniqueness is enforced entirely by the DB's profiles_pen_name_unique case-insensitive index, not an app-level pre-check — upgradeToWriter only translates Postgres error 23505 into a friendly message. This is the pattern to follow for any future uniqueness constraint under concurrent write risk."
    - "Soft-delete writes (deleted_at) always go through the admin/service-role client, not the user's own RLS-scoped client, so deletion isn't accidentally gate-able by a self-row RLS policy."
    - "isAccountActive(profile) is the gate any future DAL/route that loads a profile must call — currently wired into app/account/page.tsx; not yet wired into a global proxy.ts/middleware since no general protected-route layer exists yet in Phase 1."

key-files:
  created: [lib/auth/writer.ts, lib/auth/account.ts, tests/auth/writer-upgrade.test.ts, tests/auth/account-deletion.test.ts, app/write/start/page.tsx, app/write/start/actions.ts, app/account/page.tsx, app/account/actions.ts]
  modified: []

key-decisions:
  - "GoTrueAdminApi.signOut(jwt, scope?) in the installed @supabase/auth-js version takes a session JWT, not a user id — there is no user-id-scoped global sign-out available. softDeleteAccount skips explicit JWT revocation and relies on isAccountActive() as the authoritative gate, per the plan's own documented fallback."
  - "Added an isAccountActive check to app/account/page.tsx (Rule 2 — missing authorization/correctness) beyond the plan's literal code, since the plan's must_haves.truths explicitly requires a soft-deleted account to be treated as inactive on its next request, and account/page.tsx was already fetching the profile row needed to check this."

requirements-completed: [AUTH-02]

# Metrics
duration: ~8min
completed: 2026-08-28
---

# Phase 1: Foundation & Wallet Infrastructure — Plan 01-05 Summary

**Writer-upgrade (dual-role, DB-constraint-backed pen-name uniqueness) and account soft-delete, both proven with real concurrency/integrity tests against the live schema**

## Performance

- **Duration:** ~8 min
- **Tasks:** 2 (business logic + tests, then page/action wiring)
- **Files created:** 8

## Accomplishments
- `upgradeToWriter` flips a `role='reader'` account to `'writer'` in place — no separate signup flow, satisfying AUTH-02
- Pen-name uniqueness proven race-condition-proof under real concurrency: a `Promise.all` test submits the same pen name in two different cases from two different users and asserts exactly one succeeds (relies on `profiles_pen_name_unique`, Postgres error `23505`, not an app-level pre-check)
- `softDeleteAccount` proven to set `deleted_at`, null `pen_name_bio`, and leave `wallets.balance`/`ledger_entries` completely untouched (verified against a wallet with a real ledger entry, not just an empty wallet)
- `isAccountActive` unit-tested and wired into `/account` so a soft-deleted profile is signed out and redirected to `/login` on its next page load, even if its JWT hasn't expired
- `/write/start` (pen name 2-20 chars required, bio optional) and `/account` (profile display + "계정 탈퇴하기" delete button) both implemented and type-clean
- `npx vitest run` — 21/21 tests passing project-wide (8 new); `npx tsc --noEmit` clean

## Task Commits
1. **Task 1: Writer-upgrade + account-deletion business logic and tests** — `c61055b` (feat)
2. **Task 2: Wire the writer-upgrade form and account settings page** — `e478cbb` (feat)

## Files Created/Modified
- `lib/auth/writer.ts` - `upgradeToWriter`: first-conversion-only role flip, translates DB uniqueness violation (23505) to a friendly error
- `lib/auth/account.ts` - `softDeleteAccount`: sets `deleted_at`, nulls `pen_name_bio`, never touches wallet/ledger; `isAccountActive`: pure gate function
- `tests/auth/writer-upgrade.test.ts` - covers first conversion, second-attempt rejection, pen-name length validation, and the concurrent same-pen-name-different-case race
- `tests/auth/account-deletion.test.ts` - covers full soft-delete (with a pre-existing wallet balance + ledger entry to prove they survive), idempotent re-delete, and `isAccountActive` unit cases
- `app/write/start/page.tsx`, `app/write/start/actions.ts` - pen name + bio form, server action calling `upgradeToWriter`
- `app/account/page.tsx`, `app/account/actions.ts` - profile display, delete entry point calling `softDeleteAccount` via the admin client

## Decisions Made
- **JWT revocation on delete:** the installed `@supabase/auth-js` version's `GoTrueAdminApi.signOut(jwt, scope?)` requires a session JWT, not a user id — confirmed by reading `node_modules/@supabase/auth-js/dist/main/GoTrueAdminApi.d.ts` directly, per the plan's own instruction to check this before calling it. No user-id-scoped global sign-out exists in this SDK version, so `softDeleteAccount` does not attempt JWT revocation; `isAccountActive()` is the authoritative gate instead, exactly as the plan anticipated as an acceptable v1 fallback.
- **isAccountActive wiring scope:** wired into `app/account/page.tsx` only (not into a global `proxy.ts`/middleware), since no general protected-route/DAL layer exists yet in Phase 1 and the plan's `files_modified` didn't include `proxy.ts`. This satisfies the plan's stated truth for the one page that already loads the profile row; broader enforcement is deferred to whichever future phase builds a general DAL/session-check layer, consistent with the code comment left in `lib/auth/account.ts`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Wired `isAccountActive` into `app/account/page.tsx`**
- **Found during:** Task 2
- **Issue:** The plan's literal code for `app/account/page.tsx` fetched `role, pen_name, pen_name_bio` but never checked `deleted_at`/`isAccountActive`, even though this plan's own `must_haves.truths` requires "the account is treated as inactive on its next request even if its access token has not yet expired." Without this check, a soft-deleted account whose JWT hadn't expired would still see a normal `/account` page.
- **Fix:** Added `deleted_at` to the existing `profiles` select and an `isAccountActive` check that signs out and redirects to `/login` if the profile is inactive or missing.
- **Files modified:** `app/account/page.tsx`
- **Verification:** `npx tsc --noEmit` clean; logic mirrors the already-unit-tested `isAccountActive` function from Task 1.
- **Committed in:** `e478cbb` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical functionality)
**Impact on plan:** Closes a gap between the plan's stated D-08 truth and its literal page code. No scope creep — no new architecture, just an additional field in an already-fetched query plus a redirect in a file the plan already modifies.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 1 (foundation-wallet-infrastructure) is now fully complete: all 5 plans executed and verified. AUTH-01, AUTH-02, and the wallet/ledger concurrency proof (from 01-02) are all satisfied.
- `isAccountActive` is exported and ready for reuse by whichever future phase (likely Phase 2+) introduces a general protected-route or DAL layer — it is currently only checked in `/account`, not globally.
- Pen name editing (D-06, deferred) and any wallet/ledger dev UI remain out of scope per the phase context, unchanged.

---
*Phase: 01-foundation-wallet-infrastructure*
*Completed: 2026-08-28*

## Self-Check: PASSED

All 8 created files verified present on disk; both task commits (`c61055b`, `e478cbb`) verified present in git log.
