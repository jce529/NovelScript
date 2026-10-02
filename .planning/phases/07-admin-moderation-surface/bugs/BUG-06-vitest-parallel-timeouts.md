---
id: BUG-06
title: 전체 vitest를 병렬로 실행하면 원격 Supabase 타임아웃으로 다수 실패한다
status: open
severity: low
found: 2026-09-17
found_during: Phase 7 실행 검증 (직렬 실행 483/483 통과, 병렬 약 11건 실패 기록)
origin_phase: 07 (테스트 인프라; 영향은 전체 스위트)
files:
  - vitest.config.ts
  - package.json
---

# BUG-06: 병렬 테스트 타임아웃

## 증상
`npx vitest run` 기본(파일 병렬) 실행 시 원격 Supabase에 동시에 연결하는 DB 테스트에서 타임아웃/`Database error creating new user`가 발생해 약 11건이 실패한다. 직렬 실행(`--no-file-parallelism`)은 통과한다. 07-03 수정 기록에도 같은 현상이 언급됐다.

## 재현
`npx vitest run` (병렬) 후 `npx vitest run --no-file-parallelism`과 결과를 비교한다.

## 기대 / 실제
- 기대: 기본 `npm test`가 안정적으로 통과한다.
- 실제: 병렬 시 실DB 의존 테스트가 불안정하다. 최근 세션에서는 DB 테스트 위주 실행(`tests/commerce tests/payments`)이 통과했으나 전체 병렬 실행은 재측정하지 않았다.

## 원인
공유 원격 DB 연결 수·부하와 테스트별 사용자 생성이 동시에 몰린다. 테스트 타임아웃도 짧다.

## 수정 방향
- DB 의존 테스트 프로젝트(또는 파일 패턴)만 직렬 실행(`poolOptions`/`fileParallelism: false` 또는 vitest projects 분리)하고 타임아웃을 상향한다. CI를 구성하기 전에 정한다. 정책 결정 불필요. **2026-10-02 설치본 확인:** Vitest 4.1.11에서 `poolOptions`는 제거되어 계획에서는 사용하지 않는다.

## 검증
- 변경 후 `npm test`를 3회 연속 실행해 모두 통과하는지 확인하고 소요 시간 변화를 기록한다. 먼저 현재 실패 건수를 재측정해 이 문서의 수치를 갱신한다.

## 수정 계획 (gpt-6-sol, 2026-10-02)

### 접근 요약

- 설치된 Vitest 4.1.11의 `test.projects`로 DB 통합 테스트와 단위 테스트를 나누고, DB 프로젝트에만 `fileParallelism: false`를 둔다. Vitest 4에서 제거된 `poolOptions`는 사용하지 않는다.
- 현재 `tests/**/*.test.ts` 102개 중 직접 DB 연결 흔적(`SUPABASE_DB_URL` 또는 `postgres(...)`)이 있는 파일은 8개, 나머지는 94개다. 이 분류를 출발점으로 삼되, 실행 시 프로젝트별 수집 결과가 전체 파일을 누락·중복 없이 덮는지 검사한다.
- DB 프로젝트의 `testTimeout`·`hookTimeout`은 재측정한 실패 유형과 소요 시간에 근거해 조정한다. 현재 전역 값은 각각 30초이며, `tests/admin/concurrency.database.test.ts`에는 120초짜리 개별 `beforeAll`·`afterAll` 제한이 있다. 상향할 구체 값은 재측정 전 **미확인**이다.
- `npm test`의 단위 테스트 병렬 실행은 유지하고, 전체 직렬 실행은 비교 기준으로만 사용한다. 새 정책 결정은 필요 없다.

### 변경 파일 목록

| 파일 | 계획 |
|---|---|
| `vitest.config.ts` | 공통 `node` 환경·`loadEnv`·`@`/`server-only` 별칭을 유지하면서 이름 있는 DB/단위 프로젝트를 정의한다. DB에는 `tests/**/*.database.test.ts`, `tests/**/*-db.test.ts`, 예외인 `tests/commerce/settlement.test.ts`를 배정하고 파일 병렬성을 끈다. 단위 프로젝트에서는 같은 패턴을 제외해 중복 실행을 막는다. DB 시간 제한은 재측정 근거가 있을 때만 프로젝트 범위에서 상향한다. |
| `tests/config/vitest-projects.test.ts` (신규) | 설정이 수집하는 테스트 파일의 DB/단위 배정을 검증한다. 현재 8개 DB 파일과 단위 파일이 정확히 한 프로젝트에만 속하고, 별칭·환경·시간 제한이 프로젝트 분리 후에도 유지되는지 확인한다. |
| `tests/admin/concurrency.database.test.ts` (기존) | 코드 변경 예정 없음. 이 파일은 이미 `postgres(url, { max: 1 })`로 제어 연결과 별도 세션 A/B를 열어 실제 잠금 경합을 검증하므로 회귀 게이트로 사용한다. |
| `package.json` | 현재 `test` 스크립트가 `vitest run`이므로 변경 예정 없음. 프로젝트 분리 후 스크립트 변경이 필요한지는 미확인이다. |

