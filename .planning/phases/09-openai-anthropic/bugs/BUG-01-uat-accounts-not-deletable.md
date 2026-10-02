---
id: BUG-01
title: UAT용 일회용 계정이 원장 FK 때문에 삭제되지 않고 테스트 DB에 남는다
status: open
severity: low
found: 2026-09-29
found_during: Phase 9 라이브·브라우저 UAT 정리 (STATE.md Phase 9 항목에 기록)
origin_phase: 09 (UAT 절차; 근본 제약은 Phase 1의 원장 불변 설계)
files:
  - supabase/migrations/0001_init.sql
---

# BUG-01: UAT 계정 잔여물

## 증상
Phase 9 UAT에서 만든 `test-…@novelscript.test` 계정이 지갑·원장 행(FK) 때문에 삭제되지 않고 남아 있다. 다른 UAT(관리자 큐, 목록)에 잡음을 만들 수 있다.

## 재현
UAT 계정을 만들고 생성·차감을 한 번 수행한 뒤 계정을 삭제하려 한다 → 원장 FK 위반.

## 기대 / 실제
- 기대: 테스트 계정과 그 부속 행을 UAT 후 일괄 정리할 수 있다.
- 실제: 원장은 append-only/불변(Phase 1 설계, 계정 삭제 시 소프트 삭제)이라 하드 삭제가 막힌다. 이는 제품 요구에는 맞지만 테스트 정리 수단이 없다.

## 원인
정리 절차가 없다. 원장 불변 설계(01-RESEARCH 5번)와 상충하는 것은 아니며 테스트 데이터 위생 문제다.

## 수정 방향
- 테스트 전용 정리 스크립트(서비스 롤, `@novelscript.test` 도메인 한정 + 건수 확인 후 실행)를 만들어 해당 계정의 원장·지갑·부속 행을 지운다. 운영 DB에서는 실행되지 않도록 가드한다.
- (UAT를 전용 프로젝트로 옮기는 대안은 채택하지 않았다. 삭제 실행 자체는 구현 시 대상 목록 승인을 받는다.)

## 검증
- 스크립트 dry-run으로 대상 목록을 확인한 뒤 실행하고, 실행 후 `@novelscript.test` 계정이 0건이며 실제 사용자 데이터가 영향받지 않았는지 확인.

## 수정 계획 (gpt-6-sol, 2026-10-02)

### 접근 요약

- **확정(2026-10-02, 사용자 선택 A):** 격리된 테스트 프로젝트에서만 쓰는 계정 정리 CLI를 만든다. 기본은 dry-run이며, 정확한 이메일·UUID 목록·예상 건수·프로젝트 식별값을 대조하고 명시적 실행 플래그가 있을 때만 삭제한다. 운영 프로젝트·미확인 FK·비대상 사용자 연결·append-only 관리자 행이 있으면 중단한다. B안(UAT 전용 프로젝트 이전)은 채택하지 않았다. **단, 기존 UAT 잔여물을 실제로 지우는 실행(3단계)은 dry-run 결과와 대상 목록을 사용자에게 보여주고 승인받은 뒤에만 한다.**
- A안은 `@novelscript.test` 도메인만으로 삭제하지 않는다. 정확한 이메일·UUID 목록, 대상 건수, 프로젝트 식별값을 대조하는 기본 dry-run을 거쳐 명시적 실행 확인을 요구한다. 운영 프로젝트와 미확인 FK·비대상 사용자 연결은 중단한다.
- 코드상 `profiles → auth.users`, `wallets → profiles`는 cascade지만 `ledger_entries → wallets`와 `reports.reporter_id → profiles`는 cascade가 없다. 정리 가능한 테스트 행을 FK 자식부터 처리하고 Auth 계정을 마지막에 삭제한다.
- 관리자 감사 행은 append-only 트리거가 있으므로 제약을 우회하지 않는다. Phase 7 BUG-05의 신고 테스트 정리와 대상·헬퍼를 조율한다. 이 버그에서 신규 마이그레이션은 계획하지 않는다.

### 변경 파일 목록 (A안 확정)

