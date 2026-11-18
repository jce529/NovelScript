---
phase: 28-author-page-subscription
plan: "03"
requirements-completed: [APAGE-01, APAGE-02]
routing:
  decided: 2026-11-18
  classifier: jev
  tasks:
    - {id: "01-03", complexity: multi_file, risk: medium, flags: {P1: 0.18, P2: 0.83, P3: 0.19, P4: 0.71}, tier: 4, model: gpt-6.1-sol, channel: codex, verifier: sonnet}
---

# 28-03 SUMMARY — 작가 페이지·구독 액션·작품 상세 링크

## 만든 것
- `app/author/[authorId]/{page,actions,loading,not-found}`, `components/author/author-page.tsx`, `author-subscribe-button.tsx`, `tests/author/page.test.ts`(29건).
- `app/works/[workId]/page.tsx`: 작가명을 `/author/{profiles.id}` 링크로(공개 작가에만).
- **`lib/works/actions.ts` 변경(Phase 29와 공유 파일):** 파일 끝에 19줄만 추가 — `PublicWorkAuthor` 타입과 `getPublicWorkAuthor(supabase, work)`. 기존 코드 변경 없음.

## 검증
- Codex `gpt-6.1-sol`(high) `model:` 일치. Claude `sonnet` 리뷰: BLOCKER 0.
- 단위 통과, tsc는 기존 `LayoutProps` 오류 1건만, eslint 오류 0.
- 렌더·반응형·포커스·접근성은 **수동 UAT 대기**(jsdom 없음).

## 리뷰 경고(남은 이슈)
1. 컴포넌트 렌더 단언 없음(PLAN 범위 밖, 수동 UAT로 대체).
2. 본인이 공개 작품 0개면 자기 작가 페이지 404 — CONTEXT 결정("작품 없는 계정은 작가 페이지 없음")과 일치, 의도.
3. 로그인 사용자의 구독 상태 조회 실패 시 페이지 전체가 재시도 화면(공개 정보까지 가림). 개선 여지.
4. 프로필 이중 조회(`generateMetadata`와 로더).
5. `loadAuthorPageData`가 'use server' 파일 export라 공개 엔드포인트가 됨(공개 데이터·UUID 검증, 위험 낮음).
6. 완독률 칩은 DTO에 없어 생략.
