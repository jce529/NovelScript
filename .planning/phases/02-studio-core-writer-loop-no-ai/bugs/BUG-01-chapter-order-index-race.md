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
- `chapters_work_order_uniq (work_id, order_index) deferrable initially deferred`(0002_studio.sql:86) 때문에 충돌은 데이터 오염이 아니라 INSERT 실패로 나타난다. 데이터 손상 위험은 없고 실패 UX 문제다.
- 최대값 조회가 `deleted_at`을 필터링하지 않아 삭제된 회차의 순번도 계속 소비한다(의도인지 별도 확인 필요, 이 버그의 원인은 아님).

## 수정 방향
- 순번 부여를 DB 쪽에서 원자적으로 처리한다: 작품 행 잠금(`select ... from works where id = $1 for update`) 후 `coalesce(max(order_index), -1) + 1`로 INSERT하는 SQL 함수(RPC)로 옮긴다. 정책 결정은 필요 없다.
- 대안(RPC 없이): 유니크 위반(SQLSTATE 23505) 시 최대 3회 재시도. 구현은 단순하지만 경합이 심하면 재시도 소진 가능.
- 어느 쪽이든 실패 시 DB 원문 대신 사용자 문구를 반환한다.
- 새 마이그레이션이 필요하면 다음 빈 번호를 사용한다(번호 정리는 Phase 6 BUG-01 참고).

## 검증
- 독립 연결 2개(또는 `Promise.all`)로 `createChapter`를 동시에 N회 호출해 모두 성공하고 `order_index`가 중복 없이 연속인지 확인하는 DB 테스트를 추가한다(재현 테스트를 먼저 작성해 실패를 확인).
- 기존 `tests/chapters/*`(재정렬 포함) 회귀 통과 확인.
