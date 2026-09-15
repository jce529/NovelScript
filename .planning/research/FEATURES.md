# Feature Research

**Domain:** Multi-provider AI connectivity + BYOK key management + remote MCP server for a Korean AI-assisted webnovel platform (NovelScript v1.1)
**Researched:** 2026-09-15
**Confidence:** MEDIUM-HIGH
- HIGH on MCP client/host reality (official Anthropic support docs, MCP spec/blog on tool annotations, ChatGPT connector plan restrictions)
- MEDIUM on BYOK key-management UX conventions (vendor docs are thin on the "after you save it" half — NovelCrafter, JetBrains, Kilo all document *adding* a key and none document masking/rotation UX; conventions inferred from several products + general secrets-handling practice)
- MEDIUM on provider/model selector conventions (Cursor/LibreChat/Open WebUI docs verified; the "global default + per-call override" pattern is consistent across all three)

## Scope Note: what already exists (do not re-scope)

Verified by reading the current code, because every v1.1 feature below hangs off one of these:

| Existing thing | Where | Why it constrains v1.1 |
|---|---|---|
| Single-vendor Gemini client | `lib/ai/gemini.ts` — `GeminiClient` interface with `generateContent` + `countTokens`, dependency-injected | The interface is *already* adapter-shaped, but it is Gemini-specific in two load-bearing ways: (a) a **pre-call `countTokens` round trip**, which OpenAI and Anthropic do not offer as a cheap remote call, and (b) `MODEL_TIER_TO_ID` as a hardcoded 2-tier (`lite`/`pro`) map. Both are the real migration cost, not the HTTP calls. |
| Balance-derived output cap | `lib/ai/cost.ts` — `computeMaxOutputTokens()` converts wallet balance → `maxOutputTokens` before the call | This is a **service-key-only mechanism**. Under BYOK there is no balance to cap against, so every "wallet 잔액 0 → 대화 차단" path (`chat.ts` returns `'보유 토큰을 모두 사용해서 대화할 수 없어요.'`) must be bypassed, not merely zeroed. |
| Post-call wallet debit | `lib/ai/chat.ts` → `apply_wallet_delta` RPC with `p_reference_type: 'ai_generation'`, `p_reference_id: crypto.randomUUID()` | The debit already exists and is **not idempotent against a retry** — the reference_id is generated fresh per call, so it dedupes nothing. v1.1's "중복 정산 방지" requirement means fixing this, not just adding BYOK. |
| Chat turn shape | `chat.ts` `ChatResult` returns `reply` / `draft` / `proposal` parsed from a `[REPLY]/[DRAFT]/[DOCUMENT]` text protocol | This protocol is prompt-level, not SDK-level, so it ports to any provider — but it is also exactly the "draft + 설정 변경안, never auto-overwrite" model the MCP write-back should reuse rather than reinvent. |
| AI panel UI | `app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanel.tsx` + mention autocomplete | The provider/model selector has to land in this panel; there is currently only a `modelTier` concept, no provider concept. |
| Wallet ledger | `apply_wallet_delta` RPC, `wallets` table, commerce actions already use an `idempotencyKey` | Commerce already solved idempotency (`lib/commerce/actions.ts` takes a `idempotencyKey: z.string().uuid()`); AI spend did not. Reuse the commerce pattern. |

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = the feature feels broken or untrustworthy, and for BYOK specifically, untrustworthy = unused (nobody pastes a paid API key into a UI that feels sketchy).

#### A. BYOK key management

