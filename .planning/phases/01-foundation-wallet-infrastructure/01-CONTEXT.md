# Phase 1: Foundation & Wallet Infrastructure - Context

**Gathered:** 2026-08-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 1 delivers two things:
1. **Auth** — social-login authentication (Google, then Kakao as a fast-follow within this same phase) backing one dual-role account (reader/writer), with persistent sessions.
2. **Wallet/ledger infrastructure** — a token ledger data layer proven safe under concurrent access using fake/stubbed credits, before any real AI spend (Phase 4) or real payment (Phase 5) code touches it.

No real payments, no AI generation, and no token-spending UI exist yet in this phase.

</domain>

<decisions>
## Implementation Decisions

### Social Login
- **D-01:** Google is implemented first; Kakao is added as a fast-follow within Phase 1 itself (not deferred to a later phase). Auth architecture should be provider-agnostic from the start to support both.
- **D-02:** Email is required from the social provider. If a provider (commonly Kakao) doesn't supply an email, block signup or require additional input to obtain one — never create an account without an email on file.
- **D-03:** No email/password signup — social login only (Google + Kakao).

### Writer Upgrade Flow
- **D-04:** Clicking "글쓰기 시작하기" prompts for a pen name (필명, required) and a short bio/intro (소개글, optional), then immediately flips the account to writer role on submit. This happens only on the first conversion.
- **D-05:** Pen name must be unique platform-wide — requires a uniqueness check at submission.
- **D-06:** Pen name is not editable in Phase 1. Editing is deferred to a later phase (settings/마이페이지).

### Account / Session UX
- **D-07:** Beyond a logged-in header state and logout, Phase 1 includes a simple account settings page: profile/nickname display, pen name display (for writers), and an account deletion entry point.
- **D-08:** Account deletion (탈퇴) is actually implemented in Phase 1, not just a stubbed entry point. Prefer soft delete (`deleted_at`), consistent with the soft-delete principle in docs/4 §4.4.

### Claude's Discretion
- **Wallet ledger proof surface:** Not discussed with the user — left to Claude/researcher judgment. The phase goal requires the ledger to be "proven correct under concurrent load," so an automated concurrency test suite is treated as mandatory; whether to also expose a dev/admin UI to grant fake credits and view balances is Claude's call.
- **Session/auth implementation details** (e.g., Supabase Auth vs. NextAuth, specific session storage mechanism): technical implementation, delegated to research/planning.
- **Account deletion data handling specifics** (exact soft-delete scope, how related records — future KB docs, chapters, wallet — are handled on deletion): delegated, but must follow the soft-delete principle referenced in docs/4 §4.4.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Backend / Data Integrity
- `docs/4. 시스템 아키텍처 및 기술 스택.md` §4.2 (백엔드 및 데이터베이스) — Supabase/PostgreSQL + PgBouncer/Supavisor as the intended backend, relevant to wallet ledger integrity design. Note: MVP inherits this stack but exact adoption is re-confirmed at research/planning time per PROJECT.md.
- `docs/4. 시스템 아키텍처 및 기술 스택.md` §4.4 (보안 및 데이터 무결성) — soft-delete (`deleted_at`) principle; directly informs the account deletion implementation (D-08).

### Business Model / Token Economy
- `docs/3. 비즈니스 모델 및 사용자 정책.md` §3.1 (로벅스형 단일 가상 경제) — single-token economy model. Informs wallet ledger semantics (single token type, no cash conversion logic needed yet). **Note:** cash-out (환전) described in this doc is explicitly out of scope for v1 per PROJECT.md — do not build cash-out logic in Phase 1.

### Project-Level Decisions
- `.planning/PROJECT.md` — Key Decisions table: Toss Payments direct integration (no PG abstraction layer, affects future wallet interface shape), Google Gemini as sole AI vendor, execution via Antigravity CLI (`agy`) rather than standard GSD executor.
- `.planning/REQUIREMENTS.md` — AUTH-01, AUTH-02, AUTH-03 (the literal v1 requirements this phase maps to).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None. Repository is a bare `create-next-app` scaffold (Next.js 16 / React 19 / Tailwind 4). `package.json` has no auth, DB, or state-management packages installed yet — everything in this phase is greenfield.

### Established Patterns
- None yet — no existing auth, session, or data-layer code to follow or diverge from.

### Integration Points
- `app/layout.tsx` (root layout) and `app/page.tsx` are the only existing app files — both are default scaffold content, not yet touched by feature code.

</code_context>

<specifics>
## Specific Ideas

- Pen name (필명) must be unique platform-wide and is collected as a required field only at first writer-conversion; a short bio (소개글) is collected at the same time as an optional field.
- Account deletion is a real, working feature in this phase (not deferred), implemented as soft delete per docs/4 §4.4.
- Auth should be architected to support multiple OAuth providers (Google + Kakao) from the start, since Kakao follows Google within the same phase.

</specifics>

<deferred>
## Deferred Ideas

- Pen name editing UI — deferred to a later phase (settings/마이페이지), per D-06.
- Wallet ledger dev/admin UI (if any) — not decided here, left to Claude's discretion in research/planning rather than deferred outright.

### Reviewed Todos (not folded)
None — no pending todos matched this phase.

</deferred>

---

*Phase: 01-foundation-wallet-infrastructure*
*Context gathered: 2026-08-25*
