# Phase 26 — 완독 속도 기준 베타 교정 가이드 (RDATA-02, D-01, D-02)

작성일: 2026-11-13 · 대상 마이그레이션: `supabase/migrations/0053_reader_completion_config.sql` · 클라이언트 사본: `lib/reader/completion.ts`

## 1. 목적 및 현행 기준값

완독 판정(`complete_chapter`)과 최소 읽기 시간 계산(`chapter_minimum_reading_ms`)은 DB 내부 단일 설정 함수 `reading_completion_config()`만을 참조한다.

| 설정 항목 (`reading_completion_config()`) | TS 사본 (`lib/reader/completion.ts`) | 현행 값 | 의미 |
|---|---|---:|---|
| `chars_per_minute` | `READING_CHARS_PER_MINUTE` | `1200` | 기준 분당 글자 수 |
| `minimum_reading_ratio` | `MINIMUM_READING_RATIO` | `0.5` | 기준 읽기 시간 대비 최소 활성 시간 비율 (실질 상한 2,400자/분 = 글자당 25ms) |
| `minimum_reading_floor_ms` | `MINIMUM_READING_FLOOR_MS` | `30000` | 단문·빈 회차 최소 읽기 시간 하한 (30초) |
| `completion_scroll_ratio` | `COMPLETION_SCROLL_RATIO` | `0.98` | 회차 끝 도달 인정 `max_scroll_ratio` |
| `end_sentinel_visible_ms` | `END_SENTINEL_VISIBLE_MS` | `1000` | 끝 센티넬 연속 가시 시간 (1초) |
| `active_time_slack_ms` | `ACTIVE_TIME_SLACK_MS` | `5000` | DB 세션 경과 시간 대비 허용 여유 (5초) |
| `min_sample_readers` | `MIN_SAMPLE_READERS` | `5` | 작품 공개 요약 최소 도달 독자 수 (D-10) |

베타 운영 데이터가 쌓이면 유효 완독 기록의 **`active_ms / char_count` 하위 5% 분위수(p5)** 를 측정해 정상 속독 독자의 95%가 통과하는지 점검하고, 필요 시 설정 함수의 한 줄만 교체한다.

---

## 2. 표본 · 기간 · 제외 · 개인정보 보호 규칙

1. **0자 및 단문 회차 제외**
   - `chapters.char_count > 0` 조건을 필수로 두어 0으로 나누기를 방지한다.
   - `char_count < 1200`인 단문 회차는 30초 하한(`30,000ms`)이 지배하므로, 속도 교정 시에는 `c.char_count >= 1200` 구간을 주 지표로 삼는다.
2. **유효 독자 필터 (D-06 정합)**
   - 완독 기록이 있는 행만 포함: `s.completed_at is not null`
   - 작가 본인 열람 제외: `s.user_id <> w.owner_id`
   - 탈퇴·삭제 프로필 제외: `p.deleted_at is null`
   - 인증 계정만 포함: `public.user_is_verified(s.user_id) = true`
   - 공개·비블라인드 작품 및 회차만 포함: `c.is_published = true and coalesce(c.admin_blinded, false) = false and coalesce(w.admin_blinded, false) = false`
3. **집계 기간 및 최소 표본 기준**
   - 기본 조회 윈도우: 최근 30일(`s.completed_at >= now() - interval '30 days'`).
   - **최소 표본 게이트**: `c.char_count >= 1200` 구간에서 유효 완독 행 `sample_rows >= 200` **그리고** 고유 독자 `distinct_readers >= 30` 이상일 때만 교정값을 채택한다. 표본이 부족하면 현행 기준값(`1200`, `0.5`)을 유지한다.
4. **개인정보 제한**
   - 교정 쿼리는 **읽기 전용(SELECT)** 으로만 실행하며, `user_id`·이메일·필명 등 개인 식별 컬럼이나 개별 독서 행을 결과셋에 노출하지 않는다.

---

## 3. 읽기 전용 p5 교정 쿼리 (SQL)

Supabase SQL Editor(또는 읽기 전용 관리자 세션)에서 아래 쿼리를 실행한다. 데이터 변경(DML/DDL)은 전혀 수행하지 않는다.

