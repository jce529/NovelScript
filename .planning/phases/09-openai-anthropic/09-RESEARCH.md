# Phase 9: OpenAI · Anthropic 어댑터 + 제공자별 단가 - Research

**Researched:** 2026-09-22
**Domain:** Multi-vendor LLM adapter integration (OpenAI Responses API, Anthropic Messages API) behind an existing project-owned `ProviderClient` contract
**Confidence:** HIGH (SDK versions, model IDs, pricing, request/response shapes verified against official docs today) / MEDIUM (exact usage-field edge cases for aborted/errored calls, since this project has never called these two vendors yet)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**모델 카탈로그**
- D-01: 고정 tier(lite/pro) 유니언 타입 개념을 버린다. `lib/ai/providers/types.ts`의 `ModelTier`처럼 제공자 전체에 공통 2단계를 강제하지 않고, 제공자별로 운영이 실제로 활성화한 모델을 개수 제한 없이 목록으로 관리하는 구조로 전환한다 — 예: Anthropic은 3개(Haiku/Sonnet/Opus), 다른 제공자는 2개나 1개일 수 있음.
- D-02: 모델 피커 UI에는 "라이트/프로" 같은 tier 라벨이 아니라 실제 모델명을 직접 노출한다(예: "Gemini 3.5 Flash", "GPT-4o mini", "Claude Sonnet 4.5").
- D-03: 구체적으로 어떤 모델(들)을 각 제공자에서 노출할지(정확한 모델 ID·개수)는 리서치 단계에서 결정한다 — OpenAI/Anthropic의 현재 GA 모델 현황을 리서치 시점에 재확인. **(이 문서의 "Standard Stack / Model Catalog" 절이 그 결정이다.)**

**기본 제공자·모델 설정 UX**
- D-04: 계정 기본 제공자·모델 지정 UI는 새 페이지 `/studio/settings/ai-providers`에 둔다. Phase 10의 BYOK 키 관리 섹션이 같은 페이지에 합류할 예정이므로 이 페이즈에서 그 확장을 염두에 두고 레이아웃을 잡는다.
- D-05: AI 패널 드롭다운에서 이번 호출만 다른 제공자·모델로 전환하면 그 전송에만 적용된다 — 다음 메시지는 계정 기본값으로 돌아간다(PROV-04 문구 그대로). 세션 동안 유지되는 방식은 채택하지 않는다.

**제공자별 단가·비용 표시**
- D-06: 단가 테이블은 제공자별 파일로 분리한다(예: `lib/ai/providers/openai/cost.ts`, `lib/ai/providers/anthropic/cost.ts`) — 공통 인터페이스로 묶어 `lib/ai/cost.ts`의 기존 `computeMaxOutputTokens`/`computeDebitAmount` 계열 함수가 제공자별 단가 소스를 받아 쓰도록 확장한다.
- D-07: 작가에게 보여주는 비용 추정치 단위는 기존과 동일하게 지갑 토큰(원)으로 통일한다 — 제공자별 실제 USD/KRW 단가는 내부 환산에만 쓰고 UI 단위를 벤더별로 바꾸지 않는다(PROV-07: Gemini 단가를 다른 제공자에 재사용하지 않는다는 요건은 내부 계산에서 지킨다).

**거절(refusal)·에러 문구**
- D-08: Phase 8에서 정한 한국어 거절 안내 문구와 원인별 에러 분류(08-CONTEXT.md D-07~D-10)를 3개 벤더 공통으로 그대로 재사용한다. 벤더별로 다른 문구를 만들지 않는다. 내부적으로만 OpenAI `finish_reason`(또는 Responses API의 `incomplete_details`)/Anthropic `stop_reason`을 Phase 8이 정의한 공통 `refusal` 신호(`ProviderRefusal`)로 정규화한다.

### Claude's Discretion
- 제공자별 모델 목록의 저장 형태(코드 상수 배열 vs 구조화된 config) — 스키마 변경 없음 원칙 안에서 플래너가 결정.
- 리서치 단계에서 확정되는 정확한 모델 ID·개수·단가 수치 (아래 표로 확정).
- 드롭다운의 "· N개" 표시 등 세부 UI 카피와 레이아웃.
- provider별 `finishReason`/`stop_reason` 필드명 매핑의 정확한 구현 위치.

### Deferred Ideas (OUT OF SCOPE)
- 구독제(월정액) 재해석 — PROJECT.md에 이미 Out of Scope로 명시된 별도 마일스톤 후보. Phase 9와 무관, 백로그로 이관.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROV-02 | 작가가 OpenAI 모델을 선택해 본문 생성·어시스트를 받을 수 있다 (비스트리밍, 고정 base URL) | Standard Stack (`openai@7.x`, Responses API shape), Code Examples §OpenAI adapter, Pitfalls §1/§3 |
| PROV-03 | 작가가 Anthropic 모델을 선택해 본문 생성·어시스트를 받을 수 있다 (비스트리밍, 고정 base URL) | Standard Stack (`@anthropic-ai/sdk@0.127.x`, Messages API shape), Code Examples §Anthropic adapter, Pitfalls §2/§3 |
| PROV-04 | 작가가 계정 설정에서 기본 제공자·모델을 지정하고, AI 패널 드롭다운에서 이번 호출만 다른 제공자·모델로 전환할 수 있다 | Architecture Patterns §Model Catalog Structure, §Account Default Settings, Runtime State Inventory (아래 — profiles 테이블 컬럼 추가 필요) |
| PROV-07 | 서비스 키 모드에서 작가는 선택한 제공자·모델의 실제 단가가 반영된 비용 추정치를 생성 전에 본다 (Gemini 단가를 다른 제공자에 재사용하지 않는다) | Standard Stack §Verified Pricing Table, Architecture Patterns §Per-Provider Cost Module, Don't Hand-Roll |
</phase_requirements>

