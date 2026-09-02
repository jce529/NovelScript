# Phase 5: Real Payment Integration - Research

**Researched:** 2026-09-02
**Domain:** Toss Payments 연동 (결제창 SDK + 결제 승인 API + 웹훅), Next.js 16 Route Handler, Supabase wallet ledger
**Confidence:** HIGH (핵심 결제 흐름·웹훅·키 정책은 2026-09-02 공식 문서 라이브 조회로 검증)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**토큰 충전 상품 구성**
- **D-01:** 4단계 고정 충전 티어를 제공한다: 100토큰=1,000원 / 300토큰=2,850원 / 550토큰=5,000원 / 1,000토큰=9,000원. 기준선(1토큰=10원, `lib/ai/cost.ts`의 `KRW_PER_WALLET_TOKEN`)을 유지하되 대량 구매일수록 할인율이 커지는 구조(0% → 5% → 9.1% → 10%).
- **D-02:** 자유 금액 입력 옵션은 제공하지 않는다 — 위 4개 고정 패키지만 노출.

**충전 진입 및 결제중 UX**
- **D-03:** 충전 진입점은 `AccountPanel`(계정 팝오버)의 "보유 토큰" 표시 옆 `+` 버튼이며, 클릭 시 충전 모달을 연다. 별도 페이지가 아니라 기획서(docs/5-4)의 "토큰 충전소 모달" 패턴을 그대로 계승한다.
- **D-04:** Toss 결제는 결제창 팝업/리다이렉트 방식(`requestPayment`)을 쓴다 — 위젯 인라인 임베드가 아니다. 카드/카카오페이/네이버페이/토스페이는 Toss가 제공하는 하나의 결제수단 선택 화면으로 자동 통합된다(PROJECT.md 기존 결정과 일치).
- **D-05:** Toss 승인 후 `successUrl`로 복귀한 시점부터 웹훅이 크레딧을 완료할 때까지, 모달은 스피너를 보여주며 자동 폴링으로 잔액 갱신을 대기한다. 크레딧이 확인되면 모달이 자동으로 닫힌다.
- **D-06:** 폴링에는 타임아웃/안내 문구 전환이 없다 — 사용자는 언제든 직접 "닫기" 버튼으로 모달을 닫을 수 있으며, 그 외엔 무제한 대기한다.

**결제 실패·취소·미확정 처리**
- **D-07:** 사용자가 Toss 결제창에서 결제를 중도 취소하면(`failUrl` 리다이렉트), 모달은 닫히지 않고 티어 선택 화면으로 되돌아가며 상단에 "결제가 취소되었어요" 토스트를 띄운다.
- **D-08:** 결제는 Toss 측에서 승인되었지만 웹훅이 도착하지 않거나(장애) 서명 검증에 실패해 크레딧이 반영되지 않은 상황은 서버측 로깅/알림으로만 처리한다 — 관리자가 수동 확인 후 보상하는 방식이며, 사용자 화면에는 이 상태를 노출하지 않는다. 자동 재시도/보상 파이프라인은 이번 phase 범위 밖이다.

### Claude's Discretion
- Toss `orderId` 생성 규칙과 `ledger_entries.reference_type`/`reference_id` 매핑 방식 — 기존 `unique(wallet_id, reference_type, reference_id)` 제약을 활용한 멱등성 설계는 research/planning에서 확정.
- 폴링 간격과 폴링 대상(단순 wallet balance 재조회 vs 별도 주문 상태 API) — 구현 세부사항.
- Toss 결제 승인 API 서버측 검증 절차(시크릿 키로 승인 confirm 호출, 웹훅 서명 검증 방식) — Toss 공식 웹훅 문서와 대조해 리서치 단계에서 확정 필요.
- 결제내역(구매내역) 페이지 노출 여부 — 이번 논의에서 다루지 않았고 PAY-01/03에 명시되어 있지 않음. planner가 최소 범위로 판단하거나 별도 phase 후보로 남길 것.

### Deferred Ideas (OUT OF SCOPE)
- 웹훅 실패 시 자동 재시도/보상 파이프라인 — 이번 phase 범위 밖, 서버 로깅 + 관리자 수동 처리(D-08)로 대체.
- 월정액 구독제(정기결제) 토큰 상품 — docs/5-4에 정의되어 있지만 REQUIREMENTS.md v1 범위 밖.
- 결제내역(구매내역) 페이지 — Claude's Discretion에 남김.
- PAY-02(토큰으로 유료 회차 열람), 환전/cash-out — Phase 6 / v1 범위 밖.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **PAY-01** | User can purchase tokens through Toss Payments and see the charge reflected as a wallet balance | §Standard Stack (SDK 2.8.1 + 결제창 SDK 선택 근거), §Architecture Pattern 1~3 (주문 생성 → requestPayment → successUrl 승인), §Code Examples 1·2·3, §Environment Availability (테스트 키로 지금 실행 가능 확인) |
| **PAY-03** | Wallet balance is only credited by a verified Toss webhook event, never by a client-side redirect/return callback | §Architecture Pattern 4 (웹훅 = 트리거, 서버-투-서버 재조회 = 검증), §Pitfall 1 (`PAYMENT_STATUS_CHANGED`에는 서명 헤더가 없다 — 공식 확인), §Pattern 5 (`apply_wallet_delta` 멱등 매핑), §Code Examples 4·5 |
</phase_requirements>

## Project Constraints (from CLAUDE.md / AGENTS.md)

| Directive | Source | Impact on this phase |
|-----------|--------|----------------------|
| 사용자와의 모든 대화는 한국어 | CLAUDE.md | 계획/요약/UI 카피 전부 한국어 |
| **This is NOT the Next.js you know** — `node_modules/next/dist/docs/`의 가이드를 먼저 읽고 코드 작성 | AGENTS.md | 이 phase는 저장소 최초의 REST Route Handler를 만든다. 아래 §Next.js 16 Route Handler 사실 확인은 전부 `node_modules/next/dist/docs/` 로컬 문서에서 검증됨 (훈련 데이터 아님) |
| executor가 plan 실행을 끝낼 때마다 `roadmap update-plan-progress <phase>` 실행 후 ROADMAP.md 검증 | CLAUDE.md | 각 plan 완료 시 필수 |
| UI phase 완료 후 UI-SPEC.md만이 아니라 `design` 스킬 아트보드 목업 + Artifact 링크까지 제공해야 완료 | CLAUDE.md | 이 phase는 **UI hint: yes**. 충전 모달 목업 산출물이 완료 조건 |
| 실제 구현은 GSD executor 대신 Antigravity CLI(`agy`)에 TDD 방식으로 위임 | PROJECT.md | PLAN.md에 "테스트 먼저" 를 명시하고, 아래 §Validation Architecture의 커맨드가 그대로 실행 가능해야 함 |

**Note:** `.claude/skills/`, `.agents/skills/` 모두 존재하지 않음 — 프로젝트 스킬 제약 없음.

---

## Summary

Toss Payments의 실제 결제 흐름은 **요청(client SDK) → 인증(Toss 결제창) → 승인(서버 `/v1/payments/confirm`)** 3단계이고, 웹훅은 그 위에 얹히는 **상태 변경 알림**이다. 이 phase의 핵심 설계 질문은 "웹훅을 어떻게 위조 불가능하게 만들 것인가"인데, 라이브 문서 조회 결과 **`PAYMENT_STATUS_CHANGED` 웹훅에는 서명 헤더가 존재하지 않는다**. `tosspayments-webhook-signature` 헤더는 공식 문서에 명시적으로 "`payout.changed`, `seller.changed` 웹훅 헤더에만 포함되는" 값이라고 적혀 있다 (지급대행 전용). 즉 HMAC 검증 코드를 작성할 대상 자체가 없다 — 이것을 모르고 계획하면 존재하지 않는 헤더를 검증하는 코드를 만들게 된다.

따라서 PAY-03의 "verified webhook event"는 **웹훅 본문을 신뢰하지 않고, 본문에서 `orderId`만 꺼내 시크릿 키로 Toss에 서버-투-서버 재조회(`GET /v1/payments/orders/{orderId}`)한 뒤 그 응답만을 진실로 삼는 방식**으로 구현해야 한다. 공격자가 웹훅 URL에 아무 JSON이나 POST해도, 실제 크레딧 판단은 시크릿 키로 인증된 Toss 응답(`status === "DONE"`, `totalAmount`)과 우리 DB에 미리 저장해둔 주문 금액의 대조로만 이루어지므로 위조가 불가능하다. 이 설계는 부수적으로 **로컬에서 터널(ngrok) 없이도 크레딧 경로 전체를 자동 테스트할 수 있게** 만든다 — 합성 웹훅 본문을 우리 엔드포인트에 직접 POST해도, 실제 Toss 테스트 결제가 존재하는 한 동일하게 동작하기 때문이다.

