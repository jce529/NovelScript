# Architecture Research

**Domain:** Multi-provider AI adapter layer + BYOK key custody + remote MCP server, added onto an existing single-Next.js-app/Supabase MVP (NovelScript v1.1)
**Researched:** 2026-09-16
**Confidence:** MEDIUM-HIGH
- HIGH on Next.js/Supabase platform facts (route handlers, RLS, Supabase Auth OAuth server) — verified against current official docs
- HIGH on provider usage/token-accounting shapes (OpenAI, Anthropic) — verified against official API references
- MEDIUM on the BYOK encryption custody recommendation (Supabase Vault) — the interface is documented and stable, but this project hasn't used it yet, so treat as a strong recommendation to validate in Phase implementation, not a settled fact
- MEDIUM on MCP-on-Supabase-Auth specifics — official Supabase docs exist and are detailed, but the feature is newer than the rest of the stack and worth a smoke test before committing

## Standard Architecture

### System Overview

v1.1 does not change the system's shape from `.planning/research/v1.0/ARCHITECTURE.md` — it is still one Next.js app + Supabase, no new deployable. It adds three new internal seams to the existing `lib/ai/` module and one new public surface (the MCP route). Nothing here revisits the v1.0 "one app, route groups, not subdomains/microservices" decision; the same reasoning (single deploy, single session, single ledger transaction boundary) applies even harder here because BYOK and MCP both need to reuse the *same* RLS/ownership model as everything else, not a second one.

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│                       Next.js App (single deployment, unchanged)                    │
│                                                                                        │
│  ┌─────────────────────────┐        ┌──────────────────────────────────────────┐    │
│  │ Studio (existing)        │        │ Account Settings (NEW)                    │    │
│  │ AiPanel.tsx              │        │ /studio/settings/ai-providers             │    │
│  │ - provider/model dropdown│        │ - add/validate/mask/delete BYOK keys      │    │
│  │   (NEW, was modelTier    │        │ - default provider+model                  │    │
│  │   only)                  │        │ - BYOK usage view (calls/tokens/est. cost)│    │
│  └────────────┬─────────────┘        └───────────────┬────────────────────────────┘    │
│               │ server action                        │ server action                   │
│  ┌────────────▼────────────────────────────────────────▼─────────────────────────┐    │
│  │                    lib/ai/ (existing module, extended)                         │    │
│  │                                                                                  │    │
│  │  chat.ts (existing, refactored)         byok.ts (NEW)                          │    │
│  │   - orchestrates one turn                - encrypt/decrypt/mask key ops         │    │
│  │   - branches service-key vs BYOK          - validate-on-save (models-list call) │    │
│  │                                                                                  │    │
│  │  providers/ (NEW — replaces gemini.ts as the only vendor file)                 │    │
│  │   gemini.ts | openai.ts | anthropic.ts    ← each implements ProviderClient      │    │
│  │   registry.ts  ← ProviderId → factory(apiKey) → ProviderClient                  │    │
│  │                                                                                  │    │
│  │  cost.ts (existing, extended)             usage.ts (NEW)                       │    │
│  │   - service-key output cap, unchanged      - writes ai_usage rows (both modes) │    │
│  │   - per-provider pricing table (NEW)                                           │    │
│  └───────────────────────────────┬──────────────────────────────────────────────┘    │
│                                   │                                                     │
│  ┌────────────────────────────────▼───────────────────────────────────────────────┐    │
│  │        app/mcp/[transport]/route.ts (NEW — 2nd stage, same Next.js app)         │    │
│  │        mcp-handler (Vercel) wraps: OAuth-protected tool dispatch                │    │
│  │        tools: search_works, list_chapters, get_chapter, search_kb,             │    │
│  │                get_kb_document, get_writing_context, save_draft,               │    │
│  │                propose_kb_document                                              │    │
│  └───────────────────────────────┬──────────────────────────────────────────────────┘    │
└────────────────────────────────────┼─────────────────────────────────────────────────────┘
                                     │
                    ┌────────────────┼───────────────────────────────┐
                    │                │                                │
             ┌──────▼──────┐  ┌──────▼───────────────────┐   ┌───────▼────────────────┐
             │ Gemini /    │  │      Supabase             │   │  Claude / ChatGPT       │
             │ OpenAI /    │  │  - Postgres: wallets,     │   │  custom connector        │
             │ Anthropic   │  │    ledger_entries (money  │   │  (calls the MCP route    │
             │ (platform   │  │    only, unchanged),      │   │  over HTTPS with a       │
             │ key OR the  │  │    ai_usage (NEW),        │   │  Supabase-issued OAuth   │
             │ user's own  │  │    byok_keys (NEW)        │   │  access token)           │
             │ key)        │  │  - Auth: existing session │   │                          │
             │             │  │    cookies AND (NEW) the  │   │                          │
             │             │  │    OAuth 2.1 authorization│   │                          │
             │             │  │    server for MCP grants  │   │                          │
             └─────────────┘  └───────────────────────────┘   └──────────────────────────┘
```

**Key placement decisions carried through this document:**
1. The provider adapter layer, BYOK storage, and usage accounting live inside the *existing* `lib/ai/` module — no new service, no new deployment.
2. The MCP server is a *route inside the same Next.js app* (`app/mcp/[transport]/route.ts`), not a separate service — see Pattern 6 for why, and the one condition under which that would change.
3. Supabase Auth itself becomes the OAuth 2.1 authorization server for MCP grants — NovelScript does not build its own authorization-server surface (this reverses the FEATURES.md open assumption that an AS would need to be built from scratch; verified against current Supabase docs, see Pattern 6).

### Component Responsibilities

| Component | Responsibility | Status |
|-----------|----------------|--------|
| `lib/ai/providers/*.ts` | One file per vendor, each implementing a shared `ProviderClient` interface (generate + usage reporting). Vendor SDK details never leak past this file. | NEW |
| `lib/ai/providers/registry.ts` | Maps `(providerId, modelId)` → capability record (context window, max output, pricing) and constructs the right client with either the platform key or a decrypted BYOK key. | NEW |
| `lib/ai/chat.ts` | Orchestrates one chat turn: resolve mentions → compose prompt (unchanged, `prompt.ts`) → pick client via registry → branch service-key cap vs BYOK no-cap → call → parse `[REPLY]/[DRAFT]/[DOCUMENT]` (unchanged) → debit or log-only. | REFACTORED |
| `lib/ai/cost.ts` | Service-key-only: wallet-balance → output-token cap, and now a per-provider/per-model pricing table (was Gemini-only). Never called on the BYOK path. | EXTENDED |
| `lib/ai/byok.ts` | Encrypt-on-save, decrypt-at-call-time (server-only), masked-hint derivation, validate-on-save via the provider's models-list call. The only file allowed to see plaintext user keys. | NEW |
| `lib/ai/usage.ts` | Writes one `ai_usage` row per call (service-key or BYOK), independent of the wallet ledger. Source of the writer-facing usage view and of any future abuse-rate check. | NEW |
| Account Settings UI (`/studio/settings/ai-providers`) | BYOK add/validate/mask/delete, default provider+model, BYOK usage view. Never the composing surface (AiPanel), per the FEATURES.md-established convention. | NEW |
| AiPanel (`ai-panel/AiPanel.tsx`) | Per-call provider/model dropdown with a `BYOK`/`서비스 키` badge per model; unchanged conversation UI otherwise. | EXTENDED |
| MCP route (`app/mcp/[transport]/route.ts`) | Public HTTPS MCP endpoint. Validates the Supabase-issued OAuth token per request, scopes every tool call to that user via the same Postgres RLS the rest of the app uses. | NEW (2nd stage) |
| Studio review surface (drafts/proposals queue) | Holds MCP-originated `save_draft`/`propose_kb_document` objects for the writer to accept/reject — does not exist yet, is real scope. | NEW (2nd stage) |
| Supabase Auth OAuth 2.1 server | Issues/validates the OAuth tokens MCP clients present; existing Supabase Auth *is* this server (no separate identity provider). | NEW CONFIG (2nd stage) |

## Recommended Project Structure

```
lib/ai/
├── prompt.ts                 # unchanged — system/user content assembly, response protocol
├── mentions.ts                # unchanged
├── chat.ts                    # refactored — orchestration only, no vendor-specific code
├── cost.ts                    # extended — per-provider pricing table, service-key cap math only
├── usage.ts                   # NEW — ai_usage row writer + BYOK usage aggregation queries
├── byok.ts                    # NEW — encrypt/decrypt/mask/validate, server-only, never exported to client bundles
└── providers/
    ├── types.ts                # NEW — ProviderClient, GenerateParams, GenerateResult, UsageReport, CapabilityRecord
    ├── registry.ts             # NEW — providerId+modelId -> capability + client factory
    ├── gemini.ts                # MOVED from lib/ai/gemini.ts, adapted to ProviderClient
    ├── openai.ts                # NEW
    └── anthropic.ts             # NEW

app/studio/settings/ai-providers/
├── page.tsx                    # NEW — settings route, RSC list + forms
├── actions.ts                   # NEW — addKeyAction/validateKeyAction/deleteKeyAction/setDefaultAction
└── ByokKeyForm.tsx               # NEW — client component, add/replace form

app/studio/[workId]/chapters/[chapterId]/
├── actions.ts                   # extended — chatAction takes providerId+modelId, not just modelTier
└── ai-panel/
    ├── AiPanel.tsx               # extended — provider/model dropdown + BYOK badge
    └── ProviderModelPicker.tsx    # NEW

app/mcp/[transport]/route.ts     # NEW (2nd stage) — mcp-handler entry point, all tools registered here
lib/mcp/
├── tools.ts                     # NEW (2nd stage) — tool definitions, thin wrappers over existing lib/kb, lib/chapters, lib/ai/prompt
├── auth.ts                      # NEW (2nd stage) — Supabase-issued-token verification helper
└── drafts.ts                    # NEW (2nd stage) — save_draft/propose_kb_document persistence + review-queue reads

supabase/migrations/
├── 0006_ai_providers.sql        # NEW — byok_keys, ai_usage, user_ai_preferences
└── 0007_mcp.sql                 # NEW (2nd stage) — mcp_drafts / mcp_proposals review-queue tables (grant tables are Supabase-managed, not app schema)
```

### Structure Rationale

- **`lib/ai/providers/` is the only place vendor SDKs are imported**, mirroring the v1.0 rule that `lib/ai/gemini.ts` was the sole vendor-SDK import site. Nothing outside this folder ever imports `@google/genai`, `openai`, or `@anthropic-ai/sdk` directly — this is what makes "which vendor is this account using today" a one-file answer.
- **`byok.ts` is a hard trust boundary, kept as its own file** even though it's small: it is the only code allowed to hold decrypted plaintext in memory, however briefly. Isolating it makes an eventual security review a single-file read, and prevents plaintext from leaking into `chat.ts`'s already-large orchestration logic by accident.
- **`usage.ts` is separate from `cost.ts`** on purpose: `cost.ts` is service-key-only pricing/cap math (money the platform owes); `usage.ts` is a record of what happened, written on every call regardless of who paid. Conflating them was the exact anti-pattern FEATURES.md flagged (BYOK rows must never land in `wallet_ledger`, and by the same logic must not be computed by the same module that computes wallet debits).
- **MCP lives in `app/mcp/` + `lib/mcp/`, its own top-level module**, not folded into `lib/ai/`. It shares `lib/ai/prompt.ts`'s composition functions (imported, not forked) but is otherwise a distinct concern: `lib/ai/` is "NovelScript calls an LLM," `lib/mcp/` is "an LLM calls NovelScript." Keeping them in separate folders makes that direction explicit in the file tree, which matters because their trust models are opposite (see Pattern 6).

## Architectural Patterns

### Pattern 1: Provider adapter interface (replacing GeminiClient)

**What:** Generalize `GeminiClient` into a `ProviderClient` interface that every vendor file implements, but drop `countTokens` as a required *remote* method — it becomes a local estimate function instead, called before the API request, with the provider's own post-call `usage` object as the source of truth for billing.

```typescript
// lib/ai/providers/types.ts
export type ProviderId = 'gemini' | 'openai' | 'anthropic';

export interface GenerateParams {
  model: string;
  systemInstruction: string;
  contents: string;          // same flattened-string contract chat.ts already uses
  maxOutputTokens: number;
  temperature?: number;
}

export interface UsageReport {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface GenerateResult {
  text: string;
  finishReason: 'stop' | 'max_tokens' | 'other';   // normalized across vendors
  usage: UsageReport;
}

export interface ProviderClient {
  generateContent(params: GenerateParams): Promise<GenerateResult>;
  /** Local, synchronous, no network call. Replaces Gemini's remote countTokens
   * as the PRE-call estimate used only for computeMaxOutputTokens' cap math.
   * The real, billed number always comes from GenerateResult.usage post-call. */
  estimateInputTokens(systemInstruction: string, contents: string): number;
  listModels(): Promise<{ id: string; label: string }[]>;  // doubles as BYOK "test connection"
}
```

Why `estimateInputTokens` is local and synchronous, per provider: Gemini has a cheap remote `countTokens` call, Anthropic has a documented `POST /v1/messages/count_tokens` endpoint (own rate limits, and current guidance is Claude 4.7+ uses a newer tokenizer producing materially different counts than older models — HIGH confidence, [Claude token counting docs](https://platform.claude.com/docs/en/build-with-claude/token-counting)), and **OpenAI has no equivalent endpoint at all** — the Chat Completions/Responses APIs only return `usage` *after* the call ([OpenAI usage object reference](https://help.openai.com/en/articles/7127987-what-is-the-difference-between-prompt-tokens-and-completion-tokens)). A remote-call-shaped interface can't be honestly implemented for all three; a local heuristic (char-count/4 or a bundled BPE-adjacent estimator) that only feeds the *pre-call cap*, reconciled against the *real* post-call `usage` for billing, is the only design that doesn't quietly lie for two of three vendors. This matches FEATURES.md's anti-feature call ("Pre-call countTokens parity") and turns it into a concrete interface shape.

**Vendor usage-shape normalization** (verified against official references):
| Vendor | Field names in the raw response | Confidence |
|---|---|---|
| Gemini | `usageMetadata.promptTokenCount` / `.candidatesTokenCount` / `.totalTokenCount` | HIGH (existing code) |
| OpenAI (Chat Completions) | `usage.prompt_tokens` / `.completion_tokens` / `.total_tokens` | HIGH — [OpenAI Help Center](https://help.openai.com/en/articles/7127987-what-is-the-difference-between-prompt-tokens-and-completion-tokens) |
| OpenAI (Responses API) | `usage.input_tokens` / `.output_tokens` / `.total_tokens` — different field names from Chat Completions for the same concepts | HIGH — same source; note this if the Responses API is chosen over Chat Completions |
| Anthropic (Messages API) | `usage.input_tokens` / `.output_tokens` (no separate total; sum them) | HIGH — [Claude API reference](https://platform.claude.com/docs/en/api/messages/count_tokens) |

Each vendor file's `generateContent` is responsible for mapping its native shape into the normalized `UsageReport`; this mapping is the actual "adapter" work, not the HTTP call itself.

**When to use:** All AI generation call sites (`chat.ts` today; any future generation entry point).
**Trade-offs:** The pre-call cap becomes approximate for OpenAI/Anthropic (it already effectively is for Gemini too, since `computeMaxOutputTokens` reserves for input cost using an estimate that predates the exact system-prompt assembly in some call orders). This is acceptable because `computeDebitAmount` — the thing that actually charges the wallet — already uses only post-call `usage`, never the pre-call estimate; nothing about billing correctness regresses.

### Pattern 2: Service-key vs BYOK call-path branching

**What:** Branch *inside* `chat.ts`, at the point where `computeMaxOutputTokens` currently runs, on whether the resolved `ProviderClient` was constructed with the platform's key or the user's decrypted key — not on a separate "BYOK mode" flag threaded through unrelated code.

```typescript
// lib/ai/chat.ts (shape, not full code)
const resolved = await resolveProviderClient({ ownerId, providerId, modelId }); // registry.ts
// resolved: { client: ProviderClient, keySource: 'platform' | 'byok', model: string }