| 파일 | 예정 변경 |
|---|---|
| `scripts/cleanup-uat-accounts.ts` (신규) | 테스트 프로젝트 전용 CLI. 프로젝트 ref/DB 식별값과 운영 여부, 명시한 UUID·이메일·건수, 현재 Auth 이메일을 대조한다. 기본 dry-run에서 대상과 테이블별 연결 행 수·차단 사유를 출력하고, 별도 실행 플래그에서만 삭제한다. DB 자식 행을 트랜잭션으로 정리한 뒤 Auth Admin API 삭제 결과를 검사하고 재조회한다. 부분 실패 시 대상별 상태를 남겨 동일 목록으로 재시도할 수 있게 한다. |
| `tests/uat/cleanup-uat-accounts.test.ts` (신규) | 대상 식별·dry-run·운영 가드·건수 불일치·비대상 FK·감사 행 발견 시 중단, Auth 삭제 오류 전파를 DB 없이 검증한다. |
| `tests/uat/cleanup-uat-accounts.database.test.ts` (신규) | 격리 테스트 DB에서 Auth 사용자와 원장·신고 fixture를 만들고 정리 후 독립 연결에서 잔여 0건 및 비대상 데이터 보존을 확인한다. DB 연결과 권한이 없으면 명시적으로 skip한다. |
| `tests/helpers/db.ts` | `deleteTestUser()`가 현재 무시하는 `auth.admin.deleteUser()` 반환 `error`를 throw하도록 고친다. 기존 호출자의 `.catch(() => {})`는 별도 조사 대상으로 표시한다. |
| `tests/reader/reports.test.ts` | Phase 7 BUG-05와 중복 수정하지 않도록 그 계획의 ID 추적·신고/작품 정리 결과를 재사용하거나 선행 완료 여부를 확인한다. 이 버그의 검증에서는 신고 행이 있는 계정도 정리되는지 확인한다. |

### 작업 순서 (TDD)

1. **대상 선택과 실행 가드 — 커밋 제안: `test(uat): guard cleanup target selection`**
   - 먼저 실패하는 테스트: `tests/uat/cleanup-uat-accounts.test.ts`에 dry-run 기본값, UUID·이메일 정확 일치, 예상 건수 불일치, 운영/미확인 프로젝트, 실행 확인 플래그 누락을 거부하는 케이스를 작성한다.
   - 구현: `scripts/cleanup-uat-accounts.ts`에 CLI 입력 검증·대상 조회·테이블별 사전 점검과 dry-run 출력을 만든다. 실제 삭제 경로는 아직 연결하지 않는다.
   - 확인 명령: `npx vitest run tests/uat/cleanup-uat-accounts.test.ts --passWithNoTests=false`; `npx tsx scripts/cleanup-uat-accounts.ts --help`; `git diff --check`.
2. **FK 순서와 부분 실패 처리 — 커밋 제안: `fix(uat): delete scoped fixture dependencies before auth user`**
   - 먼저 실패하는 테스트: `tests/uat/cleanup-uat-accounts.database.test.ts`에서 원장 행이 있는 계정의 기존 Auth 삭제 실패를 재현하고, 신고·작품이 연결된 fixture 및 비대상 사용자 연결·관리자 감사 연결의 중단 케이스를 추가한다. 서로 다른 `postgres()` 인스턴스의 연결로 커밋된 행과 정리 후 잔여물을 조회한다.
   - 구현: 확인된 대상의 `ledger_entries` 등 FK 자식 행을 삭제한 뒤 지갑·프로필은 Auth 삭제의 cascade를 이용한다. 신고 및 대상 작품의 독자·KB·회차 연결은 실제 FK를 조회해 역순으로 처리한다. 비대상 사용자 주문·권한이나 append-only 관리자 행이 연결되면 중단한다. DB 정리 커밋 후 Auth Admin API를 호출하고 오류·재조회 결과를 기록한다. DB와 Auth 사이의 비원자성을 고려해 재실행 가능하게 한다.
   - 확인 명령: 격리 테스트 DB에서 `npx vitest run tests/uat/cleanup-uat-accounts.database.test.ts --passWithNoTests=false`; `npx vitest run tests/auth/account-deletion.test.ts tests/reader/reports.test.ts --passWithNoTests=false`; `git diff --check`. DB 케이스의 skip 수를 기록하고 성공 판정에는 skip 0을 요구한다.
