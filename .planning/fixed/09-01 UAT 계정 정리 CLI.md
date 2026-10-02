---
id: 09-01
title: UAT용 일회용 계정이 원장 FK 때문에 삭제되지 않고 테스트 DB에 남음
fixed: 2026-10-02
files:
  - scripts/cleanup-uat-accounts.mjs
  - scripts/lib/uat-account-cleanup.mjs
  - tests/uat/cleanup-uat-accounts.test.ts
  - tests/uat/cleanup-uat-accounts.database.test.ts
---

# 09-01: UAT 계정 정리 CLI

## 증상

Phase 9 UAT에서 만든 `test-…@novelscript.test` 계정이 지갑·원장 행(FK)과 신고 때문에 Auth API로 삭제되지 않고 남아 관리자 큐 등 다른 UAT에 잡음을 만들었다.

## 원인

`ledger_entries → wallets`, `reports.reporter_id → profiles`에 CASCADE가 없고 정리 절차가 없었다. 원장 불변 설계와 상충하는 것은 아니며 테스트 데이터 위생 문제였다.

## 수정

- 테스트 프로젝트 전용 정리 CLI(A안): 정확한 `--ids`·`--emails` 쌍과 `--expect-count`가 있어야 하고(`@novelscript.test`만 허용) 기본은 dry-run. 실제 삭제는 `--execute --expect-db <호스트 일부>`가 연결 호스트와 일치할 때만 수행한다.
- `pg_constraint`로 `profiles`·`wallets`를 참조하는 모든 FK의 행 수를 조회해, 도구가 직접 정리하는 `ledger_entries.wallet_id`·`reports.reporter_id`와 CASCADE FK 외의 참조(작품 소유, 관리자 감사·제재 이력 등)가 있으면 중단한다. DB 자식 행을 트랜잭션으로 삭제한 뒤 Auth Admin API로 삭제하고 오류를 대상별 결과와 함께 전파, 재조회로 잔여 0건을 확인한다. 같은 목록 재실행은 안전하다.
- **기존 잔여물 실삭제(2026-10-02, 사용자 승인):** CLI는 작품 소유 계정 등을 거부하므로, 테스트 계정 6,368개를 FK 그래프 기반 일회용 스크립트(저장소 미포함)로 종속 행과 함께 삭제했다. 상세 내역은 `07-05 신고 테스트 잔여물 정리.md` 참고. 감사·제재 연결 계정 3개는 보존.

## 검증

- 단위 테스트(가드·FK 순서·Auth 오류 전파)와 DB 테스트(원장·신고로 Auth 삭제가 막히는 상태 재현 → 정리 후 계정·원장·지갑 0건, 비대상 계정 보존, 작품 보유 계정 거부, 재실행 멱등) 통과. 전체 `npm test` 1147개 통과.
- 후속 주의: 많은 기존 테스트가 여전히 원장 행을 남겨 계정을 삭제하지 못한다(`deleteTestUser`는 best-effort). 주기적으로 정리가 필요하면 일회용 스크립트 방식 또는 해당 테스트의 자체 정리를 별도로 검토한다. 원격 DB 백업·복구 방법은 미확인.

## 커밋

- `838728e` fix(09): BUG-01 UAT 계정 정리 CLI (dry-run 기본, FK·감사 가드)
- `34e19c7` docs(bugs): 과거 테스트 잔여물 정리 결과 기록
