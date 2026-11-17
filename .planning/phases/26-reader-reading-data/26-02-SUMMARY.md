---
phase: 26-reader-reading-data
plan: "02"
subsystem: reader
tags: [rdata-03, reading-metrics, completion-rate, retention-rate, supabase-migration]
requires:
  - "26-01 (0053_reader_completion_config.sql reading_completion_config().min_sample_readers)"
provides:
  - "작품 단위 공개 요약 실시간 RPC work_reading_metrics(uuid) (0054_work_reading_metrics.sql)"
  - "작가 전용 회차별 완독률·연독률 상세 실시간 RPC work_chapter_metrics(uuid) (0054_work_reading_metrics.sql)"
  - "완독자 조회 보조 부분 인덱스 chapter_reading_state_completed_chapter_idx"
  - "수식·표본 기준·유효 독자 필터·인접 연독쌍·소유자 권한 정적 계약 및 실DB 회귀 테스트"
affects:
  - "26-03 (chapter_dropoff 및 lib/reader/reading-metrics.ts DTO 소비자 타입)"
  - "Phase 21·23·30·WTREE-08 (연재 목록·랭킹·작가 대시보드·세계수 지표 소비자)"
tech-stack:
  added: []
  patterns:
    - "요약 테이블·크론 없는 SECURITY DEFINER 실시간 집계 RPC + DB 단일 설정(reading_completion_config) 참조"
key-files:
  created:
    - "supabase/migrations/0054_work_reading_metrics.sql"
    - "tests/reader/work-reading-metrics-migration.test.ts"
    - "tests/reader/work-reading-metrics.database.test.ts"
    - ".planning/phases/26-reader-reading-data/26-02-SUMMARY.md"
  modified: []
decisions:
  - "D-04/D-09: 작품의 전체 chapters(order_index, id 순)에서 바로 인접한 두 회차가 모두 공개·미삭제·비블라인드일 때만 유효 연독쌍으로 인정(비공개·삭제·블라인드 회차 건너뛰기 금지, 선열람 허용)"
  - "D-06: 작품 소유자 본인·미인증 계정(user_is_verified=false)·탈퇴 프로필(deleted_at is not null)을 도달·완독·이어 열람 모든 분모/분자에서 공통 제외"
  - "D-07: 작품 완독률은 sum(completed)/sum(reached), 작품 연독률은 유효 인접쌍의 sum(nextOpened)/sum(completed) 가중 합으로 계산"
  - "D-10: 공개 요약(work_reading_metrics)은 reading_completion_config().min_sample_readers(초기 5) 미만일 때 두 비율을 null로 숨기고, 비공개·블라인드·삭제 작품을 비소유자가 조회하면 예외 없이 null을 반환; 회차별 상세(work_chapter_metrics)는 첫 데이터 접근 전에 auth.uid() = works.owner_id를 검증"
metrics:
  completed_date: "2026-11-13"
---

# Phase 26 Plan 02: 작품 요약 및 회차별 완독률·연독률 실시간 집계 RPC 요약

## 한 줄 요약

`chapter_reading_state`를 실시간으로 집계해 작품 단위 공개 요약(`work_reading_metrics`)과 작가 전용 회차별 상세(`work_chapter_metrics`) JSON DTO를 반환하는 `0054_work_reading_metrics.sql`과 정적·실DB 회귀 테스트를 구현했다.

## 변경 파일 목록

1. `supabase/migrations/0054_work_reading_metrics.sql` (신규)
   - 완독자 조회·연독 교집합 집계 보조용 부분 인덱스 `chapter_reading_state_completed_chapter_idx` (`on chapter_reading_state (chapter_id, user_id) where completed_at is not null`) 추가.
   - `work_reading_metrics(p_work_id uuid)` (`STABLE SECURITY DEFINER set search_path = public`, `anon, authenticated` 실행 허용):
     - `null`·미존재·삭제·블라인드 작품 및 비소유자의 비공개 작품(공개·미삭제·비블라인드 회차 0개) 요청 시 예외 없이 `null` 반환.
     - `0053_reader_completion_config.sql`의 `reading_completion_config().min_sample_readers`(초기값 5)를 읽어 `reachedReaders < min_sample_readers`이면 `completionRate: null, retentionRate: null, sampleSufficient: false` 반환.
     - `sampleSufficient = true`이면 작품 완독률 `sum(completed) / sum(reached)`, 작품 연독률 `sum(nextOpened) / sum(completed)`(유효 인접쌍 한정) 계산값을 `{ workId, reachedReaders, completionRate, retentionRate, sampleSufficient }`로 반환.
   - `work_chapter_metrics(p_work_id uuid)` (`STABLE SECURITY DEFINER set search_path = public`, `authenticated`만 실행 허용):
     - 첫 데이터 접근 전에 `auth.uid()`·활성 프로필·작품 존재·`auth.uid() = works.owner_id`를 검사해 타 작가 및 일반 독자 호출을 거부(`42501 forbidden`).
     - 전체 `chapters`의 `order_index, id` 순서에서 `lead()`로 직후 회차의 공개·미삭제·비블라인드 여부를 먼저 판정해 비공개·삭제·블라인드 회차를 건너뛴 연독쌍 생성을 차단.
     - N화 완독자와 N+1화 도달자의 교집합(`nextOpened`)을 열람 시점 제한 없이(선열람 포함) 집계해 `{ chapterId, orderIndex, reached, completed, completionRate, nextOpened, retentionRate }[]` 반환.
