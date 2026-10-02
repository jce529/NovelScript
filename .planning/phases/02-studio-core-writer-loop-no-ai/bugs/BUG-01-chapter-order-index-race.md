---
id: BUG-01
title: 회차 동시 생성 시 order_index 중복으로 한 요청이 실패한다
status: open
severity: medium
found: 2026-10-02
found_during: Codex(gpt-6-luna) 코드베이스 리스크 점검(risk-report.md) 후 코드 대조
origin_phase: 02 (9112f4a feat(02-04): implement chapter draft/publish/edit/unpublish)
files:
  - lib/chapters/actions.ts
  - app/studio/[workId]/chapters/new/actions.ts
  - supabase/migrations/0002_studio.sql
---

# BUG-01: 회차 동시 생성 시 order_index 중복

## 증상
같은 작품에서 회차 생성 요청이 거의 동시에 들어오면 한 쪽이 `chapters_work_order_uniq` 위반으로 실패하고, 사용자에게 DB 원문 오류 메시지가 그대로 노출된다.

## 재현
1. 같은 작품의 회차 생성을 두 번 동시에 호출한다(두 탭에서 거의 동시에 "새 회차", 더블클릭, 또는 `Promise.all`로 `createChapter` 2회).
2. 두 호출이 같은 `MAX(order_index)`를 읽고 같은 `nextOrder`를 계산한다.
3. 두 번째 INSERT가 유니크 제약에 걸린다.

## 기대 / 실제
- 기대: 두 요청 모두 성공하고 순번이 연속(N, N+1)이다. 실패하더라도 사용자 문구로 안내하고 재시도할 수 있다.
- 실제: `lib/chapters/actions.ts`의 `createChapter`가 `select max → insert`를 별개 요청으로 실행해 원자적이지 않다. 실패 시 `error.message`(DB 원문)를 그대로 반환한다.

## 원인
- `createChapter`가 최대값 조회(`order_index desc limit 1`)와 INSERT 사이에 잠금이 없다(`lib/chapters/actions.ts` 약 65행).
- `chapters_work_order_uniq (work_id, order_index) deferrable initially deferred`(0002_studio.sql:86) 때문에 충돌은 데이터 오염이 아니라 생성 요청 실패로 나타난다. 데이터 손상 위험은 없고 실패 UX 문제다. (2026-10-02 코드 재확인: 제약 검사 시점은 INSERT 문 자체가 아니라 트랜잭션 종료일 수 있다.)
- 최대값 조회가 `deleted_at`을 필터링하지 않아 삭제된 회차의 순번도 계속 소비한다(의도인지 별도 확인 필요, 이 버그의 원인은 아님).

## 수정 방향
- 순번 부여를 DB 쪽에서 원자적으로 처리한다: 작품 행 잠금(`select ... from works where id = $1 for update`) 후 `coalesce(max(order_index), -1) + 1`로 INSERT하는 SQL 함수(RPC)로 옮긴다. 정책 결정은 필요 없다.
- 대안(RPC 없이): 유니크 위반(SQLSTATE 23505) 시 최대 3회 재시도. 구현은 단순하지만 경합이 심하면 재시도 소진 가능.
- 어느 쪽이든 실패 시 DB 원문 대신 사용자 문구를 반환한다.
- 새 마이그레이션이 필요하면 다음 빈 번호를 사용한다(번호 정리는 Phase 6 BUG-01 참고).

## 검증
- 독립 연결 2개(또는 `Promise.all`)로 `createChapter`를 동시에 N회 호출해 모두 성공하고 `order_index`가 중복 없이 연속인지 확인하는 DB 테스트를 추가한다(재현 테스트를 먼저 작성해 실패를 확인).
- 기존 `tests/chapters/*`(재정렬 포함) 회귀 통과 확인.

## 수정 계획 (gpt-6-sol, 2026-10-02)

### 접근 요약
- 확정된 수정 방향대로 작품 행을 `FOR UPDATE`로 잠근 뒤 같은 DB 트랜잭션에서 현재 최대 `order_index + 1`을 계산·삽입하는 RPC를 추가한다. 기존의 삭제 회차 포함 최대값 계산을 유지한다.
- RPC가 `SECURITY DEFINER`라면 호출자 신원·작품 소유권·쓰기 제한·회차 폴더 유효성을 함수 안에서도 검사하고, 실행 권한을 명시적으로 제한한다. 서버의 기존 사전 검사만 신뢰하지 않는다.
- `createChapter`는 검증과 기존 `ChapterMutationResult` 계약을 유지하면서 순번 조회·직접 INSERT를 RPC 호출로 교체하고, DB 원문 오류는 사용자 문구로 치환한다.
- 정책 결정은 추가로 필요하지 않다. 다만 마이그레이션 번호는 Phase 6 BUG-01의 재번호링과 Phase 11의 새 마이그레이션 번호를 실행 직전에 조율한다.

