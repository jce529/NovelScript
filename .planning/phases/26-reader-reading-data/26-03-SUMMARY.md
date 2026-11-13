---
phase: 26-reader-reading-data
plan: "03"
subsystem: reader
tags: [rdata-04, chapter-dropoff, reading-metrics, dto, supabase-migration]
requires:
  - "26-01 (0053_reader_completion_config.sql reading_completion_config().min_sample_readers, lib/reader/completion.ts MIN_SAMPLE_READERS)"
  - "26-02 (0054_work_reading_metrics.sql work_reading_metrics, work_chapter_metrics)"
provides:
  - "작가 전용 회차 내 20구간(5% 단위) 이탈 분포 실시간 RPC chapter_dropoff(uuid) (0055_chapter_dropoff.sql)"
  - "세 집계 RPC(work_reading_metrics·work_chapter_metrics·chapter_dropoff) 고정 DTO 타입 및 경계·불변식 검증 모듈 (lib/reader/reading-metrics.ts)"
  - "이탈 20구간 경계(0·0.0499·0.05·0.95·1.0)·합계 불변식(sum(buckets) = reached - completed)·유효 독자 필터·소유자 권한 정적 계약 및 실DB 회귀 테스트"
affects:
  - "Phase 30 작가 대시보드 (회차별 완독률·연독률·20구간 이탈 분포 소비자)"
  - "Phase 21 연재 목록 · Phase 23 랭킹 · WTREE-08 세계수 (작품 요약 및 회차별 독서 지표 소비자)"
tech-stack:
  added: []
  patterns:
    - "SECURITY DEFINER 실시간 집계 RPC + generate_series(0, 19) 고정 길이 히스토그램 + TypeScript DTO 불변식 검증"
key-files:
  created:
    - "supabase/migrations/0055_chapter_dropoff.sql"
    - "lib/reader/reading-metrics.ts"
    - "tests/reader/chapter-dropoff-migration.test.ts"
    - "tests/reader/chapter-dropoff.database.test.ts"
    - "tests/reader/reading-metrics.test.ts"
    - ".planning/phases/26-reader-reading-data/26-03-SUMMARY.md"
  modified: []
decisions:
  - "D-03/D-08: 미완독(completed_at is null) 유효 독자의 max_scroll_ratio를 floor(least(max_scroll_ratio, 1) * 20) 후 19로 상한 클램프해 [k*0.05, (k+1)*0.05) 20칸(1.0은 19번 칸)으로 집계하고, 완독자는 버킷에서 제외해 sum(buckets) = reached - completed 불변식을 유지"
  - "D-06/D-10: 첫 독서 상태 접근 전에 auth.uid() = works.owner_id를 검증해 소유자에게만 상세 분포를 허용하고, 현재 공개·미삭제·비블라인드 회차만 집계하며 소유자 본인·미인증 계정·삭제 프로필을 reached·completed·buckets 모두에서 동일하게 제외"
  - "D-04/D-07 문서화: lib/reader/reading-metrics.ts에 작품 완독률은 도달자 수 가중 평균(sum(completed)/sum(reached)), 작품 연독률은 유효 인접쌍 완독자 수 가중 합(sum(nextOpened)/sum(completed))임과 N+1화 선열람도 연독으로 세는 D-04 한계를 명시"
metrics:
  completed_date: "2026-11-13"
---

# Phase 26 Plan 03: 회차 내 20구간 이탈 분포 RPC 및 독서 지표 DTO 모듈 요약

## 한 줄 요약

회차별 미완독 유효 독자의 `max_scroll_ratio`를 5% 단위 20칸으로 실시간 집계하는 작가 전용 `chapter_dropoff` RPC(`0055_chapter_dropoff.sql`)와 세 독서 집계 RPC의 고정 소비자 DTO·불변식 검증 모듈(`lib/reader/reading-metrics.ts`), 정적·실DB 회귀 테스트를 구현했다.

## 변경 파일 목록

1. `supabase/migrations/0055_chapter_dropoff.sql` (신규)
   - `chapter_dropoff(p_chapter_id uuid)` (`STABLE SECURITY DEFINER set search_path = public`, `authenticated`만 실행 허용):
     - 첫 독서 상태 데이터 접근 전에 `auth.uid()`·활성 프로필·회차/작품 존재·`auth.uid() = works.owner_id`·현재 공개/미삭제/비블라인드 여부를 순서대로 확인해 익명·타 작가·일반 독자 및 비공개/삭제/블라인드 회차 호출을 거부.
     - `valid_state` CTE에서 작품 소유자 본인(`s.user_id <> v_owner_id`), 미인증 계정(`public.user_is_verified(s.user_id)`), 삭제 프로필(`p.deleted_at is null`)을 제외(D-06)하고 동일한 집합에서 `reached`·`completed`·`buckets`를 계산.
     - 미완독(`completed_at is null`) 유효 독자의 `max_scroll_ratio`를 `least(19, greatest(0, floor(least(vs.max_scroll_ratio, 1) * 20)::integer))`로 `0..19`번 칸에 배정하고 `generate_series(0, 19)`와 left join해 빈 칸도 `0`을 유지하는 길이 20 정수 배열 반환.
     - 도달 독자가 0명인 회차는 `buckets`에 `0` 20개와 `reached = 0, completed = 0`을 담아 `{ chapterId, bucketCount: 20, buckets, reached, completed }` 반환.
