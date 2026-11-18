# Phase 23: 독자용 랭킹 목록 - Context

**Gathered:** 2026-11-18
**Status:** Ready for planning (UI-SPEC 필요 — UI phase)

<domain>
## Phase Boundary

헤더 `랭킹` 탭과 홈 `더보기 ›`에서 랭킹 목록 화면(`/ranking`)으로 진입해 서브 행 4종(주간 랭킹·루키 쿼터존·명예의 전당·완결작)을 보고, 장르 칩·정렬·기간·연재 선택과 순위 그리드(순위 숫자, 모바일 3열)를 쓴다. 순위는 Phase 26 완독·연독 데이터 기반이며 명예의 전당은 준비 안내 셸이다. 리뷰 데이터·리뷰 카드 화면, `태그검색`은 범위 밖.
설계: `design/UI-DESIGN-BACKLOG.md` 7·8번 보드(`mockups/project/Ranking.dc.html`, `RankingMobile.dc.html`).

</domain>

<decisions>
## Implementation Decisions

### 순위 점수·배지 (ROADMAP의 "현행 인기 점수 유지"를 사용자가 번복)
- **D-01:** 순위는 Phase 26 데이터(완독률·연독률)로 매긴다. 현행 `computeTrendingScores`(조회·좋아요·다음화 이동률)는 랭킹에서 쓰지 않는다(홈 피드·연재 목록 인기 정렬은 이 phase 범위 밖).
- **D-02:** 기본 정렬 `종합` = 완독률과 연독률의 **50:50 평균에 도달 독자 수(로그) 보정**을 곱한 점수. 가중치·보정식은 상수 한 곳(정렬 키 함수)에 두고 값만 교체 가능하게 한다. 정확한 보정식은 plan에서 확정(소수 독자 100% 작품이 위로 쏠리지 않는 것이 요건).
- **D-03:** 정렬 셀렉트는 `종합`·`완독률`·`연독률` 3종.
- **D-04:** 카드 배지는 `연독률 N%`. 표본 부족(도달 독자 5명 미만, 26의 `null`)이면 배지를 그리지 않는다. 표본 부족 작품은 **순위에서 제외**한다(빈 목록은 안내 카드).
- **D-05:** 제외 규칙(작가 본인·미인증·삭제 프로필)은 26의 집계 규칙을 그대로 따른다.

### 기간·갱신
- **D-06:** `기간` 셀렉트는 `주간`·`월간`·`전체`. 서브 행 `주간 랭킹`의 기본값은 주간.
- **D-07:** 주간 = **지난주(월~일, KST) 확정**, 월간 = **지난달 확정**, 전체 = 누적. 세 기간 모두 **월요일 0시(KST)에 갱신**되는 스냅샷(순위표 테이블)을 읽는다. 목업 문구 `매주 월요일 갱신`과 일치.
- **D-08:** 스냅샷은 **예약 작업(pg_cron)** 이 월요일 0시에 계산·저장한다. 공유 DB에서 pg_cron 활성화·스케줄 등록은 **사용자가 직접** 한다(CONTEXT에 선행 조건으로 명시). 실행 전 스냅샷이 없으면 안내 카드(비어 있음)로 처리.
- **D-09:** 기간 안의 읽기 기록 판정: 회차를 기간 안에 열었거나(`opened_at`) 완독한(`completed_at`) 기록. 완독은 기간 안 완독만, 연독은 기간 안 완독자 중 다음 회차를 연 사람(시점 제한 없음, 26 D-04). 작품 지표는 26의 도달자 가중 합산 방식과 같은 정의를 쓰되 기간 필터를 얹는다(26 RPC를 재사용할지 기간용 새 함수를 둘지는 plan에서 결정).

### 서브 행 4개
- **D-10:** `주간 랭킹` — 위 규칙의 전체 작품 순위.
- **D-11:** `루키 쿼터존` — 공개 회차 10화 이상 **또는** 5만 자 이상이고 **연재 시작일(첫 공개 회차 `published_at`)이 90일 이내**인 작품만, 같은 종합 점수로 줄 세운다(상수 둘: 90일, 10화/5만 자). 비면 구역을 숨기지 않고 안내 카드(16번 보드).
- **D-12:** `명예의 전당` — 이 phase에서는 **준비 안내 셸만**. 서브 행은 연결하되 안내 카드 + 랭킹 보기 버튼. 리뷰 phase가 생기면 채운다.
- **D-13:** `완결작` — `works.serial_status = 'completed'`(Phase 21) 작품을 같은 종합 점수로 줄 세운다. 기간 셀렉트는 그대로 적용, `연재` 셀렉트는 `완결만`으로 고정.

