# Phase 21 — 독자용 연재 목록 · CONTEXT (discuss 결과)

작성: 2026-11-13. 범위: 계획 단계까지. 코드·DB 변경 없음. 마이그레이션 번호 **0056**(`supabase/migrations/0056_works_serial_status.sql`; 26=0053~0055, 28=0057, 27=0058, 29=0059~0060 예약과 충돌 금지, 공유 DB 적용은 사용자가 직접).

## 목표 요약
헤더 `무료연재`·`유료연재` 탭 → 연재 목록 화면. 서브 행(전체·신작·인기·완결)이 필터. 카드에 NEW·완결 라벨과 가격 문구. 결과 없음 → `필터 초기화`. `lib/reader/navigation.ts`의 `href: null` 서브 행을 이 화면에 연결. 설계 근거 `design/UI-DESIGN-BACKLOG.md` 19번 보드(`mockups/project/Series.dc.html`).

## 요구사항 ID 후보 (REQUIREMENTS 반영은 총괄 세션 몫)
- **LIST-01**: 독자가 헤더 `무료연재`·`유료연재` 탭과 서브 행(전체·신작·인기·완결)으로 연재 목록 화면(`/series/free`, `/series/paid` — 경로는 plan에서 확정)에 진입하고, 서브 행·장르 칩 선택이 URL 쿼리로 유지된다. `navigation.ts`의 해당 `href: null` 8개가 연결된다.
- **LIST-02**: 작품은 공개 유료 회차 유무로 무료/유료 탭에 한 번만 나뉜다(공개·미삭제 회차 중 `price_tier`가 있는 것이 하나라도 있으면 유료). 신작은 첫 공개 회차의 `published_at`(연재 시작일) 최신순, 인기는 현행 인기 점수(`trendingScore`, 완독 데이터 Phase 26 전까지), 완결은 연재 상태 `완결` 작품, 전체는 현행 기본 정렬.
- **LIST-03**: 카드(공통 `SeriesCard`)가 표지·제목·작가·장르·공개 회차 수·NEW·완결 라벨·가격 문구(무료 / `N화부터 유료` / `회차당 N토큰~`)를 보이고, 목록은 `더보기` 버튼 + URL `page` 파라미터로 24개씩 늘어난다.
- **LIST-04**: works에 연재 상태(연재중/완결) 컬럼(`works.serial_status`, `ongoing|completed`)을 추가하고(마이그레이션 `supabase/migrations/0056_works_serial_status.sql`, 21-02가 정본이며 Phase 28은 이 컬럼을 재사용만 하고 만들지 않음), 작가가 스튜디오 작품 설정(`/studio/[workId]/settings`)에서 토글한다. 조건에 맞는 작품이 없으면 `필터 초기화` 안내를 보인다.

## 확정된 결정 (사용자, 2026-11-13)
| # | 결정 | 근거 |
|---|------|------|
| D-01 | 완결 판정 = `works.serial_status`(`ongoing`\|`completed`, 21-02가 정본이며 Phase 28은 재사용만 하고 만들지 않음) + 스튜디오 작품 설정(`/studio/[workId]/settings`)의 작가 토글 1개. 마이그레이션 `supabase/migrations/0056_works_serial_status.sql` 확정(26=0053~0055, 28=0057, 27=0058, 29=0059~0060 예약 번호와 충돌 금지) | 사용자 선택 |
| D-02 | 무료/유료 = 공개 유료 회차 유무. 작품은 한 탭에만 나온다 | 사용자 선택 |
| D-03 | 페이지네이션 = `더보기` 버튼 + URL `page` 파라미터, 한 번에 24개 | 사용자 선택 |
| D-04 | 인기 정렬 = 현행 `computeTrendingScores`(조회 0.4·좋아요 0.3·다음화 이동률 0.3). 완독률·연독률 전환은 Phase 26(RDATA) 이후 한 곳(정렬 키 함수)만 바꾸면 되게 둔다 | 위임 작업 지침 |
| D-05 | 신작 = 연재 시작일(첫 공개 회차 `published_at`) 최신순. 작품 `created_at`을 쓰지 않는다(초고 작성일과 다름) | 백로그 19번 |
| D-06 | NEW 라벨 기준 = 연재 시작일 14일 이내(상수 하나). 완결 라벨은 연재 상태 `완결` | Claude 판단(UI-SPEC에서 확정) |
| D-07 | 가격 문구는 공개 회차의 `price_tier`에서 계산: 유료 첫 회차 순번 `N화부터 유료`, 최저 단가 `회차당 N토큰~`. 목업은 두 문구를 쓰며 정확한 노출 규칙은 UI-SPEC | 백로그 19번 |

## 22·23 재사용 경계 (PLAN에 명시할 것)
- 공통(Phase 21이 만들고 22·23이 import): `SeriesCard`(표지·제목·작가·장르·라벨·가격 슬롯, 순위 숫자·진도 바·새 회차 배지를 위한 `overlay`/`footer` 슬롯), `WorkGrid`(auto-fill 그리드·빈 상태·`더보기`), `ListFilterBar`(장르 칩·정렬·상태 선택, URL 쿼리 동기화), `lib/discovery/work-list.ts`의 조회·정렬·필터 함수.
- Phase 21 전용: 무료/유료 구분 로직, 연재 상태 필터, 가격 문구, 서브 행 라우팅.
- 22(내서재)가 쓰는 것: `SeriesCard` 슬롯 + `WorkGrid`. 23(랭킹)이 쓰는 것: `SeriesCard`의 순위 숫자 슬롯 + `ListFilterBar` + 같은 조회 함수.

## 현행 코드 사실
- `lib/discovery/actions.ts` `listFeed`: 작품·회차를 1000행씩 전부 읽어 메모리에서 점수화·정렬(전 작품 로드). 연재 목록은 필터·페이지가 추가되므로 plan에서 서버 쿼리/뷰 이전 여부를 판단한다.
- `works`에는 연재 상태·작가 이름 컬럼이 없고(작가는 `owner_id` → `profiles`), 회차에 `price_tier`(10/30/50/100)·`published_at`이 있다.
- `components/reader/feed-card.tsx`(FeedCard)는 인기 배지·조회·좋아요를 보이는 홈용 카드. `FeedFilters`는 홈 앵커(`#weekly-ranking`)에 묶여 있다.
- 목록 경로는 `getHeaderVariant`에서 `compact`로 분류된다 → 연재 목록에서 2단 헤더(서브 행)가 보이도록 `reader` variant 확장이 필요하다(plan에 포함). `lib/reader/navigation.ts`의 활성 메인 탭 도출 함수는 `ReaderMainTab | null`을 반환해 `/search`·`/author/[id]`에서는 `null`(서브 행 숨김, 메인 탭 모두 비활성), `/series/free|paid`에서는 `free|paid`, 그 외 기존 경로는 기존 동작을 유지한다(27·28이 이어서 얹음).
- 병행 phase: 스튜디오 작품 설정 화면 `/studio/[workId]/settings`는 21-02가 만들며, 섹션을 배열/children으로 조립하는 구조(순서: 연재 상태 → 태그(27) → 댓글 허용(29))로 두어 27·29가 각자 독립 컴포넌트를 한 줄로 추가하게 한다. `app/studio/[workId]/page.tsx`는 진입 링크 추가만 한다.
