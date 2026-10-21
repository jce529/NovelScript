---
phase: 07-admin-moderation-surface
plan: "10"
subsystem: admin-moderation-actions
tags: [admin, sanctions, server-actions, presets, gap-closure, tdd]
requires: ["adjust_user_sanction RPC (0029, 07-08)", "withAdminAction / callRpc / rpcFailure (lib/admin)", "07-09 queries/types"]
provides:
  - adjustUserSanction(input, deps?) in lib/admin/actions.ts
  - adjustUserSanctionAction(input) in app/admin/actions.ts
  - SANCTION_ADJUST_OPERATIONS / SanctionAdjustOperation / AdjustUserSanctionInput
  - SANCTION_DURATION_DAYS, isSanctionDurationDays, suspensionPresetEndsAt(days, baseTime) in lib/admin/sanction-presets.ts
affects: ["07-11 기간 정지/기간 변경 UI", "07-15 live-DB checkpoint"]
tech-stack:
  added: []
  patterns: ["authorize-first zod schema per command", "bigint seq as decimal string end to end", "caller-supplied base time for pure date math"]
key-files:
  created:
    - lib/admin/sanction-presets.ts
    - tests/admin/sanction-presets.test.ts
  modified:
    - lib/admin/actions.ts
    - app/admin/actions.ts
    - tests/admin/action-boundary.test.ts
    - tests/admin/moderation.test.ts
decisions:
  - "expectedSeq: /^(0|[1-9][0-9]{0,18})$/ 이면서 Postgres bigint 최대값 이하인 문자열만 받고 RPC에 문자열 그대로 넘긴다. 0은 형식상 허용하고 DB의 현재 seq 비교로 거부되게 둔다."
  - "새 SQL 오류 매핑: no_active_sanction은 stale_target(조회 후 제재가 끝나거나 해제됨), sanction_unchanged는 validation_failed로 보낸다. AdminErrorCode에는 새 값을 추가하지 않았다."
  - "lift는 endsAt이 있으면 거부하고, change_duration은 미래 ISO(offset 포함) endsAt이 필수다. 둘 다 내부 사유(2000자)와 공개 사유(500자)가 필수다."
  - "프리셋 계산은 baseTime + days*86400000을 UTC ISO로 바꾼다. 함수 안에서 Date.now를 호출하지 않는다. 지원하지 않는 기간이나 NaN·Infinity·Date 범위 밖 시각이면 RangeError를 던진다."
metrics:
  completed: 2026-10-19
  tasks: 2
  files: 6
---

# Phase 7 Plan 10: 현재 제재 조정 서버 경계와 1·7·30일 프리셋 Summary

07-08의 `adjust_user_sanction` RPC에 연결되는 명령을 추가했다. lib 쪽 `adjustUserSanction`이 먼저 관리자 권한을 확인한 뒤 해제·기간 변경 입력을 검증하고, `'use server'` 쪽 `adjustUserSanctionAction`은 입력을 필드별로 다시 만들고 성공했을 때만 경로를 revalidate한다. 기간 정지 화면과 기간 변경 화면이 같이 쓸 수 있도록 1·7·30일 종료 시각 계산을 순수 함수로 분리했다.

## Tasks

| Task | Name | Commits |
| ---- | ---- | ------- |
| 10-01 | 세션 관리자 기반 현재 제재 조정 명령 | a83cac4 (RED), 1ebca2f (GREEN) |
| 10-02 | 1·7·30일 프리셋 종료 계산 순수 함수 | 91017e1 (RED), 83dd4d7 (GREEN) |

## 동작 요약

