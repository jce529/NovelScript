# Phase 4: AI Gateway (Mention-Based Generation) - Context

**Gathered:** 2026-08-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Writers select an AI model tier, a tone preset, and a genre, mention (`@`) KB documents to inject as context, see a token-cost estimate, and trigger AI generation against Gemini — with a per-user spend cap enforced before the call fires. The result is previewed, not auto-inserted; the writer accepts or rejects it into the chapter canvas. No 3-panel full canvas, no ghost-text, no BYOK/multi-vendor selection, no real-time cost gauge — those remain out of v1 scope per REQUIREMENTS.md.

</domain>

<decisions>
## Implementation Decisions

### AI Panel Layout & Mention Interaction
- **D-01:** The AI panel is a fixed right-side panel next to the existing chapter body editor (`app/studio/[workId]/chapters/[chapterId]/page.tsx`) — always visible while writing, not a toggle or bottom sheet.
- **D-02:** Typing `@` in the plain-textarea chapter editor opens an autocomplete dropdown as an overlay positioned near the caret (not a separate search box inside the panel) — matches the docs/5-2 vision's in-editor mention experience without breaking the writing flow.
- **D-03:** Mentioned documents display in the AI panel as a chip list (`[주인공 ✕]` style), individually removable — removing a chip excludes that document from the next generation's injected context.
- **D-04:** SCOPE EXPANSION (explicit founder decision, this session): a "퀵애드" (quick-add) flow is in scope for Phase 4 — typing a proper-noun not found in the mention dropdown offers an inline "새 문서 만들기" action that creates the KB document on the spot (lightweight overlay, no navigation away from the editor) and immediately mentions it. This goes beyond REQUIREMENTS.md EDIT-01's literal "autocomplete search" wording; see `<specifics>` for the REQUIREMENTS.md note.

### Model Tier, Tone Preset & Genre Controls
- **D-05:** SCOPE EXPANSION (explicit founder decision, this session): the AI panel header carries three controls in a single row — an AI **model tier** selector (left), the tone **preset** selector (center), and a **genre** selector (right). All three are dropdown/select controls, not button groups.
- **D-06:** The model-tier selector chooses among Gemini-family model tiers only (e.g. a faster/cheaper tier vs. a higher-quality/costlier tier) — this stays inside PROJECT.md's "단일 벤더, 플랫폼 키" constraint (Google Gemini only, BYOK/multi-vendor is v2). It is NOT a multi-vendor picker.
- **D-07:** The genre selector defaults to the work's own genre (already set at work-creation time per `02-CONTEXT.md` D-04, single-select from the fixed genre list) but can be overridden per-generation — e.g. trying a romance-flavored scene inside a fantasy work. Reuses the same fixed genre list as D-04, does not introduce a new list.
- **D-08:** Tone preset (초보자/중급자/자유형) is a dropdown select, not a button group.
- **D-09:** When 자유형 is selected, its custom-instruction textarea expands inline directly below the preset row — it does not open a separate modal or move the panel layout.

