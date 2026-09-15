# Pitfalls Research

**Domain:** AI-assisted webnovel writing/reading platform, Korean market, real-money PG payment, token economy, solo-founder MVP with split AI planning/implementation workflow
**Researched:** 2026-08-25
**Confidence:** MEDIUM-HIGH (LLM cost control and ledger patterns are HIGH confidence, well-documented; Korean PG/legal specifics are MEDIUM confidence — verified against multiple sources but NOT a substitute for a lawyer/PG 심사역 review before going live; multi-agent handoff pitfalls are MEDIUM confidence, based on 2026 industry commentary rather than formal studies)

## Critical Pitfalls

### Pitfall 1: LLM Cost Runaway From Unbounded Per-User Generation

**What goes wrong:**
A single vendor, platform-held API key means every generation call is billed to the founder directly, in real currency, with no natural circuit breaker. In a community beta with "uncapped headcount," a handful of power users (or one script-happy user hammering "재생성") can burn through a month's margin in a day. The failure mode is not gradual — it's a step function: someone finds that spamming regenerate-with-longer-context produces better output, and cost per session goes from ₩50 to ₩5,000 overnight because nobody capped input context size or retry count.

**Why it happens:**
Token-metered billing is invisible until the vendor invoice arrives (batch billing, often net-30 or delayed dashboards). Teams building the "happy path" generation feature first, and cost guardrails "later," ship without: (1) a hard per-request token/context cap, (2) a per-user daily/session spend ceiling enforced *before* the API call, (3) a global kill-switch tied to spend velocity, not just a monthly total. Streaming responses also make it easy to let users cancel-and-retry infinitely, each retry re-billing the full context.

**How to avoid:**
- Enforce hard caps at three layers, all *before* the API call fires, not after: per-request (max context tokens, max output tokens), per-user (daily/session token quota deducted from the same ledger that gates paid usage), and platform-wide (a spend-velocity circuit breaker that pauses non-essential generation if $ spend in a rolling window exceeds a threshold).
- Tie AI generation directly to the token ledger from day one — every generation call must debit the user's balance atomically *before* the request is sent, not asynchronously after. If the ledger doesn't have balance, the call never reaches the vendor.
- Alert at graduated thresholds (e.g., 50%/80%/95% of a daily platform budget) so the founder can react before a hard stop, not after a billing shock.
- Cap max context injected via `@`-mention (limit number/size of knowledge-base docs attached per generation) — this is the single biggest cost multiplier in this product's specific design (rich context injection is the core UX feature and the core cost risk).
- Since v1 has no BYOK, there is no cost offramp for heavy users except the ledger itself — the ledger *is* the cost control, so it cannot be "added later."

**Warning signs:**
- Any generation endpoint that calls the LLM vendor before checking/decrementing a balance.
- No per-request max-token parameter set explicitly (relying on vendor defaults).
- No dashboard showing real-time (not next-day) spend during the beta's first week.
- Beta users discovering "if I attach all my docs the output is way better" without a cost-side limit on how much context can be attached.

**Phase to address:**
Must be resolved in the same phase that ships AI generation — cost guardrails are not a hardening pass, they are part of the generation feature's definition of done. Must be verified working *before* the community beta opens registration (uncapped headcount + no guardrail = the exact scenario the founder is worried about).

---

### Pitfall 2: PG Integration Blocks Launch Because Registration/Review Timing Wasn't Planned

**What goes wrong:**
Solo founders treat PG integration as "an API to call" and discover too late that going live requires: a registered business entity (사업자등록증), a PG contract application, card-network-level review (카드사 심사, historically ~2 weeks, done in test mode first), a live merchant ID issued only after that review passes, and — if 정기결제/자동결제 (recurring/auto-charge) is used anywhere — a *separate* review track for that specific feature. If any of this is started after the product is otherwise "done," the beta launch date slips by weeks waiting on a queue the founder doesn't control.

**Why it happens:**
PG providers (토스페이먼츠, PortOne/구 아임포트, 나이스페이, 이니시스 등) require: test-mode integration completed and demonstrated → merchant application submitted with business docs → card company review → real (live) merchant credentials issued only after approval, then a config switch from test to live keys. This review step is asynchronous, sits outside the founder's control, and commonly takes on the order of two weeks. Founders who don't start this in parallel with feature development treat it as a last step and get blocked right before launch.

