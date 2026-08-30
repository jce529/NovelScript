# Phase 4: AI Gateway (Mention-Based Generation) - Research

**Researched:** 2026-08-30
**Domain:** Gemini API integration (Node/Server Actions), caret-anchored mention autocomplete on a plain `<textarea>`, wallet-backed spend-cap enforcement
**Confidence:** MEDIUM-HIGH (Gemini SDK/pricing verified against live docs this session; wallet-to-LLM-token conversion is an open design gap — no prior phase defined it)

## Summary

Phase 4 is greenfield for AI integration — no `@google/genai` (or any Gemini SDK), no tokenizer library, and no mention/autocomplete code exists anywhere in the repo today. Everything needed (SDK, caret-position library, popover/command UI) is a new dependency. The good news: every other piece this phase touches (Server Actions pattern, KB document queries, the wallet's atomic `apply_wallet_delta` RPC, shadcn/base-ui component conventions) is already established and battle-tested through Phases 1-3, and this phase should reuse those conventions exactly rather than inventing new ones.

The single most important open design gap this research surfaces: **the wallet's "토큰" (a purchased platform currency, price-tiered at 10/30/50/100 per `PRICE_TIERS`) is not the same unit as a Gemini LLM token**, and no prior phase or doc fixes an exchange rate between them. CONTEXT.md's D-12/D-13 language ("약 1,200 토큰", "잔여 토큰까지만 생성") reads as if they're the same unit, but ROADMAP's success criterion #4 explicitly says spend caps are enforced "against the wallet" — meaning a conversion must happen even if the UI never shows it. This phase's planner must pick a concrete conversion formula (Gemini's actual $/token pricing → wallet-token equivalent) before D-13's cap-and-truncate mechanism can be implemented; see Open Questions.

The Gemini API itself is straightforward: `@google/genai` (the current unified SDK, npm `2.19.0` as of this research) exposes `ai.models.generateContent()` for the actual call and `ai.models.countTokens()` for a pre-call estimate — but `countTokens` only counts **input** tokens, which conveniently matches D-12's requirement (show injected-context cost, not a guess at output length) without extra work. Output-side capping for D-13 is done via `config.maxOutputTokens`, and after the call, `response.usageMetadata.candidatesTokenCount` gives the actual tokens billed, which is what should be atomically debited via the existing `apply_wallet_delta` RPC — never the pre-call estimate.

**Primary recommendation:** Install `@google/genai` + `textarea-caret` (+ `@types/textarea-caret`). Do the Gemini call, cost check, and wallet debit entirely inside a Server Action (no streaming, no new Route Handler needed — matches every existing mutation in this codebase). Compute `maxOutputTokens` from the writer's remaining wallet balance *before* the call fires (this is what "spend cap enforced before the call fires" concretely means), then debit only the actual `usageMetadata.candidatesTokenCount` afterward through `apply_wallet_delta` with a fresh idempotency key.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** The AI panel is a fixed right-side panel next to the existing chapter body editor (`app/studio/[workId]/chapters/[chapterId]/page.tsx`) — always visible while writing, not a toggle or bottom sheet.
- **D-02:** Typing `@` in the plain-textarea chapter editor opens an autocomplete dropdown as an overlay positioned near the caret (not a separate search box inside the panel).
- **D-03:** Mentioned documents display in the AI panel as a chip list (`[주인공 ✕]` style), individually removable — removing a chip excludes that document from the next generation's injected context.
- **D-04 (SCOPE EXPANSION):** A "퀵애드" (quick-add) flow — typing a proper-noun not found in the mention dropdown offers an inline "새 문서 만들기" action that creates the KB document on the spot (lightweight overlay, no navigation away) and immediately mentions it.
- **D-05 (SCOPE EXPANSION, revised — see UI-SPEC):** The AI panel header carries a model-tier selector + genre selector in one row (originally three controls including the tone preset; the UI-SPEC revision demoted the preset to a gear-icon dropdown — see D-05rev/D-08rev below).
- **D-06:** The model-tier selector chooses among Gemini-family model tiers only — stays inside the single-vendor (Gemini) constraint. NOT a multi-vendor picker.
- **D-07:** The genre selector defaults to the work's own genre (Phase 2 D-04's fixed list) but is overridable per-generation. Reuses `GENRES` from `lib/works/genres.ts` — no new list.
- **D-08:** "AI 지시 프리셋" (초보자/중급자/자유형) is a dropdown/gear-menu, not a button group (see UI-SPEC D-08rev below for exact affordance).
- **D-09:** When 자유형 is selected, its custom-instruction textarea expands inline directly below — no modal, no layout shift elsewhere.
- **D-10:** AI output is never auto-inserted. Generation renders as a preview inside the AI panel; the writer explicitly accepts (inserts at cursor) or rejects (discards) it.
- **D-10rev (UI-SPEC revision):** The accept/reject/regenerate step is a Claude-Code-style permission-prompt card: header question "이 내용을 본문에 삽입할까요?", numbered options (1. 본문에 삽입하기 [default/accent] / 2. 다시 생성하기 / 3. 거부하고 지우기), plus a free-text row ("또는 원하는 방향을 알려주세요...") whose submitted text is treated as regeneration guidance folded into the 자유형 instruction for that one regeneration — not a 4th action.
- **D-11 (Claude's Discretion, resolved as "allow"):** Regeneration re-runs the same mention set + preset against a fresh Gemini call — each regeneration is a new billable request under the same EDIT-05 cost-estimate flow.
- **D-12:** The pre-generation cost estimate shows a token count only (e.g. "약 1,200 토큰") — no KRW conversion, no gauge.
- **D-13:** On spend-cap overage: do NOT block outright, do NOT warn-and-allow. Instead, cap the call so generation produces output only up to the writer's remaining token balance, then stop and explicitly notify the writer that their balance is exhausted. The cap applies to the call's max-output-length up front, not a pure allow/deny gate. User's verbatim words: "잔여 토큰까지만 생성. 이후 토큰이 전부 소모됐더고 알리고 작업 중단."
- **D-14:** Every generation call carries a baseline system prompt (independent of preset) that must include: (1) content-policy guardrails, (2) an instruction to maintain stylistic continuity with the writer's immediately preceding canvas text, (3) an instruction not to contradict mentioned KB documents' established facts.
- **D-15 (UI-SPEC addition):** A separate 문체 프리셋 (writing-style preset) control, distinct from the AI-지시-프리셋 gear menu — real literary-style options each with a one-line author-style description (e.g. "간결체 · 헤밍웨이풍"). Default: "간결체 · 헤밍웨이풍".
- **D-05rev/D-06/D-07/D-08rev (UI-SPEC layout):** Header row = model-tier select (flex-1, label "AI 모델", options "라이트"/"프로") + genre select (flex-1, label "장르") + AI-지시-프리셋 gear button (32×32px icon button, opens a `dropdown-menu` listing 초보자/중급자[default]/자유형 with one-line descriptions). 문체 프리셋 is a separate full-width row below.

### Claude's Discretion
- Exact model-tier names/count and how each tier's pricing feeds the EDIT-05 cost estimate.
- Quick-add (D-04) overlay's exact fields and validation.
- Preview/accept-reject (D-10/D-10rev) exact UI — resolved by UI-SPEC as the permission-prompt card; implementation detail (component structure) still open.
- Regeneration UX details.
- Exact wording of the D-14 baseline system prompt.
- Concrete per-request and per-user spend cap numeric values (token counts) — technical/business tuning, not raised with the user this session.

### Deferred Ideas (OUT OF SCOPE)
- Multi-vendor/BYOK AI provider selection (v2).
- 3-panel full canvas layout, ghost-text (Tab-to-accept), dedicated system-prompt modal, KB graph view, real-time color-gradient cost gauge, beginner-tier recommended-prompt chips (all v2 / Out of Scope per REQUIREMENTS.md).
- Whether D-04/D-05-D-07/D-15 need their own REQUIREMENTS.md line items (new EDIT-* IDs) — flagged for planner/next session, not resolved here.
- Wiki-link (`[[ ]]`) resolution when injecting KB doc content into the Gemini prompt — per `02-CONTEXT.md` D-13, wiki-link syntax is inert plain text; do NOT attempt to resolve it.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EDIT-01 | Writer can insert `@`-mention references to KB documents via autocomplete search by name/type | `textarea-caret` + base-ui `Popover` virtual-anchor pattern (verified in installed `@base-ui/react@1.7.0` source) for caret-anchored overlay; `lib/kb/actions.ts` `getKbTree`/KB node query as the search-by-name/type data source; shadcn `command` (cmdk) for the filterable list — see Architecture Patterns |
| EDIT-02 | Writer can see a visible list of currently-mentioned/in-context documents before generating | Chip-list state (D-03) is pure client component state (array of mentioned node IDs/names) rendered as `Badge` — no new backend needed beyond re-fetching the mentioned nodes' `content` at generate-time |
| EDIT-03 | Writer can select one of 3 tone presets (초보자/중급자/자유형), with 자유형 offering a custom-instruction textarea | Confirmed UI-SPEC resolves this as the "AI 지시 프리셋" gear-dropdown; maps to `systemInstruction` composition strategy — see Architecture Patterns "Preset → System Instruction" |
| EDIT-04 | Writer can trigger AI generation that sends mentioned KB docs + preset + instruction to Gemini and inserts the result into the canvas | `@google/genai` `ai.models.generateContent()` Server Action pattern, `config.systemInstruction` + `config.maxOutputTokens`; insertion happens client-side only after D-10rev's accept action, into the existing `<Textarea>` `content` state at cursor position |
| EDIT-05 | Writer sees a token/cost estimate before generating | `ai.models.countTokens()` on the assembled input (baseline prompt + preset instruction + mentioned KB doc content + preceding canvas text) — verified this only counts input tokens, which matches D-12's "token count only" requirement with no extra estimation logic needed |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|---------------|
| `@google/genai` | 2.19.0 (verified via `npm view` 2026-08-30) | Official unified Google Gen AI SDK (Gemini Developer API + Vertex AI) for Node/TS | Successor to the deprecated `@google/generative-ai` (frozen at 0.24.1, no longer receiving new-model support); this is the SDK Google's own current docs and code samples use |
| `textarea-caret` | 3.1.0 (verified via `npm view`) | Computes `{top, left, height}` pixel offset of the caret inside a plain `<textarea>`/`<input>`, using the standard "mirror div" technique | Plain `<textarea>` has no native caret-coordinate API (unlike `contentEditable`); this is the de-facto small library every textarea-mention implementation (Twitter/GitHub-style autocomplete) is built on. Zero dependencies, 11.4kB. |
| `@types/textarea-caret` | 3.0.4 | TypeScript types for the above (the library itself ships untyped JS) | — |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn `popover` (base-ui) | already resolvable via `npx shadcn add popover` per UI-SPEC | Anchors the mention-autocomplete overlay | `Popover.Positioner`'s `anchor` prop accepts `Element \| VirtualElement \| RefObject \| (() => ...)` — confirmed in `node_modules/@base-ui/react/popover/positioner/PopoverPositioner.d.ts`. Build a `VirtualElement` (`{ getBoundingClientRect(): DOMRect }`) from the caret coordinates + textarea's own `getBoundingClientRect()` offset, pass as `anchor`. |
| shadcn `command` (cmdk under the hood) | already resolvable via `npx shadcn add command` | Filterable, keyboard-navigable mention list inside the popover | Standard shadcn pairing for "popover + searchable list" (the exact `command`-inside-`popover` combo shadcn's own docs recommend for comboboxes) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@google/genai` | `@google/generative-ai` | Deprecated/frozen — do not use for new code |
| `textarea-caret` + custom popover wiring | `@webscopeio/react-textarea-autocomplete` or `react-githubish-mentions` (all-in-one mention libraries) | These own the entire textarea and its own dropdown rendering, which conflicts with D-01/D-02's requirement that the mention dropdown is a `popover`+`command` overlay on the *existing* Phase 2 `<Textarea>` styled per UI-SPEC's exact spacing/color tokens. A small coordinate-only library (`textarea-caret`) + hand-wired shadcn `popover`/`command` gives full control over styling and matches this codebase's "own the UI, use small utility libs" pattern (see `dnd-kit` usage in Phase 2 for precedent). |
| Client-side token estimation heuristic (e.g. `chars / 4`) | `ai.models.countTokens()` | `countTokens` is a real API call (network round-trip, small latency) but gives an exact, model-specific count; a heuristic is free but inaccurate and Gemini's tokenizer isn't 1:1 with GPT-style BPE, so the `chars/4` rule of thumb is unreliable for Korean prose specifically (CJK text tokenizes very differently — often closer to 1-2 tokens per character, not 4 chars per token). Given the phase's own requirement is a *visible, trusted* cost estimate, use the real API for MEDIUM-HIGH confidence over a shortcut that could be badly wrong for Korean text. |

**Installation:**
```bash
npm install @google/genai textarea-caret
npm install --save-dev @types/textarea-caret
npx shadcn add popover command
```

**Version verification:** Versions above were confirmed live against the npm registry on 2026-08-30 via `npm view <pkg> version` — not from training-data memory, since `@google/genai` in particular has had multiple major-version-with-breaking-changes cycles (v3.0.0+ raised the Node.js minimum to 22; this project should pin `^2.x` unless the Node runtime is confirmed ≥22, since Next.js 16 does not itself require Node 22).

## Architecture Patterns

### Recommended Project Structure
```
lib/
├── ai/
│   ├── gemini.ts          # thin GoogleGenAI client factory (reads GEMINI_API_KEY), model-tier → model-ID map
│   ├── prompt.ts          # assembles baseline system prompt (D-14) + preset instruction (D-08rev) + 문체 preset (D-15) + KB doc content + preceding canvas text
│   ├── cost.ts            # countTokens wrapper (EDIT-05), wallet-token conversion formula (see Open Questions), maxOutputTokens-from-balance calculation (D-13)
│   └── actions.ts         # 'use server' — estimateCostAction, generateAction (calls gemini.ts + cost.ts + apply_wallet_delta), mirrors lib/chapters/actions.ts's ownership-guard style
app/studio/[workId]/chapters/[chapterId]/
├── ai-panel/
│   ├── AiPanel.tsx             # D-01 fixed right panel, holds mention-chip state, calls actions
│   ├── MentionAutocomplete.tsx # D-02, wraps textarea's onKeyUp to detect '@', uses textarea-caret + Popover virtual anchor + Command list, hosts D-04 quick-add row
│   ├── QuickAddDialog.tsx      # D-04, reuses existing Dialog pattern from Phase 2's KB "새 문서 만들기"
│   └── GenerationPreview.tsx   # D-10rev permission-prompt card
```

### Pattern 1: Server Action owns the full generate → cap → debit → return lifecycle
**What:** A single `generateAction(workId, chapterId, { mentionedNodeIds, modelTier, presetLevel, customInstruction, styleId, precedingText })` Server Action does: (1) fetch mentioned KB doc content via `lib/kb/actions.ts`, (2) assemble the prompt via `lib/ai/prompt.ts`, (3) read current wallet balance, (4) compute `maxOutputTokens` from that balance via the conversion formula, (5) call `ai.models.generateContent()` with that cap, (6) read `response.usageMetadata.candidatesTokenCount` (actual, not estimated), (7) call `apply_wallet_delta` with a fresh `reference_id` (e.g. a UUID generated for this generation attempt) to debit atomically, (8) return `{ ok, text, finishReason, wasCapped: finishReason === 'MAX_TOKENS' }` to the client.
**When to use:** Every generation and every regeneration (D-11) — regeneration is just a fresh call to the same action with the same or feedback-augmented instruction, never a client-side retry of a cached response.
**Example:**
```typescript
// Source: https://ai.google.dev/gemini-api/docs (verified via WebFetch, 2026-08-30)
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const response = await ai.models.generateContent({
  model: MODEL_TIER_TO_ID[modelTier], // e.g. 'gemini-2.5-flash' | 'gemini-2.5-pro'
  systemInstruction: baselineAndPresetPrompt,
  contents: userTurnContent, // mentioned KB docs + preceding canvas text + custom instruction
  config: {
    maxOutputTokens: cappedMaxOutputTokens, // D-13: computed from remaining wallet balance, applied BEFORE the call
    temperature: 0.9,
  },
});

const actualOutputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
const wasCapped = response.candidates?.[0]?.finishReason === 'MAX_TOKENS';
```

### Pattern 2: Pre-generation cost estimate via countTokens (input-only, matches D-12 exactly)
**What:** `ai.models.countTokens({ model, contents: assembledPrompt })` returns `{ totalTokens }` for the **input side only** — it does not and cannot predict output length. This is called by a separate, cheap Server Action every time the mention chip list or instruction text changes (debounced client-side), and the result is shown verbatim as "약 {N} 토큰" per D-12's copy contract.
**When to use:** On every mention add/remove and preset/instruction change, before the writer clicks "생성하기". Do NOT try to estimate output tokens for this display — D-12 explicitly wants token count only, and the API itself doesn't offer a pre-call output estimate (output length is inherently unknown until generation happens, which is exactly why D-13's cap-and-truncate mechanism exists as a *runtime* safeguard rather than a pre-call block).
**Example:**
```typescript
// Source: https://ai.google.dev/gemini-api/docs/generate-content/tokens (verified via WebFetch, 2026-08-30)
const countTokensResponse = await ai.models.countTokens({
  model: MODEL_TIER_TO_ID[modelTier],
  contents: assembledPrompt,
});
// countTokensResponse.totalTokens — input tokens only, no output estimate included
```

### Pattern 3: Caret-anchored popover on a plain `<textarea>`
**What:** On every keystroke in the chapter `<Textarea>`, check if the text immediately before the caret matches an active `@mention-in-progress` pattern (e.g. `/@([^\s@]*)$/` on the substring up to `selectionStart`). If it matches, compute caret pixel position with `textarea-caret(textareaEl, textareaEl.selectionStart)`, add the textarea's own `getBoundingClientRect()` offset to convert to viewport coordinates, and pass a virtual anchor object to base-ui `Popover.Positioner`'s `anchor` prop.
**When to use:** D-02's exact requirement — "opens an autocomplete dropdown as an overlay positioned near the caret (not a separate search box inside the panel)".
**Example:**
```typescript
// Source: textarea-caret README (https://github.com/component/textarea-caret-position) +
// @base-ui/react PopoverPositioner.d.ts (installed node_modules, verified 2026-08-30)
import getCaretCoordinates from 'textarea-caret';

function getMentionAnchor(textarea: HTMLTextAreaElement) {
  const caret = getCaretCoordinates(textarea, textarea.selectionStart);
  const rect = textarea.getBoundingClientRect();
  const x = rect.left + caret.left - textarea.scrollLeft;
  const y = rect.top + caret.top - textarea.scrollTop;
  return {
    getBoundingClientRect: () => new DOMRect(x, y, 0, caret.height),
  };
}
// <Popover.Positioner anchor={getMentionAnchor(textareaRef.current)} side="bottom" sideOffset={4}>
```

### Pattern 4: Preset → system instruction composition (D-08rev + D-14 + D-15)
**What:** The final `systemInstruction` sent to Gemini is always: baseline guardrail block (D-14, fixed, never omitted) + 문체 프리셋 description (D-15, always included — it's a separate control, not gated by the AI-지시-프리셋 level) + AI-지시-프리셋 level-specific block:
- 초보자: an instruction telling the model to independently decide what to write next with no additional writer input (per UI-SPEC copy: "AI가 알아서 다음 전개에 맞는 지시를 구성해요").
- 중급자 (default): standard instruction with "약간의 재량" (some latitude) — a middle-ground instruction block.
- 자유형: the writer's typed `customInstruction` (D-09 textarea) is appended verbatim as the dominant instruction.
**When to use:** Every generation and regeneration. D-10rev's free-text regeneration feedback is folded in as an *additional* instruction line appended to whatever the active preset already contributes — it does not replace the preset.
**Anti-pattern to avoid:** Do not build a single hardcoded prompt string per preset with placeholders — the baseline (D-14) block must be composed identically regardless of preset, or a future edit to the content-policy guardrail wording would need to be duplicated in 3 places.

### Anti-Patterns to Avoid
- **Estimating cost with a `characters / 4` heuristic:** Inaccurate for Korean/CJK text; use `countTokens`.
- **Debiting the wallet based on the pre-call estimate:** Only debit the actual `usageMetadata.candidatesTokenCount` (or `totalTokenCount` if the design also wants to charge for input) returned by the real `generateContent` call — the estimate is informational only (D-12), and D-13's whole mechanism exists because actual usage isn't known until the call returns.
- **Blocking generation outright when the estimate exceeds balance:** D-13 explicitly rejects a hard pre-call block; the correct behavior is: check remaining balance → compute a `maxOutputTokens` cap from it → let the call proceed capped → notify after the fact if `finishReason === 'MAX_TOKENS'`.
- **Re-implementing wallet debit logic instead of calling `apply_wallet_delta`:** The RPC is already atomic, row-locked, and idempotent via `(wallet_id, reference_type, reference_id)` — a hand-rolled `SELECT balance ... UPDATE` in application code would reintroduce the exact race condition Phase 1 was built to eliminate.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Caret pixel position in a `<textarea>` | A custom mirror-div measurer | `textarea-caret` | This is a genuinely fiddly cross-browser problem (font metrics, `white-space: pre-wrap`, scroll offset) that a tiny, stable, dependency-free library already solves correctly |
| Atomic wallet debit with idempotency | A new `SELECT ... FOR UPDATE` transaction in a Server Action | `apply_wallet_delta` RPC (already exists, Phase 1) | Row-locked and idempotent via a unique constraint on `(wallet_id, reference_type, reference_id)` — proven under 100-way concurrent load in `tests/wallet/ledger.concurrency.test.ts` |
| Token counting for cost estimate | A custom BPE-like tokenizer or character-count heuristic | `ai.models.countTokens()` | Model-exact count from the vendor's own tokenizer; a heuristic drifts badly for Korean text specifically |
| Popover positioning against an arbitrary screen point | Manual `position: fixed` + scroll-listener recalculation | base-ui `Popover.Positioner`'s `anchor` prop (accepts a `VirtualElement`) | Already handles collision detection, viewport clamping, and (via `disableAnchorTracking`/`sticky`) scroll-follow behavior that a hand-rolled fixed-position div would have to reimplement |

**Key insight:** Every "don't hand-roll" item above already has a proven, low-risk building block either already installed in this repo (`apply_wallet_delta`, base-ui `Popover`) or a single-purpose, dependency-free npm package (`textarea-caret`) — there is no case in this phase where a custom implementation is justified over the existing/standard option.

## Common Pitfalls

### Pitfall 1: Treating wallet "토큰" and Gemini LLM tokens as the same unit without an explicit conversion
**What goes wrong:** D-13's spend-cap check reads the wallet balance directly as if it were a raw LLM token count, so a writer with (say) 50 wallet-토큰 (a typical single-chapter-unlock amount per `PRICE_TIERS`) would get a `maxOutputTokens: 50` cap — a couple of sentences — while a writer with 1,200 wallet-토큰 (a plausible balance after a few charges) would look "generous" relative to Gemini's actual $/token economics, without any grounding in what Gemini's output actually costs the platform in USD.
**Why it happens:** No prior phase (Phase 1's wallet, Phase 2's price tiers) ever defined a wallet-token ↔ KRW ↔ Gemini-$-per-token exchange rate; docs/3's "노벨 토큰" economy description leaves the charge-rate for AI generation completely open ("창작자: 플랫폼 자체 AI 모델 호출... 토큰 사용" — states AI calls consume tokens, but not at what rate).
**How to avoid:** Define an explicit conversion constant/function in `lib/ai/cost.ts` (e.g. `WALLET_TOKENS_PER_GEMINI_TOKEN` derived from the model's $/1M-token price and a provisional KRW-per-wallet-token assumption), even if the number is a placeholder pending Phase 5's real payment-tier pricing. Document the formula's inputs so it's a one-line change when Phase 5 fixes the real exchange rate. See Open Questions.
**Warning signs:** If the planner's plan skips straight to "read wallet balance, pass it as maxOutputTokens" without a named conversion step, this pitfall has been missed.

### Pitfall 2: Debiting the wallet with the pre-call cost estimate instead of actual usage
**What goes wrong:** If `apply_wallet_delta` is called with the `countTokens` estimate (input-only) rather than `usageMetadata.candidatesTokenCount` (actual output, post-call), writers are charged for a number that has no relationship to what was actually generated, and D-13's "capped, not blocked" design becomes pointless (the debit would already reflect the uncapped estimate).
**Why it happens:** It's tempting to reuse the EDIT-05 estimate value that's already sitting in component state as "the cost" once the writer clicks generate.
**How to avoid:** Debit strictly after the `generateContent` call returns, using `response.usageMetadata.candidatesTokenCount` (and/or `promptTokenCount` if input is also billed against the wallet — decide this explicitly, don't default silently).
**Warning signs:** Any code path that calls `apply_wallet_delta` before `ai.models.generateContent()` has been awaited.

### Pitfall 3: shadcn's generated `popover.tsx` may not forward an `anchor` prop out of the box
**What goes wrong:** The default shadcn `popover` block (once run via `npx shadcn add popover`) typically wraps `Popover.Positioner` with a fixed prop surface (`align`, `sideOffset`, etc.) for the common "anchor to trigger button" case. If it doesn't forward/accept a custom `anchor`, D-02's caret-following popover silently falls back to anchoring on the trigger element instead of the caret.
**Why it happens:** The generated component is optimized for the 90% case (popover-triggered-by-a-button), not a virtual-anchor use case.
**How to avoid:** After running `npx shadcn add popover`, inspect the generated `components/ui/popover.tsx` and either (a) extend `PopoverContent`'s props to accept and forward `anchor`, or (b) compose `Popover.Root`/`Popover.Positioner`/`Popover.Popup` directly from `@base-ui/react` for the mention-autocomplete component specifically, bypassing the generated wrapper. This mirrors the existing precedent in this codebase of noting base-ui version-specific gaps (`02-CONTEXT.md`'s "no Radix `asChild` support" note) rather than assuming the generated wrapper does everything.
**Warning signs:** The autocomplete dropdown appears in the same place regardless of where `@` was typed in the textarea.

### Pitfall 4: Running real Gemini API calls inside the Vitest test suite
**What goes wrong:** Every existing test in `tests/**/*.test.ts` hits a real Postgres test database directly (via `tests/helpers/db.ts`) — this is the established integration-test convention in this repo. Applying the same "hit the real backend" convention to Gemini calls would incur real API cost on every test run and make CI flaky on rate limits/network.
**Why it happens:** Following existing test conventions literally without noticing Gemini is an external paid vendor, unlike Postgres (self-hosted/free for tests).
**How to avoid:** Structure `lib/ai/gemini.ts`'s client as an injectable dependency (accept a `GoogleGenAI`-shaped client or a thin interface as a parameter) so unit tests can pass a mock that returns canned `usageMetadata`/`finishReason` values for cost-estimation and cap-calculation logic. Reserve at most one opt-in, env-flag-gated live-API smoke test, not part of the default `npm test` run.
**Warning signs:** A test file that imports `GoogleGenAI` directly and calls `generateContent` without any mock/stub layer.

## Code Examples

### Assembling the generation prompt with mentioned KB docs
```typescript
// Illustrative composition — no official source, follows this repo's existing
// lib/{domain}/actions.ts convention (see lib/kb/actions.ts, lib/chapters/actions.ts)
async function assemblePrompt(supabase: SupabaseClient, {
  ownerId, mentionedNodeIds, precedingText, baselinePrompt, presetInstruction, styleDescription,
}: AssemblePromptInput) {
  const { data: mentionedDocs } = await supabase
    .from('kb_nodes')
    .select('id, name, category, content')
    .eq('owner_id', ownerId)
    .in('id', mentionedNodeIds)
    .is('deleted_at', null);
  // Per 02-CONTEXT.md D-13: wiki-link [[ ]] syntax inside mentionedDocs content
  // is inert plain text — do NOT resolve it before injecting.
  const kbContext = (mentionedDocs ?? [])
    .map((doc) => `### [${doc.category}] ${doc.name}\n${doc.content ?? ''}`)
    .join('\n\n');
  return {
    systemInstruction: [baselinePrompt, styleDescription, presetInstruction].join('\n\n'),
    contents: `${kbContext}\n\n---\n이전 본문:\n${precedingText}`,
  };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-------------------|---------------|--------|
| `@google/generative-ai` (`GoogleGenerativeAI` class, `getGenerativeModel()`) | `@google/genai` (`GoogleGenAI` class, `ai.models.generateContent()`) | `@google/generative-ai` is frozen at 0.24.1 and does not support current-generation Gemini models/features going forward | Any training-data-era code sample using `GoogleGenerativeAI`/`getGenerativeModel` is stale — do not follow it |

**Deprecated/outdated:**
- `@google/generative-ai`: superseded by `@google/genai`, which unifies the Gemini Developer API and Vertex AI under one client and one code path.
- Gemini 2.5 Flash-Lite: confirmed (via WebFetch of official pricing docs, 2026-08-30) scheduled for retirement 2026-10-16, replaced by Gemini 3.1 Flash-Lite as the cheapest tier going forward — relevant only if the "라이트" tier is mapped to a Flash-Lite model rather than plain `gemini-2.5-flash`.

## Open Questions

1. **What is the wallet-token ↔ Gemini-token conversion rate for D-13's cap calculation and the actual post-call debit?**
   - What we know: The wallet's "토큰" is a purchased platform currency (10/30/50/100 fixed price tiers for chapter unlocks, per Phase 2's `PRICE_TIERS`); Gemini bills in USD per million tokens (e.g., ~$0.30/$2.50 input/output per 1M tokens for `gemini-2.5-flash`, ~$1.25/$10.00 for `gemini-2.5-pro`, per official pricing docs fetched 2026-08-30); no prior phase or doc fixes an exchange rate between the two.
   - What's unclear: Whether the planner should (a) treat wallet-토큰 and LLM tokens as 1:1 for v1 simplicity (simplest, but decouples "cost" from any real economics and could make `PRICE_TIERS`-scale balances (10-100) absurdly small caps for generation), or (b) define a real formula tying Gemini's $/token cost to an assumed KRW-per-wallet-token rate (more correct, but that KRW rate itself isn't fixed until Phase 5's actual Toss integration).
   - Recommendation: Pick option (b) but treat the KRW-per-wallet-token constant as an explicitly named, easily-changed config value (not hardcoded inline) — e.g. `lib/ai/cost.ts` exports `WALLET_TOKENS_PER_MODEL_TOKEN: Record<ModelTier, number>` computed once from Gemini's published $/token price and a placeholder `KRW_PER_WALLET_TOKEN` constant, with a comment flagging it for revisit once Phase 5 fixes the real rate. This keeps D-12's on-screen number (raw LLM tokens, per D-12's explicit "no KRW conversion" instruction) completely separate from the internal wallet-debit math, which is the correct separation per D-12 vs D-13's different units of discourse.

2. **Does the wallet get debited for input tokens (`promptTokenCount`), output tokens (`candidatesTokenCount`), or both?**
   - What we know: `usageMetadata` on the `generateContent` response exposes all three (`promptTokenCount`, `candidatesTokenCount`, `totalTokenCount`).
   - What's unclear: CONTEXT.md's D-13 language ("잔여 토큰까지만 생성") focuses entirely on output/generation length, suggesting only output is charged — but the mentioned-KB-doc injection (input) is also a real Gemini cost the platform pays.
   - Recommendation: Charge `totalTokenCount` (input + output) against the wallet for full cost coverage, but keep the pre-call `maxOutputTokens` cap calculation based on the *output*-only budget remaining after accounting for the (already-known, from `countTokens`) input cost — i.e., `maxOutputTokens = walletTokensRemaining_in_geminiUnits - inputTokenEstimate`. This is a planner-level decision to confirm; flagged here rather than resolved unilaterally since it's a business-economics call.

3. **Exact model IDs for the "라이트"/"프로" tiers.**
   - What we know: `gemini-2.5-flash` and `gemini-2.5-pro` are current, stable, non-deprecated GA models as of this research (still listed in official rate-limit docs, no deprecation notice found); a newer `gemini-3.x` generation also exists but at higher price points and with some models still in `-preview` status.
   - What's unclear: Whether the founder wants the newest generation (higher quality, higher cost) or the proven-stable 2.5 generation for v1 cost predictability.
   - Recommendation: Start with `gemini-2.5-flash` (라이트) and `gemini-2.5-pro` (프로) — both GA, well-documented, and avoids depending on `-preview` model IDs that could change/retire without the same stability guarantees. This is explicitly flagged as Claude's Discretion in CONTEXT.md, so this recommendation can be adopted directly by the planner.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| `GEMINI_API_KEY` env var | All Gemini calls (EDIT-04/EDIT-05) | ✗ (not found in repo — no `.env*` file checked into git per standard practice; must be confirmed with the founder/ops before implementation) | — | None — this blocks any live Gemini call. Implementation and tests must be structured so cost-estimation/cap-math logic is unit-testable without a real key (see Pitfall 4), but the actual `generateContent`/`countTokens` calls cannot function without one. |
| `@google/genai` npm package | EDIT-04/EDIT-05 | ✗ (not yet installed) | latest: 2.19.0 | None needed — trivial `npm install` |
| Node.js runtime version (for `@google/genai` v3+) | SDK compatibility | Not checked this session | — | If Node < 22, pin `@google/genai` to `^2.x` (confirmed still receiving updates); do not blindly install `latest` if it resolves to a 3.x major that requires Node 22 |

**Missing dependencies with no fallback:**
- `GEMINI_API_KEY` — must be obtained/confirmed before this phase's Gemini-calling code can be exercised end-to-end (unit tests with a mocked client can proceed without it).

**Missing dependencies with fallback:**
- None beyond the above — all other new dependencies (`@google/genai`, `textarea-caret`, shadcn `popover`/`command`) are simple installs with no environment prerequisite.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.11 |
| Config file | `vitest.config.ts` (repo root) — `environment: 'node'`, `include: ['tests/**/*.test.ts']`, `passWithNoTests: true` |
| Quick run command | `npx vitest run tests/ai` (once created) |
| Full suite command | `npm test` (= `vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| EDIT-01 | Mention search returns KB docs by name/type, quick-add creates a new node | unit/integration (real Postgres, following existing `tests/kb/*.test.ts` pattern) | `npx vitest run tests/ai/mention-search.test.ts` | ❌ Wave 0 |
| EDIT-02 | Mentioned-doc list state (add/remove) resolves to correct KB doc content at generate-time | unit | `npx vitest run tests/ai/mention-context.test.ts` | ❌ Wave 0 |
| EDIT-03 | Preset selection produces the correct composed system instruction (초보자/중급자/자유형 + 문체 프리셋 + baseline) | unit (pure function, no live API) | `npx vitest run tests/ai/prompt-composition.test.ts` | ❌ Wave 0 |
| EDIT-04 | `generateAction` calls Gemini with correct params, debits wallet with actual (not estimated) usage, handles `finishReason: MAX_TOKENS` | unit with a mocked `GoogleGenAI`-shaped client (per Pitfall 4) + real Postgres for the wallet debit assertion (following `tests/wallet/ledger.concurrency.test.ts`'s `apply_wallet_delta` precedent) | `npx vitest run tests/ai/generate-action.test.ts` | ❌ Wave 0 |
| EDIT-05 | `countTokens`-based estimate reflects mentioned-doc content changes; cap-from-balance math is correct | unit, mocked `countTokens` response + pure function for the wallet-to-Gemini-token conversion (Open Question 1) | `npx vitest run tests/ai/cost-estimate.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/ai/<relevant-file>.test.ts`
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/ai/` directory does not exist yet — needs creation following the existing `tests/<domain>/*.test.ts` convention.
- [ ] A mockable Gemini client interface in `lib/ai/gemini.ts` (dependency-injection point) must exist before `generate-action.test.ts` and `cost-estimate.test.ts` can be written without hitting the live API — this is itself an implementation task, not just a test-infra gap, and should be an early task in the plan.
- [ ] Framework install: none — Vitest is already configured project-wide; no new test framework needed.

## Sources

### Primary (HIGH confidence)
- `npm view @google/genai version` / `npm view @google/generative-ai version` / `npm view textarea-caret version` / `npm view @types/textarea-caret version` — registry-verified versions, 2026-08-30
- `node_modules/@base-ui/react/popover/positioner/PopoverPositioner.d.ts` and `node_modules/@base-ui/react/docs/react/components/popover.md` (installed package source, this repo) — verified `anchor` prop type accepts a `VirtualElement`
- `supabase/migrations/0001_init.sql` and `tests/wallet/ledger.concurrency.test.ts` (this repo) — `apply_wallet_delta` RPC behavior (row-locked, idempotent, raises `insufficient balance` on negative result) confirmed by reading the actual function body and its concurrency test suite
- `lib/kb/actions.ts`, `lib/works/genres.ts`, `lib/kb/templates.ts` (this repo) — exact KB query shape, `GENRES` list, `KB_CATEGORIES` enum
- WebFetch of `https://ai.google.dev/gemini-api/docs/generate-content/tokens` — confirmed `countTokens` is input-only, does not estimate output
- WebFetch of `https://raw.githubusercontent.com/googleapis/js-genai/main/README.md` — confirmed `GoogleGenAI` client init and `generateContent` call shape

### Secondary (MEDIUM confidence)
- WebFetch of `https://ai.google.dev/gemini-api/docs/pricing` and `https://ai.google.dev/gemini-api/docs/models` — current model lineup and pricing (Gemini 2.5 and 3.x generations); dated to this session (2026-08-30), subject to Google's frequent pricing/model updates
- WebSearch cross-referencing `usageMetadata` field names (`promptTokenCount`/`candidatesTokenCount`/`totalTokenCount`) and `finishReason: MAX_TOKENS` — consistent across multiple Google Cloud doc pages found, but not fetched from a single canonical page directly
- WebFetch of `https://ai.google.dev/gemini-api/docs/rate-limits` — confirmed `gemini-2.5-flash` still referenced (not on a deprecation list), but exact RPM/TPM numbers require an authenticated AI Studio dashboard view, not available to this research pass

### Tertiary (LOW confidence)
- Exact retirement date for Gemini 2.5 Flash-Lite (2026-10-16) and precise 3.x-generation pricing figures — sourced from WebSearch result summaries of third-party pricing-tracking blogs, not Google's own pricing page directly (the official pricing page fetch corroborated the general shape but not every exact date); treat specific dates/prices as needing a final verification pass at implementation time, since Gemini pricing changes are frequent.

## Metadata

**Confidence breakdown:**
- Standard stack (SDK choice, caret library): HIGH — verified against live npm registry and installed package source, not training-data recall.
- Architecture patterns (Server Action lifecycle, prompt composition, caret-popover): MEDIUM-HIGH — Gemini SDK shape verified via official docs/README; the wallet-conversion formula is a genuine open design gap, not something research could resolve unilaterally (flagged in Open Questions instead of asserted).
- Pitfalls: MEDIUM-HIGH — grounded in this repo's actual code (wallet RPC, test conventions) plus well-established Gemini API behavior (countTokens input-only, finishReason semantics).
- Model pricing/lineup specifics: MEDIUM — corroborated by an official-docs WebFetch but Gemini pricing/models change frequently; re-verify immediately before implementation if this research goes stale.

**Research date:** 2026-08-30
**Valid until:** ~2026-09-13 (14 days) — shorter than the default 30-day window because Gemini model lineup/pricing is confirmed to be changing on a roughly monthly cadence as of this research (2.5 Flash-Lite's scheduled October retirement, 3.x generation still partially in preview).