3. **기존 UAT 잔여물 정리와 회귀 — 커밋 제안: `docs(uat): record scoped cleanup verification`**
   - 먼저 실패하는 테스트: `tests/uat/cleanup-uat-accounts.database.test.ts`에 승인된 UUID 목록을 입력받아 잔여 계정·FK 행 0건을 조회하는 수용 케이스를 추가한다. 정리 전에는 현재 잔여물이 있으면 실패해야 한다. dry-run에서 대상·연결 행의 기준선을 기록하고, 대상 외 ID 혼입·미확인 FK·관리자 감사 연결·운영 프로젝트 식별·예상 건수 불일치가 나오면 실행을 중단한다.
   - 구현: A안과 대상 목록이 확정된 격리 테스트 DB에서만 명시적 실행 확인 후 정리한다. 대상별 결과·실패·보류 사유를 이 문서에 기록한다. Phase 7 BUG-05와 겹치는 신고/작품 행은 그쪽 정리와 실행 순서를 맞춘다. B안 선택 시 이 단계는 전용 프로젝트 이전 절차와 기존 잔여물 보존·처리 기록으로 대체한다.
   - 확인 명령: 동일 CLI의 dry-run을 다시 실행해 승인된 이메일·UUID와 FK 잔여가 0인지 조회한다. `npx vitest run tests/uat tests/reader tests/auth/account-deletion.test.ts --passWithNoTests=false`; `git diff --check`. 실제 CLI 인자 이름은 1단계 구현 후 확정한다.

### 테스트 계획

- 신규 `tests/uat/cleanup-uat-accounts.test.ts`: dry-run 기본값, 정확한 이메일·UUID 쌍과 예상 건수, 운영/미확인 프로젝트 거부, 확인 플래그, 대상 외 FK·감사 행 차단, Auth API 오류 전파 및 재시도 상태를 검사한다.
- 신규 `tests/uat/cleanup-uat-accounts.database.test.ts`: 원장 때문에 Auth 삭제가 막히는 선행 재현, 정리 후 원장·지갑·프로필·Auth 사용자 0건, 신고/작품 연결 처리, 비대상 사용자와 행 보존, 같은 대상 재실행의 멱등성을 검사한다. 독립 연결은 별도 `postgres()` 인스턴스를 사용한다. 이 버그는 동시성 결함이 아니지만 커밋된 결과를 같은 세션의 트랜잭션 착시 없이 확인하기 위해 독립 연결을 쓴다.
- 기존 회귀 명령: `npx vitest run tests/auth/account-deletion.test.ts tests/reader/reports.test.ts --passWithNoTests=false`, 이어서 `npx vitest run tests/reader --passWithNoTests=false`. 연결 없는 환경의 skip은 통과로 세지 않는다.
- 현재 대상 계정 수·프로젝트 식별값·연결 FK의 실제 분포는 **미확인**이다. 삭제 전후 총계뿐 아니라 승인된 UUID 목록별 잔여 건수와 비대상 표본을 확인한다.

### 위험과 롤백

- **데이터·배포:** 스크립트의 실제 삭제는 되돌릴 수 없고, DB 자식 행 정리와 Supabase Auth Admin API 호출은 하나의 트랜잭션이 아니다. 실행 전 대상 행·식별값을 보관하고, Auth 단계 실패 시 이미 정리한 행과 남은 계정을 기록해 동일 대상만 재시도한다. 운영 환경에서는 실행을 차단한다. 현재 원격 환경의 백업·복구 방법은 **미확인**이다.
- **제약:** `admin_actions`, `user_sanctions`, `warning_acknowledgements`는 `guard_append_only()` 트리거가 삭제를 막는다. 이런 행이나 비대상 사용자와 공유한 주문·작품 참조가 있으면 자동 삭제 대신 보류한다. 원장 불변이라는 제품 정책을 일반 계정 삭제 동작으로 바꾸지 않는다.
- **다른 phase:** Phase 7 BUG-05도 `tests/helpers/db.ts`와 신고 테스트 정리를 계획하므로 구현 시 중복 변경·순서를 조율한다. Phase 11의 AI 사용량 마이그레이션은 현재 계획 단계이며 실제 추가 FK는 **미확인**이다. 실행 전 DB catalog의 FK를 다시 확인한다. 번호는 Phase 6 BUG-01 확정안(`0015` 유지, payments `0016`, settlement `0017`, 신규 `0018`부터)을 따르며 이 수정에는 마이그레이션이 없다.
- **롤백:** 코드 커밋은 역순으로 revert할 수 있다. 이미 삭제한 DB 행은 Git 롤백으로 복구되지 않으므로 보관한 대상 데이터와 해당 환경의 백업을 바탕으로 별도 복구 판단을 한다. 실패한 대상을 전체 도메인 일괄 삭제로 재시도하지 않는다.