실행 가능성(STATE.md Blocker) 결론: **Phase 5는 사업자등록/가맹점 심사 없이 지금 바로 끝까지 실행 가능하다.** Toss 개발자센터는 이메일+전화번호만으로 가입되고, 가입만 하면 "개발 연동 체험 상점" 테스트 키가 발급되며 공식 블로그가 명시적으로 "**웹훅을 설정하고 연결해볼 수 있어요**"라고 밝히고 있다. 단, 이 체험 상점이 주는 키는 **API 개별 연동 키(`test_ck_`/`test_sk_`)** 이고, 주문서형·결제창형(결제위젯, `gck`/`gsk`) 키는 "전자결제 신청 이후에만" 발급된다. 웹훅은 상점아이디(MID)별로 등록되므로, 문서용 공개 위젯 테스트 키(`test_gck_docs_…`)로는 웹훅을 받을 수 없다. 이 제약이 SDK 제품 선택을 사실상 결정한다.

**Primary recommendation:** `@tosspayments/tosspayments-sdk@2.8.1`의 **결제창(구버전) `tossPayments.payment().requestPayment({ method: 'CARD', ... })`** 을 개발 연동 체험 상점의 `test_ck_`/`test_sk_` 키로 연동하고, 서버는 ① `payment_orders` 행을 먼저 만들고 ② successUrl Route Handler에서 저장된 금액으로 `/v1/payments/confirm` 을 호출하되 **크레딧은 하지 않고**, ③ 웹훅 Route Handler에서 `orderId`로 Toss에 재조회해 `DONE`을 확인한 뒤에만 `apply_wallet_delta(wallet, +tokens, 'toss_topup', orderId, ...)` 로 크레딧한다.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@tosspayments/tosspayments-sdk` | **2.8.1** (npm 확인 2026-09-02, published 2026-08-21) | 브라우저 결제창 호출 (`loadTossPayments` → `payment()` → `requestPayment()`) | Toss v2 공식 통합 SDK. v1의 분리된 결제/브랜드페이/결제창 SDK가 v2에서 하나로 통합됨. 결제 요청은 반드시 SDK에서 시작해야 함(서버에서 결제창을 열 수 없음) |
| Toss Core API (`https://api.tosspayments.com`) | `/v1/payments/confirm`, `/v1/payments/orders/{orderId}` | 서버측 승인·조회 | REST 직접 호출. Node SDK 없음 — `fetch` + Basic auth로 충분 |
| Next.js Route Handler (`app/api/**/route.ts`) | next **16.3.2** (설치본) | successUrl 리다이렉트 수신 + 웹훅 수신 | 저장소 최초 REST 엔드포인트. `app/auth/callback/route.ts` 가 유일한 선례 |
| `zod` | ^4.4.3 (설치됨) | tierId/webhook payload 형태 검증 | 기존 Server Action 컨벤션과 동일 |
| Supabase `apply_wallet_delta` RPC | `0001_init.sql` | 멱등·동시성 안전 크레딧 | **재사용 필수.** 새 크레딧 로직 금지 |

**Installation:**
```bash
npm install @tosspayments/tosspayments-sdk
```

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `sonner` | ^2.0.8 (설치됨) | D-07 "결제가 취소되었어요" 토스트 | 이미 `app/layout.tsx`에 `<Toaster />` 마운트됨. `toast()` 호출만 하면 됨 |
| `components/ui/dialog.tsx` | 설치됨 (base-ui) | D-03 충전 모달 | 새 UI 라이브러리 추가 불필요 |
| ngrok / cloudflared / localtunnel | — | **실제** Toss 웹훅을 로컬로 배달받기 위한 터널 | 로컬 포트가 포함된 URL은 Toss 웹훅으로 등록 불가(공식 명시). 자동 테스트에는 불필요(§Pattern 4 참고) — 최종 수동 검증에만 필요 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| **결제창(구버전)** `payment().requestPayment()` (`test_ck_`/`test_sk_`) | **결제창형 결제** `widgets()` + `renderPaymentWindow()` + `requestPayment()` (`test_gck_`/`test_gsk_`) | Toss LLM Quick Reference는 신규 연동에 결제창(구버전)을 "**Do not pick it for a new integration**"이라고 명시. 그러나 결제창형 키는 **전자결제 신청 이후에만** 발급되고, 문서용 공개 키(`test_gck_docs_…`)는 Toss 소유 MID라 **웹훅을 등록할 수 없다** → PAY-03을 이 phase에서 검증 불가. 서버 코드(승인 API·웹훅·원장)는 두 제품이 **완전히 동일**하므로, 나중에 전자결제 계약 후 클라이언트 한 파일만 교체하면 된다. 이 트레이드오프를 의식적으로 선택하고 마이그레이션 노트를 남길 것 |
| 서버-투-서버 재조회 검증 | HMAC 서명 검증 | **불가능.** `PAYMENT_STATUS_CHANGED`에는 서명 헤더가 없음(공식 문서 명시) |
| 서버-투-서버 재조회 검증 | 인바운드 IP allowlist (10개 IP 공개됨) | 단독으로는 부족(스푸핑·프록시). **defense-in-depth로만** 추가 가능하며, Toss가 IP를 추가하면 조용히 깨지므로 유일한 게이트로 삼지 말 것 |
| 신규 `payment_orders` 테이블 | Toss `metadata` 필드에 userId/tier 넣기 | **금지.** `metadata`는 클라이언트 SDK가 넣는 값이라 조작 가능. 최대 5쌍/키 40자/값 2000자 제약도 있음 |
| 주문 상태 폴링 | wallet balance 폴링 | balance는 AI 사용(Phase 4 차감) 등 다른 이유로도 변한다 → "이 충전이 반영됐는지" 를 정확히 판별 못 함. **주문 상태 폴링을 권장** |

### 4개 티어의 서버측 진실 원천 (D-01/D-02)

`lib/payments/tiers.ts` — **`server-only` 임포트 금지, `node:fs` 계열 임포트 금지.** (Phase 4에서 클라이언트 컴포넌트가 `lib/kb/templates.ts`를 값으로 임포트해 `node:fs/promises`가 브라우저 번들에 끌려 들어가 Turbopack이 터진 선례가 있음 — STATE.md Plan 04-06.)

| id | tokens | priceKrw | 실단가 | 할인율 (기준 10원/토큰) |
|----|--------|----------|--------|------------------------|
| `t100` | 100 | 1,000 | 10.00원 | 0% |
| `t300` | 300 | 2,850 | 9.50원 | 5% |
| `t550` | 550 | 5,000 | 9.09원 | 9.1% |
| `t1000` | 1,000 | 9,000 | 9.00원 | 10% |

최저가 1,000원은 Toss 신용카드 최소 결제금액 100원(`BELOW_MINIMUM_AMOUNT`) 위에 있으므로 안전.

---

## Architecture Patterns

### Recommended Project Structure

```
lib/payments/
├── tiers.ts              # 4개 티어 상수 + zod tierId enum (순수 모듈, 클라 공유 가능)
├── toss.ts               # 'server-only'. confirmPayment() / getPaymentByOrderId() — fetch + Basic auth
├── orders.ts             # 'server-only'. createTopupOrder / findOrder / markConfirmed / markCredited / markFailed
└── actions.ts            # Server Actions: createTopupOrderAction, getTopupOrderStatusAction

app/api/payments/toss/
├── success/route.ts      # GET — successUrl 수신, 금액 대조, confirm 호출, 크레딧 안 함, 앱으로 리다이렉트
├── fail/route.ts         # GET — failUrl 수신, 주문 실패 마킹, ?topupFail= 로 리다이렉트 (D-07)
└── webhook/route.ts      # POST — 유일한 크레딧 지점 (PAY-03)

components/payments/
├── topup-dialog.tsx      # D-03 모달: 티어 선택 → 결제중 스피너 → 자동 닫힘
└── use-toss-payment.ts   # SDK 로드/호출 캡슐화 (제품 교체 시 이 파일만 바뀜)

supabase/migrations/
└── 0005_payments.sql     # payment_orders (+ 선택: payment_webhook_logs)
```

### Pattern 1 — 주문 레코드를 결제 **전에** 만든다 (금액 위변조 방어의 뿌리)

**What:** 사용자가 티어를 고르면, 서버가 `orderId`·`amount_krw`·`token_amount`·`user_id`를 담은 행을 먼저 `payment_orders`에 INSERT하고, 클라이언트에는 그 결과만 돌려준다. 클라이언트는 금액을 **제안하지 못하고**, 티어 id만 보낸다.

