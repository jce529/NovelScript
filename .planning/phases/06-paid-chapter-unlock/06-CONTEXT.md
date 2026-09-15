# Phase 6: Paid Chapter Unlock - Context

**Gathered:** 2026-09-08
**Updated:** 2026-09-15
**Status:** Latest implementation documented; author settlement pending; runtime verification pending

<domain>
## Phase Boundary

현재 Phase 6 기준은 최신 구매/권한 분리 요구사항과 커밋 57e1c8e / fc8a4a5의 구현이다.
기존 profiles(User), works(Work), chapters(Episode), wallets/ledger_entries를 유지한다.
orders / order_items는 구매 사실과 조건, entitlements는 열람 권한을 담당한다.
작가 정산은 아직 구현하지 않았으며 로드맵의 남은 구현 항목으로 유지한다.
Phase 5 실제 충전 연동은 아직 없고 현재 구매 코드는 기존 토큰 지갑을 사용한다.
</domain>

<decisions>
## Implementation Decisions

### 최신 구매·권한 모델
- **C-01:** 기존 사용자/인증과 Work → Chapter 관계를 재사용한다.
- **C-02:** Order는 여러 OrderItem을 가진다. 주문 상태는 PENDING/PAID/CANCELLED/REFUNDED다.
- **C-03:** OrderItem에는 구매 당시 가격·조건을 snapshot한다. 결제는 저장된 주문 금액으로 처리한다.
- **C-04:** Entitlement는 실제 부여 때만 생성한다. 사용자 × 작품 조합을 미리 생성하지 않는다.
- **C-05:** can_view는 무료 여부, 사용자, 작품/회차 범위, starts_at, expires_at, revoked_at을 검사한다. Order로 열람 권한을 판정하지 않는다.
- **C-06:** 영구 구매는 expires_at NULL이다. chapter_id NULL이면 작품 전체 권한이며, 현재 구매 UI/RPC는 회차 영구 소장이다.
- **C-07:** 지갑 차감 + PAID 변경 + Entitlement 발급은 pay_purchase_order의 단일 DB 트랜잭션이다.
- **C-08:** 같은 주문 재결제와 같은 사용자의 중복 회차 구매를 방지한다.
- **C-09:** chapters 본문 SELECT 권한을 제한하고 read_chapter_content RPC를 사용한다. 메타데이터와 작가 편집 기능을 유지한다.

### 최신 구현의 UI
- **C-10:** 뷰어에 토큰 가격·소장 버튼·처리 중 상태·구매 오류·재시도를 표시한다.
- **C-11:** 성공 후 revalidatePath와 router.refresh로 본문·권한을 갱신한다.
- **C-12:** 비로그인 사용자는 /login 링크로 안내한다. 목록은 기존 탐색 동작을 유지한다.

### 작가 정산 — 미구현, 로드맵에 유지
- **D-10 (historical decision, still pending):** 작가 90% / 플랫폼 10%는 이전에 정한 잠정 비율이다.
- 현재 pay_purchase_order는 독자만 차감한다. 작가 크레딧·수수료 배분·정산 비율 조정점은 없다.
- 후속 구현 시 비율을 단일 조정점으로 격리하고, 거래 당시 분배를 보존하며, 독자 차감·작가 크레딧·권한 발급을 원자적으로 처리해야 한다.
- 이번 문서 패치에서는 정산 코드나 정산 migration을 추가하지 않는다.

### Historical decisions and precedence
06-DISCUSSION-LOG.md는 당시 결정의 기록이다. 구 chapter_unlocks 설계, 확인 모달,
목록에서 구매 후 이동, 후속 재요청 없는 본문 반영, 로그인/충전 복귀는 현재 구현 설명이 아니다.
해당 UX는 과거 논의와 현재 구현의 차이로만 기록한다. 이번 정리에서 과거 흐름을 복원할 실행 계획을 신설하지 않는다.
이 문서는 최신 구조·실제 기능을 기준으로 하며 과거 사용자 발언을 새로 해석해 구현 완료로 만들지 않는다.
</decisions>

<canonical_refs>
## Canonical References
- docs/commerce-entitlements.md — 최신 구현 보고, DB 미적용·테스트 한계
- .planning/REQUIREMENTS.md — PAY-02와 미래 PAY-04
- .planning/ROADMAP.md — 작가 정산 및 Phase 5 의존성
- .planning/phases/06-paid-chapter-unlock/06-SUMMARY.md — 소급 구현 요약
- .planning/phases/06-paid-chapter-unlock/06-VERIFICATION.md — 증거와 미검증 구분
- supabase/migrations/0001_init.sql, supabase/migrations/0005_commerce.sql
</canonical_refs>

<code_context>
## Existing Code Insights
- lib/commerce/actions.ts: 주문 생성/결제, Zod 검증, 한국어 오류.
- lib/access/actions.ts: 세션 기반 canView·본문 읽기.
- lib/chapters/actions.ts: 보호된 본문·목차 권한 일괄 조회.
- components/reader/viewer-shell.tsx: 소장 버튼·재시도·성공 refresh.
- app/works/[workId]/chapters/[chapterId]/actions.ts: 인증된 구매와 읽기 진행 권한 재검사.
- app/studio/[workId]/chapters/[chapterId]/actions.ts: 작가 본문 RPC 전환.
</code_context>

<specifics>
## Specific Ideas
지갑 금액 단위는 기존 TOKEN이다. 실제 화폐 충전은 Phase 5 책임이다.
</specifics>

<deferred>
## Deferred Ideas
대여 판매, 독자 월정액, 묶음 상품, 환불/회수 관리 API, 작가 현금화는 별도 후속 범위다.
모델에는 작품/기간/회수 확장 지점이 있지만 기능 전체를 구현했다고 표시하지 않는다.
멀티 AI/BYOK와 구독 AI의 MCP 연결은 docs/ai-integration-roadmap.md의 별도 목표다.
</deferred>
