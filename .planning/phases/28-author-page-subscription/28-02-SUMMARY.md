---
phase: 28-author-page-subscription
plan: "02"
requirements-completed: [APAGE-01, APAGE-02, APAGE-03]
routing:
  decided: 2026-11-18
  classifier: jev
  tasks:
    - {id: "01-03", complexity: multi_file, risk: medium, flags: {P1: 0.21, P2: 0.56, P3: 0.78, P4: 0.51}, tier: 3, model: gpt-6-sol, channel: codex, verifier: sonnet}
---

# 28-02 SUMMARY — lib/author 공개·개인 API

## 만든 것
- `lib/author/types.ts`, `queries.ts`(프로필·통계·12개 작품 페이지, URL 쿼리 정규화), `subscriptions.ts`(`getAuthorSubscriptionState`, `toggleAuthorSubscription`, `listMyAuthorSubscriptions`).
- `tests/author/queries.test.ts`, `subscriptions.test.ts` — 단위 14건 통과, skip 0.

## 검증
- 작성 Codex `gpt-6-sol`(medium), `model:` 줄 일치. 리뷰 Claude `sonnet`: BLOCKER 0.
- `tsc --noEmit`: 이 변경과 무관한 기존 오류 1건(`app/layout.tsx:23` `LayoutProps` 미정의, `next typegen` 필요)만. 새 파일 오류 없음.
- `lib/works/actions.ts`는 수정하지 않았다(28-03 소관).

## 리뷰 경고
1. totalCount vs 목록 불일치 우려 → `world_work_reader_visible`이 발행 회차 1개 이상을 요구하므로 통계와 목록 집합이 같다(확인함). 해당 없음.
2. 토글이 DB에서 성공한 뒤 구독자 수 재조회가 실패하면 `ok:false` 반환(상태는 이미 바뀜). **남은 이슈**: 28-03 UI는 실패 시 롤백하므로 화면과 DB가 어긋날 수 있다. 수정 여부는 UAT에서 결정.
3. `author_unavailable`/`self_subscription_forbidden`이 일반 unavailable로 합쳐짐(PLAN 요구는 안전한 오류 코드뿐).
4. 테스트 미보강: `items.length>12` 거부, offset>0 마지막 페이지, state의 invalid UUID, 목록의 잘못된 행 거부.
