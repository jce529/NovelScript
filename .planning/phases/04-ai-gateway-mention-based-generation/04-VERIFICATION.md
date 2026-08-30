---
phase: 04-ai-gateway-mention-based-generation
verified: 2026-08-30T16:40:00Z
status: human_needed
score: 5/5 must-haves architecturally verified (live Gemini round-trip pending human test)
human_verification:
  - test: "Live Gemini generation round-trip with a real GEMINI_API_KEY"
    expected: "Clicking 생성하기 with mentions/preset/style/genre selected produces a real, non-mock generated Korean prose preview (not '(mock) 생성된 본문') within GenerationPreview, matching the composed system instruction/context."
    why_human: "The full test suite only exercises generate()/estimateCost() against createMockGeminiClient() (Pitfall 4 — no test may make a real billable call). GEMINI_API_KEY is intentionally left blank in .env.local by the user's own choice."
  - test: "Live token-cost estimate accuracy"
    expected: "The '예상 토큰' value shown in AiPanel updates ~500ms after changing model tier/genre/preset/style/mentions, and reflects Gemini's real countTokens response for the actual composed prompt (not the mock's fixed 10)."
    why_human: "Requires a live countTokens API call; only the mock path (fixed totalTokens) is exercised in the automated suite."
  - test: "Wallet debit against a real balance after a real Gemini call"
    expected: "After a live generation completes, the wallet balance decreases by computeDebitAmount()'s value computed from the REAL response.usageMetadata (promptTokenCount/candidatesTokenCount), and a ledger_entries row is created with reference_type='ai_generation'."
    why_human: "The debit math and apply_wallet_delta RPC call are unit-tested against a mocked GeminiClient's fixed usage numbers; the real SDK's usageMetadata shape/values have not been exercised end-to-end."
  - test: "Low-balance / balance-exhausted banner with a real generation call"
    expected: "With a near-zero or zero wallet balance, clicking 생성하기 either (a) shows the '보유 토큰을 모두 사용해서 생성할 수 없어요' error with no Gemini call made (balance already 0), or (b) completes a real but token-capped generation and GenerationPreview shows the '토큰이 모두 소진됐어요 / 남은 토큰 범위까지만 생성됐어요.' banner."
    why_human: "computeMaxOutputTokens' D-13 cap-before-call math is fully unit-tested (0 / 2048 / 89 cases), but the actual Gemini API respecting maxOutputTokens and returning finishReason: 'MAX_TOKENS' on a real call has not been observed live."
  - test: "Regeneration with free-text feedback against a real Gemini call"
    expected: "Typing feedback (e.g. '더 짧게') in GenerationPreview's free-text row and pressing Enter produces a NEW real generation whose content is visibly influenced by the feedback, replacing the old preview."
    why_human: "composeSystemInstruction's additive-feedback folding is unit-tested (string containment only); whether Gemini actually honors the folded-in instruction is a live-call/model-quality question, not a code-correctness question."
---

# Phase 4: AI Gateway (Mention-Based Generation) Verification Report

**Phase Goal:** Writers can generate AI-assisted prose from mention-injected KB context, with cost visibility and spend guardrails built in from the start (not bolted on later).
**Verified:** 2026-08-30T16:40:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Context Note on This Verification

Per explicit instruction accompanying this verification request: `GEMINI_API_KEY` in `.env.local` is intentionally blank (user's own deliberate choice, not ready to test live generation yet). This means the live Gemini API round-trip (real generation call, real token usage against a real wallet balance, low-balance banner under real conditions) has **not** been exercised end-to-end — only against a mocked `GeminiClient` in unit tests, plus a live browser check (done by the orchestrator during Plan 04-06's checkpoint) confirming the mention-autocomplete/quick-add UI (EDIT-01/EDIT-02) works correctly and that `generateAction` fails gracefully (HTTP 200, error payload, no crash, no uncaught console errors) when the key is absent. This is treated as a **deliberate, user-directed deferral**, not a gap, and is reported under `human_verification` rather than `gaps`.

## Goal Achievement