### 변경 파일 목록
| 파일 | 계획된 변경 |
| --- | --- |
| `supabase/migrations/0018_create_chapter_atomic.sql` (가칭) | **Phase 6 BUG-01 재번호링 후 번호 재확인**. `0015_byok_secret_cleanup.sql` 유지, payments→`0016`, settlement→`0017`; 신규 번호는 `0018` 이상에서 고유한 번호를 선택한다. 소유 작품 행 잠금→최대 순번 조회→회차 INSERT→ID 반환 RPC, 입력·폴더·쓰기 제한 검사, 고정 `search_path`, `PUBLIC`/`anon` 권한 회수와 필요한 역할에만 `EXECUTE` 부여, PostgREST 스키마 갱신을 담는다. 기존 `0002_studio.sql`은 수정하지 않는다. |
| `lib/chapters/actions.ts` | `createChapter`의 `MAX` 조회와 직접 INSERT를 RPC 호출로 교체한다. 제목·작품·폴더 사전 검사는 유지하고 RPC 오류를 DB 세부 정보가 없는 문구/기존 쓰기 제한 코드로 변환한다. |
| `tests/chapters/order-race.database.test.ts` (신규) | 실제 PostgreSQL의 커밋된 격리 스키마와 독립 연결을 사용해 잠금 경합, 최종 순번, 권한·폴더·롤백을 검증한다. |
| `tests/chapters/draft.test.ts` | 순차 생성의 기본값·반환 ID·원문 오류 비노출 회귀를 보강한다. 기존 테스트의 서비스 롤 호출 경로도 유지되는지 확인한다. |

`app/studio/[workId]/chapters/new/actions.ts`는 이미 로그인 사용자를 `createChapter`로 전달한다. `page.tsx`도 실패 문구를 표시하고 제출 중 버튼을 비활성화하므로 변경 대상이 아니다. **2026-10-02 코드 확인:** Phase 11의 `11-01-PLAN.md`에는 아직 `0016_ai_usage.sql`이 적혀 있고, 현재 실제 마이그레이션 파일에는 `0015`가 3개 있다. Phase 6 BUG-01의 확정안을 먼저 반영하고 Phase 11 계획·실제 파일과 번호를 조율하지 않으면 `0018`을 확정 번호로 간주하지 않는다.

### 작업 순서 (TDD)
1. **DB 원자 생성 — 1커밋 (`fix(chapters): serialize chapter creation in database`)**  
   먼저 실패하는 테스트: `tests/chapters/order-race.database.test.ts`에서 두 독립 연결의 기존 `MAX` 조회를 같은 시점에 완료시킨 뒤 각각 INSERT·커밋해 한 요청의 `23505`를 재현한다. 이어 새 RPC 호출의 잠금 대기·두 요청 성공을 기대하는 테스트를 작성해 함수 부재로 실패시킨다. 커밋된 테스트 fixture, 두 연결, `pg_stat_activity` 대기 확인 패턴은 `tests/admin/concurrency.database.test.ts`를 따른다.  
   구현: Phase 6 번호 정리 후 고유한 `0018` 이상 번호로 마이그레이션을 추가한다. RPC는 `p_owner_id`, `p_work_id`, 제목, nullable 폴더를 받아 호출자와 소유권을 검증하고, 작품 행 잠금 뒤 삭제 회차까지 포함한 `MAX(order_index)`를 읽어 INSERT한다. `SECURITY DEFINER`로 RLS를 우회하는 만큼 `user_can_write`를 포함한 DB 쪽 검사를 둔다. 기존 테스트의 서비스 롤 사용도 검증 가능한 명시적 서비스 롤 경로로 처리한다.  
   확인 명령: `npx vitest run tests/chapters/order-race.database.test.ts --no-file-parallelism --reporter=verbose` (실제 DB 연결, skipped 0), `npx vitest run tests/admin/concurrency.database.test.ts --no-file-parallelism`.
2. **호출 경로·오류 문구 — 1커밋 (`fix(chapters): call atomic create RPC and hide database errors`)**  
   먼저 실패하는 테스트: `tests/chapters/draft.test.ts`에 정상 생성이 새 RPC를 거쳐 기존 초안 기본값과 ID를 유지하는 케이스, 강제 DB 오류에서 원문을 반환하지 않는 케이스를 추가한다. 기존 소유권·폴더·쓰기 제한 거절도 회귀 대상으로 둔다.  
   구현: `lib/chapters/actions.ts`의 두 요청을 하나의 RPC 호출로 바꾸고 오류별 안전한 사용자 문구를 반환한다. DB가 검증한 값과 기존 결과 형태를 유지한다.  
   확인 명령: `npx vitest run tests/chapters --no-file-parallelism --reporter=verbose`, `npx vitest run tests/admin/sanctions.test.ts --no-file-parallelism`, `npx tsc --noEmit`.

