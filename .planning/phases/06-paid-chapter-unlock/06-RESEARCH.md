# Phase 6: Paid Chapter Unlock - Research

**Original research:** 2026-09-08
**Implementation reconciliation:** 2026-09-15
**Scope:** 최신 설계/코드 기준 연구 문서 갱신. 외부 자료와 실제 DB를 새로 검증한 보고가 아니다.
**Confidence:** 코드 구조 HIGH / 실제 SQL·브라우저 동작 미검증

## Summary
과거 chapter_unlocks / unlock_paid_chapter 제안은 최신 orders / order_items / entitlements 구조로 대체됐다.
기존 구현을 다시 만드는 연구가 아니라 후속 작업자가 현재 구조와 검증 한계를 이해하기 위한 기록이다.

## Standard Stack
Next.js App Router, TypeScript, Supabase Auth/PostgreSQL/JS, SQL RPC, Vitest.
기존 User는 profiles/auth.users, 작품/회차는 works/chapters다. 별도 ORM/인증 시스템을 추가하지 않았다.

## Architecture Patterns

### Purchase and access separation
- create_purchase_order: 사용자·wallet 잠금 → 유료 공개 항목 검사 → PENDING과 여러 항목 snapshot.
- pay_purchase_order: 주문 소유권/상태 확인 → 저장 금액 차감 → PAID → Entitlement 발급.
- can_view: 무료/활성 사용자/작품·회차/기간/회수를 기준으로 판정한다. 구매 테이블을 조회하지 않는다.
- 영구 권한은 expires_at NULL, 작품 권한은 chapter_id NULL.
- OrderItem과 Entitlement의 chapter_id/work_id 복합 FK가 작품·회차 불일치를 막는다.

### Atomicity and idempotency
orders(user_id, idempotency_key) UNIQUE와 order_item_id UNIQUE를 사용한다.
지갑 FOR UPDATE 잠금으로 같은 사용자의 주문 생성/결제를 직렬화한다.
동일 PAID 주문은 재차감·재발급하지 않는다. 다른 주문의 같은 회차는 권한을 재검사한다.
가격이 바뀌어도 과거 항목 price/conditions는 바뀌지 않는다.
실제 동시 연결 경합은 아직 테스트하지 않았다.

### Content boundary
공개 metadata 쿼리는 유지하고 content SELECT 권한을 제한했다.
read_chapter_content는 권한이 없으면 NULL, 무료 또는 유효 권한이면 본문을 반환한다.
활성 작가의 자기 작품 본문 조회는 별도 허용한다. Studio 읽기도 RPC로 전환했다.
임의 잔액 조작 방지를 위해 apply_wallet_delta는 브라우저 역할에서 실행할 수 없게 했다.

### UI
뷰어의 구매 버튼 → Server Action → 주문 생성 → 결제 → refresh.
잔액 부족 시 한국어 오류를 표시하고 동일 주문 재시도를 지원한다.
확인 모달/로그인 복귀/충전 연결은 현재 구현에 없다. 과거 연구의 이 기능들을 구현 사실로 인용하지 않는다.

## Remaining Work
1. **작가 정산:** 90/10 잠정 비율의 작가 크레딧·수수료 snapshot·조정점은 미구현이다. ROADMAP Phase 6에 남겨 둔다.
2. **DB 검증:** migration 적용, SQL/RLS, 실제 다중 연결 동시성 검증이 필요하다.
3. **실충전:** Phase 5 실제 토큰 충전 연결 후 전체 구매 E2E가 필요하다.

작가 정산을 구현할 때는 여러 작가가 포함된 주문의 잠금 순서, 동일 항목 재지급 방지,
작가 크레딧 실패 시 전체 rollback을 설계해야 한다. 기존 독자 우선 잠금을 그대로 늘리는 경우의
교차 구매 교착 위험을 검토한다. 과거 PAID 기록은 현재 비율로 자동 소급 지급하지 않는다.
이 항목은 후속 설계 주의사항이며 이번에 구현하거나 실행 계획을 확정한 내용이 아니다.

## Don't Hand-Roll
- 별도 chapter_unlocks로 거래와 권한 책임을 다시 합치는 것.
- 주문 존재만으로 본문을 반환하는 것.
- 클라이언트가 가격·userId·권한을 결정하는 것.
- 실제 DB 검사 없이 mock 테스트로 트랜잭션 안전성을 완료 판정하는 것.

## Validation Architecture
06-VALIDATION.md 참조. 기존 서비스 테스트 11개 통과, DB 테스트 10개 미실행.
26개 통과라는 이전 전체 결과에는 관련 인증/AI 비용 회귀 15개가 포함된다.

## Sources
현재 코드: 0001_init.sql, 0005_commerce.sql, lib/commerce/actions.ts, lib/access/actions.ts,
lib/chapters/actions.ts, viewer-shell.tsx, tests/commerce/*, docs/commerce-entitlements.md.
이전 외부 연구 날짜는 2026-09-08이다. 후속 코드 작성 시 설치된 Next.js 문서와 DB 공식 문서를 다시 확인한다.
