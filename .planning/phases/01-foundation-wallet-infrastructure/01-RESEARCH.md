# Phase 1: Foundation & Wallet Infrastructure - Research

**Researched:** 2026-08-25
**Domain:** Social-login auth (Supabase Auth, Google + Kakao OAuth) on Next.js 16 / React 19, and a concurrency-proven Postgres token ledger
**Confidence:** MEDIUM-HIGH (auth stack HIGH via official docs/registry; ledger concurrency patterns MEDIUM — verified via multiple independent sources but no single canonical spec; Kakao Biz App requirement MEDIUM — community-sourced, no official SLA)

## Summary

Phase 1 is greenfield: the repo is a bare `create-next-app` scaffold (Next.js 16.3.2 / React 19.2.8 / Tailwind 4) with zero auth, DB, or state packages installed, and no Supabase project has been created yet (no `.env*`, no `supabase/` dir). Two independent build-outs are required: (1) social-login auth backing one dual-role account with persistent sessions, and (2) a Postgres-backed token ledger proven correct under concurrent load using fake credits — before any AI spend or real payment code exists.

For auth, **Supabase Auth** (via `@supabase/ssr` + `@supabase/supabase-js`) is the recommended path over NextAuth/Auth.js, primarily because Phase 1's `docs/4` canonical reference already commits the project to Supabase as BaaS (DB + Auth + pooling), and using Supabase Auth avoids running two separate user-identity systems (Supabase Auth's `auth.users` vs. Auth.js's own adapter tables) that the wallet ledger and RLS policies would otherwise need to bridge. Both Google and Kakao are natively supported as Supabase social providers. The critical gotcha: Kakao's `account_email` consent item — required to satisfy D-02 ("never create an account without an email on file") — is only available once the Kakao app is converted to a "Biz App," a step that does NOT require business registration (개인 사업자등록번호 불요, per community reports) but does require identity verification and Kakao Business terms acceptance, with unknown review turnaround. This should be started immediately, in parallel with Phase 1 build-out, not treated as an implementation detail to solve later.

For the wallet ledger, the concurrency-safety literature converges on **derived balance from an append-only, double-entry ledger table**, protected by a Postgres function that does `SELECT ... FOR UPDATE` on the wallet row (or `SERIALIZABLE` isolation with retry) inside a single transaction, plus a `CHECK (balance >= 0)` constraint and idempotency keys on every mutating call. The phase goal explicitly requires this to be "proven correct under concurrent load," which is interpreted as: an automated test suite that fires N parallel debit/credit operations against the same wallet (via `pg`/`postgres.js` + Vitest, not mocks) and asserts the final materialized balance matches the sum of ledger entries, with zero lost updates and zero negative balances.

**Primary recommendation:** Use Supabase Auth (Google + Kakao providers) with `@supabase/ssr`, a `profiles` table (soft-delete via `deleted_at`, decoupled from hard-deleting `auth.users`), and a `wallets` + `ledger_entries` schema where balance is written only inside a `FOR UPDATE`-guarded Postgres function, verified by a real-Postgres Vitest concurrency suite (no local Docker/Supabase CLI is available on this machine — use a hosted Supabase project for both dev and the concurrency test target).

## User Constraints

### Locked Decisions (from CONTEXT.md)
- **D-01:** Google implemented first; Kakao added as a fast-follow within Phase 1 itself (not deferred). Auth architecture must be provider-agnostic from the start.
- **D-02:** Email is required from the social provider. If a provider (commonly Kakao) doesn't supply an email, block signup or require additional input to obtain one — never create an account without an email on file.
- **D-03:** No email/password signup — social login only (Google + Kakao).
- **D-04:** Clicking "글쓰기 시작하기" prompts for pen name (필명, required) and short bio (소개글, optional), then immediately flips the account to writer role on submit. Only on first conversion.
- **D-05:** Pen name must be unique platform-wide — requires a uniqueness check at submission.
- **D-06:** Pen name is not editable in Phase 1 (deferred to later settings/마이페이지 phase).
- **D-07:** Phase 1 includes a simple account settings page: profile/nickname display, pen name display (for writers), account deletion entry point.
- **D-08:** Account deletion (탈퇴) is actually implemented in Phase 1, not stubbed. Prefer soft delete (`deleted_at`), consistent with docs/4 §4.4.

