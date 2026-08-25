# Project Research Summary

**Project:** NovelScript MVP
**Domain:** AI-assisted webnovel writing & reading platform (Korean market, LLM-powered, real payments from day one)
**Researched:** 2026-08-25
**Confidence:** MEDIUM-HIGH

## Executive Summary

NovelScript is a dual-loop product — a mention-based AI writing IDE and a Korean webnovel reading viewer, bound together by a real-money token wallet — and all four research tracks converge on the same shape: build it as **one Next.js 16 app on Vercel + Supabase**, with Tiptap for the editor, the Vercel AI SDK for SSE streaming on the Node.js runtime, and a **double-entry-flavored, append-only ledger** as the single source of truth for every token movement (top-up, AI-generation debit, chapter-unlock debit). The differentiator worth protecting is narrow and well-scoped: explicit, writer-controlled multi-document `@`-mention context injection into LLM generation — not the full 3-panel IDE, not ghost-text, not wiki-linking/graph view. Everything else in the original docs (asset store, BYOK, cash-out, SLM auto-moderation, precision ranking) is correctly deferred, and the research confirms each deferral actually reduces regulatory/engineering surface area rather than just cutting scope for its own sake.

The recommended approach is to prove the wallet/ledger's correctness with **fake money before real money touches it**: build and concurrency-test the ledger schema and RPCs first (Architecture's Pattern 2), wire AI generation against a stubbed credit path second, and only then swap in the real PG integration behind the same `credit_wallet`/`debit_wallet` interface. This sequencing directly de-risks the two hardest, highest-stakes pieces of the system (the ledger and the live PG integration) by proving them independently rather than simultaneously — and it is the one piece of build-order guidance that shows up, in slightly different words, in all four research files.

The key risks are financial and regulatory, not technical: (1) LLM cost runaway from unbounded per-user generation, mitigated by a three-layer guardrail (per-request cap, per-user ledger-gated quota, platform-wide circuit breaker) that must ship *with* the generation feature, not after; (2) token ledger race conditions under concurrent requests, mitigated by row-locked atomic Postgres RPCs and idempotency keys, not application-level read-then-write; (3) Korean PG onboarding timing — business registration and merchant review run on an external clock (commonly ~2+ weeks) that is easy to under-plan for and easy to make the actual critical path to launch, independent of any code; and (4) a residual, low-probability-but-not-zero regulatory question (선불전자지급수단 classification) that the current no-cash-out, single-merchant design appears to avoid, but that needs a PG compliance team's or lawyer's explicit sign-off rather than being assumed. None of these are blocking design problems — they are sequencing and confirmation problems, which is exactly what the roadmap needs to make explicit.

## Key Findings

### Recommended Stack

Next.js 16.3 / React 19 (already scaffolded) with Tiptap 3.x for the writing canvas (its Mention/Suggestion extensions are purpose-built for the `@`-mention flow and reused for "Quick Add"), the Vercel AI SDK (`ai` 7.x + `@ai-sdk/<provider>`) for SSE-based LLM streaming via Node.js-runtime Route Handlers (Edge is not even an option — Next.js 16.3 removed `runtime=edge` for route handlers entirely, resolving the old Edge-vs-Node debate by elimination), Zustand + `idb-keyval`/IndexedDB for local-first editor state, and Supabase (Postgres + Auth + Storage, Supavisor pooling by default) as the BaaS layer. For payments, Toss Payments Payment Widget (결제위젯) is the stack recommendation's primary path for one-time token top-ups (not recurring billing — that is a materially simpler, separate review track this product does not need). Drop Supabase Vault/AWS KMS and the pgvector-based "implicit RAG" pipeline from the MVP scope entirely — both solve problems (per-user BYOK key encryption, semantic search over a small per-work document corpus) that do not exist yet at this scale; a single platform LLM key as a Vercel encrypted env var, and a plain-SQL backlink/decay score for "relationship locality," cover the same ground for free.

