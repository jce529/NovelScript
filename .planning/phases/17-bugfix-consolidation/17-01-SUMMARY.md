---
phase: 17-bugfix-consolidation
plan: "01"
subsystem: lint-baseline
tags: [eslint, baseline, bugfix]
requirements: [BUGFIX-05]
key-files:
  created:
    - .planning/phases/17-bugfix-consolidation/17-BASELINE.md
  modified:
    - components/world-tree/era-board.tsx
    - tests/ai/wallet-refresh.test.ts
    - tests/helpers/toss.ts
    - tests/payments/payment-flow.integration.test.ts
    - tests/studio/chapter-editor-state.test.ts
    - tests/studio/kb-editor-state.test.ts
metrics:
  completed: 2026-10-23
---

# Phase 17 Plan 01: lint 경고 정리와 기준선 재측정 Summary

소유 ESLint 경고 8건을 제거하고(AiPanel 1건은 17-04), unit/tsc/eslint 기준선을 환경 문제·해결됨·잔여 결함으로 분류해 17-BASELINE.md에 기록했다.

## Tasks
1. 기준선 분류 - 선행 커밋 4c518c6 반영 확인(재구현 없음), 17-BASELINE.md 작성.
2. 경고 수정 - `d357b2f`. era-board의 `typeof draft.placements`를 `TimelineDraft['placements']`로 교체, 나머지 미사용 인자 제거(toss fetch mock은 제네릭으로 시그니처 유지). 원인 phase(18, 05) bugs/ 이력과 `.planning/fixed/18-01`, `05-01` 기록 추가.

## Verification
- 소유 파일 `eslint --max-warnings=0` 통과. 전체 eslint 경고는 AiPanel 1건만 남음.
- 관련 테스트 22 파일 207건 통과. tsc는 `.next/types` 부재로 인한 `LayoutProps` 1건만(환경).
- unit 전체: 4 파일 7건 실패 - 0022 번호 중복(잔여 결함), 나머지는 병렬 plan의 미커밋 변경 영향 의심.

## Deviations from Plan
- 에이전트 스킬(bug-plan/execute/complete)을 별도로 호출하지 않고 동일 산출물(bugs/ 문서, fixed/ 기록)을 직접 작성했다. bugs/ 문서는 이관 후에도 상태 표기로 남겼다.
- [Rule 1] 미사용 인자 제거로 생긴 `webhook-credit.test.ts` 타입 오류를 toss mock 제네릭으로 해결.

## Open issues
- migration 0022 번호 중복(`numbering.test.ts`), DB 잠금 트리거 7건은 후속 plan.
- unit 잔여 실패는 17-02/03 완료 후 재측정 필요.

## Self-Check: PASSED