### Generation, Insertion & Regeneration
- **D-10:** AI output is never auto-inserted into the chapter canvas. Generation renders as a preview inside the AI panel first; the writer explicitly accepts (inserts at cursor) or rejects (discards) it.
- **D-11 (Claude's Discretion — user had no preference):** Whether regeneration (re-running the same mention set + preset against a fresh Gemini call) is offered is left to Claude/planner judgment. Recommendation: allow it, since each regeneration is naturally a new billable request under the same EDIT-05 cost-estimate flow already required — no separate mechanism needed.

### Cost Estimate & Spend Guardrail
- **D-12:** The pre-generation cost estimate shows a token count only (e.g. "약 1,200 토큰") — no KRW/currency conversion, no color-gradient gauge (the gauge is already out of v1 scope per REQUIREMENTS.md's Out of Scope table).
- **D-13:** When a requested generation would exceed the writer's remaining per-user spend cap, the system does **not** block the call outright and does **not** just warn-and-allow. Instead: the call is capped so generation produces output only up to the writer's remaining token balance, then stops and explicitly notifies the writer that their balance is exhausted. This is the concrete mechanism behind ROADMAP.md Phase 4 success criterion #4's "spend caps enforced ... before the call fires" — the cap is applied to the call's max-output-length up front, not a pure allow/deny gate.

### Baseline System Prompt (applies under every preset, in addition to preset-specific instructions)
- **D-14:** Every generation call carries a baseline system prompt (independent of which of the 3 presets is active) that must include:
  1. Content-policy guardrails (matches ADMIN's eventual manual-review posture — since Phase 7's moderation is manual/reactive, not automated pre-screening, the generation-time guardrail is the only proactive safety layer in v1).
  2. An instruction to maintain stylistic continuity with the writer's immediately preceding canvas text (not to abruptly shift voice/tense).
  3. An instruction not to contradict the mentioned KB documents' established facts (character traits, established events, etc.).

### Claude's Discretion
- Exact model-tier names/count and how each tier's pricing feeds the EDIT-05 cost estimate.
- Quick-add (D-04) overlay's exact fields and validation.
- Preview/accept-reject (D-10) exact UI — inline diff vs. plain preview block.
- Regeneration UX details if implemented per D-11.
- Exact wording of the D-14 baseline system prompt.
- Concrete per-request and per-user spend cap numeric values (token counts) — technical/business tuning, not raised with the user this session.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements / Scope
- `.planning/REQUIREMENTS.md` — EDIT-01 through EDIT-05 (this phase's literal v1 requirements); v2 section already defers EDIT-06 (wiki-linking), EDIT-07 (beginner prompt chips), EDIT-08 (ghost-text); Out of Scope table already excludes the 3-panel canvas, dedicated system-prompt modal, KB graph view, drag-and-drop file tree movement, and the real-time color-gradient cost gauge / relational-locality weighting.
- `.planning/ROADMAP.md` Phase 4 section — goal, depends-on (Phase 1, Phase 2), 5 success criteria including the "spend caps enforced ... before the call fires" wording D-13 directly answers.
- **REQUIREMENTS.md note (not yet amended this session):** D-04 (quick-add) and D-05/D-06/D-07 (model-tier + genre selector row) go beyond EDIT-01/EDIT-04's literal wording, following the same "founder decision, this session" pattern used in `02-CONTEXT.md` D-10 and `03-CONTEXT.md`'s READ-07/08/09 additions. Planner or a follow-up session should decide whether these warrant new REQUIREMENTS.md line items or stay folded into EDIT-01/EDIT-04 as implementation detail — flagged here rather than resolved, since the user was not asked this specific question.

### Full-Vision Background Docs (reference only — most content is out of Phase 4 scope)
- `docs/2. 핵심 기능 요구사항.md` §2.2 (다중 멘션 기반 다이내믹 컨텍스트 주입) — origin of D-01/D-02/D-03's mention+chip mechanics; §2.3 (실시간 비용/토큰 모니터링 데시보드) — origin of the token-gauge concept, but the gauge itself is out of scope (D-12 uses text-only). §2.4 (비동기 자동 필터링) and §2.5 (듀얼 과금 및 BYOK) are explicitly OUT of Phase 4 scope — do not implement.
- `docs/5-2 집필 공간 UI,UX 설계 및 명세.md` §2 (웹 에디터 3단 분할 캔버스), specifically §2B (멘션 자동완성, 퀵 애드, 고스트 텍스트) and §2C (AI 코워커 패널 — 프리셋 드롭다운, 시스템 프롬프트 설정 모달, 컨텍스트 칩, 토큰/비용 게이지 바). The 3-panel layout itself and the ghost-text/dedicated-modal/gauge pieces are OUT of scope; the mention-autocomplete mechanic (D-02), quick-add (D-04), context chips (D-03), and preset-selector concept (D-08) are the IN-scope pieces this doc informed.

### Prior Phase Dependencies
- `.planning/phases/02-studio-core-writer-loop-no-ai/02-CONTEXT.md` — D-04 (work genre is a single-select fixed list, set at work creation) which D-07's genre-override control reuses; D-19 (chapter editor is deliberately a plain textarea specifically because "Phase 4 adds an AI panel alongside this same editor" — this phase is that AI panel); D-13 (wiki-link syntax is inert plain text in mentioned KB doc content — do not attempt to resolve `[[ ]]` links when injecting KB doc content into the Gemini prompt).
- `.planning/phases/01-foundation-wallet-infrastructure/01-CONTEXT.md` and `supabase/migrations/0001_init.sql` — the `apply_wallet_delta` RPC (row-locked, idempotent via `reference_type`/`reference_id` unique constraint) is the existing atomic wallet-deduction primitive D-13's spend-cap enforcement should build on, not reimplement.
- `.planning/PROJECT.md` Key Decisions table — Gemini as the sole confirmed AI vendor; execution via Antigravity CLI (`agy`) rather than the standard GSD executor (affects how Phase 4's plans get implemented, not what gets built).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `components/ui/*` — shadcn components already installed as of Phase 3: `select` (model-tier/preset/genre dropdowns, D-05/D-06/D-07/D-08), `sheet` (Phase 3's TOC/settings sheets — a similar sheet pattern could work for quick-add's D-04 overlay if a full modal feels heavy), `dialog`, `textarea` (자유형 custom instruction, D-09), `badge` (chip styling for D-03's context chips), `tooltip`, `scroll-area`, `sonner` (toast for D-13's "balance exhausted" notification).
- `app/studio/[workId]/chapters/[chapterId]/page.tsx` — the exact plain-`<Textarea>` chapter editor (see `components/ui/textarea.tsx`) that D-01's AI panel will sit beside; uses `useTransition` + Server Actions (`getChapterAction`, `saveChapterContentAction`) as the established mutation pattern to follow for any new AI-panel actions.
- `lib/kb/actions.ts` — KB document CRUD/query functions from Phase 2; D-02's mention autocomplete and D-04's quick-add both need to read from (and quick-add needs to write to) this existing module rather than duplicating KB logic.
- `supabase/migrations/0001_init.sql` `apply_wallet_delta(p_wallet_id, p_delta, p_reference_type, p_reference_id, p_reason)` — atomic, row-locked, idempotent wallet delta function. D-13's spend-cap deduction should call this, using a fresh `reference_type`/`reference_id` per generation call to guarantee no double-charge on retry.

### Established Patterns
- Server Actions + `lib/{domain}/actions.ts` module convention, consistent across Phases 1-3.
- Ownership/ RLS guard pattern (established Phase 2 KB/chapters, reused Phase 3 reader tables) — any new Phase 4 tables (e.g. a generation-request log, if planner decides one is needed for the reference_id/idempotency scheme) should follow the same owner-scoped RLS convention.
- base-ui `Select`/`Tooltip` use a render-prop, not `asChild` (Next.js/base-ui version note from `02-CONTEXT.md`) — applies directly to D-05/D-06/D-07/D-08's three dropdown controls.

### Integration Points
- The AI panel (D-01) integrates into the existing chapter editor page, not a new route.
- Wallet balance read (for the D-12 cost estimate and D-13 cap check) reads from Phase 1's `wallets` table; the deduction writes through `apply_wallet_delta`.
- Genre selector (D-07) reads the work's genre from Phase 2's `works` table (D-04's fixed genre list) as its default value.

</code_context>

<specifics>
## Specific Ideas

- The user explicitly requested two additional controls beyond REQUIREMENTS.md's literal wording, specified with exact placement: "일단 프리셋의 왼쪽에 어떤 AI모델을 사용할지 정하는 버튼 ... 오른�게에 어떤 장르의 소설을 쓸 것인지(판타지, 로맨스, 현대 등 그리고 사용자 지정) 이렇게 두 가지 버튼을 추가하고 싶어" — confirmed as: model-tier selector (Gemini-family only, not multi-vendor) and a genre override selector defaulting to the work's genre. Both are dropdown selects in the same row as the tone preset.
- On spend-cap overage, the user's own words: "잔여 토큰까지만 생성. 이후 토큰이 전부 소모됐더고 알리고 작업 중단." — a specific three-part behavior (generate partial output up to remaining balance → notify balance is exhausted → stop), captured verbatim as D-13. This is a distinct third option beyond simple block-before-call or warn-and-allow.
- For the baseline system prompt (D-14), the user selected multiple items in one multi-select answer rather than a single choice: content-policy guardrails, style continuity with preceding text, and non-contradiction with mentioned KB docs — all three apply together, not as alternatives.

</specifics>

<deferred>
## Deferred Ideas

- Multi-vendor/BYOK AI provider selection — already v2 per REQUIREMENTS.md; D-06 explicitly confirms the new model-tier control stays inside the single-Gemini-vendor constraint rather than reopening this.
- 3-panel full canvas layout, ghost-text (Tab-to-accept), dedicated system-prompt modal, KB graph view, real-time color-gradient cost gauge, beginner-tier recommended-prompt chips — all already excluded from v1 per REQUIREMENTS.md's Out of Scope / v2 tables; not reopened this session.
- Whether D-04 (quick-add) and D-05-D-07 (model tier + genre controls) need their own REQUIREMENTS.md line items (new EDIT-* IDs) versus staying folded into EDIT-01/EDIT-04 — noted in `<canonical_refs>` as an open flag for planner/next session, not resolved here.

### Reviewed Todos (not folded)
None — no pending todos matched this phase (`todo match-phase 4` returned 0 matches).

</deferred>

---

*Phase: 04-ai-gateway-mention-based-generation*
*Context gathered: 2026-08-30*