let maxOutputTokens: number;
if (resolved.keySource === 'platform') {
  const inputTokenCount = resolved.client.estimateInputTokens(systemInstruction, contents);
  maxOutputTokens = computeMaxOutputTokens({ walletBalance, providerId, modelId, inputTokenCount });
  if (maxOutputTokens <= 0) {
    return { ok: false, error: '보유 토큰을 모두 사용해서 대화할 수 없어요.', wasCapped: true, remainingBalance: walletBalance };
  }
} else {
  // BYOK: no wallet balance to cap against. The ONLY ceiling is the fixed
  // per-request ceiling — never zero, never balance-derived.
  maxOutputTokens = BYOK_MAX_OUTPUT_TOKENS; // may be raised above PER_REQUEST_MAX_OUTPUT_TOKENS — an open product question, not an architecture one
}

const result = await resolved.client.generateContent({ model: resolved.model, systemInstruction, contents, maxOutputTokens });

if (resolved.keySource === 'platform') {
  const debitAmount = computeDebitAmount({ providerId, modelId, usage: result.usage });
  await applyIdempotentWalletDebit({ ownerId, debitAmount, chapterId, idempotencyKey }); // Pattern 5
} else {
  await recordByokUsage({ ownerId, providerId, modelId, usage: result.usage }); // ai_usage row, zero wallet touch
}
```

**Why the branch point is here, not earlier:** FEATURES.md's dependency notes call out the real trap directly — "the BYOK path is not the service path with the cap set to zero." `chat.ts` today returns a hard error when `maxOutputTokens <= 0`; that branch is service-key-specific and must be structurally unreachable for BYOK, not merely avoided by luck of the numbers. Putting the `if (keySource === 'platform')` guard around the *entire* cap-computation block (not just the threshold check) makes that structural, not incidental — a BYOK call literally never executes `computeMaxOutputTokens` or touches `walletBalance`.
**Trade-offs:** Two code paths inside one function is slightly more branching than a single unified path, but a single unified path is what produces the exact bug class this pattern exists to prevent (an empty-wallet BYOK user silently blocked). Keep the branch narrow (cap computation + debit/log call) and let everything else — mention resolution, prompt composition, response parsing — stay shared and unbranched.

### Pattern 3: BYOK key storage and decryption trust boundary

**What:** Store each user's key as ciphertext via **Supabase Vault** (`vault.create_secret` / `vault.decrypted_secrets`), not a hand-rolled app-level AES-GCM column. This resolves PROJECT.md's Pending decision.

**Why Vault over app-level AES-256-GCM, for this project specifically:**
- Vault is a thin, stable API layer over `pgsodium`; Supabase's own guidance is explicit that pgsodium itself is being phased out as a *standalone* extension but "the Vault API remains stable... Supabase will migrate Vault's internals without changing the interface you use" ([Supabase Vault docs](https://supabase.com/docs/guides/database/vault), MEDIUM-HIGH confidence, doc last touched 2026-09-11).
- Root-key custody (the KEK-equivalent) is Supabase's operational responsibility, not NovelScript's. The generic envelope-encryption guidance (KEK in an HSM/KMS, DEK per resource, [Encryption Consulting](https://www.encryptionconsulting.com/envelope-encryption-kek-vs-dek-and-key-wrapping/), [WorkOS — "you probably shouldn't implement it yourself"](https://workos.com/blog/envelope-encryption-explained)) converges on exactly this: don't hand-roll KEK storage/rotation at solo-founder scale when a managed equivalent exists in a system you already depend on.
- It keeps the trust boundary in one place: `vault.decrypted_secrets` is only queryable from a `SECURITY DEFINER` Postgres function, callable only by the service-role client — the same shape as `apply_wallet_delta` already uses for wallet mutations. No new operational pattern to learn.
- Community discussion on app-level API-key encryption ([GitHub supabase/discussions#22583](https://github.com/orgs/supabase/discussions/22583)) converges on the same recommendation: use Vault rather than a bespoke pgcrypto/AES column, specifically for this exact use case (storing third-party API keys per user).

**Schema:**
```sql
create table byok_keys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  provider text not null check (provider in ('openai','anthropic')), -- Gemini stays platform-key-only unless a user asks
  secret_id uuid not null, -- vault.secrets.id — the ciphertext lives in Vault, not here
  masked_hint text not null, -- 'sk-...a3f9' — plaintext, safe to render, NEVER re-derived from the secret
  last_validated_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  unique (owner_id, provider) -- FEATURES.md anti-feature: one key per user per provider
);
alter table byok_keys enable row level security;
create policy byok_keys_select_own on byok_keys for select using (owner_id = auth.uid());
-- No insert/update/delete policy for anon/authenticated — all writes go through a
-- SECURITY DEFINER function (below), same shape as apply_wallet_delta.
revoke all on byok_keys from anon, authenticated;
grant select on byok_keys to authenticated;
```

**The trust boundary — where decryption happens:** A `SECURITY DEFINER` Postgres function (`get_byok_secret(p_owner_id uuid, p_provider text) returns text`), called ONLY from server-side code using the **service-role client**, never a route handler that trusts a client-supplied `ownerId`. Concretely: `byok.ts`'s decrypt function must take its `ownerId` from the authenticated session (`supabase.auth.getUser()` on the request, exactly like `chat.ts`'s existing `input.ownerId` contract), the same rule the v1.0 architecture doc already establishes for `AI_GENERATION_REFERENCE_TYPE` debits. Decryption happens exactly once per call, inside `byok.ts`, immediately before constructing the `ProviderClient` — the decrypted string is never logged, never returned from a server action, and goes out of scope as soon as the vendor SDK client is constructed with it.
**Masked hint is a separate plaintext column, computed once at save time** (`provider + '...' + last4`), never re-derived from a decrypt — this is what makes rendering the settings list a zero-decrypt operation, matching FEATURES.md's stated schema requirement directly.
**Trade-offs:** Vault ties BYOK key custody to Supabase as a platform (already true for everything else in this app, so not a new dependency); the alternative (app-level AES-GCM with an env-var KEK) is more portable but pushes KEK rotation and secure-memory handling onto the team with zero current operational practice for it. Given solo-founder scale and existing Supabase dependence, Vault is the lower-risk default; revisit only if multi-cloud portability becomes a real requirement.

### Pattern 4: `ai_usage` table separate from `wallet_ledger`

**What:** One new append-only table, written on every AI call (service-key or BYOK), independent of `ledger_entries`.

```sql
create table ai_usage (
  id bigint generated always as identity primary key,
  owner_id uuid not null references profiles(id) on delete cascade,
  provider text not null,
  model text not null,
  key_source text not null check (key_source in ('platform','byok')),
  input_tokens bigint not null,
  output_tokens bigint not null,
  estimated_cost_usd numeric(10,6), -- for BYOK, purely informational — no wallet effect
  wallet_debit_amount bigint, -- null for BYOK rows; the actual debit for platform rows
  chapter_id uuid, -- nullable, matches chat.ts's existing `reason: chapter:${chapterId}` pattern
  created_at timestamptz not null default now()
);
alter table ai_usage enable row level security;
create policy ai_usage_select_own on ai_usage for select using (owner_id = auth.uid());
revoke all on ai_usage from anon, authenticated;
grant select on ai_usage to authenticated;
```
**Why separate, not zero-delta rows in `ledger_entries`:** `ledger_entries` is money-only and feeds the pending 작가 정산 (writer settlement) reconciliation track from v1.0 Phase 6 — a table that's supposed to sum to real KRW cannot also contain BYOK rows that mean "this happened but cost the platform nothing." This is the same reasoning already captured in FEATURES.md's anti-feature table; the schema above is the concrete implementation of that call.
**When to use:** Every `generateContent` call, both branches of Pattern 2 — this table is written unconditionally, `wallet_debit_amount`/`estimated_cost_usd` are simply null on whichever side doesn't apply.

### Pattern 5: Idempotent AI debit (reuse commerce's idempotencyKey pattern)

**What:** `chat.ts` today calls `apply_wallet_delta` with `p_reference_id: crypto.randomUUID()` generated fresh per call — the `unique (wallet_id, reference_type, reference_id)` constraint on `ledger_entries` (see `0001_init.sql`) can only dedupe if the *same* reference_id is presented on a retry, and a fresh UUID guarantees it never is. `lib/commerce/actions.ts` already solved this correctly: it accepts a client-supplied `idempotencyKey: z.string().uuid()`, generated once per logical action attempt (not per HTTP request) and re-sent unchanged on retry.

**Fix, mirroring the commerce shape:**
```typescript
// app/studio/[workId]/chapters/[chapterId]/actions.ts — chatAction
const chatInputSchema = z.object({
  // ...existing fields...
  idempotencyKey: z.string().uuid(), // NEW — generated client-side once per turn, resent on retry
});
```
```typescript
// lib/ai/chat.ts — debit call site
const { data: newBalance, error } = await admin.rpc('apply_wallet_delta', {
  p_wallet_id: input.ownerId,
  p_delta: -debitAmount,
  p_reference_type: AI_GENERATION_REFERENCE_TYPE,
  p_reference_id: input.idempotencyKey, // was crypto.randomUUID() — the actual bug
  p_reason: `chapter:${input.chapterId}`,
});
```
The client (`AiPanel.tsx`) generates one `idempotencyKey` per user-submitted turn (e.g., with `crypto.randomUUID()` client-side, exactly analogous to how the purchase flow generates its key before calling `createPurchaseOrder`) and must resend the *same* key if it retries that same turn (network error, timeout) — a new turn (new user message) always gets a new key.
**Must land before any 429 retry/backoff logic**, per FEATURES.md's explicit sequencing note: adding retry-with-backoff before fixing idempotency means the second attempt debits again. This is a small, mechanical change with no schema migration (the constraint already exists) — it belongs early in the build order specifically because everything downstream (BYOK's own retry policy, the four-class error UX) assumes debits are already safe to retry.
**Trade-offs:** None material — this is a pure correctness fix reusing an already-proven pattern in the same codebase.

### Pattern 6: Remote MCP server placement + OAuth boundary

**What:** Host the MCP server as a route inside the existing Next.js app, using Vercel's official `mcp-handler` package, and use **Supabase Auth's own OAuth 2.1 authorization server** feature for the OAuth 2.1 + PKCE flow — do not stand up a separate authorization-server codebase.

**Placement — same app, not a separate service:**
`mcp-handler` v2.0.0 (Vercel, official) "does not inspect the request pathname, so you can place this handler at any framework route," supports the 2026-07-28 MCP spec natively with a stateless-Streamable-HTTP fallback for older clients, and requires no Redis/session store ([Vercel changelog](https://vercel.com/changelog/latest-mcp-spec-now-supported-in-mcp-handler), [vercel/mcp-handler](https://github.com/vercel/mcp-handler), HIGH confidence — official first-party source). This directly satisfies the roadmap's "public HTTPS endpoint" requirement without a second deployment: `app/mcp/[transport]/route.ts` in the same repo, same domain, same Vercel project. Keep it in the same app **specifically because** the tools need the same RLS-scoped Postgres access every other server action already has — a separate service would need its own service-role credential distribution and its own copy of the ownership-check logic, which is exactly the kind of "second source of truth" FEATURES.md's dependency notes warn against for the picker/validation split.

**Authorization server — reuse Supabase Auth, do not build one:**
Supabase Auth has a documented OAuth 2.1 Server feature built specifically for this scenario: "use your Supabase project as the auth provider for AI agents and LLM tools that support MCP" ([Supabase — OAuth 2.1 Server docs](https://supabase.com/docs/guides/auth/oauth-server), [Supabase — MCP Authentication docs](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication), MEDIUM-HIGH confidence — official docs, feature is newer than the rest of the stack, worth a smoke test in Phase implementation before committing). Concretely:
- Supabase exposes discovery at `https://<project-ref>.supabase.co/.well-known/oauth-authorization-server/auth/v1` — the MCP client fetches this automatically per the MCP spec's own auth-discovery convention; NovelScript does not write this endpoint.
- The MCP server (`app/mcp/[transport]/route.ts`) points its resource-server config at `https://<project-ref>.supabase.co/auth/v1` and validates each incoming request's bearer token against Supabase, using `@supabase/server`'s `withSupabase({ auth: 'user' })`-style middleware — this hands the tool implementation a Postgres client **already scoped to the authenticated user's `auth.uid()`**.
- **RLS applies automatically and unmodified**: because the resulting client authenticates as the real Supabase user (not a service-role client with manual filtering), every existing RLS policy — the same ones gating `works`, `chapters`, `kb_nodes` today — applies to MCP tool calls with zero new policy code. This is the direct answer to "how does MCP tool permission line up with the existing ownership model": it doesn't need to line up separately, it *is* the same model, enforced by the same database layer.
- Dynamic client registration can be enabled so Claude/ChatGPT self-register as OAuth clients on first connect, matching the "no separate per-client manual setup" expectation custom-connector users have.
- This reverses an assumption in FEATURES.md's dependency graph ("OAuth Authorization Surface... NovelScript does not have today") — it does now, as a Supabase Auth feature, not custom code. The remaining v1.1-specific work is thin: enabling the feature, wiring `mcp-handler`'s auth config to it, and building the connect/disconnect UI (which reads Supabase's own grant/session records, not a bespoke token table).

**Where write tools still need care despite RLS reuse:** RLS answers "can this user's token see/touch this row at all," not "should an AI acting on this user's behalf be allowed to write here without review." That second question is Pattern 7's job, not an auth concern.

**Trade-offs:** Coupling MCP auth to Supabase Auth's OAuth server is a newer, less battle-tested surface than the rest of the stack (Supabase's own docs make no explicit GA/beta claim as of this research pass) — budget time in the MCP phase to smoke-test the discovery/registration/token-exchange flow against a real Claude custom connector before building tools on top of it. If it proves unworkable, the fallback is a small custom authorization-server shim (Clerk's published pattern, [Clerk MCP guide](https://clerk.com/docs/nextjs/guides/development/mcp/build-mcp-server), is the closest analog if a from-scratch AS is ever needed) — but that fallback should only be reached after the Supabase-native path is actually tried and found lacking, not assumed upfront.

### Pattern 7: MCP write tools reusing the draft/proposal model

**What:** `save_draft` and `propose_kb_document` are the only write tools, and both create a new row in a review queue — never an in-place `UPDATE` on `chapters.content` or an existing `kb_nodes.content`. This is a direct structural port of the `[REPLY]/[DRAFT]/[DOCUMENT]` protocol already in `lib/ai/prompt.ts`/`lib/ai/chat.ts`: that protocol already treats "AI-proposed content" as a distinct, reviewable object separate from committed 본문/설정 — MCP write tools produce the *same kind of object*, just originating from an external client instead of the in-app chat.

```sql
-- supabase/migrations/0007_mcp.sql (sketch)
create table mcp_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  chapter_id uuid not null,
  content text not null,
  source_client text not null, -- 'claude' | 'chatgpt' | ... — provenance, FEATURES.md differentiator
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now()
);
create table mcp_kb_proposals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  work_id uuid not null references works(id),
  category text not null,
  name text not null,
  content text not null,
  source_client text not null,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now()
);
```
Both tables enforce RLS on `owner_id = auth.uid()` exactly like every other user-owned table; the MCP tool implementation inserts via the RLS-scoped client from Pattern 6, so a tool call can only ever create rows under the calling user's own `owner_id` — there is no code path where a `write` tool call can target another user's chapter, because the insert's `owner_id`/`chapter_id` ownership is checked by the same RLS/FK constraints that already protect direct app writes.
**Why no `update_chapter_body` tool exists at all, structurally:** The MCP spec's own tool-annotation guidance states annotations like `destructiveHint` are *hints*, not enforcement — "the host may auto-approve" regardless ([MCP blog — tool annotations](https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/), HIGH confidence, official source). Given that, the only reliable safety mechanism is removing the capability entirely rather than annotating it and trusting every client to respect the hint. This is already NovelScript's stated decision (PROJECT.md, roadmap); this pattern is how it's enforced at the schema/tool level rather than left as a policy statement.
**Studio review surface:** A queue view (new UI, not yet built) lists `mcp_drafts`/`mcp_kb_proposals` with `status = 'pending'`, showing `source_client` and `created_at` as provenance, with accept (copies `content` into the real chapter/KB flow, exactly like accepting an in-app `[DRAFT]`/`[DOCUMENT]`) and reject actions. This reuses the acceptance *logic* the in-app chat panel already has (inserting a draft into 본문, or creating a KB node from a proposal) — the queue is new UI wiring, not new business logic.
**Tool annotations:** every read tool gets `readOnlyHint: true`; `save_draft`/`propose_kb_document` get `destructiveHint: false, idempotentHint: false` — cheap metadata, materially reduces needless client-side confirmation prompts on the read half while being honest that the write half still creates something new each call.

## Data Flow

### Key Data Flows

1. **Service-key generation (existing flow, adapted):** AiPanel turn → `chatAction` (adds `providerId`, `modelId`, `idempotencyKey` to the existing payload) → `chat.ts` resolves mentions/prompt (unchanged) → `registry.resolveProviderClient({ providerId, modelId, keySource: 'platform' })` → `estimateInputTokens` → `computeMaxOutputTokens` (Pattern 2, platform branch) → `client.generateContent` → `computeDebitAmount` from real `usage` → `apply_wallet_delta` with `p_reference_id = idempotencyKey` (Pattern 5) → `ai_usage` row written (Pattern 4) → parsed `[REPLY]/[DRAFT]/[DOCUMENT]` returned, unchanged shape.
2. **BYOK generation:** Same entry point, `keySource` resolves to `'byok'` because the user has a saved key for the chosen provider → `byok.ts` decrypts via the Vault-backed `get_byok_secret` function, scoped to the authenticated `ownerId` → `registry` constructs a `ProviderClient` with the decrypted key (never persisted past this call) → Pattern 2's BYOK branch (fixed ceiling, no wallet read) → `client.generateContent` → `ai_usage` row with `key_source='byok'`, `wallet_debit_amount = null` → same parse/return shape as service-key, so the AiPanel UI code downstream is unaffected by which path ran.
3. **BYOK key onboarding:** Settings page → `addKeyAction({ provider, rawKey })` → server validates via `client.listModels()` (the "test connection" call, zero token cost) → on success, `byok.ts` encrypts (`vault.create_secret`) and writes `byok_keys` row with `masked_hint` computed once → on failure, no row is written, inline error shown (matches the four-class error taxonomy from FEATURES.md — invalid key surfaces here, before any generation call ever happens).
4. **MCP read + context bundle:** Claude custom connector → OAuth token (Supabase-issued) presented to `app/mcp/[transport]/route.ts` → `mcp-handler` validates against Supabase Auth → RLS-scoped Postgres client constructed for that `auth.uid()` → tool call (e.g. `get_writing_context`) → `lib/mcp/tools.ts` calls the *same* `getMentionedNodesContent`/`composeSystemInstruction`/`assembleUserContent` functions `chat.ts` already uses → returns a mention-shaped bundle → the external AI generates prose in its own session (no NovelScript-side generation call, no wallet/BYOK involvement at all for this step).
5. **MCP write-back:** External AI calls `save_draft({ chapterId, content })` → RLS confirms `chapter_id` belongs to the calling user's own work → insert into `mcp_drafts` with `status='pending'`, `source_client` from the connector's registered client id → writer opens the studio review queue → accepts → content flows into the chapter through the same acceptance path the in-app `[DRAFT]` uses → chapter body is never touched until this explicit accept step.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Beta (current target) | Everything above, as described. `byok_keys`/`ai_usage` are small tables, no partitioning needed. MCP route runs as a normal Node.js Vercel function; `mcp-handler`'s stateless design means no session-affinity concern even with Vercel's multi-instance routing. |
| Low thousands of users, multiple providers heavily used | Watch the `registry.ts` client-construction cost — constructing a fresh vendor SDK client (and a fresh Vault decrypt) on every BYOK call is fine at this scale but is the first thing to cache (e.g., a short-TTL in-memory cache of decrypted-key-derived clients, scoped per request/invocation, never persisted across requests) if per-call latency becomes visible. |
| MCP usage grows (many connected external AI sessions) | The grant/token-validation call to Supabase Auth on every MCP tool invocation is the new per-request cost this milestone introduces outside the existing app; if it becomes a bottleneck, Supabase's own JWKS-based validation path (verify locally against Supabase's public keys rather than round-tripping to the introspection endpoint) is the standard mitigation — confirm this is what `@supabase/server`'s middleware already does before adding a custom cache layer. |
| Well beyond MVP | If provider count grows past 3 or BYOK usage volume genuinely stresses the wallet-adjacent tables, revisit the "3 fixed providers, no custom endpoints" anti-feature boundary — but per FEATURES.md, this is explicitly out of scope until real demand appears. |