**Core technologies:**
- Next.js 16.3 + React 19 — already scaffolded; App Router Route Handlers are the standard SSE delivery mechanism on Vercel, no reason to deviate
- Tiptap 3.x (`@tiptap/react`, `@tiptap/extension-mention`, `@tiptap/suggestion`) — ProseMirror-based, ships ready-made mention/autocomplete primitives that are the exact mechanism the MVP's differentiator needs
- Vercel AI SDK (`ai` 7.x) — SSE-native since v5, ships `streamText`/`useChat`/`useCompletion` with reconnect/abort/error handling already solved; use Node.js runtime with explicit `maxDuration`
- Supabase (Postgres + Auth + Storage, Supavisor pooling) — bundles auth + relational integrity + storage in one integration for a team with no existing auth stack; pgvector stays available as a zero-cost-to-defer option
- Zustand + `idb-keyval` (IndexedDB) — local-first editor state; IndexedDB avoids localStorage's ~5-10MB ceiling for a growing KB + manuscript
- Toss Payments Payment Widget (or PortOne as an abstraction layer — see Open Questions) — one-time token top-up only, not recurring billing

### Expected Features

The MVP loop is narrower than the full docs vision, and the research explicitly separates the *mechanism* (multi-doc `@`-mention context injection, precise and writer-controlled) from the *chrome* (3-panel IDE, ghost-text, drag-drop file trees) — the mechanism is the differentiator and must ship; the chrome is v1.x/v2 polish that does not gate validation. On the reader side, the Korean market bar for a "finished-feeling" viewer is higher than a generic English MVP: font/theme controls and resume-from-last-read (이어보기) are table stakes, not differentiators, because Korean readers already have Ridibooks/Novelpia/Munpia-level expectations.

**Must have (table stakes):**
- Auth (1-2 social/OAuth providers, Kakao/Google recommended), one account with a writer/reader role toggle, no invite gate
- Markdown KB CRUD across the 5 entity templates (인물/장소/사건/세력/아이템), flat list UI — no drag-drop, no graph view
- `@`-mention autocomplete pulling from KB, multi-doc selection, a visible "in context" list
- 3-tier preset selector (beginner/intermediate/freeform), freeform = plain textarea, not a system-prompt modal
- Token/cost estimate before generating (character-count estimate is sufficient)
- Chapter draft/publish (title, order, free/paid, price)
- Reader discovery/browse (cover, title, synopsis, simplified ranking) and viewer (font size, theme, chapter nav/TOC, resume-from-last-read)
- Real PG-integrated token purchase, wallet balance display, deduction on paid-chapter unlock
- Reader-facing report button (the *entire* detection mechanism for v1, since SLM pre-moderation is deferred) + admin manual report queue/takedown/account-action tooling

**Should have (competitive):**
- Multi-document simultaneous `@`-mention (already MVP-scoped — the actual differentiator, worth polishing first if time is tight)
- Token/cost gauge shown pre-generation (cheap, doubles as platform cost control)
- Reader-facing opt-in "written with AI" / partial lore-wiki showcase (novelty hook, flagged as an open question, not a commitment)

**Defer (v2+):**
- Ghost-text inline continuation (Tab-to-accept) — high complexity, does not validate the core mention-context hypothesis
- Full 3-panel Web IDE polish, wiki-linking + Graph View, BYOK + key vault, token cash-out, asset marketplace, SLM auto-moderation + 3-strike sanctions, precision scroll-depth ranking — all explicitly out of scope per PROJECT.md and confirmed by feature research as correctly deferred, not just cut

### Architecture Approach

Single Next.js app, single Vercel deployment, single origin — route groups (`(studio)`, `(reader)`, `(admin)`) instead of the full-vision docs subdomain split, because the subdomain approach creates exactly the cross-domain-cookie/shared-session problem the docs own GNB balance-sync requirement needs to avoid. AI Gateway, Wallet/Ledger, and Payment Gateway Adapter are plain TypeScript modules inside one process (`lib/ai/`, `lib/wallet/`, `lib/payments/`), not separate services — module boundaries via folder structure and interfaces are the right amount of separation at solo-founder MVP scale, and splitting into microservices would fragment the ledger's transactional guarantees for no benefit.

