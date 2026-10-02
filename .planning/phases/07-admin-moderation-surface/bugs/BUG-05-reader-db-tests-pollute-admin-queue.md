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
- 실제: `reports.test.ts`에 `afterAll`은 있으나 계정 삭제 오류를 무시하고, 신고·작품·KB 행을 직접 정리하지 않아 잔여물이 남는다. (2026-10-02 코드 재확인)

## 원인
Phase 3 테스트는 신고 큐 소비자가 없던 시절에 작성되어 신고·작품 행을 정리하지 않았다. Phase 7이 큐를 만들면서 영향이 가시화됐다. (2026-10-02 코드 재확인: 계정 삭제 시도는 있으나 오류를 무시함)

## 수정 방향
- 해당 테스트를 `tests/commerce/settlement.test.ts`처럼 격리 스키마 + 롤백 패턴으로 옮기거나, `afterAll`에서 생성한 행을 삭제한다(원장 FK가 걸린 행은 Phase 9 BUG-01 문서의 제약을 참고).
- 이미 쌓인 잔여 신고는 테스트 DB에서 일회성 정리한다(정리 전 대상 확인 필수).

## 검증
- 테스트 실행 전후 신고 건수가 같은지 확인하는 점검을 추가하거나 수동으로 확인.
- 2026-10-02 보완: 병렬 실행과 기존 잔여물을 고려해 이번 실행에서 생성한 신고 ID의 잔여 건수도 독립 연결에서 확인한다.

## 수정 계획 (gpt-6-sol, 2026-10-02)

### 접근 요약

- 기존 수정 방향 중 `afterAll` 명시적 정리를 택한다. 현재 reader 테스트는 Supabase Auth Admin API로 계정을 만들고 PostgREST로 신고하므로, 단일 PostgreSQL 연결의 격리 스키마·롤백을 그대로 적용할 수 없다.
- 각 테스트가 만든 신고·작품·계정 ID를 추적해 FK 자식부터 삭제하고, 모든 삭제 응답을 검사한다. 삭제 실패는 테스트 실패로 드러낸다.
- 신고 전체 건수는 병렬 테스트·기존 잔여물의 영향을 받으므로, 별도 DB 연결에서 이번 실행의 ID가 생성 중 보이고 정리 후 0건인지 확인한다.
- 과거 잔여물은 테스트 DB와 명시한 ID 목록을 먼저 확인하는 dry-run 절차로 별도 정리한다. 관리자 감사 이력과 연결된 대상은 자동 삭제하지 않는다.

### 변경 파일 목록

| 파일 | 예정 변경 |
|---|---|
| `tests/reader/reports.test.ts` | 성공 응답의 `reportId`, `create_work`의 `workId`, 작성자·신고자 ID를 모두 기록한다. `afterAll`에서 신고 → 작품의 KB 노드 → 작품 → Auth 계정 순으로 정리하고 각 PostgREST/Auth 오류와 삭제 후 잔여 건수를 검사한다. 생성 중 실패한 fixture도 추적 가능한 ID만 정리한다. 기존 `.catch(() => {})`를 없앤다. |
| `tests/helpers/db.ts` | `deleteTestUser()`가 `auth.admin.deleteUser()`의 반환 `error`를 검사해 throw하도록 바꾼다. 기존 호출자가 자체적으로 오류를 무시하는 부분은 이 버그의 수정 범위에 넣지 않는다. |
| `tests/reader/reports-cleanup.database.test.ts` (신규) | 독립 PostgreSQL 연결로 신고 fixture의 외부 가시성과 정리 후 잔여 0건을 검증한다. FK 자식이 남았을 때 삭제 실패가 숨겨지지 않는 경우도 검사한다. 테스트는 격리된 테스트 DB에서만 실행한다. |
| `scripts/cleanup-reader-report-fixtures.ts` (신규) | 과거 잔여물 전용 명령. 지정한 신고·작품·계정 ID만 대상으로 연결 DB 식별값, FK·감사 연결, 삭제 예정 목록을 출력한다. 기본은 dry-run이며 명시적 실행 플래그 없이는 삭제하지 않는다. 실삭제 시 자식부터 처리하고 잔여 건수를 확인한다. |
| `tests/reader/cleanup-reader-report-fixtures.test.ts` (신규) | 명시적 ID 부재, 운영 DB, 예상 DB 식별값 불일치, 관리자 감사 연결 시 삭제 거부와 dry-run 기본 동작을 검사한다. |

### 작업 순서 (TDD)