### Observable Truths (ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Writer can insert `@`-mention references to KB documents via autocomplete UI searching by name/type | ✓ VERIFIED | `lib/ai/mentions.ts searchMentionNodes` (work-scoped `ilike` search, excludes `template` category, tested 6/6 in `tests/ai/mention-search.test.ts`); `MentionAutocomplete.tsx` composes `@base-ui/react/popover` directly with `textarea-caret` virtual-anchor positioning, calls `searchMentionsAction`. **Live-verified by orchestrator in Plan 04-06's checkpoint**: popover follows caret, filters by name, shows category. |
| 2 | Writer can see a visible list of currently-mentioned/in-context documents before generating | ✓ VERIFIED | `AiPanel.tsx` renders a "멘션된 문서" chip list from `mentionedNodes` prop with per-chip remove (`X` button); empty-state copy "`@` 를 입력해 KB 문서를 멘션해보세요." **Live-verified**: quick-added "인물" document appeared as a chip immediately. |
| 3 | Writer can select 1 of 3 tone presets (초보자/중급자/자유형), with 자유형 offering a custom-instruction textarea | ✓ VERIFIED | `lib/ai/prompt.ts composeSystemInstruction` — baseline guardrail always present regardless of preset (tested), freeform uses typed text verbatim or falls back safely to intermediate text when empty (tested); `AiPanel.tsx` gear-dropdown (`Settings2` icon, `aria-label="AI 지시 프리셋 설정"`) with 3 `DropdownMenuRadioItem`s, conditional `<Textarea>` shown only when `presetLevel === 'freeform'`. 10/10 tests pass in `tests/ai/prompt-composition.test.ts`. |
| 4 | Writer can trigger AI generation sending mentioned KB docs + preset + instruction to Gemini and inserting the result into canvas, with per-request AND per-user spend caps enforced before the call fires | ✓ VERIFIED (mocked) / ? LIVE UNTESTED | `lib/ai/generate.ts generate()`: reads wallet balance via `createAdminClient()`, computes `maxOutputTokens = computeMaxOutputTokens({walletBalance, modelTier, inputTokenCount})` (per-user cap = remaining balance, per-request cap = `PER_REQUEST_MAX_OUTPUT_TOKENS=2048`) **before** calling `client.generateContent`; short-circuits with no API call when `maxOutputTokens <= 0`. `page.tsx insertTextAtCursor` splices text at live `selectionStart`/`selectionEnd`. 4/4 tests pass in `tests/ai/generate-action.test.ts` (debit-uses-actual-usage, hard-stop-at-zero, partial-cap-at-89). Live Gemini round-trip + live cursor-insert-after-real-call: **not yet exercised** (see Human Verification). |
| 5 | Writer sees a token/cost estimate before generating | ✓ VERIFIED (mocked) / ? LIVE UNTESTED | `estimateCost()` calls `client.countTokens()` with no wallet I/O, tested (`tests/ai/generate-action.test.ts` estimateCost suite). `AiPanel.tsx` debounces (500ms) a call to `estimateCostAction` on every relevant dependency change (model/genre/preset/style/mentions/content) and renders "예상 토큰". Live accuracy against a real Gemini `countTokens` response: **not yet exercised**. |

