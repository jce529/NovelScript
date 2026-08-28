---
phase: 01-foundation-wallet-infrastructure
plan: 04
subsystem: auth
tags: [supabase, oauth, kakao, google, d-02]

# Dependency graph
requires:
  - phase: 01-02
    provides: profiles/wallets schema + auto-provisioning trigger
  - phase: 01-03
    provides: lib/supabase/{client,server}.ts client contracts
provides:
  - lib/auth/email-guard.ts — needsEmailCompletion(user), D-02 pure logic
  - app/login/page.tsx — Google + Kakao sign-in buttons
  - app/auth/callback/route.ts — OAuth code exchange + D-02 email-guard branch
  - app/auth/auth-code-error/page.tsx — failed/cancelled consent error page
  - app/auth/complete-email/{page.tsx,actions.ts} — D-02 fallback for providers that don't return an email
affects: [01-05, phase-02]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Kakao's Supabase provider requests a fixed scope set (account_email, profile_image, profile_nickname) — ALL THREE consent items must be enabled in Kakao Developers console (동의항목), not just account_email, or the entire OAuth request is rejected with KOE205 before the consent screen ever renders. This is stricter than 01-RESEARCH.md's Pitfall 1 anticipated (which only flagged account_email/Biz-App)."

key-files:
  created: [lib/auth/email-guard.ts, tests/auth/email-guard.test.ts, app/login/page.tsx, app/auth/callback/route.ts, app/auth/auth-code-error/page.tsx, app/auth/complete-email/page.tsx, app/auth/complete-email/actions.ts]
  modified: []

key-decisions:
  - "No deviations from plan text for Tasks 1-2 — code matches 01-04-PLAN.md verbatim."

patterns-established:
  - "Any OAuth provider integration must cross-check ALL requested scopes (not just the one D-02/business logic cares about) against that provider's console-side consent-item configuration before assuming a code bug."

requirements-completed: [AUTH-01]

# Metrics
duration: ~1min agy execution (Tasks 1-2, committed 2026-08-26) + real-browser verification completed 2026-08-28 after a 2-day gap where Task 3's blocking checkpoint was left unresolved
completed: 2026-08-28
---

# Phase 1: Foundation & Wallet Infrastructure — Plan 01-04 Summary

**Login page, OAuth callback, and D-02 email-guard fallback for Google + Kakao — verified end-to-end in a real browser**

## Performance

- **Duration:** Tasks 1-2 (code) executed 2026-08-26; Task 3 (blocking manual browser checkpoint) sat unresolved until 2026-08-28, when it was run and passed.
- **Tasks:** 3 (email-guard logic + test, login/callback/fallback pages, manual OAuth round-trip)
- **Files created:** 7

## Accomplishments
- `needsEmailCompletion()` covers all 5 required cases (null/undefined/empty/whitespace/valid), 5 passing Vitest assertions
- `/login`, `/auth/callback`, `/auth/auth-code-error`, `/auth/complete-email` all implemented exactly per plan
- `npx vitest run` — 13/13 tests passing across the project; `npx tsc --noEmit` clean
- **Manual checkpoint (Task 3) verified live:**
  - Google OAuth round-trip: reached authenticated state; confirmed via direct DB query that `auth.users` (email `changeun34@gmail.com`, non-null), `profiles` (role: reader), and `wallets` (balance: 0) rows were all auto-provisioned correctly
  - Kakao OAuth round-trip: reached authenticated state with email supplied directly (`jce529@kakao.com`, no Biz App approval needed for this app's current tier); `profiles`/`wallets` rows auto-provisioned identically
  - Cancelled/errored code exchange: hitting `/auth/callback` with no `code` param correctly redirects to `/auth/auth-code-error` (verified via browser automation) — no crash, no redirect loop

## Task Commits
1. **Task 1: D-02 email-guard pure logic + test** — `13ef61d` (feat)
2. **Task 2: Login page, callback, error page, email-completion fallback** — `dac25c3` (feat)
3. **Task 3: Manual OAuth verification** — no code change; verified 2026-08-28

## Issues Encountered
**Kakao KOE205 ("잘못된 요청") blocked the first verification attempt.** Root cause: Supabase's Kakao provider requests `scope=account_email profile_image profile_nickname` as a fixed set, but only `account_email` had been enabled as a consent item in Kakao Developers console — `profile_image` and `profile_nickname` were still "사용 안 함". Kakao rejects the entire authorize request (before the consent screen renders) if any requested scope isn't configured, regardless of whether the app actually uses that data. Fixed by enabling all three consent items in Kakao Developers console → 카카오 로그인 → 동의항목. This is a console configuration issue, not a code defect — no files changed. Recorded under tech-stack patterns above so Phase 5+ (or any future OAuth provider work) checks this first.

## User Setup Required
- Kakao Developers console: `account_email`, `profile_nickname`, `profile_image` consent items must all be enabled (동의항목) for the Kakao login button to work at all — this is now done for the dev app, but must be replicated for any separate prod Kakao app created later.

## Next Phase Readiness
- Phase 1 Wave 2 (01-04) is complete. 01-05 (writer upgrade + account settings, AUTH-02) is the only remaining Phase 1 plan.
- AUTH-01 is now fully satisfied and verified end-to-end for both providers.

---
*Phase: 01-foundation-wallet-infrastructure*
*Completed: 2026-08-28*