### 작업 순서 (TDD)

1. **프로젝트 배정·DB 파일 직렬화 — 커밋 제안: `fix(test): serialize database suites in vitest projects`**
   - 먼저 실패하는 테스트: `tests/config/vitest-projects.test.ts`에 발견된 모든 파일의 누락·중복 없는 배정, 직접 DB 연결 8개 파일의 DB 프로젝트 배정, 일반 단위 파일의 단위 프로젝트 배정, DB 프로젝트만 `fileParallelism: false`인 조건을 작성한다. 현재 단일 프로젝트 설정에서 `npx vitest run tests/config/vitest-projects.test.ts`가 실패하는 것을 확인한다. 새 테스트 파일 자신도 단위 프로젝트에 한 번만 수집돼야 한다.
   - 구현: `vitest.config.ts`에 `test.projects` 두 개를 정의하고 공통 설정의 상속·적용을 확인한다. `tests/commerce/settlement.test.ts`처럼 파일명만으로 DB 의존성이 드러나지 않는 예외를 명시한다. DB 전용 시간 제한은 먼저 병렬·직렬 기준 실행의 실패 유형과 소요 시간을 기록한 뒤, 실제 제한 초과가 확인되면 측정치에 근거한 값으로 상향한다. 연결 실패만 확인되면 시간 제한을 임의로 늘리지 않는다.
   - 확인 명령: `npx vitest run tests/config/vitest-projects.test.ts`; `npx vitest run tests/admin/concurrency.database.test.ts`; `npx vitest run tests/commerce tests/payments`; `npm test` 3회 연속 실행. 전후 실행 시간과 실패·skip 수를 기록하고, `npx vitest run --no-file-parallelism`을 비교 실행한다. 커밋은 DB 통합 테스트가 실제 실행되고 전체 스위트 3회가 통과한 뒤에만 만든다.

### 테스트 계획

- 신규 `tests/config/vitest-projects.test.ts`: (1) 현재 DB 8개 파일의 배정, (2) 모든 발견된 테스트 파일의 정확히 한 번 배정, (3) DB만 파일 직렬 실행·단위는 병렬 허용, (4) 분리 뒤 공통 별칭·환경 및 시간 제한 유지. 102/8/94는 2026-10-02 조사 시점의 기준 수치이며, 이후 파일이 추가되면 수집 총수와 신규 DB 파일의 분류를 다시 확인한다.
- 독립 연결 동시성 회귀: `tests/admin/concurrency.database.test.ts`의 세션 A/B와 제어 연결이 서로 다른 PostgreSQL 연결인지 확인하고, 잠금 대기 후 중복 요청·롤백·결제/블라인드 경합 케이스를 실제 DB에서 실행한다. `SUPABASE_DB_URL` 부재로 skip되면 통과로 세지 않는다.
- 기존 회귀 명령: `npx vitest run tests/admin/concurrency.database.test.ts`; `npx vitest run tests/commerce tests/payments`; `npm test` 3회. 첫 실행 전 `npm test`와 `npx vitest run --no-file-parallelism`의 현재 실패 건수·시간을 재측정한다. 원격 DB를 쓰는 실행은 연결된 환경을 확인하고 skip 수를 함께 기록한다.

### 위험과 롤백

