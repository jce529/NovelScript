# Stack Research

**Domain:** AI-assisted webnovel writing & reading platform (Korean market, LLM-powered, real payments from day one)
**Researched:** 2026-08-25
**Confidence:** MEDIUM-HIGH (editor/streaming/BaaS choices verified against current npm registry + official docs; Korean PG/legal specifics are MEDIUM/LOW confidence and need a final confirmation pass with the PG's own onboarding team before build)

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js | 16.3.x | App framework, already scaffolded | Already in repo; App Router + Route Handlers are the standard delivery mechanism for SSE-based LLM streaming on Vercel. No reason to deviate. |
| React | 19.2.x | UI runtime | Already in repo; required by Next 16. Tiptap 3 and Vercel AI SDK's React hooks both officially support React 19. |
| TypeScript | 5.x (whatever ships with create-next-app) | Type safety | Non-negotiable for a project mixing payment ledgers, streaming protocols, and a document graph — the surface area for silent bugs is large. |
| Tiptap | `@tiptap/react` + `@tiptap/core` 3.30.x | Rich text editor core for the writing canvas | ProseMirror-based, MIT-licensed, first-class React bindings, first-class `Mention`/`Suggestion` extensions (exactly what `@`-mention autocomplete needs), and a plugin model (`Decoration.widget`) that supports building custom ghost-text without buying anything. 2.5M+ weekly downloads on the mention extension alone — this is the de facto standard for "Notion/Linear-style" editors in the React ecosystem in 2026. |
| Vercel AI SDK | `ai` 7.0.x + `@ai-sdk/<provider>` 4.0.x + `@ai-sdk/react` | LLM call orchestration + streaming | SSE-first as of v5+, provider-agnostic (`streamText`, `generateText`), ships React hooks (`useChat`, `useCompletion`) that already implement reconnect/abort/error handling correctly. Building raw SSE plumbing by hand in 2026 is reinventing what this library does for free. |
| Supabase | supabase-js 2.112.x, Postgres 15/17 (whatever Supabase currently provisions) | BaaS: Postgres, Auth, Storage, RLS | See dedicated section below — remains the right call for this scope. |
| Zustand | 5.0.x | Local-first editor state | Already specified in prior docs and still correct: minimal boilerplate, no context-provider tree, plays well with `persist` middleware for the local-first requirement. |
| Toss Payments Payment Widget (결제위젯) | SDK v2 (`@tosspayments/payment-widget-sdk` / `@tosspayments/tosspayments-sdk`) | PG integration for token top-up | See dedicated PG section below. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@tiptap/extension-mention` | 3.30.x | `@`-mention autocomplete node | Wraps `@tiptap/suggestion` with a ready-made popup lifecycle; use this instead of hand-rolling a contenteditable caret-tracking popup. |
| `@tiptap/suggestion` | 3.30.x | Low-level suggestion/popup utility (peer dep of Mention) | Reuse the same utility to build the "퀵 애드 (Quick Add)" flow — trigger on no-match instead of building a second popup system. |
| Custom ghost-text extension (your own code, ~100-150 LOC) | n/a | Inline grey "next sentence" suggestion, Tab-to-accept | Built directly on Tiptap's `Extension` + `ProseMirror Decoration.widget` API + `@ai-sdk/react`'s streaming primitives. This is a well-documented pattern (same mechanism VS Code Copilot inline suggestions use — a decoration, not real editor content) and does **not** require Tiptap's paid AI Toolkit (see "What NOT to Use"). |
| `idb-keyval` | 6.3.x | IndexedDB wrapper for Zustand `persist` | Prior docs mention `localStorage/IndexedDB` generically. Use IndexedDB (via `idb-keyval` as the storage adapter for Zustand's `persist`) rather than `localStorage` — a novel's full knowledge base + manuscript can exceed `localStorage`'s ~5-10MB ceiling; IndexedDB has no practical limit for this use case. |
| `zod` | 3.25.x or 4.1.x (peer range accepted by `@ai-sdk/openai`) | Runtime schema validation | Validate PG webhook payloads, LLM structured outputs, and API route bodies. Cheap insurance around the two subsystems that touch real money and external network input. |
| `@portone/browser-sdk` | 0.1.x | Optional PG abstraction layer | Only if you want to decouple from Toss Payments specifically — see PG section. Not required if you commit to Toss Payments directly. |
| Vercel encrypted environment variables | n/a | Storing the single platform LLM API key | Sufficient for MVP. Do **not** stand up Supabase Vault or AWS KMS for this — see "What NOT to Use." |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Vercel CLI / Preview Deployments | Test SSE streaming + PG webhook callbacks against a public URL | PG providers (Toss, PortOne) require a real HTTPS callback URL for webhook testing — `localhost` won't work. Use Vercel preview URLs or a tunnel (e.g. `ngrok`) for local webhook development. |
| Toss Payments / PortOne sandbox (test) keys | PG integration testing without a live business | Both providers offer test-mode API keys that work before your 사업자등록/merchant contract is finalized — build the integration in parallel with the paperwork, swap to live keys at the end. |
| Supabase CLI | Local Postgres + migrations | Use `supabase migration new` for the payment ledger and document-graph schema from day one — a real-money system needs reviewable, versioned migrations, not ad hoc dashboard edits. |

## Installation

```bash
# Core editor
npm install @tiptap/react @tiptap/core @tiptap/pm @tiptap/starter-kit @tiptap/extension-mention @tiptap/suggestion

# AI streaming
npm install ai @ai-sdk/openai @ai-sdk/anthropic zod
# (install only the provider package(s) for the vendor you actually select)

# State + local persistence
npm install zustand idb-keyval

# BaaS
npm install @supabase/supabase-js @supabase/ssr

# Payments (pick ONE path — see PG section)
npm install @tosspayments/tosspayments-sdk
# OR, if going through PortOne instead of direct Toss integration:
npm install @portone/browser-sdk @portone/server-sdk

# Dev dependencies
npm install -D supabase
```

## Question-by-Question Findings

### 1. Rich text editor: Tiptap over Lexical

**Recommendation: Tiptap 3.x. Confidence: HIGH.**

Verified: `@tiptap/react`, `@tiptap/core`, `@tiptap/extension-mention` are all at `3.30.3` on npm as of 2026-08-25, and the mention extension is one of the highest-download Tiptap packages, confirming it's the standard path for this exact feature (mention-triggered autocomplete popup over a document tree).

Tiptap vs. Lexical tradeoff for this project specifically:
- **Mentions**: Tiptap's `Mention` + `Suggestion` extensions are purpose-built, ready-made, and directly reusable for both the `@`-mention flow *and* the "Quick Add" no-match flow described in the UX spec (`docs/5-2`). Lexical has mention *nodes* but you build the popup/positioning/keyboard-nav logic yourself.
- **Ghost text**: Neither library ships this out of the box for free. Tiptap sells it as part of a Pro "AI Toolkit" (see below — reported at ~$500+/month, explicitly not worth it for this MVP). Lexical has no first-party AI story at all. In both cases you're writing a custom decoration-based extension; Tiptap's plugin surface (it's ProseMirror underneath) is better documented for this exact pattern (VS Code / Copilot-style inline suggestion widgets) because ProseMirror's `Decoration.widget` API has years of community precedent for "ghost" content that isn't part of the real document.
- **Bundle size**: Lexical is lighter (~40-60KB gzipped for a comparable feature set vs. Tiptap's ~80-120KB) — a real but secondary concern for a writing IDE that isn't mobile-first and where users spend long sessions in one page load.
- **When Lexical would be the better call**: if this were a high-concurrency collaborative/multiplayer editor (Lexical is what Meta uses for Messenger/WhatsApp Web-scale text surfaces) or a React Native target. Neither applies here — no real-time multiplayer requirement in the MVP scope.

Confidence note: the Tiptap-vs-Lexical comparison itself is drawn from several 2026 comparison blogs (MEDIUM confidence, cross-checked across 4 independent sources that agree), but the npm version numbers and the existence/API shape of `Mention`/`Suggestion` are HIGH confidence (verified directly against the npm registry and package metadata).

### 2. Streaming approach: SSE via Vercel AI SDK, not raw WebSockets

**Recommendation: Vercel AI SDK (`ai` package, currently 7.0.x) over Route Handlers on Node runtime, SSE under the hood. Confidence: HIGH.**

This confirms the prior docs/4 instinct (SSE over WebSocket) and adds a concrete implementation layer:
- LLM streaming is inherently unidirectional (server → client). WebSockets add bidirectional complexity, connection-management overhead, and infrastructure cost (sticky sessions / dedicated socket servers) that buys nothing here. SSE is the correct transport — this part of the prior spec was right.
- Don't hand-roll the SSE plumbing. The Vercel AI SDK (major version 5+ made the wire protocol SSE-native) provides `streamText()` server-side and `useChat`/`useCompletion` client-side hooks that already handle reconnection, partial-token buffering, abort signals, and error surfaces. As of today the `ai` package is at `7.0.79` on npm, paired with provider packages like `@ai-sdk/openai@4.0.47` (provider packages version independently from the core `ai` package — this is expected, not a mismatch).
- **Runtime choice**: use the **Node.js runtime**, not Edge, for the streaming route handlers. Edge functions have historically had a 30s cap and limited Node API/driver compatibility (relevant if the Supabase server client or any Node-only crypto is used in the same handler). Vercel's Node runtime now supports much longer `maxDuration` (60s on Hobby, up to 800s standard / 30 min in beta on Pro with Fluid Compute) — comfortably enough headroom for a chapter-length AI generation call, which Edge's older ceiling was not guaranteed to cover.
- **Ghost-text specifically**: this is a debounced, cancelable, low-token completion call, not a chat conversation. Implement it as its own lightweight route (`streamText` with a short max-token budget) called directly via `fetch` + `ReadableStream` reader on the client (or `useCompletion`, which AI SDK still ships), with an `AbortController` tied to the next keystroke so superseded requests are cancelled — this is the standard debounce+cancel pattern for inline-suggestion UIs and keeps AI spend bounded per keystroke-pause.
- Since the MVP is committed to exactly one LLM vendor with a platform key (per PROJECT.md), pick whichever `@ai-sdk/<provider>` package matches that vendor when it's selected — the SDK's provider abstraction means swapping vendors later is a low-cost change, not an architecture change.

### 3. Korean PG: Toss Payments Payment Widget as the primary path

**Recommendation: Toss Payments Payment Widget (결제위젯) v2, direct integration. Confidence: MEDIUM (integration mechanics HIGH from official docs; regulatory/KYC specifics MEDIUM-LOW, verify directly with Toss's onboarding team before launch).**

Important framing correction: what this product needs is **token top-up (지갑 충전)**, i.e. repeated *one-time* payments each time a user chooses to add balance — not automatic recurring billing (정기결제/빌링키 자동 결제). This matters because it removes an entire category of complexity (빌링키 issuance, stored-card auto-charge cycles, subscription-cancellation flows) that would otherwise be the hardest part of a Korean PG integration. Confirm this reading against the roadmap, but nothing in PROJECT.md's Active requirements implies auto-recurring charges.

Comparison of the three options named in the question:

| Option | Integration effort (solo dev) | What it covers | Settlement | 사업자등록/KYC | Verdict |
|---|---|---|---|---|---|
| **Toss Payments 결제위젯 (Payment Widget)** | Low — one widget SDK renders card + 카카오페이 + 네이버페이 + 토스페이 as selectable methods in a single checkout UI; official docs and countless Korean indie-dev tutorials exist | Card, KakaoPay, NaverPay, TossPay — all major Korean payment methods in one integration | Cards: ~T+3 (or D+2 business days depending on terms); simple/easy-pay (간편결제) and account transfer: ~T+1 | Requires a registered business (개인사업자 or 법인) with a matching business bank account; Toss offers an online "사업자등록 바로신청" helper for solo sellers who haven't registered yet, plus a "미리 오픈" fast-track that allows live card payments within ~6 minutes of application while the full merchant review (documents, business site review) completes in the background (up to ~1 month) | **Recommended default.** Best documentation, single contract, single SDK, covers all methods a Korean reader/writer audience expects. |
| **PortOne (포트원, formerly 아임포트)** | Low-Medium — PortOne is a payment *orchestration* layer, not a PG itself; you still ultimately settle through an underlying PG (which can be Toss, KG이니시스, NHN한페이, etc.) that PortOne connects to | Same practical coverage as above, but lets you register once and switch/add underlying PGs later without rewriting client code | Determined by whichever underlying PG you attach — PortOne itself doesn't settle funds | Same underlying business registration requirement is still needed for whichever real PG you contract with; PortOne's own onboarding is faster but doesn't remove the PG's KYC step | **Reasonable alternative**, worth it specifically if you want PG-migration insurance (e.g. plan to add 가상계좌/무통장입금 or multiple PGs later) or want to prototype the payment flow against PortOne's test credentials while the real merchant contract paperwork is still in progress. Adds one extra abstraction hop for no benefit if you're staying on a single PG long-term. |
| **KakaoPay (direct merchant)** | Higher if pursued as a standalone direct integration — separate merchant application, separate approval process, KakaoTalk-linked identity verification for the individual business owner | KakaoPay only (no card, no NaverPay) | KakaoPay-specific settlement terms | Requires its own merchant examination (가맹 심사); can be rejected for incomplete docs/qualification | **Do not integrate directly.** Get KakaoPay coverage *through* the Toss Payments widget (which already includes it as a selectable method) instead of running a second, parallel PG integration for one payment method. |

**Regulatory flag (MEDIUM-LOW confidence, needs legal confirmation before scaling):** Korea's 전자금융거래법 requires registration with the FSC for anyone issuing a "선불전자지급수단" (prepaid electronic payment instrument), unless an exemption applies. The clearest exemption is a **single-merchant, closed-loop** balance (usable only within your own platform, no cash-out to a third party) below a certain issuance/outstanding-balance threshold. NovelScript's token model — spent only inside the platform, with cash-out explicitly listed as Out of Scope in PROJECT.md — appears to fit this exemption profile, which is a genuine point in favor of the "no cash-out at MVP" decision (it's not just a scope-cut, it's a real regulatory-simplicity win). This should be confirmed with the PG's own compliance team (Toss and PortOne both have onboarding staff who routinely answer this exact question for token/point-based platforms) before launch — do not treat this paragraph as legal advice.

**What NOT to do:** don't build a mock/fake payment flow "for now" and bolt on a real PG later — PROJECT.md is explicit that real payment must exist from day one, and the ledger/webhook schema (idempotent webhook handling, payment status state machine, token balance reconciliation) is architecturally coupled to which PG you pick. Decide the PG in the roadmap's early phases, not as a late add-on.

### 4. Supabase remains the right BaaS choice for this scope

**Recommendation: Keep Supabase (Postgres + Auth + Storage + RLS). Confidence: HIGH for "keep Supabase," MEDIUM-LOW for "keep Supabase Vault" (recommend dropping it — see below).**

Cross-checked against 2026 Supabase-vs-Neon comparisons: the consistent conclusion across multiple independent sources is that Supabase is the right call specifically for solo founders/small teams who want auth + Postgres + storage + realtime bundled without integration glue, while Neon is better for teams that already have a separate auth stack and just want branchable Postgres. NovelScript has no existing auth stack and needs Auth (writer/reader accounts), Storage (potentially for cover images/thumbnails per docs/5-2), and relational integrity (payment ledger) simultaneously — this is exactly Supabase's sweet spot, not Neon's.

`pgvector` is available as an extension in both Supabase and Neon, so choosing Supabase doesn't cost anything even if a future phase decides to revisit implicit RAG (see Q5) — it's a zero-cost option to keep, not a wasted bet.

**What to trim from the prior docs/4 spec as overkill for this MVP:**
- **Supabase Vault / AWS KMS for API key encryption** — docs/4 frames this as defense against BYOK-key abuse. PROJECT.md explicitly puts BYOK out of scope for the MVP (single platform key only). A single platform-wide LLM API key needs to be a well-protected server-side secret (Vercel encrypted environment variable, never sent to the client), not a per-user encrypted vault. Building Vault integration now is solving a problem (protecting *many users'* individually-registered keys) that doesn't exist yet. Revisit if/when BYOK ships in a later milestone.
- **PgBouncer/Supavisor connection pooling** — this one is *not* overkill, it's necessary and Supabase provides it by default (Supavisor is bundled) for any serverless/Vercel deployment. Keep it, but note it requires no extra setup — it's Supabase's default pooled connection string, not a separate service to stand up.

### 5. Vector/embedding "implicit RAG": skip it at MVP scale

**Recommendation: Do not build the pgvector-based implicit RAG pipeline for the MVP. Confidence: HIGH (this follows directly from the stated MVP requirements, not just an ecosystem-trend observation).**

Reasoning:
- PROJECT.md's Active requirements describe **explicit** `@`-mention selection ("작가가 ... `@` 멘션으로 설정 문서를 선택 주입") as the MVP mechanism for context injection. The "implicit RAG" auto-suggestion described in docs/4 is a *full-product-vision* feature, not a stated MVP requirement — it doesn't appear in PROJECT.md's Active list at all.
- Even setting scope aside, the corpus size argument is decisive: a single work's knowledge base (characters, places, events, factions, items) is realistically dozens to low hundreds of short markdown documents — small enough that embedding-based semantic search offers no meaningful advantage over much cheaper alternatives, while adding a real pipeline (embedding generation on every doc edit, embedding model cost/latency, vector index maintenance) that has to be built, tested, and paid for before the core writer/reader loop is even validated.
- The "관계 지역성 (relationship locality)" scoring idea in docs/4 — link degree + recency decay — does **not** require embeddings at all. It's a graph query: maintain a simple backlink table (`source_doc_id`, `target_doc_id`) parsed from the same `[[wiki-link]]` syntax already planned for the editor, and compute a score (`degree * time_decay_factor`) in plain SQL or application code. This is strictly cheaper and simpler than pgvector and fully satisfies the "which docs are important" half of the idea.
- If any automatic *keyword-level* doc-suggestion is wanted later without going all the way to embeddings, Postgres full-text search (`tsvector` + `websearch_to_tsquery`, built into the Postgres you already have via Supabase) is the appropriate middle step — no new infrastructure, no embedding cost, "good enough" for surfacing candidate docs by name/keyword overlap.
- Because pgvector is a zero-cost-to-defer option within the already-chosen Supabase/Postgres stack (see Q4), there's no lock-in risk in skipping it now — it can be added in a later milestone once there's real usage data showing writers *want* auto-suggestion and the explicit `@`-mention flow is a proven bottleneck, rather than building it speculatively.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|--------------------------|
| Tiptap | Lexical | High-scale collaborative/multiplayer editing, or a React Native writing surface — neither applies to this MVP. |
| Tiptap | Slate.js | Slate offers more low-level control but has a documented history of breaking API changes and heavier custom-build burden for mentions/suggestions; not worth it when Tiptap ships the exact primitives needed out of the box. |
| Vercel AI SDK (`ai`) | Raw `fetch` + hand-rolled SSE parsing | Only if you need something the SDK's abstraction actively gets in the way of (rare) — otherwise this is pure reinvention. |
| Toss Payments direct | PortOne (포트원) | You want a PG-agnostic abstraction now because you anticipate needing multiple PGs, 가상계좌/무통장입금, or a fast pivot away from Toss later. |
| Supabase | Neon (pure serverless Postgres) | You already have a separate auth solution and only need branchable Postgres + pgvector — not this project's situation. |
| pgvector-based implicit RAG (deferred) | Postgres full-text search (`tsvector`) | If you want *some* automatic doc suggestion sooner without paying the embedding-pipeline cost — a reasonable middle ground before full RAG. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| `@tiptap-pro/extension-ai` (Tiptap AI Toolkit) | Paid add-on reported at ~$500+/month on top of Tiptap Cloud platform fees ($49-999/mo) — a fixed monthly cost with no revenue to offset it yet, for a feature (ghost text) that's buildable with Tiptap's free `Decoration.widget` API + the Vercel AI SDK you're already installing. | Custom ghost-text extension built on free Tiptap core APIs (see Supporting Libraries). |
| Raw WebSocket server for AI streaming | Unidirectional LLM output doesn't need bidirectional transport; a WebSocket server adds connection-state infrastructure (sticky sessions, reconnect logic) Vercel's serverless model isn't built around. | SSE via Vercel AI SDK route handlers. |
| Edge runtime for LLM streaming routes | Historically tighter execution limits and narrower Node API/driver compatibility than the Node.js runtime; a chapter-length generation call is safer on Node runtime with `maxDuration` configured. | Node.js runtime route handlers with an explicit `maxDuration`. |
| Direct standalone KakaoPay merchant integration | Separate merchant application/approval process for coverage you already get "for free" as one of the payment methods inside the Toss Payments widget. | Toss Payments 결제위젯 (includes KakaoPay as a selectable method). |
| Building 정기결제 (recurring billing/빌링키 auto-charge) infrastructure | The MVP's "token 충전" is user-initiated top-up, not subscription billing — building auto-charge machinery solves a problem you don't have yet. | One-time payment flow per top-up, repeated at user's discretion. |
| Supabase Vault / AWS KMS for per-user API key encryption | Solves a BYOK-abuse problem that doesn't exist in this MVP (BYOK is explicitly Out of Scope; single platform key only). | Vercel encrypted environment variable for the one platform LLM key. |
| Google Cloud Run SLM moderation worker queue (from docs/4) | Explicitly Out of Scope per PROJECT.md — moderation is manual for v1. Standing up a second cloud provider + async queue infra for a feature not in this milestone's requirements is pure premature investment. | Manual operator review tooling (minimal admin UI against the same Supabase Postgres). |
| pgvector-based implicit RAG pipeline (at MVP) | No stated MVP requirement calls for it; corpus size per project is too small to benefit from semantic search; adds embedding-generation cost/latency/pipeline maintenance before the core loop is validated. | Explicit `@`-mention (already the MVP UX) + plain-SQL backlink-graph scoring for "relationship locality." |
| `localStorage` for the full local-first document/manuscript cache | Practical ~5-10MB ceiling that a growing knowledge base + manuscript can exceed; also synchronous API can jank the UI on larger writes. | IndexedDB via `idb-keyval` as the Zustand `persist` storage adapter. |

## Stack Patterns by Variant

**If the beta grows fast enough that manual moderation becomes a bottleneck:**
- Revisit the Cloud Run SLM queue idea from docs/4 — but only once manual review is the demonstrated bottleneck, not preemptively.

**If a later milestone adds BYOK (bring-your-own-key):**
- That's the point to introduce Supabase Vault (or AWS KMS) for per-user key encryption — it's the correct tool for that problem, just not for the single-platform-key MVP.

**If writers' `@`-mention usage data shows the explicit selection flow is a real friction point:**
- Add Postgres full-text search first (cheap, already-available); only escalate to pgvector embeddings if full-text search proves insufficient.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|------------------|-------|
| `next@16.3.x` | `react@19.2.x` | Already scaffolded together; Next 16's App Router requires React 19. |
| `@tiptap/react@3.30.x` | `react@19.2.x` | Tiptap 3's React package officially supports React 19. |
| `@tiptap/extension-mention@3.30.x` | `@tiptap/core@3.30.x`, `@tiptap/suggestion@3.30.x` | All Tiptap packages must stay on the same 3.30.x line — mixing Tiptap 2.x and 3.x packages will break. |
| `ai@7.0.x` | `@ai-sdk/openai@4.0.x`, `@ai-sdk/provider@4.0.x`, `@ai-sdk/provider-utils@5.0.x` | Provider packages version independently from the core `ai` package — `ai@7` pairing with `@ai-sdk/openai@4` is expected/correct, not a mismatch. Always install the provider version that `ai`'s own dependency graph resolves, don't manually pin to a different major. |
| `@ai-sdk/openai@4.0.x` | `zod@^3.25.76 \|\| ^4.1.8` | Confirmed via npm peerDependencies as of 2026-08-25 — pin `zod` inside this range. |
| `@supabase/supabase-js@2.112.x` | Postgres via Supavisor pooled connection string | Always use the pooled connection string (Supavisor, bundled by default) from serverless/Vercel functions, not the direct connection string, to avoid connection exhaustion. |

## Sources

- npm registry (`npm view <package> version` / `versions` / `peerDependencies` / `dependencies`), queried live 2026-08-25 — HIGH confidence for all version numbers cited above.
- Tiptap official docs (tiptap.dev/docs/editor/extensions/nodes/mention, tiptap.dev/docs/editor/api/utilities/suggestion) — HIGH confidence for Mention/Suggestion API shape.
- Multiple 2026 Tiptap-vs-Lexical comparison sources (eddyter.com, pkgpulse.com, trybuildpilot.com, starterpick.com) — MEDIUM confidence, cross-checked, consistent conclusion across sources.
- Tiptap AI Toolkit pricing (eddyter.com/blogs/tiptap-pricing-explained-2026, linkgo.dev) — MEDIUM confidence, pricing not on Tiptap's own public pricing page (requires sales contact), but consistent across independent sources.
- ai-sdk.dev migration guides (5.0, 6.0, 7.0) and avolve.io — HIGH confidence for AI SDK v5+ SSE-first architecture and Next.js/React 19 compatibility.
- Vercel official docs (vercel.com/docs/functions/limitations, vercel.com/docs/functions/configuring-functions/duration, vercel.com/changelog) — HIGH confidence for maxDuration/runtime limits.
- Toss Payments official developer docs (docs.tosspayments.com/guides/payment-widget/overview, docs.tosspayments.com/resources/faq) — HIGH confidence for widget capabilities and settlement cycle mechanics.
- easyspark.io 2026 Toss Payments vs. PortOne comparison — MEDIUM confidence (single source, but consistent with official docs' framing of PortOne as an orchestration layer over underlying PGs).
- KakaoPay partner docs (partner.kakaopay.com) — MEDIUM confidence for merchant examination process description.
- FSC (금융위원회) publications and legal-interpretation portal (better.fsc.go.kr, fsc.go.kr) plus a legal-guide article (venturesquare.net) on 선불전자지급수단 exemptions — LOW-MEDIUM confidence; general regulatory framework is well-sourced, but application to this specific product needs direct confirmation from a PG's compliance team or a lawyer, not treated as final here.
- Supabase-vs-Neon 2026 comparison sources (rivestack.io, tech-insider.org, getautonoma.com, buildmvpfast.com) — MEDIUM confidence, consistent conclusion across multiple independent sources.

---
*Stack research for: AI-assisted webnovel writing & reading platform (NovelScript MVP)*
*Researched: 2026-08-25*
