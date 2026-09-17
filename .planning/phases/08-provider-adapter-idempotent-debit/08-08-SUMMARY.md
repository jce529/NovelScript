---
phase: 08-provider-adapter-idempotent-debit
plan: 08
subsystem: ai-provider
tags: [fixture, dev-only, provider, idempotency, verification]
requires:
  - phase: 08-02
    provides: createPlatformProvider registry
  - phase: 08-05
    provides: chatAction with idempotencyKey validation
provides:
  - Dev-only AI_PROVIDER_FIXTURE canned provider (refusal-input, refusal-output, rate_limited, unavailable, config, slow, drop-response)
  - drop-response hook in chatAction (throws once per key after completed debit)
affects: [08-09]
tech-stack:
  added: []
  patterns: ["NODE_ENV === 'development' hard gate for test fixtures read from env"]
key-files:
  created:
    - lib/ai/providers/fixture.ts
    - tests/ai/provider-fixture.test.ts
  modified:
    - lib/ai/providers/registry.ts
    - app/studio/[workId]/chapters/[chapterId]/actions.ts
    - .env.example
key-decisions:
  - "Fixture gate is strict equality NODE_ENV === 'development'; test/production/undefined all ignore AI_PROVIDER_FIXTURE"
  - "drop-response dropped-key set is module-level in-memory (per server process), sufficient for a single next dev session"
metrics:
  duration: ~5min
  completed: 2026-09-17
---

# Phase 8 Plan 08: Dev-only Provider Fixture Summary

Deterministic `AI_PROVIDER_FIXTURE` canned Gemini-shaped provider, strictly gated to `NODE_ENV=development`, plus a chatAction drop-response hook that loses the response once per idempotencyKey after the real debit so retry hits already_processed.

## Tasks

| Task | Name | Commits |
| ---- | ---- | ------- |
| 1 | Dev-only fixture provider + registry/action hooks (TDD) | 24d9dca (RED test), 6ac02ce (GREEN feat) |

## Verification

- `npx vitest run tests/ai/provider-fixture.test.ts tests/ai/chat-action.test.ts tests/ai/provider-gemini.test.ts` — 66/66 passed
- `npx tsc --noEmit` — no errors in fixture/registry/actions
- All acceptance greps match (gate=1, registry hook=1, drop-response=1, production cases=2, .env.example entry present)
- `graphify update .` run (graphify-out not committed per parallel-execution rules)

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None. Canned text in fixture.ts is intentional dev-only output, unreachable outside development.

## Self-Check: PASSED

- FOUND: lib/ai/providers/fixture.ts
- FOUND: tests/ai/provider-fixture.test.ts
- FOUND: 24d9dca
- FOUND: 6ac02ce