- 권한: 익명 사용자, 관리자가 아닌 사용자, 권한 확인 백엔드 장애는 각각 `not_found`/`not_found`/`unavailable`로 끝나고 RPC와 revalidate는 한 번도 호출되지 않는다. 기존 `withAdminAction` 경로를 그대로 쓰기 때문에, 관리자 권한이 회수되면 비관리자와 같은 결과가 나온다.
- 위조된 actor: `actorId`·`p_actor_id`·`actor`·임의 키는 server action에서 버리고 schema에서도 한 번 더 제거한다. RPC 인자는 정확히 8개이고 `p_actor_id`는 세션 관리자다.
- 검증(RPC 호출 전): UUID 키와 대상 사용자, bigint 10진 문자열 seq(숫자 타입·지수 표기·음수·20자리는 거부), operation enum, lift/기간 변경별 endsAt 규칙, 두 사유 필수와 길이 제한.
- 실패와 충돌: 결과는 `{ok:false,error,fieldErrors?}`만 반환하고 revalidate하지 않는다. 원본 오류 메시지는 서버 밖으로 나가지 않는다. 클라이언트 입력은 건드리지 않으므로 그대로 남는다(UI 측 보존은 07-11 소관).
- 성공: `/admin`, `/works/[workId]`, `/studio` layout만 revalidate한다(기존 `revalidateModeration`).
- 신고 상세 화면에는 lift 액션을 추가하지 않았다.

## Verification

| Check | Result |
| ----- | ------ |
| RED 10-01: `vitest run action-boundary + moderation` | 39 failed(새 export가 없어서), 커밋 a83cac4 |
| GREEN 10-01: `npx vitest run tests/admin/action-boundary.test.ts tests/admin/authorization.test.ts tests/admin/moderation.test.ts --passWithNoTests=false` | 3 files, 153 passed |
| RED 10-02: `vitest run sanction-presets` | 모듈이 없어 실패, 커밋 91017e1 |
| GREEN 10-02: `npx vitest run tests/admin/sanction-presets.test.ts --passWithNoTests=false` | 25 passed |
| `npx eslint --max-warnings=0` (수정 파일 6개) | 통과 |
| `npx tsc --noEmit` | 이 plan 파일에서는 에러 0. 남은 2건은 07-09가 남긴 `components/admin/report-queue.tsx`(status 'all') 문제이고 이 plan 범위 밖이다. |

## Not Verified (gate 07-15)

- 실제 `adjust_user_sanction` 동작(seq 비교, `no_active_sanction`/`sanction_unchanged` 발생 조건, 트랜잭션 안의 lift+재정지)은 DB를 띄우지 않아 확인하지 못했다. mock 기반 경계 테스트만 돌렸다. 0029는 적용하지 않았다.
- 브라우저에서 입력 보존과 확인 화면 프리뷰가 요청 endsAt과 같은지는 07-11 UI와 07-15 checkpoint에서 확인해야 한다.
- plan verification이 지시한 graphify update와 graph-link-requirements는 orchestrator 지시에 따라 건너뛰었다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] seq 검사에서 regex가 실패한 뒤에도 BigInt 변환이 실행되던 문제**
- **Found during:** Task 10-01 GREEN
- **Issue:** zod v4는 regex check가 실패해도 그다음 refine을 실행한다. 그래서 `'1e3'`에서 `BigInt()`가 SyntaxError를 던졌다.
- **Fix:** 패턴 검사와 bigint 범위 검사를 refine 하나로 합치고, 범위 검사는 패턴이 맞을 때만 실행되게 했다.
- **Files modified:** lib/admin/actions.ts
- **Commit:** 1ebca2f

추가로 다음을 export했다. 07-11 UI가 클라이언트에서 같은 규칙을 쓰도록 하려는 것이고, 동작은 바뀌지 않는다.
- `SANCTION_ADJUST_OPERATIONS`, `SanctionAdjustOperation`
- `isSanctionDurationDays`

## Known Stubs

None.

## Self-Check: PASSED

- lib/admin/sanction-presets.ts, tests/admin/sanction-presets.test.ts 존재.
- 커밋 a83cac4 / 1ebca2f / 91017e1 / 83dd4d7 존재.
