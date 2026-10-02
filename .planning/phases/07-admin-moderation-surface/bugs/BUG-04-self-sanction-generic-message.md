---
id: BUG-04
title: 관리자가 자기 자신을 제재하면 일반 검증 문구만 표시된다 (F-2)
status: open
severity: low
found: 2026-09-17
found_during: Phase 7 브라우저 UAT 후속 todo (2026-09-17-phase-07-deferred-browser-checks.md)
origin_phase: 07
files:
  - lib/admin/actions.ts
---

# BUG-04: 자기 제재 시 안내 문구 부정확

## 증상
관리자가 자기 작품/계정에 경고·정지를 시도하면 서버는 올바르게 막지만, 화면에는 "입력 내용을 확인해 주세요."만 뜬다.

## 재현
관리자 계정으로 자기 작품의 신고에 경고/정지를 건다.

## 기대 / 실제
- 기대: "자기 자신은 제재할 수 없어요" 계열의 전용 문구.
- 실제: `self_sanction_forbidden`이 `validation_failed`로 매핑되어(`lib/admin/actions.ts` 약 107행) 일반 문구가 표시된다.

## 원인
오류 코드 매핑 표에서 `self_sanction_forbidden`을 전용 코드 없이 `validation_failed`에 합쳤다.

## 수정 방향
- 전용 결과 코드(예: `self_sanction_forbidden`)를 두고 UI 문구를 추가한다. 정책 결정 불필요(서버 차단은 의도된 설계).

## 검증
- `self_sanction_forbidden`이 전용 코드로 매핑되는 단위 테스트, 해당 문구가 UI에 표시되는 컴포넌트 테스트 또는 수동 브라우저 확인.