**Why:** Toss 공식 경고 — `requestPayment`는 클라이언트 JS에서 실행되므로 사용자가 콘솔에서 `amount`를 임의로 바꿀 수 있고, 그대로 인증이 완료된다. successUrl 쿼리스트링을 나중에 손대는 건 승인 API가 막아주지만, **인증 전 조작은 막아주지 않는다.** 서버에 원본 금액이 없으면 방어가 불가능하다.

**orderId 생성 규칙 (확정):**
```
'ns_' + crypto.randomUUID()      // 예: ns_3f8c1e2a-9d4b-4c17-8a6e-1b2c3d4e5f60  (39자)
```
공식 제약: **영문 대소문자·숫자·`-`·`_`, 6자 이상 64자 이하, 주문마다 고유.** 위 형식은 전부 충족한다.

**`payment_orders` 스키마 권장:**

| 컬럼 | 타입 | 비고 |
|------|------|------|
| `order_id` | `text primary key` | Toss `orderId` 그대로 |
| `user_id` | `uuid not null references profiles(id)` | wallet_id와 동일 값 (wallets.id = profiles.id) |
| `tier_id` | `text not null` | 감사용 |
| `amount_krw` | `integer not null check (amount_krw > 0)` | **승인·검증의 유일한 진실** |
| `token_amount` | `bigint not null check (token_amount > 0)` | 크레딧할 토큰 |
| `payment_key` | `text` | successUrl에서 받은 즉시 저장 (confirm 호출 **전에**) |
| `confirm_idempotency_key` | `uuid not null default gen_random_uuid()` | confirm 재시도 시 동일 키 재사용 (Toss 멱등키 15일 유효) |
| `return_path` | `text` | 사용자가 결제를 시작한 앱 내 경로. `/`로 시작하는 값만 허용 (open redirect 방어) |
| `authenticated_at` / `confirmed_at` / `credited_at` / `failed_at` | `timestamptz` | **단일 `status` 컬럼 대신 분리된 타임스탬프** |
| `fail_code` / `fail_message` | `text` | D-07/D-08 로깅 |

> **왜 `status` 단일 컬럼이 아니라 분리 타임스탬프인가:** successUrl 핸들러와 웹훅 핸들러가 **동시에** 같은 행을 쓸 수 있다(Toss는 confirm 응답을 우리가 받기 전에 웹훅을 보낼 수 있다). 하나의 `status` 텍스트를 양쪽이 덮어쓰면 lost update가 난다. 각 핸들러가 서로 다른 컬럼만 쓰면 충돌 자체가 없어진다. 폴링용 상태는 파생 계산한다.

RLS: `payment_orders_select_own`(`auth.uid() = user_id`)만 두고, 쓰기는 전부 `createAdminClient()` 경유 — Phase 4 `lib/ai/chat.ts` 선례와 동일 (0001_init.sql의 wallet 정책이 SELECT 전용이고 `apply_wallet_delta`가 SECURITY DEFINER가 아니기 때문).

### Pattern 2 — 클라이언트는 SDK 호출만 한다

`use-toss-payment.ts`가 `loadTossPayments(clientKey)` → `tossPayments.payment({ customerKey })` → `requestPayment({...})` 를 감싼다.

- `customerKey`: **2~300자, 영숫자 + `-_=.@` 중 특수문자 1개 이상 필수, 예측 가능한 값(이메일·전화·회원ID) 금지, UUID 권장.** Supabase `user.id`(UUID)를 그대로 쓰면 형식은 만족하지만 "예측 가능한 값 금지" 권고에 걸린다 → **`profiles`에 `toss_customer_key uuid default gen_random_uuid()` 를 두거나, 이번 phase에서 재사용 필요가 없으므로 `ANONYMOUS`(`import { ANONYMOUS } from '@tosspayments/tosspayments-sdk'`)를 쓰는 것을 권장.** 브랜드페이/빌링을 쓰지 않는 단건 결제에는 `ANONYMOUS`로 충분하다.
- `successUrl` / `failUrl`: **오리진 포함 절대 URL 필수.** `window.location.origin + '/api/payments/toss/success'` 로 만들면 localhost/ngrok/프로덕션 모두 자동 대응된다 → 새 환경변수 불필요.
- PC 기본값은 iframe 결제창, 모바일은 페이지 이동. **모바일에서 iframe 위 호출 금지**(네이버페이 등이 오작동).

### Pattern 3 — successUrl 핸들러는 승인만, 크레딧은 절대 안 함 (PAY-03의 절반)

```
GET /api/payments/toss/success?paymentKey=&orderId=&amount=
  1. order = SELECT ... WHERE order_id = orderId          (없으면 400)
  2. Number(amount) === order.amount_krw ?                 (아니면 즉시 중단 + 로깅, confirm 호출 금지)
  3. order.credited_at 이 이미 있으면 → 바로 리다이렉트 (뒤로가기/새로고침 대비)
  4. payment_key 저장 + authenticated_at = now()           ← confirm 호출 "전에" 저장 (웹훅 레이스 대비)
  5. POST /v1/payments/confirm
       Authorization: Basic base64(`${TOSS_SECRET_KEY}:`)
       Idempotency-Key: order.confirm_idempotency_key
       body: { paymentKey, orderId, amount: order.amount_krw }   ← 쿼리의 amount 아님!
  6. 성공 → confirmed_at = now()   / 실패 → failed_at + fail_code
  7. 302 redirect → `${order.return_path}?topup=${orderId}`  (return_path는 '/'로 시작하는 내부 경로만)
```

**크레딧은 여기서 하지 않는다.** 이것이 PAY-03의 문자 그대로의 요구다.

`Authorization` 헤더에서 가장 흔한 실수는 **시크릿 키 뒤 콜론 누락**이다. `base64(secretKey + ':')`. UTF-8 BOM이 섞이면 결과가 `77u/`로 시작한다.

### Pattern 4 — 웹훅: 본문은 **트리거**, 진실은 **재조회** (PAY-03의 나머지 절반)

```
POST /api/payments/toss/webhook
  1. raw = await request.text();  body = JSON.parse(raw)     ← 실패해도 200 반환(재전송 무의미)
  2. body.eventType !== 'PAYMENT_STATUS_CHANGED' → 200 무시
  3. orderId = body?.data?.orderId  (본문에서 꺼내는 유일한 값. status/amount는 신뢰하지 않는다)
  4. order = SELECT ... WHERE order_id = orderId → 없으면 200 + 로깅(무시)
  5. payment = GET /v1/payments/orders/{orderId}
        Authorization: Basic base64(secretKey:)
        signal: AbortSignal.timeout(5000)                     ← 10초 응답 예산 준수
  6. payment.status !== 'DONE'  → failed_at 기록 + 200 (EXPIRED/ABORTED/CANCELED)
  7. payment.totalAmount !== order.amount_krw → 크레딧 금지 + ERROR 로깅 + 200 (D-08 수동 대응 대상)
  8. rpc('apply_wallet_delta', { p_wallet_id: order.user_id, p_delta: order.token_amount,
        p_reference_type: 'toss_topup', p_reference_id: order.order_id,
        p_reason: `topup:${order.tier_id}` })
  9. credited_at = now();  200
```

**왜 이것이 "verified webhook"인가:** 5단계 응답은 우리 시크릿 키로 인증된 Toss 서버의 답이다. 공격자가 4단계까지 통과하는 본문을 위조하더라도(우리 orderId를 알아야 함), 5~7단계가 Toss의 실제 상태와 금액을 강제하므로 잔액이 잘못 늘어날 수 없다. 서명이 없는 이벤트에 대해 이것이 공식 문서가 지지하는 유일한 검증 수단이다(가상계좌 `DEPOSIT_CALLBACK`도 같은 사상으로 `secret` 값을 승인 API 응답과 대조하게 설계돼 있다).

**HTTP 응답 코드 정책 (권장):**
- **200**: 처리 완료 / 의도적 무시(알 수 없는 orderId, 비-DONE 상태, 이미 크레딧됨, 파싱 실패)
- **500**: 일시적 내부 실패만 (DB 다운, Toss 조회 네트워크 오류) → Toss가 1·4·16·64·256·1024·4096분 간격으로 최대 7회 재전송하고 7회 실패 시 이메일 알림을 보낸다. 이는 **우리가 만드는 파이프라인이 아니라 Toss가 제공하는 기본 동작**이므로 D-08("자동 재시도 파이프라인 범위 밖")을 위반하지 않으면서 공짜 복원력과 알림을 얻는다.

**10초 안에 200을 반환하지 못하면** Toss는 실패로 간주한다 — 무거운 작업 금지.

### Pattern 5 — 원장 멱등성 매핑 (확정)