## Summary

Phase 8 already shipped the vendor-neutral seam this phase needs: `ProviderClient` (`generateContent`), `UsageReport`, `ProviderRefusal`, `SanitizedProviderError`, and the scrubbing choke point in `lib/ai/providers/errors.ts`. Phase 9's job is almost entirely additive — write two new adapters that implement the existing interface, extend the `ProviderId` union, replace the single-vendor `ModelTier`/`MODEL_TIER_TO_ID` structure with a per-provider model list (D-01), split `lib/ai/cost.ts`'s Gemini-only pricing into three provider-scoped files (D-06), and add a small new settings surface for the account default provider/model (D-04, requires one new DB migration — see Runtime State Inventory).

Both vendor SDKs are already pinned in the v1.1 research (`openai@7.x`, `@anthropic-ai/sdk@0.125.x`); current npm registry shows `openai@7.21.0` and `@anthropic-ai/sdk@0.127.0` as of today — both compatible, install the exact latest patch. Both SDKs return non-streaming, single-call responses that map cleanly onto `GenerateResult`: OpenAI's Responses API returns `usage.input_tokens`/`usage.output_tokens`/`usage.output_tokens_details.reasoning_tokens` and refusal as a distinct `refusal` content-block type inside `output[].content[]` (plus `status: "incomplete"` + `incomplete_details.reason` for length/content-filter stops); Anthropic's Messages API returns `usage.input_tokens`/`usage.output_tokens` and a `stop_reason` enum that includes a literal `"refusal"` value on an ordinary 200 response, exactly as the v1.1 Pitfalls doc predicted.

One code-breaking finding not covered by prior research: **Anthropic's `temperature` parameter is deprecated and rejected outright on every model this phase will use** (Claude Opus 5, Sonnet 5, Haiku 4.5 — all newer than the 4.6-generation cutoff where the parameter was dropped; the API docs state "Models released after Claude Opus 4.6 do not support this parameter"). `GenerateParams.temperature` is required by the shared interface, so the Anthropic adapter must silently drop it before calling the SDK rather than forwarding it — this is a provider-adapter implementation detail, not an interface change.

**Primary recommendation:** Extend `ProviderId` to `'gemini' | 'openai' | 'anthropic'`; replace `ModelTier`/`MODEL_TIER_TO_ID` with a `PROVIDER_MODELS: Record<ProviderId, ProviderModelInfo[]>` catalog (model id, display name, description, pricing); add `openai.ts`/`anthropic.ts` adapters under `lib/ai/providers/` following `gemini.ts`'s exact shape (construct SDK client once, one try/catch mapping raw errors through `toSanitizedProviderError`, one pure `mapXResponse` function); split `lib/ai/cost.ts` into `lib/ai/cost.ts` (provider-agnostic math, now taking a `pricing: { input: number; output: number }` param instead of a `ModelTier`) plus `lib/ai/providers/{openai,anthropic,gemini}/cost.ts` (each exporting its own verified USD/million pricing table); add a `profiles` migration for `default_provider`/`default_model` columns backing the new `/studio/settings/ai-providers` page.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `openai` | `^7.21.0` (verified via `npm view openai version`, 2026-09-22) | OpenAI Responses API client | Official SDK; already the version pinned by v1.1 STACK research (`openai@7.x`) |
| `@anthropic-ai/sdk` | `^0.127.0` (verified via `npm view @anthropic-ai/sdk version`, 2026-09-22; STACK.md pinned `0.125.x`, registry has moved to `0.127.x` since — re-verify at install time) | Anthropic Messages API client | Official SDK, same vendor-SDK-behind-project-interface pattern already used for `@google/genai` |

### Supporting
None required. `js-tiktoken` was listed in v1.1 SUMMARY.md as a Phase 9 "Uses" entry for local token estimation, but **Phase 8 removed local token estimation entirely** (STATE.md: "08-CONTEXT.md 결정으로 로컬 추정 자체가 제거됨"; confirmed by reading `lib/ai/cost.ts` — `computeMaxOutputTokens` derives the output budget purely from wallet balance, with no pre-call input-token estimate anywhere in the call path). Do not add `js-tiktoken` — it would be dead code against the actual Phase 8 design that shipped.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Direct vendor SDKs behind `ProviderClient` | Vercel AI SDK (`ai` package) unified abstraction | STACK.md already rejected this for v1.1 — the project's own `ProviderClient`/`UsageReport`/`ProviderRefusal` types encode NovelScript-specific refusal/cost semantics that a generic SDK abstraction would fight rather than help; not revisited here, no new information changes that call |
| OpenAI Responses API | OpenAI Chat Completions API (`/v1/chat/completions`) | Responses API is OpenAI's current recommended default for new integrations (Chat Completions is not deprecated but is the legacy shape). Responses API's refusal signaling (`refusal` content block + `incomplete_details`) is also cleaner to normalize into `ProviderRefusal` than Chat Completions' `finish_reason: "content_filter"`, which conflates several failure kinds. Use Responses API. |

**Installation:**
```bash
npm install openai@^7.21.0 @anthropic-ai/sdk@^0.127.0
```

