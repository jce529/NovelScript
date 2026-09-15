# Feature Research

**Domain:** AI-assisted webnovel writing & reading platform (Korean market, dual writer/reader loop, real-payment beta)
**Researched:** 2026-08-25
**Confidence:** MEDIUM (Korean webnovel viewer conventions and AI-writing-tool mention/context patterns verified via multiple sources; beta auth/onboarding patterns are general SaaS best practice, not webnovel-specific; admin/moderation-tooling minimums are inferred from the domain's own risk profile rather than a directly comparable competitor's public spec)

## Context: What the source docs assume vs. what the MVP needs

The `docs/` folder describes a finished product across four surfaces: Reader Space (main domain), Studio/Web-IDE (writer subdomain), Asset Store (subdomain), and a global payment/header layer — all sharing one token economy with cash-out. `PROJECT.md` already cuts this down to a single validated loop: **write with AI-assisted context injection → publish → read → pay real money for tokens → consume tokens on chapters**, with moderation done by a human, not a pipeline. This file evaluates the *rest* of the docs' feature surface (viewer polish, 3-panel IDE, ranking algorithm, moderation pipeline, asset store, BYOK, cash-out) against that narrower MVP hypothesis, and separately researches ecosystem conventions (Korean webnovel viewers, AI fiction-writing tools, beta-launch auth patterns) to fill in what the docs don't specify at MVP fidelity (auth/onboarding, minimum admin tooling).

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete or the loop breaks entirely.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Email/social login + minimal profile (nickname, role toggle writer/reader) | Any community-distributed beta needs near-zero-friction signup; Korean users expect Kakao/Naver/Google OAuth as a baseline, not email+password alone | LOW | See "Auth & Onboarding" section below for MVP-specific scoping |
| Reading viewer: font size control, dark/light (or paper-tone) theme, adjustable line/paragraph spacing | Verified via Korean market research (Ridibooks and peer viewers): brightness, font size/family, and background/theme toggles are baseline expectations for any Korean text-reading product, not a differentiator | LOW–MEDIUM | Table stakes even at MVP; skipping this makes the reader feel unfinished on day one |
| Chapter navigation: prev/next chapter, chapter list/table of contents, resume-from-last-read | "이어보기" (resume reading) is a standard, expected feature in Korean reading apps; missing it causes visible drop-off since readers serial-consume across sessions | LOW–MEDIUM | Needs per-user "last read position" persisted; simple chapter-index bookmark is sufficient, no need for scroll-depth precision |
| Chapter list with paid/free/owned status visible before entering | Readers need to know cost before commit; ambiguity here directly increases payment abandonment | LOW | Directly required by the "consume tokens on chapters" loop |
| Discovery/browse: title, cover/thumbnail, synopsis, simple sort (new/popular) | Baseline expectation for any content marketplace; without it there's no path from "landed on site" to "started reading" | LOW–MEDIUM | Simplified ranking (view count, likes, next-chapter click-through) is explicitly in scope per PROJECT.md — full scroll-depth algorithm is deferred |
| Writer: markdown knowledge-base with the 5 entity templates (인물/장소/사건/세력/아이템) | This is the stated killer-feature precondition — without a place to define characters/places, `@`-mention context injection has nothing to inject | MEDIUM | Free-text markdown + template scaffolding is enough; wiki-linking (`[[ ]]`) and Graph View are NOT required for MVP (see Anti-Features/Deferred) |
| Writer: `@`-mention autocomplete in the main editor that inserts/attaches KB documents as context | This is the core value prop stated in PROJECT.md ("작가가 실제로 반복해서 집필"); without working mention UX there is no differentiated writing loop, just a chat box | MEDIUM–HIGH | See "Writer-side AI context/mention UX" section below for MVP fidelity vs. full 3-panel IDE |
| Writer: visible "what's currently in context" list before/during generation | Verified against comparable tools (NovelCrafter's Codex, Sudowrite's Story Bible): every credible AI-fiction tool that does context injection shows the writer what's being fed to the model — this is not a "nice to have," it's the mechanism that makes mention-based control trustworthy | LOW–MEDIUM | Can be a simple list/chips row, does not need the full "context inventory chip panel" polish from docs/5-2 |
| 3-tier preset selector (beginner/intermediate/freeform) visible in the writing UI | Explicit MVP requirement in PROJECT.md; also the mechanism by which novice writers get usable output without prompt-engineering skill | LOW | Preset = predefined system-prompt template + UI label; no need for the "system prompt modal" customization UI beyond freeform tier |
| Chapter publish/draft state + basic chapter metadata (title, order, free/paid, price) | Without publish state, there's no "reader" side of the loop to validate | LOW | |
| Real payment: token purchase via PG, wallet balance display, balance deduction on paid-chapter unlock | Explicit, non-negotiable MVP requirement (real PG from day one, per Key Decisions) | MEDIUM–HIGH | This is the highest-risk table-stakes item — PG integration (KYC, webhook reconciliation, idempotent balance updates) is unfamiliar territory relative to the rest of the stack; flag for phase-specific research |
| "Report content" button/flow visible to readers | Without *some* reporting surface, the only moderation input source disappears, and a human-only moderation model becomes non-functional on day one | LOW | See "Minimum admin/moderation tooling" section — this is the single most load-bearing table-stakes item for the anti-abuse hypothesis |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required for the loop to function, but they're where NovelScript could win vs. generic Korean webnovel platforms (Novelpia, Munpia, 조아라) or generic AI writing tools (Sudowrite, NovelCrafter).

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Multi-document simultaneous `@`-mention (combine `@character` + `@item` + `@location` in one call) | This is the actual differentiator vs. both plain LLM chat (no structured context) and generic story-bible tools (usually single-document or auto-injected, less writer-controlled) | MEDIUM | Already scoped as MVP-required per PROJECT.md — listing here to flag it as the thing worth polishing first if time is tight, since it's the differentiator, not just a table-stakes checkbox |
| Token/cost gauge bar showing estimated spend before generating | NovelCrafter and Sudowrite do not expose raw token-cost transparency to this degree; for a platform funding AI cost from real revenue, writer-facing cost transparency doubles as a cost-control mechanism for the platform itself | LOW–MEDIUM | Cheap to build (character-count-based estimate is enough, doesn't need exact tokenizer parity) and reduces platform's runaway-cost risk — worth pulling forward even though full docs treat it as a "dashboard" feature |
| Reader-facing "이 회차는 어떤 프리셋으로 썼는지" / partial lore-wiki showcase (opt-in) | Explicitly flagged as an open question in the original spec docs (docs/2, closing question) — no other Korean webnovel platform surfaces AI-authorship metadata to readers; this could be a genuine novelty hook for a beta audience specifically curious about AI-assisted writing | MEDIUM | Not required for MVP loop validation; consider as a v1.x cheap add if writer opt-in KB fields already exist — flag as open question for roadmap, not a commitment |
| Dynamic recommended-prompt chips (context-aware quick actions like "심화시키기") for beginner-tier writers | Lowers the skill floor for non-technical writers who churn fastest without visible next-actions | MEDIUM | Genuinely differentiating for the beginner-preset persona, but not required to validate the core loop — good v1.x candidate |
| Ghost-text inline AI continuation (Tab-to-accept) | Real differentiator in the AI-fiction-tool market (comparable to GitHub Copilot-style UX) and matches what Sudowrite-caliber tools offer | HIGH | High complexity (debounced streaming completion UX) for a beta whose hypothesis is "does the mention-context loop work," not "is inline autocomplete good" — treat as v2, not MVP |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create disproportionate risk or complexity relative to what this beta needs to validate. These map directly to `PROJECT.md`'s Out of Scope list, plus a few additional risks surfaced by this research.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| Asset marketplace (sell worldbuilding templates/prompts between writers) | Docs frame it as a second revenue stream and "lowers entry barrier for new writers" | Requires its own discovery UI, cart/checkout flow, IP/plagiarism concerns on *sold* templates, and a second monetization mental model — before the core write/read/pay loop is even validated. Also implies default-private-vs-opt-in visibility logic on KB docs that adds real backend complexity | Already correctly deferred in PROJECT.md; do not resurrect during roadmap phase-splitting even as a "quick win" |
| BYOK (bring-your-own-API-key) with encrypted key vault | Docs treat it as necessary for "heavy users" and ties into the dual-billing model | Adds an entire secrets-management subsystem (encryption at rest, per-call decrypt, key validation, per-vendor key format handling) for a persona (power users who already have API keys) that doesn't exist yet in a beta recruited from a general writer/reader community | Single platform-key vendor for all users, exactly as scoped; revisit only if beta data shows heavy users hitting cost/rate ceilings |
| Token cash-out / creator payout | Docs' "DevEx model" — self-reinforcing token economy where writers earn real money | Real-money payout requires tax/reporting compliance, anti-fraud on payout requests, and reconciliation logic layered on top of the PG integration that's already the highest-complexity item in scope. Combining "take payments" and "issue payouts" in the same beta multiplies financial/regulatory surface area | Explicitly deferred in PROJECT.md; token spend stays one-directional (cash → token → consumption) until the loop is validated |
| SLM-based automated pre-moderation pipeline (synopsis-content consistency check, plagiarism detection) | Docs treat this as necessary platform hygiene ("양산형 텍스트 필터링") | Requires standing up an async job queue, a second (lighter) model integration, threshold-tuning work, and false-positive-handling UX — meaningful infra investment before there's any usage data to tune it against | Deferred correctly; human admin review substitutes for now (see Minimum Admin Tooling below) — but note this creates a real gap, documented in that section |
| 3-Strike automated sanctions | Docs treat this as the terminal enforcement mechanism | Automated account-level penalties require a strike-counting data model, appeals/override path, and get real consequences wrong if the *underlying* detection (which is deferred) is manual and inconsistent — automating punishment on top of a manual, judgment-based input source is risky | Manual, case-by-case admin action (warn/blind/suspend) with no automatic strike counter for v1 |
| Full 3-panel Web IDE (left: file tree + drag-drop KB; center: ghost-text canvas; right: chat + context chips + system-prompt modal) as originally specced | Docs present this as "the" writer experience and it reads as impressive/complete | Building three fully-interactive, state-synced panels (Zustand-driven, zero-latency) before validating that writers even want mention-based context control at all is significant UI investment against an unvalidated hypothesis | Build a flatter MVP UI: KB list/editor (can be a simple CRUD list, not a draggable tree), one writing canvas with `@`-autocomplete, and a lightweight sidebar/panel for preset + context list + generate button. Panels don't need drag-drop, graph view, or a separate system-prompt modal beyond the freeform-tier's plain textarea |
| Wiki-linking (`[[Entity]]`) + Graph View visualization of KB relationships | Reads as a natural companion to a markdown KB and is cheap to imagine as "just add bracket syntax" | Graph View specifically is a nontrivial rendering feature (force-directed graph, relationship inference) that has zero bearing on whether `@`-mention context injection works; conflates "nice knowledge-management tool" with "AI context control mechanism" | Skip entirely for MVP; `@`-mention already provides the retrieval mechanism the KB needs to serve. Revisit wiki-linking only if beta writers report struggling to navigate large KBs |
| Precision scroll-depth "valid completion rate" tracker (scroll speed/position telemetry, anti-idle filtering) | Docs treat it as essential for a "real" ranking signal, distinct from vanity view counts | Requires client-side scroll-tracking instrumentation, server-side idle/gaming detection heuristics, and tuning against abuse patterns that don't yet exist at beta scale — a lot of engineering to protect a ranking signal for a small, community-sourced beta cohort where gaming incentives are low | Simplified signal (view count, like count, next-chapter click-through rate) as explicitly scoped in PROJECT.md; revisit once there's real traffic and any evidence of ranking gaming |
| Rich onboarding: tutorial walkthroughs, tooltips, guided first-KB-doc wizard | Feels necessary because the writer-side concept (mention-based context injection) is genuinely unfamiliar to most users | For a small, community-recruited beta, high-touch onboarding UI is a lot of build effort for a cohort that can tolerate (and will actively want to give feedback on) a rougher, more direct experience; also risks becoming a maintenance burden as the underlying UI still changes during beta | Minimal in-product empty-states with 1-2 lines of guidance ("Add a character, then try @mentioning them in your first chapter") + a community channel (Discord/Kakao) for real-time support — cheaper and arguably more effective for this specific launch model |

## Feature Dependencies

```
Markdown Knowledge Base (5 templates)
    └──requires──> nothing (foundational)

@-Mention Context Injection
    └──requires──> Markdown Knowledge Base (needs documents to mention)
    └──requires──> Writing Canvas / main editor
    └──requires──> Preset system (mentions feed into a preset-wrapped prompt)

3-Tier Preset Selector
    └──requires──> nothing structurally, but ships alongside @-Mention (same editor surface)

Chapter Publish/Draft
    └──requires──> Writing Canvas (need content to publish)

Reader Discovery/Browse
    └──requires──> Chapter Publish (nothing to discover without published content)

Reading Viewer
    └──requires──> Chapter Publish
    └──enhances──> Reader Discovery (viewer is the destination discovery routes to)

Simplified Ranking Signal
    └──requires──> Reading Viewer (needs read events to compute view/like/click-through)
    └──requires──> Reader Discovery (ranking surfaces INTO discovery)

Real PG Token Wallet
    └──requires──> Auth/Account system (wallet is tied to a user)
    └──enables──> Paid Chapter Unlock (viewer checks wallet balance before showing paid content)

Paid Chapter Unlock
    └──requires──> Real PG Token Wallet
    └──requires──> Reading Viewer
    └──requires──> Chapter Publish (chapter must have a price)

Report Button (reader-facing)
    └──requires──> Reading Viewer (needs to be embedded in the read surface) and Novel Detail page

Admin Manual Moderation Tooling
    └──requires──> Report Button (primary signal source without automated pipeline)
    └──requires──> Chapter Publish (needs something to blind/unpublish)

Auto SLM Pre-Moderation Pipeline (DEFERRED)
    └──would enhance──> Admin Manual Moderation Tooling (adds a second signal source)
    └──conflicts with──> "manual review only" MVP constraint — explicitly deferred, do not partially build

Full 3-Panel Web IDE (DEFERRED shape)
    └──enhances──> @-Mention Context Injection (better UX, not new capability)
    └──conflicts with──> MVP timeline — same underlying capability achievable with a flatter UI

Cash-out / Creator Payout (DEFERRED)
    └──requires──> Real PG Token Wallet (needs an existing balance/ledger to pay out from)
    └──conflicts with──> "validate the loop before adding financial compliance surface" constraint

Asset Marketplace (DEFERRED)
    └──requires──> Markdown Knowledge Base (nothing to sell without it)
    └──requires──> Real PG Token Wallet / token economy (needs a currency to transact in)
    └──conflicts with──> MVP scope — deliberately excluded despite being technically dependent-and-ready once KB + wallet exist
```

### Dependency Notes

- **@-Mention Context Injection requires Markdown Knowledge Base:** the mention system has nothing to retrieve/inject without KB documents existing first — KB CRUD must ship in an earlier phase (or same phase, built first) than the mention/generation feature.
- **Paid Chapter Unlock requires Real PG Token Wallet AND Chapter Publish:** this is a three-way join (auth + payment + content) — sequence payment integration so it lands before or alongside the reader-payment phase, not as an afterthought bolted onto an already-shipped free viewer.
- **Admin Manual Moderation Tooling requires Report Button as its primary signal source:** since the SLM pre-moderation pipeline is deferred, the report button is not optional polish — it is the *entire* detection mechanism for v1. Treat it as equally load-bearing as the report queue/dashboard itself.
- **Full 3-Panel Web IDE enhances but does not gate @-Mention Context Injection:** the differentiator (multi-doc mention injection) can ship with a much flatter UI; don't let the "impressive IDE" scope creep delay validating the actual mechanism.
- **Auto SLM Pipeline conflicts with the manual-review MVP constraint:** resist the temptation to build "just the queue" or "just the consistency check" as a partial version — a half-built automated pipeline without tuning data is worse than a clean manual-only process, and PROJECT.md already made this call explicitly.

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the concept (mirrors PROJECT.md Active requirements, refined with feature-research detail).

- [ ] Auth: email/social login (pick 1-2 providers, Kakao or Google recommended for Korean beta audience), minimal profile, writer/reader are just roles on one account (not separate signup flows)
- [ ] Writer: markdown KB CRUD across 5 templates (인물/장소/사건/세력/아이템), flat list UI (no drag-drop, no graph view)
- [ ] Writer: main editor with `@`-mention autocomplete pulling from KB, multi-doc selection, visible "in context" list/chips
- [ ] Writer: 3-tier preset selector (beginner/intermediate/freeform) with freeform allowing a plain custom-instruction textarea (not a full system-prompt modal)
- [ ] Writer: token/cost estimate indicator before generating (cheap character-count-based estimate is sufficient)
- [ ] Writer: chapter draft/publish with title, order, free/paid flag, price
- [ ] Reader: discovery/browse with cover, title, synopsis, simplified ranking (views/likes/next-chapter click-through)
- [ ] Reader: viewer with chapter nav (prev/next/TOC), font size + theme toggle, resume-from-last-read
- [ ] Reader: report-content button on novel detail + viewer
- [ ] Payments: real PG-integrated token purchase, wallet balance display, deduction on paid-chapter unlock
- [ ] Admin: manual report queue/dashboard + ability to unpublish/blind a chapter and see basic user history (see next section for full minimum spec)

### Add After Validation (v1.x)

Features to add once core loop is working and beta data exists.

- [ ] Wiki-linking (`[[ ]]`) between KB docs — add if writers report struggling to navigate/reference their own KB
- [ ] Dynamic recommended-prompt chips for beginner tier — add if beginner-tier writers show high drop-off/confusion
- [ ] Reader-facing opt-in lore-wiki / AI-authorship showcase — add as a novelty/differentiator once core loop is stable and there's writer appetite for opt-in visibility
- [ ] Richer admin tooling (search/filter on report queue, audit log UI, canned-response templates) — add once report volume exceeds what a flat list can handle
- [ ] Ghost-text inline AI continuation — add once mention-based generation UX is validated as the right mechanism

### Future Consideration (v2+)

Features to defer until product-market fit (i.e., "do writers/readers actually use this loop") is established.

- [ ] Full 3-panel Web IDE polish (drag-drop file tree, dedicated system-prompt modal, zero-latency Zustand-synced panels) — defer until the flatter MVP UI proves the underlying mechanism is wanted
- [ ] BYOK + API key vault — defer until beta shows heavy-user cost/rate pressure that a single platform key can't absorb
- [ ] Token cash-out / creator payout — defer until there's a stable writer base earning meaningful tokens worth cashing out
- [ ] Asset marketplace — defer until the core write/read/pay loop is validated and writers have built KB assets worth selling
- [ ] SLM-based automated pre-moderation pipeline + 3-strike auto-sanctions — defer until manual moderation reveals concrete volume/pattern data to tune automation against
- [ ] Precision scroll-depth "valid completion rate" ranking algorithm — defer until there's real traffic and evidence the simplified signal is being gamed or is insufficiently accurate

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Auth + minimal profile | HIGH | LOW | P1 |
| Markdown KB (5 templates) | HIGH | MEDIUM | P1 |
| `@`-Mention context injection (multi-doc) | HIGH | MEDIUM–HIGH | P1 |
| 3-tier preset selector | HIGH | LOW | P1 |
| Chapter publish/draft | HIGH | LOW | P1 |
| Reading viewer (font/theme/nav/resume) | HIGH | LOW–MEDIUM | P1 |
| Discovery + simplified ranking | HIGH | LOW–MEDIUM | P1 |
| Real PG token wallet + paid unlock | HIGH | HIGH | P1 |
| Report button (reader-facing) | HIGH | LOW | P1 |
| Manual admin moderation dashboard | HIGH | LOW–MEDIUM | P1 |
| Token/cost gauge (estimate) | MEDIUM | LOW | P2 |
| Wiki-linking between KB docs | MEDIUM | MEDIUM | P2 |
| Dynamic recommended-prompt chips | MEDIUM | MEDIUM | P2 |
| Reader-facing AI-authorship showcase | MEDIUM | MEDIUM | P2 |
| Ghost-text inline continuation | MEDIUM | HIGH | P3 |
| Full 3-panel IDE polish (drag-drop, modal) | LOW–MEDIUM | HIGH | P3 |
| Graph View for KB | LOW | HIGH | P3 |
| BYOK + key vault | LOW (no current persona) | HIGH | P3 |
| Token cash-out / payout | LOW (no current persona) | HIGH | P3 |
| Asset marketplace | LOW (unvalidated demand) | HIGH | P3 |
| SLM pre-moderation pipeline | MEDIUM (risk mitigation) | HIGH | P3 |
| 3-strike auto-sanctions | LOW at beta scale | MEDIUM | P3 |
| Scroll-depth precision ranking | LOW at beta scale | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

---

## Deep-Dive: The four specific questions

### 1. Minimum viable auth/onboarding for a community-distributed beta with unknown scale

**Table stakes, not a differentiator.** General SaaS/beta best practice (not webnovel-specific, MEDIUM confidence — cross-checked across multiple 2025-2026 sources on MVP auth patterns) converges on a small set of moves:

- **Pick 1-2 login methods and use a managed auth provider** (e.g., Supabase Auth, which the project's stack already leans toward per PROJECT.md context) rather than building auth from scratch. For a Korean community-recruited audience, prioritize whichever social provider that community already uses daily — Kakao or Google are the standard low-friction choices; do not build a custom email/password-only flow as the *only* option, since that adds friction precisely where the goal is "low onboarding friction" (explicitly stated as a constraint in PROJECT.md).
- **One account, two roles, not two signup flows.** Since the founder wants both writer and reader participation from the same recruited pool, don't force users to choose "I am a writer" vs "I am a reader" at signup — let anyone read, and expose a "start writing" entry point that upgrades the same account. This avoids arbitrary segmentation of a small beta cohort and matches how most people will behave anyway (read others' work, then try writing).
- **No admin-approval gate / invite-code gate needed.** PROJECT.md explicitly states "초대 인원 제한 없이 열 계획" (no invite cap planned) — so building an invite-code or waitlist-approval system would be over-engineering against the founder's own stated intent. Skip it.
- **No rich onboarding tutorial required for v1.** Because this is a small, community-sourced, feedback-motivated beta (not a cold-acquisition funnel), a heavy guided-tour UI is disproportionate effort. A couple of inline empty-state hints plus a community support channel (Discord/Kakao chat, external to the product) covers this more cheaply and is more consistent with how beta cohorts typically get onboarded outside the product itself.
- **Unknown scale is a backend/infra concern, not a features concern** — flag for the architecture/infra research thread (rate limiting, PG account limits, DB connection pooling) rather than the feature list, but note it here since "auth for unknown scale" was explicitly asked: the auth *feature surface* itself (login, session, role toggle) does not change with scale; what changes is capacity planning, which belongs in ARCHITECTURE.md/STACK.md, not this file.

### 2. What a "good enough" reading viewer needs at MVP fidelity

Verified against Korean webnovel/e-book viewer conventions (Ridibooks and comparable Korean reading apps, MEDIUM confidence via web research): the table-stakes bar in this specific market is **higher than a generic English-language MVP reader** because Korean readers already have well-established viewer expectations from incumbent platforms (Ridibooks, Munpia, Novelpia, Kakao Page). The "good enough" bar is:

- **Chapter navigation:** prev/next chapter buttons, a chapter list/table of contents accessible from the viewer, and resume-from-last-read (이어보기) — this last one specifically came up as a standard, expected feature, not a stretch goal.
- **Font/theme controls:** font size adjustment and at least one alternate theme (dark mode, or a "paper"/sepia-style background) are baseline, not differentiators — their absence will read as "unfinished" to a Korean beta audience used to incumbent apps, even though this is a beta. Line-spacing/paragraph-width controls are a nice-to-have layer on top but not strictly required for v1.
- **Progress tracking:** simple "last read chapter" persistence per user is sufficient — do NOT build precision scroll-depth tracking for the viewer itself. That's explicitly deferred (PROJECT.md), and per the docs (5-1), scroll-depth tracking was originally meant to feed the ranking algorithm, not the reading experience — since ranking is simplified for v1, there's no reason to instrument scroll behavior in the viewer at all.
- **What NOT to build:** the docs' full vision (5-1) includes a lore/wiki tab with AI-generated illustrations, spoiler auto-redaction based on reader progress, a bottom-sheet purchase-and-review prompt on scroll-end, and a "명예의 전당" review-magazine home layout. All of these are legitimate differentiators for a mature product but are unnecessary to validate "does a reader read chapters and pay for the next one" — the core hypothesis. A simple bottom/inline "다음화 보기 (N 토큰)" CTA at chapter end covers the payment-trigger mechanism without the review/curation machinery around it.

### 3. What a "good enough" writer-side AI context/mention UX needs at MVP fidelity vs. the full 3-panel IDE

Verified against comparable AI-fiction tools (NovelCrafter's Codex, Sudowrite's Story Bible — MEDIUM confidence, cross-referenced across several 2025-2026 comparison sources): the core mechanism that makes mention-based context injection valuable is **precise, writer-controlled retrieval at generation time**, not the surrounding IDE chrome. NovelCrafter's differentiator over static story-bible dumps is specifically that "the AI receives information about a character precisely when that character is mentioned" — this is the same mechanism NovelScript's `@`-mention system is built around, and it validates that the mechanism itself (not the 3-panel layout) is the thing worth shipping first.

**MVP-sufficient writer UX:**
- One writing canvas with a functioning `@`-autocomplete that searches KB documents by name/type and inserts a mention reference.
- A visible list of "currently mentioned / in context" documents (can be a simple horizontal chip row or sidebar list — does not need to be a fully separate "AI co-worker panel").
- Preset selector (3 buttons/dropdown) visibly attached to the generate action.
- A "Generate" action that sends mentioned-doc content + preset + user instruction to the LLM and returns text into the canvas (accept/insert, not necessarily inline ghost-text streaming).
- Token/cost estimate shown before generating (cheap to build, high trust value, addresses the platform's own cost-control interest).

**Explicitly NOT needed at MVP fidelity** (full vision from docs/5-2, all legitimate v2+ polish, not validation-blocking):
- Three fully separate, drag-and-drop-managed, Zustand-synced panels.
- Dedicated file-tree explorer with folder hierarchy and drag-drop reorganization for KB docs (a flat, filterable list per template type is sufficient).
- "Quick Add" overlay for creating new KB entries mid-typing without leaving the canvas — convenient, but a simple "create new document" flow via a separate KB screen validates the same underlying mechanism, just with one extra click.
- Ghost-text ("Tab to accept") inline autocomplete — this is a distinct feature (predictive continuation) from mention-based context injection (retrieval-augmented generation on demand) and shouldn't be conflated with it; it's a legitimate differentiator but not required to prove the mention mechanism works.
- Dedicated system-prompt customization modal — the freeform preset tier can just be a plain textarea for custom instructions; a polished modal is UI investment that doesn't change the underlying capability.
- Real-time cost gauge with color-graded (green-to-red) visualization and "관계 지역성 가중치" (relational-locality weighting) — an estimate number/simple bar is enough; the weighting sophistication described in the docs is tuning work that requires usage data the beta doesn't have yet.

**Net: the differentiator (multi-doc mention-based retrieval) is separable from the IDE chrome.** Building the flat version first is lower-risk and directly testable against the hypothesis; the 3-panel polish can follow once there's evidence writers actually want to work this way repeatedly.

### 4. Absolute minimum admin/moderation tooling with no automated pipeline

This is the area where skipping too much creates real risk, since removing the SLM pre-moderation pipeline (per PROJECT.md's explicit Out-of-Scope decision) doesn't remove the underlying problem it was meant to solve (양산형 텍스트, 낚시성 글, 표절, 설정 붕괴) — it just removes the automated *detection* layer. **What breaks without any stopgap:** problematic content (plagiarism, spam chapters, content/synopsis mismatch, harassment in reviews if those exist) stays live indefinitely because there's no signal generation mechanism at all — admins can't review what they don't know exists. The single most important thing the manual stopgap must cover is **signal generation**, not just a review UI.

**Absolute minimum, in priority order:**

1. **Reader-facing report button** on the novel detail page and inside the viewer (already listed as table stakes above). Without this, there is zero signal flow into the admin side — this is not optional, it is the entire replacement for the deferred SLM pipeline's detection function.
2. **Admin report queue/dashboard**: a simple list of open reports (reporter, target content, reason category, timestamp, status). Needs at minimum a "reason" taxonomy (e.g., plagiarism, spoiler/synopsis-mismatch, spam/low-effort, harassment/inappropriate) even without automated classification, because triage without any categorization becomes unmanageable past a handful of reports.
3. **Content-level takedown action**: ability for an admin to unpublish/blind a specific chapter (not just delete/ban at the account level) — matches the docs' own "Blind" concept (5-1/3.4) but manually triggered instead of automatically triggered by SLM output.
4. **Account-level action**: warn, suspend, or ban a user account, with a visible reason logged against that user (even a simple text note) — needed because report-driven moderation without any persistent record per account means every incident is evaluated in isolation with no memory of repeat offenders, which is precisely the risk the (deferred) 3-strike system was meant to address systematically. A manual equivalent — "admin can see this user's past reports/actions on one screen" — is the minimum viable substitute.
5. **Resolution/audit trail**: mark a report resolved/dismissed with a short admin note. This matters even at beta scale because a single admin (likely the founder or a small team) needs to avoid re-reviewing the same report, and because manual moderation decisions without any record become impossible to audit for consistency later.

**What can be skipped even in this minimal stopgap:**
- Automated classification/severity scoring of reports (that's exactly the SLM layer being deferred).
- Any auto-triggered account suspension based on report *count* thresholds (3-strike logic) — every account-level action stays a manual admin judgment call for v1.
- A separate "blind log" ML-driven false-positive/true-positive dashboard (docs/5-1's "블라인드 로그" concept) — a flat report list with status fields covers the same functional need without the automated-log machinery.
- Plagiarism/consistency-specific tooling (side-by-side text comparison, similarity scoring) — for a beta-scale community launch, manual admin judgment on a reported chapter is sufficient; building comparison tooling ahead of any evidence of actual plagiarism incidents is premature.

**Confidence note (LOW-MEDIUM):** unlike the reading-viewer and mention-UX sections, this section isn't grounded in a directly comparable "how do other community-beta content platforms handle manual-only moderation" competitor teardown — it's inferred from (a) the explicit deferral decisions already made in PROJECT.md and (b) general content-moderation-tooling patterns (report → queue → action → audit trail) that are close to universal across UGC platforms. Recommend validating this against real report volume once the beta is live; if report volume is higher than a single admin can handle manually, the case for pulling forward some automated triage (not full SLM pipeline, just simple keyword/rate-based flags) gets stronger quickly.

## Sources

- Context: `.planning/PROJECT.md` (authoritative MVP scope, Active/Out-of-Scope requirements, Key Decisions)
- `docs/2. 핵심 기능 요구사항.md` — full-vision core feature spec (KB, mention injection, cost dashboard, SLM pre-moderation, dual billing/BYOK)
- `docs/3. 비즈니스 모델 및 사용자 정책.md` — token economy, cash-out, asset store opt-in policy, ranking algorithm intent, 3-strike policy
- `docs/4. 시스템 아키텍처 및 기술 스택.md` — referenced by other docs for algorithm/pipeline detail (not independently re-read in this pass; flagged for architecture-track research if needed)
- `docs/5-1.독자 공간 UI,UX 설계 및 운영 시스템.md` — reader-space full vision (discovery, novel detail, viewer, SLM pipeline)
- `docs/5-2 집필 공간 UI,UX 설계 및 명세.md` — writer-space full vision (3-panel Web IDE, mention autocomplete, ghost text, cost gauge)
- `docs/5-4 통합 결제 시스템 및 글로벌 헤더 (UI,UX & BM).md` — payment/GNB cross-cutting UX, subscription + a-la-carte token model
- [Sudowrite vs Novelcrafter: Which AI Writing Tool Is Better for Fiction Writers](https://ilampadmanabhan.medium.com/sudowrite-vs-novelcrafter-which-ai-writing-tool-is-better-for-fiction-writers-bdc3f33ba95f) — context-injection/Codex mechanism comparison, MEDIUM confidence
- [Sudowrite: Your Ultimate AI Partner for Novel Writing (and a look at Novelcrafter)](https://sudowrite.com/blog/sudowrite-your-ultimate-ai-partner-for-novel-writing-and-a-look-at-novelcrafter/) — Story Bible vs Codex philosophy, MEDIUM confidence
- [리디 웹뷰어 활용 방법 - 고객센터](https://ridihelp.ridibooks.com/support/solutions/articles/154000207690) — Korean reading-viewer baseline UX (font, brightness, background), MEDIUM confidence
- WebSearch synthesis on MVP authentication/onboarding best practices (Scalekit, PropelAuth, Webscension blogs) — general SaaS pattern, MEDIUM confidence, not webnovel-specific

---
*Feature research for: AI-assisted webnovel writing & reading platform MVP (NovelScript)*
*Researched: 2026-08-25*