**How to avoid:**
- Start the PG merchant application in parallel with early development, not after the product is feature-complete — submit test-mode integration and business registration documents as early as the payment phase begins design, so card-network review runs concurrently with feature work.
- Confirm business registration status first: PG providers require 사업자등록증 (business registration) — if the founder is not yet registered as a business, this is the actual critical-path blocker, not the API integration itself. Resolve business registration before scheduling any beta launch date.
- Scope v1 payment to one-time token top-up charges only (not recurring/auto-billing) unless there is a specific need — this avoids the additional review track for 정기결제/빌링키, which has separate approval requirements from a standard one-time payment.
- Explicitly test the full test→live cutover (separate API keys/merchant IDs for test vs. live, config-driven, verified in a runbook) so switching to real money isn't a same-day surprise.

**Warning signs:**
- No PG merchant application submitted by the time feature work on payment begins.
- Business registration (사업자등록) not yet completed when payment phase starts.
- Payment code hardcodes test-mode keys with no clean switch to live credentials.
- Recurring billing considered "just a flag" rather than a separately-reviewed product.

**Phase to address:**
Start business registration and PG merchant application at the *start* of the payment/token phase, in parallel with building the charge UI — not as a subtask done after the UI is built. This must fully clear (live credentials issued and verified) before the community beta opens, since the constraint explicitly states the platform will not open unlimited registration without payment live.

---

### Pitfall 3: Prepaid Token Balance Accidentally Triggers 선불전자지급수단 (Prepaid Payment Instrument) Regulation

**What goes wrong:**
Under Korean 전자금융거래법 (Electronic Financial Transactions Act), a prepaid balance ("charge cash → get tokens → spend across the platform") can be legally classified as a 선불전자지급수단, which triggers registration and reserve/custody obligations (e.g., depositing/insuring 100%+ of outstanding balances) if it's used across ≥2 "가맹점" (merchant-like entities) and ≥1 business category — a bar that was *lowered*, not raised, by a 2024 amendment (previously ≥2 categories / ≥10 merchants; now ≥1 category / ≥2 merchants). There is a carve-out: small-scale issuers under ~₩3 billion outstanding balance or ~₩50 billion annual issuance are exempt from registration. Products that treat individual creators/works as separate internal "merchants" (as this platform's asset-store concept implicitly does) are the pattern most likely to cross the "≥2 가맹점" line, even while staying under the money-scale exemption.

**Why it happens:**
Founders reason "it's just credits for my own app" and assume no financial regulation applies, without checking whether the internal design (multiple creators earning/spending the same token, an opt-in asset store where tokens move between different authors) resembles a multi-merchant prepaid instrument rather than a single-merchant store credit (which has a cleaner exemption path). This is easy to misjudge without legal review, and the exemption thresholds/merchant-count rules changed in 2024, so pre-2024 assumptions from older articles or competitor products may be stale.