기존 제약 `unique (wallet_id, reference_type, reference_id)` 에 다음을 매핑한다:

| 파라미터 | 값 | 근거 |
|----------|-----|------|
| `p_wallet_id` | `payment_orders.user_id` | `wallets.id` = `profiles.id` = `auth.users.id` (0001_init.sql) |
| `p_delta` | `+payment_orders.token_amount` | 서버 티어 테이블에서 파생, 클라이언트 입력 아님 |
| `p_reference_type` | **`'toss_topup'`** | 기존 `'ai_generation'`(`lib/ai/chat.ts:12`)과 같은 snake_case 리터럴 컨벤션. `lib/payments/tiers.ts`에 `export const TOPUP_REFERENCE_TYPE = 'toss_topup'` 로 상수화 |
| `p_reference_id` | **`payment_orders.order_id`** (= Toss `orderId`) | 우리가 결제 **전에** 생성하는 값이라 웹훅이 도착하기 전부터 알고 있고, 결제 상태가 변해도 유지된다(공식). `paymentKey`는 Toss가 나중에 발급하므로 2차 식별자로만 저장 |
| `p_reason` | `` `topup:${tier_id}` `` | 감사용 |

`apply_wallet_delta`는 `insert ... on conflict do nothing` 후 `if not found then return 현재잔액` 이므로 **동일 orderId로 몇 번 호출해도 잔액이 한 번만 늘고 ledger 행도 1개만 생긴다.** 이 성질은 `tests/wallet/ledger.concurrency.test.ts` "is idempotent for the same reference key"에서 이미 증명되어 있다 → 웹훅 중복 배달(최대 7회 재전송) 방어가 공짜로 확보된다. **새 dedupe 테이블을 만들 필요 없다.**

### Pattern 6 — 모달 상태를 Popover 밖으로 끌어올린다 (D-03 구현 함정)

`AccountPanel`은 base-ui `Popover`를 쓰는 클라이언트 컴포넌트다. `+` 버튼이 여는 Dialog를 **PopoverContent 안에서 렌더링하면**, 결제창을 여는 순간 popover가 outside-interaction으로 닫히면서 Dialog까지 언마운트된다. 모달 `open` 상태를 `<Popover>`의 형제 위치로 올리고, `PopoverContent` 안의 `+` 버튼은 `setOpen(true)`만 호출하게 한다.

또한 base-ui는 Radix의 `asChild`가 없고 **render prop**을 쓴다(STATE.md Plan 02-05).

### Pattern 7 — successUrl 복귀 후 모달 재오픈 (D-05)

successUrl 핸들러가 `?topup=<orderId>` 를 붙여 리다이렉트하므로, 클라이언트에서 `useSearchParams()`로 읽어 모달을 "결제중" 상태로 자동 오픈한다. Next 16 공식 문서: 프리렌더되는 경로에서 `useSearchParams`를 쓰면 가장 가까운 Suspense 경계까지 클라이언트 렌더로 떨어지므로 **`<Suspense>`로 감쌀 것을 권장**한다. 헤더는 모든 페이지에 뜨므로 반드시 감쌀 것.

폴링: `getTopupOrderStatusAction(orderId)` Server Action을 **2초 간격**으로 호출해 `credited | pending | failed`를 받는다. `credited`면 `router.refresh()`(서버 컴포넌트 `SiteHeader`의 balance 갱신) 후 모달 자동 닫기. **타임아웃 없음(D-06)**, 사용자는 언제든 닫기 가능. 언마운트 시 인터벌 정리 필수.

### Anti-Patterns to Avoid

- **`tosspayments-webhook-signature` 헤더 검증 코드 작성** — `PAYMENT_STATUS_CHANGED`에는 오지 않는다. 항상 부재 → 항상 실패하거나, "없으면 통과" 로 짜서 검증이 무의미해진다.
- **웹훅 본문의 `data.status` / `data.totalAmount`를 믿고 크레딧** — 서명이 없으므로 그대로 위조 가능. `orderId`만 꺼내 쓸 것.
- **successUrl 쿼리의 `amount`를 confirm 요청 본문에 그대로 전달** — 서버 저장 금액을 쓸 것 (Toss Critical 2.2).
- **successUrl 핸들러에서 크레딧** — PAY-03 정면 위반.
- **`export const runtime = 'edge'`** — Next 16에서 Edge Runtime은 **deprecated**. 로컬 문서 `route-segment-config/runtime.md`: "The Edge Runtime is deprecated. Remove the `runtime` export from your route files." 기본값 `'nodejs'`를 그대로 쓸 것.
- **Toss `metadata`에 userId/tokenAmount를 담아 그것으로 크레딧** — 클라이언트가 넣는 값이라 조작 가능.
- **결제 성공 후 새 orderId로 재승인 시도** — `DUPLICATED_ORDER_ID`. orderId는 주문 1건당 1개.
- **`payment_orders` 없이 wallet balance 델타만으로 완료 판정** — Phase 4의 AI 차감과 뒤섞여 오판.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 중복 웹훅으로 인한 이중 크레딧 | 자체 dedupe 테이블 / `transmission-id` 캐시 | 기존 `apply_wallet_delta` + `unique(wallet_id, reference_type, reference_id)` | 이미 존재하고, 이미 테스트되어 있고(`ledger.concurrency.test.ts`), `FOR UPDATE` 락으로 동시성까지 안전 |
| 승인 API 중복 호출 | 자체 in-flight 락 | Toss `Idempotency-Key` 헤더 (UUID, 최대 300자, 15일 유효) | Toss 서버가 (멱등키 + API키 + URL + 메서드) 조합으로 보장. 처리 중 재요청은 `409 IDEMPOTENT_REQUEST_PROCESSING` |
| 결제 재시도/실패 알림 | 크론·큐 기반 재전송 파이프라인 (D-08에서 명시적으로 범위 밖) | Toss 기본 재전송(최대 7회, ~3일 19시간) + 7회 실패 시 이메일 | 비-200 응답만 반환하면 자동. 구축 비용 0 |
| 카드/카카오페이/네이버페이/토스페이 각각 연동 | 결제수단별 분기 UI | `requestPayment({ method: 'CARD' })` 하나 (Toss 통합 결제창이 간편결제까지 한 화면에 노출) | PROJECT.md 결정과 일치 |
| 결제 금액 위변조 방어 | 클라이언트 서명/난독화 | 서버 `payment_orders.amount_krw` 대조 | Toss 공식 필수 절차 |
| 토스트/모달 | 자체 컴포넌트 | 설치된 `sonner`, `components/ui/dialog.tsx` | 이미 레이아웃에 마운트됨 |

**Key insight:** 이 도메인에서 "직접 만든 안전장치"는 대부분 이미 Postgres 제약이나 Toss 서버가 더 강하게 보장해 준다. Phase 1이 `apply_wallet_delta`를 만들어 둔 이유가 정확히 이 순간이다 — 웹훅 핸들러는 **호출만** 하면 된다.

---

## Common Pitfalls

### Pitfall 1: `PAYMENT_STATUS_CHANGED`에 서명 헤더가 있다고 가정
**What goes wrong:** HMAC-SHA256 검증 유틸을 만들고 `tosspayments-webhook-signature`를 읽는데 항상 `null`. "없으면 통과"로 우회하면 검증이 사실상 사라진다.
**Why it happens:** 웹훅 헤더 표에 해당 헤더가 버젓이 있고, 검색 결과·블로그·훈련 데이터가 전부 이 헤더를 일반 결제 웹훅 검증법으로 소개한다.
**How to avoid:** 공식 문구를 그대로 인용해 두라 — "`payout.changed`, `seller.changed` 웹훅 헤더에**만** 포함되는 웹훅 서명입니다." 그리고 HMAC의 키인 "보안 키"는 지급대행(payouts) 전용 키다(시크릿 키가 아니다).
**Warning signs:** 헤더 조회 결과가 항상 null / 테스트를 위해 서명을 직접 만들어 넣고 있음.

### Pitfall 2: successUrl 쿼리의 `amount`를 그대로 승인에 사용
**What goes wrong:** 사용자가 결제창을 열기 **전에** 콘솔에서 `amount`를 100원으로 바꾸면, 100원 결제가 인증되고 successUrl에도 100이 온다. 서버가 그 100을 그대로 confirm에 넣으면 **100원 결제가 정상 승인**되고, 우리는 1,000토큰을 준다.
**Why it happens:** 쿼리 파라미터가 "Toss가 준 값"처럼 보인다. (쿼리를 나중에 고치는 건 승인 API가 막지만, 인증 전 조작은 못 막는다.)
**How to avoid:** ① 쿼리 `amount` ≠ DB `amount_krw` 면 confirm을 **호출조차 하지 않는다**. ② confirm 본문에는 언제나 DB 값을 넣는다. ③ 웹훅 크레딧 시에도 Toss 재조회의 `totalAmount`와 DB 값을 다시 대조한다.
**Warning signs:** `Number(searchParams.get('amount'))` 가 confirm 본문으로 흘러가는 코드.

