# Phase 22: 독자용 내서재 (이어 읽기 · 선호작 · 알림 구독 · 소장함) - Context

**Gathered:** 2026-11-18
**Status:** Ready for UI-SPEC → planning
**실행 순서 제약:** plan은 지금 만들 수 있지만, **실행은 Phase 28(작가 페이지·`author_subscriptions`) 병합 뒤**에 한다(D-01).

<domain>
## Phase Boundary

헤더 메인 탭 `내서재`와 서브 행 4종(이어 읽기 · 선호작 · 알림 구독 · 소장함)을 실제 화면에 연결한다. `lib/reader/navigation.ts`의 `library` 탭과 서브 행 4개(`href: null`)가 이 화면을 가리키게 된다.

- 이어 읽기: 최근 읽은 작품 목록, 작품 전체 진도 바, `이어 읽기` 버튼, X로 목록에서 숨기기
- 선호작: 정렬 3종 + `새 회차` 배지
- 알림 구독: 작품 알림 스위치 + 작가 알림 스위치
- 소장함: 소장한 유료 회차를 작품별로, 필터 `전체`·`소장중`
- 비로그인·빈 상태: 화면 안 안내 + 다음 행동 버튼(자동 이동 없음)

범위 밖: 알림 전달 채널(푸시·메일), 대여·대여 만료·소장/대여 팝업(Phase 33), 작가 페이지 자체(Phase 28).

</domain>

<requirements>
## 요구사항 ID 후보 (REQUIREMENTS 반영은 총괄 세션 몫)

- **LIB-01**: 독자가 헤더 `내서재` 탭과 서브 행 4종으로 내서재 화면에 진입하고, 서브 행이 곧 탭이며 선택 탭·정렬·필터·페이지가 URL에 유지된다. `navigation.ts`의 `library` 메인 탭과 서브 행 4개가 연결된다. 비로그인은 화면 안 로그인 안내(돌아올 경로 보존), 탭마다 빈 상태 안내와 다음 행동 버튼을 보인다.
- **LIB-02**: 이어 읽기 탭이 최근 읽은 순으로 작품을 보이고, 각 행에 작품 전체 진도 바(마지막으로 읽은 회차 순번 / 공개 회차 수)와 `이어 읽기` 버튼을 둔다. 숨겨진(블라인드·비공개) 회차는 `볼 수 없음`으로 표시한다. X를 누르면 목록에서만 숨기고 진도·완독 기록은 유지하며, 그 작품을 다시 읽으면 목록에 돌아온다.
- **LIB-03**: 선호작 탭이 `work_bookmarks`의 작품을 `최근 업데이트순`·`최근 추가순`·`제목순`으로 정렬하고, 안 읽은 새 회차가 있는 작품에 `새 회차` 배지를 붙인다.
- **LIB-04**: 알림 구독 탭이 `작품 알림`(작품별 스위치)과 `작가 알림`(작가별 스위치, 이름을 누르면 `/author/[uuid]`)을 보인다. 스위치를 꺼도 목록에 남는다(`알림 꺼짐`). 작품 알림은 `work_subscriptions`에 알림 여부 플래그를 두어 행을 유지하고, 작품 상세의 알림 버튼도 같은 플래그를 켜고 끈다.
- **LIB-05**: 소장함 탭이 소장한 유료 회차를 작품별로 묶어 보이고 필터 `전체`·`소장중`을 제공한다. 상태 계산은 `entitlements.expires_at` 기준으로 소장/대여중/대여 만료를 구분할 수 있게 만들어 Phase 33이 대여 필터·팝업만 얹게 한다.

</requirements>

<decisions>
## Implementation Decisions

### 알림 구독 탭
- **D-01:** 작가 알림 스위치를 **포함한다.** Phase 28이 제공하는 `author_subscriptions`(notify 플래그로 행 유지)와 내 구독 작가 조회·토글 액션을 재사용한다. 따라서 **Phase 22 실행은 Phase 28 병합 후**에 한다. plan은 28의 API 이름·DTO를 28 PLAN(`28-0X-PLAN.md`)에서 확인해 맞춘다.
- **D-02:** 작품 알림을 끄면 **행을 지우지 않고 알림 여부 플래그로 유지**한다. `work_subscriptions`에 컬럼(예: `notify boolean not null default true`)을 추가하는 새 마이그레이션이 필요하다. 작품 상세 헤더의 알림 버튼(`lib/reader/subscriptions.ts` `toggleSubscription`)도 행 삭제 대신 이 플래그를 토글하도록 바꾼다(없으면 insert, 있으면 notify 반전). 화면 상태 `알림 켜짐`/`알림 꺼짐`. Phase 28 작가 구독과 같은 방식.