1. **새 신고를 남기지 않는 fixture 정리 — 커밋 제안: `fix(reader-tests): clean report fixtures and surface deletion errors`**
   - 먼저 실패하는 테스트: `tests/reader/reports-cleanup.database.test.ts`에서 별도 연결 A가 만든 신고를 연결 B가 읽는지, 정리 후 B에서 그 신고·작품·KB 노드·관련 프로필이 0건인지 검사한다. 현재 `reports.test.ts`를 실행한 뒤 생성 ID가 남는 현상도 먼저 기록한다. FK 자식이 남아 삭제가 실패할 때 테스트가 실패해야 한다.
   - 구현: `reports.test.ts`에서 성공한 `reportId`와 모든 생성 ID를 누적하고, `afterAll`에서 연결된 신고·KB 행을 먼저 삭제한 뒤 작품과 Auth 사용자를 삭제한다. 모든 응답 오류를 검사하며 `deleteTestUser()`도 Auth 오류를 throw하도록 수정한다. 다른 소유자의 행은 ID 매칭 없이 삭제하지 않는다.
   - 확인 명령: `npx vitest run tests/reader/reports-cleanup.database.test.ts tests/reader/reports.test.ts --passWithNoTests=false`; `npx vitest run tests/reader --passWithNoTests=false`; `git diff --check`. DB 연결·Auth 설정이 없어서 실패하거나 통합 케이스가 skip되면 완료로 세지 않는다.
2. **기존 잔여물의 안전한 일회성 정리 절차 — 커밋 제안: `test(reader): guard cleanup of historical report fixtures`**
   - 먼저 실패하는 테스트: `tests/reader/cleanup-reader-report-fixtures.test.ts`에 ID 미지정·환경 식별값 불일치·운영 DB·감사 연결을 거부하는 케이스와 기본 dry-run에서 삭제가 일어나지 않는 케이스를 작성한다.
   - 구현: 명시된 ID에 한해 삭제 예정 행과 연결을 출력하는 명령을 추가한다. `@novelscript.test` 이메일과 기대 DB 식별값을 함께 확인하고, 감사 이력이나 예상하지 못한 FK 연결이 있으면 실삭제를 중단한다. 승인된 목록만 실행 플래그로 삭제한다. 단순히 제목이 `테스트 작품`이라는 이유로 대상을 선택하지 않는다.
   - 확인 명령: `npx vitest run tests/reader/cleanup-reader-report-fixtures.test.ts --passWithNoTests=false`; `npx tsx scripts/cleanup-reader-report-fixtures.ts --help`; `git diff --check`. 실제 DB dry-run·삭제 명령의 구체 인자는 구현 시 CLI 계약에 맞춰 확정한다.

### 테스트 계획

- 신규 `tests/reader/reports-cleanup.database.test.ts`: 성공·실패 신고 케이스가 만든 ID만 수집, 연결 A/B 사이에 커밋된 신고 가시성 확인, 정리 후 연결 B에서 신고·작품·KB·계정 관련 행 0건 확인, FK/삭제 오류의 실패 전파. **독립 연결 A/B는 별도의 `postgres()` 인스턴스로 만든다.** 전체 `reports` 건수 비교만으로 통과시키지 않는다.
- 신규 `tests/reader/cleanup-reader-report-fixtures.test.ts`: dry-run 기본값, 명시적 대상 제한, 환경·운영 DB 가드, 감사 이력 또는 미예상 FK 연결 시 중단, 동일 목록 재실행 시 잔여 0건 확인.
- 기존 회귀: `npx vitest run tests/reader/reports.test.ts tests/reader/reports-cleanup.database.test.ts --passWithNoTests=false`, 이어서 `npx vitest run tests/reader --passWithNoTests=false`. 첫 실행과 재실행 후에도 해당 실행에서 추적한 신고 ID가 0건인지 조회한다. DB 통합 케이스의 skip 수를 기록하고 skip 0을 요구한다.
- 과거 잔여물은 실행 전후에 **승인된 ID 목록**의 신고·작품·KB·계정 건수를 비교한다. 2026-09-17 UAT의 열린 신고 12건은 당시 관측치일 뿐 현재 수량은 **미확인**이다.

### 위험과 롤백