### Claude's Discretion (research/planning decides)
- **Wallet ledger proof surface:** Automated concurrency test suite is mandatory. Whether to also expose a dev/admin UI to grant fake credits and view balances is Claude's call — **recommendation: yes, build a minimal `/admin/wallet` or `/dev/wallet` page gated behind a role check**, because Phase 1 has no payment system yet and manual QA of the writer/reader flows needs a way to top up a test account's balance without direct DB access. Keep it minimal (grant amount + reason, view balance + ledger) — do not build a general admin panel (that's Phase 7 scope).
- **Session/auth implementation details:** Resolved below — Supabase Auth over NextAuth, see Standard Stack and Architecture Patterns.
- **Account deletion data handling specifics:** Resolved below — see "Account Deletion Cascade" pattern.

### Deferred Ideas (OUT OF SCOPE for this phase)
- Pen name editing UI — later phase (설정/마이페이지).
- Wallet ledger dev/admin UI — not deferred outright; addressed above as Claude's discretion (recommended: build minimal version).
- Cash-out (환전) logic — explicitly out of scope for v1 per PROJECT.md; do not build in Phase 1.
- BYOK, asset store — out of scope entirely, not phase-1-adjacent.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | User can sign up/log in via social login (Kakao 또는 Google 중 1개 이상) | Standard Stack (Supabase Auth providers), Architecture Patterns (OAuth flow), Common Pitfalls (Kakao email/Biz App) |
| AUTH-02 | One account serves both reader and writer roles — no separate signup flow; "글쓰기 시작하기" upgrades same account | Architecture Patterns (single `profiles` table with `role` field, pen-name uniqueness pattern) |
| AUTH-03 | User session persists across visits/browser refresh | Architecture Patterns (Supabase SSR cookie-based session, `proxy.ts` refresh pattern) |

## Standard Stack

### Core
| Library | Version (verified) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | 2.112.4 (npm, current) | Supabase client (auth, DB, storage) | Official SDK; required for both browser and admin operations |
| `@supabase/ssr` | 0.12.5 (npm, published ~1 day before research date) | Cookie-based SSR session handling for Next.js App Router | Official replacement for the deprecated `auth-helpers-nextjs` package; only supported way to do SSR auth with Supabase in App Router |
| `next` | 16.3.2 (already installed) | Framework | Locked by existing scaffold |
| `zod` | 4.4.3 (npm, current) | Server Action / form input validation | De facto standard paired with Next.js Server Actions per official Next.js auth guide |
| `pg` or `postgres` (postgres.js) | `pg` 8.23.0 / `postgres` 3.4.9 (npm, current) | Direct Postgres client for the ledger's stress-test suite and any raw SQL needs | Needed for the concurrency test suite to open genuinely parallel raw connections against Postgres — an ORM query builder alone makes it harder to control transaction boundaries precisely |
| `vitest` | 4.1.11 (npm, current) | Test runner | Standard 2026 Next.js testing choice (official Next.js docs recommend it); 10-20x faster startup than Jest, native ESM |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `drizzle-orm` | 0.45.2 (npm, current) | Typed query builder/schema-as-code for `profiles`, `wallets`, `ledger_entries` | Use for app-level CRUD (profile reads, wallet balance reads); do NOT rely on it for the concurrency-critical debit/credit path — that path should call a Postgres function (`rpc`) directly so the `FOR UPDATE` + transaction boundary is guaranteed server-side regardless of pooling mode |
| `drizzle-kit` | matches drizzle-orm minor | Migration generation | Schema migrations checked into `supabase/migrations` or `drizzle/` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Supabase Auth | NextAuth.js / Auth.js v5 (`next-auth@beta`, currently 5.0.0-beta.32) | Auth.js v5 beta.32's `peerDependencies` now explicitly allow `next: "^16.0.0"` and `react: "^19.0.0"` (this was NOT true a few betas ago — GitHub issue #13302 shows earlier betas rejected Next 16 via npm peer-dep errors, requiring `--legacy-peer-deps`). Auth.js also ships a **built-in Kakao provider** (contrary to the initial assumption in CONTEXT.md that Kakao "is not a default NextAuth provider" — this is out of date; Auth.js has shipped `providers/kakao` for years). However, Auth.js stores its own session/user identity separately from the app DB (needs a DB adapter, e.g., Drizzle adapter, to persist users in Postgres), which duplicates identity management the project would otherwise get for free from Supabase's `auth.users` + RLS. Given `docs/4` already commits to Supabase as BaaS, Supabase Auth is the lower-friction choice for this project specifically — Auth.js would be the right call only if Supabase were dropped entirely. |
| Postgres function w/ `FOR UPDATE` | `SERIALIZABLE` isolation + app-level retry | `SERIALIZABLE` is provably safe with zero explicit locking code, but requires retry-on-`40001` logic in every code path that touches the wallet, and read-heavy paths (balance display) still block on the ledger table under contention. `FOR UPDATE` row-locking is simpler to reason about for a single-row wallet balance and is the pattern most double-entry-ledger writeups converge on. Either is acceptable; `FOR UPDATE` is recommended for lower implementation complexity in a 1-developer-equivalent MVP timeline. |
| Balance as a live materialized column | Pure derived balance (`SUM(ledger_entries)` on every read) | Pure-derived is more "obviously correct" (balance can never drift from the ledger) but is slower to read as ledger rows grow, and doesn't remove the need for locking on write (concurrent debits still race on the check-then-insert). Recommended: keep a `wallets.balance` materialized column updated in the SAME transaction as the ledger insert, guarded by the row lock — this gives fast reads AND the ledger remains the source of truth for audits/reconciliation. A periodic or on-demand reconciliation query (`SELECT wallet_id, SUM(delta) FROM ledger_entries GROUP BY wallet_id` compared to `wallets.balance`) should be part of the concurrency test's assertions. |

**Installation:**
```bash
npm install @supabase/supabase-js @supabase/ssr zod drizzle-orm postgres
npm install -D drizzle-kit vitest @vitejs/plugin-react
```

**Version verification:** All versions above were checked against the npm registry on 2026-08-25 via `npm view <pkg> version`. `@supabase/ssr@0.12.5` was published approximately 20 hours before this research (i.e., very fresh — re-check for patch releases before implementation). `next-auth@beta` is at `5.0.0-beta.32` with `next: "^14.0.0-0 || ^15.0.0 || ^16.0.0"` in its peerDependencies (this is new — a since-closed GitHub issue documents earlier betas NOT supporting Next 16 without `--legacy-peer-deps`). This confirms Auth.js v5 beta has caught up to Next 16/React 19, but it is still a **beta**, which is an additional argument for Supabase Auth (stable) in a project that isn't deeply invested in Auth.js already.

## Architecture Patterns

### Recommended Project Structure
```
app/
├── auth/
│   ├── callback/route.ts       # OAuth callback: exchangeCodeForSession
│   └── auth-code-error/page.tsx
├── (auth-pages)/
│   ├── login/page.tsx           # social login buttons (Google, Kakao)
├── account/
│   └── page.tsx                 # settings: profile, pen name, delete account
├── write/
│   └── start/page.tsx           # "글쓰기 시작하기" pen-name/bio form → writer upgrade
lib/
├── supabase/
│   ├── client.ts                 # browser client (createBrowserClient)
│   ├── server.ts                 # server component/action client (createServerClient)
│   └── admin.ts                  # service-role client, server-only, for admin ops (account deletion, dev credit grants)
├── wallet/
│   ├── ledger.ts                 # typed wrapper calling the `debit_wallet`/`credit_wallet` Postgres functions via supabase.rpc()
│   └── types.ts                  # WalletTransactionSource = 'admin_grant' | 'ai_spend' | 'chapter_unlock' | 'toss_payment' (future-proofs Phase 4/5/6 without building them now)
proxy.ts                          # NOT middleware.ts — Next.js 16 renamed the file; refreshes Supabase session cookies on every request
supabase/
├── migrations/                   # SQL migrations: profiles, wallets, ledger_entries, functions
tests/
├── wallet/
│   └── ledger.concurrency.test.ts  # Vitest, real Postgres connection, parallel debit stress test
```

### Pattern 1: Next.js 16 uses `proxy.ts`, not `middleware.ts`
**What:** Next.js 16 deprecated the `middleware.ts` file convention and renamed it to `proxy.ts` (same behavior, renamed export: `export function proxy(request)` instead of `export function middleware(request)`). Proxy now defaults to the Node.js runtime (previously Edge-only pre-15.2), which removes a historical friction point with `@supabase/ssr` (which needs Node APIs).
**When to use:** Any session-refresh-on-every-request logic for Supabase Auth.
**Why it matters here:** Most existing Supabase + Next.js tutorials (including Supabase's own official quickstart, as of this research) still reference `middleware.ts` in older cached content. Any AI-generated or copy-pasted code following those tutorials verbatim will create a dead `middleware.ts` file that Next.js 16 ignores, silently breaking session refresh. Verified directly from the Next.js 16 package installed in this repo (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` and `middleware.md`), confidence HIGH.
**Example:**
```ts
// Source: node_modules/next/dist/docs/.../proxy.md (this repo's installed Next.js 16 docs) + Supabase SSR docs
// proxy.ts (project root, next to app/)
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  // refresh session if expired — required for Server Components
  await supabase.auth.getClaims()

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

### Pattern 2: `getClaims()` for fast auth checks, `getUser()` when you need DB-fresh state
**What:** Supabase's newer `getClaims()` verifies the JWT locally (WebCrypto + cached JWKS, no network round trip for projects using the default asymmetric signing keys) and should replace `getSession()` for authorization decisions in Proxy/DAL — `getSession()`'s user object must never be trusted server-side because it's read from the (spoofable) cookie without verification. `getUser()` still makes a live network call to Supabase Auth and is the only way to know if a session has been server-side revoked (e.g., right after an admin bans/soft-deletes the account).
**When to use:** `getClaims()` in `proxy.ts` and most Server Component/Action authorization checks (fast, no DB round trip). `getUser()` specifically in the account-deletion flow and anywhere a just-revoked session must be caught immediately (e.g., re-checking after ban/soft-delete).
**Confidence:** MEDIUM — sourced from Supabase's own docs/guides pages and a still-open GitHub issue (`supabase/supabase#40985`) noting the SSR guides are inconsistently updated between `getUser()` and `getClaims()`; treat this as the current best understanding, re-verify against Supabase's dashboard-generated quickstart code at implementation time since Supabase auto-generates fresh code samples per project.

### Pattern 3: Dual-role account via a single `profiles` row + role/pen-name fields
**What:** One `profiles` table keyed by `auth.users.id`, with `role` (`'reader' | 'writer'`, starts `'reader'`), `pen_name` (nullable until writer conversion), `pen_name_bio` (nullable, optional). "글쓰기 시작하기" is a Server Action that, in one transaction: validates pen name uniqueness (`SELECT 1 FROM profiles WHERE lower(pen_name) = lower($1) AND deleted_at IS NULL FOR UPDATE` or a `UNIQUE INDEX ON profiles (lower(pen_name))` relying on the DB to reject duplicates — prefer the DB constraint as the actual correctness guarantee, use the pre-check only for a friendly UX error), sets `role = 'writer'`, `pen_name`, `pen_name_bio`, `pen_name_set_at = now()`.
**Why a unique index over app-level locking:** A case-insensitive unique index (`CREATE UNIQUE INDEX profiles_pen_name_unique ON profiles (lower(pen_name)) WHERE deleted_at IS NULL`) is the actual race-condition-proof mechanism — two concurrent submissions of the same pen name will have one fail at the DB constraint level regardless of any earlier `SELECT` check, which is inherently racy (TOCTOU) without a lock. Catch the unique-violation Postgres error code (`23505`) in the Server Action and surface a "pen name taken" error.
**Confidence:** HIGH (standard Postgres pattern, not project-specific).

### Pattern 4: Wallet ledger — append-only double-entry table + materialized balance + row lock
**What:** Two tables:
```sql
-- Source: synthesized from multiple double-entry ledger writeups (dev.to/xidoke, pgrs.net/2025/03/24, freecodecamp bank-ledger guide) — MEDIUM confidence, cross-verified pattern, not a single official spec
create table wallets (
  id uuid primary key references profiles(id),
  balance bigint not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table ledger_entries (
  id bigint generated always as identity primary key,
  wallet_id uuid not null references wallets(id),
  delta bigint not null,                 -- positive = credit, negative = debit
  balance_after bigint not null,         -- snapshot for audit/debug, not authoritative
  reference_type text not null,          -- 'admin_grant' | 'ai_spend' | 'chapter_unlock' | 'toss_payment' (Phase 1 only uses 'admin_grant')
  reference_id text,                     -- external idempotency key (e.g., Toss payment_key in Phase 5; a client-generated UUID for admin grants)
  reason text,
  created_at timestamptz not null default now(),
  unique (wallet_id, reference_type, reference_id)  -- idempotency: same external event can't be applied twice
);
```
A single Postgres function performs the mutation atomically:
```sql
-- Source: pattern synthesized from PostgreSQL FOR UPDATE row-locking guides (dev.to/nickcosmo, nemanjatanaskovic.com) — MEDIUM confidence
create or replace function apply_wallet_delta(
  p_wallet_id uuid, p_delta bigint, p_reference_type text, p_reference_id text, p_reason text
) returns bigint
language plpgsql as $$
declare
  v_balance bigint;
begin
  -- lock the wallet row for the duration of this transaction
  select balance into v_balance from wallets where id = p_wallet_id for update;
  if v_balance is null then
    raise exception 'wallet % not found', p_wallet_id;
  end if;

  v_balance := v_balance + p_delta;
  -- the CHECK constraint on wallets.balance also guards this, but failing fast here
  -- gives a clearer application-level error than a generic constraint-violation
  if v_balance < 0 then
    raise exception 'insufficient balance';
  end if;

  insert into ledger_entries (wallet_id, delta, balance_after, reference_type, reference_id, reason)
  values (p_wallet_id, p_delta, v_balance, p_reference_type, p_reference_id, p_reason)
  on conflict (wallet_id, reference_type, reference_id) do nothing;

  if not found then
    -- idempotent replay: a ledger entry with this reference already exists, return current balance unchanged
    return (select balance from wallets where id = p_wallet_id);
  end if;

  update wallets set balance = v_balance, updated_at = now() where id = p_wallet_id;
  return v_balance;
end;
$$;
```
**Why this satisfies "proven correct under concurrent load":** The `SELECT ... FOR UPDATE` acquires an exclusive row lock on the specific wallet row for the lifetime of the transaction; any other concurrent call to `apply_wallet_delta` for the SAME wallet blocks until the first transaction commits or rolls back, eliminating the lost-update race. Concurrent calls against DIFFERENT wallets are unaffected (row-level, not table-level, locking) — this is important because the test suite must prove both "same wallet under contention stays correct" AND "different wallets aren't serialized against each other" (a naive table lock would pass the first test but fail a throughput/isolation expectation).
**Anti-pattern avoided:** `UPDATE wallets SET balance = balance - $1 WHERE id = $2` alone is NOT sufficient proof of correctness even though this specific SQL is itself atomic at the row level — the danger is application code that does `SELECT balance ...` then computes and writes back in two round trips (classic read-modify-write), which is the exact bug the dev.to/xidoke source found via stress testing. The Postgres function pattern above avoids this by keeping read+check+write inside one server-side transaction with an explicit lock, never round-tripping the balance back to the app between read and write.

### Pattern 5: Account deletion cascade (soft delete)
**What:** `docs/4. 시스템 아키텍처 및 기술 스택.md` §4.4 states the platform's general principle is `deleted_at`-based soft delete to protect against accidental permanent loss. Supabase's own `auth.admin.deleteUser(id, shouldSoftDelete=true)` API exists but (per Supabase's reference docs) is described as **irreversible** and scrubs identifying fields from `auth.users` — this is a different, stronger operation than the app-level "soft delete" the project wants, and should NOT be used for the D-08 탈퇴 flow (it forecloses any future "restore my account" feature and isn't what "soft delete, consistent with docs/4 §4.4" implies).
**Recommended pattern:**
1. Keep identity source of truth in `auth.users` (managed by Supabase) — do NOT call `auth.admin.deleteUser` in Phase 1.
2. App-level deletion Server Action: set `profiles.deleted_at = now()`, scrub/null out `pen_name_bio` and any other freely-editable PII fields the app collected (not the OAuth-provided email — that stays in `auth.users`, out of app control).
3. Immediately terminate the live session: call `supabase.auth.admin.signOut(access_token, 'global')` (service-role client, server-only) to revoke ALL refresh tokens for that user across devices.
4. Enforce the block going forward: because a short-lived access token issued before deletion remains cryptographically valid until it expires (revoking the refresh token doesn't retroactively invalidate an already-issued JWT), the DAL's `verifySession()`-equivalent function must, on every request needing account-scoped data, check `profiles.deleted_at IS NOT NULL` in the DB (not just decode the JWT) and force a client-side sign-out + redirect if so. This is the same DAL pattern the Next.js official auth guide already recommends for authorization — extend it with a `deleted_at` check.
5. **Wallet ledger:** do NOT delete or zero the wallet/ledger rows on account deletion. The ledger is append-only and immutable by design (Pattern 4); deletion simply means no future `apply_wallet_delta` calls will succeed for that wallet because the account-active check (`profiles.deleted_at IS NULL`) gates all wallet-affecting actions at the application layer, not at the DB layer. This preserves auditability (e.g., a later dispute or reconciliation) without contradicting the soft-delete principle.
**Confidence:** MEDIUM — the general soft-delete-over-hard-delete direction is HIGH confidence (directly required by docs/4 §4.4 and D-08); the specific mechanics of combining Supabase's session revocation APIs with an app-level `deleted_at` gate is synthesized from Supabase community discussions (`supabase/discussions/26771`, `2799`, `9239`), not an official end-to-end guide — validate the exact `auth.admin.signOut` call signature against the SDK at implementation time.

### Pattern 6: Provider-agnostic OAuth architecture (D-01)
**What:** Supabase Auth already abstracts Google and Kakao behind a single `supabase.auth.signInWithOAuth({ provider: 'google' | 'kakao', options: { redirectTo } })` call and a single `app/auth/callback/route.ts` handler (`exchangeCodeForSession(code)`), regardless of provider. This means "provider-agnostic architecture" is largely already satisfied by choosing Supabase Auth over a hand-rolled OAuth implementation — the login page just needs to render a button per enabled provider, both hitting the same callback route.
**Provider-specific config needed (not code, but external setup):**
- Google: OAuth Client ID (Web application type) in Google Cloud Console, authorized redirect URI = the Supabase project's `https://<project-ref>.supabase.co/auth/v1/callback`.
- Kakao: App in Kakao Developers console, REST API key as `client_id`, Kakao Login "Client Secret" code as `client_secret`, redirect URI configured in Kakao's "Kakao Login Redirect URI" field = same Supabase callback URL, **and Biz App conversion + `account_email` consent-item approval** (see Common Pitfalls) to satisfy D-02.

### Anti-Patterns to Avoid
- **Trusting `getSession()`/cookie-decoded user data for authorization:** the cookie is client-writable; always use `getClaims()` (verified) or `getUser()` (network-verified) server-side for anything that gates access or mutates data.
- **Read-modify-write on `wallets.balance` from application code** (`SELECT balance` then `UPDATE ... SET balance = ?` in two separate round trips) — this is the exact lost-update bug the concurrency test suite exists to catch; all balance mutation must go through the single `apply_wallet_delta` Postgres function.
- **Using `middleware.ts`** — silently ignored by Next.js 16; use `proxy.ts`.
- **Calling `auth.admin.deleteUser(id, true)` for the 탈퇴 flow** — this is Supabase's own hard-delete-with-scrubbing operation, not the app-level reversible soft-delete the project wants.
- **PGlite or any single-connection embedded Postgres for the concurrency test** — PGlite (Postgres-in-WASM) is a single in-process connection; it cannot exhibit the multi-connection row-locking behavior the test suite needs to prove. The concurrency suite must open genuinely separate connections (a `pg`/`postgres.js` pool with `poolSize >= N` concurrent test workers) against a real multi-connection-capable Postgres server.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Social login token exchange, PKCE, cookie session refresh | Custom OAuth client + JWT signing (as shown for education in Next.js's own auth guide) | `@supabase/ssr` + `@supabase/supabase-js` `signInWithOAuth`/`exchangeCodeForSession` | Next.js's own docs explicitly warn "implementing your own secure solution can quickly become complex" and recommend an auth library; Supabase handles PKCE, token refresh, and cookie sync correctly out of the box |
| Concurrency-safe balance math | Custom optimistic-locking/version-column scheme from scratch | Postgres `SELECT ... FOR UPDATE` inside a single server-side function (Pattern 4) | Row-level locking is a battle-tested Postgres primitive; hand-rolled version-column CAS logic (as seen in the dev.to/xidoke source) adds retry-loop complexity that isn't needed for a single-row-lock use case at this scale |
| Idempotent duplicate-request handling | App-level "have I seen this request before" cache/dedup logic | `UNIQUE (wallet_id, reference_type, reference_id)` constraint + `ON CONFLICT DO NOTHING` | The DB is the single source of truth for "has this event been applied" — no separate cache to keep in sync, survives server restarts/retries automatically |
| Case-insensitive uniqueness for pen names | App-level "check then insert" logic | `UNIQUE INDEX ON profiles (lower(pen_name)) WHERE deleted_at IS NULL` | DB-level uniqueness constraints are inherently race-free; app-level pre-checks are TOCTOU-racy under concurrent submissions |

**Key insight:** Every hand-rolled alternative in this table reintroduces a race condition or a duplicated source of truth that the phase's own goal ("proven correct under concurrent load") is explicitly testing for. Use the DB's transactional guarantees as the actual correctness boundary; application code should be a thin, idempotent wrapper around it.

## Common Pitfalls

### Pitfall 1: Kakao email requires Biz App conversion (directly threatens D-02)
**What goes wrong:** Kakao's `account_email` OAuth consent scope is gated behind converting the Kakao Developers app to a "Biz App." Without this, `signInWithOAuth({ provider: 'kakao' })` will NOT return an email at all, and D-02 mandates blocking signup (or collecting email another way) when the provider doesn't supply one.
**Why it happens:** Kakao restricts email scope by default to reduce spam/abuse risk from personal-tier apps; Supabase's own Kakao provider docs confirm this and offer a Supabase-side workaround (an "Allow users without an email" toggle) that exists specifically because of this Kakao-side restriction — but enabling that toggle would violate D-02, so it should NOT be turned on here.
**How to avoid:** Start the Biz App conversion process for the Kakao Developers app at the very beginning of Phase 1 execution (in parallel with coding), not as a blocking dependency discovered late. Community reports (Kakao DevTalk forum posts, 2026) indicate individual developers CAN complete Biz App conversion without a registered business (사업자등록번호) — it requires identity verification + accepting Kakao Business integrated-membership terms — but the review turnaround time is unknown/unverified. If Kakao email approval is still pending when Kakao login needs to ship, D-02's fallback ("require additional input to obtain [email]") should be implemented as a plan B: after Kakao OAuth completes without an email, redirect to a one-field "이메일을 입력해주세요" form before finalizing the account, rather than blocking signup outright — this satisfies D-02 without hard-blocking on Kakao's review process.
**Warning signs:** `signInWithOAuth` for Kakao succeeds but the resulting `auth.users` record (or the OAuth identity payload) has `email: null`.
**Confidence:** MEDIUM — Kakao's official developer docs confirm the Biz-App-gates-email-scope rule (via Supabase's own docs summarizing it); the "no business registration required" claim is community-sourced (Kakao DevTalk forum threads) and should be reconfirmed directly against Kakao's current developer console during setup.

### Pitfall 2: Copy-pasted Supabase SSR tutorials reference `middleware.ts`
**What goes wrong:** Most Supabase + Next.js SSR auth tutorials in general circulation (and likely in AI training data) were written before Next.js 16 and use `middleware.ts`. In this exact repo, that file is silently ignored by Next.js 16 — no error, no warning, sessions simply never refresh, and users get logged out unexpectedly after their access token expires.
**Why it happens:** Next.js 16 renamed `middleware` → `proxy` (Aug 2026-era release); the AGENTS.md file in this exact repo already flags this class of problem generally ("This is NOT the Next.js you know").
**How to avoid:** Always name the file `proxy.ts` and export `proxy` (or default export), per Pattern 1. Verify by checking `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` in this repo directly rather than trusting external tutorial code verbatim.
**Warning signs:** Users get signed out on token expiry (default Supabase JWT expiry ~1 hour) despite being "logged in"; `proxy.ts` never appears in server logs/breakpoints.

### Pitfall 3: Supavisor/PgBouncer transaction-mode pooling breaks ORM prepared statements
**What goes wrong:** Supabase's default pooled connection string (port 6543, transaction mode) does not support named prepared statements shared across logical sessions. Drizzle (via `postgres.js`) and Prisma both default to using prepared statements, causing intermittent `prepared statement "xxx" already exists` errors under load once more than one request reuses a pooled connection.
**Why it happens:** Transaction-mode pooling multiplexes many client "sessions" onto a smaller number of real Postgres backend connections, and prepared statements are backend-connection-scoped, not client-scoped — a statement prepared by client A can collide with one client B tries to prepare with the same auto-generated name on the same backend connection.
**How to avoid:** For app-level Drizzle/postgres.js connections through the pooler, set `prepare: false` (postgres.js) or the ORM's equivalent flag. For the wallet ledger's `apply_wallet_delta` calls, prefer calling the Postgres function via `supabase.rpc()` (which uses Supabase's REST/PostgREST layer, not a raw pooled SQL connection, sidestepping this issue) OR use direct session-mode connections (port 5432) for anything requiring prepared statements. Session mode on port 6543 was deprecated Feb 2025; session mode now lives only on port 5432.
**Warning signs:** Random 500s under concurrent load with `prepared statement already exists` in Postgres logs — this could be mistaken for the exact race condition the concurrency suite is trying to catch, wasting debugging time. Rule this out first by checking connection string / pooling mode before assuming a locking bug in `apply_wallet_delta` itself.
**Confidence:** MEDIUM-HIGH — well-documented via multiple GitHub issues (`prisma/prisma#22779`, `supabase#28239`) and Supabase's own troubleshooting docs.

### Pitfall 4: No local Docker/Supabase CLI on this development machine
**What goes wrong:** The concurrency test suite needs a real, multi-connection-capable Postgres instance. This machine has no `docker`, no `supabase` CLI, and no `psql` available (verified directly — see Environment Availability). Plans that assume `supabase start` (local Docker-based dev stack) will fail immediately.
**How to avoid:** Use a real hosted Supabase project (free tier is sufficient for Phase 1) as the dev/test target from day one — no local Postgres stack. This has a secondary benefit: it forces early, realistic testing against Supabase's actual connection pooler (surfacing Pitfall 3 early) rather than a local Postgres that wouldn't exhibit pooling quirks. A Wave 0 task must create this Supabase project and wire up environment variables before any auth or wallet code can be written or tested.
**Warning signs:** N/A — this is a pre-condition, not a runtime symptom.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker | Local Supabase dev stack (`supabase start`) | ✗ | — | Use a hosted (cloud) Supabase project for dev + concurrency testing instead of local stack |
| Supabase CLI | Local dev stack, migrations tooling | ✗ | — | Use Supabase Dashboard SQL editor / `supabase` CLI installed later if migrations tooling is wanted; not blocking for Phase 1 if hosted project + manually-run SQL migrations are acceptable |
| psql | Manual DB inspection/debugging | ✗ | — | Use Supabase Dashboard's SQL editor, or `drizzle-kit studio` |
| Node.js | Everything | ✓ | v22.14.0 | — |
| npm | Package management | ✓ | 10.9.2 | — |
| A created Supabase project | All auth + wallet work | ✗ (no `.env*`, no `supabase/` dir found in repo) | — | Must be created as a Wave 0 setup step |
| Google Cloud OAuth Client | Google login | ✗ (not verified — likely not yet created) | — | Must be created as a Wave 0 setup step |
| Kakao Developers app + Biz App conversion | Kakao login with email | ✗ (not verified — likely not yet created) | — | Must be created early; email scope specifically needs Biz App approval, start this first given unknown review time (Pitfall 1) |

**Missing dependencies with no fallback:**
- None — all missing dependencies below have a viable fallback for Phase 1's scope.

**Missing dependencies with fallback:**
- Docker/Supabase CLI/psql → hosted Supabase project + Dashboard SQL editor (see above).
- Supabase project, Google OAuth client, Kakao app + Biz App conversion → all must be created/requested as explicit Wave 0 tasks; the Kakao Biz App step in particular should be requested as early as possible since its approval turnaround is unknown.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (not yet installed — Wave 0 gap) |
| Config file | none yet — `vitest.config.ts` to be created in Wave 0 |
| Quick run command | `npx vitest run tests/wallet/ledger.concurrency.test.ts` (single-file, fast feedback) |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | Google/Kakao login creates a session and a `profiles` row with email present | integration (requires live Supabase project; OAuth flow itself is hard to fully automate — recommend a scripted Postgres-level check that a completed OAuth callback produces the expected `profiles` row, plus manual QA of the actual browser OAuth redirect) | `npx vitest run tests/auth/profile-provisioning.test.ts` | ❌ Wave 0 |
| AUTH-02 | "글쓰기 시작하기" flips role to writer, enforces pen-name uniqueness | integration (real Postgres, exercises the unique index + Server Action) | `npx vitest run tests/auth/writer-upgrade.test.ts` | ❌ Wave 0 |
| AUTH-03 | Session persists across simulated refresh (cookie round-trip through `proxy.ts`) | integration/unit on `proxy.ts` logic (can use `next/experimental/testing/server`'s `unstable_doesProxyMatch` plus a mocked cookie jar) | `npx vitest run tests/auth/session-refresh.test.ts` | ❌ Wave 0 |
| (phase goal) Wallet ledger proven correct under concurrent load | N parallel `apply_wallet_delta` calls against the same wallet; assert final `wallets.balance` == `SUM(ledger_entries.delta)`, no negative balance, no lost updates, idempotent retries produce no duplicate ledger rows | integration, real Postgres, genuinely parallel connections (`pg` Pool, `Promise.all`) | `npx vitest run tests/wallet/ledger.concurrency.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** run the specific test file(s) touched by that task.
- **Per wave merge:** `npx vitest run` (full suite).
- **Phase gate:** Full suite green, with the concurrency test run at least once with a meaningfully high parallelism count (e.g., 50-100 concurrent operations, per the dev.to/xidoke reference pattern) before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] Install and configure Vitest (`vitest.config.ts`, `node` environment for DB-touching tests, separate from any future `jsdom` environment for component tests).
- [ ] Create a hosted Supabase project; store connection details (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, direct Postgres connection string for the test suite) in `.env.local` (gitignored) and document required env vars in `.env.example`.
- [ ] Register Google OAuth Client (Google Cloud Console) and configure the Supabase Google provider.
- [ ] Register Kakao Developers app, request Biz App conversion + `account_email` consent item approval (start immediately — unknown turnaround), configure the Supabase Kakao provider.
- [ ] Write the `wallets` / `ledger_entries` schema migration and the `apply_wallet_delta` Postgres function.
- [ ] `tests/wallet/ledger.concurrency.test.ts` — the core proof-of-correctness test for this phase's stated goal.
- [ ] `tests/auth/profile-provisioning.test.ts`, `writer-upgrade.test.ts`, `session-refresh.test.ts`.
- [ ] Shared test fixture/helper for opening a genuine multi-connection `pg.Pool` against the test Supabase project, plus a teardown that resets wallet/ledger test rows between runs.

## Sources

### Primary (HIGH confidence)
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` and `middleware.md` (this repo's installed Next.js 16.3.2) — confirms `middleware.ts` deprecation, `proxy.ts` replacement, Node.js runtime default.
- `node_modules/next/dist/docs/01-app/02-guides/authentication.md` — official Next.js auth/session/authorization guidance, DAL pattern, auth library list (includes Supabase and NextAuth.js).
- `docs/4. 시스템 아키텍처 및 기술 스택.md` §4.2, §4.4 — Supabase/PostgreSQL/PgBouncer-Supavisor stack commitment; soft-delete (`deleted_at`) principle.
- `docs/3. 비즈니스 모델 및 사용자 정책.md` §3.1 — single-token-economy semantics informing ledger design (no cash-out logic needed yet).
- npm registry (`npm view <pkg> version/peerDependencies`, checked 2026-08-25) — `@supabase/supabase-js@2.112.4`, `@supabase/ssr@0.12.5`, `next-auth@beta` → `5.0.0-beta.32` with peerDeps `next: "^14.0.0-0 || ^15.0.0 || ^16.0.0"`, `react: "^18.2.0 || ^19.0.0"`, `drizzle-orm@0.45.2`, `zod@4.4.3`, `vitest@4.1.11`, `pg@8.23.0`, `postgres@3.4.9`.
- Direct machine probe (`command -v docker/supabase/psql`, `node --version`) — confirms no Docker/Supabase CLI/psql locally; Node v22.14.0 available.

### Secondary (MEDIUM confidence)
- Supabase official docs (via WebFetch): `supabase.com/docs/guides/auth/server-side/creating-a-client`, `.../social-login/auth-google`, `.../social-login/auth-kakao`, `.../reference/javascript/auth-admin-deleteuser` — social provider setup, SSR client pattern, `getClaims()` guidance, `shouldSoftDelete` behavior.
- Auth.js official docs (`authjs.dev/getting-started/providers/kakao`) — confirms Kakao is a built-in Auth.js provider (contradicts CONTEXT.md's initial assumption).
- GitHub issues: `nextauthjs/next-auth#13302` (Next 16 peer-dep issue, since resolved in beta.32), `prisma/prisma#22779`, `supabase/discussions#28239` (Supavisor transaction-mode prepared-statement issues), `supabase/discussions#26771`, `#2799`, `#9239` (soft delete / ban patterns), `supabase/supabase#40985`, `#39947` (getClaims vs getUser doc inconsistency).
- Ledger/concurrency pattern writeups: `dev.to/xidoke` (stress-test-found race condition + fix pattern), `pgrs.net/2025/03/24` and `pgrs.net/2025/06/17` (Paul Gross, ledger-as-source-of-truth design), `dev.to/nickcosmo`, `nemanjatanaskovic.com` (row-level locking mechanics), `freecodecamp.org` bank-ledger-in-Go guide (double-entry schema shape).

### Tertiary (LOW confidence — flagged for validation)
- Kakao DevTalk forum threads (`devtalk.kakao.com`) on Biz App conversion without business registration — community-sourced, no official Kakao SLA or definitive policy page cited; **must be reconfirmed directly in the Kakao Developers console at implementation time**, and the review turnaround time is entirely unknown.

## Metadata

**Confidence breakdown:**
- Standard stack (Supabase Auth, Next.js 16 conventions, package versions): HIGH — verified against installed Next.js docs and live npm registry.
- Architecture (wallet ledger schema/function, account-deletion cascade): MEDIUM — internally consistent and cross-verified against multiple independent sources, but synthesized rather than copied from one canonical official spec (no single "Supabase wallet ledger" official guide exists).
- Pitfalls (Kakao Biz App, proxy.ts rename, Supavisor prepared statements, no local Docker): HIGH for the Next.js/Supavisor findings (official docs/GitHub issues), MEDIUM for the Kakao Biz-App-without-business-registration claim (community forum only).

**Research date:** 2026-08-25
**Valid until:** ~2026-09-24 (30 days) for the architecture/pitfalls content; re-check `@supabase/ssr` and `next-auth@beta` versions before implementation given both are moving fast (ssr package published ~1 day before this research; next-auth still in beta).