**Major components:**
1. **Wallet/Ledger module** — single source of truth for token balance; append-only `ledger_entries` table + a denormalized `wallets.balance` cache, mutated only inside SECURITY DEFINER Postgres RPCs with row-level locking (`SELECT ... FOR UPDATE`) and idempotency via `unique(reference_id, type)`. Every token movement (PG top-up credit, AI-generation debit, chapter-unlock debit, refund/adjustment) goes through this one schema and one set of RPCs.
2. **AI Gateway module** — assembles the prompt from `@`-mentioned KB docs + preset tone, calls the single vendor LLM, streams tokens back via SSE, and implements a **reserve → stream → settle** two-phase debit (reserve a worst-case estimate before the vendor call, settle to actual usage + refund the difference after) so a user can never overdraw mid-generation and a runaway request cannot blow past budget.
3. **Payment Gateway Adapter** — thin wrapper around the PG's server SDK; the webhook route handler is the *only* code path that credits a wallet from a real transaction (never the client-side redirect/return page, which is spoofable/skippable) and must verify the PG's signature against the raw request body before trusting the payload.
4. **Spend Cap / Circuit Breaker** — a pre-flight guard checked inside `/api/ai/generate`, before any vendor call, covering both per-user affordability (the reserve step) and a platform-wide spend-velocity aggregate independent of any one user's balance.
5. **Content/Admin module** — chapter publish state, report queue, manual moderation actions; no async pipeline, purely synchronous CRUD gated by a role check.

### Critical Pitfalls

1. **LLM cost runaway from unbounded per-user generation** — a single platform-held API key with no natural circuit breaker means one power user (or one script) can turn a small session into a huge one overnight. Avoid by enforcing hard caps at three layers (per-request context/output token cap, per-user ledger-gated quota, platform-wide spend-velocity breaker), all checked *before* the vendor call fires — the ledger is the cost control here, and it cannot be added later since there is no BYOK offramp for heavy users in v1.
2. **PG registration/review timing blocks launch** — Korean PG onboarding requires a registered business (사업자등록), a merchant application, and card-network review that commonly runs ~2+ weeks, asynchronously and outside the founder's control. Avoid by starting business registration and the PG's test-mode application in parallel with early feature work, not after the product is otherwise done — this is frequently the actual critical path to a beta launch date, not the code.
3. **Token ledger race conditions allow double-spend or negative balances** — naive read-then-check-then-write ledger logic passes every manual/single-request test and only breaks under real concurrent load (double-click, two tabs), which is exactly what a beta produces. Avoid with atomic Postgres transactions, row-level locks or `UPDATE ... WHERE balance >= amount`, an append-only audit log, and idempotency keys on every client-retriable action (generation requests, chapter unlocks, top-up webhooks).
4. **No automated moderation means the fastest-growing abuse is the kind that looks like normal usage** — prompt-injection/jailbreak attempts, near-verbatim copyright reproduction via clever mention engineering, and multi-accounting to farm free tokens all surface faster than manual review can catch them without cheap proactive mitigations. Avoid by shipping a server-controlled (user-invisible) system-prompt safety/copyright instruction *with* the generation feature itself, making one-click reporting trivially reachable, and logging full prompt+context+output for every generation so reports have something to act on retroactively.
5. **선불전자지급수단 (prepaid payment instrument) regulatory reclassification** — Korea's 2024 amendment lowered the bar (now roughly 1+ business category / 2+ merchant-like entities) for when a prepaid token balance is treated as a regulated financial instrument requiring FSC registration and reserve obligations. The v1 design (no cash-out, no cross-creator token movement, single-merchant closed loop) appears to sit safely under this bar, but this must be confirmed with a PG compliance team or lawyer before launch and explicitly re-checked before ever building the asset store or cash-out (the features that would actually introduce a multi-merchant pattern).

## Implications for Roadmap

