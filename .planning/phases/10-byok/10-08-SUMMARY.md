---
phase: 10-byok
plan: "08"
subsystem: ai-providers-ui
tags: [byok, model-picker, service-availability, settings]
requires: [10-07]
provides: [ModelPicker, useServiceAvailability, disabled service defaults in settings]
affects: [04-10 AiPanel wiring, 10-10 checkpoint]
key-files:
  created:
    - components/ai/model-picker.tsx
    - lib/ai/providers/use-service-availability.ts
    - tests/ai/model-picker.test.ts
  modified:
    - app/studio/settings/ai-providers/page.tsx
    - app/studio/settings/ai-providers/actions.ts
    - tests/ai/byok-settings-ui.test.ts
    - tests/ai/byok-settings-actions.test.ts
requirements: [PROV-05]
metrics:
  completed: 2026-10-19
---

# Phase 10 Plan 08: ModelPicker, availability hook, settings disable Summary

ModelPicker with fail-closed service availability hook, plus settings page disabled service options and server-side re-check in saveDefaultAction.

## Commits
- bb266ac: ModelPicker, useServiceAvailability, model-picker tests (Task 1)
- 83c4a26: settings page disabled options/notice, saveDefaultAction availability re-check, tests (Task 2; also hook mount-loading refinement)

## Contracts
- `useServiceAvailability()` returns `{availability, status, reload, canUseSelection}`; service is false until ready/on error, BYOK passes.
- `ModelPicker({choices, value, onSelection, loading?, loadFailed?})` id `ai-model-select`; callback ignored for disabled/unknown values.
- `saveDefaultAction` rejects service selections (including legacy 2-part) without a key via `?error=1`; BYOK saves unchanged.

## Verification
6 unit files (84 tests) pass: byok-settings-ui, byok-settings-actions, provider-settings, model-picker, provider-selection, model-availability-action. eslint clean on changed files. No live-DB suites run.

## Deviations
None of substance. Hook split into `load`/`reload` to avoid redundant setState on mount.

## Gaps
- Phase 4 (04-10) AiPanel wiring (hook, buildModelChoices availability, ModelPicker swap, canUseSelection on send/retry) is still pending; prerequisite for 10-10 checkpoint.
- SSR markup tests are not keyboard/focus evidence; covered in 10-10.
- graphify update and graph-link-requirements not run (per instruction); STATE/ROADMAP not edited.

## Self-Check: PASSED