2. `lib/reader/reading-metrics.ts` (신규)
   - `DROPOFF_BUCKET_COUNT = 20`, `DROPOFF_BUCKET_WIDTH = 0.05` 상수 및 `DropoffBuckets`(20-튜플), `WorkReadingMetrics`, `WorkChapterMetric`, `WorkChapterMetrics`, `ChapterDropoff` DTO 타입 정의.
   - 작품 완독률이 회차 단순 평균이 아닌 도달자 수 가중 평균(`sum(completed) / sum(reached)`)이라는 점(D-07), 작품 연독률이 유효 인접 공개 회차쌍 완독자 수 가중 합(`sum(nextOpened) / sum(completed)`)이라는 점(D-04/D-09), N+1화를 먼저 열어 본 뒤 N화를 완독한 선열람도 연독(`nextOpened`)으로 집계되는 한계(D-04)를 주석으로 명시.
   - 경계·불변식 검증 함수 `dropoffBucketIndex`, `isValidWorkReadingMetrics`, `isValidWorkChapterMetric`, `isValidWorkChapterMetrics`, `isValidChapterDropoff`, `parseWorkReadingMetrics`, `parseWorkChapterMetrics`, `parseChapterDropoff` 제공.
3. `tests/reader/chapter-dropoff-migration.test.ts` (신규)
   - `0055_chapter_dropoff.sql`의 마이그레이션 번호·단일 트랜잭션·요약 테이블/뷰/크론 부재(D-05)·기존 함수 불변·함수 서명·`SECURITY DEFINER`·`search_path`·권한(`revoke`/`grant`)·소유자 및 공개 상태 선행 검사·20구간 수식·DTO 키 정적 검증.
   - `0`, `0.0499`, `0.05`, `0.95`, `1.0` → `0`, `0`, `1`, `19`, `19`번 칸 배정, `sum(buckets) === reached - completed`, 완독자·소유자·미인증·삭제 프로필 제외, 0명 도달 회차 0 배열 반환, 비공개·삭제·블라인드 회차 및 비소유자 호출 거부 fixture 검증.
4. `tests/reader/chapter-dropoff.database.test.ts` (신규 — 작성만, 미실행)
   - `CHAPTER_DROPOFF_DB_TEST=1` opt-in 가드(`describe.runIf(OPT_IN)`) 기반 실DB 회귀 스위트 작성.
   - 경계값(`0`·`0.0499`·`0.05`·`0.95`·`1.0`) 버킷 배정, 완독자 및 D-06 비대상 계정 제외, 미도달 회차 20개 `0` 배열 반환, 비공개/삭제/블라인드 회차 상세 미반환, 익명/타 작가/일반 독자 호출 거부 검증 포함.
5. `tests/reader/reading-metrics.test.ts` (신규)
   - `dropoffBucketIndex` 경계값·전 구간(0..19)·범위 밖 입력 `RangeError` 검증.
   - 세 DTO(`WorkReadingMetrics`, `WorkChapterMetrics`, `ChapterDropoff`)의 `null` 규칙·표본 하한(`MIN_SAMPLE_READERS = 5`)·20칸 길이·`sum(buckets) === reached - completed` 불변식 및 문서화 주석 계약 검증.
6. `.planning/phases/26-reader-reading-data/26-03-SUMMARY.md` (신규)
   - 26-03 실행 요약 문서.

## 검증 상태

- **검증 명령은 호출자가 실행 예정, DB 테스트 미실행**:
  - 정적 계약·DTO 단위 테스트 명령(호출자 실행 예정):
    - `npx vitest run tests/reader/chapter-dropoff-migration.test.ts tests/reader/reading-metrics.test.ts`
  - 실DB 테스트(`tests/reader/chapter-dropoff.database.test.ts`)는 작성만 완료했으며 실행하지 않았다(DB 테스트 미실행). 일회용 DB에 `0024`·`0025`·`0052`·`0053`·`0054`·`0055` 적용 후 `CHAPTER_DROPOFF_DB_TEST=1 npx vitest run tests/reader/chapter-dropoff.database.test.ts`로 수동 게이트에서 실행한다.

## 남은 이슈

- 일회용 DB 수동 게이트에서 `0053`·`0054`·`0055` 마이그레이션 적용 및 `COMPLETION_DB_TEST=1`·`WORK_READING_METRICS_DB_TEST=1`·`CHAPTER_DROPOFF_DB_TEST=1` 실DB 회귀 테스트 실행 대기.
- 작가 대시보드 UI(Phase 30), 연재 목록·랭킹 인기 점수 교체(Phase 21·23), 세계수 굵기 연동(WTREE-08)은 각 후속 phase에서 `lib/reader/reading-metrics.ts` DTO를 소비해 구현한다.
