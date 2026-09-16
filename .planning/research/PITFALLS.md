# Pitfalls Research — v1.1 (Multi-Provider AI · BYOK · Subscription-AI MCP)

**Domain:** Multi-vendor LLM adapter layer + user-supplied API key (BYOK) custody + remote OAuth-authenticated MCP server, layered onto an existing Korean webnovel platform with a real-money token wallet
**Researched:** 2026-09-16
**Confidence:** MEDIUM-HIGH
- HIGH on the code-grounded pitfalls (idempotency, admin-client RLS bypass pattern, refusal parsing) — verified by reading `lib/ai/chat.ts`, `lib/ai/cost.ts`, `lib/ai/gemini.ts`, `lib/commerce/actions.ts`, `supabase/migrations/0001_init.sql`, `0005_commerce.sql` directly
- HIGH on MCP security statistics and OWASP/Checkmarx guidance (official cheat sheet, named CVE counts)
- MEDIUM on provider-specific behavior differences (error formats, rate-limit headers, refusal semantics) — cross-checked across 2+ independent sources per claim, but provider docs change frequently and were not fetched directly from Anthropic/OpenAI's own docs pages
- MEDIUM on OpenAI org-verification and ChatGPT connector plan-gating timelines — dates cited are as reported by secondary sources, not verified against OpenAI's own current help-center page at research time

This file assumes `.planning/research/FEATURES.md` (2026-09-15) as already-established context and does not repeat its findings (balance-cap bypass, BYOK zero-debit requirement, `ai_usage` table separation, four-class BYOK error taxonomy, anti-fallback recommendation, `ai_usage`-not-`wallet_ledger` warning). Everything below is either deeper than that document or a gap it did not cover.

## Critical Pitfalls

### Pitfall 1: BYOK Key Leaks Through the Error Object, Not the API Response

**What goes wrong:**
Every BYOK design in this project's own plan (and FEATURES.md) correctly worries about the *provider's* error response echoing the key, and about *server logs* generically. The sharper, more concrete leak path is neither: it's the HTTP client's own `Error` object. When `fetch`/`axios`/the OpenAI or Anthropic SDK throws on a non-2xx response, many of them attach the **full outgoing request** — including the `Authorization: Bearer sk-...` or `x-api-key` header — onto the thrown error's `config`/`request` property, not just the response body. The provider's own JSON body is usually safely masked (OpenAI returns `"Incorrect API key provided: sk-****XXXX"`), but the *request* config on the same error object is not. The very first generic `catch { return { ok: false, error: '...' } }` pattern already present in `lib/ai/chat.ts` (two bare `catch` blocks with no logging today) is exactly the shape that gets "improved" during the BYOK migration by someone adding `console.error(err)` or `Sentry.captureException(err)` for observability — and that single line ships the plaintext key to log aggregation or an error-tracking SaaS, from which it is effectively unrecoverable (rotation is the only fix, not deletion of the log line).

**Why it happens:**
Nobody deliberately logs a key. The leak happens because the object being logged "for debugging" is not the string that was sent — it's a rich SDK/HTTP-client error object that JSON-serializes recursively, and secret-scrubbing is not the library's job. This is a well-documented, recurring class of incident with axios + Sentry specifically (the error's `config.headers.Authorization` round-trips into Sentry's event payload verbatim unless explicitly stripped).

**How to avoid:**
- Never pass a raw caught error from a provider-calling adapter into any logger/tracker. Catch narrowly, extract only `{ status, providerErrorCode }`-shaped data, and construct a new, deliberately-scrubbed error/log object.
- If a provider SDK is used, check whether its thrown errors carry the original request config (most do) and add an explicit redaction step (`delete err.config?.headers?.authorization`, or equivalent) at the single choke point where all three provider adapters funnel errors, before any logging call.
- Never log the decrypted key even at DEBUG level "temporarily" — there is no test-only exception that's safe once code merges to a shared branch.
- Apply the same scrubbing rule to whatever error-tracking tool is added later (Sentry, Datadog) at initialization time (`beforeSend` hook stripping auth headers), not per call site — a per-call-site convention will be forgotten by the third adapter.

**Detection:**
Grep the diff of the multi-provider adapter PR for any `console.error`/`console.log`/`captureException` call inside a `catch` block that received the *raw* thrown value rather than a narrowed error shape. Any hit needs manual verification.

---

### Pitfall 2: MCP Tools Copy the Existing `createAdminClient()` Pattern and Silently Bypass Ownership Scoping

**What goes wrong:**
This codebase already has a load-bearing precedent for reaching for the Supabase **admin/service-role client** to route around RLS gaps — `lib/ai/chat.ts` does exactly this today for wallet reads/writes ("Wallet RLS Gap" per the Phase 04 plan notes), and `chat.ts` explicitly documents that `input.ownerId` must come from the authenticated session, "not this function." That precedent is *correct* for a Server Action, which always runs inside an authenticated Next.js request with a session already validated upstream. An MCP tool handler is a fundamentally different call shape: it is invoked by an external client (Claude/ChatGPT) over HTTP, authenticated by an OAuth *bearer token*, and there is no framework-level guarantee analogous to the Server Action boundary that "the caller's identity was already checked." A tool implementer under time pressure, having seen `createAdminClient()` used freely three times already in this codebase for "the RLS policy doesn't cover this case," will reach for the same shortcut inside a new `get_chapter` or `search_kb` tool — and if the `WHERE owner_id = ?` clause is even slightly wrong (missing on one query path, or checking `work.owner_id` but not re-checking on a joined `kb_nodes` row), the admin client means Postgres enforces nothing, and the bug is a cross-user data read/write, not merely an incorrect empty result.