### 선호작 탭
- **D-03:** `새 회차` 배지 = **안 읽은 새 회차가 있을 때.** 읽은 작품은 `reading_progress`의 마지막 읽은 회차보다 순번이 뒤인 공개 회차가 있으면, 읽은 적 없는 작품은 선호작에 추가한 시각(`work_bookmarks.created_at`) 이후 공개된 회차가 있으면 붙인다.
- **D-04:** 정렬 3종은 목업 그대로 `최근 업데이트순`(마지막 공개 회차 시각)·`최근 추가순`(선호작 추가 시각)·`제목순`. 기본값은 최근 업데이트순.

### 이어 읽기 탭
- **D-05:** 진도 바 = **작품 전체 진도**(마지막으로 읽은 회차 순번 / 공개 회차 수). 메타는 `N화 읽는 중 · 총 M화` 형태(정확한 문구는 UI-SPEC).
- **D-06:** X = **목록에서만 숨김.** `reading_progress`에 숨김 표시(예: `hidden_at timestamptz`)를 추가하고, 다음 진도 저장(upsert) 때 자동으로 해제해 다시 읽으면 목록에 돌아오게 한다. 작품 상세 이어보기·완독 기록은 그대로다. 숨긴 직후 실행 취소 토스트를 제공한다.

### 소장함 탭
- **D-07:** 이번 phase는 **필터 `전체`·`소장중`만** 노출한다. `대여중`·`대여 만료` 칩과 만료 회차의 소장/대여 팝업은 Phase 33(RENT)이 추가한다. 다만 소유 상태 계산 함수는 `entitlements.expires_at`으로 4상태(소장/대여중/대여 만료)를 판별하도록 만들어 둔다.

### 화면 형태·진입
- **D-08:** 목록은 **목업처럼 가로형 행**(표지 썸네일 + 제목 + 메타 + 행 동작)이다. Phase 21의 `SeriesCard` 그리드는 쓰지 않고 내서재 전용 행 컴포넌트를 만든다. 페이지는 Phase 21과 같은 `더보기` 버튼 + URL `page` 파라미터, 한 번에 24개.
- **D-09:** 비로그인은 **화면 안 로그인 안내.** 내서재 화면·서브 행은 그대로 보이고 본문에 16번 보드의 비로그인 빈 상태(로그인 버튼, 돌아올 경로 보존)를 보인다. 로그인 화면으로 자동 이동하지 않는다.

### Claude's Discretion
- 경로 형태(`/library/[tab]` 같은 경로 세그먼트 vs `/library?tab=`)와 기본 탭(이어 읽기 권장). 헤더 variant는 Phase 21처럼 2단 헤더(서브 행)가 보이게 한다.
- 홈의 `최근 읽은 작품`(`RecentlyReadSection`, `listRecentlyRead`)도 숨긴 기록을 빼는 것이 일관적이다 — 같은 조회 함수를 쓰면 함께 반영한다.
- 알림 꺼진 작품·작가를 목록에서 완전히 빼는 동작은 두지 않는다(목업에도 없음). 필요하면 후속.
- 완결 작품의 작품 알림 행 메타(`완결 · 알림 받을 회차 없음`)와 연재 주기 문구 — 연재 주기 데이터가 없으면 최근 공개일 등 있는 데이터로 대체.
- 빈 상태 4종 문구와 다음 행동 버튼(예: 이어 읽기 없음 → `연재 목록 보기`)은 UI-SPEC에서 16번 보드 기준으로 확정.
- 마이그레이션 번호: 0053~0060은 다른 phase가 예약했다. plan 시점에 총괄 세션에 다음 번호(0061 이후)를 확인한다. D-02와 D-06은 한 파일로 묶어도 된다.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 설계 근거
- `.planning/design/UI-DESIGN-BACKLOG.md` — 내서재(18번 보드) 행, 빈 상태(16번), 숨긴 회차 규칙, 독자 헤더·서브 행 결정
- `.planning/design/mockups/project/Library.dc.html` — 내서재 목업(탭별 문구·정렬·필터·스위치 상태)
- `.planning/design/mockups/project/EmptyStates.dc.html` — 비로그인·빈 상태 시안
- `.planning/design/mockups/project/Header.dc.html` — 헤더 2단·서브 행

