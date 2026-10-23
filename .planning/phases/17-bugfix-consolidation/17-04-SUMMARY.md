---
phase: 17-bugfix-consolidation
plan: "04"
subsystem: ai-panel
tags: [retry, idempotency, byok, bugfix]
requires: [17-02]
provides: [BUGFIX-04 retry selection policy]
affects: [AiPanel, chat-request, 11-UI-SPEC]
tech-stack:
  patterns: [pure policy function + frozen attempt re-issue]
key-files:
  modified:
    - app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanel.tsx
    - lib/ai/chat-request.ts
    - tests/ai/ai-panel-model.test.ts
    - tests/ai/chat-request-lifecycle.test.ts
    - .planning/phases/11-byok-ux/11-UI-SPEC.md
    - .planning/phases/16-studio-workflow-upload/bugs/README.md
  created:
    - .planning/phases/16-studio-workflow-upload/bugs/BUG-02-retry-selection.md
decisions:
  - "선택 변경 + rate_limited/credit_exhausted/unavailable/config일 때만 현재 선택과 새 멱등 키로 재시도. settlement/unknown/generation_in_progress, 응답 유실(throw)은 기존 snapshot·키 유지 + 안내 토스트."
metrics:
  tasks: 2
  completed: 2026-10-23
requirements: [BUGFIX-04, BUGFIX-05]
---

# Phase 17 Plan 04: 재시도 모델 선택 정책 Summary

"다시 시도"가 정산 전 확정 실패 4종에서만 변경된 모델 선택을 새 멱등 키로 전송하고, 차감이 모호한 실패는 기존 키·선택을 유지한다.

## Commits
- 005b9b5 feat(17-04): 정책 순수 함수(`canRetryWithNewSelection`, `isSameSelection`, `createReselectedAttempt`), lifecycle 테스트, BUG-02 문서·README 행
- fb09a0c fix(17-04): AiPanel `handleRetry` 정책 적용(`failedKindRef`), 안내 토스트 `RETRY_KEEPS_FROZEN_MESSAGE`, 11-UI-SPEC 문구 교정, 미사용 eslint-disable 제거

## Verification
- `vitest --project unit tests/ai/chat-request-lifecycle.test.ts tests/ai/ai-panel-model.test.ts`: 77 passed
- `eslint AiPanel.tsx chat-request.ts --max-warnings=0`: 통과 (경고 제거)
- `tsc --noEmit`: `app/layout.tsx` `LayoutProps` 오류 1건만 (이번 변경과 무관, 기존)

## Deviations from Plan
- 기존 테스트 "retry checks the frozen attempt selection"은 `unavailable` 실패를 썼는데 새 정책에서는 선택 변경 시 새 선택을 보내므로, 모호 실패(`settlement`)로 바꿔 frozen 계약을 계속 검증했다.
- Phase 11 충돌 사전 점검: 활성 충돌 없음(타 worktree/브랜치에 AiPanel.tsx·11-UI-SPEC.md 미커밋 변경 없음). `check-stalled-plan-phases` 브랜치(2026-10-01, 정지된 Phase 11 라인)는 두 파일에 미병합 커밋이 있으나 현재 HEAD보다 오래된 상태라 편집을 막지 않음.
- bug-complete는 실기기 확인이 남아 `fixed-pending-device-check`로 두었다(`.planning/fixed/` 이동 안 함).

## Known Stubs
None.

## Self-Check: PASSED