**Version verification:** Re-run before implementation — these are fast-moving SDKs:
```bash
npm view openai version
npm view @anthropic-ai/sdk version
```

## Model Catalog (D-03 decision)

Verified against official docs today (`platform.claude.com/docs/en/models/overview`, `developers.openai.com/api/docs/models` + `/pricing`). Both vendors have released several newer/pricier tiers since the v1.1 research pass (2026-09-16); this table supersedes that pass's assumptions.

**Selection principle (matches the existing Gemini precedent of picking the cheapest GA, non-preview model for both tiers):** expose one cheap/fast model and one stronger model per provider, using real model names in the UI per D-02. This keeps the picker small while satisfying D-01 ("개수 제한 없이" — no more than 2 needed to prove the pattern; nothing prevents adding more later without a schema change since the catalog is a code constant, not a DB table).

### OpenAI
| Model ID | Display Name | Input $/1M | Output $/1M | Context | Max Output | Notes |
|----------|--------------|-----------:|-------------:|---------|------------|-------|
| `gpt-4o-mini` | GPT-4o mini | $0.15 | $0.60 | 128K | 16K | Cheapest broadly-available GA model; long-standing, stable, not part of the newer gpt-5.x org-verification-gated tier |
| `gpt-5.6-terra` | GPT-5.6 Terra | $2.00 | $12.00 | 1.05M | 128K | Mid-tier of the current gpt-5.6 family (sol/terra/luna); stronger reasoning than 4o-mini |

Confidence: pricing/model-ID rows HIGH (fetched from `developers.openai.com/api/docs/pricing` and `/docs/models` today). `gpt-4o-mini`'s exact max-output-token figure (16K) is from training-data knowledge, not re-verified in this pass against a docs page that listed it explicitly — flag as MEDIUM, re-confirm at implementation time via `openai.models.retrieve('gpt-4o-mini')` or the models list endpoint.

**Org verification pitfall (carried from PITFALLS.md, still relevant):** OpenAI gates access to its latest-generation models (the gpt-5.x family, including gpt-5.6-terra) behind government-ID-based Organization Verification, and unverified accounts sit at materially lower rate-limit tiers. `gpt-4o-mini` does not require this. **If Organization Verification is still pending when this phase is implemented, ship only `gpt-4o-mini` for OpenAI and add `gpt-5.6-terra` once verification clears** — this is a real, non-code blocker; check STATE.md's Blockers section (verification was supposed to start in parallel with Phase 8) before assuming both rows are reachable.

### Anthropic
| Model ID | Display Name | Input $/1M | Output $/1M | Context | Max Output | Notes |
|----------|--------------|-----------:|-------------:|---------|------------|-------|
| `claude-haiku-4-5` | Claude Haiku 4.5 | $1.00 | $5.00 | 200K | 64K | Fastest, cheapest GA model in the current lineup |
| `claude-sonnet-5` | Claude Sonnet 5 | $2.00 | $10.00 | 1M | 128K | "Best combination of speed and intelligence" per Anthropic's own comparison table |

Confidence HIGH — table fetched directly from `platform.claude.com/docs/en/models/overview` today, including the exact API ID strings, pricing, context window, and max-output figures. Anthropic's Opus 5 / Fable 5.1 exist but are priced $5–10/$25–50 per million — not selected, matching the "cheap + capable" pairing pattern above; CONTEXT.md's illustrative example ("Anthropic은 3개(Haiku/Sonnet/Opus)") is non-binding per D-03 ("리서치 단계에서 결정") — 2 rows is sufficient to prove D-01's no-fixed-tier-count structure.

**Deprecated dateless alias note:** `claude-haiku-4-5` (no date suffix) is Anthropic's own recommended alias per their table; the pinned dated snapshot is `claude-haiku-4-5-20251001`. Use the dateless alias for this phase (matches how the existing Gemini config references `gemini-3.5-flash` without a pinned date) — re-pin only if reproducibility across an alias repoint becomes a requirement.

## Architecture Patterns

### Recommended Project Structure
```
lib/ai/providers/
├── types.ts              # extend ProviderId to 'gemini' | 'openai' | 'anthropic'
├── registry.ts            # createPlatformProvider(providerId, model) — branches on providerId
├── errors.ts               # unchanged — already vendor-neutral
├── gemini.ts               # unchanged
├── openai.ts               # NEW — createOpenAiProvider + mapOpenAiResponse
├── anthropic.ts            # NEW — createAnthropicProvider + mapAnthropicResponse
├── catalog.ts               # NEW — replaces models.ts; PROVIDER_MODELS: Record<ProviderId, ProviderModelInfo[]>
├── openai/cost.ts           # NEW — OPENAI_PRICING_USD_PER_MILLION (D-06)
├── anthropic/cost.ts        # NEW — ANTHROPIC_PRICING_USD_PER_MILLION (D-06)
└── gemini/cost.ts           # MOVED from lib/ai/cost.ts's GEMINI_PRICING_USD_PER_MILLION (D-06 — "제공자별 파일로 분리")
lib/ai/cost.ts               # KEEP — computeMaxOutputTokens/computeDebitAmount, now take a `pricing` param instead of `ModelTier`
```

Note: D-06 names the split files `lib/ai/providers/openai/cost.ts` — a `cost.ts` file living inside each provider's own subfolder alongside its adapter file, not a flat `lib/ai/providers/openai-cost.ts`. This means `gemini.ts` should also move into a `gemini/` folder for consistency (`gemini/index.ts` or keep `gemini.ts` at the top level and only add `gemini/cost.ts` — Claude's Discretion per CONTEXT.md, but keep the three providers' file layout parallel to avoid an asymmetric registry import).

