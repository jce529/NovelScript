---
phase: 10-byok
plan: "09"
subsystem: ai-providers
tags: [byok, service-key, fixture, bug-03, gap-closure, verification-docs]
requirements: [PROV-05]
requires: [10-07, 10-08]
provides:
  - tests/ai/service-key-route.test.ts (실제 resolveGenerationRoute -> createPlatformProvider 경계 테스트)
  - PROV-05 확정 문구, 10-UI-SPEC Reopen 보완 절, 10-VALIDATION 매핑, 10-VERIFICATION human_needed
key-files:
  created: [tests/ai/service-key-route.test.ts]
  modified:
    - .planning/REQUIREMENTS.md
    - .planning/phases/10-byok/10-UI-SPEC.md
    - .planning/phases/10-byok/10-VALIDATION.md
    - .planning/phases/10-byok/10-VERIFICATION.md
decisions:
  - "Phase 10 verification status를 passed에서 human_needed로 바꾸고 과거 passed는 historical_status로 보존한다."
metrics:
  completed: 2026-10-19
  tasks: 2
---

# Phase 10 Plan 09: 호출 경계 검증과 PROV-05 문구 확정 Summary

실제 registry(mock 없음, SDK factory와 fixture factory만 spy)를 통해 키 없는 service 선택이 fixture off/on/slow 모두에서 API_KEY_MISSING으로 거부됨을 통합 테스트로 고정하고, PROV-05 문구와 Phase 10 검증 문서를 Reopen 결정에 맞췄다.

## Commits

| Task | Commit |
|------|--------|
| 1 service-key-route 통합 테스트 | edb2a32 |
| 2 PROV-05 문구·UI-SPEC·VALIDATION·VERIFICATION | d642049 |

## Task 1

- 3사 x (fixture 없음 / development+slow / development+off) 빈 키 -> `info.kind=config`, `API_KEY_MISSING`. fixture/SDK/BYOK secret RPC 모두 호출되지 않음.
- 실제 키가 있는 development fixture는 고정 응답 경로(`createFixtureProvider('slow')`), SDK 미생성. 키 있고 fixture 없으면 service errorContext로 SDK 생성.
- 키 없는 service 거부 후에도 `createProviderWithApiKey(byok)`는 정상. sentinel 키는 오류/로그에 없음.
- TDD: 10-07 구현이 이미 가드를 가지고 있어 새 테스트는 처음부터 GREEN(기존 GREEN 회귀로 기록). 테스트 초안의 단언 형태(`info` 중첩)만 수정했다.
- 결과: `npx vitest run --project unit` service-key-route, service-availability, model-picker, byok-generation, byok-settings-ui, byok-settings-actions, provider-settings = 7 files / 100 tests 통과.

## Task 2

PROV-05 본문만 최소 패치(체크박스 `[ ]` 유지, rg -Fx 일치 확인). UI-SPEC에 Reopen 보완 절, VALIDATION에 07~10 매핑, VERIFICATION에 현재 증거 표와 `status: human_needed`.

## Deviations from Plan

None - plan executed as written.

## Gaps / 잔여

- `npx tsc --noEmit`: 이 plan 파일 관련 오류 없음. 다른 plan의 진행 중 변경으로 보이는 오류 2건(`lib/admin/queries.ts` ReportGroupSummary.statuses, `tests/world-tree/eligibility.test.ts` 모듈 없음)이 있어 통과로 기록하지 않는다. 계획서가 언급한 app/layout.tsx LayoutProps 오류는 이번 출력에 나타나지 않았다.
- `npm run lint`는 전체를 돌리지 않고 새 테스트 파일만 eslint 실행(오류 없음).
- 전체 `npm test`, 실DB(byok-db), 브라우저 UAT 10/11, AiPanel 연결(04-10)은 미실행 -> 10-10.
- 후속 항목: REQUIREMENTS 문구 개정 후 별도 소유자가 `/traceability-sync`로 REQUIREMENTS/ROADMAP/STATE/SSOT/그래프를 정합시킬 것. 이 plan에서는 실행하지 않았다.
- STATE/ROADMAP/graphify는 지시대로 건드리지 않았다.

## Self-Check: PASSED
