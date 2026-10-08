---
phase: 11-byok-ux
plan: 03
subsystem: api
tags: [byok, provider-routing, supabase, vitest, typescript]

requires:
  - phase: 11-byok-ux
    provides: Provider failure classification and ai_usage RPC groundwork from plans 11-01 and 11-02
provides:
  - Explicit-key provider factory and server-derived service/BYOK/replacement routes
  - Conditional invalid-key transition keyed by expected BYOK key id
  - Route, stale-key, and sanitized RPC-failure unit coverage
affects: [paid-generation, byok-generation, phase-11]

tech-stack:
  added: []
  patterns: [server-derived trusted route union, expected-key-id conditional transition]

key-files:
  created: [.planning/phases/11-byok-ux/11-03-SUMMARY.md, tests/ai/byok-generation.test.ts]
  modified: [lib/ai/providers/registry.ts, lib/ai/providers/byok.ts, tests/ai/byok-generation.test.ts]

key-decisions:
  - "Runtime invalid-key handling uses mark_byok_failed with owner, provider, and expected key id; stale results are safe no-ops."
  - "No SQL change was made, as directed; the expected migration file was absent from this checkout."

patterns-established:
  - "Provider setup accepts an explicit key and keeps platform environment key resolution in createPlatformProvider."
  - "Conditional BYOK status RPC errors are contained and never replace the generation failure result."

requirements-completed: [PROV-06, BYOK-05, BYOK-06, BYOK-09]

duration: 5min
completed: 2026-10-08
---

# Phase 11 Plan 03: Trusted BYOK Generation Routing Summary

**Server-derived BYOK routing builds a provider only for the currently connected matching key, while invalid-key status updates target the expected key id.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-10-08T00:19:00Z (approx.)
- **Completed:** 2026-10-08T00:24:57Z
- **Tasks:** 2
- **Files modified:** 3 plan source/test files, plus this summary

## Accomplishments

- Task 1 implementation was already present in the working tree: an explicit-key provider factory and trusted route resolver verify owner key status and model membership, decrypt only after checks, and return a replacement route when unavailable.
- Completed Task 2 coverage for the expected-key-id conditional RPC, stale no-op results, and RPC error/rejection containment.
- Targeted generation and BYOK action suites passed: 2 files, 22 tests.

## Task Commits

No commits were created. The orchestrator handles task commits, as directed.

## Files Created/Modified

- `lib/ai/providers/registry.ts` - Shared explicit-key construction for the supported provider adapters; platform key resolution delegates to it.
- `lib/ai/providers/byok.ts` - Server-derived generation routing and `markByokFailed` conditional RPC wrapper.
- `tests/ai/byok-generation.test.ts` - Route, key-id, stale result, secret non-leak, and RPC failure coverage.
- `.planning/phases/11-byok-ux/11-03-SUMMARY.md` - Execution record and self-check.

## Decisions Made

- Kept conditional status update errors fail-closed as `false`, with no raw database detail surfaced.
- Did not modify SQL, `STATE.md`, or `ROADMAP.md`.

## Deviations from Plan

Task 1 was already implemented when execution resumed, so it was reviewed and verified rather than reimplemented. Task 2 extended its existing `markByokFailed` test with RPC error and rejection cases.

**Total deviations:** 1 execution adjustment (pre-existing Task 1 output)
**Impact on plan:** No out-of-scope files were changed.

## Issues Encountered

- The requested `supabase/migrations/0018_ai_usage.sql` is absent from this checkout. The migration directory contains `0017_author_settlement.sql` followed by `0019_reader_atomic_toggle.sql`, and a repository search found no `mark_byok_failed` SQL definition. Per the instruction to avoid SQL changes, no migration was created or edited.
- `npx.cmd tsc --noEmit` failed. One diagnostic is `lib/ai/paid-generation.ts:189`, where the `invalid_key` provider error kind is not handled by the `ChatFailureKind`/copy map. Three additional diagnostics come from pre-existing untracked `tests/payments/*` files importing missing payment routes. These files are outside this plan's allowed scope and were not changed.
- The initial PowerShell `npx` invocation was blocked by execution policy; rerunning via `npx.cmd` worked.

## Next Phase Readiness

The targeted plan tests pass. The orchestrator should reconcile the missing migration claim with this checkout and coordinate the `invalid_key` type error in `paid-generation.ts` with the plan that owns that file before accepting the required TypeScript gate.

## Self-Check: PASSED (전이 tsc 오류 제외)

- **Files:** Plan source files and this summary exist; Task 1 source changes and Task 2 test update are within `files_modified`.
- **Tests:** `npx.cmd vitest run tests/ai/byok-generation.test.ts tests/ai/byok-actions.test.ts --no-file-parallelism` passed (2 files, 22 tests).
- **TypeScript:** `npx.cmd tsc --noEmit` failed with the diagnostics listed under Issues Encountered.
- **Scope:** No files outside the plan's allowed scope were modified. Existing `tests/payments/*` untracked files and `supabase/.temp/` were left untouched.

---
*Phase: 11-byok-ux*
*Completed: 2026-10-08*

## 오케스트레이터 메모 (2026-10-08)

- 위 "0018_ai_usage.sql이 체크아웃에 없음" 보고는 작업 폴더가 UAT 브랜치로 바뀐 사이 생긴 오보다. master worktree(`../NovelScript-p11`)에서 `mark_byok_failed`(0018, 원격 적용 완료)를 확인했고 22개 테스트 통과. 남은 tsc 오류는 `paid-generation.ts` `invalid_key` 매핑(11-04·06 해소 예정)뿐이다.
- Phase 11은 UAT 작업과 분리하기 위해 별도 worktree에서 진행한다.
