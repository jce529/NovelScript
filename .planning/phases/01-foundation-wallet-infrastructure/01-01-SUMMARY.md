---
phase: 01-foundation-wallet-infrastructure
plan: 01
subsystem: infra
tags: [supabase, oauth, google, kakao, vitest, postgres]

# Dependency graph
requires: []
provides:
  - Live Supabase project (Postgres + Auth) backing the rest of Phase 1
  - Google and Kakao enabled as Supabase Auth sign-in providers (Kakao Biz App conversion requested)
  - Session-pooler `SUPABASE_DB_URL` (IPv4-compatible; direct `db.*.supabase.co` connection is IPv6-only and unreachable from this dev machine)
  - Vitest installed and configured, `npx vitest run` passing with zero test files
  - `.env.example` documenting the 4 required env vars; `.env.local` populated with real, verified credentials (gitignored)
affects: [01-02, 01-03, 01-04, 01-05, phase-02]

# Tech tracking
tech-stack:
  added: ["@supabase/supabase-js@2.112.4", "@supabase/ssr@0.12.5", "zod@4.4.3", "drizzle-orm@0.45.2", "postgres@3.4.9", "pg@8.23.0", "vitest@4.1.11", "@vitejs/plugin-react@6.1.0"]
  patterns:
    - "Execution model: actual code implementation delegated to Antigravity CLI (`agy --dangerously-skip-permissions=true --output-format json --print \"<task>\"`) invoked directly by the orchestrating Claude session, not the standard gsd-executor subagent, per PROJECT.md decision"
    - "agy CLI invocation quirk: use `--dangerously-skip-permissions=true` (explicit `=true`) and pass the prompt as the direct value to `--print` at the end of the arg list — `--print` (bare) followed by a separate `--prompt \"...\"` value was silently denied permission checks even with the skip flag present"

key-files:
  created: [vitest.config.ts, .env.example, .env.local]
  modified: [package.json, package-lock.json]

key-decisions:
  - "Used Supabase Session Pooler connection string (aws-0-ap-northeast-2.pooler.supabase.com:5432, user postgres.<project-ref>) instead of Direct Connection (db.<project-ref>.supabase.co:5432) — the direct-connection host resolves to IPv6 only, and this dev machine has no outbound IPv6 route. Session pooler resolves to IPv4 and is still session-mode (satisfies 01-RESEARCH.md Pitfall 3's port-5432/no-prepared-statement-breakage requirement)."
  - "Secrets handling: SUPABASE_SERVICE_ROLE_KEY and SUPABASE_DB_URL were never pasted into chat — user edited .env.local directly in their own editor; verification was done by sourcing the file in local shell commands that only ever printed non-secret derived values (host/port/username/HTTP status codes), never the secrets themselves."
  - "vitest.config.ts: added `passWithNoTests: true` (not in original plan text) so `npx vitest run` exits 0 with zero test files, per Vitest 4.x requiring this explicitly in some configs."
  - "@vitejs/plugin-react installed with --legacy-peer-deps due to an upstream Babel peer-dependency conflict with shadcn (installed in a parallel Phase 2 UI-SPEC session) — noted as a real, if minor, deviation."

patterns-established:
  - "Env var verification without secret exposure: curl Supabase REST/Auth endpoints and check HTTP status/response shape (not the key value) to confirm ANON_KEY/SERVICE_ROLE_KEY validity; use a throwaway `pg` Client script (npm install pg --no-save) to test SUPABASE_DB_URL, printing only host/user/db, never the password."

requirements-completed: [AUTH-01]

# Metrics
duration: ~90min (spanned multiple user round-trips for external dashboard setup + DB password reset propagation delay)
completed: 2026-08-26
---

# Phase 1: Foundation & Wallet Infrastructure — Plan 01-01 Summary

**Live Supabase project with Google+Kakao Auth providers enabled, session-pooler Postgres connection, and Vitest test runner installed and passing**

## Performance

- **Duration:** ~90 min (mostly external dashboard setup + one DB-password-reset propagation delay, not active work time)
- **Tasks:** 2 (Task 1: checkpoint/human-action, Task 2: automated via agy)
- **Files modified:** 4 (package.json, package-lock.json, vitest.config.ts, .env.example) + .env.local created (gitignored, not committed)