### Pitfall 3: 웹훅 URL을 localhost로 등록하려 함
**What goes wrong:** Toss 개발자센터가 등록을 거부한다 — "로컬 서버 포트가 포함된 URL은 웹훅으로 등록할 수 없습니다."
**How to avoid:** ngrok(공식 권장) 또는 cloudflared/localtunnel로 공개 URL을 만들고 `<tunnel>/api/payments/toss/webhook` 을 등록. **단, 자동 테스트에는 터널이 필요 없다** — 우리 핸들러는 본문을 신뢰하지 않고 재조회하므로, 합성 본문을 로컬 엔드포인트에 직접 POST해도 실제 Toss 테스트 결제만 존재하면 동일하게 동작한다.
**Warning signs:** 계획서에 "ngrok 설치"가 크레딧 로직 테스트의 **선행 조건**으로 들어가 있다면 설계가 잘못된 것이다.

### Pitfall 4: 웹훅과 successUrl 핸들러의 동시 쓰기(lost update)
**What goes wrong:** 우리가 confirm 응답을 받기 전에 Toss가 이미 `DONE` 웹훅을 보낼 수 있다. 두 핸들러가 같은 `status` 컬럼을 쓰면 `credited` 가 `confirmed` 로 덮이고, 폴링이 영원히 끝나지 않는다.
**How to avoid:** 컬럼 분리(`confirmed_at` vs `credited_at`), successUrl에서 `payment_key`를 confirm **전에** 저장, 그리고 웹훅 크레딧 판단은 `paymentKey`가 아니라 `orderId`만 필요하게 설계.
**Warning signs:** 단일 `status text` 컬럼을 양쪽 라우트가 UPDATE.

### Pitfall 5: 결제창을 닫으면 웹훅이 온다고 가정
**What goes wrong:** 사용자가 결제창을 그냥 닫으면 결제 상태가 변하지 않아 **웹훅이 전송되지 않는다**(공식). 웹훅으로 취소를 감지하려는 로직은 절대 발화하지 않는다.
**How to avoid:** 취소는 오직 `failUrl`(`code=PAY_PROCESS_CANCELED`)로만 감지한다 — 이것이 D-07의 유일한 트리거다. 또한 **`PAY_PROCESS_CANCELED`일 때 `failUrl`에 `orderId`가 전달되지 않을 수 있다**(공식 트러블슈팅 명시) → 실패 리다이렉트에서 orderId 없이도 동작하도록 짜고, 주문을 "실패"로 마킹하려면 `orderId`가 있을 때만 하라. 인증 후 10분 내 confirm이 없으면 `EXPIRED` 웹훅이 오므로 유령 주문은 그쪽에서 정리된다.

### Pitfall 6: `proxy.ts`가 웹훅 요청까지 가로챈다
**What goes wrong:** 저장소 루트 `proxy.ts`의 matcher가 `/api/...` 를 포함하며 모든 요청에 `supabase.auth.getClaims()` 를 돌린다. 쿠키 없는 웹훅에서 차단되지는 않지만, 불필요한 왕복이 10초 예산을 갉아먹고 장애 지점이 하나 늘어난다.
**How to avoid:** matcher 부정 선행에 `api/payments/toss/webhook` 를 추가해 제외한다. (Next 16에서 `middleware`는 deprecated·`proxy`로 개명됐으므로 새 `middleware.ts`를 만들지 말 것 — 로컬 문서 `file-conventions/proxy.md`.)

### Pitfall 7: `test_gck_docs_` 문서용 키로 웹훅을 기대
**What goes wrong:** 결제는 되는데 웹훅이 영원히 오지 않는다.
**Why:** 웹훅은 **상점아이디(MID)별로 설정되고 각 MID에 따로 전송**된다. 문서용 공개 키는 Toss 소유 MID다. 우리 개발자센터 계정에 등록한 웹훅은 **우리 MID로 일어난 결제**에만 발화한다.
**How to avoid:** 개발자센터에 가입해 본인 "개발 연동 체험 상점"의 `test_ck_`/`test_sk_` 를 쓸 것.

### Pitfall 8: 클라이언트 번들에 서버 전용 모듈이 끌려 들어감
**What goes wrong:** Phase 4 Plan 04-06에서 클라이언트 컴포넌트가 `lib/kb/templates.ts`의 값을 임포트해 `node:fs/promises`가 브라우저 번들로 들어가 Turbopack이 매 로드마다 panic했다.
**How to avoid:** `lib/payments/tiers.ts`는 **순수 상수/타입만**. `toss.ts`·`orders.ts`에는 `import 'server-only'` 를 붙인다(vitest는 `server-only`를 스텁으로 alias하므로 단위 테스트에는 영향 없음).

### Pitfall 9: 테스트 환경 특이사항
- **카카오페이는 테스트 불가** — 전자결제 계약 후 발급되는 상점 테스트 키로만 가능(문서용 키·체험 상점 키 모두 불가). PROJECT.md의 "카카오페이 커버"는 이 phase에서 **검증할 수 없다** — 계약 후 재검증 항목으로 남길 것.
- 페이코도 테스트 키 불가. 네이버페이는 카드 결제 위주로만 테스트.
- 테스트 환경 API는 **분당 100건** 제한.
- 국내용 테스트 카드번호는 없음 — 본인 실제 카드를 넣어도 실제 출금되지 않는다.
- `failUrl` 재현이 가장 쉬운 방법: **모바일 환경에서 결제 요청 후 결제창 닫기**.
- 에러 재현: `TossPayments-Test-Code: {ERROR_CODE}` 헤더 (테스트 시크릿 키에서만 동작).

---

## Code Examples

### 1. 티어 테이블 (순수 모듈, 클라이언트 공유 가능)
```ts
// lib/payments/tiers.ts  — server-only 금지, fs 임포트 금지
import { z } from 'zod';

export const TOPUP_REFERENCE_TYPE = 'toss_topup';

export const TOPUP_TIERS = [
  { id: 't100',  tokens: 100,   priceKrw: 1000, label: '100 토큰' },
  { id: 't300',  tokens: 300,   priceKrw: 2850, label: '300 토큰' },
  { id: 't550',  tokens: 550,   priceKrw: 5000, label: '550 토큰' },
  { id: 't1000', tokens: 1000,  priceKrw: 9000, label: '1,000 토큰' },
] as const;

export type TopupTierId = (typeof TOPUP_TIERS)[number]['id'];
export const topupTierIdSchema = z.enum(['t100', 't300', 't550', 't1000']);

export function getTier(id: TopupTierId) {
  const tier = TOPUP_TIERS.find((t) => t.id === id);
  if (!tier) throw new Error(`unknown tier: ${id}`);
  return tier;
}

/** 공식 제약: 영문 대소문자·숫자·'-'·'_', 6~64자 */
export function generateOrderId(): string {
  return `ns_${crypto.randomUUID()}`;
}
export const TOSS_ORDER_ID_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;
```

### 2. Toss 서버 클라이언트
```ts
// lib/payments/toss.ts
// Source: https://docs.tosspayments.com/reference (결제 승인 / orderId로 결제 조회)
//         https://docs.tosspayments.com/reference/using-api/authorization
import 'server-only';

const BASE = 'https://api.tosspayments.com';

function authHeader() {
  // 콜론을 빠뜨리면 안 된다. BOM이 섞이면 결과가 '77u/'로 시작한다.
  const encoded = Buffer.from(`${process.env.TOSS_SECRET_KEY}:`, 'utf8').toString('base64');
  return `Basic ${encoded}`;
}

export async function confirmPayment(args: {
  paymentKey: string; orderId: string; amount: number; idempotencyKey: string;
}) {
  const res = await fetch(`${BASE}/v1/payments/confirm`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
      'Idempotency-Key': args.idempotencyKey,
    },
    body: JSON.stringify({
      paymentKey: args.paymentKey,
      orderId: args.orderId,
      amount: args.amount, // 반드시 서버 저장 금액
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = await res.json();
  return res.ok
    ? ({ ok: true as const, payment: json })
    : ({ ok: false as const, code: json?.code, message: json?.message });
}

/** 웹훅 검증의 진실 원천. 시크릿 키로 인증된 Toss 응답만 신뢰한다. */
export async function getPaymentByOrderId(orderId: string) {
  const res = await fetch(`${BASE}/v1/payments/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: authHeader() },
    signal: AbortSignal.timeout(5_000), // 웹훅 10초 예산
    cache: 'no-store',
  });
  const json = await res.json();
  return res.ok
    ? ({ ok: true as const, payment: json })
    : ({ ok: false as const, code: json?.code, message: json?.message });
}
```

### 3. 클라이언트 결제 호출 (D-04)
```tsx
// components/payments/use-toss-payment.ts
// Source: https://docs.tosspayments.com/sdk/v2/js/payment
//         https://docs.tosspayments.com/guides/v2/payment-window/integration
'use client';
import { loadTossPayments, ANONYMOUS } from '@tosspayments/tosspayments-sdk';