### 완료 조건

- 선택한 A/B 방식과 실제 적용 범위가 기록된다. A안이면 대상 제한·운영 차단·dry-run·명시적 실행 확인·오류 전파 테스트가 통과하고, 격리 DB의 원장·신고 fixture가 정리되며 독립 연결에서 승인 대상의 잔여 계정과 FK 행이 0건이다.
- 기존 UAT 잔여물의 승인 대상별 결과 또는 보류 사유가 기록되고, 비대상 데이터가 보존된다. 관련 DB 통합 테스트는 skip 0으로 통과하고 `tests/reader`·계정 삭제 회귀가 통과해야 `bug-complete`로 넘긴다.
- B안이면 전용 프로젝트에서 UAT 계정·신고가 공유 DB에 남지 않는 검증과 기존 잔여물 처리 기록이 완료 조건이다. 미확인 운영 DB를 대상으로 한 실삭제는 완료 조건이 아니다.

### 예상 규모

- A안 기준 신규 CLI·단위/DB 테스트·헬퍼 수정 약 200~350줄(추정). 실제 FK 분포와 Phase 7 BUG-05의 선행 구현에 따라 달라진다.
- TDD 3단계, 단계당 커밋 1개 제안. 기존 잔여물 조사·실행 및 B안의 전용 프로젝트 구축 소요는 **미확인**이다.

## 실제 적용 내용 (bug-execute, 2026-10-02)

- `scripts/lib/uat-account-cleanup.mjs` + `scripts/cleanup-uat-accounts.mjs`(신규): 테스트 프로젝트 전용 정리 CLI(A안). 정확한 `--ids`·`--emails` 쌍과 `--expect-count`가 있어야 하고(`@novelscript.test`만 허용), 기본은 dry-run이다. 실제 삭제는 `--execute --expect-db <호스트 일부>`가 연결 호스트와 일치할 때만 수행한다. `pg_constraint`로 `profiles`·`wallets`를 참조하는 모든 FK의 행 수를 조회해, 도구가 직접 정리하는 `ledger_entries.wallet_id`·`reports.reporter_id`와 CASCADE FK 외의 참조(작품 소유, 관리자 감사·제재 이력 등)가 하나라도 있으면 중단한다. 삭제는 DB 자식 행(트랜잭션) → Auth Admin API 순이며 Auth 오류는 대상별 결과와 함께 throw하고, 삭제 후 재조회로 잔여 0건을 확인한다. 같은 목록을 재실행해도 안전하다(이미 없으면 `found_0_expected_N`로 중단).
- `tests/uat/cleanup-uat-accounts.test.ts`(DB 없는 가드·FK 순서·오류 전파 단위 테스트), `tests/uat/cleanup-uat-accounts.database.test.ts`(원장·신고가 걸려 Auth 삭제가 막히는 상태 재현 → 정리 후 계정·원장·지갑 0건, 비대상 계정 보존, 작품 보유 계정 거부, 재실행 멱등). `deleteTestUser`는 Phase 7 BUG-05에서 Auth 오류를 throw하도록 이미 수정됨.
- 검증: 위 두 파일과 `tests/config` 통과, `tsc` 통과.
- **미수행(승인 필요):** 기존 UAT 잔여 계정의 실제 삭제(계획 3단계). 대상 이메일·UUID 목록을 승인받아 dry-run 결과를 확인한 뒤 `--execute`로 실행해야 한다. 원격 DB의 백업·복구 방법은 미확인.