### Pattern 1: Provider Adapter (established in Phase 8, replicate exactly)
**What:** One file per vendor. Construct the SDK client once at adapter-creation time (not per call). One `try { sdkCall } catch (err) { throw new ProviderCallError(toSanitizedProviderError(provider, err)) }` block. A separate pure function (`mapXResponse`) that converts only the vendor's response shape into `GenerateResult` — no side effects, easily unit-testable without a live network call (see `mapGeminiResponse` for the pattern this must mirror).
**When to use:** Every new `ProviderClient` implementation.
**Example — OpenAI adapter shape:**
```typescript
// Source: openai npm SDK docs + developers.openai.com/api/docs/api-reference/responses/create
import 'server-only';
import OpenAI from 'openai';
import type { GenerateResult, ProviderClient, UsageReport } from './types';
import { ProviderCallError, toSanitizedProviderError } from './errors';

export function mapOpenAiResponse(response: OpenAI.Responses.Response): GenerateResult {
  const usage: UsageReport = {
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    // OpenAI's reasoning_tokens is billed at the output rate (mirrors Gemini's thoughtsTokens/BUG-04 handling)
    thoughtsTokens: response.usage?.output_tokens_details?.reasoning_tokens ?? null,
    reported: { input: response.usage?.input_tokens != null, output: response.usage?.output_tokens != null },
  };

  // Responses API: a refusal shows as a `refusal` content-block type inside output[].content[],
  // OR as status:'incomplete' + incomplete_details.reason for content-filter/length stops.
  const refusalBlock = response.output
    ?.flatMap((o) => ('content' in o ? o.content : []))
    ?.find((c) => c.type === 'refusal');
  if (refusalBlock) {
    return { text: '', finishReason: 'refusal', usage, refusal: { stage: 'output', reasonCode: 'OTHER' } };
  }
  if (response.status === 'incomplete' && response.incomplete_details?.reason === 'content_filter') {
    return { text: '', finishReason: 'refusal', usage, refusal: { stage: 'output', reasonCode: 'OTHER' } };
  }

  const text = response.output_text ?? '';
  const finishReason = response.status === 'incomplete' && response.incomplete_details?.reason === 'max_output_tokens'
    ? 'max_tokens' : 'stop';
  return { text, finishReason, usage, refusal: null };
}

export function createOpenAiProvider({ apiKey }: { apiKey: string }): ProviderClient {
  const client = new OpenAI({ apiKey });
  return {
    provider: 'openai',
    async generateContent({ model, systemInstruction, contents, maxOutputTokens, temperature }) {
      let response: OpenAI.Responses.Response;
      try {
        response = await client.responses.create({
          model,
          instructions: systemInstruction,
          input: contents,
          max_output_tokens: maxOutputTokens,
          temperature,
        });
      } catch (err) {
        throw new ProviderCallError(toSanitizedProviderError('openai', err));
      }
      return mapOpenAiResponse(response);
    },
  };
}
```
**Anthropic adapter — key difference: drop `temperature`, and `system`/`max_tokens` are top-level not nested config:**
```typescript
// Source: platform.claude.com/docs/en/api/messages (fetched 2026-09-22)
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import type { GenerateResult, ProviderClient, UsageReport } from './types';
import { ProviderCallError, toSanitizedProviderError } from './errors';

export function mapAnthropicResponse(response: Anthropic.Messages.Message): GenerateResult {
  const usage: UsageReport = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    thoughtsTokens: null, // Anthropic has no separate reasoning-token usage field on Messages API
    reported: { input: true, output: true },
  };

  if (response.stop_reason === 'refusal') {
    // No structured input-block-vs-output-block distinction like Gemini's promptFeedback —
    // Anthropic's refusal is always a normal 200 with content, so it maps to stage: 'output'.
    return { text: '', finishReason: 'refusal', usage, refusal: { stage: 'output', reasonCode: 'OTHER' } };
  }

  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const finishReason = response.stop_reason === 'max_tokens' ? 'max_tokens' : 'stop';
  return { text, finishReason, usage, refusal: null };
}

export function createAnthropicProvider({ apiKey }: { apiKey: string }): ProviderClient {
  const client = new Anthropic({ apiKey });
  return {
    provider: 'anthropic',
    async generateContent({ model, systemInstruction, contents, maxOutputTokens }) {
      // temperature intentionally NOT forwarded — deprecated/rejected on every model this
      // catalog uses (Claude Opus 4.6+ generation). See Pitfall 3 below.
      let response: Anthropic.Messages.Message;
      try {
        response = await client.messages.create({
          model,
          system: systemInstruction,
          messages: [{ role: 'user', content: contents }],
          max_tokens: maxOutputTokens,
        });
      } catch (err) {
        throw new ProviderCallError(toSanitizedProviderError('anthropic', err));
      }
      return mapAnthropicResponse(response);
    },
  };
}
```

### Pattern 2: Per-Provider Model Catalog (replaces `ModelTier`)
**What:** `lib/ai/providers/catalog.ts` exporting `PROVIDER_MODELS: Record<ProviderId, ModelInfo[]>` where `ModelInfo = { id: string; displayName: string; description: string }`. `registry.ts`'s `createPlatformProvider` takes `(providerId: ProviderId, env)` and branches on `providerId`; the caller (`chatAction`) passes both `providerId` and `model` (validated: `model` must be one of `PROVIDER_MODELS[providerId].map(m => m.id)`).
**When to use:** Anywhere the old `ModelTier` was consumed — `chat.ts`'s `ChatInput`, `chatAction`'s zod schema, `AiPanel.tsx`'s dropdown state, `cost.ts`'s pricing lookups.