- **데이터·배포:** 이 수정은 테스트·정리 도구만 바꾸며 마이그레이션이나 앱 배포 변경은 없다. 공유 테스트 DB에서 과거 행을 실삭제하면 복구가 어렵다. 대상 Supabase project ref/DB 식별값, dry-run 목록, FK·감사 연결을 확인한 뒤에만 실삭제한다. 현재 접속 대상과 잔여 ID는 **미확인**이다.
- `create_work`는 잠긴 KB 루트 노드를 생성한다. 일반 소프트 삭제나 Auth 사용자 삭제만으로 정리되지 않으며 `kb_nodes`의 `parent_id` FK와 다른 작품 참조를 확인해야 한다. 원장 행이 있는 사용자는 `ledger_entries → wallets` FK 때문에 Auth 삭제가 막힐 수 있다. 이 테스트가 만든 행 외의 원장·주문·관리자 감사 연결을 발견하면 자동 삭제하지 않고 대상별 정리 방침을 별도로 결정한다.
- **사용자 결정 필요(조건부):** 과거 대상에 관리자 감사 연결이 실제로 발견되면, A안은 연결 행을 보존하고 별도 깨끗한 테스트 DB에서 UAT를 진행하는 방식(추천), B안은 감사 보존 요건을 검토한 뒤 해당 신고의 삭제 허용 범위를 정하는 방식이다. 어느 쪽이 필요한지는 연결 여부를 조회하기 전에는 **미확인**이다.
- **다른 phase:** Phase 9 BUG-01의 UAT 계정 정리 문제와 대상 계정이 겹칠 수 있다. Phase 11의 `0016_ai_usage.sql` 계획은 Phase 6 BUG-01 확정 번호(0015 유지, 결제 0016, 정산 0017, 신규 0018부터)와 조율해야 하나, 이 버그에서는 새 마이그레이션을 만들거나 번호를 변경하지 않는다.
- **롤백:** 코드 커밋은 역순으로 되돌릴 수 있다. 이미 삭제한 DB 행은 Git 롤백으로 복구되지 않으므로 실삭제 전 대상 ID와 행 내용을 보관하고, 삭제 실패 시 남은 ID와 오류를 기록해 재시도·수동 복구를 판단한다. 관리자 `admin_actions`·`admin_users`의 append-only 제약은 우회하지 않는다.

### 완료 조건

- `reports.test.ts`를 두 번 실행해도 각 실행에서 만든 신고·작품·KB·계정 행이 종료 후 0건이며, 독립 연결 검증과 `tests/reader` 회귀가 DB 통합 케이스 skip 0으로 통과한다.
- 삭제 오류가 테스트 실패로 전파되고, 다른 사용자·작품·신고 ID는 정리 대상에 포함되지 않는다.
- 과거 잔여물에 대한 대상 식별·dry-run·실행 또는 감사 연결 등으로 보류한 사유가 기록되고, 승인한 대상 ID의 잔여 건수가 0임을 확인한다. 이 기록과 테스트 결과가 있어야 `bug-complete`로 넘긴다.

### 예상 규모

- 테스트·헬퍼 수정 및 신규 정리 명령 약 180~300줄(추정). DB FK별 예외 처리 범위에 따라 달라질 수 있다.
- TDD 2단계, 단계당 커밋 1개. 과거 DB 대상 확인·실삭제 소요는 현재 **미확인**이다.

## 실제 적용 내용 (bug-execute, 2026-10-02)

- `scripts/lib/report-fixture-cleanup.mjs`(신규): 명시한 신고·작품·계정 ID만 대상으로 하는 `planCleanup`/`deletionBlockers`/`deleteFixtures`. 신고 → KB 노드 → 작품 순으로 한 트랜잭션에서 삭제하고 잔여 건수를 확인한다. 관리자 감사 연결·제재 이력·비테스트 계정(`@novelscript.test` 아님)·존재하지 않는 신고 ID·ID 미지정이면 삭제를 거부한다.
- `tests/reader/reports.test.ts`: 생성한 작품·신고 ID를 추적해 `afterAll`에서 위 정리를 수행하고 실패를 전파(기존 `.catch(() => {})` 제거). `tests/helpers/db.ts`의 `deleteTestUser`는 Auth 오류를 throw. 신규 `tests/reader/reports-cleanup.database.test.ts`: 독립 연결에서 가시성·정리 후 0건·타 작품 불변·FK로 삭제 막힐 때 오류 전파·가드 단위 테스트.
- `scripts/cleanup-reader-report-fixtures.mjs`(신규): 과거 잔여물용 일회성 명령. 기본 dry-run, `--execute --expect-db <host>` 없이는 삭제하지 않음.
- 검증: `reports.test.ts` 실행 전후 원격 DB `reports` 건수 110 → 110(잔여물 0), `vitest run tests/reader tests/admin` 통과, `tsc`·eslint 통과.
- **미수행(결정 필요):** 이미 쌓인 과거 잔여물 정리. 현재 원격 DB에는 신고 110건(열린 신고 102건)이 있으나 어느 것이 테스트 잔여물인지 확정하지 못해 실삭제하지 않았다. 승인한 ID 목록을 주면 스크립트 dry-run 후 실행한다.