Based on combined research, the four files converge tightly on one build order — Architecture's explicit 8-step sequence, Features' dependency graph, and Pitfalls' phase-mapping table all agree that the ledger must be proven with fake money before it touches real money, and that AI generation and PG integration should be de-risked as separate, independently-verifiable pieces rather than built together.

### Phase 1: Foundation (auth, schema, stubbed ledger)
**Rationale:** Everything else depends on auth + a wallet a user is tied to; the ledger is the hardest-to-retrofit piece in the whole system, so it must be built and concurrency-tested in isolation, before any AI or PG code exists, against a stubbed/internal "grant test tokens" credit path.
**Delivers:** Supabase Auth wired up, core schema (`works`, `chapters`, `kb_docs`, `wallets`, `ledger_entries`), route-group scaffolding (studio)/(reader)/(admin), `debit_wallet`/`credit_wallet` RPCs with row-level locking and idempotency, verified under concurrent-request load tests.
**Addresses:** No user-facing features yet — this is the load-bearing infrastructure Features' dependency graph puts underneath both the writer loop and the paid-unlock loop.
**Avoids:** Pitfall 3 (ledger race conditions) — proven here with fake money, exactly per the Recovery Strategies guidance that retroactive reconstruction without an append-only log may be impossible.

### Phase 2: Studio core (writer loop, no AI)
**Rationale:** Validates the writing loop's non-AI half independently; KB documents must exist before `@`-mention has anything to inject.
**Delivers:** Markdown KB CRUD across the 5 templates (flat list, no drag-drop/graph view), Tiptap-based editor shell, chapter draft/publish with metadata.
**Addresses:** Features' P1 items (KB CRUD, chapter publish/draft).
**Research flag:** Standard pattern — Tiptap's CRUD/editor-shell usage is well-documented; skip research-phase.

### Phase 3: Reader core (reading loop, no payment)
**Rationale:** Validates the reading loop's non-payment half independently; discovery has nothing to discover without published content from Phase 2.
**Delivers:** Discovery/browse feed (cover, title, synopsis, simplified ranking), viewer with chapter nav/TOC/resume-from-last-read, font/theme controls — all chapters free at this stage.
**Addresses:** Features' P1 reader table stakes (Korean-market viewer bar).
**Research flag:** Standard pattern — skip research-phase.

### Phase 4: AI Gateway (generation against the stubbed wallet)
**Rationale:** The riskiest *functional* piece (external vendor API, streaming, cost control) — de-risking it against Phase 1's stub wallet means a PG bug cannot block AI validation, and vice versa. This is also where the LLM vendor decision must be finalized (open question, see below).
**Delivers:** `@`-mention prompt assembly, preset selector, Vercel AI SDK streaming (Node.js runtime, explicit maxDuration), reserve→stream→settle two-phase debit against the Phase 1 ledger, per-request context-size cap, server-injected (user-invisible) system-prompt safety/copyright instruction, generation logging.
**Uses:** Vercel AI SDK, chosen `@ai-sdk/<provider>` package, Tiptap's Decoration.widget for any inline UI, Phase 1's ledger RPCs.
**Avoids:** Pitfall 1 (cost runaway — guardrails ship as part of this feature, not after) and Pitfall 4 (moderation gap — system-prompt injection ships here, not with a deferred pipeline).
**Research flag:** Needs research-phase — final LLM vendor selection and its specific rate-limit/pricing/context-window behavior are not yet resolved anywhere in this research.

### Phase 5: Real PG integration
**Rationale:** Swaps the Phase 1 stub credit path for the real PG checkout + webhook behind the *same* `credit_wallet` interface — no ledger schema changes needed. Sequenced after the ledger is proven, but its *business/legal* prerequisites (사업자등록, PG merchant application) should start in parallel from Phase 1's kickoff, not wait for this phase, given the ~2+ week external review lead time.
**Delivers:** PG checkout session creation, signature-verified webhook handler (idempotent via `ledger_entries`'s unique(reference_id, type)), test→live credential cutover rehearsed end-to-end.
**Avoids:** Pitfall 2 (registration timing blocking launch) and the Anti-Pattern of crediting from the client-side redirect instead of the webhook.
**Research flag:** Needs research-phase — final PG vendor decision (Toss direct vs. PortOne abstraction, see Open Questions), and PortOne's exact webhook payload shape needs re-verification against live docs (the primary doc page 404'd during this research pass).

