---
phase: 28-author-page-subscription
plan: "04"
requirements-completed: []
routing:
  decided: 2026-11-18
  classifier: jev
  tasks:
    - {id: "01-02", complexity: multi_file, risk: low, flags: {P1: 0.27, P2: 0.78, P3: 0.43, P4: 0.59}, tier: 3, model: gpt-6-sol, channel: codex, verifier: tests+diff}
---

# 28-04 SUMMARY — 통합 검증

## 만든 것
- `tests/author/integration.database.test.ts`(DB 3건), `tests/author/author-page-contract.test.ts`(5건).

## 자동 검증 (2026-11-18)
- 단위: `verify-vitest-count --project unit` — passed 63, failed 0, pending 0.
- **실DB: 일회용 Supabase `anzafn…`(공유 `ymudwg…`와 다름 확인)에 0057 적용.** `verify-vitest-count --project db` — **passed 16, failed 0, pending 0** (author-subscriptions 13 + integration 3). 공유 DB에는 적용하지 않았다.
- tsc: 이번 변경과 무관한 기존 오류 1건(`app/layout.tsx:23` `LayoutProps`, `next typegen` 필요)만. eslint 오류 0(기존 경고 1).
- DB 테스트 픽스처 결함 4건을 실DB 실행 중 발견·수정했다(SQL 결함 아님): `test_users` 권한 부여 누락, 익명 claims에 `sub:""` 포함(→`auth.uid()` 캐스팅 실패), 원격 DB 왕복으로 인한 타임아웃, 익명 역할로 `author_subscriptions` 건수 조회. 원격 풀러 연결은 단일 트랜잭션이 길어지면 끊길 수 있어(ECONNRESET·DNS) **파일별로 나눠 실행**해야 안정적이다(쿼리당 왕복 약 1초, 합쳐 실행 시 6분 이상).

## 브라우저 UAT (일회용 DB 연결 dev 서버, 익명)
통과:
- `/author/{uuid}`: 프로필·통계 4칩(작품/연재중/완결/구독자)·구독 버튼·필터·정렬·작품 카드·"모두 보여드렸어요" 문구 렌더. 헤더 메인 탭 활성 없음.
- 필터 `완결` → URL `?status=completed` 반영, 빈 상태("완결 작품이 없어요"·"전체 보기").
- 없는 작가 UUID·잘못된 UUID → "작가 페이지를 찾을 수 없어요"(작품 둘러보기·작가 검색하기).
- 360px: 가로 스크롤 없음, 정렬이 Select로 전환, 칩 줄바꿈. 44px 미만 요소는 공용 헤더(로고·로그인)뿐(이 phase 범위 밖).
- 익명 구독 클릭 → 로그인 안내(`role=status`), 링크 `/login?next=/author/{uuid}`.
- 작품 상세의 작가명이 `/author/{profiles.id}` 링크.

**미검증(로그인 필요, 사용자 확인 대기):** 로그인 독자의 구독 토글 낙관 갱신·롤백, 구독자 수 1/0/1 화면 반영, 본인 페이지(버튼 없음·스튜디오 링크), 정지 계정 오류, 12개 초과 더보기와 추가 카드 포커스(일회용 DB에 공개 작품 13개 이상인 작가 없음), 키보드 조작, 인기·신작 정렬 화면.

## 남은 이슈
- 토글 성공 후 구독자 수 재조회 실패 시 `ok:false` 반환(화면·DB 어긋남 가능).
- 로그인 사용자의 구독 상태 조회 실패 시 페이지 전체가 재시도 화면.
- `loadAuthorPageData`가 서버 액션 파일 export라 공개 엔드포인트가 됨(공개 데이터, 낮은 위험).
- 0057은 일회용 DB에만 적용됨. 공유 DB 적용은 총괄·사용자 승인 후.
