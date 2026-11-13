# Phase 26 RESEARCH — 독자 읽기 진도 · 완독 데이터

조사일: 2026-11-13 · 방법: 저장소 코드·마이그레이션 직접 확인(외부 조사 없음). 신뢰도 표기 HIGH=코드 사실.

## 1. 재사용할 기존 자산 (HIGH)
| 자산 | 위치 | 사용 방식 |
|---|---|---|
| `chapter_reading_state` (user_id, chapter_id, work_id, scroll_ratio, max_scroll_ratio, active_ms, completed_at, end_visible_ms …) | `supabase/migrations/0024_chapter_reading_state.sql` | 집계의 유일한 원천. 테이블 변경 불필요(이탈 분포는 `max_scroll_ratio`와 `completed_at`으로 계산) |
| `chapters.char_count` (생성 컬럼, API 역할 SELECT 불가) | 0024 | SECURITY DEFINER 함수 안에서만 읽음 |
| `chapter_minimum_reading_ms(int)` | 0025 | D-01/D-02 단일 상수화 대상 |
| `complete_chapter` | 0025, 0052(최신) | 판정 기준 변경 시 0052 본문을 기준으로 `create or replace`(0039 OAuth 가드 첫 문장 유지 필수) |
| `user_is_verified(uuid)` | 0051, 0052 | 집계 제외 규칙. 어떤 역할에도 EXECUTE 없음 → 집계 함수도 SECURITY DEFINER여야 호출 가능 |
| `lib/reader/completion.ts`, `scroll-progress.ts`, `components/reader/use-reading-progress.ts` | 코드 | TS 쪽 상수·복귀 로직. 사본 일치 테스트 `tests/reader/completion-migration.test.ts` |
| `reading_progress` (user, work) → chapter 포인터 | 0003 | 이어 읽기용. 집계에는 쓰지 않음 |

## 2. 요구사항별 갭
- **RDATA-01**: 동작 존재. 갭은 (a) 회귀 보호 — 복귀 동작이 03-19 수동 게이트 이후 유지되는지, (b) 계획상 새 작업 없음. PLAN에서는 "변경 없음 확인 테스트 + 필요 시 회귀 테스트"로만 다룬다.
- **RDATA-02**: 판정 존재. 갭은 단일 상수화(D-02)와 교정 쿼리 문서화. `tests/reader/completion-migration.test.ts`의 고정 방식을 단일 원본 구조에 맞게 바꿔야 한다.
- **RDATA-03**: 신규. 집계 RPC 2종(작품 요약, 회차별).
- **RDATA-04**: 신규. 이탈 구간 RPC 1종 + 소비자용 DTO 타입(`lib/reader/` 아래 가칭 `reading-metrics.ts`).

## 3. 함정 (HIGH)
1. 미인증 계정 행은 존재하지만 `completed_at`이 없다 → 필터 안 하면 완독률 분모 오염.
2. `chapter_reading_state`는 열람 가능했던 회차에서만 생기며, 회차가 비공개/삭제돼도 행이 남는다 → 집계는 현재 공개·미삭제 회차만.
3. 본인(작가) 열람은 `owner reading own published chapter`로 가능해 행이 생긴다 → 소유자 제외 필수.
4. 연독률 분자(N+1 행 존재)는 N화 완독 후가 아니라 **이전에** 열었을 수도 있다(건너뛰기 독서). D-04는 시점 제한이 없으므로 그대로 허용하되, '정주행 후 완독' 순서 보정은 하지 않는다(문서에 한계 명시).
5. `complete_chapter`를 고치면 0039 OAuth 가드와 0052 미인증 건너뛰기가 모두 유지돼야 한다(0052가 회귀를 한 번 복구한 이력).
6. `chapter_reading_state`에는 `(chapter_id)`와 `(work_id, user_id)` 인덱스만 있다. 실시간 집계에는 보통 충분하나, 완독자 서브쿼리용 `(chapter_id) where completed_at is not null` 부분 인덱스를 검토.
7. 마이그레이션 번호는 다른 phase 세션이 동시에 쓰므로 PLAN에는 '미정'으로 적는다.

## 4. 설계 선택지 요약
- 단일 상수화: (A) DB `reading_config` 단일 행/함수 `reading_completion_config()` 를 원본으로, TS는 사본+일치 테스트 (B) TS가 DB에서 읽음. 서버 판정이 최종이므로 (A) 권장. 교정은 함수 값 한 줄 교체.
- 집계 위치: RPC(SECURITY DEFINER, `set search_path = public`), 소유자 권한 검사는 `auth.uid() = works.owner_id`.
- 표본 부족 숨김 임계값 N=5는 임시값이며 상수 한 곳.

## 5. 검증 방법
- SQL 계약: `tests/reader/*.database.test.ts` 패턴(일회용 DB 필요 → 이 phase 계획 단계에서는 실행하지 않음).
- 마이그레이션 문자열 고정: `*-migration.test.ts` 패턴.
- 교정 쿼리(p5)는 읽기 전용 SQL로 phase 문서에 기록.