### Phase 6: Paid chapter unlock
**Rationale:** Thin feature on top of already-proven infrastructure (Phase 1 ledger + Phase 5 real payments); no new risk once both exist.
**Delivers:** Reader's "다음 화 보기 (N 토큰)" CTA wired to `debit_wallet`, purchase record granting permanent access, 402 → top-up-modal routing on insufficient balance.
**Research flag:** Standard pattern — skip research-phase.

### Phase 7: Spend cap / circuit breaker (platform-wide)
**Rationale:** Additive guard layered on top of the now-working AI Gateway + wallet, without touching prior steps.
**Delivers:** `spend_caps` aggregate counter, graduated alert thresholds (50/80/95%), hard stop behavior, fail-closed (not silent-degrade) on trip.
**Research flag:** Standard pattern — Architecture's Pattern 4 is fully specified; skip research-phase.

### Phase 8: Admin moderation surface
**Rationale:** Independent of AI/payment code beyond auth/roles; naturally last since it is lowest-risk, but its *reader-facing report button* dependency (Phase 3) and *system-prompt safety injection* dependency (Phase 4) must already exist — this phase is the queue/action UI on top of signals those phases produce.
**Delivers:** Report queue/dashboard with reason taxonomy, content-level takedown (blind/unpublish a chapter), account-level action (warn/suspend/ban) with visible history, resolution/audit trail.
**Avoids:** Pitfall 4 (moderation gap) — closes the loop the report button (Phase 3) and system-prompt injection (Phase 4) opened.
**Research flag:** Standard pattern (report → queue → action → audit trail is close to universal for UGC platforms) — skip research-phase.

### Phase Ordering Rationale

- **Ledger before AI, AI before real payments:** all three of Architecture, Features, and Pitfalls independently arrive at "prove the wallet with fake money first" — this is the single strongest cross-file signal in the research and should not be re-ordered for convenience (e.g., do not build the PG integration first just because it has external lead time; run PG *paperwork* in parallel instead, per below).
- **PG paperwork is a parallel track, not a sequential phase:** Pitfalls is explicit that business registration + PG merchant application should start at the *start* of the project's payment-adjacent work, not when Phase 5 begins in code. The roadmap should treat "start 사업자등록 + PG test-mode application" as a task that kicks off no later than Phase 1, tracked independently of the engineering phase sequence, so the ~2+ week external review clock runs concurrently with Phases 1-4.
- **System-prompt safety injection and the report button are cheap and load-bearing — do not let them slip to a "hardening" phase:** both ship inside the phases that already touch generation (4) and the viewer (3), per Pitfalls' explicit warning that these are the *only* proactive mitigations available given the SLM pipeline is deferred.
- **UI chrome (3-panel IDE, ghost-text, wiki-linking) stays out of every phase above:** Features' research is explicit that the differentiator (mention-based retrieval) is separable from and does not require the full IDE polish — keep every phase's writer-facing UI flat/functional, not the docs' full vision.

### Research Flags

Needs deeper research during planning:
- **Phase 4 (AI Gateway):** LLM vendor final selection is unresolved — no research file picks one, despite PROJECT.md stating vendor selection would be confirmed in the research stage. Needs a dedicated pass on vendor pricing/rate limits/context window before this phase is planned in detail.
- **Phase 5 (Real PG integration):** Toss-direct vs. PortOne-abstraction is unresolved (see Open Questions below), and PortOne's exact webhook payload shape needs re-verification against live docs before implementation (the primary doc page 404'd during this research pass, per Architecture's own note).