### Pattern 3: Per-Provider Cost Module (D-06)
**What:** Each `{provider}/cost.ts` exports only a pricing table (`{ input: number; output: number }` per model ID, USD/million) plus a `walletTokensPerUnit(modelId, kind)` helper local to that provider. `lib/ai/cost.ts`'s `computeMaxOutputTokens`/`computeDebitAmount` become provider-agnostic: they accept a resolved `{ input: number; output: number }` wallet-token-rate pair instead of a `ModelTier`, and the caller (`chat.ts`) resolves that pair by looking up `providerId` + `model` against the right provider's cost module before calling them.
**Why:** This is the literal mechanism that satisfies PROV-07 ("Gemini 단가가 GPT 호출에 재사용되지 않는다") — there is no shared pricing table an adapter could accidentally fall through to.

### Anti-Patterns to Avoid
- **A single `PROVIDER_PRICING` table keyed only by model ID across all three vendors:** tempting because it's one file, but reintroduces exactly the cross-vendor pricing leakage PROV-07 exists to prevent if a model ID string ever collides or a lookup falls back to a default. D-06 explicitly mandates separate files per provider — follow it literally, not as a suggestion.
- **Forwarding `GenerateParams.temperature` unconditionally to the Anthropic SDK:** will throw a 400 on every model in this catalog. The Anthropic adapter must be the one adapter that deliberately ignores an interface field.
- **Treating OpenAI's `status: 'incomplete'` + `incomplete_details.reason === 'max_output_tokens'` as an error:** it is a normal, billable, non-refusal completion — must map to `finishReason: 'max_tokens'`, following the exact same precedent as Gemini's `MAX_TOKENS` and the existing `wasCapped` UI signal, not to a thrown `ProviderCallError`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OpenAI/Anthropic HTTP retries, auth header construction, SDK response typing | A custom `fetch` wrapper per vendor | The vendor's own official SDK (`openai`, `@anthropic-ai/sdk`) | Both SDKs already implement typed responses, auth, and a configurable single-attempt-friendly retry count (`maxRetries: 0` is settable on both, mirroring the existing Gemini adapter's `retryOptions: { attempts: 1 }` — Phase 11 owns retry policy, so pin both new adapters to zero/one attempt exactly like Gemini) |
| Cross-vendor usage-field normalization | Ad hoc `if (provider === 'openai') ... else if ...` scattered through `chat.ts` | The existing `UsageReport`/`mapXResponse` seam — each adapter normalizes internally, `chat.ts` never branches on `provider` for usage shape | This is precisely what Phase 8 built the interface to avoid; reintroducing vendor branching in `chat.ts` would be a regression of the Phase 8 design, not a new decision |
| Refusal detection heuristics on raw text | Regex/keyword scanning for "I can't help with that" style sentences | Each vendor's structured signal (`refusal` content block / `incomplete_details.reason` for OpenAI, `stop_reason === 'refusal'` for Anthropic, `finishReason`/`blockReason` for Gemini) normalized into `ProviderRefusal` | Phase 8 D-05(C) already locked this: prose-only refusals are explicitly out of scope everywhere, all three vendors, no exception carved out for the new adapters |

**Key insight:** Every piece of vendor-specific plumbing this phase needs (auth, retries, response parsing, refusal signals) already has an official, typed answer in the vendor's own SDK — the only real engineering here is writing the two `mapXResponse` pure functions correctly and keeping cost/model data provider-isolated per D-06.

## Runtime State Inventory