- 데이터·배포: 계획 자체는 SQL·데이터를 바꾸지 않는다. 검증은 실제 원격 Supabase에 연결하는 테스트를 실행하므로 테스트가 사용하는 대상 환경과 정리 동작을 먼저 확인한다. 배포 설정 변경은 없다.
- DB 테스트 패턴에서 새 파일이 빠지면 단위 프로젝트에서 병렬로 돌 수 있다. 특히 Phase 11의 예정 파일 `tests/ai/ai-usage-db.test.ts`는 `*-db.test.ts` 규칙으로 DB 프로젝트에 포함되어야 하며, 실행 당시 수집 결과로 확인한다. Phase 11의 기존 `--no-file-parallelism` 명령은 전체 직렬 비교로 계속 동작하는지 확인한다.
- Phase 6 BUG-01의 확정 번호를 따른다: `0015_byok_secret_cleanup.sql` 유지, payments→`0016`, settlement→`0017`, 신규 마이그레이션은 `0018`부터다. 이 버그에서는 마이그레이션을 만들거나 번호를 바꾸지 않는다. 현재 Phase 11 계획의 `0016_ai_usage.sql` 언급은 별도 번호 조율 대상이며 이 문서의 설정 변경으로 해결되지 않는다.
- 프로젝트 설정이 공통 별칭·환경 값을 잃거나 DB와 단위 프로젝트가 동시에 DB에 접속하면 실패가 재발할 수 있다. 해당 커밋의 `vitest.config.ts`와 신규 설정 테스트를 되돌리고 기존 `vitest run --no-file-parallelism`으로 임시 검증한다. DB 데이터 롤백은 이 변경에 해당하지 않는다.

### 완료 조건

- 기준선의 실패 건수와 실행 시간, 변경 후 `npm test` 3회 각각의 통과·실패·skip 수와 시간을 이 문서에 기록한다. 연결 가능한 테스트 DB에서 DB 프로젝트의 통합 테스트가 skip 0으로 실행된다.
- 신규 배정 검사가 통과하고 DB 파일은 한 프로젝트에서만 실행된다. `tests/admin/concurrency.database.test.ts`의 독립 연결 경합 케이스와 `tests/commerce tests/payments` 회귀가 통과한다.
- 단위 프로젝트 병렬성은 유지되고 DB 프로젝트 파일 실행만 직렬화된다. 타임아웃 조정 여부와 근거를 기록한다. 이 조건을 검증한 뒤 `bug-complete`로 넘긴다.

### 예상 규모

- 구현 1단계·1커밋. `vitest.config.ts` 약 20~40줄 변경, 신규 배정 테스트 약 40~70줄, 총 약 60~110줄을 예상한다. 테스트/DB 상태에 따라 실제 소요 시간은 **미확인**이다.

## 실제 적용 내용 (bug-execute, 2026-10-02)

- `vitest.config.ts`: `test.projects`로 `unit`(파일 병렬 유지)과 `db`(`fileParallelism: false`)를 분리하고 공통 `env`·alias·타임아웃(30초)은 `extends: true`로 상속. DB 프로젝트 배정은 파일 **내용** 기준(`helpers/db` import, `SUPABASE_DB_URL`·`SUPABASE_SERVICE_ROLE_KEY`·`postgres(` 사용)으로 자동 분류한다. 계획은 직접 DB 연결 8개 파일만 대상으로 했지만, 실제로는 Auth/PostgREST로 계정을 만드는 약 48개 파일이 원격 프로젝트에 부하를 주므로 이 범위로 넓혔다. `poolOptions`는 사용하지 않음(Vitest 4). 타임아웃은 상향하지 않았다(재측정 결과 실패 원인이 시간 초과가 아니었음).
- 신규 `tests/config/vitest-projects.test.ts`: 모든 테스트 파일이 정확히 한 프로젝트에 배정, DB만 직렬, 대표 DB·단위 파일 배정, 상속 설정 유지 검증.
- 기준선 재측정(변경 전, 병렬 `npx vitest run`): 8~9건 실패 / 1132 통과, 약 250~270초. 단, 이 기준선의 실패는 타임아웃이 아니라 같은 시점에 바꾼 `deleteTestUser`가 Auth 삭제 오류를 던져 생긴 것이었다(원장 행이 있는 테스트 계정은 삭제 불가, Phase 9 BUG-01). `deleteTestUser`를 원래의 best-effort로 되돌리고 오류를 던지는 `deleteTestUserStrict`를 별도로 추가해 해결.
- 변경 후 `npm test`: 1회 113파일 1147개 전부 통과(213초), 2회 1건 실패(Phase 8 BUG-06 동시성 DB 테스트의 타이밍 가정 — 테스트를 수정함), 3회 전부 통과(217초). 수정 후 최종 재실행 결과는 아래 최종 보고 참고. 변경 전 병렬 실행의 원격 DB 타임아웃(약 11건 기록)은 이번 환경에서는 재현되지 않았고, 시간 단축 효과는 확인되지 않았다(직렬화로 안정성을 우선).
- 미수행: `--no-file-parallelism` 전체 직렬 실행과의 시간 비교, `tests/ai/ai-usage-db.test.ts`(Phase 11 예정)가 `db`로 분류되는지는 파일 생성 후 확인 필요(`helpers/db` 사용 시 자동 분류).
