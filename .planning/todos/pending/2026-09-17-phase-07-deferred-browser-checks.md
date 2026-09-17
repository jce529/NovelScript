---
created: 2026-09-17T16:50:00+09:00
title: Phase 7 미확인 브라우저 검수 2건 + 잠재 버그 후보 확인
area: admin-moderation
priority: high
files:
  - components/moderation/account-notices.tsx
  - lib/moderation/user-actions.ts
  - lib/auth/write-access.ts
  - lib/admin/actions.ts:107
  - .planning/phases/07-admin-moderation-surface/07-UAT.md
---

## Problem

Phase 7(관리자 운영 도구)은 사용자 결정에 따라 2026-09-17 **완료 처리**했지만, 아래 항목은 실제 브라우저에서 한 번도 관찰되지 않았다.
자동 테스트(`tests/admin/user-flows.test.ts`, `tests/admin/sanctions*.test.ts`)는 통과한다. 하지만 fake client / 격리 스키마 기반이라 **실제 화면에서는 버그가 될 수 있다**.

원인: 확인하려면 제재 대상 계정으로 로그인해야 한다. 관리자 계정은 자기 자신을 제재할 수 없다(`self_sanction_forbidden`, 의도된 설계).

### 반드시 확인할 것 (미검증)

1. **경고 확인 흐름**
   - 경고받은 사용자가 로그인하면 루트 레이아웃에 운영 알림(`AccountNotices`)이 뜨는가
   - "확인"을 누르면 `warning_acknowledgements`에 행이 생기는가
   - 새로고침 후에도 알림이 다시 뜨지 않는가 (확인 상태 유지)
   - 알림 로딩 실패가 로그인/로그아웃/렌더를 막지 않는가
2. **정지된 사용자 화면**
   - 스튜디오 저장, 좋아요, 신고, 구매, 재검토 요청이 정지 안내 문구(`계정 정지로 이 작업을 수행할 수 없습니다.`)로 막히는가
   - 이미 구매한 회차 열람, 지갑 잔액 표시, 무료 회차 읽기는 그대로 되는가
   - 기간 정지 만료 시각(Asia/Seoul 입력 → UTC 저장)이 지나면 자동으로 쓰기가 다시 되는가
   - 영구 정지도 같은 방식으로 막히는가

### 알려진 사소한 이슈 (미수정)

- **F-2:** 관리자가 자기 작품에 경고/정지를 시도하면 서버는 막는다. 하지만 UI에는 일반 문구 "입력 내용을 확인해 주세요."만 뜬다(`lib/admin/actions.ts:107`에서 `validation_failed`로 매핑). 전용 안내 문구가 필요하다.
- **F-3:** 기존 독자 DB 테스트(reports 등)가 공유 테스트 DB에 "테스트 작품" 신고를 남겨 관리자 큐를 오염시킨다. 테스트 정리(teardown)가 필요하다.
- **병렬 실행:** `npx vitest run`을 기본 병렬로 실행하면 원격 Supabase 타임아웃으로 약 11건이 실패한다(직렬 실행 시 483/483 통과). CI를 구성하면 `--no-file-parallelism` 또는 타임아웃 조정이 필요하다.
- **lint:** 기존 lint 오류 23건(Phase 7 이전 파일)이 남아 있다.

## Solution

1. 두 번째 OAuth 계정(예: Google "새작가", `6cd131cf-…`)으로 브라우저에 로그인한다.
2. 관리자(Kakao "노벨스크립트데모", 테스트 DB에서 admin 활성)가 그 계정의 작품 신고에 **경고**를 건다. 이어서 위 1번 항목을 확인한다.
3. 같은 계정에 **짧은 기간 정지**(예: 10분 뒤 만료)를 건다. 위 2번 항목과 만료 후 복구를 확인한다.
4. 결과를 `.planning/phases/07-admin-moderation-surface/07-UAT.md` §4에 기록한다. 버그가 나오면 수정 후 이 todo를 `done/`으로 옮긴다.
5. F-2 문구와 F-3 테스트 정리는 별도 quick task로 처리한다.