> Not a rename/refactor phase in the strict sense, but PROV-04 requires new persistent account state (default provider/model) that doesn't exist yet — flagging explicitly since "no schema change" was a Phase 8 principle that does NOT carry over unchanged into Phase 9.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | No `profiles` (or other) column currently stores a per-account default AI provider/model — `grep` of `supabase/migrations/*.sql` confirms `profiles` (0001_init.sql) has no such column. PROV-04 ("작가가 계정 설정에서 기본 제공자·모델을 지정") requires one. | New migration: add `default_provider text` / `default_model text` (or a single `default_provider_model jsonb`) to `profiles`, with a server-side default value (e.g. `'gemini'` / the existing lite model) so existing accounts have a valid default without a backfill script — nullable-with-fallback-in-code is simpler than a data migration if the planner prefers zero-migration-risk. |
| Live service config | None — OpenAI/Anthropic platform (service) keys are read from `process.env` exactly like `GEMINI_API_KEY` today (`createPlatformProvider`); no external dashboard config to track for this phase (BYOK's per-user key storage is Phase 10, explicitly out of scope here). | Add `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` to `.env`/deployment secrets — a config/ops task, not a code migration. |
| OS-registered state | None applicable — no OS-level task/service registration involved. | None. |
| Secrets/env vars | New env vars needed: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`. Code must read these via the same `env: Record<string, string | undefined>` injection pattern `createPlatformProvider` already uses (test-friendly, no hardcoded `process.env` reads inside adapter constructors). | Code addition only — no existing key is renamed or repurposed. |
| Build artifacts | None — no package rename, no stale egg-info/binary concerns; this is pure additive dependency installation (`npm install openai @anthropic-ai/sdk`). | None. |

## Common Pitfalls

### Pitfall 1: Anthropic Rejects `temperature` on Every Model This Catalog Uses
**What goes wrong:** Sending `temperature: 0.9` (the value `chat.ts` currently hardcodes for Gemini) to Anthropic's Messages API for `claude-sonnet-5`, `claude-opus-5`, or `claude-haiku-4-5` — all Opus-4.6-generation-or-later — either gets silently ignored (docs say "deprecated... only value 1.0 accepted") or produces different behavior than the writer's style/genre prompt design assumes, depending on exact enforcement. The interface (`GenerateParams.temperature`) is shared and required; nothing forces an adapter author to notice this vendor-specific quirk.
**Why it happens:** Anthropic deprecated the parameter after Claude Opus 4.6 in favor of an internal adaptive-thinking/effort mechanism; the shared `GenerateParams` type predates any Anthropic integration and was modeled on Gemini's fully-supported `temperature`.
**How to avoid:** The Anthropic adapter must not forward `temperature` to `client.messages.create(...)` at all — accept the field on `GenerateParams` (interface compatibility) and deliberately discard it, with a code comment citing this fact so a future refactor doesn't "fix" the omission.
**Warning signs:** A 400-series error from Anthropic mentioning `temperature`, or Anthropic responses that don't vary in creativity/style the way Gemini/OpenAI responses do at different genre/style presets.

### Pitfall 2: OpenAI's Refusal Signal Splits Across Two Different Fields Depending on Cause
**What goes wrong:** A safety-classifier refusal on the Responses API shows up as a `type: "refusal"` content block inside `output[].content[]` with the model still returning `status: "completed"`. A different failure mode — the request being blocked by input-side content moderation before generation even starts — instead surfaces as `status: "incomplete"` with `incomplete_details.reason` set to a filter-related string. Checking only one of these two shapes will miss the other refusal path entirely, and (per Pitfall 5 in the shared PITFALLS.md) a missed refusal silently renders as `parseChatResponse`'s raw-text fallback, billed as a normal reply.
**Why it happens:** OpenAI's Responses API models two structurally different moments of intervention (pre-generation input moderation vs. mid-generation classifier refusal) as two different top-level response shapes, unlike Gemini's cleaner `promptFeedback.blockReason` (pre) vs. `finishReason` (mid) split which this codebase's `mapGeminiResponse` already handles correctly for its own vendor.
**How to avoid:** `mapOpenAiResponse` must check both: (1) a `refusal`-type content block anywhere in `output`, and (2) `status === 'incomplete' && incomplete_details?.reason` matching a content-filter-family value, before falling through to `finishReason: 'stop'`.
**Detection:** Manually trigger a refusal from OpenAI with a clearly-disallowed prompt during integration testing (per the existing PITFALLS.md "Looks Done But Isn't" checklist item for multi-provider chat generation) and confirm both refusal shapes are exercised, not just one.

### Pitfall 3: OpenAI's Newest (gpt-5.x) Models May Be Rate-Limited or Unreachable Without Organization Verification
**What goes wrong:** A freshly-billing-enabled OpenAI account can still sit at a low, unverified rate-limit tier and be denied access to the latest model generation (gpt-5.6-terra in this catalog) until government-ID-based Organization Verification completes — a multi-day-to-multi-week external process, structurally identical to the v1.0 Toss Payments merchant-review lead time this project has already been burned by once.
**Why it happens:** OpenAI's access-tier gating is an account-level policy independent of code correctness; a 403/404 from the API in this case looks identical to a misconfigured model ID.
**How to avoid:** Confirm actual OpenAI account verification status and rate-limit tier before writing integration tests against `gpt-5.6-terra` specifically — `gpt-4o-mini` is very unlikely to be gated the same way and is the safer first model to prove the adapter against. STATE.md's Blockers section already flags this lead time was supposed to be started in parallel with Phase 8; check its current status before phase planning assumes both catalog rows are immediately callable.
**Detection:** A live `client.responses.create({ model: 'gpt-5.6-terra', ... })` call returning 403/404 despite a valid, billing-enabled API key is the signal — check the OpenAI dashboard's organization verification status, not just the API key's validity.

## Code Examples

See Architecture Patterns §Pattern 1 above for the full adapter implementations (OpenAI + Anthropic), sourced from official SDK/API docs fetched 2026-09-22.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| OpenAI Chat Completions API (`/v1/chat/completions`) as the default integration point | OpenAI Responses API (`/v1/responses`, `client.responses.create`) | Responses API has been OpenAI's recommended default for new server-side integrations for some time; still current as of 2026-09-22 | Different request/response shape (`input`/`instructions` vs `messages`, `output`/`output_text` vs `choices[0].message.content`) — do not copy Chat-Completions-shaped code from older tutorials/training data |
| `temperature` as a universally-supported LLM sampling knob | Deprecated/rejected on Anthropic's Opus-4.6-and-later generation (all 3 models in this catalog) | Anthropic's own docs mark this as already in effect, not upcoming | See Pitfall 1 — must not forward `temperature` to Anthropic |

**Deprecated/outdated (relative to the v1.1 SUMMARY.md research pass from 2026-09-16):**
- SUMMARY.md's `js-tiktoken` recommendation: superseded by Phase 8's actual decision to remove local token estimation entirely. Do not install it.
- SUMMARY.md's `@anthropic-ai/sdk@0.125.x` pin: registry has moved to `0.127.0` in the six days since; re-verify the exact patch at install time regardless of what's written here.
- The v1.1 research pass's implicit OpenAI/Anthropic model assumptions (pre-dating this research's live docs fetch): both vendors have shipped newer model families (gpt-5.6, gpt-6-astra; Claude Fable 5.1, Opus 5) since 2026-09-16. This document's Model Catalog table is the current source of truth for Phase 9 planning, not SUMMARY.md's Phase 9 section.

## Open Questions

1. **Exact `gpt-4o-mini` max-output-token figure**
   - What we know: 128K context window is well-established; the 16K max-output figure is from general model knowledge, not re-confirmed against a docs page in this research pass (the fetched pricing/models pages didn't list it explicitly for this specific legacy model).
   - What's unclear: Whether OpenAI has changed this limit since.
   - Recommendation: Confirm via `curl https://api.openai.com/v1/models/gpt-4o-mini` or the SDK's `client.models.retrieve('gpt-4o-mini')` at implementation time; low risk either way since `computeMaxOutputTokens` already clamps to `PER_REQUEST_MAX_OUTPUT_TOKENS = 2048`, well under any plausible real limit.

2. **OpenAI Organization Verification / Anthropic billing tier status**
   - What we know: STATE.md's Blockers section says both were supposed to start in parallel with Phase 8 (2026-09-17ish).
   - What's unclear: Current status as of this research date (2026-09-22) — not verifiable by this research agent (no dashboard access).
   - Recommendation: Planner should treat "confirm both platform accounts are billing-enabled and check OpenAI's verification tier" as a Wave-0-style precondition check, not an assumption; if OpenAI verification is still pending, plan should explicitly scope the OpenAI adapter to `gpt-4o-mini` only for this phase's success criteria and treat `gpt-5.6-terra` as best-effort/follow-up.

3. **Storage shape for the account default provider/model (PROV-04)**
   - What we know: Needs to persist somewhere account-scoped; `profiles` table (0001_init.sql) is the natural home, matches how other per-account settings are likely to live.
   - What's unclear: Whether to use two `text` columns or one `jsonb` column; whether Phase 10's BYOK key-management UI (which will share the same `/studio/settings/ai-providers` page) has an opinion on this shape that should be anticipated now to avoid a second migration.
   - Recommendation: Left as Claude's Discretion per CONTEXT.md ("스키마 변경 없음 원칙 안에서 플래너가 결정" — note this specific principle was Phase 8's, and Phase 9 unavoidably needs one new migration for this feature; two plain `text` columns with app-level validation against `PROVIDER_MODELS` is the simplest choice and doesn't foreclose Phase 10 adding sibling BYOK-key columns to the same table).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `openai` npm package | PROV-02 | ✓ (installable from registry) | 7.21.0 latest | — |
| `@anthropic-ai/sdk` npm package | PROV-03 | ✓ (installable from registry) | 0.127.0 latest | — |
| `OPENAI_API_KEY` (platform/service key) | PROV-02, PROV-07 | Unknown — not verifiable by this research agent; check `.env`/deployment secrets and OpenAI dashboard verification tier | — | If missing or unverified for gpt-5.6-terra: ship `gpt-4o-mini` only (Pitfall 3) |
| `ANTHROPIC_API_KEY` (platform/service key) | PROV-03, PROV-07 | Unknown — not verifiable by this research agent; check `.env`/deployment secrets and Anthropic billing/rate-limit tier | — | None identified — Anthropic's rate-limit tiers are less gated on model *access* than OpenAI's, but a low tier could still throttle integration testing; no code fallback, this is an external-account concern only |

**Missing dependencies with no fallback:**
- Valid, billing-enabled `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` — blocks any live verification of PROV-02/PROV-03/PROV-07 success criteria (code can still be written and unit-tested against mocked/fixture providers, exactly as Phase 8's Gemini adapter tests do via `createFixtureProvider`).

**Missing dependencies with fallback:**
- OpenAI gpt-5.6-terra access specifically (if verification pending) — fall back to `gpt-4o-mini` only for this phase, per Pitfall 3.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (`vitest.config.ts` present) |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/ai/provider-gemini.test.ts` (pattern to replicate as `tests/ai/provider-openai.test.ts` / `tests/ai/provider-anthropic.test.ts`) |
| Full suite command | `npm test` (`vitest run`) |

Phase 8 already established the exact test pattern this phase should replicate: `tests/ai/provider-gemini.test.ts` unit-tests `mapGeminiResponse` as a pure function against constructed fixture response objects (no live network call, no vendor SDK instantiation needed for the mapping logic itself), and `tests/ai/provider-errors.test.ts` / `tests/ai/provider-fixture.test.ts` test the shared scrubbing/fixture-provider seams. `tests/ai/chat.test.ts` and `tests/ai/chat-refusal.test.ts` exercise `chat()` end-to-end against a mocked `ProviderClient`, which already accepts any `provider` value — extending these to a table-driven `it.each(['gemini','openai','anthropic'])`-style test (or adding parallel `chat-refusal-openai.test.ts`/`chat-refusal-anthropic.test.ts`) is the natural way to prove D-08's "3벤더 공통 재사용" requirement without hitting live APIs.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROV-02 | `mapOpenAiResponse` correctly parses a happy-path Responses API object into `GenerateResult` | unit | `npx vitest run tests/ai/provider-openai.test.ts` | ❌ Wave 0 |
| PROV-02 | OpenAI refusal (both `refusal` content-block and `incomplete_details` shapes) normalizes to `ProviderRefusal` | unit | `npx vitest run tests/ai/provider-openai.test.ts` | ❌ Wave 0 |
| PROV-03 | `mapAnthropicResponse` correctly parses a happy-path Messages API object into `GenerateResult`, and `temperature` is never forwarded to the SDK call | unit | `npx vitest run tests/ai/provider-anthropic.test.ts` | ❌ Wave 0 |
| PROV-03 | Anthropic `stop_reason: 'refusal'` normalizes to `ProviderRefusal` | unit | `npx vitest run tests/ai/provider-anthropic.test.ts` | ❌ Wave 0 |
| PROV-04 | `chatAction`/`chat()` accepts a `providerId` + `model` pair and rejects a model not in that provider's catalog | unit/integration | `npx vitest run tests/ai/chat-action.test.ts` (extend existing) | ✅ exists, extend |
| PROV-04 | Per-call provider/model override applies only to that send, not persisted as the next default (D-05) | integration | new assertion in `tests/ai/chat-action.test.ts` or a new `tests/ai/provider-override.test.ts` | ❌ Wave 0 (new assertions) |
| PROV-07 | `computeDebitAmount`/cost lookup for an OpenAI or Anthropic model never reads Gemini's pricing table | unit | `npx vitest run tests/ai/cost-estimate.test.ts` (extend existing) | ✅ exists, extend |
| PROV-07 | Pre-call cost estimate shown to the writer reflects the selected provider's real per-model pricing | unit | extend `tests/ai/cost-estimate.test.ts` | ✅ exists, extend |
| (manual) | A deliberate refusal-triggering prompt against real OpenAI and Anthropic platform keys produces the shared Korean refusal copy, not raw vendor text | manual | N/A — requires live API keys | — |
| (manual) | OpenAI/Anthropic rate-limit/org-verification tier confirmed reachable for the exact catalog models chosen | manual | N/A — requires dashboard access | — |

### Sampling Rate
- **Per task commit:** `npx vitest run <touched-test-file>`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`, plus the two manual live-API checks above recorded as human verification items (mirrors how Phase 4's live-Gemini UAT was tracked as an outstanding manual item in STATE.md).

### Wave 0 Gaps
- [ ] `tests/ai/provider-openai.test.ts` — covers PROV-02 (mapping + refusal normalization), modeled directly on `tests/ai/provider-gemini.test.ts`
- [ ] `tests/ai/provider-anthropic.test.ts` — covers PROV-03 (mapping + refusal normalization + temperature-not-forwarded assertion), modeled on the same pattern
- [ ] `lib/ai/providers/catalog.ts` fixture data usable by tests (a small, deterministic `PROVIDER_MODELS`-shaped constant) so provider/model validation tests don't depend on the real, possibly-changing catalog table

## Sources

### Primary (HIGH confidence)
- `platform.claude.com/docs/en/models/overview` — fetched 2026-09-22, current GA Claude model IDs, pricing, context window, max output
- `platform.claude.com/docs/en/api/messages` — fetched 2026-09-22, Messages API request/response shape, usage fields, stop_reason enum including `refusal`, temperature deprecation note
- `developers.openai.com/api/docs/pricing` — fetched 2026-09-22, current OpenAI model pricing table
- `developers.openai.com/api/docs/models` — fetched 2026-09-22, gpt-5.6 family model IDs, context/output limits
- `developers.openai.com/api/docs/api-reference/responses/create` — fetched 2026-09-22, Responses API request/response shape, usage fields, refusal/incomplete_details signaling
- `npm view openai version` / `npm view @anthropic-ai/sdk version` — run 2026-09-22, current registry versions
- Direct reads of `lib/ai/providers/{types,registry,models,gemini,errors}.ts`, `lib/ai/cost.ts`, `lib/ai/chat.ts`, `app/studio/[workId]/chapters/[chapterId]/actions.ts`, `app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanel.tsx` — existing Phase 8 code this phase extends
- `.planning/phases/08-provider-adapter-idempotent-debit/08-CONTEXT.md` — locked decisions this phase reuses without redefinition (D-05~D-10 refusal/error taxonomy)
- `.planning/phases/09-openai-anthropic/09-CONTEXT.md` — this phase's locked decisions (D-01~D-08)

### Secondary (MEDIUM confidence)
- `.planning/research/PITFALLS.md` / `SUMMARY.md` (2026-09-16 pass) — cross-checked against this research's live docs fetch; superseded where model/version specifics diverged (noted explicitly in State of the Art)

### Tertiary (LOW confidence)
- `gpt-4o-mini`'s exact max-output-token figure (16K) — general knowledge, not found explicitly in the fetched docs pages; flagged as Open Question 1

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — SDK versions and model catalog verified directly against npm registry and official vendor docs today
- Architecture: HIGH — directly extends an existing, already-implemented Phase 8 pattern (`ProviderClient`, `mapGeminiResponse`), not a novel design
- Pitfalls: MEDIUM-HIGH — the Anthropic `temperature` rejection and OpenAI dual-refusal-shape findings are verified against official docs fetched today; live-call behavior (exact error codes, rate-limit tier reality) remains unverified until real API keys are exercised

**Research date:** 2026-09-22
**Valid until:** ~2026-10-06 (30 days is too long for LLM vendor pricing/model-catalog specifics per this project's own precedent — Gemini pricing comment already notes "changes monthly"; re-verify the Model Catalog table immediately before implementation if more than ~2 weeks pass)
