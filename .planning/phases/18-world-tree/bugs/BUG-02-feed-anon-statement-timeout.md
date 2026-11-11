---
id: BUG-02
title: 비로그인 홈 피드가 공개 읽기 정책의 함수 호출 비용 때문에 statement timeout으로 500
status: open
severity: high
found: 2026-11-05
found_during: 공유 DB 마이그레이션 적용 직후 로컬 앱(공유 DB 연결) 스모크
origin_phase: 18 (0036 `19dfe1f` feat(18-04), 0033 `087f7f4` feat(18-14))
files:
  - supabase/migrations/0033_world_tree_eligibility.sql
  - supabase/migrations/0036_world_tree_reader_visibility.sql
  - lib/discovery/actions.ts
  - app/page.tsx
---

# BUG-02: 비로그인 홈 피드가 statement timeout으로 500

## 증상

공유 DB(0033·0036 적용 뒤)에 연결한 앱에서 로그인하지 않고 홈 `/`을 열면 서버 오류 화면("This page couldn't load")이 뜬다. 서버 콘솔에는 `Uncaught Error: canceling statement due to statement timeout`이 `listFeed`에서 발생한다. 같은 피드가 **로그인한 상태에서는 정상 렌더**된다(authenticated 역할의 제한시간이 더 길기 때문으로 본다).

## 재현

1. 공유 DB(0033~0036 적용) 또는 같은 규모의 DB에 연결한 앱을 띄운다.
2. 시크릿 창에서 `/`을 연다 → 500.
3. DB 쪽 재현(읽기 전용): 아래 쿼리를 `set local role anon`으로 `EXPLAIN (ANALYZE, BUFFERS)`.

```sql
select w.id, w.title, w.synopsis, w.cover_image_url, w.genre, w.created_at,
  (select json_agg(json_build_object('v', c.view_count, 'o', c.order_index, 'p', c.is_published, 'd', c.deleted_at))
     from chapters c where c.work_id = w.id) as chapters
from works w where w.deleted_at is null and w.admin_blinded = false order by w.id limit 1000;
```

측정(공유 DB, 2026-11-05): works 511개·chapters 625개가 anon에게 보이고 **Execution Time 1,440ms, buffers 36,421**(works 스캔 약 16k + chapters 정책 평가 약 20k). 이 쿼리는 PostgREST가 만드는 실제 쿼리보다 단순해서, 실제 경로는 anon 제한시간(기본 3초)을 넘는다.

## 기대 / 실제

- 기대: 공개 피드가 작품 수백~수천 개에서도 anon으로 수백 ms 안에 응답한다.
- 실제: 작품이 511개 보이는 규모에서 1.4초(단순 쿼리 기준), 실제 경로는 타임아웃. 작품 수에 비례해 느려진다(작품당 약 2.8ms).

## 원인

0036이 공개 읽기 정책을 값싼 조건에서 **행마다 함수를 호출하는 조건**으로 바꿨다.

| 정책 | 0003(이전) | 0036(현재) |
|---|---|---|
| `works_public_read` | `deleted_at is null` | `world_work_public_meta_visible(id)` |
| `chapters_public_read` | `is_published = true and deleted_at is null` | `... and world_work_public_meta_visible(work_id)` |

- `world_work_public_meta_visible`은 `STABLE SECURITY DEFINER` SQL 함수라 인라인되지 않고 **행마다 호출**된다. 한 번 호출할 때 `world_work_reader_visible`(works 조회 + `exists` chapters)을 중첩 호출하고, 실패하면 works를 한 번 더 조회하고 chapters `exists`를 다시 돌린다 → 한 호출에 works·chapters 조회가 4번 안팎.
- 피드는 `works`에 `chapters(...)`를 붙여서 읽는다. works 행마다 정책이 돌고, 붙는 chapters 행마다 `chapters_public_read`가 또 돌아서 호출 수가 (작품 수 + 회차 수)에 비례한다.
- `chapters` 행 정책에서는 "발행된 회차가 하나라도 있다"는 조건이 그 행 자체로 항상 참인데도 함수가 이를 다시 검사한다.
- 인덱스는 `chapters_work_order_uniq(work_id, order_index)`뿐이라 `exists(... is_published and deleted_at is null)`용 부분 인덱스가 없다.

(단위 테스트와 합성 데이터 리허설에서는 발행 회차가 거의 없어서 이 비용이 드러나지 않았다.)

## 수정 방향

> 정책·구조 트레이드오프가 있어 **사용자 확정 대기**. 아래는 옵션이며 성능 수치는 아직 측정 전이다(bug-execute에서 벤치마크).

- **A. 정책 단순화 + 함수 정리 (최소 변경).**
  `chapters_public_read`는 `is_published and deleted_at is null and (works 행이 삭제·가지 초안이 아님)`만 보게 하고(발행 회차라는 사실이 이미 "발행 회차 존재"를 보장), `world_work_public_meta_visible`을 중첩 호출 없이 한 번의 질의로 풀어 쓴다. 작품 수가 커져도 선형은 유지되지만 호출당 비용을 크게 줄인다. 공개 가시성의 단일 정의(0033 주석: "ONE definition")를 지키려면 chapters용 가벼운 함수를 새로 두고 같은 조건을 테스트로 묶어야 한다.
- **B. `works`에 가시성 플래그를 두고 정책에서 컬럼만 본다.**
  `works.public_visible`(또는 `has_published_chapter`)를 chapters·works 변경 트리거로 유지하고 정책은 `using (public_visible)`로 바꾼다. 정책 비용이 O(1)이라 가장 빠르지만 트리거 누락 시 노출·미노출 오류 위험이 있고, 백필과 일관성 테스트가 필요하다.