### 테스트 계획
- 신규 `tests/chapters/order-race.database.test.ts`: 첫 회차 0, 같은 작품에 서로 다른 **실제 DB 연결 2개**로 동시 호출했을 때 잠금 대기 후 두 성공·서로 다른 ID·연속 순번, 여러 동시 호출의 중복 없음, 다른 작품 간 독립 진행, 첫 트랜잭션 롤백 후 대기 호출의 정상 순번, 남의 작품/삭제 작품/무효 폴더/쓰기 제한 계정/익명 호출의 거절과 행 증가 없음, 서비스 롤 경로의 범위 확인. 단일 연결의 외부 롤백 fixture는 다른 연결에 보이지 않으므로 `tests/admin/concurrency.database.test.ts`처럼 커밋된 임시 스키마를 사용하고 종료 시 스키마·연결을 정리한다. 실패를 재현할 때는 잠금 대기 또는 동기화 장벽을 사용해 `Promise.all`의 타이밍 운에만 기대지 않는다.
- 기존 `tests/chapters/draft.test.ts`: 순차 0·1·2, 제목 검증, 기본 초안 상태, RPC 오류 문구, 기존 서비스 롤 호출 경로. `tests/chapters/folder-grouping.test.ts`, `ownership-guard.test.ts`, `reorder.test.ts`를 포함해 `npx vitest run tests/chapters --no-file-parallelism --reporter=verbose` 실행. 쓰기 제한 회귀는 `npx vitest run tests/admin/sanctions.test.ts --no-file-parallelism`로 확인한다.
- DB 환경변수가 없어 테스트가 skip되면 완료로 인정하지 않는다. 새 마이그레이션 적용 전 실패와 적용 후 통과를 같은 격리 DB 조건에서 확인한다.

### 위험과 롤백
- 데이터: 새 함수는 기존 순번을 재배열하거나 기존 행을 변경하지 않는다. 제약은 지연 검사되므로 실패 응답은 트랜잭션 종료 시에도 발생할 수 있다. RPC 밖의 직접 INSERT와 `reorder_chapters`는 같은 작품 행 잠금 규약을 따르지 않으므로 그 경합은 이 버그의 보장 범위 밖이다. 삭제 회차를 포함해 최대값을 계산하는 현행 의미를 유지한다.
- 보안·배포: 잘못된 `SECURITY DEFINER` 권한/검색 경로 또는 서비스 롤 예외는 다른 작품 생성·정지 계정 쓰기를 허용할 수 있다. DB 권한 테스트 후 **마이그레이션 적용 → PostgREST 함수 인식 확인 → 앱 배포** 순서로 진행한다. 앱이 먼저 배포되면 RPC 미존재로 회차 생성이 실패한다.
- Phase 6/11: Phase 6 BUG-01의 `0015` 유지·payments `0016`·settlement `0017` 확정안이 선행 조건이다. Phase 11의 문서상 `0016_ai_usage.sql`은 그 확정안과 충돌하며 아직 현재 마이그레이션 디렉터리에는 파일이 없다(2026-10-02 코드 확인). Phase 11 실행 전 번호를 재조율하고 이 수정에는 그때 비어 있는 `0018` 이상 번호를 쓴다. 원격 적용 이력과 실제 적용 상태는 **미확인**이다.
- 롤백: 앱 변경을 이전 호출 방식으로 되돌린 뒤, 새 함수가 다른 호출처에서 사용되지 않음을 확인하고 별도 하향 마이그레이션에서 함수/권한을 제거한다. 이미 적용한 마이그레이션 파일을 삭제·재번호링하거나 기존 회차 순번을 일괄 수정하지 않는다. 경합 버그가 롤백 후 다시 나타나는 점을 운영 판단에 포함한다.

### 완료 조건
- 실제 독립 연결 DB 테스트에서 같은 작품의 경합 요청이 모두 성공하고 최종 `(work_id, order_index)`가 중복 없이 연속이다. 실패·롤백·권한 케이스와 `tests/chapters/*` 및 쓰기 제한 회귀가 skip 없이 통과한다.
- 생성 실패에 DB 원문이 노출되지 않고, 기존 초안 기본값·폴더·소유권·정지 계정 동작이 유지된다. `npx tsc --noEmit`이 통과한다.
- 마이그레이션 번호가 Phase 6 확정안 및 Phase 11과 충돌하지 않고, 실제 적용 DB에서 새 RPC와 권한이 확인된다. 두 코드 커밋과 검증 근거가 남아 `bug-complete`로 넘길 수 있다.

### 예상 규모
- **2단계·2커밋**, 마이그레이션 약 60~100줄, 호출부 약 15~30줄 수정, 신규/기존 테스트 약 140~220줄(총 변경량 대략 215~350줄). DB 경합 테스트 환경과 번호 조율이 소요를 좌우한다.