### 경로·진입·목록 길이
- **D-14:** 경로는 `/ranking` 한 주소 + 쿼리(`sub=weekly|rookie|hall|completed`, 기본 weekly, `genre`, `sort`, `period`, `status`, `page`). Phase 21과 같은 방식.
- **D-15:** 순위는 **최대 100위**, 한 번에 **24개씩 `더보기`**(URL `page`, 21의 규칙 재사용).
- **D-16:** 진입: `lib/reader/navigation.ts`의 `ranking` 탭(`href: null`)과 서브 행 4개 `href`를 `/ranking?sub=…`로 연결한다. 홈의 주간 랭킹·루키·명예의 전당 `더보기 ›` 3곳도 같은 곳으로 연결한다(홈의 현행 인기 정렬 슬라이더 자체는 유지하되 주간 랭킹 슬라이더를 스냅샷으로 바꿀지는 plan에서 판단). `getHeaderVariant`/`getActiveMainTab`는 `/ranking`을 reader·`ranking` 탭으로 분류한다.

### Claude's Discretion
- 월간·전체 스냅샷 보관 기간·테이블 형태, 카드 순위 숫자 스타일(목업 따름), `연재` 셀렉트 옵션 라벨, 빈 상태 문구(16번 보드 임시안).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 설계
- `.planning/design/UI-DESIGN-BACKLOG.md` — 확정 UI 결정 표의 `랭킹 목록 창`·`루키 쿼터존`·`명예의 전당`·`빈 상태` 행, 7·8번 보드
- `.planning/design/mockups/project/Ranking.dc.html`, `RankingMobile.dc.html` — 데스크톱·모바일(3열) 목업
- `.planning/design/mockups/project/HallOfFame.dc.html`, `EmptyStates.dc.html` — 명예의 전당 후속·빈 상태 시안
### 선행 phase
- `.planning/phases/21-reader-series-list/21-CONTEXT.md`, `21-UI-SPEC.md` §9 — `SeriesCard`(`overlay` 순위 숫자 슬롯)·`WorkGrid`·`ListFilterBar` 재사용 경계, `lib/discovery/work-list.ts`
- `.planning/phases/26-reader-reading-data/26-CONTEXT.md` — `work_reading_metrics` DTO, 제외 규칙 D-06, 표본 임계 D-10, 완독·연독 정의
- `supabase/migrations/0053~0055`, `0056_works_serial_status.sql`
### 코드
- `lib/reader/navigation.ts`, `app/page.tsx`, `lib/discovery/actions.ts`, `components/reader/list-filter-bar.tsx`, `series-card.tsx`, `work-grid.tsx`, `app/series/`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SeriesCard`(`overlay` 슬롯에 순위 숫자), `WorkGrid`(더보기·빈 상태), `ListFilterBar`(장르·정렬 URL 동기화), `lib/discovery/work-list.ts`(공개 회차 요약·정렬 키·페이지 정규화), `app/series/series-list-content.tsx`(페이지 조립 참고)

### Established Patterns
- 목록은 URL 쿼리로 상태 유지, 정렬 키는 한 함수에서 교체 가능하게(21 D-04). 26은 SQL RPC 실시간 집계 + 고정 DTO.

### Integration Points
- `navigation.ts` 랭킹 탭·서브 행 href, 홈 `더보기 ›`, 헤더 variant 분류. 새 마이그레이션 번호는 구현 시점 최신 확인(현재 0056 사용, 28=0057·27=0058·29=0059~0060 예약 → 0061 이후).

</code_context>

<specifics>
## Specific Ideas

- 목업 문구: "클릭이 아니라 끝까지 읽은 비율(완독률)과 다음 화로 이어진 비율(연독률)로 줄 세웠어요. 매주 월요일 갱신돼요." — 갱신 문구가 D-07과 일치해 그대로 쓸 수 있다.
- 모바일 3열, 카드 좌상단 순위 숫자·배지 `연독률 N%`.

</specifics>

<deferred>
## Deferred Ideas

- 명예의 전당 리뷰 카드 목록·리뷰 작성(별도 리뷰 phase, 백로그 4번)
- `태그검색` 칩(검색은 Phase 27)
- 홈 슬라이더·연재 목록 인기 정렬의 완독·연독 전환(21의 정렬 키 함수에서 별도 후속)

## 요구사항 ID 후보 (REQUIREMENTS 반영은 총괄 몫)
- **RANK-01**: 헤더 랭킹 탭·홈 `더보기 ›`에서 `/ranking`으로 진입하고 서브 행 4종을 URL로 유지한다.
- **RANK-02**: 순위는 완독·연독 종합(정렬 3종), 표본 부족 제외, 카드에 순위 숫자와 연독률 배지.
- **RANK-03**: 주간·월간·전체 스냅샷을 월요일 0시 예약 작업이 계산·저장하고 기간 셀렉트로 읽는다.
- **RANK-04**: 루키 쿼터존(10화/5만 자 + 90일)·완결작 필터, 명예의 전당 준비 셸, 빈 상태 안내.

## 사용자 선행 작업
- 공유 DB: Phase 26(0053~0055)·21(0056) 적용 후 pg_cron 활성화·월요일 0시 KST 스케줄 등록.

</deferred>

---

*Phase: 23-reader-ranking-list*
*Context gathered: 2026-11-18*
