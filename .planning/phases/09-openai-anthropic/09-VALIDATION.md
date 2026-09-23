---
phase: 9
slug: openai-anthropic
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-22
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (`vitest.config.ts` present) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/ai/provider-openai.test.ts` / `npx vitest run tests/ai/provider-anthropic.test.ts` |
| **Full suite command** | `npm test` (`vitest run`) |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <touched-test-file>`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green, plus the two manual live-API checks below recorded as human verification items
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 9-W0-01 | 00 | 0 | PROV-02 | unit | `npx vitest run tests/ai/provider-openai.test.ts` | ❌ W0 | ⬜ pending |
| 9-W0-02 | 00 | 0 | PROV-03 | unit | `npx vitest run tests/ai/provider-anthropic.test.ts` | ❌ W0 | ⬜ pending |
| 9-01-01 | 01 | 1 | PROV-02 | unit | `npx vitest run tests/ai/provider-openai.test.ts` | ❌ W0 | ⬜ pending |
| 9-01-02 | 01 | 1 | PROV-02 | unit | `npx vitest run tests/ai/provider-openai.test.ts` (refusal shapes) | ❌ W0 | ⬜ pending |
| 9-02-01 | 02 | 1 | PROV-03 | unit | `npx vitest run tests/ai/provider-anthropic.test.ts` | ❌ W0 | ⬜ pending |
| 9-02-02 | 02 | 1 | PROV-03 | unit | `npx vitest run tests/ai/provider-anthropic.test.ts` (temperature not forwarded) | ❌ W0 | ⬜ pending |
| 9-03-01 | 03 | 2 | PROV-04 | unit/integration | `npx vitest run tests/ai/chat-action.test.ts` | ✅ exists, extend | ⬜ pending |
| 9-03-02 | 03 | 2 | PROV-04 | integration | `npx vitest run tests/ai/chat-action.test.ts` or new `tests/ai/provider-override.test.ts` | ❌ W0 (new assertions) | ⬜ pending |
| 9-04-01 | 04 | 2 | PROV-07 | unit | `npx vitest run tests/ai/cost-estimate.test.ts` | ✅ exists, extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/ai/provider-openai.test.ts` — covers PROV-02 (mapping + refusal normalization), modeled on `tests/ai/provider-gemini.test.ts`
- [ ] `tests/ai/provider-anthropic.test.ts` — covers PROV-03 (mapping + refusal normalization + temperature-not-forwarded assertion), modeled on the same pattern
- [ ] `lib/ai/providers/catalog.ts` fixture data — a small, deterministic `PROVIDER_MODELS`-shaped constant so provider/model validation tests don't depend on the real, possibly-changing catalog table

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| A deliberate refusal-triggering prompt against real OpenAI and Anthropic platform keys produces the shared Korean refusal copy, not raw vendor text | PROV-02, PROV-03 | Requires live API keys and real vendor moderation behavior | Send a known-refusal prompt through the AI panel with each provider selected; confirm the UI shows the shared Korean refusal message, not raw vendor error text |
| OpenAI/Anthropic rate-limit/org-verification tier confirmed reachable for the exact catalog models chosen | PROV-02, PROV-03 | Requires dashboard/account access, not inspectable from code | Check OpenAI org verification status and Anthropic billing tier; confirm chosen models (e.g. `gpt-4o-mini`) are reachable without extra gating |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
