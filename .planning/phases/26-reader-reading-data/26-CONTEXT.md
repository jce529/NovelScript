# Phase 26 CONTEXT — 독자 읽기 진도 · 완독 데이터

작성: 2026-11-13 · 요구사항: RDATA-01~04 · UI hint: no (UI-SPEC 생략) · 마이그레이션 번호: **미정(구현 시점에 최신 번호 확인)**

## 목표
스크롤 진도 저장·복귀, 속도 기준 완독 판정, 작품별 완독률·연독률, 회차 내 이탈 구간 집계를 하위 phase(Phase 30 대시보드, 21 연재 목록, 23 랭킹, WTREE-08)가 쓸 안정된 DTO로 제공한다.

## 현재 상태 (코드 확인, Phase 3 Reopen 03-11/03-12/03-15 + Phase 24 0052)
- RDATA-01 **대부분 구현됨**: `chapter_reading_state.scroll_ratio/max_scroll_ratio`(0024), `open_chapter_reading`/`save_chapter_reading` RPC, `components/reader/use-reading-progress.ts`(5초 스로틀·1%p 미만 생략·exit flush), 복귀 `restoreScrollTop`. 비로그인은 RPC가 `authentication_required`라 저장 안 됨.
- RDATA-02 **판정 구현됨, 상수가 이중 정의**: `complete_chapter`(0025→0052)가 `max_scroll_ratio>=0.98 AND end_visible_ms>=1000 AND active_ms>=chapter_minimum_reading_ms(char_count)`로 판정. 값은 `lib/reader/completion.ts`(TS)와 SQL 함수 본문에 각각 하드코딩되고 `tests/reader/completion-migration.test.ts`가 둘을 맞춰 고정한다.
- RDATA-03/04 **미구현**: 완독률·연독률·이탈 구간 집계 함수 없음. 인기 점수는 기존 것을 병행 유지(교체는 21·23 후속).
- 미인증 계정(0052)은 읽기·진도 저장은 되지만 `completed_at`을 기록하지 않는다. 즉 `chapter_reading_state` 행은 존재하므로 **집계 분모에서 미인증 계정을 따로 걸러야 한다**(아래 D-05).

## 사용자 결정 (2026-11-13, AskUserQuestion)
| ID | 결정 |
|---|---|
| D-01 | 읽기 속도 기준은 **현재값 유지**: 1,200자/분 × 비율 0.5(실질 2,400자/분), 하한 30초, 끝 도달 0.98, 끝 체류 1초. 단 **단일 상수화**(D-02) |
| D-02 | 기준값은 설정 한 곳에서만 정의한다. SQL이 원본(DB 설정 함수/테이블 한 곳), TS 쪽은 표시·flush 판단용 사본이며 테스트가 둘의 일치를 고정한다(또는 TS가 DB 값을 읽는다). 베타 데이터 교정용 p5 쿼리(`active_ms/char_count` 하위 5%)를 문서로 함께 둔다 |
| D-03 | 이탈 구간은 스크롤 위치 **20구간(5%씩)** |
| D-04 | 연독률의 '이어 읽었다' = **다음 회차 열람 시작**(`chapter_reading_state` 행 존재). 시점 제한 없음. 분모 = N화 완독자, 분자 = 그중 N+1화 행이 있는 사람. 작품 연독률 = 회차쌍 합산(완독자 수 가중) |
| D-05 | 집계는 **SQL 집계 함수(RPC) 실시간 계산**. 요약 테이블·크론은 이번 phase 범위 밖. DTO를 고정해 나중에 요약 테이블로 교체해도 호출부가 안 바뀌게 한다 |

## 계획자 판단 (사용자 결정 아님 — 검수 대상)
- **D-06 제외 규칙**: 집계에서 (a) 작품 소유자(`works.owner_id`) 본인, (b) `user_is_verified(user_id)`가 false인 계정, (c) 삭제된 프로필(`profiles.deleted_at`)을 뺀다. 인증 여부는 집계 시점 값을 쓴다(나중에 인증하면 이후 집계에 들어오되 기존 completed_at은 없음).
- **D-07 완독률 정의**: 회차별 완독률 = 완독자 / 도달 독자(=그 회차 `chapter_reading_state` 행이 있는 유효 독자). 작품 평균 완독률 = 회차별 완독률의 도달자 가중 평균(회차 단순평균이 아님을 DTO 주석에 명시).
- **D-08 이탈 정의**: 이탈 분포 = **완독하지 못한** 유효 독자의 `max_scroll_ratio`가 속한 구간의 인원(20구간 히스토그램). 완독자는 '이탈 없음'. 구간 경계는 `[k*0.05, (k+1)*0.05)`, 1.0은 마지막 구간.
- **D-09 연독률 대상 회차**: 공개·미삭제 회차를 `order_index` 순으로 본 인접쌍. 마지막 회차는 분자 없음(쌍 제외). 비공개/삭제 회차는 건너뛰지 않고 쌍에서 뺀다.
- **D-10 접근 권한**: 집계 RPC는 SECURITY DEFINER, 작품 소유자만 자기 작품의 회차별 상세를 본다. 랭킹·목록용 작품 단위 요약(완독률·연독률 숫자 하나씩)은 공개 가능한 값이지만, 표본 수가 너무 적을 때(예: 도달 독자 < N)는 `null` 반환 — N은 설정 상수(초기 5, 임시값 명시).
- 비로그인 독자·미인증 계정의 진도 복귀: 비로그인은 저장 없음(현행 유지), 미인증은 진도 저장·복귀는 현행대로 된다.

## 범위 밖
작가 대시보드 UI(Phase 30), 연재 목록·랭킹의 인기 정렬 교체(21·23 후속), 세계수 굵기(WTREE-08), 요약 테이블·크론, 신규 UI, 공유/일회용 DB 적용.

## 하위 phase가 기대하는 DTO (고정 계약)
- `work_reading_metrics(work_id)` → `{ workId, reachedReaders, completionRate|null, retentionRate|null, sampleSufficient }`
- `work_chapter_metrics(work_id)` → 회차별 `{ chapterId, orderIndex, reached, completed, completionRate|null, nextOpened, retentionRate|null }`[]
- `chapter_dropoff(chapter_id)` → `{ chapterId, bucketCount: 20, buckets: int[20], reached, completed }`
