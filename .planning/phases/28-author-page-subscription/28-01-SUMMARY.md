---
phase: 28-author-page-subscription
plan: "01"
requirements-completed: [APAGE-01, APAGE-02, APAGE-03]
routing:
  decided: 2026-11-18
  classifier: jev
  tasks:
    - {id: "01-03", complexity: architectural, risk: high, flags: {P1: 0.31, P2: 0.32, P3: 0.84, P4: 0.59}, tier: 4, model: gpt-6.1-sol, channel: codex, verifier: sonnet}
---

# 28-01 SUMMARY — 0057 작가 구독 마이그레이션·DB 테스트

## 만든 것
- `supabase/migrations/0057_author_subscriptions.sql` — `author_subscriptions`(PK author_id,user_id · notify · 본인 SELECT RLS · 직접 쓰기 revoke), SECURITY DEFINER RPC 5개: `get_public_author_profile`, `get_public_author_stats`, `list_public_author_works`(공개 판정·상태·정렬 3종·12개 상한·인기 점수), `list_my_author_subscriptions`, `toggle_author_subscriptions`(advisory lock, 행 유지·notify 토글).
- `tests/author/author-subscriptions.database.test.ts` — 13건. `SUPABASE_DB_URL` 없으면 skip.
- `tests/author/verify-vitest-count.mjs` — 실행 건수 검증 도구.

## 검증
- 작성: Codex `gpt-6.1-sol` (high), 로그 `model:` 줄 일치 확인. 변경 범위는 위 3개 파일뿐.
- 리뷰: Claude `sonnet` 정적 검토 — BLOCKER 0.
- **실DB 미검증:** DB 적용·`--project db` 실행 안 함. DB 테스트는 이 환경에서 13건 skip(미검증으로 기록).

## 리뷰 경고 (처리)
1. 인기 점수 반올림: SQL numeric vs 어댑터 float → .5 경계에서 1점 차이 가능. **28-02·28-04 픽스처는 .5 경계값을 피한다.**
2. 전역 baseline에 비공개 프로필 작가의 공개 작품이 포함됨(PLAN의 "공개 전역 작품" 정의와 일치). 의도 동작.
3. 토글은 `user_can_write`만 검사, `user_is_verified`는 보지 않음(0019 작품 토글과 동일 수준, PLAN 범위). 인증 계정 게이트 적용 여부는 정책 결정 사항으로 남김.
4. 테스트 마이그레이션 목록에 0036 없음 — `world_work_reader_visible`은 0033에서만 정의되어 영향 없음(확인함).
