# Phase 5: Real Payment Integration - Context

**Gathered:** 2026-09-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 5 delivers the "현금 → 토큰 충전" (top-up) direction only: a user purchases platform tokens through Toss Payments, and the wallet balance is credited exclusively by a verified Toss webhook event — never by a client-side redirect/return callback (PAY-01, PAY-03).

Explicitly NOT in this phase: spending tokens to unlock paid chapters (PAY-02 — that's Phase 6), cash-out/환전 (out of scope for v1 per PROJECT.md), and the subscription (월정액) track described in docs/5-4 (not in REQUIREMENTS.md v1 scope).

</domain>

<decisions>
## Implementation Decisions

### 토큰 충전 상품 구성
- **D-01:** 4단계 고정 충전 티어를 제공한다: 100토큰=1,000원 / 300토큰=2,850원 / 550토큰=5,000원 / 1,000토큰=9,000원. 기준선(1토큰=10원, `lib/ai/cost.ts`의 `KRW_PER_WALLET_TOKEN`)을 유지하되 대량 구매일수록 할인율이 커지는 구조(0% → 5% → 9.1% → 10%).
- **D-02:** 자유 금액 입력 옵션은 제공하지 않는다 — 위 4개 고정 패키지만 노출.

### 충전 진입 및 결제중 UX
- **D-03:** 충전 진입점은 `AccountPanel`(계정 팝오버)의 "보유 토큰" 표시 옆 `+` 버튼이며, 클릭 시 충전 모달을 연다. 별도 페이지가 아니라 기획서(docs/5-4)의 "토큰 충전소 모달" 패턴을 그대로 계승한다.
- **D-04:** Toss 결제는 결제창 팝업/리다이렉트 방식(`requestPayment`)을 쓴다 — 위젯 인라인 임베드가 아니다. 카드/카카오페이/네이버페이/토스페이는 Toss가 제공하는 하나의 결제수단 선택 화면으로 자동 통합된다(PROJECT.md 기존 결정과 일치).
- **D-05:** Toss 승인 후 `successUrl`로 복귀한 시점부터 웹훅이 크레딧을 완료할 때까지, 모달은 스피너를 보여주며 자동 폴링으로 잔액 갱신을 대기한다. 크레딧이 확인되면 모달이 자동으로 닫힌다.
- **D-06:** 폴링에는 타임아웃/안내 문구 전환이 없다 — 사용자는 언제든 직접 "닫기" 버튼으로 모달을 닫을 수 있으며, 그 외엔 무제한 대기한다.

### 결제 실패·취소·미확정 처리
- **D-07:** 사용자가 Toss 결제창에서 결제를 중도 취소하면(`failUrl` 리다이렉트), 모달은 닫히지 않고 티어 선택 화면으로 되돌아가며 상단에 "결제가 취소되었어요" 토스트를 띄운다.
- **D-08:** 결제는 Toss 측에서 승인되었지만 웹훅이 도착하지 않거나(장애) 서명 검증에 실패해 크레딧이 반영되지 않은 상황은 서버측 로깅/알림으로만 처리한다 — 관리자가 수동 확인 후 보상하는 방식이며, 사용자 화면에는 이 상태를 노출하지 않는다. 자동 재시도/보상 파이프라인은 이번 phase 범위 밖이다.

### Claude's Discretion
- Toss `orderId` 생성 규칙과 `ledger_entries.reference_type`/`reference_id` 매핑 방식 — 기존 `unique(wallet_id, reference_type, reference_id)` 제약을 활용한 멱등성 설계는 research/planning에서 확정.
- 폴링 간격과 폴링 대상(단순 wallet balance 재조회 vs 별도 주문 상태 API) — 구현 세부사항.
- Toss 결제 승인 API 서버측 검증 절차(시크릿 키로 승인 confirm 호출, 웹훅 서명 검증 방식) — Toss 공식 웹훅 문서와 대조해 리서치 단계에서 확정 필요.
- 결제내역(구매내역) 페이지 노출 여부 — 이번 논의에서 다루지 않았고 PAY-01/03에 명시되어 있지 않음. planner가 최소 범위로 판단하거나 별도 phase 후보로 남길 것.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 결제 UX / 비즈니스 모델
- `docs/5-4 통합 결제 시스템 및 글로벌 헤더 (UI,UX & BM).md` — GNB 토큰 잔액/충전 버튼 패턴, "토큰 충전소 모달", 1-click buy 흐름, 충전 상품 가격 예시(100토큰=1,000원/550토큰=5,000원 — D-01의 출발점). 이 문서의 월정액 구독제 섹션은 v1 범위 밖이므로 무시.
- `docs/3. 비즈니스 모델 및 사용자 정책.md` §3.1 — 충전(현금→토큰) 방향 환전 수수료 정책의 배경 근거. 환전(토큰→현금, cash-out) 방향은 out of scope이므로 이 phase엔 적용되지 않음.

### 프로젝트 결정
- `.planning/PROJECT.md` Key Decisions 표 — Toss Payments 직접 연동(PG 추상화 레이어 없음), 위젯 하나로 카드/카카오페이/네이버페이/토스페이 커버.
- `.planning/REQUIREMENTS.md` — PAY-01, PAY-03이 이 phase의 리터럴 요구사항 (PAY-02는 Phase 6).

### 기존 코드 / 스키마
- `lib/ai/cost.ts` — `KRW_PER_WALLET_TOKEN=10`, `USD_TO_KRW=1400` 상수와 그 헤더 주석("Phase 5가 실가격 확정하면 이 상수만 조정"). D-01의 4단계 가격은 이 기준선을 그대로 씀.
- `supabase/migrations/0001_init.sql` — `wallets`/`ledger_entries` 테이블과 `apply_wallet_delta()` 함수(`FOR UPDATE` 락 + `unique(wallet_id, reference_type, reference_id)`로 멱등성 보장). 웹훅 크레딧 로직은 반드시 이 함수를 재사용해야 한다.
- `components/layout/account-panel.tsx`, `components/layout/site-header.tsx` — 현재 "보유 토큰" 표시 UI. D-03 충전 진입점이 붙는 정확한 위치.

### 미해결 리스크 (이번 논의에서 사용자가 선택하지 않았지만 실행 가능성에 직접 영향)
- `.planning/STATE.md` Blockers/Concerns 섹션 — Toss 가맹점 심사/사업자등록 상태 미확인(2주+ 외부 심사 가능성), 선불전자지급수단 규제 분류 미확인. 리서치 단계에서 반드시 재확인하고, 실제 라이브 키 없이 진행 가능한 범위(테스트 키/샌드박스)를 먼저 명확히 할 것.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `wallets`/`ledger_entries` 테이블 + `apply_wallet_delta()` RPC (`0001_init.sql`) — 이미 동시성 안전 + 멱등 크레딧을 보장하므로, 웹훅 핸들러는 이 함수를 그대로 호출하면 된다(새 크레딧 로직을 따로 만들 필요 없음).
- `components/layout/account-panel.tsx`의 "보유 토큰" 블록 — 충전 `+` 버튼을 붙일 지점이 이미 명확히 존재.
- `lib/ai/cost.ts`의 `KRW_PER_WALLET_TOKEN`/`USD_TO_KRW` — 토큰 경제 전체가 참조하는 단일 환율 상수, D-01 가격 확정과 직결.

### Established Patterns
- `lib/*/actions.ts` Server Actions로 비즈니스 로직 분리, `createAdminClient()`로 RLS 우회해 wallet을 쓰는 패턴(`lib/ai/generate.ts`, Phase 4 선례) — 웹훅 핸들러도 동일 패턴을 따를 가능성이 높다.
- ownership-scoped 함수 + zod 검증 레이어 패턴(chapters/kb actions에서 반복) — 결제 관련 서버 로직도 이 컨벤션을 따를 것.

### Integration Points
- Toss 웹훅 수신용 API 라우트가 새로 필요하다 — 현재 저장소엔 REST API 라우트(`app/api/...`)가 전혀 없고 전부 Server Actions다. 이 phase가 첫 REST 엔드포인트가 될 가능성이 높다.
- `components/layout/account-panel.tsx` / `site-header.tsx` — 충전 버튼/모달 진입점.
- `apply_wallet_delta` RPC — 웹훅 핸들러가 호출할 크레딧 지점.

</code_context>

<specifics>
## Specific Ideas

- 충전 티어: 100토큰=1,000원 / 300토큰=2,850원 / 550토큰=5,000원 / 1,000토큰=9,000원 (자유 금액 없음).
- 결제 흐름: `AccountPanel`의 `+` 버튼 → 모달(티어 선택) → Toss 결제창(팝업/리다이렉트, `requestPayment`) → `successUrl` 복귀 → 모달 내 스피너+자동 폴링 → 웹훅 크레딧 확인되면 모달 자동 닫힘, 대기 중 언제든 직접 닫기 가능(타임아웃 없음).
- 취소 시: 모달이 닫히지 않고 티어 선택 화면으로 복귀 + "결제가 취소되었어요" 토스트.
- 웹훅 미도착/서명검증 실패: 서버 로깅/알림만, 사용자에게는 노출하지 않고 관리자가 수동 보상.

</specifics>

<deferred>
## Deferred Ideas

- 웹훅 실패 시 자동 재시도/보상 파이프라인 — 이번 phase 범위 밖, 서버 로깅 + 관리자 수동 처리(D-08)로 대체.
- 월정액 구독제(정기결제) 토큰 상품 — docs/5-4에 정의되어 있지만 REQUIREMENTS.md v1 범위 밖. 이번 논의에서 다루지 않음.
- 결제내역(구매내역) 페이지 — 이번 논의에서 다루지 않음. Claude's Discretion에 남김(planner 판단 또는 별도 phase 후보).

### Reviewed Todos (not folded)
None — no pending todos matched this phase.

</deferred>

---

*Phase: 05-real-payment-integration*
*Context gathered: 2026-09-02*
