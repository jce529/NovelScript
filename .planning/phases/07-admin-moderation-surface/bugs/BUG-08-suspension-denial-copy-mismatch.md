---
id: BUG-08
title: 정지 시 쓰기 차단 안내 문구가 화면마다 다름 (A "~어요" 안내문 vs B "~습니다" 단문)
status: open
severity: low
found: 2026-10-08
found_during: UAT 브랜치(uat/pending-verification) Phase 7 정지 사용자 브라우저 검수 (새작가 계정, 기간 정지 상태)
origin_phase: 07 (07-03 c23ef70이 문구 A 도입, 07-06 7717bfd가 문구 B 도입)
files:
  - lib/auth/write-access.ts
  - lib/moderation/user-actions.ts
  - lib/moderation/actions.ts
  - tests/admin/user-flows.test.ts
  - .planning/phases/07-admin-moderation-surface/07-UI-SPEC.md
  - .planning/todos/pending/2026-09-17-phase-07-deferred-browser-checks.md
---

# BUG-08: 정지 시 쓰기 차단 안내 문구 불일치

## 증상
정지된 계정이 쓰기 동작을 하면 같은 "정지로 막힘" 상황인데 화면에 따라 문구가 다르다.

- **A** `WRITE_SUSPENDED_MESSAGE` (`lib/auth/write-access.ts:19`): "계정 이용이 제한되어 이 작업을 할 수 없어요. 기존 작품과 구매한 회차는 계속 볼 수 있어요."
- **B** `SUSPENSION_DENIAL_COPY` (`lib/moderation/user-actions.ts:29`): "계정 정지로 이 작업을 수행할 수 없습니다."

## 재현
1. 관리자가 새작가에게 기간 정지를 건다.
2. 새작가로 스튜디오 회차 저장 / 좋아요 / 신고 → 문구 A (2026-10-08 브라우저에서 확인).
3. 새작가가 블라인드된 자기 콘텐츠에 재검토 요청 → 코드상 문구 B (`lib/moderation/actions.ts:53`, `user-actions.ts:219`). 이 경로는 이번에 브라우저로 확인하지 않았다.

## 기대 / 실제
- 기대: 모든 쓰기 차단 화면이 같은 문구를 보인다.
- 실제: 대부분 경로는 A, 재검토 요청 경로(`getReviewPanelStateAction`, `requestReview`)만 B로 덮어쓴다.

## 원인
07-UI-SPEC은 "Write denial" 문구를 B로 적었다. 07-03에서 쓰기 가드(`checkWriteAccess`)가 A를 반환하도록 만들어 모든 쓰기 경로(스튜디오·좋아요·신고·구매·AI)가 A를 쓰게 됐고, 07-06에서 재검토 요청을 연결하며 UI-SPEC대로 B로 덮어썼다. 두 상수가 따로 정의돼 통일되지 않았다.

## 수정 방향
**결정 완료(사용자, 2026-10-08): A로 통일한다.** 앱 전체 어조("~어요")와 맞고, 읽기·구매 회차 열람이 유지된다는 안내가 있다.

1. `lib/moderation/user-actions.ts`의 `SUSPENSION_DENIAL_COPY`를 제거하고, 재검토 요청 경로는 `access.error`(= A)를 그대로 쓰도록 삼항 분기를 없앤다. (`lib/moderation/actions.ts:53`, `lib/moderation/user-actions.ts:219`)
2. `tests/admin/user-flows.test.ts`가 `SUSPENSION_DENIAL_COPY` 대신 `WRITE_SUSPENDED_MESSAGE`를 기대하도록 바꾼다(365·368행 부근).
3. 문서 정정: `07-UI-SPEC.md` Write denial 행을 A로, 대기 todo `2026-09-17-phase-07-deferred-browser-checks.md`의 기대 문구도 A로 맞춘다. 07-06-SUMMARY의 기록은 당시 사실이라 그대로 둔다.

## 검증
- `npx vitest run tests/admin/user-flows.test.ts tests/admin/sanctions.test.ts` 통과.
- `grep SUSPENSION_DENIAL_COPY` 결과가 0건.
- 브라우저: 정지 계정에서 재검토 요청이 문구 A로 막히는지 확인(블라인드된 콘텐츠가 필요하면 생략하고 테스트로 대체).

## 적용 내용 (bug-execute, 2026-10-08)
- `SUSPENSION_DENIAL_COPY` 상수와 `write_suspended` 삼항 분기 제거. 재검토 요청 경로(`getReviewPanelStateAction`, `requestReview`)도 `access.error`(= 문구 A)를 쓴다.
- `tests/admin/user-flows.test.ts`가 `WRITE_SUSPENDED_MESSAGE`를 기대하도록 변경.
- `07-UI-SPEC.md` Write denial 행과 대기 todo의 기대 문구를 A로 정정.
- 검증: `user-flows` 32건·`sanctions` 60건 통과, `SUSPENSION_DENIAL_COPY` 참조 0건. `tsc`는 이 변경과 무관한 untracked `tests/payments/*` 3개 파일의 모듈 누락 오류만 남음. 재검토 요청의 브라우저 확인은 블라인드 콘텐츠가 필요해 테스트로 대체.