### 선행·연동 phase
- `.planning/phases/21-reader-series-list/21-CONTEXT.md` — 재사용 경계(`WorkGrid`·더보기·URL page), 헤더 variant 확장, `navigation.ts` 활성 탭 도출
- `.planning/phases/21-reader-series-list/21-UI-SPEC.md` — 목록 화면 디자인 계약(톤·간격·빈 상태)
- `.planning/phases/28-author-page-subscription/28-CONTEXT.md` — `author_subscriptions`·notify 플래그·내 구독 작가 조회 API(Phase 22가 소비)
- `.planning/phases/28-author-page-subscription/28-01-PLAN.md` ~ `28-04-PLAN.md` — 28이 실제로 노출하는 함수 이름·DTO
- `.planning/phases/26-reader-reading-data/26-CONTEXT.md` — 읽기 진도 데이터(`chapter_reading_state`)
- `.planning/ROADMAP.md` Phase 22·28·33 항목 — 범위와 대여 이월

### 스키마
- `supabase/migrations/0003_reader.sql` — `reading_progress`(user_id, work_id PK), `work_subscriptions`, `work_bookmarks`
- `supabase/migrations/0005_commerce.sql` — `entitlements`(`expires_at`), 소유 판정
- `supabase/migrations/0009_blind_access.sql` — 블라인드 회차 접근 규칙(`볼 수 없음` 표시 근거)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/reader/progress.ts` `listRecentlyRead`/`upsertReadingProgress`: 이어 읽기 조회·숨김 해제 지점
- `lib/reader/bookmarks.ts`, `lib/reader/subscriptions.ts`, `lib/reader/toggle.ts`: 선호작·알림 토글(현재 select-then-insert-or-delete; D-02로 알림만 플래그 방식으로 변경)
- `components/reader/work-grid.tsx`의 더보기·빈 상태 처리, `components/reader/list-filter-bar.tsx`의 URL 쿼리 동기화 패턴(정렬·필터 칩)
- `components/reader/recently-read-section.tsx`: 홈 이어 읽기 섹션(숨김 반영 대상)
- `components/reader/reader-header-frame.tsx`, `lib/reader/navigation.ts`: 헤더 서브 행 연결

### Established Patterns
- 독자 목록 화면은 서버 컴포넌트 조회 + URL 쿼리 상태(Phase 21)
- 토글은 로그인 필수, 정지 계정은 write-access 거부(Phase 7·28)
- 빈 상태는 자동 이동 없이 화면 안 안내 + 다음 행동 버튼

### Integration Points
- `navigation.ts`의 `library` 메인 탭·서브 행 4개 `href`
- 작품 상세 헤더 알림 버튼(`components/reader/work-header-actions.tsx`) — notify 플래그로 동작 변경
- Phase 28 작가 구독 조회·토글 액션

</code_context>

<specifics>
## Specific Ideas

- 탭 안내 문구는 목업 기준: 이어 읽기 "기록을 삭제해도 읽은 진도와 완독 기록은 유지돼요", 알림 구독 "끄면 알림만 멈추고 목록에는 남아요", 선호작 "새 회차가 올라온 작품에는 표시가 붙어요".
- 소장함은 목업처럼 작품별 묶음 행(`13화 · 소장중 회차 5개` 형태).
- 목업의 대여 관련 문구(`대여 만료 알림은 따로 보내지 않아요`, 소장/대여 팝업)는 이번 phase에서 빼고 Phase 33에서 다룬다.

</specifics>

<deferred>
## Deferred Ideas

- 소장함 `대여중`·`대여 만료` 필터, 만료 회차 소장/대여 팝업 — Phase 33(RENT)
- 알림 전달 채널(푸시·메일) — 미배정
- 알림 꺼진 항목을 목록에서 완전히 제거하는 동작 — 필요 시 후속

</deferred>

---

*Phase: 22-reader-library-my-shelf*
*Context gathered: 2026-11-18*