| Feature | Why Expected | Complexity | Notes / dependency |
|---|---|---|---|
| Add key per provider from an account-settings page (not buried in the editor) | Universal across NovelCrafter, JetBrains AI Assistant, Kilo, LibreChat: keys live in **settings/profile**, never in the composing surface. Writers set it up once and forget | LOW | New settings route; no dependency on the AI panel. NovelCrafter's flow is literally profile → Open Settings → scroll to provider → "add" |
| "Test connection" / validate-on-save that proves the key works **before** it's stored as active | The server must verify ownership anyway (roadmap: "키의 소유권을 서버에서 검증"). From the user's side, a key that silently fails at 3am mid-draft is the #1 BYOK complaint | LOW-MEDIUM | Cheapest credible validation = call the provider's **models-list endpoint** (OpenAI `GET /v1/models`, Anthropic `GET /v1/models`, Gemini `ListModels`) — a zero-cost, no-token call. NovelCrafter does exactly this implicitly ("you will then see the models that you have access to"). Do NOT validate by firing a real generation — it charges the user to save a key |
| Masked display after save — show provider + last 4 chars + created-at, never the full key, never re-fetchable | This is the trust contract. Once saved, the plaintext must be irrecoverable from the UI and from logs (explicit roadmap requirement: "저장한 키를 클라이언트나 로그로 반환하지 않는다") | LOW | Store the masked hint (`sk-...a3f9`) as a **separate plaintext column** alongside the ciphertext, so rendering the list never requires a decrypt. This is the single most important schema decision in the BYOK slice |
| Replace / rotate = delete + re-add (same form, overwrite) | Rotation guidance across BYOK docs is uniformly "delete old, generate new, update the app" — no product offers in-place edit of a secret, because you can't edit what you can't read | LOW | Falls out of add + delete; don't build a separate "rotate" flow |
| Delete key, with an explicit consequence warning ("삭제하면 이 제공자는 서비스 키 모드로 돌아가거나 사용할 수 없게 돼요") | Deleting a key silently changing which wallet gets charged is a billing surprise | LOW | Must also handle: key deleted while it's the account's *selected* provider → selection must fall back, see section B |
| Clear per-provider status in the list: 연결됨 / 검증 실패 / 미등록 | Users need to see at a glance which providers are live without re-testing | LOW | Store `last_validated_at` and `last_error_code`; re-validate lazily, not on a cron |
| Distinct, actionable error messages for the four BYOK failure classes | A single "AI 응답을 받지 못했어요" (which is literally what `chat.ts` returns today for *every* failure) is unacceptable once the user owns the key — they're the only one who can fix it | MEDIUM | See the error-UX table below. This is the biggest UX delta vs. the current single-vendor code |
| BYOK usage record with **zero wallet debit** | Explicit Key Decision: BYOK는 플랫폼 토큰을 차감하지 않는다. But "사용 기록만 남긴다" still needs a row somewhere for abuse/rate limiting | MEDIUM | Needs a **new `ai_usage` table separate from the wallet ledger** — do NOT write zero-amount rows into `wallet_ledger` via `apply_wallet_delta`. A ledger full of 0-delta entries corrupts the wallet's audit meaning and makes the 정산 reconciliation (v1.0 Phase 6 track) harder |
| Writer-visible BYOK usage view: calls, token counts, rough cost estimate, per provider, this month | When the platform isn't billing, the user still wants to know what they spent. Notably: **no product in this research does this well** — Kilo's docs omit usage display for BYOK entirely, NovelCrafter punts to the provider's own dashboard | LOW-MEDIUM | Cheap because token counts already come back in the provider response. Reuse `lib/ai/cost.ts`'s pricing-table math, but **display estimated USD/KRW, not wallet-토큰** — showing wallet tokens for a BYOK call reintroduces exactly the confusion BYOK is supposed to remove |

**BYOK error UX — the table-stakes matrix** (all four are table stakes; a BYOK feature that only handles the happy path will generate support load immediately):

| Failure | Provider signal | Required user-facing behavior |
|---|---|---|
| Invalid / revoked key | 401 / 403 | Mark key `검증 실패` in settings, surface inline in the AI panel with a direct link to the key settings, **do not retry**, do not silently fall back to the service key (that would charge the platform without consent) |
| Rate limited | 429 + `Retry-After` | Show "잠시 후 다시 시도" with the actual wait if the header is present; one bounded retry with backoff is fine, unbounded retry is not. Do not mark the key invalid |
| Out of credit / quota exhausted | 429 with `insufficient_quota`-class body (OpenAI conflates this with rate limiting under the same status code) | **Must be distinguished from plain 429 by parsing the error body** — telling a user "잠시 후 다시 시도" when their balance is actually zero is a dead-end loop. This is a real, documented confusion point in OpenAI's own community forum |
| Timeout / provider outage | 5xx, network error | Generic retryable message, no key state change, and **no wallet debit** (already true in the service-key path: `chat.ts` throws before the debit) |
| Key deleted/rotated **mid-session** | next call 401 | Panel must surface it on the next turn, not crash the session; already-produced drafts stay in the panel |

#### B. Provider / model selection