**Why it happens:**
OWASP and Checkmarx both name this the "confused deputy" pattern for MCP specifically: the MCP server executes with its own privileges instead of the caller's, and the tool ends up doing what an untrusted intermediary asked rather than what the authenticated end-user is entitled to. It is worse here because the codebase's own accumulated convention (admin client for anything RLS doesn't cleanly cover) actively encourages the unsafe shortcut instead of discouraging it.

**How to avoid:**
- Resolve the OAuth token to a Supabase user identity, then call tools using a Supabase client scoped to that user's session/JWT wherever the equivalent Server Action would use the session client — reserve `createAdminClient()` inside MCP tool handlers for the same narrow, previously-audited exceptions (e.g., the wallet read), never as a default.
- Where an admin client is unavoidable (mirroring the wallet-RLS-gap precedent), require the ownership check to be written as an explicit, testable predicate function shared across every tool (`assertOwnsWork(userId, workId)`), not inlined ad hoc per tool — this mirrors the project's own `lib/kb/actions.ts` "defense-in-depth ownership guard" pattern already proven in Phase 2/4.1, which is the right template to reuse for MCP, not the wallet shortcut.
- Add a test suite specifically constructing a second user's OAuth-scoped call against the first user's `work_id`/`chapter_id`/`node_id` for every MCP tool — this is the direct MCP analogue of the anonymous-read tests already used for the reader-facing RLS work in Phase 3 (`anonClient()` helper).

**Detection:**
Any MCP tool file importing `createAdminClient` should be treated as requiring extra review by default. A tool that resolves `work_id` from a raw LLM-supplied string and passes it straight into an admin-client query with no ownership predicate in the same function is the concrete smell.

---

### Pitfall 3: The Billing-Mode Decision (Service Key vs BYOK) Is Trusted From the Client at the Exact Moment It Matters Least

**What goes wrong:**
FEATURES.md's recommended UX — a per-model "BYOK" badge derived from "selected provider/model + whether a key exists for it" rather than a global toggle — is the right user-facing design, but it creates a **time-of-check-to-time-of-use (TOCTOU) gap** if the actual billing branch executed at generation time trusts anything the client sent about which mode applies. Concretely: the AI panel loads, the picker shows a model as "BYOK 사용 가능" because a key existed when the page/panel loaded; the user deletes that key in Settings in another tab (or it silently expires/rotates upstream); the user then sends a chat turn from the still-open panel. If the server action re-derives billing mode purely from a client-sent flag (`byok: true`) instead of re-querying "does a usable key exist for this user+provider right now," two bad outcomes are both plausible depending on which way the bug leans: (a) the call is attempted with a stale/absent key and fails in a confusing way after the system already assumed "no wallet debit needed," producing a turn that neither the wallet nor the user's key paid for and that must be retried from scratch, or (b) worse, a defensive fallback added later (explicitly warned against in FEATURES.md as an anti-feature, but easy to reintroduce as a "just don't block the writer" fix once support tickets arrive) silently reroutes to the service key without the explicit per-call consent FEATURES.md specifies.

**Why it happens:**
The billing mode looks like UI state because it's rendered as a badge in the picker, so it's tempting to thread it through the request payload like any other form field. But it is actually a **money-routing decision** and must be re-derived, not transmitted — the same principle `lib/commerce/actions.ts` already enforces by computing purchase totals server-side from trusted state rather than the client-reported amount (this project's own Pitfall from v1.0 research, "Trusting client-supplied token/cost amounts").

**How to avoid:**
- The server-side chat/generate action must independently look up "does a valid, validated key exist for this user + provider" at the moment of the call — the client's badge is a *hint for rendering*, never an input to the billing branch.
- Treat "key exists but decrypt/validate fails at call time" as its own explicit outcome (map it into the existing four-class BYOK error taxonomy's "invalid/revoked" bucket), not as a silent branch into the service-key path.
- Because this is a genuinely new race that didn't exist pre-BYOK (the old single-vendor flow only ever had one billing path), add it explicitly to the migration's test list rather than assuming the existing debit tests generalize.

**Detection:**
Any code path where `input.mode` / `input.useByok` (client-supplied) is read directly into an `if` that decides whether `apply_wallet_delta` runs, without a corresponding fresh DB lookup in the same function, is the exact bug shape.

---

### Pitfall 4: Fixing Ledger Idempotency Does Not Fix Vendor-Side Double Billing on Retry

**What goes wrong:**
FEATURES.md correctly flags that `chat.ts`'s `p_reference_id: crypto.randomUUID()` makes the wallet's dedupe constraint (`unique (wallet_id, reference_type, reference_id)` in `0001_init.sql`, confirmed by direct read) a no-op for AI spend, and that this must be fixed before adding retry/backoff on 429s. That fix (a stable, request-derived `reference_id`) makes the **wallet ledger** idempotent — a retried request that reaches the debit step twice will correctly no-op on the second `apply_wallet_delta` call (the RPC's `on conflict ... do nothing` silently succeeds and returns the current balance, per the function body, without raising an error the caller can see). It does **not** make the **vendor call** idempotent. If a 429/5xx-triggered retry re-sends `client.generateContent(...)` because the first attempt's response was lost to a network blip (not because the first attempt actually failed at the vendor), the vendor may have already generated and billed for the first call's output tokens — invisibly, since the ledger's dedupe silently absorbs the *second* debit attempt into "no-op," hiding the fact that two full generations were paid for at the vendor (platform pays for a service-key call the user only sees billed once; a BYOK user's own account absorbs the same double cost with zero visibility, since NovelScript's own accounting looks perfectly consistent).
This is the same asymmetry the vendor-side streaming-abort research surfaces from a different angle: OpenAI's own SDK returns **zero usage** for a request whose stream was aborted client-side, so even the platform's own retry heuristics ("no usage came back, safe to retry") cannot distinguish "vendor never started" from "vendor billed us and we just didn't see the receipt."

**Why it happens:**
Idempotency at the ledger layer and idempotency at the vendor layer are different problems solved by different mechanisms (a unique-constraint no-op vs. an idempotency key the *vendor* itself honors), and OpenAI/Anthropic/Gemini do not uniformly support client-supplied idempotency keys on the chat/generation endpoint the way Toss's payment webhook does (this project's own v1.0 Pitfall 4 territory, now one layer further from the money).

**How to avoid:**
- Treat "did the vendor already run this" as a separate open question from "did we already debit the wallet for this." A `reference_id`-keyed dedupe on the ledger is necessary but not sufficient.
- Prefer a short, bounded retry window keyed to genuinely retry-safe failures only (connection refused / timeout *before* any bytes returned), and treat "we got a partial response, then the connection dropped" as a terminal failure requiring a fresh user-initiated retry, not an automatic one — because for a non-streaming call (the confirmed v1.1 design), a dropped connection after the vendor started generating is exactly the ambiguous case with no receipt.
- If a provider does expose a request-level idempotency key (check OpenAI's `Idempotency-Key` header support at implementation time — behavior and any endpoint restrictions may have changed since this research), pass one derived from the same stable id used for the wallet's `reference_id`, so the vendor's own retry semantics reinforce the ledger's rather than fighting it.

**Detection:**
Any retry/backoff logic added for 429 handling should be reviewed for whether it can re-fire `generateContent` after a response was possibly already delivered by the vendor but lost locally (timeout mid-stream-read, not before-send).

---

### Pitfall 5: A Safety Refusal Is Not an Error — `parseChatResponse` Will Present It as a Normal Reply

**What goes wrong:**
`lib/ai/chat.ts`'s `parseChatResponse` has a documented, deliberate fallback: if the model's output doesn't match the `[REPLY]/[DRAFT]/[DOCUMENT]` protocol, "the whole response" is treated as the reply. This is the right behavior for a model that simply forgot to follow formatting instructions. It is the *wrong* behavior for a safety refusal, which is a real, `ok: true`, fully-billed response from the vendor that does not and structurally cannot contain the expected tags — the model refused to draft a body block, refused to propose a document, and wrote a refusal sentence instead. Today, with Gemini only, this already silently degrades to "reply looks weird" for whatever fraction of prompts trip Gemini's own safety filter (`finishReason === 'SAFETY'`, distinct from `MAX_TOKENS`, and not checked anywhere in the current code). It becomes a **cross-provider inconsistency problem**, not just an occasional rough edge, once OpenAI and Anthropic are added, because the three vendors signal refusal completely differently: Anthropic returns `stop_reason: "refusal"` on an ordinary 200 response (a trained classifier decision, more likely to refuse outright than to comply-with-caveats); OpenAI's chat endpoint historically surfaces `finish_reason: "content_filter"` and, on the newer Responses API, a distinct refusal content block; Gemini uses `finishReason: 'SAFETY'`/`'RECITATION'` alongside `'MAX_TOKENS'` and `'STOP'`. None of these three shapes match each other, and none of them are the `[REPLY]` tag `parseChatResponse` looks for — so every one of them currently falls into "treat the whole raw text as the reply," meaning the writer sees an English or generic refusal sentence (frequently not even in Korean) presented with the same UI chrome as a normal AI reply, with no signal that a regeneration with different wording (rather than retrying identically) is what's actually needed.

**Why it happens:**
The chat protocol (`[REPLY]/[DRAFT]/[DOCUMENT]`) is a prompt-level convention the model is asked to follow; it was never designed to also encode "I'm declining," because with a single vendor and Korean creative-writing prompts this rarely surfaced during Phase 4 development. Multi-provider adds three more code paths that each *can* produce this shape of output, and none of them were in scope when the protocol was designed.

**How to avoid:**
- Each provider adapter must surface its own refusal/safety signal (`finishReason`, `stop_reason`, `finish_reason`) as a normalized field on the adapter's return type, independent of parsing the text content.
- `chat.ts`'s (or its multi-provider successor's) result-building step must check this normalized field *before* falling back to "raw text as reply," and produce a distinct, Korean, actionable message ("이 요청은 안전 정책에 따라 거절됐어요 — 표현을 바꿔 다시 시도해보세요") rather than displaying the vendor's own refusal text as if it were creative output.
- This is a table-stakes cross-provider correctness item, not a nice-to-have — it directly affects the `wasCapped`-style signal the AI panel already relies on to explain non-happy-path outcomes to the writer.

**Detection:**
Manually trigger a refusal from each of the three providers during integration testing (a prompt requesting clearly disallowed content is sufficient) and confirm the panel shows a distinct, branded message rather than the vendor's raw refusal sentence.

---

### Pitfall 6: A Single Token-Estimation Heuristic Will Be Wrong By Very Different Amounts Per Provider, and Worse for Korean

**What goes wrong:**
FEATURES.md correctly identifies that replacing Gemini's pre-call `countTokens` round trip with a local estimate is the "hidden prerequisite" of the entire adapter refactor, and recommends a "local estimate... reconciled against actual usage post-call." The part not yet examined: OpenAI, Anthropic, and Gemini use **three different tokenizers** (roughly: a BPE-family tokenizer for OpenAI, Anthropic's own tokenizer, and Gemini's own — none identical), and their token-per-character ratios for **Korean text specifically** diverge more than they do for English, because Korean's syllable-block (Hangul) structure interacts differently with each vendor's BPE vocabulary training data (which is English-majority for all three, with varying amounts of Korean-specific vocabulary). A single char-count or char/4 heuristic tuned by testing against Gemini's actual `countTokens` output (the only one this codebase has ever measured) will carry an implicit Gemini-shaped correction factor that is simply wrong, in an unverified direction, for the other two vendors. Concretely, this feeds `computeMaxOutputTokens`-equivalent logic (service-key path) and the pre-call cost estimate shown to the writer — a systematically wrong estimate for the input-token side does not just make the *estimate* imprecise, it changes the *output budget* the platform grants for a given wallet balance, meaning a writer could see wildly different "how much can I generate" behavior purely because they switched providers with an identical wallet balance and an identical prompt.

**Why it happens:**
The only tokenizer this project has ever integrated is Gemini's remote one; there has been no occasion yet to notice that "characters per token" is not a provider-agnostic constant, let alone that it is not a language-agnostic one either.

**How to avoid:**
- Do not reuse a single global heuristic constant across providers. Calibrate a separate rough multiplier per provider using a small representative sample of actual Korean prose sent through each vendor's real (or SDK-provided offline) tokenizer during the adapter-build phase, and store it as a named per-provider constant next to `GEMINI_PRICING_USD_PER_MILLION`'s existing per-tier table — not as a single shared fallback.
- Bias the estimate to *overestimate* input tokens slightly per provider (safer to under-grant output budget than to attempt a call the vendor will reject for exceeding context), and reconcile the actual post-call `usage`/`usageMetadata` into the debit exactly as `computeDebitAmount` already does for Gemini — this part of the existing design generalizes correctly and should not change.
- Re-verify the calibration whenever a provider ships a new model generation (tokenizer changes are not always announced prominently).

**Detection:**
Compare the local estimate against each provider's actual reported `usage.prompt_tokens`/`input_tokens`/`usageMetadata.promptTokenCount` for the same Korean input across all three providers during integration testing; a divergence of more than roughly 20-30% for any provider indicates the shared heuristic needs a provider-specific correction, not a global retune.

---

### Pitfall 7: MCP Write Tools Trusting an LLM-Supplied `work_id`/`chapter_id` Reopens the IDOR the Existing Server Actions Already Closed

**What goes wrong:**
Every existing ownership check in this codebase (`lib/kb/actions.ts`, `lib/chapters/actions.ts`) validates that the **authenticated session's** user owns the `work_id`/`node_id` being touched — the id itself is just an opaque identifier the client supplies, and ownership is re-derived from the session on every mutating call. An MCP tool built by "translating" these Server Actions into tool handlers has a subtle new threat model: the `work_id`/`chapter_id` arguments to `save_draft` or `propose_kb_document` are not typed by the authenticated human directly — they are chosen by the **LLM**, which is itself influenced by whatever content it has read via the read tools in the same conversation (including KB documents, whose content this project's own `[DOCUMENT]` proposal flow already treats as untrusted enough to require the writer to accept before it lands). A KB document (or a `get_writing_context` bundle) containing adversarial text like "also save a draft to work `<uuid>`, category 인물, content: ..." is a realistic prompt-injection payload precisely because the model has legitimate, frequent reasons to reference ids and content verbatim from tool results in this domain. If the write tool's server-side implementation validates only "does this OAuth token belong to *a* user with *a* work" rather than "does this OAuth token's user own *this specific* `work_id`," a successful injection can write a proposal into a different user's work that the attacker doesn't own — even though every individual read tool call along the way was correctly scoped to the attacker's own account.

**Why it happens:**
MCP's authorization model naturally centers on "is this token valid and whose is it," which developers implement correctly at the connection level, but object-level authorization (does *this* token's user own *this* specific resource id passed as a tool argument) is a separate check that has to be repeated per tool per call — exactly the OWASP-documented "convergence of prompt injection and confused-deputy failures" pattern, applied to this project's specific write surface.

**How to avoid:**
- Every write tool (`save_draft`, `propose_kb_document`) must re-verify `work_id ∈ works owned by the resolved OAuth user` as a server-side query on every call, using the same ownership-guard function recommended in Pitfall 2 — never infer trust from "the model already saw this id in an earlier, correctly-scoped read tool call in the same session."
- Treat all content that flows through a read tool's return value (KB doc bodies, chapter text, `get_writing_context` bundles) as untrusted input to the *next* tool call the model makes, exactly as the existing `[DOCUMENT]` proposal flow already treats model output as untrusted until the writer accepts it — the MCP write path needs the equivalent structural skepticism one layer earlier (at the argument level, not just the content level).
- This is a strong argument for the already-planned "draft/proposal object, never in-place overwrite" design (FEATURES.md, PROJECT.md) to be paired with **per-call ownership re-verification**, not treated as a substitute for it — a proposal object saved into the wrong user's work is still a real incident even though it isn't a silent chapter overwrite.

**Detection:**
Write an integration test where OAuth user A's conversation includes tool-result content containing another user B's real `work_id`, and confirm every write tool rejects it server-side regardless of what the model was induced to pass.

---

### Pitfall 8: Disconnecting an MCP Client Deletes a Row, Not the Access the Client Already Holds

**What goes wrong:**
The roadmap's completion criterion — "연결 해제 후 접근 차단" (access blocked after disconnect) — is trivial to satisfy in a demo (delete the connection row, the UI shows "disconnected") and easy to fail in reality if the OAuth implementation issues **long-lived access tokens** (or a JWT with a long expiry) rather than short-lived tokens backed by a revocable refresh-token/grant record. If the MCP server validates access tokens by checking a signature and expiry alone (stateless JWT validation — the simplest thing to implement, and the thing most tutorials show first for MCP OAuth), then deleting the "connection" row in NovelScript's own database has **no effect** on a token the external client already holds and will keep presenting until it naturally expires, which could be hours or days depending on the chosen lifetime. This is exactly the gap between "looks disconnected" and "is disconnected."

**Why it happens:**
Stateless token validation is the standard, simplest OAuth resource-server pattern, and it is *fine* for authorization decisions made per-request against still-valid grants — but it is fundamentally incompatible with "revoke on demand" unless paired with either very short token lifetimes plus a refresh flow that checks a live grant record, or a token-introspection/deny-list check on every request.

**How to avoid:**
- Every MCP tool call must check token validity against a live, queryable grant/session record (not signature+expiry alone) — i.e., token introspection against the NovelScript DB, not pure stateless JWT verification — so that deleting the connection row takes effect on the *next* tool call, not merely at the next natural token expiry.
- Keep access-token lifetimes short regardless (this is standard OAuth 2.1 guidance independent of the revocation mechanism), and make the connect/disconnect UI explicitly state what "disconnected" guarantees (e.g., "다음 호출부터 차단됩니다" rather than implying instant revocation if there's any residual propagation delay).
- Test disconnection by actually attempting a tool call with a token issued before the disconnect, not by only checking that the UI no longer lists the connection.

**Detection:**
If the OAuth implementation's access-token validation function never queries the database (pure crypto/expiry check), the "연결 해제 후 접근 차단" criterion is not actually met regardless of what the UI shows.

---

### Pitfall 9: Provider Onboarding (Org Verification, Billing, Rate-Limit Tiers) Has Its Own External Lead Time — the Same Shape of Risk That Already Blocked Phase 5

**What goes wrong:**
v1.0's own pitfalls research (Pitfall 2) already burned this project once: PG integration was treated as "an API to call" and the actual blocker turned out to be an external review process (merchant application, card-network review) outside the founder's control. The multi-provider work has a structurally identical risk that is easy to miss because it looks like "just add an API key": OpenAI now requires **Organization Verification** (government-ID-based identity verification) to access its current-generation and reasoning models at all, and un-verified organizations are capped to older/lower-tier models and lower rate limits; Anthropic and OpenAI both gate meaningfully higher throughput behind usage-tier progression that accrues over time/spend rather than being available on account creation. For a solo-founder Korean entity setting up *platform-key* (service-key) accounts with international billing on both new vendors, at minimum: (1) verification/approval is not instantaneous, (2) the newly-created accounts will initially sit at the lowest rate-limit tier, which may be materially lower than what a beta launch needs even before any BYOK traffic exists, and (3) this needs to be started **before** the adapter code is "done," or the milestone's own completion criteria ("Gemini 및 추가 제공자에서... 흐름이 동작한다") become blocked on an external queue exactly the way Phase 5 was.

**Why it happens:**
Vendor account setup is treated as a same-day prerequisite because it *is* same-day for a hobby/dev-tier key — the gap only appears when the product needs the verified/higher tier that a beta with real users actually requires, and by then feature work is already scheduled against an assumption that the key "just works."

**How to avoid:**
- Start OpenAI Organization Verification and Anthropic account/billing setup at the *start* of the adapter-build phase, in parallel with writing the adapter code, exactly as v1.0's Pitfall 2 recommends for PG — not after the adapters are code-complete and ready to test against real traffic.
- Confirm actual rate-limit tier reachable at the account's current verification/spend level before assuming a specific tier's throughput in the cost/capability table, since the "list pricing" numbers used for `GEMINI_PRICING_USD_PER_MILLION`-equivalent tables are independent of whether the account can actually sustain that throughput yet.
- Track this explicitly as an external dependency with its own lead time in the roadmap/STATE.md `Blockers/Concerns` section, the same way the Toss key wait is tracked today, rather than folding it silently into "adapter implementation."

**Detection:**
No OpenAI Organization Verification submitted and no Anthropic billing/tier confirmation done by the time adapter code review begins is the direct analogue of v1.0's warning sign ("No PG merchant application submitted by the time feature work on payment begins").

---

### Pitfall 10: `ai_usage` and `ledger_entries` Will Look Interchangeable to Whoever Eventually Builds the Author 90/10 Settlement

**What goes wrong:**
STATE.md confirms the author 90/10 revenue-split (v1.0 Phase 6 residual) is explicitly unimplemented and deferred, and FEATURES.md already correctly warns against writing BYOK usage into `wallet_ledger` as zero-delta rows. The gap neither document closes: once a **separate** `ai_usage` table exists (BYOK calls, zero wallet debit, per FEATURES.md's own recommendation) sitting alongside `ledger_entries` (real money movement, including the *existing* `ai_generation` reference-type debits from the service-key path), a future engineer implementing settlement will need "how much of this work's activity was platform-key AI cost vs. reader revenue vs. BYOK usage that cost the platform nothing" — three categories that live in two tables with superficially similar shapes (amounts, timestamps, work/chapter references). The concrete risk is not "will someone deliberately misuse BYOK data for settlement" — it's that a `SUM` or `JOIN` written for the 90/10 calculation, scoped by `reference_type` or by table name alone without an explicit design note carried over from this milestone, could plausibly include or exclude the wrong rows on the first pass (e.g., summing all `ledger_entries` for a work as "revenue" without excluding `reference_type = 'ai_generation'` cost rows, which are debits and would at least net out arithmetically — but a *count*-based or *engagement*-based settlement metric, if one is ever considered, would not self-correct the way a signed-sum does).

**Why it happens:**
The two tables are being designed in different milestones, by different sessions, months apart, with no shared schema-level comment linking them to the eventual settlement logic — exactly the kind of cross-milestone integration gap that doesn't surface until the later phase is actually built, by which point the earlier schema decisions are already shipped and harder to change.

**How to avoid:**
- When the `ai_usage` table is created in this milestone, add an explicit SQL comment (`comment on table ai_usage is ...`) stating it is BYOK-only, zero-settlement-relevance, and must never be joined into revenue calculations — the same explicit-comment convention this project already uses for load-bearing schema decisions.
- Add a short note to STATE.md's Pending Todos (or wherever the Phase 6 settlement task is tracked) pointing forward at this milestone's `ai_usage`/`ledger_entries` split, so the settlement implementer starts from "these are the two tables and here is why they're separate" instead of discovering the boundary from scratch.
- Do not let the `ai_generation` reference-type debits (existing, real, platform cost) get renamed or restructured casually during the multi-provider migration in a way that breaks whatever `reference_type` filtering the eventual settlement query will need — treat `reference_type` values as a stable, documented enum from this point on.

**Detection:**
When Phase 6 settlement work eventually begins, check whether its design references this milestone's `ai_usage`/`ledger_entries` boundary explicitly, or whether it's re-deriving the distinction from scratch (a sign the forward note wasn't left, or wasn't found).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| Reuse `createAdminClient()` inside a new MCP tool because the wallet code already does it | Fast to ship, matches an existing codebase convention | Confused-deputy RLS bypass reachable by any valid OAuth token if the ownership predicate is even slightly wrong (Pitfall 2) | Never for MCP tool handlers as a default; only for the same narrowly-audited exceptions already in the service-key path |
| Pass client-reported billing mode (`byok: true/false`) straight into the debit branch | Simpler request/response shape, no extra DB lookup per call | TOCTOU billing-mode bug — stale client state can skip a real debit or (if a fallback is later added) silently cross-charge the platform (Pitfall 3) | Never — billing mode must always be re-derived server-side, same principle as commerce's server-computed totals |
| Ship a single global char-count token-estimation heuristic across all three providers | One constant, one function, fast to implement | Systematically wrong output-budget grants per provider, worse for Korean text specifically (Pitfall 6) | Never as a permanent design; acceptable only as a placeholder explicitly flagged for per-provider calibration before beta |
| Treat "no `[REPLY]` tag matched" as always meaning "model forgot formatting" | No new branch needed in `parseChatResponse` | Safety refusals from any of the three providers render as confusing raw text with full billing and no distinct UX signal (Pitfall 5) | Never once more than one provider exists — this must branch on a normalized refusal signal before falling back to raw-text |
| Validate MCP OAuth tokens by signature+expiry only (pure stateless JWT check) | Simplest resource-server implementation, no DB round trip per call | "연결 해제" cannot actually revoke access until natural token expiry — the completion criterion is unmet despite the UI looking correct (Pitfall 8) | Acceptable only if paired with genuinely short (minutes-scale) access-token lifetimes and a refresh flow that itself checks a live grant; never as the sole mechanism with hours/day-scale tokens |
| Defer per-provider rate-limit-tier verification until integration testing | Adapter code can be written and reviewed without waiting on vendor account status | Discovering a low, unverified-tier rate limit only after beta traffic starts repeats the v1.0 PG lead-time mistake in a new subsystem (Pitfall 9) | Never — start vendor account/verification in parallel with adapter code, same lesson as Toss |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|--------------|------------------|---------------------|
| OpenAI / Anthropic / Gemini refusal signaling | Assuming all three surface refusals as HTTP errors like an auth or rate-limit failure | Anthropic returns `stop_reason: "refusal"` on a 200; OpenAI historically uses `finish_reason: "content_filter"` (Responses API adds a distinct refusal content block); Gemini uses `finishReason: 'SAFETY'`/`'RECITATION'`. Each adapter must normalize its own signal into a shared refusal flag the chat layer checks explicitly (Pitfall 5) |
| OpenAI / Anthropic / Gemini rate-limit signaling | Building one "check `Retry-After` header" path and assuming it works for all three | OpenAI exposes `x-ratelimit-*` headers (requests/tokens, separate limit+remaining+reset); Anthropic exposes `anthropic-ratelimit-*` headers per-dimension plus its own `retry-after`; **Gemini does not return rate-limit headers on its normal responses at all** — Gemini-specific backoff must be time-based/generic, not header-driven |
| OpenAI error body vs. thrown client error | Assuming "the API masks the key in its error response, so error handling is safe" | The provider's JSON body masks the key (`sk-****XXXX`), but the HTTP client's *thrown Error object* commonly carries the full outgoing request (including the unmasked `Authorization`/`x-api-key` header) in a `config`/`request` property — these are two different surfaces requiring two different mitigations (Pitfall 1) |
| Error-tracking tooling (Sentry-class, if/when added) | Calling `captureException(err)` on a raw provider-SDK error | Add a `beforeSend`-style redaction step stripping auth headers/config from any AI-adapter error before it reaches the tracker, at initialization, not per call site |
| Local token estimation vs. real per-provider tokenizers | One heuristic constant reused across providers, calibrated only against Gemini's `countTokens` | Calibrate a distinct per-provider multiplier using representative Korean text against each vendor's actual tokenizer/usage response; reconcile against real post-call usage the same way `computeDebitAmount` already does (Pitfall 6) |
| MCP OAuth token validation | Stateless signature+expiry check only | Introspect against a live, queryable grant record so deletion/revocation takes effect on the next call, not at natural token expiry (Pitfall 8) |
| ChatGPT custom connectors | Assuming all paid ChatGPT tiers get the same connector capability | As of this research, Plus/Pro individual accounts can use developer-mode custom connectors for **read/fetch tools only**; fully write-capable custom connectors remain gated to Business/Enterprise/Edu workspaces, where an admin must separately enable write actions. This refines (not contradicts) FEATURES.md's "pick Claude as primary, ChatGPT as best-effort" recommendation — read-tool parity with ChatGPT Plus may be reachable sooner than write-tool parity |
| OpenAI account tier for service-key (platform) usage | Assuming a freshly created API account can reach current-generation/reasoning models and beta-scale rate limits immediately | OpenAI requires government-ID-based Organization Verification to access its latest models at all, and unverified/low-tier accounts sit at materially lower rate limits regardless of billing being enabled — plan this lead time the same way Toss's merchant review was planned (Pitfall 9) |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|------------------|
| Per-call MCP tool authorization re-derivation done as multiple sequential round-trip queries | MCP tool latency degrades as the number of ownership checks per call grows (work → chapter → folder chain) | Design the ownership-guard predicate (Pitfall 2/7) as a single indexed query per resource type, reusable across tools, not a chain of separate round trips per tool | Becomes noticeable once `get_writing_context` (the recommended highest-value MCP tool) needs to validate ownership across work + multiple mentioned KB nodes in one call |
| Token-usage reconciliation waiting on a full round-trip usage object that a provider may omit on abnormal termination | A dropped/timed-out non-streaming request leaves no usage data to reconcile against, so the debit step has nothing accurate to bill | Treat "no usage object returned" as its own explicit outcome requiring the conservative (higher, not lower) of the pre-call estimate or zero — never silently default to zero-cost, which reopens Pitfall 1-class runaway risk from v1.0 research | Surfaces whenever a provider call times out or the connection drops after the vendor started work but before the response completed (more likely under multi-vendor load variance than with Gemini alone) |
| MCP server co-located on the same Next.js deployment without independent rate limiting | A public MCP endpoint gets hit directly (bypassing the studio app's own request patterns) and consumes the same compute/DB budget as normal traffic, with no separate throttle | Rate-limit the MCP endpoint independently of the main app's traffic assumptions, since its caller population (AI hosts, potentially retrying automatically) behaves differently from human browser traffic | Becomes a real risk the moment the MCP server is publicly reachable — this is inherent to "remote HTTP MCP server," not a scale-later concern |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Logging or tracking raw caught errors from provider SDK calls | Full BYOK key leaks into log aggregation or an error-tracking SaaS via the HTTP client's request/config object, not the provider's own response body | Scrub auth headers/config at a single choke point before any logging/tracking call (Pitfall 1) |
| Reusing the service-role admin client inside MCP tool handlers without a fresh, explicit ownership predicate per call | Confused-deputy cross-user read/write reachable via any valid OAuth token | Route MCP tools through user-scoped clients by default; treat admin-client usage as an audited exception (Pitfall 2) |
| Trusting an LLM-supplied `work_id`/`chapter_id` argument as if it came from the authenticated human directly | Prompt-injection-driven IDOR — a crafted KB document or tool result can induce a write into another user's work | Re-verify ownership of every resource id server-side on every write-tool call, regardless of what the model was induced to pass (Pitfall 7) |
| Validating MCP access tokens by signature+expiry alone | "연결 해제" does not actually revoke access until natural token expiry | Introspect against a live grant record on every call; keep access-token lifetimes short (Pitfall 8) |
| Deriving billing mode (service key vs. BYOK) from client-supplied request state | Stale or spoofable client state can skip a real debit or reopen the explicitly-rejected silent cross-mode fallback | Re-derive "does a valid key exist for this user+provider right now" server-side on every call (Pitfall 3) |
| Treating a provider's masked error body (`sk-****XXXX`) as proof the key can never leak from error handling | False confidence — the same error's underlying request object is frequently unmasked | Audit the full error object shape per provider SDK, not just the JSON body, before deciding error handling is safe (Pitfall 1) |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| A vendor safety refusal rendered with the same styling as a normal AI reply | Writer sees a confusing (sometimes non-Korean) refusal sentence with no indication it's a refusal, wastes tokens/balance retrying the same prompt identically | Detect the normalized refusal signal per provider and show a distinct, Korean, actionable message suggesting rewording (Pitfall 5) |
| Provider/model picker shows a "BYOK 사용 가능" badge that goes stale between page load and the actual call | User sends a turn believing their own key will be used, gets an unexpected failure or (if a fallback is ever added) an unexpected platform charge | Re-validate key availability at call time server-side, not just at picker-render time (Pitfall 3) |
| "연결 해제" button implies immediate access revocation | User disconnects a leaked/compromised MCP connection expecting instant protection, but a still-valid access token keeps working until natural expiry | Either guarantee near-immediate revocation via live grant introspection, or state the actual guarantee explicitly in the UI copy (Pitfall 8) |
| Cost/output-budget behavior differs meaningfully between providers for an identical wallet balance because of miscalibrated per-provider token estimates | Writer perceives one provider as arbitrarily "stingier" with output length for no visible reason, erodes trust in the cost system | Calibrate and reconcile token estimates per provider explicitly rather than sharing one heuristic (Pitfall 6) |

## "Looks Done But Isn't" Checklist

- [ ] **BYOK key storage:** Looks done when a key can be added, masked, and deleted in Settings — verify no code path anywhere (adapters, error handlers, logging, error-tracking init) can emit the plaintext key into a log or tracker, including via a raw caught SDK error object (Pitfall 1).
- [ ] **Multi-provider chat generation:** Looks done when Gemini, OpenAI, and Anthropic all return a `[REPLY]`-shaped happy-path response — verify a deliberate safety-triggering prompt against each of the three produces a distinct, branded refusal message rather than raw vendor text billed as a normal reply (Pitfall 5).
- [ ] **BYOK billing-mode separation:** Looks done when a BYOK call correctly skips the wallet debit in the happy path — verify the mode decision is re-derived server-side at call time, and specifically test the case where the key is deleted between panel load and message send (Pitfall 3).
- [ ] **Idempotent AI debit fix:** Looks done when the ledger's `reference_id` is stable and a retried request no-ops on the second `apply_wallet_delta` call — verify this doesn't mask a second real vendor call/cost that the ledger dedupe silently absorbed (Pitfall 4).
- [ ] **MCP read/write tools:** Looks done when a tool correctly returns/saves data for its own authenticated user — verify with a cross-user test that a second user's OAuth token, or a first user's session induced via injected tool-result content to reference a second user's resource id, cannot read or write across the ownership boundary (Pitfall 2, Pitfall 7).
- [ ] **MCP connect/disconnect:** Looks done when the UI shows "disconnected" and the connection list updates — verify by attempting a tool call with a token issued before disconnection that access is actually blocked, not merely hidden from the UI (Pitfall 8).
- [ ] **Provider/vendor account setup (service-key mode):** Looks done when a valid API key from each vendor is in `.env` and a test call succeeds — verify the account's actual verification tier and rate-limit ceiling, not just that a low-volume test call worked (Pitfall 9).
- [ ] **`ai_usage` table:** Looks done when BYOK calls are recorded with zero wallet debit — verify the table carries an explicit, discoverable comment/note preventing it from being folded into a future revenue-settlement query (Pitfall 10).

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|----------------|-----------------|
| A BYOK key already leaked into logs/error-tracking | HIGH (cannot un-leak a log line) | Immediately advise the affected user to rotate/revoke the key at the provider; audit the leak's scope (which log sink, retention window, who has access); fix the redaction gap at the shared choke point before any further BYOK traffic; do not treat deleting the log entry as sufficient — the exposure window already existed |
| A confused-deputy MCP bug allowed cross-user access before being caught | HIGH if it reached production with real users, MEDIUM if caught in testing | Revoke all outstanding MCP OAuth grants immediately (forcing re-connection), audit access logs for the affected tool to identify which resources were actually touched, notify affected users per the severity of what was exposed, then retrofit the ownership-guard predicate as a shared, tested function rather than patching the one tool |
| Vendor double-billed a request the ledger correctly deduped once | LOW-MEDIUM (money lost is the platform's/BYOK user's actual vendor spend, not a ledger-visible discrepancy) | Because the ledger looks consistent, this is only discoverable by reconciling against the vendor's own usage dashboard/invoice — build that reconciliation habit into the same monitoring cadence already planned for LLM cost tracking, and tighten the retry-safety boundary (Pitfall 4) once a mismatch is found |
| A revoked MCP connection kept working past the expected "disconnect" moment | LOW if access tokens are already short-lived, HIGH if they were long-lived and this is discovered after real use | Force-invalidate the underlying signing key/session store to kill all outstanding tokens immediately as a stopgap; then implement live grant introspection (Pitfall 8) so this class of gap cannot recur |
| Provider onboarding delay discovered late (org verification pending) | MEDIUM | Communicate a revised milestone date immediately rather than slipping silently, exactly as v1.0's Pitfall 2 recovery recommends for PG; use the wait productively on the BYOK/MCP tracks that don't depend on the blocked vendor's service-key tier |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|--------------------|----------------|
| BYOK key leakage via error objects | BYOK key storage/adapter phase (must ship the redaction choke point as part of the adapter interface itself) | Code review specifically greps for raw-error logging/tracking calls in every provider adapter; no plaintext key ever appears in a test log during BYOK integration testing |
| MCP confused-deputy admin-client bypass | MCP OAuth + read-tools phase | Cross-user ownership test suite passes for every tool before any tool ships; any `createAdminClient()` usage inside MCP code gets explicit sign-off |
| Client-trusted billing mode / TOCTOU on key state | BYOK call path phase | Test: delete a key between panel load and message send; confirm server re-derives mode and produces the correct explicit error, never a silent fallback |
| Ledger-idempotent-but-vendor-double-billed retries | Idempotent AI debit phase, before any retry/backoff is added | Reconciliation check comparing platform ledger totals against vendor-reported usage for a sample of retried requests |
| Cross-provider refusal handling | Multi-provider adapter phase (must land alongside the adapters themselves, not as a follow-up) | Deliberate refusal-triggering prompt tested against all three providers produces a distinct branded message, not raw vendor text |
| Per-provider token estimation miscalibration | Local token estimation phase (the adapter refactor's stated prerequisite) | Estimate-vs-actual-usage divergence measured per provider against real Korean prose samples before beta |
| MCP write-tool IDOR via prompt injection | MCP write-tools + review-surface phase | Injected-content cross-user write test (Pitfall 7's detection method) passes before write tools ship |
| MCP token revocation illusion | MCP connect/disconnect phase | Post-disconnect tool call with a pre-disconnect token is verified blocked, not just absent from the UI list |
| Provider account/verification lead time | Kickoff of the adapter-build phase, in parallel with code | Org verification submitted and rate-limit tier confirmed before adapter code review is treated as complete, tracked in STATE.md Blockers/Concerns |
| `ai_usage`/`ledger_entries` settlement ambiguity | BYOK usage-recording phase (schema decision time) | Explicit table comment exists on `ai_usage` at merge time; forward note left in STATE.md Pending Todos for the eventual Phase 6 settlement work |

## Sources

**Project context (authoritative, code read directly):**
- `lib/ai/chat.ts`, `lib/ai/cost.ts`, `lib/ai/gemini.ts` — existing single-vendor chat/cost/client code; confirmed bare `catch` blocks with no logging today, `parseChatResponse`'s raw-text fallback, `crypto.randomUUID()` as the non-idempotent `p_reference_id`
- `lib/commerce/actions.ts`, `lib/access/actions.ts` — existing server-side-computed billing pattern and RPC-based ownership checks used as the template BYOK/MCP should follow
- `supabase/migrations/0001_init.sql` — `apply_wallet_delta`'s actual `on conflict (wallet_id, reference_type, reference_id) do nothing` dedupe behavior (confirmed idempotency mechanism exists but is unused by AI spend today)
- `supabase/migrations/0005_commerce.sql` — existing `idempotency_key` pattern on `orders`, the precedent recommended for the AI debit fix
- `.planning/research/FEATURES.md` (2026-09-15) — v1.1 feature landscape; this document deliberately does not repeat its findings
- `.planning/research/v1.0/PITFALLS.md` (2026-08-25) — structural template and the PG-lead-time / client-trusted-amount pitfalls this document extends into the multi-vendor and MCP context
- `.planning/PROJECT.md`, `.planning/STATE.md` — v1.1 scope, Key Decisions, and the confirmed-unimplemented Phase 6 author 90/10 settlement referenced in Pitfall 10
- `docs/ai-integration-roadmap.md` — 1st/2nd stage completion criteria referenced throughout

**MCP security (HIGH confidence — official/standards-adjacent sources, corroborated statistics):**
- [OWASP MCP Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/MCP_Security_Cheat_Sheet.html) — confused-deputy pattern, OAuth/PKCE guidance, prompt-injection-to-tool-call chaining, session-binding recommendations
- [Checkmarx — MCP Security: Risks, Real Incidents & Controls (2026)](https://checkmarx.com/learn/mcp-security-risks-real-world-incidents-and-security-controls/) — command injection (43%) and SSRF (36.7%) prevalence across tested MCP servers
- [Practical DevSecOps — MCP Security Statistics 2026](https://www.practical-devsecops.com/mcp-security-statistics-2026-report/) — 30+ CVEs filed against MCP servers in a 60-day window in early 2026
- [Microsoft Community Hub — The state of MCP security in 2026](https://techcommunity.microsoft.com/blog/microsoft-security-blog/the-state-of-mcp-security-in-2026/4531327)
- [Codersera — How to Secure MCP Servers: Auth, Prompt Injection & Defenses (2026)](https://codersera.com/blog/how-to-secure-mcp-servers-2026/)

**Provider/vendor behavior differences (MEDIUM-HIGH confidence — cross-checked across 2+ independent sources per claim):**
- [Requesty — LLM API Rate Limits (2026): OpenAI, Anthropic & DeepSeek](https://www.requesty.ai/blog/rate-limits-for-llm-providers-openai-anthropic-and-deepseek) and [DevTk.AI — AI API Rate Limits 2026](https://devtk.ai/en/blog/ai-api-rate-limits-comparison-2026/) — per-provider rate-limit header shapes, confirmation Gemini omits rate-limit headers on normal responses
- [ControlTheory — stop_reason: refusal (200 OK): The Silent Claude Refusal](https://www.controltheory.com/incidents/anthropic-stop-reason-refusal/) and [pydantic-ai issue #8176 — Refusal handling diverges across providers](https://github.com/pydantic/pydantic-ai/issues/8176) — Anthropic 200-status refusal vs. OpenAI content_filter finish_reason divergence
- [litellm PR #40903 — map content_filter finish reason to refusal stop_reason](https://github.com/BerriAI/litellm/pull/40903) — corroborates the cross-provider refusal-shape mismatch from a library maintainer's own fix
- [OpenAI community — Non-Announcement: Requiring identity card verification for API models](https://community.openai.com/t/openai-non-announcement-requiring-identity-card-verification-for-access-to-new-api-models-and-capabilities/1230004) and [OpenAI Help Center — API Organization Verification](https://help.openai.com/en/articles/10910291-api-organization-verification) — Organization Verification requirement and its effect on model/rate-limit access
- [Forrester — OpenAI Requires Identity Verification For Access To Its Latest Models](https://www.forrester.com/blogs/openai-requires-identity-verification-for-access-to-its-latest-models/)
- [Peliqan — ChatGPT MCP: plans, setup and what breaks in 2026](https://peliqan.io/blog/chatgpt-mcp/) and [Coworker AI — ChatGPT MCP: Setup, Plans, and Limits (2026)](https://coworker.ai/blog/chatgpt-mcp) — refinement that Plus/Pro get read/fetch-only via developer-mode connectors while write actions require a Business/Enterprise/Edu admin to enable

**Key leakage / secrets-handling (MEDIUM-HIGH confidence):**
- [GuardLayer — NEXT_PUBLIC_ leaked my API key](https://www.guardlayer.io/blog/next-public-leaked-api-key) and [MakerKit — Next.js Server Actions Security: 5 Vulnerabilities You Must Fix](https://makerkit.dev/blog/tutorials/secure-nextjs-server-actions) — Next.js-specific key-exposure surfaces (bundle inclusion, Server Action boundary assumptions)
- [Sentry-javascript issue #1911 — capturing axios error breaks internal Stream node object](https://github.com/getsentry/sentry-javascript/issues/1911) and related Sentry/axios issues — concrete evidence that a caught HTTP-client error's request config (including Authorization headers) round-trips into error trackers unless explicitly scrubbed
- [DEV Community — How to let users bring their own OpenAI/Anthropic API keys without plaintext storage](https://dev.to/c9dn/how-to-let-users-bring-their-own-openai-or-anthropic-api-keys-without-storing-them-in-plaintext-12m)

**Vendor-call idempotency / streaming-abort billing (MEDIUM confidence, corroborates Pitfall 4 from a different angle):**
- [openai-openapi issue #539 — Token usage not returned when stream is aborted mid-generation](https://github.com/openai/openai-openapi/issues/539)
- [litellm PR #39893 — price recovered tokens when a /v1/messages client disconnects mid-stream](https://github.com/BerriAI/litellm/pull/39893)

**Supabase Vault / encryption status (MEDIUM confidence, resolves the open STACK question referenced in PROJECT.md as context, not a v1.1 decision made by this document):**
- [Supabase Docs — Vault](https://supabase.com/docs/guides/database/vault) and [Supabase Docs — pgsodium (pending deprecation)](https://supabase.com/docs/guides/database/extensions/pgsodium) — Vault's public interface is stable and will remain the recommended path even as its internal reliance on pgsodium is phased out; relevant to the still-Pending "Vault vs. app-level AES-GCM" decision in PROJECT.md

---
*Pitfalls research for: NovelScript v1.1 — multi-provider AI, BYOK, subscription-AI MCP*
*Researched: 2026-09-16*