**Score:** 5/5 truths architecturally verified; 2/5 (Truths 4, 5) have an unexercised live-API leg, explicitly deferred by the user.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/ai/gemini.ts` | GeminiClient interface + real/mock factories + MODEL_TIER_TO_ID | ✓ VERIFIED | Exports match plan exactly; 4/4 tests pass; `createGeminiClient` throws with `'GEMINI_API_KEY'` in message when unset |
| `lib/ai/cost.ts` | Wallet↔Gemini conversion + D-13 cap/debit math | ✓ VERIFIED | 7/7 tests pass; exact numeric cases (0, 2048, 89, debit=1) confirmed |
| `lib/ai/mentions.ts` | searchMentionNodes, getMentionedNodesContent, resolveCategoryFolderId, quickAddMentionNode | ✓ VERIFIED | 9/9 tests pass across mention-search + mention-context suites |
| `lib/ai/prompt.ts` | BASELINE_SYSTEM_PROMPT, STYLE_PRESETS, PRESET_INSTRUCTIONS, composeSystemInstruction, assembleUserContent | ✓ VERIFIED | 10/10 tests pass |
| `lib/ai/generate.ts` | estimateCost() + generate() full lifecycle | ✓ VERIFIED | 4/4 tests pass against real wallet/ledger schema with mocked GeminiClient |
| `app/studio/[workId]/chapters/[chapterId]/actions.ts` | searchMentionsAction, quickAddMentionAction, estimateCostAction, generateAction, getChapterAction (+genre) | ✓ VERIFIED | All 5 exports present, confirmed via direct file read; auth-guarded; `getGeminiClientOrError()` wraps `createGeminiClient()` in try/catch so a missing key never crashes a Server Action |
| `ai-panel/AiPanel.tsx` | Header controls, chip list, cost estimate, generate button, preview integration | ✓ VERIFIED + WIRED | Imports and calls `estimateCostAction`/`generateAction` from `'../actions'`; renders `<GenerationPreview>` on result |
| `ai-panel/GenerationPreview.tsx` | D-10rev permission-prompt card | ✓ VERIFIED | Exact copy strings confirmed in plan/summary; accent reserved for option 1 only |
| `ai-panel/MentionAutocomplete.tsx` | Caret-anchored search overlay + quick-add fallback | ✓ VERIFIED + WIRED | Imports `Popover` from `'@base-ui/react/popover'` directly (not the generated wrapper, per Pitfall 3); calls `searchMentionsAction`; **live-verified in browser** |
| `ai-panel/QuickAddDialog.tsx` | D-04 quick-add dialog | ✓ VERIFIED + WIRED | Calls `quickAddMentionAction`; **live-verified in browser** (created a real KB doc, added chip) |
| `app/studio/[workId]/chapters/[chapterId]/page.tsx` | Textarea + AiPanel side-by-side, mention state, cursor insertion, work genre | ✓ VERIFIED + WIRED | `insertTextAtCursor` reads `textarea.selectionStart/selectionEnd` at call time (live browser confirmed page renders both columns side-by-side) |
| `lib/kb/categories.ts` | fs-free KbCategory/KB_CATEGORIES extraction | ✓ VERIFIED | Zero-import module confirmed by direct read; fixes a real Turbopack fs-into-client-bundle bug found and fixed during Plan 04-06's live checkpoint (commit `e32a26b`) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `lib/ai/cost.ts computeMaxOutputTokens` | `lib/ai/generate.ts generate()` | Called before `client.generateContent` | ✓ WIRED | Confirmed line 94 → line 100 ordering in `lib/ai/generate.ts` |
| `actions.ts searchMentionsAction` | `lib/ai/mentions.ts searchMentionNodes` | `'use server'` wrapper, ownerId from session | ✓ WIRED | Confirmed direct file read |
| `actions.ts quickAddMentionAction` | `lib/ai/mentions.ts quickAddMentionNode` → `lib/kb/actions.ts createNode` | Reuses Phase 2's createNode | ✓ WIRED | Confirmed |
| `lib/ai/generate.ts generate()` | `apply_wallet_delta` RPC via `createAdminClient()` | Service-role client, not session client (RLS gap fix) | ✓ WIRED | Confirmed lines 76, 78, 108 all use `admin`, never the `supabase` session param, for wallet I/O |
| `actions.ts generateAction` | `lib/ai/generate.ts generate()` | `'use server'` wrapper, ownerId from session | ✓ WIRED | Confirmed |
| `ai-panel/AiPanel.tsx` | `actions.ts estimateCostAction, generateAction` | Debounced useEffect + button onClick | ✓ WIRED | Confirmed via grep + `npm test`/`tsc` passing |
| `ai-panel/AiPanel.tsx` | `ai-panel/GenerationPreview.tsx` | Renders on result, `onAccept → props.onInsertText(text)` | ✓ WIRED | Confirmed |
| `ai-panel/MentionAutocomplete.tsx` | `actions.ts searchMentionsAction` | Direct call on query change | ✓ WIRED | Confirmed + live-verified |
| `page.tsx` | `ai-panel/AiPanel.tsx onInsertText` | `insertTextAtCursor` reads live cursor position | ✓ WIRED | Confirmed |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `AiPanel.tsx` mention chips | `mentionedNodes` prop | Lifted state in `page.tsx`, populated by `MentionAutocomplete`'s `onMention` → real `searchMentionsAction`/`quickAddMentionAction` DB calls | Yes (live-verified: real KB doc created and appeared) | ✓ FLOWING |
| `AiPanel.tsx` cost estimate | `estimatedTokens` | `estimateCostAction` → `estimateCost()` → `client.countTokens()` | Yes for the code path; **real Gemini API values untested** (mock-only in automated tests) | ⚠️ STATIC (mock-verified only) pending live key |
| `MentionAutocomplete.tsx` search results | `results` | `searchMentionsAction` → real `kb_nodes` table query | Yes, live-verified | ✓ FLOWING |
| `GenerationPreview.tsx` generated text | `preview.text` | `generateAction` → `generate()` → `client.generateContent()` | Code path real; **real Gemini text untested** (mock returns fixed `'(mock) 생성된 본문'` in tests) | ⚠️ STATIC (mock-verified only) pending live key |

Note: the ⚠️ STATIC classifications above are not code defects — the *code path* is fully real and correctly wired (no hardcoded fallback masking a broken connection); the caveat is purely that the upstream Gemini SDK has never been invoked with a real key in this environment, per the user's deliberate deferral.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| AI-specific test suite passes in isolation | `npx vitest run tests/ai/` | 6 files, 34/34 tests passed | ✓ PASS |
| Full suite passes (Phase 4 + all prior) | `npm test` | 148/155 passed; 7 failures all in `tests/discovery/feed.test.ts` (Phase 3, pre-existing/flaky, documented in `deferred-items.md`, unrelated to any Phase 4 file) | ✓ PASS (Phase 4 scope) |
| Type-check clean | `npx tsc --noEmit` | No output (clean) | ✓ PASS |
| All 15 phase commits exist in history | `git log --oneline --all \| grep <hashes>` | All 15 commits found (9250a8f, 7689f03, bec8dd9, f407a3d, 4072027, 70acbc2, 4497a64, 5bad12d, cd8c52e, 3ffa8e9, 18b7fdc, 1b36bdc, d8efa2b, 538189b, 2cb6086, 92e9e0f, e32a26b) | ✓ PASS |
| Live Gemini generation | N/A — requires real API key | Not run (server returns graceful error, confirmed by orchestrator's live click test: HTTP 200, error payload, no crash) | ? SKIP (deferred to human_verification) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| EDIT-01 | 04-02, 04-06 | Writer can insert `@`-mention references via autocomplete search by name/type | ✓ SATISFIED | `searchMentionNodes` + `MentionAutocomplete.tsx`, live-verified in browser |
| EDIT-02 | 04-02, 04-05 | Writer can see visible list of currently-mentioned/in-context documents before generating | ✓ SATISFIED | `getMentionedNodesContent` + AiPanel chip list, live-verified |
| EDIT-03 | 04-03, 04-05 | Writer can select 1 of 3 tone presets, freeform offers custom-instruction textarea | ✓ SATISFIED | `composeSystemInstruction` + AiPanel gear dropdown, 10/10 tests |
| EDIT-04 | 04-04, 04-05, 04-06 | Writer can trigger generation sending mentioned docs+preset+instruction to Gemini, inserts result into canvas | ✓ SATISFIED (architecture) / ? NEEDS HUMAN (live call) | `generate()` fully implemented + tested against mock; live round-trip pending real API key |
| EDIT-05 | 04-01, 04-04, 04-05 | Writer sees token/cost estimate before generating | ✓ SATISFIED (architecture) / ? NEEDS HUMAN (live accuracy) | `estimateCost()` implemented + tested against mock; live accuracy pending real API key |

No orphaned requirements — all 5 REQUIREMENTS.md-mapped IDs (EDIT-01 through EDIT-05) appear in at least one plan's `requirements` frontmatter, and REQUIREMENTS.md's Phase 4 mapping table lists exactly these same 5 IDs with no extras.

### Anti-Patterns Found

None. Scanned `lib/ai/*.ts`, all `ai-panel/*.tsx` files, and `app/studio/[workId]/chapters/[chapterId]/actions.ts` for TODO/FIXME/PLACEHOLDER/"not yet implemented"/empty-handler/hardcoded-empty patterns — no matches. `getGeminiClientOrError()` is a deliberate, tested graceful-degradation wrapper, not a stub. `Known Stubs` sections in all 6 SUMMARY.md files self-report "None" and this was independently confirmed by direct file reads (not just trusted from summaries).

### Human Verification Required

See YAML frontmatter `human_verification` list above (5 items). All five require a real `GEMINI_API_KEY` to be supplied in `.env.local`. This is a deliberate, user-directed deferral — the writer explicitly chose not to test live generation yet — not a defect or an incomplete implementation. Once a key is supplied:
1. Restart `npm run dev`.
2. Run through Plan 04-06's `<how-to-verify>` steps 5–9 (already executed for steps 1–4 by the orchestrator's live browser checkpoint).
3. Re-run this verification (or simply confirm the 5 items above) to close out EDIT-04/EDIT-05's live-call leg.

### Gaps Summary

No code gaps found. Every artifact this phase's 6 plans committed to exists, is substantive (not a stub), and is wired end-to-end — confirmed by direct file reads (not summary claims alone), by the full automated test suite (34/34 AI-specific tests, 148/155 full suite with the 7 failures isolated to an unrelated, pre-existing Phase 3 flaky test file), by a clean `tsc --noEmit`, and by a live browser checkpoint that exercised the mention-search/quick-add loop (EDIT-01/EDIT-02) against a real database and confirmed `generateAction` degrades gracefully (no crash) with no API key set.

The only unresolved item is the live Gemini API round-trip itself (EDIT-04/EDIT-05's "does the real model actually produce good, correctly-capped, correctly-billed output" question) — this cannot be verified without a real `GEMINI_API_KEY`, which the user has intentionally left unset. This phase should be treated as **architecturally complete and passed pending a short human/live-key verification pass**, not as having outstanding implementation gaps.

---

*Verified: 2026-08-30T16:40:00Z*
*Verifier: Claude (gsd-verifier)*