| Feature | Why Expected | Complexity | Notes / dependency |
|---|---|---|---|
| Global default provider+model in account settings | Verified pattern in Open WebUI (`chat.default_model` config), LibreChat (yaml default list), Cursor (Settings > Models gates what appears in the picker) | LOW | Persist on the user row or a `user_ai_preferences` table |
| Per-call override dropdown in the AI panel | Same three products all do **both**, not either/or. The global setting decides the default; the in-context dropdown decides this one call. Explicit roadmap requirement | LOW-MEDIUM | Lands in `AiPanel.tsx`; the selected provider/model must ride along in the server action input next to the existing `modelTier` |
| Only show models the user can actually reach | Cursor: the picker lists only models enabled in Settings. Open WebUI: auto-discovers via `/models`. NovelCrafter: "you will then see the models that you have access to" after adding the key | MEDIUM | Comes free if the validation call is the models-list call — cache the returned model IDs per key |
| Explicit "who is paying" marker on every model in the picker | Kilo's concrete pattern: models routable through a personal key **show a `BYOK` badge in the model picker**. This is the cleanest known answer to the service-key-vs-BYOK question — it's per-model, at the point of choice, not a mode toggle buried in settings | LOW | Strongly recommended over a global "BYOK 모드" switch. A mode switch is a hidden global that users forget they flipped; a badge is visible every time they generate |
| Deterministic fallback when the chosen model is unavailable | Key deleted, provider down, model deprecated. Cursor's router falls back to an allowlisted alternative; blocked models are skipped | MEDIUM | **Opinionated recommendation: fall back to the service-key Gemini default and say so in the UI — never silently fall back from service key → BYOK or BYOK → service key without a visible notice.** Silent cross-mode fallback is a billing-surprise generator in both directions |
| Cost estimate that reflects the *selected* provider | The existing gauge (`lib/ai/cost.ts`, `GEMINI_PRICING_USD_PER_MILLION`) is Gemini-hardcoded; showing a Gemini-priced estimate while calling GPT is worse than showing nothing | MEDIUM | Pricing table becomes per-provider-per-model. In BYOK mode the estimate should read in currency, not wallet tokens |
| Graceful capability differences (context window, max output) without a spec matrix in the UI | Cursor exposes context limits as a property of the model, not as a user-configurable matrix. Users pick a model; the app adapts | MEDIUM | Keep a small **per-model capability record** (context window, max output, supports system prompt natively, supports streaming) server-side and derive behavior. Surface at most one human line in the picker ("긴 설정집에 유리" / "빠르고 저렴") |

#### C. MCP server (2nd-stage)