export async function openTossPaymentWindow(order: {
  orderId: string; amountKrw: number; orderName: string;
}) {
  const tossPayments = await loadTossPayments(process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY!);
  const payment = tossPayments.payment({ customerKey: ANONYMOUS });

  // Redirect 방식: 결과는 successUrl / failUrl 로만 확인한다.
  await payment.requestPayment({
    method: 'CARD',                                    // 통합 결제창 = 카드 + 간편결제 한 화면
    amount: { currency: 'KRW', value: order.amountKrw }, // v2 SDK는 객체 (v1/서버 API는 정수)
    orderId: order.orderId,
    orderName: order.orderName,
    successUrl: `${window.location.origin}/api/payments/toss/success`,
    failUrl: `${window.location.origin}/api/payments/toss/fail`,
    card: { flowMode: 'DEFAULT', useEscrow: false, useCardPoint: false, useAppCardOnly: false },
  });
}
```

### 4. 웹훅 Route Handler — 유일한 크레딧 지점 (PAY-03)
```ts
// app/api/payments/toss/webhook/route.ts
// Next 16: runtime 'nodejs'가 기본이며 edge는 deprecated → runtime export 하지 않는다.
// Source(local): node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md (§Webhooks)
import { createAdminClient } from '@/lib/supabase/admin';
import { getPaymentByOrderId } from '@/lib/payments/toss';
import { TOPUP_REFERENCE_TYPE } from '@/lib/payments/tiers';

export async function POST(request: Request) {
  // Pages Router와 달리 bodyParser 설정이 필요 없다. raw body는 request.text()로 그대로 얻는다.
  const raw = await request.text();

  let orderId: string | undefined;
  try {
    orderId = JSON.parse(raw)?.data?.orderId; // 본문에서 신뢰하는 값은 이것 하나뿐
  } catch {
    return new Response('ok', { status: 200 }); // 재전송해도 소용없음
  }
  if (!orderId) return new Response('ok', { status: 200 });

  const admin = createAdminClient();
  const { data: order } = await admin
    .from('payment_orders').select('*').eq('order_id', orderId).maybeSingle();
  if (!order) return new Response('ok', { status: 200 });   // 우리 주문이 아님
  if (order.credited_at) return new Response('ok', { status: 200 });

  // ── 검증: 웹훅 본문이 아니라 시크릿 키로 인증된 Toss 응답을 진실로 삼는다 ──
  const result = await getPaymentByOrderId(orderId);
  if (!result.ok) return new Response('retry', { status: 500 }); // Toss가 재전송

  const payment = result.payment;
  if (payment.status !== 'DONE') {
    await admin.from('payment_orders')
      .update({ failed_at: new Date().toISOString(), fail_code: payment.status })
      .eq('order_id', orderId);
    return new Response('ok', { status: 200 });
  }
  if (Number(payment.totalAmount) !== Number(order.amount_krw)) {
    console.error('[toss-webhook] AMOUNT_MISMATCH', {
      orderId, expected: order.amount_krw, actual: payment.totalAmount,
    }); // D-08: 로깅만, 관리자 수동 확인
    return new Response('ok', { status: 200 });
  }

  const { error } = await admin.rpc('apply_wallet_delta', {
    p_wallet_id: order.user_id,
    p_delta: order.token_amount,
    p_reference_type: TOPUP_REFERENCE_TYPE,
    p_reference_id: order.order_id,          // 중복 배달 시 on conflict do nothing
    p_reason: `topup:${order.tier_id}`,
  });
  if (error) return new Response('retry', { status: 500 });

  await admin.from('payment_orders')
    .update({ credited_at: new Date().toISOString() }).eq('order_id', orderId);
  return new Response('ok', { status: 200 });
}
```

### 5. 로컬에서 터널 없이 웹훅 경로를 검증하는 방법
```bash
# 1) Toss 샌드박스 또는 우리 앱에서 테스트 결제를 끝까지 진행해 실제 orderId를 만든다.
# 2) Toss가 보내는 것과 동일한 형태의 본문을 우리 엔드포인트에 직접 POST한다.
curl -X POST http://localhost:3000/api/payments/toss/webhook \
  -H 'Content-Type: application/json' \
  -d '{"eventType":"PAYMENT_STATUS_CHANGED","createdAt":"2026-09-02T00:00:00.000000","data":{"orderId":"ns_<REAL_ORDER_ID>","status":"DONE"}}'
# → 핸들러가 시크릿 키로 재조회하므로, 본문의 status를 조작해도 결과가 바뀌지 않아야 한다.

# 3) 위조 방어 증명: 존재하지 않는/타인의 orderId, 부풀린 amount를 넣어도 잔액이 변하지 않아야 한다.
```

### 6. `Basic` 인증 헤더 인코딩 검증 (Toss Critical 2.3)
```bash
echo -n 'test_sk_yourSecretKey:' | base64
# → 콜론 누락이 가장 흔한 실수. 결과가 77u/ 로 시작하면 BOM 문제.
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SDK v1: 결제/브랜드페이/결제창 SDK가 분리 | **v2 통합 SDK** `@tosspayments/tosspayments-sdk` (`js.tosspayments.com/v2/standard`) | v2 | v1/v2 혼용 금지 — v1 SDK URL에 v2 메서드 호출이 흔한 실수 |
| `amount: 50000` (정수) | v2 SDK는 **`amount: { value, currency: 'KRW' }` 객체** (서버 API는 여전히 정수) | v2 | 타입 혼동 주의 |
| "결제위젯" | **주문서형 결제 / 결제창형 결제**로 개명 | **2026년** | 훈련 데이터·블로그의 "결제위젯", "통합결제창" 명칭은 전부 구명칭 |
| "통합결제창" | **결제창(구버전)** — 신규 연동 비권장 | 2026년 | 우리는 웹훅 테스트 가능성 때문에 의도적으로 이것을 선택 (§Alternatives) |
| Next.js `middleware.ts` | **`proxy.ts`** | Next 16 | 저장소는 이미 `proxy.ts` 사용 중. 새 `middleware.ts` 만들지 말 것 |
| Route Handler `runtime = 'edge'` | **`'nodejs'` 기본, edge deprecated** | Next 16 | `runtime` export 자체를 하지 말 것 |
| Pages Router `api.bodyParser: false` (raw body용) | App Router는 **`await request.text()`** 로 바로 raw body | App Router | 별도 설정 불필요 (로컬 문서 명시) |

**Deprecated/outdated:**
- 훈련 데이터에 흔한 "Toss 웹훅은 `x-toss-signature` 헤더로 HMAC 검증" — **틀렸다.** 그런 헤더는 공식 문서에 없다.
- "`tosspayments-webhook-signature`로 결제 웹훅을 검증" — 헤더는 존재하지만 `payout.changed`/`seller.changed` 전용.

---

## Open Questions

1. **전자결제 신청(가맹점 심사) 시작 여부 — 이 phase를 막지는 않지만 런칭을 막는다**
   - 알고 있는 것: 이메일+전화번호 가입만으로 테스트 키·웹훅·테스트 결제내역 전부 사용 가능 → Phase 5 전체를 지금 실행·검증할 수 있다.
   - 불확실한 것: 라이브 키(`live_*`)는 전자결제 계약 완료 후에만 발급되며 STATE.md는 심사 2주+ 를 경고한다. 카카오페이 테스트도 계약 후에만 가능.
   - 권장: **Phase 5 실행과 병렬로 전자결제 신청을 접수**하고, "라이브 키 교체 + 카카오페이 검증"은 Phase 5 안이 아니라 별도의 배포 체크리스트 항목으로 뺄 것. Phase 5의 완료 기준은 테스트 키 기준 end-to-end로 정의한다.

2. **결제창(구버전) 채택의 기술부채를 언제 갚나**
   - 알고 있는 것: Toss는 신규 연동에 결제창(구버전)을 권장하지 않는다. 서버 코드는 두 제품이 동일하다.
   - 불확실한 것: 결제창형으로의 전환을 v1 런칭 전에 할지, 이후로 미룰지.
   - 권장: `use-toss-payment.ts` 한 파일에 SDK 호출을 격리하고, PLAN.md에 "전자결제 계약 완료 후 `widgets()+renderPaymentWindow()`로 교체 — 서버 무변경" 를 명시적 후속 todo로 남길 것.