**How to avoid:**
- Treat this as a legal question, not an engineering one: before enabling anything beyond "user charges tokens → spends tokens only on the platform's own AI generation and content," get a specific read (from a lawyer or the PG provider's compliance team, who reviews this during merchant onboarding) on whether the *current* v1 design (no cash-out, no asset store, no cross-creator token movement) qualifies as simple self-issued store credit vs. a regulated prepaid instrument.
- This is explicitly *lower risk in v1* because the roadmap already defers both cash-out and the asset store — the MVP's token flow ("충전 → 플랫폼 내 AI/열람 소비만") is the safer shape. Flag this pitfall specifically for **whenever the asset store or cash-out is revisited** (both are Out of Scope for v1 per PROJECT.md) — re-run this legal check before building either, since that is exactly when the "≥2 가맹점" pattern (tokens moving between different creators) would appear.
- Do not assume the ₩3B/₩50B monetary exemption alone is suffficient — the merchant-count/category test is independent and was the part that got easier to trigger in 2024.

**Warning signs:**
- Any v1 feature that lets tokens move between two different users' accounts (not just user → platform).
- Marketing or product copy describing tokens as usable "across the platform's creators" rather than "for the platform's own AI service."
- No documented legal answer on file before the asset store or cash-out work begins.

**Phase to address:**
Low urgency for v1 itself (design already avoids the trigger by deferring asset store/cash-out). Must be explicitly re-checked as a blocking legal item *before* implementation starts on the asset store or creator cash-out in a future milestone — put this on the roadmap as a prerequisite research/legal task for that milestone, not an implementation detail.

---

### Pitfall 4: Token Ledger Race Conditions Allow Double-Spend or Negative Balances Under Concurrent Requests

**What goes wrong:**
The classic bug: read balance → check sufficient funds → deduct balance, done as separate steps (or separate requests) without atomicity. Two concurrent requests (double-click "생성" button, two browser tabs, retry-after-timeout that actually succeeded) both read the same starting balance, both pass the sufficiency check, and both deduct — resulting in a balance that goes negative or a user getting two generations/chapter-unlocks for the price of one. This is invisible in manual QA (one person, one request at a time) and only appears under real concurrent load — exactly what a beta launch produces.

**Why it happens:**
It's natural to write ledger logic as application-level read-then-write because it's simple and works in every manual test. The bug only manifests under concurrency, so it passes code review and demo, then fails silently in production, showing up as unexplained balance discrepancies that are hard to reconstruct after the fact if there's no immutable transaction log.

**How to avoid:**
- Make every balance-changing operation a single atomic database transaction with a row-level lock or a database constraint that prevents negative balances (e.g., a `CHECK (balance >= 0)` constraint plus `SELECT ... FOR UPDATE` or an equivalent atomic `UPDATE ... WHERE balance >= amount RETURNING`) — never a separate read, check-in-application-code, then write.
- Use an append-only, double-entry ledger table (every debit/credit is an inserted row, never updated or deleted) as the source of truth, with the "current balance" being a derived value (materialized or computed) rather than a mutable field that gets directly decremented. This makes reconciliation and audit possible after the fact, which matters both for cost-runaway forensics and for refund/dispute handling.
- Require idempotency keys on any client-retriable action (generation requests, chapter unlocks, top-up webhooks) so a network retry can never double-charge or double-deduct.
- Load-test the ledger specifically for concurrent requests against the same user account before launch, not just single-request correctness.

**Warning signs:**
- Balance stored as a single mutable integer column updated via `UPDATE balance = balance - X` without a `WHERE balance >= X` guard.
- No idempotency key on payment webhook handlers or generation-trigger endpoints.
- No append-only transaction/audit log — if the only record of history is the current balance, debugging a discrepancy after the fact is impossible.
- Balance ever observed negative in any environment.

**Phase to address:**
Must be resolved in the token/payment phase, before the beta opens — this is core correctness, not an edge case, since real money is at stake and there is no manual reconciliation team to catch it.

---

### Pitfall 5: No Automated Moderation Means the Fastest-Growing Abuse Patterns Are the Ones That Look Like Normal Usage

**What goes wrong:**
With only manual/reactive review (no automated pre-screening, deferred per PROJECT.md), the abuse patterns that surface fastest in a small beta are not obvious spam — they are: (1) prompt-injection/jailbreak attempts against the platform's system prompt to produce content outside the intended tone/rating (including content that could create legal exposure, e.g., explicit sexual content involving depicted minors, or content mimicking a specific living author closely enough to be a plagiarism/defamation claim), (2) near-verbatim reproduction of existing copyrighted webnovels via clever `@`-mention context engineering, surfacing as a copyright complaint from a third party before any internal review catches it, and (3) low-effort account multiplication to farm any free/trial tokens, which silently inflates the AI cost problem (Pitfall 1) while looking like "organic growth" in a beta with no signup friction.

**Why it happens:**
Manual review only sees content *after* it's reported or randomly sampled — in a beta with real-money-adjacent incentives (users trying to get more generation for less token spend) and no automated first-pass filter, the interval between "abuse starts" and "a human notices" can be days, during which the exposure compounds (published chapters get read, screenshotted, or reported by the original author whose work was mimicked).

**How to avoid:**
- Even without an automated moderation *pipeline*, ship the cheap wins that the original docs already specified: a system-prompt-level copyright/safety instruction injected server-side on every generation call (not client-controlled), and clear terms-of-service language putting infringement liability on the uploader — this is a legal defensibility measure, not a technical one, and should not be deferred just because the SLM pre-screening pipeline is deferred.
- Make reporting trivially easy from both the reader viewer and the editor (one-click report on any chapter), since manual review depends entirely on reports as the trigger — if reporting has friction, moderation has no input signal at all.
- Rate-limit account creation and tie free/trial token grants to a verification signal (even a lightweight one, e.g., single device/email per grant) — this is as much a cost-runaway control (Pitfall 1) as a moderation control, since multi-accounting is the most common way beta users defeat per-user caps.
- Define a manual-review SLA (e.g., "reported content reviewed within N hours") even at MVP scale — without automated screening, response time to reports *is* the moderation system, so it needs an explicit target, not an implicit "whenever the founder has time."
- Log full prompt+context+output for every generation (even if not reviewed proactively) so that when a report or complaint does arrive, there's a record to review — without this, manual review has nothing to act on retroactively.

**Warning signs:**
- No one-click report affordance on chapters/generations.
- Free tokens or trial credits grantable repeatedly from the same device/browser without any friction.
- No system-level (server-injected) instruction constraining generation content — relying only on the user-facing preset (초보자/중급자/자유형) which the user fully controls and can work around via `@`-mention content.
- Generation requests not logged with enough context to reconstruct "what was actually generated and from what input" after the fact.

**Phase to address:**
The system-prompt injection and reporting affordance must ship in the same phase as AI generation and the reader viewer, respectively — these are cheap and are the actual mitigations available given automated moderation is explicitly deferred. The manual-review SLA and admin tooling should be ready before the beta opens (matches the existing "운영자 수동 검토 도구" requirement in PROJECT.md), not built reactively after the first incident.

---

### Pitfall 6: Two-Agent Planning/Implementation Split Drifts From Intent When PLAN.md Leaves Interfaces or Edge Cases Implicit

**What goes wrong:**
When Claude (planning) hands a `PLAN.md` to a separate, non-interactive CLI agent (Antigravity/`agy`) for implementation, any ambiguity in the plan does not get resolved through clarifying conversation — it gets resolved by the implementing agent guessing, silently, in whatever direction its own training biases it toward. Because the implementer runs non-interactively (`--print --dangerously-skip-permissions`) with no human or planning-agent in the loop during execution, small misreadings (a wrong assumption about an error-handling path, a data shape not fully specified, an implicit "obviously atomic" operation implemented non-atomically — see Pitfall 4) are not caught until a downstream verifier or human inspects the actual diff. Because the two agents are different systems (different training, different default conventions), interpretive drift compounds faster than it would with a single consistent agent doing both planning and implementation.

**Why it happens:**
Specs written as prose intent ("charge the user's token balance when generation starts") read as complete to the author but are actually missing the load-bearing details an implementer needs: exact atomicity requirements, exact error/retry semantics, exact interface contracts (request/response shapes, status codes, idempotency behavior), and exact "what counts as done" acceptance criteria. A planning agent that has internalized the intent doesn't notice the gap because it's not the one asking "but what happens if X" during implementation — that question either gets silently resolved by the implementer or never gets asked at all.

**How to avoid:**
- Every `PLAN.md` handed to `agy` should specify, not just narrate: exact interface contracts (types/schemas, not prose descriptions), explicit invariants that must never be violated (e.g., "balance must never go negative," "a generation call must never reach the LLM vendor if the ledger check fails"), explicit error-path behavior (not just the happy path), and concrete acceptance criteria that a verifier can check mechanically against the implementation, not just against intent.
- Enforce TDD in the handoff (already decided per PROJECT.md's Key Decisions) — require tests to be specified *before* implementation, in the plan itself, so "done" is defined by passing a fixed, human/planning-agent-authored test suite rather than by the implementer's own judgment of what satisfies the prose spec. This is the single most effective lever available here: tests written by the planning side act as an executable, unambiguous contract that the implementing agent cannot silently reinterpret.
- Treat the GSD verifier step as adversarial, not confirmatory — the verifier should specifically check for the failure modes named in this document (atomicity, cost-guardrail-before-call ordering, idempotency) rather than only checking "does it run and pass its own tests," since an implementer that wrote both the code and (if allowed to) the tests can make both agree while missing the actual intent.
- For any plan step touching money, tokens, or the LLM vendor call, require the plan to explicitly state the ordering/atomicity constraint in writing (e.g., "ledger debit MUST happen in the same transaction as, and before, the vendor API call") — these are exactly the details prose intent tends to leave implicit and that this project's cost/ledger pitfalls (1 and 4) depend on getting right.
- Keep planning-side specs living: if the implementer's output reveals the plan was ambiguous (verifier or human catches drift), update the plan/spec itself before the next phase, not just the code — otherwise the same ambiguity recurs in later phases that build on the same pattern.

**Warning signs:**
- A `PLAN.md` step describing behavior only in prose ("should validate the user has enough tokens") with no explicit ordering/atomicity statement and no accompanying test spec.
- Verifier checks that only confirm "tests pass" without independently checking the specific invariants that matter for this domain (negative balance, double-spend, cost-guardrail ordering).
- Implementation diffs that introduce a design choice (e.g., how errors are handled, how retries work) that isn't traceable to an explicit line in the plan — a sign the implementer filled a gap on its own.
- The same category of bug (e.g., a race condition) recurring in a later phase after being fixed once — a sign the plan template itself isn't capturing the lesson, only the one instance was patched.

**Phase to address:**
This is a process pitfall, not a single roadmap phase — it applies to every phase from the first one that touches the token ledger or payment onward. Concretely: the planning process (this project's `plan-phase` step) should adopt a checklist for money/ledger/AI-call-touching plans specifically requiring explicit atomicity/ordering statements and test-first acceptance criteria, starting with whichever phase first implements the token ledger or AI generation call, and applied consistently to every phase after.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| Deduct token balance after LLM call returns (not before) | Simpler code, no need to handle "refund on failure" | User can get free generation if server crashes between call and deduction; also removes the pre-call guardrail that prevents cost runaway | Never — this directly undermines Pitfall 1's core mitigation |
| Store current balance as a mutable column with no transaction log | Faster to build, matches naive mental model | No way to reconstruct history for refund/chargeback disputes or to debug a discrepancy; regulators/PG disputes may require transaction evidence | Never for money-adjacent balances; acceptable only for genuinely non-financial counters |
| Ship payment with only success-path UI, no explicit refund/cancel flow | Faster MVP payment UI | Legally, users have limited rights to withdraw consent before digital content delivery begins, but disputes/chargebacks still occur and need an operational path — otherwise the founder handles disputes ad hoc, one card-network case at a time | Acceptable to defer *self-service* refund UI to post-beta, but an internal/admin path to process a refund or reverse a ledger entry must exist before going live |
| Skip system-prompt copyright/safety injection until the "real" moderation pipeline is built | One less thing to build for MVP generation feature | This is the cheapest and most load-bearing mitigation available while automated moderation is deferred — skipping it removes the only proactive defense | Never — this should ship with the generation feature itself, not with the deferred moderation pipeline |
| Let `agy` infer test cases from the plan's prose rather than specifying them | Faster plan-writing | Implementer and its self-written tests can agree with each other while both miss the actual intent (see Pitfall 6) | Acceptable only for genuinely low-stakes UI/copy phases; never for ledger, payment, or AI-call-ordering logic |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|--------------|------------------|---------------------|
| Korean PG (토스페이먼츠/PortOne/etc.) | Starting integration and business registration sequentially, discovering the ~2-week card-network review only after the rest of the product is "done" | Start business registration + PG test-mode application in parallel with early feature work; treat live-credential issuance as an external dependency with its own lead time, tracked on the roadmap explicitly |
| Korean PG — recurring billing | Assuming "one-time charge" and "recurring/auto-billing (빌링키)" go through the same review | Confirm with the PG provider whether the specific charge model (one-time token top-up vs. subscription) needs a separate review track; scope v1 to one-time top-ups only unless recurring billing is a stated requirement |
| LLM vendor (single vendor, platform key) | Treating the vendor API as unlimited/always-available; no fallback when the vendor has an outage or throttles the platform key | Design the generation feature to fail gracefully (clear user-facing error, no silent retry storm) when the vendor errors or rate-limits, and monitor vendor-side rate-limit headers so the platform's own per-user throttling stays under the vendor ceiling |
| Supabase (Postgres/pgvector/Vault) | Implementing the token ledger via ORM-level read-then-write instead of database-level atomic constraints/transactions | Use Postgres transactions with row locks or atomic `UPDATE ... WHERE balance >= amount` for every ledger mutation; do not rely on application-code sequencing for correctness |
| PG webhook/callback handling | Processing a payment-confirmation webhook without idempotency, so a provider's retry (common after any timeout) double-credits tokens | Require an idempotency key (the PG's own transaction ID) on every webhook handler, and make crediting tokens an idempotent, at-most-once operation keyed on that ID |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|------------------|
| No per-request context size cap on `@`-mention injection | Generation cost per request varies wildly and unpredictably; some requests cost 10-50x others | Cap total injected context tokens per generation request at the API layer, independent of how many docs the user selects | Breaks as soon as any user learns to attach many/large knowledge-base docs — can happen in week one of beta |
| Synchronous LLM call blocking a request thread with no queueing | App feels fine with a handful of concurrent writers, then times out/degrades under a beta traffic spike | Use async job/queue pattern for generation with a real-time status channel to the client, decoupling request handling from vendor call latency | Breaks once concurrent generation requests exceed what the vendor's own throughput/rate limit allows, which happens quickly for a "generate multiple times" UX like writing assistance |
| Balance-check via a slow aggregate query (e.g., SUM over a transaction table) on every generation request | Fine at low volume, adds latency and DB load as transaction history grows | Maintain a materialized/cached current-balance value updated transactionally alongside the append-only ledger, not recomputed from full history on every request | Becomes noticeable once a user has generated enough chapters/requests that the transaction history is in the hundreds-to-thousands range |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Trusting client-supplied token/cost amounts in generation or top-up requests | User can manipulate a request to claim a cheaper cost or a larger top-up credit than actually purchased | Compute cost and credited amount entirely server-side from trusted inputs (model/context size server-measured; PG webhook amount, not client-reported amount) |
| Relying on the user-facing tone preset (초보자/중급자/자유형) as the only content safety control | Presets are fully user-selectable and don't prevent adversarial `@`-mention content from steering generation outside intended bounds | Inject a separate, server-controlled system-level instruction on every call that the user cannot see or override, independent of the tone preset |
| Storing the platform's single LLM vendor API key without access-scoping/rotation plan | A leaked key (e.g., via a misconfigured serverless function or log) becomes an immediate, uncapped cost and abuse exposure for the whole platform | Store the key in a secrets manager (e.g., Supabase Vault, per the existing stack decision), scope it to only the backend service that calls it, and have a rotation runbook ready before launch |
| No idempotency key on PG payment webhooks | Double-processing a webhook retry credits tokens twice, directly enabling free token generation, which compounds Pitfall 1 | Idempotency-key every payment-confirmation handler keyed on the PG's transaction ID |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| Token balance and generation cost hidden until after a generation completes | Users get surprised by cost, erodes trust, increases support/dispute load right when real money is involved | Show estimated token cost before the user confirms a generation action, and current balance persistently visible in the editor |
| No feedback when a generation is blocked by a ledger/cost guardrail | Users interpret a silent block as a bug and file confused reports, adding noise to an already-manual moderation/support queue | Explicit, clear messaging when a request is blocked by insufficient balance or a rate/cost guardrail, distinct from a technical error |
| Reporting a problematic chapter/generation buried in a menu | Given moderation is manual-review-only, low-friction reporting is the main signal source — burying it starves moderation of input | Single-tap/click report affordance directly on the chapter/generation UI, in both the reader viewer and the editor |

## "Looks Done But Isn't" Checklist

- [ ] **Token ledger:** Looks done when a happy-path top-up-then-spend flow works in manual testing — verify it also holds under concurrent requests (double-click, two tabs) and that balance can never go negative under load.
- [ ] **PG integration:** Looks done when test-mode charges succeed — verify the live-credential cutover has actually been tested end-to-end (not just documented), and that webhook idempotency is handled, not just the synchronous charge response.
- [ ] **AI generation cost guardrail:** Looks done when a single generation request is correctly billed — verify the guardrail fires *before* the vendor call (not after, as a post-hoc check), and that it holds when context size is large or when a user rapidly retries.
- [ ] **Content moderation "minimal ops tool":** Looks done when an admin can view a reported item — verify there is also a clear action path (block/remove, notify, log) and that reporting itself is actually reachable from the reader/editor UI, not just present in the data model.
- [ ] **Refund/dispute handling:** Looks done when there's a payment success flow — verify there is at least an internal/admin path to reverse a ledger entry or process a refund before real users start disputing charges.
- [ ] **Multi-agent implementation handoff:** A phase "looks done" when `agy`'s output passes its own tests — verify the plan's tests were written (or reviewed) by the planning side *before* implementation, and that the verifier checks the specific invariants (atomicity, ordering, negative-balance-impossible) rather than only "tests pass."

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|----------------|-----------------|
| LLM cost runaway already happened | MEDIUM | Immediately add a global spend-velocity circuit breaker (even a crude one) to stop the bleeding; identify the specific abuse pattern (large context, retries, multi-account) from generation logs; retrofit the per-request/per-user caps that should have existed; consider a temporary registration pause while fixing |
| Discovered late that PG live review will take 2+ weeks | MEDIUM | Communicate a revised beta date immediately rather than slipping silently; use the wait time productively on moderation tooling/ledger hardening; do not skip the review by faking live mode |
| Token ledger race condition caused balance discrepancies | HIGH if no transaction log exists (manual reconstruction from partial data), LOW-MEDIUM if an append-only log exists | If a log exists: replay/reconcile from the log to correct balances and refund affected users. If no log exists: this is the exact reason to build the append-only ledger *before* this happens, since retroactive reconstruction may be impossible — treat any discovered discrepancy as reason to freeze the affected balances and add the log immediately going forward |
| A copyright/plagiarism complaint arrives before any internal review caught the content | LOW-MEDIUM | Because generation logs exist (per Pitfall 5's prevention), locate the specific input/output, remove/block the content per the reporting flow, and rely on the ToS liability clause and system-prompt injection as the documented defensibility position — this is exactly why those two cheap mitigations must exist before launch, not after the first complaint |
| A phase implemented by `agy` drifted from intent (caught by verifier or later bug) | LOW-MEDIUM | Do not just patch the code — update the `PLAN.md`/spec template for that category of work (e.g., add the missing atomicity statement) so the same ambiguity doesn't recur in the next phase that touches similar logic |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|--------------------|----------------|
| LLM cost runaway | AI generation phase (must ship guardrails as part of the feature, not after) | Load-test with concurrent/rapid-retry requests before beta; confirm ledger debit happens before vendor call in code review |
| PG registration/review timing | Payment/token phase — start business registration + PG application at phase kickoff | Live merchant credentials issued and a full test→live cutover rehearsed before beta launch date is set |
| 선불전자지급수단 legal exposure | Not v1-blocking; explicit legal-check task required before any future milestone implementing asset store or cash-out | A documented legal opinion/PG compliance confirmation on file before that milestone's implementation begins |
| Token ledger race conditions | Payment/token phase | Concurrency test (parallel requests against same account) passes; DB-level constraint prevents negative balance; append-only log exists |
| Moderation gaps without automated pre-screening | AI generation phase (system-prompt injection) + reader/editor UI phase (report affordance) + ops tooling phase (review SLA) | System prompt injection verified un-overridable by user input; report button reachable in under 2 clicks from any chapter; admin review SLA documented |
| Multi-agent plan/implementation drift | Every phase from the first ledger/AI-call phase onward — process-level, enforced via plan template | Verifier explicitly checks domain invariants (not just test pass/fail); any caught drift triggers a plan-template update, not just a code patch |

## Sources

- PortOne 토스페이먼츠 계약절차 및 정기결제 실 운영 전환 가이드 — https://help.portone.io/content/tosspayments-contract , https://guide.portone.io/6fb32ed8-eb02-4ff9-bdac-b96a2b314262 (MEDIUM confidence — official PG provider documentation)
- 페이업 "PG사 뜻부터 선택 기준까지 2026년 필수 가이드" — https://blog.payup.co.kr/pg-company-guide (MEDIUM confidence — industry blog, cross-checked against PortOne official docs)
- 국가법령정보센터, 전자금융거래법 시행령 — https://www.law.go.kr/LSW/lsInfoP.do?lsId=010366 (HIGH confidence — primary legal source, but interpretation of "가맹점 2개 이상" applicability to this specific product design is MEDIUM confidence and should be legally reviewed)
- 김앤장 Finance Legal Update, 전자금융거래법 일부개정법률안 — https://www.kimchang.com/upload/board/1692941072016.pdf (MEDIUM-HIGH confidence — major law firm analysis of the 2024 amendment lowering the 선불업 registration threshold)
- 토스페이먼츠 블로그, 전자금융거래법 개정 대비 — https://www.tosspayments.com/blog/articles/amendment (MEDIUM confidence — PG provider's own compliance guidance)
- 전자상거래 등에서의 소비자보호에 관한 법률 (청약철회 예외, 디지털콘텐츠) — https://law.go.kr/LSW//lsLawLinkInfo.do?chrClsCd=010202&lsId=009318 (HIGH confidence — primary legal source)
- 문화체육관광부·한국저작권위원회, 생성형 AI 저작권 안내서 관련 보도자료 — https://www.mcst.go.kr/site/s_notice/press/pressView.jsp?pSeq=20743 (MEDIUM confidence — official government guidance exists but is about registration of AI-assisted works, not specifically about platform liability for user-generated plagiarism, which remains a general ToS/liability question)
- TrueFoundry, "Rate Limiting AI Agents: Preventing LLM API Exhaustion with a 3-Layer Gateway" — https://www.truefoundry.com/blog/rate-limiting-ai-agents-preventing-llm-api-exhaustion (MEDIUM confidence — vendor blog, but pattern is corroborated by multiple independent 2026 sources)
- Nexgismo, "AI Agent Budget Guards: How to Stop Runaway API Costs in 2026" — https://www.nexgismo.com/blog/ai-agent-budget-guards-stop-runaway-api-costs (MEDIUM confidence)
- Hiflylabs, "How to Avoid Runaway LLM Costs" — https://hiflylabs.com/blog/2026/7/16/cap-llm-api-use-avoid-runaway-llm-costs (MEDIUM confidence)
- DEV Community, "The race condition a stress test found in my double-entry ledger" — https://dev.to/xidoke/the-race-condition-a-stress-test-found-in-my-double-entry-ledger-and-how-i-fixed-it-b5o (MEDIUM confidence — single practitioner account, but pattern matches well-established double-entry ledger design principles)
- Medium/CodeToDeploy, "Solving the Double Spend: System Design Patterns for Bulletproof Fintech" — https://medium.com/codetodeploy/solving-the-double-spend-system-design-patterns-for-bulletproof-fintech-ee5d73f33415 (MEDIUM confidence)
- Augment Code, "Spec-Driven AI Code Generation With Multi-Agent Systems" and "How to Write Living Specs for AI Agent Development" — https://www.augmentcode.com/guides/spec-driven-ai-code-generation-with-multi-agent-systems , https://www.augmentcode.com/guides/living-specs-for-ai-agent-development (MEDIUM confidence — vendor guidance, but the described interpretive-drift failure mode is consistent across multiple independent 2026 sources)
- Stack Overflow Blog, "Dispatches from O'Reilly: The right amount of spec for agentic development" (Aug 2026) — https://stackoverflow.blog/2026/08/21/dispatches-from-o-reilly-the-right-amount-of-spec-for-agentic-development/ (MEDIUM confidence)
- Project source documents: `.planning/PROJECT.md`, `docs/3. 비즈니스 모델 및 사용자 정책.md` (primary — original team's own risk anticipation, HIGH confidence for what this project already intends)

---
*Pitfalls research for: AI-assisted webnovel platform (NovelScript), Korean market MVP*
*Researched: 2026-08-25*