- **C. 피드를 전용 RPC로 분리.**
  `list_feed_works(genre)` SECURITY DEFINER가 집계(조회수 합·발행 회차 수)까지 한 쿼리로 돌려주게 하고 클라이언트의 1000행 반복 읽기·좋아요 150개 배치 읽기를 없앤다. 정책 비용을 우회하지만 정책 자체의 비용(상세 페이지·검색 등 다른 공개 읽기)은 남는다.
- **D. 보조책(어느 쪽을 택해도 병행 가능):** `create index on chapters(work_id) where is_published and deleted_at is null`, 익명 홈 캐싱(`revalidate`), 피드 페이지 크기 축소.

추천(제안): **A + D를 먼저**(작고 안전), 부족하면 B 또는 C. 확정은 사용자에게 받는다.

## 검증

- 단위: 새 가시성 함수가 기존 `world_work_public_meta_visible`과 같은 진리표를 갖는지(삭제·가지 초안·admin blind·발행 회차 없음 조합) DB 테스트(`tests/world-tree/visibility.database`) 확장.
- 성능: 발행 회차 500개 규모의 합성 데이터를 일회용 DB에서 만든 뒤 위 `EXPLAIN` 재측정. 목표는 anon으로 홈 피드 전체 경로가 제한시간의 절반 이하(1.5초 미만).
- 회귀: 비로그인 홈 렌더, 작품 상세·뷰어의 공개 읽기, admin blind 작품의 메타 노출(0009 계약), 세계수 독자 화면.
- 적용: 수정은 새 마이그레이션이 되므로 공유 DB에도 같은 방식(파일 단위, 정지점)으로 적용한다.

## 적용 기록 (진행 중, 2026-11-06 저장 시점)

사용자가 A+D로 확정해 `bug-execute`를 시작했고, 사용자 요청으로 중간에 멈추고 저장했다. **미완료·미검증 상태**다.

- 작성됨: `supabase/migrations/0050_feed_public_read_cost.sql`(번호는 Phase 14의 0041·0042와 겹치지 않게 0050으로 잡았으며 병합 때 재조정 가능), `tests/world-tree/public-read-cost.database.test.ts`.
  - 0050: `world_work_base_visible`(회차 정책용 한 번 조회 헬퍼) 추가, `world_work_public_meta_visible`을 중첩 호출 없이 한 질의로 재작성(의미는 0036과 동일), `chapters_public_read`를 새 헬퍼로 교체, 부분 인덱스 `chapters_work_published_idx` 추가.
- D 중 **캐싱·피드 페이지 크기 축소는 하지 않았다.** 인덱스만 포함했고, A 적용 후 측정으로 부족할 때 추가한다.
- 검증은 끝나지 않았다. 테스트를 먼저 썼고(마이그레이션 없이 실행하면 `ENOENT`로 실패, 의도한 red), 0050을 넣은 뒤 실행했으나 그 실행은 PC가 중간에 절전 상태가 되어 소요 시간이 86,400초로 기록되고 `ECONNRESET`이 섞여 **결과를 믿을 수 없다**(BUG-02 테스트 6개 실패 포함, 기존 `visibility.database`의 1건도 같은 오류). 같은 조건에서 다시 실행해야 한다.
- 남은 작업: ① `tests/world-tree/public-read-cost.database` + `visibility.database` 재실행(일회용 DB, 한도 간섭을 피해 Phase 14 세션이 DB 테스트를 돌리지 않을 때) ② 발행 회차 약 500개 합성 데이터로 `EXPLAIN` 재측정 ③ `tsc`·`eslint` ④ 일회용 DB에 0050 적용 후 비로그인 홈 렌더 확인 ⑤ 공유 DB 적용(파일 단위, 승인) ⑥ 수정 완료 후 `/bug-complete`.

## 검증 기록 (2026-11-11, 일회용 `anzafn…`)

- **DB 테스트:** `tests/world-tree/public-read-cost.database` + `visibility.database`를 `--mode disposable`로 재실행해 **29/29 통과**했다(이전 실행은 PC 절전으로 무효). 이 과정에서 테스트 쪽 결함 둘을 고쳤다: 차단 작품 시드가 `works_admin_blind_shape` 제약(`admin_blind_reason`·`admin_blinded_at` 필요)을 어겼고, "정책 본문이 평평하다" 검사가 함수 정의 머리글의 자기 이름까지 중첩 호출로 셌다. 마이그레이션(0050)은 바꾸지 않았다.
- **EXPLAIN 재측정:** 격리 스키마(작품 500·발행 회차 1,000, 롤백)에서 anon 피드 쿼리(위 재현 쿼리) 최소값 **225ms → 22ms(약 10배), buffers 11,010 → 8,010**. 절대값은 공유 DB의 1,440ms(작품 511·회차 625)보다 작다. 공유 DB는 네트워크·캐시 조건이 달라 같은 수치가 나온다고 보장하지 못하므로, **공유 DB 적용 후 비로그인 홈 실제 렌더로 최종 확인**해야 한다.
- **anon 노출 검토:** 새 헬퍼 `world_work_base_visible(uuid)`는 anon이 실행할 수 있어야 정책이 동작한다(정책 식은 호출자 권한으로 평가). 기존 `world_work_reader_visible`·`world_work_public_meta_visible`도 이미 anon에게 열려 있어 같은 종류의 존재 여부 질의가 가능했다. 새 헬퍼는 발행 회차가 없는 미삭제 작품에도 참을 돌려주므로 노출 범위가 조금 넓다. 작품 ID는 v4 UUID라 추측이 어렵고 내용은 노출되지 않아 수용하기로 한다(내용·제목은 돌려주지 않는 불리언이다).
- **남은 일:** 공유 DB에 0050 적용(파일 단위, 승인) → 비로그인 홈 렌더 확인 → `/bug-complete`.