| Feature | Why Expected | Complexity | Notes / dependency |
|---|---|---|---|
| Remote HTTP MCP server reachable on the public internet | Anthropic's custom connectors connect **from Anthropic's cloud, not from the user's device** — a localhost/stdio server is simply not connectable | MEDIUM | Constrains hosting: it must be a public HTTPS endpoint on the same Next.js deployment or adjacent |
| OAuth 2.1 + PKCE account linking with per-user token scoping | The standard, documented path for Claude custom connectors needing private data or write actions; tokens must be validated on the MCP server side | HIGH | This is the single largest chunk of the MCP phase. Reuses existing Supabase auth identity but needs a genuine **OAuth authorization-server surface** (or a delegated one) that NovelScript does not have today |
| Read tools: list works, list chapters, read a chapter, list/read KB(설정집) documents | The minimum "read my content" surface. Notion's hosted server pattern: search + fetch + create/update as the core triad | MEDIUM | Maps 1:1 onto existing tables; the hard part is scoping every query by the OAuth subject, not the schema |
| A search/find tool distinct from a fetch-by-id tool | Universal in mature servers (Notion search + fetch; ChatGPT's connector model is built around search/fetch semantics). An AI client can't call `get_chapter(id)` without a way to discover ids | LOW-MEDIUM | Coarse granularity beats fine: ~6-9 tools, not 25. Notion's hosted server at 23 tools is a mature-product endpoint, not a v1 target |
| Write-back only as a **draft/proposal object**, never an in-place chapter overwrite | Explicit project decision and matches the safest pattern in the ecosystem. Also maps exactly onto the existing `[DRAFT]` / `[DOCUMENT]` proposal model already in `lib/ai/chat.ts` | MEDIUM | **Recommendation: there is no `update_chapter_body` tool at all.** The write surface is `save_draft` and `propose_kb_document`, both creating reviewable objects the writer accepts in the studio. This makes "무단 덮어쓰기 차단" a structural guarantee rather than a permission check |
| MCP tool annotations on every tool (`readOnlyHint`, `destructiveHint`, `idempotentHint`) | Per the MCP spec/blog: hosts use these to decide when to prompt for confirmation, and **unannotated tools are assumed potentially destructive**. Omitting them makes read tools trigger needless confirmations | LOW | Pure metadata, very cheap, materially improves the client-side UX |
| Connect/disconnect UI inside NovelScript showing linked clients + last used, with server-side token revocation | Users can disconnect on the Claude/ChatGPT side, but the roadmap requires "연결 해제" and "연결 해제 후 접근 차단" to be verifiable from NovelScript's side | MEDIUM | Needs token/grant records with revocation, not just a stateless JWT |
| Per-user setup guide page, per client | Claude and ChatGPT do not share callback URLs or connector UIs, and plan gating differs sharply (see anti-features) | LOW | Documentation feature, but it is table stakes — connector setup is where users actually fail |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---|---|---|---|
| Per-model `BYOK` / `서비스 키` badge in the picker + a running "이번 달 내 키로 쓴 양" line in the panel | Solves the "who's paying" problem at the moment of decision, which most BYOK products punt on entirely. Also directly serves the platform's own cost-control interest, which is a stated project constraint | LOW-MEDIUM | Cheap, high trust. Do this instead of a global mode toggle |
| Per-provider quality/style hints tuned for **Korean fiction** ("이 모델은 대사체가 자연스러움") rather than generic benchmark specs | Writers can't evaluate `128k ctx / 16k max output`; they can evaluate "대사 잘 씀". No AI-fiction tool surfaces provider choice in craft terms — they all dump raw model lists | LOW | Content/judgment work, not engineering. Only credible after real use; start with 1 line per model |
| A single MCP tool that returns a **mention-shaped context bundle** (`get_writing_context(work, chapter, mentions[])`) mirroring `lib/ai/prompt.ts`'s assembly | Turns the platform's actual differentiator (@-mention context injection) into something the user's own Claude/ChatGPT subscription can use. Without it, external AI just reads raw docs and loses the preset/style composition that makes NovelScript's output good | MEDIUM | This is the highest-leverage MCP tool and the reason the MCP phase isn't just a CRUD API. Reuses `composeSystemInstruction` / `assembleUserContent` directly |
| MCP **prompts** exposing the 3-level preset × 4 style presets as selectable slash-commands in the client | Carries NovelScript's preset system into the external client. Genuinely differentiating vs. a bare data connector | LOW-MEDIUM | **Caveat that lowers priority:** prompt/resource support is client-dependent — Claude Code/VS Code/Cursor handle all three primitives, but the Anthropic Messages API MCP connector is tools-only and OpenAI's remote MCP docs don't document resource/prompt consumption. Build tools first; add prompts only if the target clients demonstrably render them |
| Draft provenance on MCP-saved drafts ("Claude에서 저장됨, 2026-09-15") in the studio review UI | Makes the external-AI loop legible and reviewable, and is required anyway to distinguish these drafts from in-app ones | LOW | Falls out of the draft object design; almost free if designed in from the start |
| Side-by-side diff review for 설정 변경안 arriving via MCP | The KB proposal flow already exists in-app; MCP proposals will more often *modify* an existing doc rather than create a new one | MEDIUM | Only needed if `propose_kb_document` supports updating existing docs; if it's create-only in v1.1, skip |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---|---|---|---|
| Custom OpenAI-compatible base URL / arbitrary endpoint (LM Studio, Ollama, LiteLLM proxies, OpenRouter) | Every BYOK-heavy tool ships it (NovelCrafter, JetBrains, LibreChat all support OpenAI-compatible endpoints), and it looks like "just one more field" | It converts the server into an **arbitrary-outbound-HTTP proxy** — SSRF surface, unbounded response shapes, model-capability unknowns, and unverifiable error semantics. It also breaks per-model pricing/estimates entirely. PROJECT.md already scopes this out explicitly | 3 fixed providers (Gemini, OpenAI, Anthropic) with pinned base URLs. Revisit only if beta writers actually ask |
| Global "BYOK 모드" on/off toggle in settings | Feels like the natural model, and the roadmap wording ("서비스 키 모드 / BYOK 모드 분리") invites it | A hidden global mode means a user who flipped it last week can't tell who's paying for today's generation. Mode state is invisible exactly when it matters | Derive the mode from the **selected provider/model + whether a key exists for it**, and badge it in the picker. The "분리" requirement is about billing paths, not about a user-facing switch |
| Auto-fallback from BYOK to the service key when the user's key fails | Sounds like resilience: "don't block the writer" | Silently spends platform money on a user who opted out of platform billing, in exactly the scenario (revoked/exhausted key) where it'll happen repeatedly. Inverts the entire cost-control constraint | Fail visibly with a one-tap "서비스 키로 다시 시도 (토큰 N 차감)" button. Explicit, per-call consent |
| Multiple keys per provider / key-per-model scoping | Enterprise BYOK gateways do it (per-team, per-environment keys) | The persona here is a solo Korean webnovel writer with one OpenAI account. N keys per provider multiplies selection UI, fallback semantics, and validation state for zero validated demand | **One key per user per provider.** Rotation is delete+re-add. Revisit only on real requests |
| Streaming for all providers in v1.1 | Streaming feels mandatory for chat UX | The existing panel is already **non-streaming** (`chat.ts` returns a complete `ChatResult` and parses a `[REPLY]/[DRAFT]/[DOCUMENT]` block from the full text — the parse fundamentally requires the whole response). Adding streaming means redesigning the response protocol *and* handling three different SSE dialects, in the same milestone as BYOK and MCP | Keep non-streaming for v1.1. Streaming is its own milestone, and it's blocked on replacing the text-block protocol with structured output anyway |
| Pre-call `countTokens` parity across all providers | The current cost/cap logic is built on it (`computeMaxOutputTokens` needs `inputTokenCount` before the call) | Only Gemini offers a cheap remote token-count call. Anthropic has a count-tokens endpoint with its own rate limits; OpenAI has none — you'd ship a local tokenizer per provider and still be wrong on system-prompt overhead | Use a **local estimate** (tiktoken-class or char-heuristic) for the pre-call cap and reconcile against the provider's returned usage post-call. The cap becomes approximate; that's acceptable because the post-call debit is exact |
| `update_chapter_body` / any MCP tool that writes to published content | "The AI should just be able to fix my typo" | One prompt injection in a KB document, one confused model, and a published chapter is silently rewritten. The MCP spec's own guidance is that annotations are hints, not enforcement — the host may auto-approve. Safety has to be structural | Draft/proposal objects only. The writer accepts in the studio. Non-negotiable |
| A large fine-grained MCP tool surface (20+ tools mirroring every CRUD op) | Mirrors the REST API, feels "complete" | Blows up the client's tool-selection accuracy and its context budget; models pick wrong tools as surface grows. Notion's 23 tools is a mature-product state reached over time, not a starting point | ~6-9 coarse tools. Start with search/fetch/context/save-draft/propose-doc and let usage pull more |
| Assuming all subscription AI clients can use the connector | The milestone framing is "구독형 AI" generally | Plan gating is real and asymmetric: Claude supports custom connectors on Free–Enterprise (Free capped at 1 connector), while **ChatGPT restricts fully write-capable custom connectors to Business/Enterprise/Education workspaces** and blocks custom MCP on Free entirely. A Korean solo writer on ChatGPT Plus may not get the write half at all | Pick **Claude as the primary verified client** for v1.1 and document ChatGPT as best-effort/read-oriented. PROJECT.md already warns against assuming blanket support — this research confirms the warning was correct |
| Writing BYOK usage into `wallet_ledger` as zero-delta rows | "One usage table, simpler" | Destroys the ledger's meaning as a money record and complicates the pending 작가 정산 track on the v1.0 branch | Separate `ai_usage` table; the wallet ledger stays money-only |

## Feature Dependencies

```
Provider Adapter Interface (generate + usage reporting, no remote countTokens)
    └──requires──> refactor of lib/ai/gemini.ts + lib/ai/chat.ts call sites
    └──requires──> local token estimation to replace pre-call countTokens
                       └──feeds──> lib/ai/cost.ts computeMaxOutputTokens (service-key path only)

Per-provider Pricing/Capability Table
    └──requires──> Provider Adapter Interface
    └──enables──> accurate cost estimate in AI panel
    └──enables──> model picker capability hints

BYOK Key Storage (encrypt at rest + masked hint column)
    └──requires──> nothing in v1.1 (foundational) — but the Vault-vs-AES-GCM decision is still Pending in PROJECT.md
    └──enables──> Key Validation (test connection)
    └──enables──> BYOK call path

Key Validation ("test connection" via provider models-list)
    └──requires──> Provider Adapter Interface (needs a listModels per provider)
    └──requires──> BYOK Key Storage
    └──enables──> per-key available-model list
                       └──feeds──> Model Picker (only reachable models shown)

BYOK Call Path (zero wallet debit)
    └──requires──> BYOK Key Storage
    └──requires──> Provider Adapter Interface
    └──requires──> ai_usage table (record without debit)
    └──conflicts──> computeMaxOutputTokens balance cap (must be bypassed, not zeroed)

Idempotent AI Debit (fix: reference_id currently random per call)
    └──requires──> nothing new; reuse commerce's idempotencyKey pattern
    └──gates──> "중복 정산 방지" completion criterion
    └──must land BEFORE──> retry/backoff on 429 (retries without idempotency = double charge)

Provider/Model Selector (global default + per-call override + BYOK badge)
    └──requires──> Provider Adapter Interface
    └──requires──> Key Validation (to know what's selectable)
    └──requires──> BYOK Call Path (badge must reflect real billing path)
    └──requires──> deterministic fallback rule (key deleted / model gone)

--- 2nd stage, hard boundary ---

OAuth Authorization Surface (2.1 + PKCE, per-user tokens, revocable)
    └──requires──> existing Supabase auth identity
    └──gates──> EVERYTHING in the MCP phase

MCP Read Tools (search/list/fetch works, chapters, KB)
    └──requires──> OAuth Authorization Surface (per-user scoping is the whole security model)

MCP get_writing_context tool
    └──requires──> MCP Read Tools
    └──requires──> lib/ai/prompt.ts composition functions (reuse, don't fork)

MCP Write-back (save_draft, propose_kb_document)
    └──requires──> OAuth Authorization Surface
    └──requires──> a draft/proposal object model in the studio review UI
    └──conflicts──> any in-place chapter update tool (by design, permanently)

MCP Connect/Disconnect UI + revocation
    └──requires──> OAuth Authorization Surface (grant records)
    └──gates──> "연결 해제 후 접근 차단" completion criterion

MCP Prompts/Resources primitives
    └──enhances──> MCP Read Tools (only on clients that render them)
    └──conflicts──> nothing, but client support is inconsistent — strictly optional
```

### Dependency Notes

- **Idempotent debit must land before any retry logic.** Today `chat.ts` passes a fresh `crypto.randomUUID()` as `p_reference_id`, so the RPC's dedupe does nothing for AI spend. If a 429-retry is added first, the second attempt debits again. Sequence: fix idempotency → then add retry/backoff.
- **The BYOK path is not "the service path with the cap set to zero."** `chat.ts` returns a hard error when `maxOutputTokens <= 0`; under BYOK that branch must be structurally skipped, with the per-request ceiling (`PER_REQUEST_MAX_OUTPUT_TOKENS`) kept as the only limit. Getting this wrong means BYOK users with an empty wallet can't use their own key — the exact failure the feature exists to prevent.
- **Local token estimation is the hidden prerequisite of the whole adapter refactor.** The adapter interface can't include `countTokens` as a remote call without forcing OpenAI/Anthropic into shapes they don't have. Decide the estimation approach early; it changes the adapter signature.
- **Key validation and the model picker are the same feature.** Validating via models-list produces the list the picker needs. Building them separately duplicates work and creates two sources of truth about "what can this user run."
- **OAuth gates the entire MCP phase and shares nothing with the BYOK phase.** BYOK is "we hold your secret to call out"; MCP is "we issue a secret so someone calls in." Opposite directions, no shared code. Do not let them be planned as one "auth" phase.
- **MCP write-back depends on a studio review surface that does not exist yet.** In-app drafts currently land straight into the panel for accept/regenerate; an MCP draft arrives while the writer isn't looking and needs somewhere to queue. That queue UI is real scope, not a rounding error on the MCP tools.

## MVP Definition

### Launch With (v1.1 — 1st stage: multi-provider + BYOK)

- [ ] Provider adapter interface with Gemini migrated onto it (no behavior change for existing users) — proves the abstraction before adding vendors
- [ ] OpenAI + Anthropic adapters (non-streaming, fixed base URLs)
- [ ] Local token estimation replacing the pre-call `countTokens` dependency
- [ ] Per-provider/model pricing + capability table driving the cost estimate
- [ ] BYOK: add key per provider from settings, validate via models-list on save, masked display (provider + last4 + created-at), delete, replace-by-re-add
- [ ] BYOK call path with zero wallet debit + `ai_usage` record
- [ ] Idempotent AI debit for the service-key path (fixes the existing random reference_id)
- [ ] Provider/model selector: account-level default + per-call dropdown in the AI panel, with a per-model BYOK/서비스 키 badge
- [ ] Deterministic, *visible* fallback when the selected provider/model is unusable (never silent cross-mode fallback)
- [ ] Four-class BYOK error handling (invalid, rate-limited, out-of-credit, timeout) with distinct messages and correct key-state side effects
- [ ] Writer-facing BYOK usage view (calls / tokens / estimated cost, this month, per provider)
- [ ] Regression: existing Gemini service-key flow, mention injection, presets, draft/proposal parsing all unchanged

### Launch With (v1.1 — 2nd stage: MCP)

- [ ] Remote HTTP MCP server on a public HTTPS endpoint
- [ ] OAuth 2.1 + PKCE account linking, per-user token scoping, server-side validation
- [ ] Read tools: `search_works` / `list_chapters` / `get_chapter` / `search_kb` / `get_kb_document`
- [ ] `get_writing_context` — mention-shaped bundle reusing `lib/ai/prompt.ts` composition
- [ ] Write tools: `save_draft`, `propose_kb_document` — both produce reviewable objects, no in-place overwrite
- [ ] Tool annotations on every tool (`readOnlyHint` on reads; writes explicitly non-destructive/create-only)
- [ ] Studio review surface for MCP-originated drafts/proposals, with provenance
- [ ] Connect/disconnect UI in NovelScript with real server-side revocation
- [ ] Verified end-to-end on **Claude** custom connectors; ChatGPT documented as best-effort with its plan restrictions stated

### Add After Validation (v1.x)

- [ ] MCP prompts exposing preset × style combinations — add once a target client is confirmed to render prompts
- [ ] MCP resources for KB documents — add only if a supported client consumes them
- [ ] Diff review for MCP 설정 변경안 that modify existing KB docs
- [ ] Korean-craft-oriented model hints in the picker — needs real usage data
- [ ] Per-user monthly BYOK call ceiling (abuse guard) — add when `ai_usage` shows a reason to

### Future Consideration (v2+)

- [ ] Streaming responses (requires replacing the `[REPLY]/[DRAFT]/[DOCUMENT]` text protocol with structured output)
- [ ] Custom OpenAI-compatible endpoints / local models
- [ ] Multiple keys per provider, org/team key sharing
- [ ] Automatic model routing ("auto" mode, Cursor-router style)
- [ ] Additional MCP clients as their connector support and plan gating mature

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---|---|---|---|
| Provider adapter interface + Gemini migration | HIGH (enables everything) | MEDIUM | P1 |
| Local token estimation | MEDIUM (invisible, but blocking) | MEDIUM | P1 |
| OpenAI + Anthropic adapters | HIGH | MEDIUM | P1 |
| BYOK add / validate / mask / delete | HIGH | MEDIUM | P1 |
| BYOK call path, zero debit + usage record | HIGH | MEDIUM | P1 |
| Idempotent AI debit fix | HIGH (correctness) | LOW | P1 |
| Provider/model selector (default + per-call + badge) | HIGH | MEDIUM | P1 |
| Four-class BYOK error UX | HIGH | MEDIUM | P1 |
| Per-provider pricing/capability table | MEDIUM-HIGH | LOW-MEDIUM | P1 |
| Visible fallback rule | MEDIUM-HIGH | LOW | P1 |
| BYOK usage view for the writer | MEDIUM | LOW-MEDIUM | P2 |
| MCP OAuth + per-user scoping | HIGH | HIGH | P1 (2nd stage) |
| MCP read tools | HIGH | MEDIUM | P1 (2nd stage) |
| MCP `get_writing_context` | HIGH (the differentiator) | MEDIUM | P1 (2nd stage) |
| MCP draft/proposal write-back + review surface | HIGH | MEDIUM-HIGH | P1 (2nd stage) |
| MCP connect/disconnect + revocation | HIGH (security criterion) | MEDIUM | P1 (2nd stage) |
| Tool annotations | MEDIUM | LOW | P1 (2nd stage) |
| Draft provenance display | MEDIUM | LOW | P2 |
| MCP prompts (presets as slash commands) | MEDIUM | LOW-MEDIUM | P2 (client-gated) |
| MCP resources | LOW-MEDIUM | MEDIUM | P3 (client-gated) |
| Korean-craft model hints | MEDIUM | LOW (judgment work) | P2 |
| Streaming | MEDIUM | HIGH | P3 |
| Custom OpenAI-compatible endpoints | LOW (no persona) | MEDIUM + security cost | P3 / anti-feature |
| Multiple keys per provider | LOW | MEDIUM | P3 / anti-feature |

**Priority key:** P1 = must have for the milestone · P2 = should have · P3 = defer

## Open Questions for Requirements Definition

1. **Does a BYOK user still see the wallet balance / cost gauge in the panel?** Recommendation: show estimated currency instead of wallet tokens when the selected model is BYOK-backed. Needs a user call.
2. **Does BYOK unlock anything else** (e.g., longer max output than `PER_REQUEST_MAX_OUTPUT_TOKENS = 2048`, since the platform isn't paying)? Recommendation: yes, raise the ceiling for BYOK — otherwise BYOK users get platform-tier limits while paying their own way. But it must be a deliberate decision.
3. **Which client is the MCP acceptance target?** Research says Claude is the only client where the full read+write flow is reachable for individual paid users. If ChatGPT Plus writers are a required audience, the milestone's write-back criterion may be unmeetable for them.
4. **Is `propose_kb_document` create-only or update-capable in v1.1?** Update-capable pulls in diff review UI.
5. **Where does an MCP-saved draft live** — as a new chapter in draft state, or as a separate "제안된 초안" object attached to an existing chapter? This decides the review-surface scope.
6. **Encryption approach for keys** (Supabase Vault vs app-level AES-GCM) is still Pending per PROJECT.md — it is a STACK question, but the masked-hint-column requirement above applies either way.

## Sources

**Project context (authoritative):**
- `.planning/PROJECT.md` — v1.1 milestone scope, Key Decisions (BYOK zero-debit, 3 providers only, MCP read + draft-save only)
- `docs/ai-integration-roadmap.md` — 1st/2nd stage scope and completion criteria
- `.planning/research/v1.0/FEATURES.md` — prior milestone (note: BYOK was listed there as an anti-feature for v1.0, correctly deferred to here)
- Code read directly: `lib/ai/gemini.ts`, `lib/ai/chat.ts`, `lib/ai/cost.ts`, `lib/commerce/actions.ts`, `app/studio/[workId]/chapters/[chapterId]/ai-panel/`

**BYOK / key management (MEDIUM confidence — vendor docs are consistently thin on post-save UX):**
- [Novelcrafter — OpenAI AI Connection](https://www.novelcrafter.com/help/docs/ai-connections/openai) — settings-based key add, implicit validation via model discovery
- [Novelcrafter — Claude AI Connection](https://www.novelcrafter.com/help/docs/ai-connections/claude) — notable: no direct Anthropic support, routes via OpenRouter
- [JetBrains AI Assistant — Bring your own key](https://www.jetbrains.com/help/ai-assistant/bring-your-own-key-byok.html) — per-provider setup, model chosen at connect time, **no documented test-connection step**
- [Kilo — BYOK](https://kilo.ai/docs/getting-started/byok) — **`BYOK` badge in the model picker**, validation at request time, no usage/cost display for BYOK
- [Augment Code — BYOK for enterprise agent rollouts](https://www.augmentcode.com/guides/byok-enterprise-agent-rollouts) — rotation cadence, envelope encryption, revocation as offboarding
- [How to let users bring their own OpenAI/Anthropic API keys without plaintext storage](https://dev.to/c9dn/how-to-let-users-bring-their-own-openai-or-anthropic-api-keys-without-storing-them-in-plaintext-12m) — storage pattern
- [AI API Error Handling: Fix 429, 401 & 500 Errors (2026)](https://ofox.ai/blog/ai-api-error-handling-troubleshooting-guide-2026/) and [OpenRouter error reference](https://openrouter.ai/docs/api_reference/errors-and-debugging) — error taxonomy, `Retry-After`
- [OpenAI community: 429 insufficient_quota vs rate limit confusion](https://community.openai.com/t/why-am-i-getting-error-429-insufficient-quota-with-unused-credits/1372790) — evidence that conflating these two produces real user dead-ends

**Provider/model selection UX (MEDIUM-HIGH — consistent across three independent products):**
- [Cursor — Available models](https://cursor.com/help/models-and-usage/available-models) — Settings gates the picker; Auto routes and falls back to allowlisted alternatives
- [Open WebUI — Connect a model](https://docs.openwebui.com/ecosystem/computer/ai/connect-a-model/) — auto-discovery via `/models`, `chat.default_model`
- [LibreChat — Custom Endpoint Object Structure](https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/custom_endpoint) — per-endpoint keys, fetched vs declared model lists

**MCP (HIGH — official sources):**
- [Claude Help — Get started with custom connectors using remote MCP](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp) — server must be publicly reachable; Anthropic's cloud connects, not the device; Free–Enterprise availability with a 1-connector Free cap
- [Anthropic — Building custom connectors via remote MCP servers](https://support.anthropic.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers)
- [MCP blog — Tool Annotations as Risk Vocabulary](https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/) — annotation semantics; unannotated tools assumed destructive; hints are not enforcement
- [MCP spec — Prompts](https://modelcontextprotocol.io/specification/2026-07-28/server/prompts)
- [Tools vs Resources vs Prompts: the MCP primitive you're misusing](https://prashamhtrivedi.in/mcp-primitive-youre-misusing/) — client-support asymmetry; Anthropic Messages API MCP connector is tools-only
- [ChatGPT custom connectors via MCP (Composio)](https://composio.dev/content/chatgpt-custom-connectors-connect-any-app-with-mcp) and [ChatGPT MCP: plans, setup and what breaks in 2026](https://peliqan.io/blog/chatgpt-mcp/) — **fully write-capable custom connectors restricted to Business/Enterprise/Education**; Free excluded entirely
- [Notion MCP Server complete guide (2026)](https://www.jitendrazaa.com/blog/integration/notion-mcp-server-complete-guide-setup-troubleshooting-ai/) — 23-tool mature surface, search/fetch/create triad as the core
- [Claude Connector OAuth authentication (sunpeak)](https://sunpeak.ai/blogs/claude-connector-oauth-authentication/) — OAuth+PKCE, Protected Resource Metadata, token validation server-side

---
*Feature research for: NovelScript v1.1 — multi-provider AI, BYOK, subscription-AI MCP*
*Researched: 2026-09-15*