Phases with standard, well-documented patterns (skip research-phase):
- **Phase 1 (Foundation):** Postgres ledger/RPC pattern is fully specified in Architecture with schema and working RPC code.
- **Phase 2 (Studio core) and Phase 3 (Reader core):** Tiptap CRUD/editor usage and Korean-viewer table-stakes UX are both well-documented.
- **Phase 6 (Paid unlock) and Phase 7 (Spend cap):** Both are additive, fully-specified patterns on top of Phase 1/4 infrastructure.
- **Phase 8 (Admin moderation):** Report → queue → action → audit trail is a near-universal UGC pattern; no domain-specific research needed.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | Editor/streaming/BaaS choices verified against live npm registry + official docs (HIGH); Korean PG/legal specifics are MEDIUM-LOW and explicitly flagged as needing confirmation from a PG's own onboarding/compliance team before build |
| Features | MEDIUM | Korean webnovel viewer conventions and AI-writing-tool mention/context patterns are verified via multiple cross-checked sources; beta auth/onboarding is general SaaS best practice (not webnovel-specific); admin/moderation minimums are inferred from the domain's own risk profile rather than a directly comparable competitor teardown |
| Architecture | MEDIUM-HIGH | Next.js/Vercel runtime facts and the ledger/reserve-settle/webhook patterns are HIGH confidence (official docs + industry-standard ledger design references); PortOne-specific webhook payload mechanics are MEDIUM — the primary doc page 404'd during research and needs re-verification at implementation time |
| Pitfalls | MEDIUM-HIGH | LLM cost-control and ledger-concurrency patterns are HIGH confidence, well-documented; Korean PG/legal specifics (선불전자지급수단 threshold, PG review timing) are MEDIUM, cross-checked across multiple sources but explicitly not a substitute for a lawyer/PG 심사역 review; multi-agent handoff pitfalls (Pitfall 6, process-level) are MEDIUM, based on 2026 industry commentary rather than formal studies |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **LLM vendor not yet chosen.** PROJECT.md defers this to the research stage, but none of the four research files actually selects a vendor — Stack only shows installation commands for both `@ai-sdk/openai` and `@ai-sdk/anthropic` as illustrative options. Must be resolved before Phase 4 is planned in detail — treat as a blocking decision for the roadmap, not something to leave implicit.
- **Toss Payments (direct) vs. PortOne (abstraction layer) — final call not made.** Stack.md's dedicated PG section recommends Toss Payments' Payment Widget as the default (best documentation, single contract, single SDK, covers all major Korean methods in one integration) and frames PortOne as a reasonable alternative if PG-migration insurance is wanted. Architecture.md's system diagram and Integration Points section lean the other way, describing PortOne V2 as recommended over legacy 아임포트 v1, or Toss Payments directly via PortOne as the PG-abstraction layer. These are not contradictory in substance — both agree the underlying webhook-is-source-of-truth pattern and ledger integration are identical regardless of which is chosen — but the roadmap needs one explicit decision before Phase 5 (and ideally before Phase 1, since it may affect which entity the 사업자등록/merchant paperwork is filed against). Recommend defaulting to Toss Payments direct per Stack's more thoroughly-sourced comparison table, unless a specific reason to want PG-agnosticism (multiple PGs, 가상계좌 support) emerges — but flag this explicitly for founder confirmation rather than silently picking one during roadmap creation.
- **선불전자지급수단 exemption — not yet confirmed by a compliance authority.** Both Stack and Pitfalls independently conclude the v1 design (no cash-out, no cross-creator token movement, single-merchant closed loop) likely qualifies for the exemption, and agree this is not blocking for v1 — but neither treats this as verified. Add an explicit, low-urgency task to get this confirmed by the chosen PG's compliance team (both Toss and PortOne's onboarding staff routinely field this exact question) during Phase 5, and treat it as a hard blocker before ever scoping the asset store or cash-out in a future milestone.
- **PG business registration lead time / current status unknown.** Pitfalls identifies this as potentially the actual critical path to a beta launch date — the research assumes this is not yet resolved, since PROJECT.md does not mention it. This should be confirmed with the founder immediately (is a 사업자등록 already in place, or does it need to be filed from scratch?) since the answer changes how early the parallel PG-paperwork track (see Phase Ordering Rationale) needs to start relative to Phase 1.
- **PortOne webhook payload shape (if PortOne is chosen)** needs re-verification against live PortOne console docs at implementation time — Architecture.md notes the specific doc page returned a 404 during this research pass; the webhook-is-source-of-truth *pattern* is HIGH confidence, but the exact payload shape is MEDIUM confidence.
- **Reader-facing "written with AI" / opt-in lore-wiki showcase** remains an open product question (flagged in the original docs and carried forward by Features research as a v1.x candidate, not a commitment) — no research conclusively resolves whether this is worth building; leave as a backlog item pending beta feedback, not a phase.

