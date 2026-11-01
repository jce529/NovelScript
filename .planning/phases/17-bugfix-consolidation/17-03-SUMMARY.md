---
phase: 17-bugfix-consolidation
plan: "03"
subsystem: ai
tags: [bugfix, output-cap, observability, regenerate]
requires: []
provides:
  - "서비스 키 요청당 출력 상한 4096 (BYOK 8192 유지)"
  - "일반 생성 공통 관측 로그 [ai] generation observed"
  - "재생성 max_tokens의 truncated 무과금 거부"
affects: [17-06]
tech-stack:
  added: []
  patterns: ["GenerationRejectedError 사유 분리(structure/truncated)"]
key-files:
  modified:
    - lib/ai/cost.ts
    - lib/ai/paid-generation.ts
    - lib/ai/document-regenerate.ts
    - tests/ai/capped-reason.test.ts
    - tests/ai/capped-ux.test.ts
    - tests/ai/cost-estimate.test.ts
    - tests/ai/paid-generation.test.ts
    - tests/ai/regenerate-document.test.ts
    - tests/ai/document-plan-generation.test.ts
    - .planning/phases/08-provider-adapter-idempotent-debit/bugs/BUG-04-thinking-tokens-not-debited.md
    - .planning/phases/15-jev-ai/bugs/BUG-07-regenerate-truncated-output-rejected.md
key-decisions:
  - "PER_REQUEST_MAX_OUTPUT_TOKENS 2048 -> 4096 (사용자 확정, BYOK 8192 미만)"
  - "BUG-07 편입: max_tokens를 구조 검증 전에 truncated로 거부"
requirements-completed: [BUGFIX-01, BUGFIX-02]
completed: 2026-10-23
---

# Phase 17 Plan 03: 출력 상한 4096과 잘림 사유 분리 Summary

서비스 키 출력 상한을 4096으로 올리고, 일반 생성 공통 경로에 본문·키 없는 관측 로그를 추가했으며, 재생성의 `max_tokens` 응답을 `structure`와 구분된 `truncated` 무과금 거부로 바꿨다.

## Tasks

| Task | Commit | 내용 |
|---|---|---|
| 1 | ceacfef | `PER_REQUEST_MAX_OUTPUT_TOKENS` 4096, 상한 고정 테스트 갱신, BUG-04 단계 A-2 기록 |
| 2 | 008b584 | `[ai] generation observed` 로그, `REGENERATION_TRUNCATED` 거부, 테스트, BUG-07 문서 갱신 |

## Verification

- `vitest run --project unit` 대상 4개(capped-reason, capped-ux, cost-estimate, paid-generation): 91 통과.
- `tests/ai/paid-generation`, `regenerate-document`, `document-plan-generation`: 101 통과.
- ESLint(소유 파일): 오류 없음.
- `tsc --noEmit`: 이 plan과 무관한 `app/layout.tsx` `LayoutProps` 한 건만 남음(생성 타입 미존재, 기존 문제).
- `tests/ai` 전체: `provider-fixture.test.ts` 2건 실패(chatAction drop-response 훅). 이 plan이 건드리지 않은 영역이며 이 plan의 변경과 무관해 보이나 기준선 비교는 하지 않았다.

## Deviations from Plan

**1. [Rule 1 - 회귀] document-plan-generation 테스트 갱신**
- 상한 변경으로 `tests/ai/document-plan-generation.test.ts`의 `maxOutputTokens: 2048` 고정값이 request_limit 판정을 깨뜨림. 4096으로 갱신(Task 2 커밋에 포함). 계획의 files에는 없던 파일.

**2. 계획 경로 보정:** 환경에 `node_modules`가 워크트리에 없어 상위(메인 저장소) `node_modules/.bin`의 vitest/tsc/eslint를 직접 호출했다. 설치는 하지 않았다. Next 코드를 작성하지 않아 `node_modules/next/dist/docs`는 읽지 않았다(수정 대상이 `lib/ai` 순수 서버 로직뿐).

## Pending (사람 확인 필요, 수행하지 않음)

- 실키로 재생성 5회 이상 성공/실패 비율과 4096 상향 효과 확인: 17-06 수동 관측 항목.
- 이 때문에 BUG-04(단계 A)와 BUG-07의 `bug-complete`(fixed 이동)는 하지 않았다. 두 문서에 구현 완료·실키 검증 대기로 기록했다.
- 단계 B(사고/본문 몫 분리)는 범위 밖이며 그때 4096은 재조정 대상이다.

## Known Stubs

없음.

## Self-Check: PASSED

커밋 ceacfef, 008b584 존재, 수정 파일 모두 확인.
