---
phase: 26-reader-reading-data
plan: "01"
subsystem: reader
tags: [rdata-01, rdata-02, completion, reading-progress, supabase-migration]
requires: []
provides:
  - "DB 단일 설정 원본 함수 reading_completion_config() (0053_reader_completion_config.sql)"
  - "0039 OAuth 차단 및 0052 미인증 계정 분기를 보존한 complete_chapter 재정의"
  - "TS 클라이언트 표시·flush 사본(lib/reader/completion.ts)과 0053 SQL 간 정적 계약 테스트"
  - "RDATA-01 회차별 진도 저장·복귀·역스크롤 최대치 보존·비로그인 비저장·미인증 완독 미기록 회귀 테스트"
  - "베타 데이터 p5(active_ms/char_count 하위 5%) 읽기 전용 교정 쿼리 및 교체 절차 문서"
affects:
  - "26-02 (work_reading_metrics, work_chapter_metrics, chapter_dropoff에서 reading_completion_config().min_sample_readers 참조)"
tech-stack:
  added: []
  patterns:
    - "DB 단일 설정 함수(reading_completion_config) + TS 표시용 사본 + 정규식/BigInt 정적 계약 테스트"
key-files:
  created:
    - "supabase/migrations/0053_reader_completion_config.sql"
    - ".planning/phases/26-reader-reading-data/26-READING-CALIBRATION.md"
    - ".planning/phases/26-reader-reading-data/26-01-SUMMARY.md"
  modified:
    - "lib/reader/completion.ts"
    - "tests/reader/completion.test.ts"
    - "tests/reader/completion-migration.test.ts"
    - "tests/reader/completion.database.test.ts"
    - "tests/reader/reading-progress.test.ts"
    - "tests/reader/scroll-progress.test.ts"
decisions:
  - "D-01/D-02: 완독 기준값(1,200자/분, 비율 0.5, 하한 30,000ms, 끝 도달 0.98, 끝 체류 1,000ms, 여유 5,000ms)과 공개 요약 최소 표본 독자 수(D-10, 5명)를 reading_completion_config() 한 곳에 정의"
  - "0052 회귀 방지: complete_chapter 첫 실행문 perform public.mcp_reject_oauth_caller()와 미인증 계정 분기 if not public.user_is_verified(v_user)를 보존하고 정적 테스트로 고정"
metrics:
  completed_date: "2026-11-13"
---

# Phase 26 Plan 01: 독자 진도 복귀 회귀 고정 및 완독 기준 DB 단일 설정화 요약

## 한 줄 요약

회차별 스크롤 진도 저장·복귀·역스크롤 최대치 보존과 비로그인/미인증 경계를 회귀 테스트로 고정하고, 완독 판정 상수를 `0053_reader_completion_config.sql`의 `reading_completion_config()` 단일 원본으로 통합했다.

## 변경 파일 전체 목록

1. `supabase/migrations/0053_reader_completion_config.sql` (신규)
   - DB 내부 설정 함수 `reading_completion_config()` 정의 (`1200`, `0.5`, `30000`, `0.98`, `1000`, `5000`, `min_sample_readers = 5`) 및 외부 API 역할(`public`, `anon`, `authenticated`, `service_role`) 실행 권한 회수.
   - `chapter_minimum_reading_ms(integer)`를 `STABLE`로 선언하고 하드코딩 리터럴 대신 `reading_completion_config()`를 참조하도록 변경.
   - `complete_chapter(uuid, uuid, uuid)`를 `0052_verified_completion.sql` 본문 기준으로 재정의하되, 첫 실행문 `perform public.mcp_reject_oauth_caller();`와 `if not public.user_is_verified(v_user) then return chapter_reading_snapshot(v_row); end if;`를 그대로 보존하고 임계값을 `reading_completion_config()`에서 읽도록 연결.
2. `lib/reader/completion.ts` (수정)
   - `0053_reader_completion_config.sql`의 `reading_completion_config()`가 단일 원본이며 본 모듈은 클라이언트 표시·flush 판단용 사본임을 문서화.
   - D-10 공개 요약 최소 도달 독자 수 상수 `MIN_SAMPLE_READERS = 5` 추가.
3. `tests/reader/completion.test.ts` (수정)
   - `MIN_SAMPLE_READERS = 5`를 포함한 클라이언트 사본 상수 및 `minimumReadingMs`·`completionEligible` 경계값 검증 보강.
4. `tests/reader/scroll-progress.test.ts` (수정)
   - 1%p 미만 스크롤 변화(순방향·역방향) 생략 및 1%p 이상 역스크롤 시 새로운 `scrollRatio` 저장·재진입 복귀 위치 일치 회귀 테스트 추가.
5. `tests/reader/completion-migration.test.ts` (수정)
   - 정적 계약 대상을 `supabase/migrations/0053_reader_completion_config.sql`로 전환.
   - `reading_completion_config()` 반환 7개 상수와 `lib/reader/completion.ts` 상수 일치, `chapter_minimum_reading_ms`의 설정 참조 및 BigInt 수식 동치, `complete_chapter`의 첫 실행문 `perform public.mcp_reject_oauth_caller();` 및 `public.user_is_verified(v_user)` 분기 보존과 실행 순서를 문자열·정규식으로 고정.
6. `tests/reader/completion.database.test.ts` (수정 — 작성만, 미실행)
   - `0053` 적용 확인, `reading_completion_config()` 반환 튜플과 TS 상수 일치, 내부 함수 API 역할 호출 거부, 미인증 계정의 진도 저장 유지 및 `completed_at` 미기록 경계 케이스 추가.
7. `tests/reader/reading-progress.test.ts` (수정)
   - RDATA-01 회귀 스위트 추가: 비로그인(`authentication_required` 및 `bootstrap(null)` 시 전송 0회), 로그인 재진입 `scrollRatio` 복귀 및 역스크롤 후 `maxScrollRatio` 유지, 전송 실패 시 동일 `sequence` 재시도 및 종료 시 `keepalive: true` flush, 5,000자(`125,000ms` vs `124,999ms`) 경계에서 미인증 계정(진도만 저장, `completedAt: null`)과 인증 계정(완독 기록) 구분 검증.
8. `.planning/phases/26-reader-reading-data/26-READING-CALIBRATION.md` (신규)
   - 유효 독자 완독 기록의 `active_ms / char_count` 하위 5%(`p5`)를 조회하는 읽기 전용 SQL 쿼리(0자 제외, 1,200자 이상 본문 코호트 분리, 최근 30일·표본 하한·개인정보 비노출 규칙)와 3단계 기준값 교체 절차(DB 설정 함수 `select` 한 줄 + TS 상수 + 정적 일치 테스트) 문서화.
9. `.planning/phases/26-reader-reading-data/26-01-SUMMARY.md` (신규)
   - 26-01 계획 실행 요약 문서.

## 검증 및 수동 게이트 안내

- **검증 명령은 호출자가 실행, DB 테스트 미실행**:
  - 단위·정적 테스트 명령(호출자 실행 대상):
    - `npx vitest run tests/reader/reading-progress.test.ts tests/reader/scroll-progress.test.ts tests/reader/completion.test.ts`
    - `npx vitest run tests/reader/completion.test.ts tests/reader/completion-migration.test.ts`
  - 실DB 테스트(`tests/reader/completion.database.test.ts`)는 코드 작성만 완료했으며 실행하지 않았다. 일회용 DB에 `0024`·`0025`·`0052`·`0053` 적용 후 `COMPLETION_DB_TEST=1 npx vitest run tests/reader/completion.database.test.ts`로 수동 게이트에서 실행한다.
