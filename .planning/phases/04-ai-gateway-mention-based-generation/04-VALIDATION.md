---
phase: 4
slug: ai-gateway-mention-based-generation
status: draft
nyquist_compliant: false
wave_0_complete: false
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

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-XX | TBD | 0 | infra | unit | `tests/ai/` dir + mockable `lib/ai/gemini.ts` client created | ❌ W0 | ⬜ pending |
| 04-XX-XX | TBD | TBD | EDIT-01 | unit/integration (real Postgres) | `npx vitest run tests/ai/mention-search.test.ts` | ❌ W0 | ⬜ pending |
| 04-XX-XX | TBD | TBD | EDIT-02 | unit | `npx vitest run tests/ai/mention-context.test.ts` | ❌ W0 | ⬜ pending |
| 04-XX-XX | TBD | TBD | EDIT-03 | unit (pure function, no live API) | `npx vitest run tests/ai/prompt-composition.test.ts` | ❌ W0 | ⬜ pending |
| 04-XX-XX | TBD | TBD | EDIT-04 | unit, mocked `GoogleGenAI`-shaped client + real Postgres wallet debit assertion | `npx vitest run tests/ai/generate-action.test.ts` | ❌ W0 | ⬜ pending |
| 04-XX-XX | TBD | TBD | EDIT-05 | unit, mocked `countTokens` + pure conversion function | `npx vitest run tests/ai/cost-estimate.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Plan/Wave/Task IDs are TBD — the planner fills these in once plans are created; the requirement→test mapping above is fixed by research.*

---

## Wave 0 Requirements

- [ ] `tests/ai/` directory — create following the existing `tests/<domain>/*.test.ts` convention (e.g. `tests/kb/*.test.ts`, `tests/wallet/*.test.ts`)
- [ ] `lib/ai/gemini.ts` — mockable Gemini client interface (dependency-injection point); required before `generate-action.test.ts` and `cost-estimate.test.ts` can be written without hitting the live API. This is an implementation task, not just test scaffolding, and should be an early task in the plan.
- [ ] Framework install: none — Vitest is already configured project-wide; no new test framework needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Caret-anchored mention popover renders and follows text caret correctly in the browser | EDIT-01 | Visual positioning (caret coordinates, popover placement) cannot be reliably asserted by an automated unit test | Open the editor, type `@`, confirm popover appears anchored near the caret and updates position as text is typed/scrolled |
| End-to-end generation flow (mention → preset → generate → inserted text in canvas) | EDIT-04, EDIT-05 | Requires live Gemini API call and visual confirmation of canvas insertion | Mention a KB doc, pick a tone preset, click generate, confirm cost estimate shown before call and generated text appears in canvas after |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