```sql
-- [READ-ONLY] 최근 30일 유효 완독 기록의 active_ms / char_count 분위수(p5, p10, p50) 조회
with eligible_completions as (
  select
    s.user_id,
    c.char_count,
    (s.active_ms::numeric / c.char_count::numeric) as ms_per_char
  from public.chapter_reading_state s
  join public.chapters c
    on c.id = s.chapter_id
   and c.work_id = s.work_id
  join public.works w
    on w.id = s.work_id
  join public.profiles p
    on p.id = s.user_id
  where s.completed_at is not null
    and s.completed_at >= now() - interval '30 days'
    and c.char_count > 0
    and c.is_published = true
    and coalesce(c.admin_blinded, false) = false
    and coalesce(w.admin_blinded, false) = false
    and p.deleted_at is null
    and s.user_id <> w.owner_id
    and public.user_is_verified(s.user_id)
),
bucketed as (
  select 'all_positive_chars (>0)'::text as cohort, user_id, ms_per_char
  from eligible_completions
  union all
  select 'calibrated_body (>=1200 chars)'::text as cohort, user_id, ms_per_char
  from eligible_completions
  where char_count >= 1200
)
select
  cohort,
  count(*)::bigint as sample_rows,
  count(distinct user_id)::bigint as distinct_readers,
  (count(*) >= 200 and count(distinct user_id) >= 30) as sample_sufficient,
  round(
    percentile_cont(0.05) within group (order by ms_per_char)::numeric,
    2
  ) as p05_ms_per_char,
  round(
    percentile_cont(0.10) within group (order by ms_per_char)::numeric,
    2
  ) as p10_ms_per_char,
  round(
    percentile_cont(0.50) within group (order by ms_per_char)::numeric,
    2
  ) as p50_ms_per_char,
  -- 실질 분당 글자 수(60,000ms / p05_ms_per_char)
  round(
    (60000.0 / nullif(percentile_cont(0.05) within group (order by ms_per_char), 0))::numeric
  )::integer as implied_effective_cpm_at_p05,
  -- minimum_reading_ratio = 0.5 유지 시 reading_completion_config().chars_per_minute 권장값
  round(
    (30000.0 / nullif(percentile_cont(0.05) within group (order by ms_per_char), 0))::numeric
  )::integer as suggested_cpm_at_ratio_0_5
from bucketed
group by cohort
order by cohort;
```

### 해석 기준
- 현행 기준(`chars_per_minute = 1200`, `minimum_reading_ratio = 0.5`)에서 글자당 최소 활성 시간은 `60000 * 0.5 / 1200 = 25.00 ms/char`이다.
- `calibrated_body (>=1200 chars)` 코호트의 `sample_sufficient = true`일 때:
  - `p05_ms_per_char`가 `25.00` 근처(예: `22 ~ 28 ms/char`)이면 현행 값을 유지한다.
  - 정당한 완독자가 과도하게 탈락하거나 어뷰징 하한을 조여야 할 경우 `suggested_cpm_at_ratio_0_5`를 기준으로 `chars_per_minute`(또는 `minimum_reading_ratio`)를 조정한다.

---

## 4. 기준값 교체 절차 (3단계)

`chapter_minimum_reading_ms`와 `complete_chapter`는 상수를 직접 가지지 않고 `reading_completion_config()`만 읽으므로, 값을 바꿀 때 아래 3곳만 수정한다.

1. **DB 설정 함수 단일 행 수정 (`reading_completion_config()`)**
   - 마이그레이션(`supabase/migrations/0053_reader_completion_config.sql` 또는 신규 교정 마이그레이션)의 `reading_completion_config()` 본문 `select` 한 줄에서 값을 변경한다:
     ```sql
     select
       1200::integer,   -- chars_per_minute
       0.5::numeric,    -- minimum_reading_ratio
       30000::bigint,   -- minimum_reading_floor_ms
       0.98::numeric,   -- completion_scroll_ratio
       1000::integer,   -- end_sentinel_visible_ms
       5000::bigint,    -- active_time_slack_ms
       5::integer;      -- min_sample_readers
     ```
2. **TS 표시·flush 사본 동기화 (`lib/reader/completion.ts`)**
   - `READING_CHARS_PER_MINUTE`, `MINIMUM_READING_RATIO`, `MINIMUM_READING_FLOOR_MS`, `COMPLETION_SCROLL_RATIO`, `END_SENTINEL_VISIBLE_MS`, `ACTIVE_TIME_SLACK_MS`, `MIN_SAMPLE_READERS` 중 변경된 상수를 DB와 똑같이 맞춘다.
3. **정적 계약 및 단위 테스트 실행**
   - `tests/reader/completion-migration.test.ts`(SQL 정규식 추출 ↔ TS 상수 및 BigInt 식 대조)와 `tests/reader/completion.test.ts`(경계값 단위 테스트)를 실행해 일치를 확인한다:
     ```bash
     npx vitest run tests/reader/completion.test.ts tests/reader/completion-migration.test.ts
     ```