## Anti-Patterns

### Anti-Pattern 1: A generic "AI mode" flag threaded through unrelated code

**What people do:** Add a global `isByok: boolean` or `mode: 'platform' | 'byok'` that gets passed down through many layers (server action → `chat.ts` → `cost.ts` → UI) as a parallel parameter next to everything else.
**Why it's wrong:** It's exactly the "hidden global" FEATURES.md warns about at the product level, and at the code level it invites the cap-computation bug (calling `computeMaxOutputTokens` with the flag set instead of skipping the call). A flag that *can* be threaded through incorrectly eventually will be.
**Do this instead:** Resolve `keySource` once, at the top of `chat.ts`, as a property of the *resolved provider client* (Pattern 2's `resolved.keySource`), and structure the branch so the platform-only code (cap computation, wallet debit) is inside an `if` block that BYOK requests never enter — not a flag checked at multiple scattered points.

### Anti-Pattern 2: Building a bespoke OAuth authorization server for MCP

**What people do:** Because "OAuth server" sounds like custom infrastructure, teams build their own `/oauth/authorize` + `/oauth/token` routes, their own client registry table, their own PKCE verification.
**Why it's wrong:** This duplicates a feature Supabase Auth already ships (Pattern 6), doubles the auth surface to secure and test, and — worse — creates a second identity system that has to be kept in sync with the primary Supabase session used everywhere else in the app.
**Do this instead:** Enable and configure Supabase Auth's OAuth 2.1 Server feature; the "custom" work is limited to the connect/disconnect UI and per-tool authorization logic, not the OAuth protocol itself.

### Anti-Pattern 3: Letting `ai_usage` or BYOK validation calls touch the wallet ledger

**What people do:** "One usage table is simpler" — write BYOK calls into `ledger_entries` with `delta = 0`, or call `apply_wallet_delta` with a zero amount just to get a row.
**Why it's wrong:** Already covered in Pattern 4/FEATURES.md — this corrupts the ledger's meaning as a money record and complicates the pending 작가 정산 reconciliation. It's called out twice in this document because it's the single easiest mistake to make by "reusing" the existing debit function out of convenience.
**Do this instead:** `ai_usage` is its own table, written by its own function (`usage.ts`), never via `apply_wallet_delta`.

### Anti-Pattern 4: Constructing vendor SDK clients directly in `chat.ts` or route handlers

**What people do:** Reach for `new OpenAI(...)` or `new Anthropic(...)` directly at the call site "just for this one feature," bypassing the registry because it's faster to prototype.
**Why it's wrong:** Immediately reintroduces the single-vendor coupling this whole milestone exists to remove, and — more acutely for BYOK — creates a second place where a decrypted key could be constructed/held, undermining Pattern 3's single-trust-boundary property.
**Do this instead:** Every vendor SDK import lives in `lib/ai/providers/*.ts`; every call site gets a client from `registry.resolveProviderClient(...)`, never constructs one inline.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---|---|---|
| Gemini, OpenAI, Anthropic (platform key or BYOK) | Server-only SDK calls, one file per vendor under `lib/ai/providers/`, key sourced either from `process.env` (platform) or `byok.ts`'s decrypt (BYOK) | Never exposed to client; vendor SDK objects never cross a server action boundary |
| Supabase Vault | `vault.create_secret`/`vault.decrypted_secrets` via `SECURITY DEFINER` functions, called only from the service-role client in `byok.ts` | New dependency on a Supabase feature not previously used by this app; resolves the Pending BYOK-encryption decision |
| Supabase Auth OAuth 2.1 Server | Discovery via `.well-known/oauth-authorization-server/auth/v1`; token validation via `@supabase/server` middleware in the MCP route | New dependency on a newer Supabase feature; smoke-test against a real Claude custom connector before committing tool logic on top of it |
| `mcp-handler` (Vercel, npm) | Wraps `app/mcp/[transport]/route.ts`; stateless, no Redis | Official first-party package for exactly this use case — do not hand-roll MCP transport/session handling |
| Claude custom connectors (primary MCP acceptance target) | Standard remote-MCP OAuth discovery + tool-call flow, no NovelScript-specific accommodation needed beyond spec compliance | ChatGPT documented as best-effort per FEATURES.md's plan-gating findings; do not build ChatGPT-specific workarounds into the architecture |

### Internal Boundaries

| Boundary | Communication | Notes |
|---|---|---|
| AiPanel (client) ↔ `chatAction` (server action) | Existing pattern, extended payload (`providerId`, `modelId`, `idempotencyKey`) | No new transport; still one non-streaming call per turn (streaming explicitly deferred per FEATURES.md) |
| Settings UI ↔ `byok.ts` | Server actions only; the settings page never renders a decrypted key, only `masked_hint` read from `byok_keys` | Decrypt only happens inside `chat.ts`'s call path, never for display |
| `chat.ts` ↔ `lib/ai/providers/registry.ts` | Direct function calls, in-process | Registry is the only place that knows how to turn `(providerId, modelId, ownerId)` into a live client |
| MCP route ↔ `lib/kb/*`, `lib/chapters/*`, `lib/ai/prompt.ts` | Direct function calls through an RLS-scoped Supabase client, same functions the app UI already calls | MCP tools are thin wrappers, not a parallel data-access layer — this is what keeps permission semantics identical to the rest of the app |
| MCP route ↔ `mcp_drafts`/`mcp_kb_proposals` | Insert-only from the MCP side; read/update (accept/reject) only from the studio review UI, both RLS-scoped to `owner_id = auth.uid()` | Enforces the one-way "external AI proposes, writer decides" flow at the data-access layer, not just in UI copy |

## Build Order Implications

Sequencing driven by the same dependency graph FEATURES.md already worked out, expressed here as architecture-level gating:

1. **Provider adapter interface + Gemini migration onto it** (Pattern 1) — must land first and be behavior-neutral for existing users (regression-tested against the current single-vendor flow) before anything else touches `chat.ts`. This is the highest-leverage refactor because every later step depends on `ProviderClient` existing.
2. **Idempotent AI debit fix (Pattern 5)** — small, mechanical, no schema change, but must land before BYOK's own error/retry handling and before any 429-backoff logic, per FEATURES.md's explicit sequencing note. Do this alongside step 1, not after — it's cheap and it's a live correctness bug in the current service-key path.
3. **OpenAI + Anthropic adapters** on top of the now-generalized interface (Pattern 1) — no wallet/BYOK logic yet, just prove the adapters work against the platform key path first (simpler to debug than BYOK + new vendor simultaneously).
4. **BYOK storage (Vault) + validate-on-save (Pattern 3)** — foundational, no dependency on the call-path branching yet; can be built and tested in isolation (add a key, see it validate, see it listed masked) before it's ever used to make a real generation call.
5. **BYOK call path (Pattern 2) + `ai_usage` (Pattern 4)** — wires steps 1/3/4 together; this is where the cap-bypass structural guarantee actually gets exercised and needs its own regression test (empty-wallet user with a BYOK key must succeed).
6. **Provider/model selector UI + BYOK usage view** — UI work on top of a fully working backend; sequencing it last within the 1st-stage means the picker never has to be built against a moving-target API.
7. **2nd stage, hard boundary, do not start until 1–6 are stable:** Enable Supabase Auth's OAuth 2.1 Server (Pattern 6), smoke-test discovery/registration/token-exchange against a real Claude custom connector *before* writing a single tool.
8. **MCP read tools + `get_writing_context`** (Pattern 6, reusing `prompt.ts`) — the differentiator tool, but only after read-tool RLS scoping is proven with the simpler list/fetch tools first.
9. **MCP write tools (Pattern 7) + studio review queue UI** — the review queue is real, non-trivial UI scope; do not treat it as a rounding error on the MCP tool count, per FEATURES.md's dependency notes.
10. **Connect/disconnect UI + revocation verification** — last, because it's the acceptance-criterion-bearing feature ("연결 해제 후 접근 차단") and is easiest to verify once tools already work end-to-end.

This order keeps the highest-risk, most load-bearing piece (the adapter interface) isolated and regression-tested before BYOK or MCP touch it, and keeps the two 2nd-stage concerns (Supabase-Auth-as-AS, and the review-queue UI) explicit line items rather than assumed to fall out of "just adding MCP tools."

## Sources

**Project context (authoritative):**
- `docs/ai-integration-roadmap.md` — 1st/2nd stage scope, completion criteria, stage boundary
- `.planning/research/FEATURES.md` — feature landscape, dependency graph, anti-features (this document builds the architecture underneath those findings rather than repeating them)
- `.planning/PROJECT.md` — Key Decisions, Pending BYOK-encryption decision (resolved here)
- `.planning/research/v1.0/ARCHITECTURE.md` — structural baseline (single app, route groups, ledger pattern) this document extends rather than replaces
- Code read directly: `lib/ai/gemini.ts`, `lib/ai/cost.ts`, `lib/ai/chat.ts`, `lib/ai/prompt.ts`, `lib/ai/mentions.ts`, `lib/commerce/actions.ts`, `supabase/migrations/0001_init.sql`, `supabase/migrations/0005_commerce.sql`, `app/studio/[workId]/chapters/[chapterId]/actions.ts`

**Supabase (HIGH — official docs, current):**
- [Vault | Supabase Docs](https://supabase.com/docs/guides/database/vault) — Vault API stability despite pgsodium deprecation
- [Supabase Vault is now in Beta](https://supabase.com/blog/vault-now-in-beta) and [pgsodium (pending deprecation)](https://supabase.com/docs/guides/database/extensions/pgsodium)
- [How to encrypt API keys input from users — GitHub Discussion #22583](https://github.com/orgs/supabase/discussions/22583) — MEDIUM, community consensus converging on Vault for this exact use case
- [OAuth 2.1 Server | Supabase Docs](https://supabase.com/docs/guides/auth/oauth-server) — Supabase Auth as an OAuth 2.1 authorization server
- [Model Context Protocol (MCP) Authentication | Supabase Docs](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication) — discovery endpoint, `@supabase/server` middleware, RLS auto-application
- [Announcing the Supabase Remote MCP Server](https://supabase.com/blog/remote-mcp-server) and [Enterprise-managed auth for the Supabase MCP server](https://supabase.com/blog/enterprise-managed-auth-for-the-supabase-mcp-server)

**MCP hosting on Next.js/Vercel (HIGH — official first-party):**
- [vercel/mcp-handler — GitHub](https://github.com/vercel/mcp-handler) and [Latest MCP spec now supported in mcp-handler — Vercel changelog](https://vercel.com/changelog/latest-mcp-spec-now-supported-in-mcp-handler)
- [Deploy MCP servers to Vercel](https://vercel.com/docs/mcp/deploy-mcp-servers-to-vercel)
- [Build an MCP server with Clerk (Next.js)](https://clerk.com/docs/nextjs/guides/development/mcp/build-mcp-server) — comparison reference for what a from-scratch-AS pattern looks like, kept as the documented fallback if Supabase's native path proves insufficient
- [MCP blog — Tool Annotations as Risk Vocabulary](https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/) — annotations are hints, not enforcement (already cited in FEATURES.md; load-bearing for Pattern 7's no-update-tool design)

**Provider usage/token accounting (HIGH — official API references):**
- [OpenAI Help Center — prompt vs completion tokens](https://help.openai.com/en/articles/7127987-what-is-the-difference-between-prompt-tokens-and-completion-tokens) — `usage` field names differ between Chat Completions and Responses API
- [Claude API Reference — Count tokens in a Message](https://platform.claude.com/docs/en/api/messages/count_tokens) and [Token counting — Claude Platform Docs](https://platform.claude.com/docs/en/build-with-claude/token-counting) — Anthropic does have a `count_tokens` endpoint (correcting FEATURES.md's "OpenAI has none, Anthropic has one with rate limits" framing to be precise: Anthropic's exists but is a separate rate-limited call, not free, so the local-estimate approach in Pattern 1 is still the right default for the pre-call cap)

**Encryption custody pattern (MEDIUM-HIGH — general industry guidance, not project-specific):**
- [Envelope Encryption: KEK vs. DEK and Key Wrapping — Encryption Consulting](https://www.encryptionconsulting.com/envelope-encryption-kek-vs-dek-and-key-wrapping/)
- [Envelope encryption explained: why you probably shouldn't implement it yourself — WorkOS](https://workos.com/blog/envelope-encryption-explained)
- [Google Cloud — Envelope encryption](https://docs.cloud.google.com/kms/docs/envelope-encryption)

---
*Architecture research for: NovelScript v1.1 — multi-provider AI, BYOK, subscription-AI MCP*
*Researched: 2026-09-16*
