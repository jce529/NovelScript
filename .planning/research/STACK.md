# Stack Research — v1.1 (멀티 프로바이더 AI · BYOK · 구독형 AI MCP)

**Domain:** Multi-provider AI connectivity, BYOK key management, remote MCP server — on top of the existing NovelScript v1.0 stack (Next.js 16 / React 19 / Supabase / Gemini-only `lib/ai/`)
**Researched:** 2026-09-16
**Confidence:** MEDIUM-HIGH for the 1st-stage (multi-provider + BYOK) stack; MEDIUM-LOW for the 2nd-stage MCP/OAuth stack — the MCP authorization landscape changed materially with the 2026-07-28 spec revision (CIMD replacing Dynamic Client Registration) and the ecosystem is still stabilizing around it.

## Recommended Stack

### Core Additions

| Technology | Version (verified 2026-09-16) | Purpose | Why |
|---|---|---|---|
| Direct vendor SDKs (`openai`, `@anthropic-ai/sdk`) kept behind the existing `GeminiClient`-shaped adapter interface | `openai@7.15.0`, `@anthropic-ai/sdk@0.125.0` | Provider-specific call implementations for the new adapters | See Q1 — direct SDKs, not the Vercel AI SDK, because BYOK needs a fresh client instantiated per call with a runtime-supplied key, and the existing DI/mock testing pattern in `lib/ai/gemini.ts` already assumes "one small hand-rolled client interface per vendor," not a shared abstraction library. |
| `js-tiktoken` (pure-JS, no WASM) | latest on npm as of 2026-09-16 (verify exact patch at install time — pure-JS port, versioned independently of `tiktoken`) | Local pre-call token estimation for OpenAI (and as a cross-vendor approximation for Anthropic) | See Q2 — replaces the Gemini-only pre-call `countTokens` round trip that OpenAI has no equivalent for. Pure-JS variant chosen over the WASM `tiktoken` package for simpler Vercel/Node deploy (no `.wasm` asset handling) since this is an approximation, not a billing-grade count. |
| Node built-in `crypto` (AES-256-GCM), no new package | Node 22/24 built-in (matches `openai@7.x`'s own minimum-supported Node line) | BYOK ciphertext encryption at rest | See Q3 — envelope encryption with a KEK from a Vercel-encrypted env var, decrypted only inside the server action that makes the provider call. No new dependency. |
| `mcp-handler` (formerly `@vercel/mcp-adapter`) | `2.1.1` (already vendored, unreleased-to-node_modules, at `mcpres/mcp-handler-2.1.1.tgz` in this worktree) | Turns a Next.js Route Handler into a spec-compliant MCP server (Streamable HTTP) | See Q4 — **adopt it.** Built and maintained by Vercel specifically for this exact deployment target (Next.js Route Handlers on Vercel), serves the current 2026-07-28 MCP spec natively with 2025-era fallback, and ships `withMcpAuth`/`protectedResourceHandler` for the RFC 9728/8414 plumbing this project needs anyway. |
| `@modelcontextprotocol/server` | `^2.0.0` | MCP TypeScript SDK v2 — the actual protocol implementation `mcp-handler` wraps | Required peer dependency of `mcp-handler@2.x` (`peerDependenciesMeta` marks it non-optional). Replaces the older monolithic `@modelcontextprotocol/sdk` (1.x) package — do not install that older package alongside it. |
| An external OAuth 2.1 authorization server for the MCP resource server — **WorkOS AuthKit** (`@workos-inc/authkit-nextjs` + WorkOS Connect) recommended over self-hosting one | AuthKit for Next.js is actively maintained; WorkOS Connect explicitly targets MCP OAuth per the current spec | Issues and manages the OAuth tokens `mcp-handler`'s `withMcpAuth` verifies | See Q5 — `mcp-handler` is a **resource server** adapter only; it verifies bearer tokens, it does not mint them. NovelScript has no OAuth authorization-server surface today (Supabase Auth is a session/identity provider, not a spec-compliant OAuth AS for third-party MCP clients). Building one from scratch (e.g. via `oidc-provider`) is realistically its own multi-week sub-project on serverless infrastructure; WorkOS/AuthKit is a bolt-on specifically built for this MCP-AS gap and keeps Supabase as the system of record for the underlying user identity. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---|---|---|---|
| `zod` | already `^4.4.3` in `package.json` | Runtime validation for provider adapter inputs/outputs, BYOK key payloads, MCP tool `inputSchema`s | `mcp-handler@2.x` requires `zod@^4.2.0` for its Standard-Schema-based `registerTool` API — the project's existing zod 4.4.3 already satisfies this, no version bump needed. |
| (none new for pricing/capability tables) | n/a | Per-provider pricing/capability data | Plain TypeScript record literals extending the existing `lib/ai/cost.ts` pattern (`GEMINI_PRICING_USD_PER_MILLION`-shaped table per provider) — this is data, not a library concern. |

## Installation

```bash
# Vendor SDKs for the new provider adapters (Gemini's @google/genai already installed)
npm install openai @anthropic-ai/sdk

# Local token estimation (pure-JS, no WASM asset)
npm install js-tiktoken

# Remote MCP server (2nd stage) — the SDK v2 packages, NOT the old @modelcontextprotocol/sdk
npm install mcp-handler@^2 @modelcontextprotocol/server@^2

# OAuth 2.1 authorization server for MCP (2nd stage)
npm install @workos-inc/authkit-nextjs

# No new package for BYOK encryption — Node's built-in `crypto` module covers AES-256-GCM
```

Note on `mcp-handler`: this worktree already has `mcpres/mcp-handler-2.1.1.tgz` (an untracked local tarball, evidence of a prior research session's manual download) plus an extracted `mcpres/package/` directory. Once adopted, install the real published package from the npm registry (`npm install mcp-handler@^2`) rather than the local tarball, and remove `mcpres/` — it should not be committed as-is.

## Question-by-Question Findings

### 1. Multi-provider call layer: direct SDKs, kept behind the existing hand-rolled adapter shape

**Recommendation: keep the `GeminiClient`-style interface pattern and add `OpenAiClient`/`AnthropicClient` interfaces backed by the official `openai` and `@anthropic-ai/sdk` packages directly. Do NOT introduce the Vercel AI SDK (`ai` + `@ai-sdk/*`) as the call layer. Confidence: MEDIUM-HIGH.**

This directly overturns the v1.0 STACK.md's AI-SDK recommendation (`docs/research/v1.0/STACK.md` §2) — that recommendation was written when the project was explicitly single-vendor with one platform key and no BYOK. The constraints have changed:

- **BYOK is the deciding factor, not streaming.** `@ai-sdk/openai` and `@ai-sdk/anthropic` are provider *factories* meant to be configured once (typically at module scope, from `process.env`) and reused. Runtime, per-request, per-user API key injection is supported (`createOpenAI({ apiKey })` per call), so the AI SDK is not technically incapable of BYOK — but doing so means creating a fresh provider instance on every single call anyway, which erases nearly all of the abstraction's value (the shared retry/error-normalization/streaming-hook machinery is what you're paying the dependency for, and per-call provider construction plus non-streaming usage sidesteps most of it).
- **The project has explicitly deferred streaming to v2+** (`.planning/research/FEATURES.md` anti-features: "Streaming for all providers in v1.1" — the `[REPLY]/[DRAFT]/[DOCUMENT]` text-block protocol in `lib/ai/chat.ts` requires the complete response before it can be parsed). Streaming is the single biggest reason to adopt the AI SDK (`useChat`/`useCompletion`, SSE reconnect handling); with it off the table for this milestone, the AI SDK's main value proposition doesn't apply.
- **Testability parity.** The current `GeminiClient` interface (`lib/ai/gemini.ts`) is dependency-injected specifically so `lib/ai/chat.ts` can be unit tested against `createMockGeminiClient()` without ever hitting a paid API (documented inline as "Pitfall 4"). The official `openai` and `@anthropic-ai/sdk` packages are plain constructor-based clients (`new OpenAI({ apiKey })`, `new Anthropic({ apiKey })`) that slot into the exact same pattern — write `createOpenAiClient(apiKey)` / `createMockOpenAiClient()` factories mirroring `createGeminiClient()`/`createMockGeminiClient()` one-for-one. Introducing the AI SDK's own provider/model objects instead would mean re-deriving that mocking discipline against a third-party abstraction rather than reusing a pattern already proven in this codebase.
- **A common adapter interface is still the right move — just hand-rolled, not vendor-supplied.** Define one project-owned interface (e.g. `AiProviderClient` with `generateContent`/`countTokensEstimate`) that `GeminiClient`, an `OpenAiClient`, and an `AnthropicClient` each implement, matching the "Provider Adapter Interface" already scoped in `FEATURES.md`'s dependency graph. This is strictly less code than adapting to the AI SDK's `LanguageModelV2` interface shape while also satisfying BYOK and preserving the existing mock-based test suite unchanged in spirit.
- **Gateway options (OpenRouter, Vercel AI Gateway) are the wrong shape for BYOK.** A gateway sits *between* the app and the vendor and is normally configured with the gateway's own credentials; layering a user's personal API key through a gateway defeats the "call the vendor directly with the user's own key" trust model BYOK is supposed to provide, and reintroduces exactly the "arbitrary outbound proxy" concern `FEATURES.md` already flagged as an anti-feature for custom base URLs.

**When this recommendation would flip:** if v1.1's scope grows to include streaming for the panel (deferred to v2+ per `FEATURES.md`), the calculus changes — the AI SDK's `streamText`/`useChat` machinery becomes worth its cost, and BYOK-per-call provider construction becomes acceptable overhead relative to hand-rolling three vendors' SSE parsers. Revisit at that point, not now.

### 2. Token counting across providers: local estimation, not per-vendor remote calls

**Recommendation: `js-tiktoken` (pure-JS BPE tokenizer) for pre-call estimation across all three providers; keep exact post-call debiting from each provider's own returned usage. Confidence: MEDIUM.**

This matches `FEATURES.md`'s anti-feature conclusion ("Pre-call `countTokens` parity across all providers") and gives it a concrete package:

- **Gemini** already has a cheap remote `countTokens` call (`ai.models.countTokens`, used today in `lib/ai/gemini.ts`/`chat.ts`) — keep it for the Gemini path only, no change needed.
- **Anthropic** has an official token-counting endpoint (`POST /v1/messages/count_tokens`, exposed in `@anthropic-ai/sdk@0.125.0` per its own usage), but it is a real network round trip with its own rate limit — using it as a *pre-call gate* on every single chat turn doubles the request count against Anthropic's API for no output, which is wasteful specifically for the BYOK path where the user's own rate limit is what's being spent.
- **OpenAI has no remote token-counting endpoint at all.** The only supported way to count OpenAI tokens ahead of a call is a local BPE tokenizer — OpenAI's own cookbook recommends `tiktoken`.
- **Recommendation: use one local estimator (`js-tiktoken`) uniformly across all three providers for the pre-call cap**, accepting that it is exact for OpenAI, a documented-as-approximate stand-in for Anthropic (community guidance: approximate Claude counts with OpenAI's `p50k_base`/`cl100k_base` encoding, "always prefer Anthropic's official counts for billing-grade accuracy" for anything that bills the platform), and simply redundant-but-harmless for Gemini (which still gets its own exact remote count). This uniformity is *simpler* to implement and reason about than "one estimation strategy per vendor," and it is only used for `computeMaxOutputTokens`'s pre-call ceiling — never for the actual debit.
- **The post-call debit stays authoritative and vendor-exact.** `lib/ai/cost.ts`'s `computeDebitAmount` already only trusts `usageMetadata` returned *after* the call (documented inline: "Pitfall 2... never the pre-call countTokens estimate"). This principle extends unchanged to OpenAI (`response.usage.prompt_tokens`/`completion_tokens`) and Anthropic (`response.usage.input_tokens`/`output_tokens`) — both SDKs return real, provider-billed usage on every response, so the exchange-rate math in `cost.ts` needs a per-provider pricing table, not a per-provider estimation strategy.
- Considered and rejected: `tiktoken` (WASM build) — functionally equivalent but adds a `.wasm` asset to the Next.js server bundle for a feature that's explicitly an approximation, not exact billing; `@tokenlens/tokenizer` (multi-provider-aware wrapper with per-provider tokenizers and heuristic fallback) — a reasonable alternative if provider-specific accuracy on the pre-call estimate becomes a real support-ticket source later, but adds a dependency for a problem `js-tiktoken` already solves adequately for a *cap*, not a *charge*.

### 3. BYOK key encryption at rest: application-level AES-256-GCM, not Supabase Vault

**Recommendation: Node's built-in `crypto` module (AES-256-GCM), with the KEK held in a Vercel encrypted environment variable — not Supabase Vault, and not the already-enabled `pgcrypto` extension's SQL-level functions. Confidence: MEDIUM (this is a judgment call between two legitimate options; Supabase's own docs point the other way — see caveat below).**

This resolves the "Pending" decision both `.planning/research/v1.0/STACK.md` (§4, "What to trim... revisit if/when BYOK ships") and `FEATURES.md` (Open Question 6) explicitly deferred to this milestone.

- **Current state, verified by reading the migrations:** `supabase/migrations/0001_init.sql` already runs `create extension if not exists "pgcrypto";` — so Postgres-side symmetric encryption (`pgp_sym_encrypt`/`pgp_sym_decrypt`) is available with zero new setup. This makes "encrypt in SQL" a real, low-friction option, not a hypothetical.
- **Supabase Vault is still the vendor-recommended path for secrets in Postgres as of 2026**, and its API is promised stable even though its underlying extension (`pgsodium`) is heading into a deprecation cycle that Supabase says it will migrate transparently. Vault is a legitimate, well-supported choice.
- **Why this research recommends app-level AES-GCM over both Postgres-side options anyway, for this specific shape of data:**
  1. **Decryption locality.** The plaintext key is only ever needed in exactly one place — the server action that's about to call the vendor's SDK with it. AES-GCM in Node decrypts in the same process that immediately uses the key and discards it; Vault/pgcrypto both require an extra round trip to Postgres (a `SELECT vault.decrypted_secrets...` or a `pgp_sym_decrypt(...)` call) on the hot path of every single AI generation, for data that never needs to leave the Node process once decrypted.
  2. **Consistency with the existing testable-adapter pattern.** `lib/ai/gemini.ts`'s whole design principle is dependency injection so nothing touches a real network/DB dependency in tests unless explicitly wired up. A Node-`crypto`-based `encryptApiKey`/`decryptApiKey` pair is pure, synchronous, and trivially unit-testable with fixed inputs; a Vault-based approach makes every unit test that touches key decryption either mock the Supabase RPC or become an integration test.
  3. **Rotation ownership.** A single KEK in a Vercel encrypted env var is one artifact to rotate (re-encrypt all ciphertexts with a new KEK, a straightforward migration script) versus Vault's root-encryption-key rotation, which Supabase's own troubleshooting docs flag as a documented pain point ("Issues with rotating pgsodium and Vault root encryption keys").
  4. **No new extension-deprecation exposure.** Building net-new BYOK infrastructure directly on `pgsodium` (via Vault) in the same year Supabase begins deprecating that extension is avoidable risk, even with Supabase's stable-API promise for Vault itself.
- **Concrete shape:** a new `byok_keys` table with columns for `provider`, `ciphertext`, `iv`, `auth_tag`, and a **separate plaintext `masked_hint` column** (e.g. `sk-...a3f9`) — exactly as `FEATURES.md` already specified ("the single most important schema decision in the BYOK slice") — so rendering the settings list never requires a decrypt call at all.
- **Caveat / explicit tradeoff acknowledgment:** this is a defensible-but-contestable call, not a slam dunk. If the team later wants centralized key-management auditing across the whole Supabase project (not just AI keys), or wants to avoid holding a KEK in application config entirely, Supabase Vault remains the documented, vendor-blessed alternative and nothing above rules it out — it is being deprioritized here specifically for the "single hot-path secret used inside one server action" shape of this feature, not rejected as unsound in general.

### 4. Remote MCP server implementation: adopt `mcp-handler` — verifying the tarball already in the worktree

**Recommendation: `mcp-handler@2.1.1` (the exact version already vendored at `mcpres/mcp-handler-2.1.1.tgz`), paired with `@modelcontextprotocol/server@^2.0.0`. Confidence: HIGH that this is the right package; MEDIUM on some of its newest-spec details since the 2026-07-28 revision is very recent.**

Explicit verdict on the leftover artifact: **adopt it, but reinstall from the registry rather than keeping the local tarball.** Reading `mcpres/package/package.json` and `mcpres/package/README.md` directly (not just trusting the filename) confirms:

- It is the real, current Vercel-maintained package (`"author": "Vercel"`, repo `vercel/mcp-handler`, previously published as `@vercel/mcp-adapter` — this is the successor name, not a fork or a squatted name).
- It returns a framework-agnostic `(Request) => Promise<Response>` handler, explicitly documented to mount as a Next.js Route Handler (`app/api/mcp/route.ts`) with no path convention required by the library.
- Version 2.x is built on **MCP SDK v2** (`@modelcontextprotocol/server`, not the older `@modelcontextprotocol/sdk` 1.x line) and serves the **2026-07-28 spec** natively (Streamable HTTP, stateless, no sessions) while falling back to 2025-era Streamable HTTP for older clients from the same handler — this is exactly the transport `FEATURES.md`'s MCP section calls for ("remote HTTP MCP server reachable on the public internet").
- It ships the two pieces this project specifically needs for the security requirements in `FEATURES.md`/the roadmap: `withMcpAuth` (verifies bearer tokens, answers RFC 9728-compliant `401`/`403` challenges) and `protectedResourceHandler` (serves the RFC 9728 Protected Resource Metadata document). These are **resource-server** primitives — see Q5 for what they do *not* provide.
- Peer requirements are compatible with this project as-is: `next: ">=13.0.0"` (optional peer, satisfied by the existing Next 16.3.2) and `@modelcontextprotocol/server: ^2.0.0"` (must be installed alongside it — it's not bundled).
- **Old HTTP+SSE transport (2024-11-05) is removed in 2.x** — if any client documentation this project writes references an `/sse` endpoint pattern from older MCP tutorials, that pattern no longer applies; Redis (previously needed for SSE session state in `mcp-handler` 1.x) is explicitly no longer needed.

Why not the alternatives: hand-rolling directly against `@modelcontextprotocol/server`'s lower-level primitives would mean re-implementing the Streamable HTTP transport wiring, the dual-era protocol fallback, and the RFC 9728 metadata endpoint from scratch, all of which `mcp-handler` already does specifically for the Next.js/Vercel target this project is already deployed on. There is no credible reason to avoid a same-vendor (Vercel) adapter for a Vercel-hosted Next.js app.

### 5. OAuth 2.1 + PKCE on Next.js: `mcp-handler` verifies tokens, it does not mint them — plan for a separate authorization server

**Recommendation: WorkOS AuthKit (`@workos-inc/authkit-nextjs` + WorkOS Connect's MCP-targeted OAuth surface) as the authorization server, with `mcp-handler`'s `withMcpAuth`/`protectedResourceHandler` as the resource-server side. Do not attempt to hand-build a spec-compliant OAuth 2.1 authorization server on serverless Next.js for this milestone. Confidence: MEDIUM — this is the least-settled part of the research; the underlying spec itself changed recently.**

This is the single most consequential stack decision in the MCP phase, and it was **not** fully resolved by the `mcp-handler` adoption above:

- **`mcp-handler`'s auth support is resource-server-only.** `withMcpAuth` takes a `verifyToken` function and answers `401`/`403` with the right RFC 9728 challenge headers; it does not issue authorization codes, exchange PKCE verifiers, or mint access/refresh tokens. Something else has to be the authorization server the MCP client (Claude, ChatGPT) redirects the user to.
- **Supabase Auth cannot directly fill that role for third-party MCP clients.** Supabase Auth is a session/identity provider for NovelScript's own frontend; it is not a general-purpose OAuth *authorization server* that speaks RFC 8414 metadata discovery, issues scoped access tokens to arbitrary external OAuth clients (Claude/ChatGPT), and exposes the token/consent endpoints those clients expect. Wiring Supabase Auth into that role would mean building the AS protocol surface on top of it anyway.
- **The spec itself moved recently, raising the bar further:** the 2026-07-28 MCP revision deprecates Dynamic Client Registration (DCR) in favor of Client ID Metadata Documents (CIMD), where the OAuth client self-identifies via an HTTPS URL serving its metadata, per `mcp-handler`'s own README. Any from-scratch authorization-server build for this milestone needs to target the *current* auth model, not the DCR-based tutorials still circulating from 2025.
- **Self-hosting an authorization server (e.g. `oidc-provider`, `node-oidc-provider`) is a real, mature Node option in the abstract**, but building and operating a spec-compliant OAuth 2.1 AS (client registration/CIMD handling, consent UI, token issuance and revocation, JWKS rotation) is realistically its own multi-week project layered on top of an already-large MCP phase that `FEATURES.md` already flags as the single highest-complexity item in the milestone ("OAuth Authorization Surface... gates EVERYTHING in the MCP phase"). One claim surfaced during research — that Vercel's serverless model makes `oidc-provider` outright infeasible there — could not be verified against `oidc-provider`'s own docs (it supports pluggable, external-storage adapters, which is the standard pattern for running it statelessly) and should be treated as LOW confidence and unverified either way; the recommendation below does not depend on that claim.
- **Why WorkOS AuthKit specifically, over Clerk or a custom build:** WorkOS's docs and product surface (`workos.com/mcp`, `workos.com/docs/authkit/mcp`) explicitly target "spec-compatible OAuth authorization server for MCP" as a first-class use case, with a Next.js integration package (`@workos-inc/authkit-nextjs`) already built for PKCE + sealed-state authorization flows. Clerk also documents an MCP server integration path and is a credible second option; the choice between the two is a smaller, lower-risk decision than "buy an AS vs. build one," which is the decision this research is confident about. **This does introduce a second identity-adjacent vendor alongside Supabase Auth** — the recommendation is scoped narrowly to *authenticating the MCP OAuth flow itself* (mapping an external MCP client's OAuth grant to a NovelScript user), not to replacing Supabase Auth for the product's own login.
- **Node vs Edge runtime:** consistent with the v1.0 STACK.md's existing guidance for the AI streaming routes, run the MCP route handler and any auth-verification code on the **Node.js runtime**, not Edge — `withMcpAuth`'s token verification will typically need to call out to the authorization server's JWKS/introspection endpoint and/or Supabase's admin client to resolve the NovelScript user, and Node has fuller crypto/driver compatibility than Edge for this kind of server-to-server call.

**Open item for the MCP phase's own dedicated research pass (flagged, not resolved here):** the exact CIMD-era client-registration flow for the two target clients (Claude, ChatGPT) should be re-verified against each vendor's connector setup docs at MCP-phase implementation time — this stack research confirms the *shape* of the solution (external AS + `mcp-handler` resource server) but the fine-grained "what does Claude's connector UI actually send" detail is exactly the kind of fast-moving spec-adjacent detail this project's research discipline calls for re-checking at the point of implementation, not now.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|---|---|---|
| Direct `openai`/`@anthropic-ai/sdk` SDKs behind a hand-rolled adapter interface | Vercel AI SDK (`ai` + `@ai-sdk/*`) | If streaming is pulled forward into this milestone (currently deferred to v2+), the AI SDK's `streamText`/`useChat` machinery becomes worth the BYOK per-call-instantiation overhead. |
| Direct vendor SDKs | OpenRouter / Vercel AI Gateway | If the project later adds a genuine multi-key-pooling or model-routing need for the *service-key* path specifically — never for BYOK, where routing through a gateway undermines the "call the vendor directly with the user's own key" trust model. |
| `js-tiktoken` (pure JS) for local token estimation | `tiktoken` (WASM) | If estimation accuracy needs to exactly match OpenAI's own cookbook-reference implementation bit-for-bit and the `.wasm` asset overhead is acceptable — functionally near-identical, this project prefers the simpler deploy. |
| `js-tiktoken` uniformly | `@tokenlens/tokenizer` (multi-provider-aware) | If real usage shows the OpenAI-tokenizer-as-Anthropic-approximation is off by enough to matter for the BYOK usage-estimate display specifically (it is never used for actual billing, which stays exact via post-call usage). |
| Application-level AES-256-GCM (Node `crypto`) for BYOK keys | Supabase Vault | If centralized, project-wide secret auditing/rotation tooling across more than just AI keys becomes a priority, or the team wants to avoid holding a KEK in app config — Vault remains vendor-recommended and its API is promised stable through the pgsodium migration. |
| `mcp-handler` (Vercel) | Hand-rolled `@modelcontextprotocol/server` wiring | Only if `mcp-handler`'s opinions (stateless-only, no session IDs, its specific route-mounting conventions) actively conflict with a requirement discovered during MCP-phase implementation — not currently the case. |
| WorkOS AuthKit as the MCP OAuth authorization server | Clerk (`clerk.com`'s MCP server support) | Both are credible bolt-on OAuth-AS providers with documented MCP support; choose based on whichever better fits any *other* auth needs that surface during the MCP phase (e.g., if Clerk ends up used for something else in this milestone). |
| WorkOS AuthKit | Self-hosted `oidc-provider` | If there's a hard requirement to avoid any third-party identity-adjacent vendor, accepting the real cost of building/operating a CIMD-era OAuth 2.1 AS in-house — a multi-week increase in the MCP phase's scope. |

## What NOT to Use

| Avoid | Why | Use Instead |
|---|---|---|
| Vercel AI SDK (`ai` + `@ai-sdk/*`) as the multi-provider call layer for v1.1 | Optimized for streaming and shared-config provider instances, neither of which fits a non-streaming, per-user-runtime-key (BYOK) call pattern without erasing most of the abstraction's benefit; also means re-deriving the existing mock-based test pattern against a third-party interface shape | Direct `openai`/`@anthropic-ai/sdk` SDKs behind the project's own small adapter interface, mirroring `lib/ai/gemini.ts` |
| Custom OpenAI-compatible base URL / OpenRouter / any gateway in the BYOK path | Turns the server into an SSRF-prone arbitrary-outbound proxy and breaks the "user's own key talks directly to the vendor" trust model; already an explicit anti-feature per `FEATURES.md` | Three fixed providers (Gemini, OpenAI, Anthropic) with pinned SDK clients and pinned base URLs |
| Per-provider remote pre-call token counting (Anthropic's `count_tokens` endpoint, any hypothetical OpenAI equivalent) as a uniform cross-vendor strategy | Anthropic's endpoint is real but doubles request volume against the *user's own* BYOK rate limit for a non-billing estimate; OpenAI has no such endpoint at all | Local `js-tiktoken` estimate pre-call, exact provider-returned `usage` post-call for the actual debit |
| Writing BYOK-key ciphertext as zero-effort plaintext in a generic `settings` JSON column | Directly violates the roadmap's "저장한 키를 클라이언트나 로그로 반환하지 않는다" requirement and makes a later encryption retrofit a data migration, not a config change | Dedicated `byok_keys` table: `ciphertext` + `iv` + `auth_tag` + a **separate plaintext `masked_hint`** column |
| Old `@modelcontextprotocol/sdk` (1.x) package alongside `mcp-handler@2.x` | `mcp-handler` 2.x's peer dependency is `@modelcontextprotocol/server@^2.0.0`; mixing the old monolithic SDK package with the new split-package v2 SDK is explicitly called out in `mcp-handler`'s own migration notes as incompatible | `@modelcontextprotocol/server@^2.0.0` only |
| `mcp-handler` 1.x-era `/sse` HTTP+SSE transport patterns (and any accompanying Redis session store) copied from older MCP tutorials | Removed entirely in `mcp-handler` 2.x — the package is stateless Streamable-HTTP-only now; Redis is explicitly "no longer needed or used" | The single Streamable HTTP route `mcp-handler@2.x` mounts (any path — `/api/mcp` is convention, not required) |
| Treating `withMcpAuth` as a complete OAuth solution | It is a resource-server token *verifier*, not an authorization server — it has no concept of issuing tokens, PKCE exchange, or consent | A real external authorization server (WorkOS AuthKit or equivalent) issuing the tokens `withMcpAuth` verifies |
| Hand-building a from-scratch OAuth 2.1 + PKCE + CIMD authorization server for this milestone | Realistically a multi-week sub-project on its own, targeting a spec revision (2026-07-28, CIMD) that only recently stabilized; disproportionate to a milestone that also has to ship multi-provider + BYOK | A managed/bolt-on authorization server (WorkOS AuthKit, or Clerk as the credible alternative) purpose-built for MCP OAuth |

## Version Compatibility

| Package A | Compatible With | Notes |
|---|---|---|
| `openai@7.15.0` | Node 22/24 | OpenAI's Node version policy dropped Node 20 support as EOL as of 2026-04-30; verify the project's Vercel/Node runtime target is ≥22 before pinning. |
| `@anthropic-ai/sdk@0.125.0` | existing `zod@^4.4.3` (used only if leveraging its schema helpers, not required for basic calls) | No hard zod peer dependency for basic `messages.create`/`count_tokens` usage. |
| `mcp-handler@2.1.1` | `@modelcontextprotocol/server@^2.0.0` (required, non-optional peer), `next>=13.0.0` (optional peer, satisfied by installed `next@16.3.2`), `zod@^4.2.0` | Project's existing `zod@^4.4.3` already satisfies the `^4.2.0` floor — no bump needed. Do **not** install alongside `@modelcontextprotocol/sdk` (1.x). |
| `@workos-inc/authkit-nextjs` | Next.js App Router (current major, matches `next@16.3.2`) | Verify the exact peer range at install time — not independently confirmed against Next 16.3.x specifically during this research pass; flagged for a quick recheck at MCP-phase implementation start. |
| `js-tiktoken` | No native/WASM step, pure JS/TS — compatible with any Node runtime NovelScript already targets | Chosen over `tiktoken` (WASM) specifically to avoid `.wasm` bundling concerns on Vercel. |

## Sources

**Existing project artifacts read directly (authoritative for constraints):**
- `docs/ai-integration-roadmap.md` — v1.1 scope and completion criteria for both stages
- `.planning/research/FEATURES.md` — prior feature research this stack research builds on without duplicating
- `.planning/research/v1.0/STACK.md` — baseline stack and the two decisions (`ai` SDK choice, Vault-vs-AES-GCM) this document explicitly revisits
- `package.json`, `lib/ai/gemini.ts`, `lib/ai/cost.ts`, `lib/ai/chat.ts` — current single-vendor implementation shape and its DI/testability constraints
- `supabase/migrations/0001_init.sql` — confirms `pgcrypto` extension already enabled
- `mcpres/package/package.json`, `mcpres/package/README.md` — read directly to verify the vendored `mcp-handler` tarball's authenticity and current API shape (HIGH confidence: primary source, the package's own metadata and docs)

**Multi-provider SDKs and versions (HIGH confidence — live npm/vendor lookups, 2026-09-16):**
- [openai (npm)](https://www.npmjs.com/package/openai) — `7.15.0`; [openai-node Node version policy](https://github.com/openai/openai-node/blob/main/NODE_VERSION_POLICY.md) — Node 20 EOL 2026-04-30, Node 22/24 supported
- [@anthropic-ai/sdk (npm)](https://www.npmjs.com/package/@anthropic-ai/sdk) — `0.125.0`; count-tokens endpoint (`v1/messages/count_tokens`) referenced in [anthropic-sdk-typescript issue #593](https://github.com/anthropics/anthropic-sdk-typescript/issues/593) and [vercel/ai issue #5205](https://github.com/vercel/ai/issues/5205)
- [@ai-sdk/openai (npm)](https://www.npmjs.com/package/@ai-sdk/openai) `4.0.66`, [@ai-sdk/anthropic (npm)](https://www.npmjs.com/package/@ai-sdk/anthropic?activeTab=versions) `4.0.48` — checked to confirm current state of the alternative considered in Q1
- [Vercel AI Gateway — Authentication and BYOK](https://vercel.com/docs/ai-gateway/authentication-and-byok) and [AI Gateway API Keys](https://vercel.com/docs/ai-gateway/authentication-and-byok/api-keys) — confirms gateway-level BYOK exists but is a routing-priority mechanism, not a per-user-key call pattern

**Token counting (MEDIUM confidence — official cookbook + package docs, cross-checked):**
- [OpenAI Cookbook — How to count tokens with tiktoken](https://cookbook.openai.com/examples/how_to_count_tokens_with_tiktoken) — HIGH confidence, official source, confirms no remote OpenAI token-count endpoint
- [js-tiktoken (npm)](https://www.npmjs.com/package/js-tiktoken) / [tiktoken (npm)](https://www.npmjs.com/package/tiktoken) — HIGH confidence, package registry
- [Token Counting Explained: tiktoken, Anthropic, and Gemini Guide](https://www.propelcode.ai/blog/token-counting-tiktoken-anthropic-gemini-guide-2025) — MEDIUM confidence, single blog source, but consistent with official Anthropic/OpenAI docs on the approximate-vs-exact distinction
- [@tokenlens/tokenizer (npm)](https://www.npmjs.com/package/@tokenlens/tokenizer) — MEDIUM confidence, considered as an alternative

**BYOK encryption (MEDIUM confidence — official Supabase docs, judgment call clearly flagged as such above):**
- [Supabase Docs — Vault](https://supabase.com/docs/guides/database/vault) — HIGH confidence, official, current recommended-path statement
- [Supabase Docs — pgsodium (pending deprecation)](https://supabase.com/docs/guides/database/extensions/pgsodium) — HIGH confidence, official, confirms deprecation-cycle status and Vault-API-stability promise
- [Supabase Troubleshooting — Issues with rotating pgsodium and Vault root encryption keys](https://supabase.com/docs/guides/troubleshooting/issues-with-rotating-pgsodium-and-vault-root-encryption-keys-efeb47) — HIGH confidence, official, cited for the rotation-friction point

**MCP server implementation (HIGH confidence — read the vendored package's own README/package.json directly, cross-checked against the public repo and Vercel's changelog):**
- `mcpres/package/README.md`, `mcpres/package/package.json` (local, primary source)
- [vercel/mcp-handler (GitHub)](https://github.com/vercel/mcp-handler) and [mcp-handler (npm)](https://www.npmjs.com/package/mcp-handler)
- [Vercel Changelog — Latest MCP spec now supported in mcp-handler](https://vercel.com/changelog/latest-mcp-spec-now-supported-in-mcp-handler)
- [@modelcontextprotocol/server (npm)](https://www.npmjs.com/package/@modelcontextprotocol/server) — `2.0.0`, replaces `@modelcontextprotocol/sdk` 1.x

**MCP OAuth / authorization server landscape (MEDIUM confidence — this is the fastest-moving part of the ecosystem researched here; re-verify at MCP-phase implementation start):**
- [mcp-handler/docs/AUTHORIZATION.md (GitHub)](https://github.com/vercel/mcp-handler/blob/main/docs/AUTHORIZATION.md) — `withMcpAuth`/`protectedResourceHandler` are resource-server-only primitives
- [WorkOS — Secure auth for MCP servers](https://workos.com/mcp) and [WorkOS Docs — Model Context Protocol / AuthKit](https://workos.com/docs/authkit/mcp) — AuthKit positioned as a spec-compatible MCP OAuth authorization server, built on WorkOS Connect
- [@workos-inc/authkit-nextjs (npm)](https://www.npmjs.com/package/@workos-inc/authkit-nextjs) — Next.js integration package, PKCE + sealed OAuth state
- [Clerk — MCP Server Support for Next.js](https://clerk.com/changelog/2025-06-25-mcp-server-nextjs) and [Clerk Docs — Build an MCP server with Clerk](https://clerk.com/docs/nextjs/guides/ai/mcp/build-mcp-server) — credible alternative to WorkOS, not independently deep-dived in this pass
- [oidc-provider (npm)](https://www.npmjs.com/package/oidc-provider) — `9.12.2`, considered and deprioritized as a self-hosted option due to build/operate cost, not technical impossibility
- LOW confidence, unverified, explicitly flagged as such in Q5: a claim (from an aggregated web-search summary, not a primary source) that Vercel's serverless model makes `oidc-provider` outright infeasible there — this could not be traced to `oidc-provider`'s own documentation and should not be treated as settled

---
*Stack research for: NovelScript v1.1 — multi-provider AI, BYOK, subscription-AI MCP*
*Researched: 2026-09-16*