## Accomplishments
- Hosted Supabase project provisioned (Postgres 17.6), reachable via both REST/Auth API and direct Postgres connection
- Google and Kakao registered and confirmed Enabled as Supabase Auth providers (verified via `/auth/v1/settings` showing `google:true, kakao:true`); Kakao Biz App conversion submitted (required for D-02's mandatory-email-per-account rule)
- Vitest 4.1.11 installed and configured; `npx vitest run` exits 0 with zero test files
- Full dependency set for Phase 1 (`@supabase/supabase-js`, `@supabase/ssr`, `zod`, `drizzle-orm`, `postgres`, `pg`) installed at researched versions

## Task Commits

1. **Task 1: Create Supabase project + register Google/Kakao OAuth apps** — no commit (external dashboard setup only, no repo files touched; verified live via REST API calls instead)
2. **Task 2: Install dependencies, configure Vitest, write env files** — `dbcdd8f` (chore, executed via agy)

## Files Created/Modified
- `package.json` / `package-lock.json` — added Supabase/Zod/Drizzle/Postgres/Vitest dependencies, `test` script
- `vitest.config.ts` — node environment, `tests/**/*.test.ts` include pattern, `passWithNoTests: true`
- `.env.example` — documents the 4 required env vars with empty values
- `.env.local` — real, verified credentials (gitignored, not committed; not readable from this summary by design)

## Decisions Made
- Session pooler over direct connection for `SUPABASE_DB_URL` (IPv6-only direct-connection host unreachable from this dev machine) — see `key-decisions` in frontmatter.
- Secrets stayed out of the chat transcript end-to-end (except one incidental IDE-diff-notification exposure disclosed to the user in-session); verification scripts printed only non-secret derived values.

## Deviations from Plan

### Auto-fixed Issues

**1. [Blocking] Direct-connection `SUPABASE_DB_URL` unreachable — required switching to Session Pooler**
- **Found during:** Task 2 verification (post-Task-1 connectivity test)
- **Issue:** Plan's Task 1 instructions pointed at Supabase's "Direct connection" string; that host (`db.<ref>.supabase.co`) resolves to IPv6 only, and this dev machine has no outbound IPv6 route, so `apply-migration`/tests in later plans would have failed to connect entirely.
- **Fix:** User re-copied the "Session pooler" connection string (`aws-0-ap-northeast-2.pooler.supabase.com:5432`, still session-mode per 01-RESEARCH.md Pitfall 3) and reset the DB password (original one was not correctly known/transcribed).
- **Verification:** Live `pg` client connection succeeded (`select version()` returned PostgreSQL 17.6).
- **Committed in:** N/A (env-only change, `.env.local` is gitignored)

**2. [Minor] `--legacy-peer-deps` needed for `@vitejs/plugin-react`**
- **Found during:** Task 2 (agy execution)
- **Issue:** Upstream Babel peer-dependency conflict with `shadcn`/`@base-ui/react` (installed in a concurrent Phase 2 UI-SPEC session) blocked a clean `npm install -D vitest @vitejs/plugin-react`.
- **Fix:** agy used `--legacy-peer-deps` for that specific install step.
- **Files modified:** package.json, package-lock.json
- **Verification:** `npx vitest run` exits 0
- **Committed in:** `dbcdd8f`

---

**Total deviations:** 2 auto-fixed (1 blocking connectivity fix, 1 minor peer-dep flag)
**Impact on plan:** Both necessary corrections; no scope creep. The direct-vs-pooler connection issue is worth flagging forward — Plan 01-02's migration script and concurrency tests must use the same session-pooler `SUPABASE_DB_URL`.

## Issues Encountered
- DB password authentication failed twice before succeeding — first attempt still had the unreachable direct-connection host, second attempt (after switching to pooler) failed authentication immediately after a password reset, third attempt (same credentials, ~2 min later) succeeded — consistent with Supabase's Supavisor pooler taking a short time to pick up a freshly reset password.
- agy CLI's `--dangerously-skip-permissions` flag did not take effect when passed bare (`--dangerously-skip-permissions`) combined with a separate `--prompt "<text>"` argument — every tool call was auto-denied with "user denied permission to run command" despite the flag being present. Resolved by using `--dangerously-skip-permissions=true` and passing the prompt directly as `--print`'s value instead of via the separate `--prompt` alias. Root cause not fully isolated; documented as a pattern to reuse in `tech-stack.patterns` above for all future agy invocations in this project.

## User Setup Required

External services were configured manually per Task 1 (no USER-SETUP.md generated — this was the Wave-0 checkpoint itself, not a downstream requirement):
- Supabase project created, Google + Kakao providers enabled
- Kakao Biz App conversion submitted (approval pending — does not block Phase 1 progress, but D-02's "every account has an email" invariant depends on it eventually completing)

## Next Phase Readiness
- Plan 01-02 (wallet/profile schema + concurrency proof) and 01-03 (Supabase clients + proxy.ts) can now proceed — both depend on this plan's live Supabase project and verified `SUPABASE_DB_URL`.
- Flag forward: any later plan's migration/connection tooling must use the session-pooler connection string, not a freshly-copied "Direct connection" string, or it will fail to connect on this machine (and likely on any IPv6-less network).

---
*Phase: 01-foundation-wallet-infrastructure*
*Completed: 2026-08-26*
