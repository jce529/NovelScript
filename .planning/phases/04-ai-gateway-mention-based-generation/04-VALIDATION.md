---
phase: 4
slug: ai-gateway-mention-based-generation
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-30
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.11 |
| **Config file** | `vitest.config.ts` (repo root) — `environment: 'node'`, `include: ['tests/**/*.test.ts']`, `passWithNoTests: true` |
| **Quick run command** | `npx vitest run tests/ai` (once created) |
| **Full suite command** | `npm test` (= `vitest run`) |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/ai/<relevant-file>.test.ts`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Plan | Wave | Requirement(s) | Test Type | Automated Command | File Exists | Status |
|------|------|-----------------|-----------|-------------------|-------------|--------|
| 04-01 | 1 | EDIT-05 (+ infra: mockable Gemini client, wallet↔Gemini token conversion) | unit | `npx vitest run tests/ai/gemini-client.test.ts tests/ai/cost-estimate.test.ts` | ✅ | ✅ planned |
| 04-02 | 1 | EDIT-01, EDIT-02 | unit/integration (real Postgres) | `npx vitest run tests/ai/mentions.test.ts` | ✅ | ✅ planned |
| 04-03 | 1 | EDIT-03 | unit (pure function, TDD) | `npx vitest run tests/ai/prompt.test.ts` | ✅ | ✅ planned |
| 04-04 | 2 | EDIT-04, EDIT-05 | unit, mocked `GoogleGenAI`-shaped client + real Postgres wallet debit assertion (via `createAdminClient()`), TDD | `npx vitest run tests/ai/generate.test.ts` | ✅ | ✅ planned |
| 04-05 | 3 | EDIT-02, EDIT-03, EDIT-04, EDIT-05 | component/unit (AiPanel + GenerationPreview) | `npx vitest run tests/ai/ai-panel.test.tsx` | ✅ | ✅ planned |
| 04-06 | 4 | EDIT-01, EDIT-04 | component/unit + manual checkpoint | `npx vitest run tests/ai/mention-autocomplete.test.tsx` | ✅ | ✅ planned |

*Status: ⬜ pending · ✅ planned/green · ❌ red · ⚠️ flaky — flips to ✅ green per plan as execute-phase completes each wave.*

---

## Wave 0 Requirements

Folded into Plan 04-01 (Wave 1) rather than a separate Wave 0, since the mockable client and conversion formula are themselves phase-goal-bearing implementation work, not pure scaffolding:

- [x] `tests/ai/` directory — created by Plan 04-01, following the existing `tests/<domain>/*.test.ts` convention (e.g. `tests/kb/*.test.ts`, `tests/wallet/*.test.ts`)
- [x] `lib/ai/gemini.ts` — mockable Gemini client interface (dependency-injection point), created in Plan 04-01 Task 1
- [x] Wallet-token ↔ Gemini-token conversion formula (`lib/ai/cost.ts`, Plan 04-01 Task 3) — resolves RESEARCH.md Open Question 1 with named constants (`KRW_PER_WALLET_TOKEN`, `USD_TO_KRW`, `GEMINI_PRICING_USD_PER_MILLION`)
- [x] Framework install: none — Vitest already configured project-wide; no new test framework needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Caret-anchored mention popover renders and follows text caret correctly in the browser | EDIT-01 | Visual positioning (caret coordinates, popover placement) cannot be reliably asserted by an automated unit test | Open the editor, type `@`, confirm popover appears anchored near the caret and updates position as text is typed/scrolled |
| End-to-end generation flow (mention → preset → generate → inserted text in canvas) | EDIT-04, EDIT-05 | Requires live Gemini API call and visual confirmation of canvas insertion | Mention a KB doc, pick a tone preset, click generate, confirm cost estimate shown before call and generated text appears in canvas after |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (folded into Plan 04-01)
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-08-30 (via gsd-plan-checker verification, 0 blockers)
