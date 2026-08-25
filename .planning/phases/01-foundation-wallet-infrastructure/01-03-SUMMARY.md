---
phase: 01-foundation-wallet-infrastructure
plan: 03
subsystem: auth
tags: [supabase, ssr, proxy, nextjs16, session]

# Dependency graph
requires:
  - phase: 01-01
    provides: Live Supabase project, env vars in .env.local
provides:
  - lib/supabase/client.ts — browser Supabase client (createClient, via createBrowserClient)
  - lib/supabase/server.ts — Server Component/Action Supabase client (async createClient, cookie-backed)
  - lib/supabase/admin.ts — service-role client (createAdminClient), server-only guarded
  - proxy.ts — Next.js 16 session-refresh proxy (NOT middleware.ts), calls supabase.auth.getClaims() per request
  - tests/auth/session-refresh.test.ts — matcher + getClaims-call proof
affects: [01-04, 01-05, phase-02, phase-03, phase-04, phase-05, phase-06, phase-07]

# Tech tracking
tech-stack:
  added: [server-only]
  patterns:
    - "Three-client contract for all Supabase access in this project: lib/supabase/client.ts (browser), lib/supabase/server.ts (Server Components/Actions), lib/supabase/admin.ts (service-role, server-only guarded) — every future phase must import from these, never construct a Supabase client ad hoc"
    - "proxy.ts, not middleware.ts — Next.js 16 in this repo silently ignores middleware.ts; the session-refresh file MUST be named proxy.ts at the repo root, exporting a function named `proxy` (not `middleware`, not default export)"
    - "Testing proxy.ts matcher behavior: `unstable_doesMiddlewareMatch` from `next/experimental/testing/server` — note this helper's name was NOT renamed alongside middleware.ts→proxy.ts in the installed Next.js version"

key-files:
  created: [lib/supabase/client.ts, lib/supabase/server.ts, lib/supabase/admin.ts, proxy.ts, tests/auth/session-refresh.test.ts]
  modified: [package.json, package-lock.json]

key-decisions:
  - "No deviations from plan text — all three client files and proxy.ts implemented exactly as specified in 01-03-PLAN.md, verified independently (tsc clean, full test suite green)."

patterns-established:
  - "Any future route needing auth-gating (writer-role checks, admin checks) should do it in a layout-level server check using lib/supabase/server.ts's createClient, NOT in proxy.ts itself — proxy.ts's only job is session refresh, per RESEARCH.md's Pitfall 2 guidance carried into this plan."

requirements-completed: [AUTH-03]

# Metrics
duration: ~2min (agy execution) + verification
completed: 2026-08-26
---

# Phase 1: Foundation & Wallet Infrastructure — Plan 01-03 Summary

**Three Supabase client wrappers (browser/server/admin) and Next.js 16's `proxy.ts` session-refresh file, replacing the silently-ignored `middleware.ts` convention**

## Performance

- **Duration:** ~2 min agy execution (103s), independently re-verified
- **Tasks:** 2 (client contracts, proxy.ts + test)
- **Files modified:** 5 created + package.json/package-lock.json

## Accomplishments
- `lib/supabase/{client,server,admin}.ts` — the one correct place every later plan/phase gets an authenticated Supabase client (browser, server, or service-role)
- `proxy.ts` at the repo root (verified: `middleware.ts` does NOT exist) — refreshes the Supabase session via `auth.getClaims()` on every non-static request, satisfying AUTH-03
- `npx tsc --noEmit` clean; full project test suite (3 files, 8 tests across Plans 01-01/01-02/01-03) passes green

## Task Commits

1. **Task 1: Write the three Supabase client contracts** — `992acc2` (feat)
2. **Task 2: proxy.ts session refresh + automated test** — `7e4947f` (feat)

## Files Created/Modified
- `lib/supabase/client.ts` — `createClient()` via `createBrowserClient`
- `lib/supabase/server.ts` — async `createClient()` via `createServerClient`, cookie-backed
- `lib/supabase/admin.ts` — `createAdminClient()`, `import 'server-only'` guard
- `proxy.ts` — `proxy(request)` + `config.matcher`
- `tests/auth/session-refresh.test.ts` — matcher exclusion/inclusion + `getClaims()` call-count proof
- `package.json`/`package-lock.json` — added `server-only`

## Decisions Made
None beyond following the plan exactly — see Deviations below (none occurred).

## Deviations from Plan
None — plan executed exactly as written. Both `tsc --noEmit` and the full test suite passed on the first implementation attempt with no corrections needed.

## Issues Encountered
None.

## User Setup Required
None — builds entirely on Plan 01-01's already-live Supabase project and env vars.

## Next Phase Readiness
- Wave 1 of Phase 1 (01-01, 01-02, 01-03) is now fully complete. Wave 2 (01-04 login UI, 01-05 writer upgrade/account settings) can proceed — both depend on this plan's Supabase client contracts and Plan 01-02's profiles/wallets schema.
- Phase 2 (Studio Core) explicitly assumes `lib/supabase/*` and `proxy.ts` exist per its own Plan 02-01 — this dependency is now satisfied.

---
*Phase: 01-foundation-wallet-infrastructure*
*Completed: 2026-08-26*