## Sources

### Primary (HIGH confidence)
- npm registry queries (2026-08-25) for exact package versions and peer dependencies (Tiptap 3.30.x, ai 7.0.x, @ai-sdk/openai 4.0.x, @supabase/supabase-js 2.112.x)
- Tiptap official docs (tiptap.dev) — Mention/Suggestion API shape
- ai-sdk.dev migration guides (v5-v7) — SSE-native architecture, Next.js/React 19 compatibility
- Vercel official docs (functions/limitations, functions/configuring-functions/duration) — runtime/maxDuration facts
- Toss Payments official developer docs (docs.tosspayments.com) — widget capabilities, settlement cycles
- Next.js 16 official blog + Strapi's Next.js 16 Route Handlers writeup — confirms Edge runtime removal for route handlers
- Modern Treasury (Designing Ledgers with Optimistic/Pessimistic Locking) — industry-standard ledger concurrency reasoning
- 국가법령정보센터, 전자금융거래법 시행령 — primary legal source for 선불전자지급수단 thresholds
- 전자상거래 등에서의 소비자보호에 관한 법률 (청약철회 예외, 디지털콘텐츠) — primary legal source for digital-content refund exceptions
- .planning/PROJECT.md — authoritative MVP scope, Active/Out-of-Scope requirements, Key Decisions

### Secondary (MEDIUM confidence)
- Multiple 2026 Tiptap-vs-Lexical comparison sources, cross-checked and consistent
- Tiptap AI Toolkit pricing sources (not on Tiptap's own public pricing page)
- easyspark.io 2026 Toss Payments vs. PortOne comparison (single source, consistent with official docs' framing)
- KakaoPay partner docs — merchant examination process
- Supabase-vs-Neon 2026 comparison sources, consistent across multiple independent sources
- Sudowrite/NovelCrafter comparison sources — Codex/Story Bible context-injection mechanism
- Ridibooks 고객센터 — Korean reading-viewer baseline UX conventions
- PortOne 토스페이먼츠 계약절차 가이드 — PG contract/review process description
- 김앤장 Finance Legal Update — 2024 전자금융거래법 amendment analysis (major law firm, but application to this specific product is MEDIUM)
- dev.to double-entry ledger race-condition writeup — corroborates lost-update risk under READ COMMITTED
- Multiple 2026 avoid-runaway-LLM-costs vendor blogs (TrueFoundry, Nexgismo, Hiflylabs) — cross-checked, consistent 3-layer guardrail pattern
- Augment Code / Stack Overflow Blog (Aug 2026) — spec-driven multi-agent development, interpretive-drift failure mode

### Tertiary (LOW confidence)
- FSC (금융위원회) publications and legal-interpretation portal on 선불전자지급수단 exemptions — general framework well-sourced, but application to this specific product's design needs direct confirmation from a PG's compliance team or a lawyer, not treated as final
- PortOne server-sdk webhook payload documentation — primary doc page 404'd during this research pass; re-verify at implementation time

---
*Research completed: 2026-08-25*
*Ready for roadmap: yes — with the LLM vendor choice, Toss-vs-PortOne final call, and PG registration lead time flagged as decisions to make explicitly during roadmap creation or immediately after, not silently deferred into Phase 4/5 planning*