2. `tests/reader/work-reading-metrics-migration.test.ts` (신규)
   - `0054_work_reading_metrics.sql`의 마이그레이션 번호·단일 트랜잭션·요약 테이블/뷰/크론 부재(D-05)·부분 인덱스·함수 서명·`SECURITY DEFINER`·`search_path`·권한(`revoke`/`grant`)·`reading_completion_config().min_sample_readers` 참조·소유자 선행 검사·DTO 키 정적 검증.
   - 회차별 도달 수가 다른 fixture에서 가중 완독률(`sum(completed)/sum(reached)`)과 가중 연독률(`sum(nextOpened)/sum(pair completed)`), 5명 미만 표본 숨김, 소유자/삭제 프로필/미인증 제외(D-06), 비공개 회차 건너뛰기 금지 및 N+1 선열람 인정(D-04/D-09), 분모 0·유효쌍 0·공개 회차 0개 `null` 규칙 검증.
3. `tests/reader/work-reading-metrics.database.test.ts` (신규 — 작성만, 미실행)
   - `WORK_READING_METRICS_DB_TEST=1` opt-in 가드(`describe.runIf(OPT_IN)`) 기반 실DB 회귀 스위트 작성.
   - 가중 평균 vs 단순 평균 대조, 표본 하한(4명 vs 5명) 및 D-06 필터 제외, 선열람 인정 및 비공개/삭제 회차 연독쌍 단절, 비공개/블라인드/삭제 작품 공개 요약 `null` 반환 및 타 작가 상세 거부, 부분 인덱스 `EXPLAIN` 확인 포함.
4. `.planning/phases/26-reader-reading-data/26-02-SUMMARY.md` (신규)
   - 26-02 실행 요약 문서.

## 검증 상태

- **검증 명령은 호출자가 실행 예정, DB 테스트 미실행**:
  - 정적 계약·수식 테스트 명령(호출자 실행 예정):
    - `npx vitest run tests/reader/work-reading-metrics-migration.test.ts`
  - 실DB 테스트(`tests/reader/work-reading-metrics.database.test.ts`)는 작성만 완료했으며 실행하지 않았다(DB 테스트 미실행). 일회용 DB에 `0024`·`0025`·`0052`·`0053`·`0054` 적용 후 `WORK_READING_METRICS_DB_TEST=1 npx vitest run tests/reader/work-reading-metrics.database.test.ts`로 수동 게이트에서 실행한다.

## 남은 이슈

- 일회용 DB 수동 게이트에서 `0053`·`0054` 마이그레이션 적용 및 `WORK_READING_METRICS_DB_TEST=1` 실DB 회귀 실행 대기.
- 회차 내 20구간 이탈 분포 RPC(`chapter_dropoff`) 및 세 집계 DTO의 TypeScript 소비자 타입(`lib/reader/reading-metrics.ts`)은 후속 계획 `26-03`에서 구현한다.

## DB 테스트 실행 결과 (2026-11-17)

일회용 DB 실행 통과(26-01 SUMMARY의 합산 결과 참조). 수정 2건, 모두 테스트만: (1) 블라인드 픽스처가 `admin_blinded=true`만 넣어 0006 `*_admin_blind_shape` CHECK를 위반 → `admin_blind_reason`·`admin_blinded_at`을 함께 세팅. (2) 완독률 4/9 비교가 SQL numeric 반올림(0.444444444444444)과 JS 값이 달라 실패 → `toBeCloseTo(4/9, 12)`.
