# Phase 27 PLAN 인덱스 — 독자용 검색

**공통 선행 조건(Prerequisites):** Phase 27 구현은 **Phase 21(0056)·Phase 28(0057) 구현 및 마이그레이션이 병합된 뒤에 시작**한다.

| Wave | PLAN | 실행 산출물 | 선행 PLAN(외부 포함) | 요구사항 |
|---|---|---|---|---|
| 1 | [27-01](27-01-PLAN.md) | `0058_reader_search.sql` 마이그레이션·실DB 테스트 | 외부: 21(`0056`), 28-01(`0057`) | SEARCH-01, SEARCH-02, SEARCH-03 |
| 2 | [27-02](27-02-PLAN.md) | `lib/search` 정규화·공개 조회·단일 실행 액션·단위 테스트 | 27-01 | SEARCH-01, SEARCH-02, SEARCH-03 |
| 3 | [27-03](27-03-PLAN.md) | 독자 헤더 검색 진입(`SearchEntry`)·최근/추천 패널·`/search` 메인 탭 `null` | 외부: 21-04 / 내부: 27-02 | SEARCH-01, SEARCH-02 |
| 3 | [27-05](27-05-PLAN.md) | `/studio/[workId]/settings` 내 `WorkTagsField`·태그 교체 액션 | 외부: 21-02 / 내부: 27-01, 27-02 | SEARCH-01 |
| 3 | [27-06](27-06-PLAN.md) | `/admin/search` 별도 라우트·`app/admin/page.tsx` 진입 링크 1줄·운영 액션 | 27-01, 27-02 | SEARCH-02 |
| 4 | [27-04](27-04-PLAN.md) | `/search` 4탭·태그 필터·작가 링크(`/author/[authorId]`)·빈/오류/로딩 UI | 외부: 28-03 / 내부: 27-02, 27-03 | SEARCH-01, SEARCH-03, SEARCH-04 |

## 총괄 세션 조정 및 checker 반영 요약

- **마이그레이션 번호 확정:** `0058_reader_search.sql`로 확정(26=0053~0055, 21=0056, 28=0057, **27=0058**, 29=0059~0060).
- **스튜디오 태그 입력(27-05):** `app/studio/[workId]/page.tsx` 본문이 아니라 Phase 21-02가 신설하는 `/studio/[workId]/settings` 화면에 독립 컴포넌트 `WorkTagsField`로 배치(순서: 연재 상태 → 태그 → 댓글 허용).
- **관리자 진입(27-06):** `/admin/search` 별도 라우트 + `app/admin/page.tsx`에는 진입 링크 한 줄만 추가(Phase 29가 `댓글 신고` 탭을 추가하므로 기존 탭 구조 미수정).
- **독자 헤더(27-03):** Phase 21-04가 `lib/reader/navigation.ts`의 활성 탭을 `ReaderMainTab | null`로 만든 뒤, 27-03은 검색 진입만 얹고 `/search`에서는 메인 탭 `null`을 반환.
- **작가 결과 링크(27-04):** Phase 28이 확정한 `/author/[authorId]`(`/author/{profiles.id}`)로 연결.
- **인기 점수 계약(27-01·27-02):** `28-PLAN-INDEX.md`의 현행 공개 전역 기준(발행 회차 `view_count` 합계 0.4 + `work_likes` 행 수 0.3 + 인접 발행 회차 조회 비율 평균 0.3)으로 고정.
- **Vitest 프로젝트 분류(`vitest.config.ts`):** `db` 테스트(`tests/search/search.database.test.ts`)는 `helpers/db` import 마커를 사용하고, `unit` 테스트는 mock만 쓰며 `helpers/db`·`SUPABASE_DB_URL`·`SUPABASE_SERVICE_ROLE_KEY`·`postgres(` 문자열을 피한다.
- **Open Decisions (`hidden-terms` 확장):** D-04 범위 밖 확장(`search_hidden_terms`·욕설 노출 제어·관리자 숨김 UI)은 미채택 시 **27-01 T1·T2 / 27-06 T1·T2 / 27-06 truth 2 수정**. 개인정보 패턴 차단(이메일·전화·주민번호)은 D-03 범위로 채택 여부와 무관하게 유지.
- **병합 충돌 주의:** 27-06과 29-06이 모두 `app/admin/page.tsx`를 수정한다(27은 링크 한 줄, 29는 `댓글 신고` 탭). 나중에 병합하는 쪽이 먼저 병합된 쪽을 rebase한다.