3. **선불전자지급수단 규제 분류 (STATE.md Blocker)**
   - 알고 있는 것: 현금 환전 없음 + 단일 가맹점 구조 → 면제 요건에 부합해 보인다.
   - 불확실한 것: PG 컴플라이언스/법률 확인 미완.
   - 권장: 이번 phase의 코드 결정에는 영향 없음. 그대로 STATE.md Blocker에 유지.

4. **결제내역(구매내역) 페이지** — CONTEXT.md에서 planner 재량으로 남겨짐.
   - 권장: **이번 phase 범위에서 제외.** PAY-01/03의 문자적 요구가 아니고, `payment_orders` + `ledger_entries`가 이미 데이터를 남기므로 나중에 읽기 전용 화면만 붙이면 된다. 단 D-08의 관리자 수동 보상을 위해 `payment_orders`에 `select own` RLS와 서버 로그는 반드시 갖출 것.

5. **`customerKey`를 `ANONYMOUS`로 갈지 영구 키를 발급할지**
   - 알고 있는 것: 단건 결제에는 `ANONYMOUS`로 충분. 재사용 결제수단(브랜드페이/빌링)은 v1 범위 밖.
   - 권장: `ANONYMOUS`. 예측 가능한 값 금지 규칙 위반 위험도 없앤다.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | 전체 | ✓ | v22.14.0 | — |
| npm | SDK 설치 | ✓ | 10.9.2 | — |
| curl | 합성 웹훅 POST / Toss API 수동 검증 | ✓ | 8.12.1 | `node --eval fetch(...)` |
| `@tosspayments/tosspayments-sdk` | 클라이언트 결제창 | ✗ (미설치) | 2.8.1 (npm 최신) | 없음 — `npm install` 필수 |
| `NEXT_PUBLIC_TOSS_CLIENT_KEY` (`test_ck_…`) | SDK 초기화 | ✗ (`.env.local`에 TOSS 항목 0개) | — | 문서용 공개 키는 **웹훅 불가**라 부적합. 개발자센터 가입(이메일+전화, 사업자번호 불필요) 필요 |
| `TOSS_SECRET_KEY` (`test_sk_…`) | 승인/조회 API | ✗ | — | 없음 — 클라이언트 키와 **세트**여야 함 (섞으면 `INVALID_API_KEY`) |
| Toss 개발자센터 계정 + 웹훅 등록 | PAY-03 최종 수동 검증 | ✗ (상태 미확인) | — | 없음. 단, 크레딧 로직 자동 테스트는 §Code Example 5로 터널 없이 가능 |
| ngrok / cloudflared / localtunnel | Toss → localhost **실배달** 확인 | ✗ (셋 다 없음) | — | `npx localtunnel --port 3000`, `npx cloudflared tunnel --url http://localhost:3000`, 또는 Vercel preview 배포 |
| Supabase (`SUPABASE_DB_URL`, 서비스 롤 키) | 마이그레이션·통합 테스트 | ✓ (`.env.local`에 설정됨) | — | — |
| Supabase CLI | 마이그레이션 적용 | ✗ | — | 기존 phase들과 동일하게 `postgres`(설치됨) 또는 Supabase SQL 에디터로 적용 |

**Missing dependencies with no fallback (실행 전 반드시 해결):**
- `@tosspayments/tosspayments-sdk` 설치
- `NEXT_PUBLIC_TOSS_CLIENT_KEY` / `TOSS_SECRET_KEY` (개발 연동 체험 상점의 **API 개별 연동 테스트 키 세트**) 확보 후 `.env.local` + `.env.example`에 추가
- Toss 개발자센터에서 웹훅 이벤트 `PAYMENT_STATUS_CHANGED` 등록 (최종 수동 검증용)

**Missing dependencies with fallback:**
- 터널 도구 — 자동 테스트에는 불필요. 최종 실배달 확인 시 `npx localtunnel` 또는 Vercel preview로 대체 가능.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.11 (`environment: 'node'`, `include: ['tests/**/*.test.ts']`) |
| Config file | `vitest.config.ts` (루트). `server-only` → `tests/helpers/server-only-stub.ts` 로 alias, `.env.local` 자동 로드 |
| Quick run command | `npx vitest run tests/payments` |
| Full suite command | `npm test` (= `vitest run`) |
| DB helpers | `tests/helpers/db.ts` — `pgPool()`, `adminClient()`, `createTestUser()`, `deleteTestUser()`, `anonClient()` |

