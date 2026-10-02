---
id: BUG-05
title: 독자 DB 테스트가 공유 테스트 DB에 신고 잔여물을 남겨 관리자 큐를 오염시킨다 (F-3)
status: open
severity: low
found: 2026-09-17
found_during: Phase 7 브라우저 UAT 후속 todo (2026-09-17-phase-07-deferred-browser-checks.md)
origin_phase: 07 (관리자 큐가 생기면서 드러남; 잔여물을 만드는 테스트는 Phase 3 reports 테스트)
files:
  - tests/reader/ (reports 관련 DB 테스트)
---

# BUG-05: 테스트 신고 잔여물

## 증상
기존 독자 DB 테스트가 공유 테스트 DB에 "테스트 작품" 대상 신고를 남긴다. 관리자 신고 큐에 가짜 항목이 쌓여 UAT와 운영 확인을 방해한다.

## 재현
`tests/reader`의 reports DB 테스트를 실행한 뒤 관리자 신고 큐를 연다.

## 기대 / 실제
- 기대: 테스트가 만든 신고·작품·계정 행이 테스트 종료 시 정리된다(또는 격리 스키마 안에서 롤백된다).
- 실제: teardown이 없어 행이 남는다.

## 원인
Phase 3 테스트는 신고 큐 소비자가 없던 시절에 작성되어 정리를 하지 않았다. Phase 7이 큐를 만들면서 영향이 가시화됐다.

## 수정 방향
- 해당 테스트를 `tests/commerce/settlement.test.ts`처럼 격리 스키마 + 롤백 패턴으로 옮기거나, `afterAll`에서 생성한 행을 삭제한다(원장 FK가 걸린 행은 Phase 9 BUG-01 문서의 제약을 참고).
- 이미 쌓인 잔여 신고는 테스트 DB에서 일회성 정리한다(정리 전 대상 확인 필수).

## 검증
- 테스트 실행 전후 신고 건수가 같은지 확인하는 점검을 추가하거나 수동으로 확인.