> 이 저장소의 테스트는 **실제 Supabase 인스턴스**에 붙는 통합 테스트가 다수다(`SUPABASE_DB_URL` 필요). Toss 호출은 전부 `fetch` 모킹으로 대체해 **네트워크 없이** 돌 수 있게 설계할 것.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PAY-01 | 4개 티어가 D-01 가격·토큰과 정확히 일치하고, `generateOrderId()`가 Toss 제약(6~64자, `[A-Za-z0-9_-]`)을 만족 | unit | `npx vitest run tests/payments/tiers.test.ts` | ❌ Wave 0 |
| PAY-01 | `createTopupOrder(tierId)`가 서버 티어 테이블에서 금액/토큰을 파생해 `payment_orders` 행을 만들고, 클라이언트 금액 입력을 받지 않음 | integration (DB) | `npx vitest run tests/payments/order-create.test.ts` | ❌ Wave 0 |
| PAY-01 | `confirmPayment()`가 `Basic base64(sk:)`(콜론 포함)·`Idempotency-Key`·**저장 금액**을 보냄 | unit (fetch mock) | `npx vitest run tests/payments/toss-client.test.ts` | ❌ Wave 0 |
| PAY-01 | successUrl 쿼리 `amount`가 저장 금액과 다르면 confirm을 **호출하지 않고** 실패 처리 | unit (fetch mock) | `npx vitest run tests/payments/amount-tamper.test.ts` | ❌ Wave 0 |
| PAY-01 | 크레딧 후 `getTopupOrderStatus`가 `credited`를 반환 (D-05 폴링 계약) | integration (DB) | `npx vitest run tests/payments/order-status.test.ts` | ❌ Wave 0 |
| **PAY-03** | successUrl 승인 경로가 **잔액을 변경하지 않는다** (confirm 성공 후에도 balance 불변) | integration (DB) | `npx vitest run tests/payments/no-credit-on-redirect.test.ts` | ❌ Wave 0 |
| **PAY-03** | 웹훅 처리 시 Toss 재조회가 `DONE` + 금액 일치일 때만 `apply_wallet_delta`가 호출되어 잔액이 정확히 `token_amount`만큼 증가 | integration (DB + fetch mock) | `npx vitest run tests/payments/webhook-credit.test.ts` | ❌ Wave 0 |
| **PAY-03** | 동일 웹훅 3회 배달 → ledger 행 1개, 잔액 1회만 증가 (멱등성) | integration (DB) | `npx vitest run tests/payments/webhook-idempotency.test.ts` | ❌ Wave 0 |
| **PAY-03** | 위조 본문(`status:"DONE"`, `totalAmount` 부풀림)이라도 재조회 결과가 우선해 크레딧되지 않음 | integration (DB + fetch mock) | `npx vitest run tests/payments/webhook-forged-body.test.ts` | ❌ Wave 0 |
| **PAY-03** | 미지의 `orderId` / 비-DONE 상태 → 크레딧 없음 + 200 응답 | unit | `npx vitest run tests/payments/webhook-guards.test.ts` | ❌ Wave 0 |
| D-07 | failUrl `PAY_PROCESS_CANCELED` 처리 시 `orderId`가 **없어도** 크래시하지 않음 | unit | `npx vitest run tests/payments/fail-redirect.test.ts` | ❌ Wave 0 |
| D-03/D-05/D-06/D-07 | 모달 상태 전이(티어 선택 → 결제중 → 자동 닫힘 / 취소 → 티어 선택 + 토스트) | **manual-only** | — (UI 상호작용, 이 저장소에 컴포넌트 테스트 인프라 없음) | n/a |
| PAY-01/PAY-03 end-to-end | 실제 Toss 테스트 결제 → 실제 웹훅 배달 → 잔액 증가 | **manual-only** (터널 필요) | — | n/a |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/payments`
- **Per wave merge:** `npm test`
- **Phase gate:** `npm test` 전부 green + 실제 Toss 테스트 결제 1회 수동 end-to-end 확인 후 `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/payments/` 디렉터리 신설 (현재 없음)
- [ ] `tests/helpers/toss.ts` — Toss `Payment` 객체 픽스처 빌더(`status`, `totalAmount`, `orderId`, `paymentKey` 파라미터화) + `global.fetch` 모킹 헬퍼
- [ ] `supabase/migrations/0005_payments.sql` 적용 (모든 통합 테스트의 선행 조건)
- [ ] `.env.example`에 `NEXT_PUBLIC_TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY` 추가
- 프레임워크 설치: **불필요** (Vitest 4.1.11 이미 구성됨)

---

## Sources

### Primary (HIGH confidence — 2026-09-02 라이브 조회)
- https://docs.tosspayments.com/reference/using-api/webhook-events (+`.md`) — 웹훅 헤더 4종, `tosspayments-webhook-signature`가 `payout.changed`/`seller.changed` 전용임을 명시, `PAYMENT_STATUS_CHANGED` 페이로드·상태 흐름도, "결제창을 닫으면 웹훅 미전송"
- https://docs.tosspayments.com/guides/v2/webhook (+`.md`) — 이벤트 타입 10종, 개발자센터 등록 절차, MID별 전송, localhost 등록 불가·ngrok 권장, 10초/200 응답, 재전송 7회 스케줄(1·4·16·64·256·1024·4096분)
- https://docs.tosspayments.com/reference — Payment 객체 전체 필드, `orderId` 제약(6~64자, `[A-Za-z0-9_-]`), `status` 값 8종, `POST /v1/payments/confirm`, `GET /v1/payments/{paymentKey}`, `GET /v1/payments/orders/{orderId}`, `metadata` 제약(5쌍/40자/2000자)
- https://docs.tosspayments.com/reference/using-api/authorization (+`.md`) — `Basic base64(sk:)` 콜론 규칙, BOM 주의, `Idempotency-Key`(UUID·300자·15일), `TossPayments-Test-Code`
- https://docs.tosspayments.com/reference/using-api/api-keys (+`.md`) — `ck`/`sk` vs `gck`/`gsk`, "주문서형·결제창형 연동 키는 전자결제 신청 이후에만", "개발 연동 체험 상점 … 테스트 결제내역, 웹훅을 사용해보세요", 키 재발급 정책
- https://docs.tosspayments.com/reference/using-api/firewall — 인바운드 IP 10개(13.124.18.147, 13.124.108.35, 3.36.173.151, 3.38.81.32, 115.92.221.121~123·125~127), 아웃바운드 8개, TLS 1.2+
- https://docs.tosspayments.com/guides/v2/get-started/llms-quick-reference.md — Critical 2.1~2.4(시크릿 키 서버 전용 / 서버측 금액 검증 필수 / Basic 콜론 / 필드 발명 금지), 제품 선택 결정 규칙, `customerKey` 형식, 결제창(구버전) 신규 연동 비권장, 2026년 제품명 변경
- https://docs.tosspayments.com/sdk/v2/js/environment.md — `npm install @tosspayments/tosspayments-sdk`, `loadTossPayments`, `TossPayments()` → `widgets`/`brandpay`/`payment`
- https://docs.tosspayments.com/sdk/v2/js/payment.md — `payment.requestPayment()` 파라미터 전체(`method`, `amount:{currency,value}`, `orderId`, `orderName`, `successUrl`, `failUrl`, `windowTarget`, `metadata`, `card.flowMode`), Redirect vs Promise 방식
- https://docs.tosspayments.com/guides/v2/payment-window/integration.md — 결제창(구버전) 연동 3단계, successUrl/failUrl 쿼리, `PAY_PROCESS_CANCELED` 시 `orderId` 미전달
- https://docs.tosspayments.com/guides/v2/payment-widget/integration-window.md — 결제창형(현행 제품) 흐름, successUrl 쿼리 `orderId/paymentKey/paymentType/amount`
- https://docs.tosspayments.com/guides/v2/get-started/environment.md — 테스트/라이브 차이(카카오페이 계약 후만, 페이코 불가, 분당 100건, 테스트 카드번호 없음), `TossPayments-Test-Code`
- https://docs.tosspayments.com/guides/v2/get-started/payment-flow.md — 요청·인증·승인 3단계
- https://docs.tosspayments.com/reference/error-codes.md — `ALREADY_PROCESSED_PAYMENT`, `DUPLICATED_ORDER_ID`, `NOT_FOUND_PAYMENT_SESSION`, `BELOW_MINIMUM_AMOUNT`(카드 100원), `INCORRECT_SUCCESS_URL_FORMAT`
- https://docs.tosspayments.com/sdk/v2/error-codes.md — failUrl 전달 에러 3종(`PAY_PROCESS_CANCELED`, `PAY_PROCESS_ABORTED`, `REJECT_CARD_COMPANY`), `USER_CANCEL`
- https://docs.tosspayments.com/blog/how-to-test-toss-payments.md (2024-12-05) — 문서용 테스트 키 공개값, "회원가입만 하면 개발 연동 체험 상점 … **웹훅을 설정하고 연결해볼 수 있어요**", 카카오페이 테스트 불가
- **로컬** `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` — Route Handler 규약, 캐싱, `RouteContext`
- **로컬** `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` §Webhooks — `await request.text()`, "unlike API Routes with the Pages Router, you do not need to use `bodyParser`"
- **로컬** `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/runtime.md` — `'nodejs'` 기본, **edge deprecated**
- **로컬** `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` — `middleware` deprecated → `proxy`
- **로컬** `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md` — Suspense 권장
- **로컬 저장소** `supabase/migrations/0001_init.sql`, `lib/ai/chat.ts:12,129-136`, `tests/wallet/ledger.concurrency.test.ts`, `proxy.ts`, `vitest.config.ts`, `components/layout/{site-header,account-panel}.tsx`
- `npm view @tosspayments/tosspayments-sdk version` → **2.8.1** (modified 2026-08-21)

### Secondary (MEDIUM confidence)
- WebSearch 결과로 처음 발견한 뒤 위 1차 문서로 교차 검증한 항목: 웹훅 서명 알고리즘(HMAC SHA-256 over `{PAYLOAD}:{transmission-time}`, base64, `v1:` 2개 값) — 알고리즘 자체는 공식 문서로 확인됨. **적용 대상이 지급대행 전용이라는 점이 검색 결과에는 없었고 공식 문서에서만 확인됨.**

### Tertiary (LOW confidence — 검증 실패 / 반증됨)
- "Toss 결제 웹훅은 `x-toss-signature` 헤더로 검증한다" (WebSearch 요약) — **공식 문서에서 확인 불가. 반증됨. 사용 금지.**
- Toss 인바운드 IP allowlist를 웹훅 인증 수단으로 쓰는 관행 — IP 목록 자체는 공식이지만 인증 수단으로 권장한다는 서술은 어디에도 없음. defense-in-depth로만 취급.

---

## Metadata

**Confidence breakdown:**
- **Standard stack:** HIGH — 패키지 버전은 npm 레지스트리 조회, SDK API는 공식 SDK 레퍼런스 원문, Next 16 동작은 설치본 로컬 문서
- **Architecture (승인/웹훅 시퀀스):** HIGH — Toss 공식 흐름도·LLM Quick Reference·API 레퍼런스 3중 대조
- **웹훅 검증 방식:** HIGH — "서명 헤더가 `payout.changed`/`seller.changed` 전용" 은 공식 원문 인용. 재조회 검증은 그로부터 도출된 유일하게 안전한 설계이며, 가상계좌 `DEPOSIT_CALLBACK`의 `secret` 대조 설계와 사상이 일치
- **멱등성 매핑:** HIGH — 기존 `apply_wallet_delta` 동작이 저장소 테스트로 이미 증명됨
- **테스트 키/실행 가능성:** HIGH — 공식 API 키 가이드 + 공식 블로그가 "가입만 하면 웹훅 사용 가능"을 명시
- **Pitfalls:** MEDIUM-HIGH — 대부분 공식 경고문 기반. Pitfall 4(동시 쓰기)·Pitfall 6(`proxy.ts`)·Pitfall 8(번들 오염)은 이 저장소 코드를 읽고 도출한 추론이며 공식 출처 없음
- **UI 세부(base-ui Popover 안 Dialog):** MEDIUM — 저장소의 base-ui 사용 패턴과 Phase 2 기록에서 도출, 라이브러리 문서로 재확인하지 않음

**Research date:** 2026-09-02
**Valid until:** 2026-10-02 (30일). 단 다음 중 하나라도 발생하면 즉시 재확인: 전자결제 계약 완료(키 종류·카카오페이 가용성 변경), Toss SDK 메이저 업데이트, Next.js 업그레이드.
