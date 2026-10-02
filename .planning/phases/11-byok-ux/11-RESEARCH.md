# Phase 11: BYOK 호출 경로 · 사용 기록 · 실패 UX - Research

**Researched:** 2026-10-01
**Domain:** Next.js App Router · Supabase · 멀티 제공자 AI 호출 · BYOK · 사용량 집계
**Confidence:** HIGH (코드/로컬 문서/공식 제공자 문서 확인), DB·실 API 검증 항목은 별도 표기

<user_constraints>
## User Constraints (from CONTEXT.md)

### Phase Boundary

작가가 자기 API 키(BYOK)로 실제 생성을 수행한다 — 지갑 토큰은 차감되지 않고 잔액이 0이어도 막히지 않는다. 실패는 원인 4종(무효·폐기 키 / 레이트리밋 / 크레딧 소진 / 타임아웃·장애)별로 구분되어 안내되고, 선택한 키를 쓸 수 없을 때는 무엇으로 대체됐는지 화면에서 보고 작가가 진행 여부를 결정한다. 이번 달 제공자별 BYOK 호출 수·토큰 수를 볼 수 있으며, 모든 AI 호출(서비스 키 포함)이 지갑 원장과 분리된 사용 기록(`ai_usage`)에 남는다.

**범위 밖(이미 정해짐):** 자동 재시도, 서비스 키로의 조용한 폴백, 제공자당 다중 키, 스트리밍 응답, 키 자동/주기 재검증 (REQUIREMENTS Out of Scope / Phase 10 D-03).

### Implementation Decisions

#### 패널 표시 · 출력 상한 (BYOK-08, BYOK-09)
- **D-01:** BYOK 모델을 선택하면 지갑 토큰 비용 게이지를 숨기고, 그 자리에 **안내 한 줄**("내 키로 호출해요 · 지갑 토큰은 차감되지 않아요" 계열, 정확한 문구는 UI-SPEC에서 확정)을 보여준다. 누가 비용을 내는지가 배지(`[BYOK]`)와 함께 계속 보이도록 한다.
- **D-02:** BYOK 호출의 1회 출력 토큰 상한은 **8192 고정**이다 (서비스 키 `PER_REQUEST_MAX_OUTPUT_TOKENS` 2048의 4배). 제공자·모델과 무관한 단일 상수이며, 세 벤더 모두 이 값을 지원해야 한다(플래너/리서처가 각 카탈로그 모델의 실제 최대 출력으로 검증). 서비스 키 상한은 변경하지 않는다.
- **D-03:** BYOK 모델 선택 시 "입력 1,000 + 출력 1,000 토큰 기준 약 N 지갑 토큰" **예시 비용 문구는 숨긴다** (지갑 토큰 개념이 BYOK에 해당하지 않음). Phase 10에서 넣은 "BYOK 모델 호출은 아직 준비 중이에요"(`BYOK_COPY.sendBoundary`)와 [보내기] 비활성 조건(`keySource === 'byok'`)은 이 phase에서 제거한다.

#### 실패 안내 · 재시도 · 대체 (BYOK-05, PROV-06)
- **D-04:** 실패 안내는 **기존 패널 알림 카드**(서비스 키 실패가 나오는 자리, `notice` + `onRetry`)를 재사용해 BYOK 4종 문구·버튼을 추가한다. 새로운 대화 로그 말풍선 컴포넌트는 만들지 않는다.
- **D-05:** [다시 시도] 버튼은 **무효·폐기 키를 제외한 3종**(레이트리밋 / 크레딧 소진 / 타임아웃·장애)에 제공한다. 재시도는 항상 사용자가 직접 누르며 자동 재시도는 없다(같은 멱등 키·같은 스냅샷 재사용, 기존 UI-SPEC §1 동작). 무효·폐기 키는 재시도해도 소용없으므로 버튼 대신 **[설정에서 키 확인]** 링크만 제공하고, 해당 키 상태를 `검증 실패`로 전환한다. 다른 3종은 키 상태를 바꾸지 않는다(무효 키만 `검증 실패`, BYOK-05). 크레딧 소진은 제공자에서 충전해야 하는 상황임을 문구로 안내한다.
- **D-06:** 선택한 BYOK 키를 쓸 수 없을 때(이미 `검증 실패`이거나 전송 직전 삭제된 경우) **전송하지 않고** 알림 카드에 무엇으로 대체 가능한지를 보여주며 **[서비스 키로 보내기(지갑 토큰 차감)] / [취소]** 명시 동의 버튼을 둔다. 사용자가 누를 때만 같은 모델의 서비스 키 항목으로 전송한다 — 서비스 키↔BYOK 간 조용한 전환은 없다(PROV-06). 서비스 키로 제공되지 않는 모델이면 Phase 10 D-09의 대체 규칙(Gemini 기본값)을 따른다.
- **D-07:** 과금 모드(서비스/BYOK)는 **매 호출 서버에서 재도출**한다 — 클라이언트가 보낸 `byok`/`keySource`는 분기 입력으로 신뢰하지 않는다(TOCTOU, 로드맵 Notes / Phase 10 D-06). BYOK 경로는 "상한 0인 서비스 경로"가 아니라 지갑 cap 계산·차감 블록 전체를 구조적으로 건너뛰는 **별도 분기**다. BYOK 성공 시 지갑 원장에는 0원 행을 기록하지 않는다.

#### 이번 달 사용량 화면 (BYOK-07)
- **D-08:** 사용량은 **각 제공자 카드 안**에 표시한다 (`/studio/settings/ai-providers`의 `ByokKeyCards`). 카드에는 제공자 합계(호출 수 · 입력/출력 토큰 수)를 보이고, **모델별 상세**를 펼쳐 볼 수 있게 한다.
- **D-09:** **금액(예상 비용)은 표시하지 않는다 — 호출 수와 토큰 수만 보여준다.** 이는 REQUIREMENTS BYOK-07과 ROADMAP Phase 11 성공 기준 5의 "예상 비용(금액)"을 삭제하는 결정이며, 두 문서를 이 결정에 맞춰 수정한다. 따라서 Phase 10 D-04가 언급한 "BYOK 사용량 금액(BYOK-07)" 목적의 카탈로그 단가 사용은 이 phase에서 필요하지 않다.
- **D-10:** "이번 달"의 경계는 **KST(Asia/Seoul) 매월 1일 00시**다. 집계 쿼리는 이 기준 월 시작을 사용한다.

#### 사용 기록 `ai_usage` (COST-02)
- **D-11:** **서비스 키와 BYOK 모두** 기록한다(`key_source` = `service` | `byok`). 지갑 원장과 분리된 별도 테이블이며, "정산 무관"임을 명시하는 SQL 주석을 남겨 향후 작가 90/10 정산 쿼리를 오염시키지 않게 한다(로드맵 Notes).
- **D-12:** **성공한 호출과 제공자 거부(usage가 보고된 경우)만** 기록한다. 타임아웃·장애·레이트리밋·무효 키 같은 실패는 토큰이 소비되지 않았으므로 기록하지 않는다 — 기록 실패가 호출을 막지 않고, 집계에 노이즈가 없다.
- **D-13:** BYOK 분기와 사용 기록은 **`preflightPaidGeneration`/`settlePaidGeneration` 공통 경로에 한 번에** 둔다. chat뿐 아니라 문서 계획·문서 재생성 등 같은 경로를 쓰는 모든 AI 진입점이 자동으로 같은 규칙(BYOK 분기 + 사용 기록)을 따른다 — 빠지는 경로가 없어야 한다.
- **D-14:** 기록 필드는 **최소 + 작품/회차 참조**다: 소유자, 제공자, 모델, `key_source`, 입력·출력(및 별도 보고되는 사고) 토큰, 상태(성공/거부), 시각, 멱등 키, 작품·회차 참조. **프롬프트·응답 본문은 저장하지 않는다.**

### Claude's Discretion
- `ai_usage` 스키마 세부(제약·인덱스·RLS·서비스 롤 기록 방식)와 멱등 키 중복 방지 방식(같은 요청 재시도 시 이중 기록 방지).
- 사용량 집계 쿼리/뷰 형태와 카드 내 펼침 UI 세부, 문구, 배치 — UI-SPEC에서 확정.
- 크레딧 소진을 각 제공자 오류 응답에서 어떻게 식별·분류할지(제공자별 status/코드 매핑), 무효 키를 `검증 실패`로 전환하는 시점의 레이스 처리.
- BYOK 호출 시 복호화 함수(`get_byok_secret`) 호출 위치와 키 수명(메모리 내 최소 유지), 요청 중 키 삭제와의 레이스.
- "정산 무관" 주석의 정확한 위치와 표현.

### Deferred Ideas
- BYOK 사용량의 예상 금액(원화/USD) 표시 — 이번 phase에서 삭제. 필요해지면 별도 phase로 요구사항을 다시 세운다.
- 실패 호출까지 포함한 운영 분석용 사용 기록(status별) — 이번 phase는 성공·거부만.
- 서비스 키 사용량 화면 / 기간 선택 / 전용 사용량 페이지 — 이번 phase는 BYOK 카드 내 표시만.
- 카탈로그 밖 모델 노출, 모델별 출력 상한 튜닝 — 8192 단일 상수로 시작.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | 계획이 보장해야 할 구현 결과 | 연구 결론 |
|---|---|---|
| `PROV-06` | 사용할 수 없는 BYOK 선택을 서비스 키로 조용히 바꾸지 않고 대체 항목과 비용 주체를 보여준 뒤 동의를 받는다. | 서버가 `replacement_required` 결과를 반환하고, 클라이언트는 기존 알림 카드에서 [서비스 키로 보내기(지갑 토큰 차감)]/[취소]를 제공해야 한다. 원래 시도와 같은 `idempotencyKey`와 스냅샷을 유지한다. [VERIFIED: codebase] |
| `BYOK-05` | 네 실패 유형을 구분하고 무효 키만 `failed`로 전환하며 자동 재시도하지 않는다. | 상태 코드만 보는 현 `toSanitizedProviderError`는 부족하다. 제공자별 allowlist 코드 판독과 OpenAI/Anthropic SDK `maxRetries: 0` 고정이 필요하다. [VERIFIED: codebase] [CITED: https://github.com/openai/openai-node/blob/main/docs/configuration.md] [CITED: https://platform.claude.com/docs/en/api/rate-limits] |
| `BYOK-06` | 잔액 0에서도 BYOK가 실행되고 wallet read/cap/debit/ledger row가 전혀 없다. | `preflightPaidGeneration`의 결제 컨텍스트를 판별 유니온으로 바꾸고 `byok` 분기는 지갑 블록 자체에 진입하지 않게 해야 한다. [VERIFIED: codebase] |
| `BYOK-07` | KST 이번 달의 제공자별/모델별 BYOK 호출·입력·출력 토큰을 카드에서 본다. | UTC `[start,end)` 경계를 KST 달력에서 계산해 `ai_usage`를 조회하고 서버 DAL에서 집계한 안전한 DTO만 `ByokKeyCards`에 전달한다. [VERIFIED: codebase] |
| `BYOK-08` | BYOK 선택 시 지갑 비용 표시를 숨기고 고정 안내를 보인다. | `AiPanel`의 `keySource` 기반 렌더 분기에서 예시 비용과 pending/disabled 분기를 교체한다. [VERIFIED: codebase] |
| `BYOK-09` | BYOK는 8192, 서비스 키는 기존 2048 상한을 사용한다. | `BYOK_MAX_OUTPUT_TOKENS = 8192`를 공통 서버 상수로 두고 신뢰된 서버 라우트가 상한을 선택한다. 현 카탈로그 모델은 모두 8192 이상을 지원한다. [VERIFIED: codebase] [CITED: https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash] [CITED: https://developers.openai.com/api/docs/models/gpt-5.6-terra] [CITED: https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-5] |
| `COST-02` | 서비스/BYOK의 성공·보고된 거절을 별도 사용 기록에 남기고 0원 ledger row를 만들지 않는다. | `ai_usage`에 제약/RLS/멱등 unique를 두고, 공통 settle 경로에서 best-effort insert한다. 프롬프트와 응답 컬럼은 만들지 않는다. [VERIFIED: codebase] |
</phase_requirements>

## Summary

Phase 11은 별도 BYOK 전송 함수를 추가하는 작업이 아니라, 현재 서비스 키 전용 생성 수명주기를 **서버가 재검증한 `service | byok` 라우트**로 일반화하는 작업이다. 현재 `chatAction`은 `keySource === 'byok'`를 즉시 거절하고, `chat()`/문서 계획/문서 재생성은 `preflightPaidGeneration`과 `settlePaidGeneration`에서 지갑을 전제로 처리한다. 따라서 호출 지점마다 예외 분기를 붙이면 D-13을 만족하지 못한다. 라우트 해석, 출력 상한, 오류 후 키 상태 변경, 사용량 기록을 공통 수명주기에 한 번만 넣어야 한다. [VERIFIED: codebase]

가장 중요한 구조적 결정은 다음 세 가지다.

1. 클라이언트 `keySource`는 **의도(requested selection)**일 뿐 권한 있는 결제 모드가 아니다. 서버가 사용자·제공자·모델·현재 키 행·복호화 가능 여부를 다시 읽어 `ResolvedGenerationRoute`를 만든다. [VERIFIED: codebase]
2. `ResolvedGenerationRoute`는 판별 유니온이어야 한다. `service`만 wallet preflight/debit를 수행하고, `byok`는 지갑 조회부터 원장 RPC까지 구조적으로 건너뛴다. [VERIFIED: codebase]
3. `ai_usage`는 원장과 별개인 **논리 요청 단위의 관측 기록**이다. `(owner_id, idempotency_key)` unique로 수동 재시도/중복 settle의 이중 기록을 막고, 기록 실패는 사용자 생성 결과를 실패시키지 않는다. [VERIFIED: codebase]

## Project Constraints

- 이 저장소의 Next.js는 `16.3.2`이며 일반적인 기억에 의존하면 안 된다. Server Action은 공개 POST 진입점처럼 인증·인가·입력 검증을 반복하고, DB 접근은 `server-only` DAL에 두며, Client Component에는 최소 DTO만 전달한다. 설정 페이지의 병렬 DB 조회는 Server Component에서 수행하되 사용량 조회 실패가 전체 페이지를 실패시키지 않게 DAL이 실패를 값으로 바꿔야 한다. [CITED: node_modules/next/dist/docs/01-app/02-guides/server-actions.md] [CITED: node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md] [CITED: node_modules/next/dist/docs/01-app/02-guides/data-security.md]
- `11-CONTEXT.md` 결정과 `11-UI-SPEC.md`의 문구·초점·ARIA·반응형 계약은 locked다. 플래너는 이를 다시 선택지로 만들면 안 된다. [CITED: .planning/phases/11-byok-ux/11-CONTEXT.md] [CITED: .planning/phases/11-byok-ux/11-UI-SPEC.md]
- 새 패키지는 필요하지 않다. 기존 React/Base UI/lucide/Supabase/세 provider SDK/Vitest로 구현할 수 있다. [VERIFIED: codebase]
- `graphify-out/graph.json`이 있으므로 계획·구현 중 관계 질문은 `graphify query/path/explain`을 우선하고, 코드 수정 뒤 `graphify update .`를 실행한다. [CITED: AGENTS.md]
- Phase 10 완료 기록은 존재하지만 최종 migration/UI 수정 뒤 전체 suite를 다시 돌리지 않았다는 known gap이 있다. Phase 11 시작 시 full baseline을 한 번 확보해야 한다. [CITED: .planning/phases/10-byok/10-06-SUMMARY.md]
- `.planning/STATE.md`의 하단 Session Continuity는 이전 phase를 가리키는 stale 정보가 섞여 있으므로, Phase 11의 실제 기준은 ROADMAP/CONTEXT/UI-SPEC과 Phase 10 SUMMARY다. [VERIFIED: codebase]

## Architectural Responsibility Map

| 책임 | 현재 위치 | Phase 11 권장 변경 |
|---|---|---|
| 입력 선택 검증 | `app/.../ai-panel/actions.ts`, `lib/ai/chat-request.ts` | `keySource` 문법 검증은 유지하되 서버 라우트 재도출을 공통 resolver로 이동한다. |
| 키 메타/복호화 | `lib/ai/providers/byok.ts`, `get_byok_secret` | 키 id·status·model membership·secret을 하나의 서버 전용 해석 경계에서 가져오고 `available | replacement_required`를 반환한다. |
| provider 생성 | `lib/ai/providers/registry.ts` | 플랫폼/사용자 키가 같은 adapter factory를 재사용하도록 `createProvider(providerId, apiKey, source)` 내부 경계를 만든다. |
| 결제 preflight | `lib/ai/paid-generation.ts` | `service`만 기존 wallet/ledger cap 경로를 실행하고 `byok`는 8192 상한만 부여한다. |
| provider 호출/settle | `lib/ai/paid-generation.ts` | 호출 결과를 공통 정규화하고 usage best-effort 기록 후 `service`만 debit/refusal settlement한다. |
| 오류 정제 | `lib/ai/providers/errors.ts` + 각 adapter | raw error를 adapter 안에서 제공자별 allowlist 필드로 분류해 `invalid_key | rate_limited | credit_exhausted | unavailable | config`를 만든다. |
| 무효 키 전환 | 새 migration RPC + `byok.ts` | `(owner_id, provider, expected_key_id)`가 일치할 때만 `failed`로 바꾸는 조건부 RPC를 둔다. |
| 사용량 저장/조회 | 새 migration + 새 `lib/ai/usage.ts` | insert는 admin/service role, 월간 read는 사용자 RLS 또는 server DAL; 안전한 집계 DTO를 반환한다. |
| 패널 UX | `AiPanel.tsx`, `AiPanelNotice.tsx`, `chat-result.ts` | BYOK 안내, 4종 오류, 명시 폴백, 동일 attempt 재사용, 초점 계약을 구현한다. |
| 설정 사용량 UX | settings `page.tsx`, `ByokKeyCards.tsx` | 등록된 카드에 합계/모델 토글/오류 상태를 추가한다. |

모든 행은 현 코드와 locked UI 계약을 바탕으로 한 권장 책임 분리다. [VERIFIED: codebase]

## Standard Stack

| 기술 | 현재 버전 | Phase 11 용도 |
|---|---:|---|
| Next.js | `16.3.2` | Server Action 인증 경계, Server Component 설정 데이터 로딩 |
| React | `19.2.8` | 패널 notice/focus 및 카드 상세 토글 |
| `@supabase/supabase-js` | `^2.112.4` | 세션 RLS 조회, service-role RPC/insert |
| `openai` | `^7.23.0` | Responses API, `APIError.code`, `maxRetries: 0` |
| `@anthropic-ai/sdk` | `^0.127.0` | Messages API, structured error body, `maxRetries: 0` |
| `@google/genai` | `^2.19.0` | GenerateContent, 기존 `attempts: 1` 유지 |
| Zod | `^4.4.3` | Action payload 및 UUID/selection 경계 검증 |
| Vitest | `^4.1.11` | pure/unit/action/DB integration 검증 |

버전과 용도는 현재 `package.json` 및 구현에서 확인했다. 새 런타임 의존성은 추가하지 않는다. [VERIFIED: codebase]

## Package Legitimacy Audit

해당 없음. 이 phase는 새 패키지를 설치하지 않는다. 시간대 경계는 두 UTC instant로 계산하고, 집계는 SQL/Supabase와 표준 `Date`만으로 충분하다. [VERIFIED: codebase]

## Recommended Architecture

### 1. 요청 의도와 신뢰된 실행 라우트를 분리한다

```text
Client Selection { providerId, model, keySource }
                │  untrusted intent
                ▼
Server Action: auth + Zod + work/chapter ownership
                │
                ▼
resolveGenerationRoute(owner, requestedSelection)
       ├─ service ──> platform key provider
       ├─ byok available ──> exact key row + secret + BYOK provider
       └─ byok unavailable ──> replacement_required (no provider call)
                │
                ▼
preflightPaidGeneration(route)
       ├─ service ──> wallet/cap/idempotency precheck, max 2048
       └─ byok ─────> no wallet access, max 8192
                │
                ▼
settlePaidGeneration(generate)
       ├─ normalized failure / conditional key status update
       ├─ success or reported refusal -> ai_usage best-effort
       ├─ service -> wallet settlement
       └─ byok -> no ledger call
```

이 순서라야 삭제된/failed 키가 provider 호출까지 가지 않고, 잔액 0 BYOK가 wallet preflight에 막히지 않으며, chat/문서 계획/재생성이 같은 규칙을 얻는다. [VERIFIED: codebase]

권장 타입 형태:

```ts
type ResolvedGenerationRoute =
  | {
      keySource: 'service';
      providerId: ProviderId;
      model: string;
      client: ProviderClient;
    }
  | {
      keySource: 'byok';
      providerId: ProviderId;
      model: string;
      keyId: string;
      client: ProviderClient;
    };

type GenerationContext =
  | {
      route: Extract<ResolvedGenerationRoute, { keySource: 'service' }>;
      maxOutputTokens: number;
      pricing: ModelPricing;
      walletBalance: number;
      admin: SupabaseClient;
    }
  | {
      route: Extract<ResolvedGenerationRoute, { keySource: 'byok' }>;
      maxOutputTokens: 8192;
      admin: SupabaseClient;
    };
```

`keySource` 판별 뒤에만 wallet 필드가 존재하게 만들면 BYOK에서 실수로 `computeMaxOutputTokens`, `readWalletBalance`, `apply_wallet_delta`를 호출하는 오류를 타입 수준에서 줄일 수 있다. [VERIFIED: codebase]

### 2. 키 해석은 단일 서버 경계에서, 호출 직전에 한다

현 `getByokSecret()`은 `string | null`만 반환해 “failed/삭제/복호화 실패”를 구분하지 못하고, 모델이 키 검증 시 허용됐는지도 함께 보장하지 않는다. `resolveByokRoute`는 다음을 한 번에 보장해야 한다. [VERIFIED: codebase]

- 로그인한 `ownerId`의 `provider` 한 행이며 `status='connected'`인지 확인한다.
- 요청 모델이 현재 `model_ids`와 프로젝트 카탈로그 양쪽에 있는지 확인한다.
- 가능한 늦게 secret을 복호화하고 즉시 provider client를 만든다.
- raw secret을 반환 DTO, React props, 로그, error, usage context에 넣지 않는다.
- 행이 없거나 failed이거나 복호화 결과가 없으면 provider 호출 없이 `replacement_required`를 반환한다.

삭제 race의 선형화 지점은 복호화 RPC다. 삭제가 먼저 잠금을 얻으면 resolver는 unavailable을 반환한다. 복호화가 먼저 완료되어 JS 메모리에 키가 들어온 뒤 삭제되면 이미 시작된 1회 호출은 완료될 수 있다. JavaScript 문자열을 강제로 안전 삭제할 수 없으므로 캐시하지 않고 요청 스코프 참조를 최소화하는 것이 현실적 경계다. [ASSUMED]

### 3. 무효 키 상태 변경은 “그때 호출한 키 id”에만 적용한다

현재 `set_byok_status(owner, provider, ...)`는 사용자가 실패 직후 키를 삭제·재등록하면 이전 호출의 401/403이 새 키를 `failed`로 바꿀 수 있다. 새 RPC는 `p_expected_key_id`를 받고 아래처럼 조건부 update해야 한다. [VERIFIED: codebase]

```sql
update public.byok_keys
set status = 'failed', verified_at = now()
where id = p_expected_key_id
  and owner_id = p_owner
  and provider = p_provider;
```

반환값은 `boolean` 또는 affected row count로 두고, 0행은 정상적인 stale result로 취급한다. `rate_limited`, `credit_exhausted`, `unavailable`에는 이 RPC를 호출하지 않는다. [VERIFIED: codebase]

### 4. `ai_usage`는 원장과 독립된 최소 append-only 테이블로 만든다

권장 migration 스키마:

```sql
create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('openai','anthropic','gemini')),
  model text not null check (char_length(trim(model)) > 0),
  key_source text not null check (key_source in ('service','byok')),
  input_tokens bigint not null check (input_tokens >= 0),
  output_tokens bigint not null check (output_tokens >= 0),
  thoughts_tokens bigint check (thoughts_tokens is null or thoughts_tokens >= 0),
  status text not null check (status in ('completed','refused')),
  idempotency_key uuid not null,
  work_id uuid references public.works(id) on delete set null,
  chapter_id uuid references public.chapters(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (owner_id, idempotency_key)
);

comment on table public.ai_usage is
  'AI provider usage telemetry only; settlement/accounting queries must not use this table.';
create index ai_usage_owner_source_created_idx
  on public.ai_usage(owner_id, key_source, created_at);
create index ai_usage_owner_provider_model_created_idx
  on public.ai_usage(owner_id, provider, model, created_at);
```

`owner_id` 삭제는 usage도 제거하고, 작품/회차 삭제는 월간 계정 사용량을 보존하도록 참조만 null 처리하는 구성이 요구사항에 가장 잘 맞는다. 기존 `works`/`chapters`가 soft delete를 사용하므로 실제 삭제 정책과 함께 DB integration test로 확인해야 한다. [VERIFIED: codebase]

RLS는 owner `SELECT`만 허용하고 `anon/authenticated`의 insert/update/delete를 revoke한다. 기록은 기존 admin/service-role 클라이언트가 수행한다. 프롬프트·응답·raw provider error 컬럼은 만들지 않는다. 같은 논리 전송의 재시도는 같은 `idempotencyKey`를 쓰므로 unique conflict는 성공으로 간주하고 중복만 버린다. [VERIFIED: codebase]

`COST-02`의 “모든 AI 호출”은 이 phase의 공통 `ProviderClient.generateContent` 생성 경로(chat, document plan, regeneration)의 성공과 사용량이 보고된 refusal을 뜻한다. provider에 도달하지 않은 preflight 실패와 transport/API 실패는 D-12에 따라 기록하지 않는다. [CITED: .planning/phases/11-byok-ux/11-CONTEXT.md]

### 5. 사용량 기록은 best-effort지만 호출 결과보다 먼저 관측한다

`settlePaidGeneration`이 provider 결과를 받은 직후 다음 규칙으로 한 번 기록하는 것이 적절하다. [VERIFIED: codebase]

- `completed`: provider가 성공 응답을 반환하면 기록한다.
- `refused`: `usage.reported.input || usage.reported.output`일 때만 기록한다.
- 예외/timeout/rate/credit/invalid: 기록하지 않는다.
- insert 예외/unique conflict: 정제된 서버 로그만 남기고 사용자 결과와 지갑 settlement를 막지 않는다.

기록을 post-call write-access 검사보다 뒤에 두면 provider가 실제 토큰을 소비했지만 앱이 결과를 버린 호출을 누락할 수 있다. 사용량은 정산이 아니라 provider 소비 관측이므로, provider 결과 직후 기록하고 그 다음 기존 write-access/지갑 settlement를 진행하는 편이 D-11/D-12/COST-02에 더 일관적이다. [ASSUMED]

### 6. KST 월 집계는 명시적 UTC 반개구간을 쓴다

서버 helper가 현재 시각에 대해 KST 월의 시작과 다음 달 시작을 UTC instant로 계산하고 아래 조건을 사용한다.

```ts
.eq('owner_id', ownerId)
.eq('key_source', 'byok')
.gte('created_at', startUtc.toISOString())
.lt('created_at', endUtc.toISOString())
```

DB session timezone의 `date_trunc('month', created_at)`에 기대지 말고 `[start,end)`를 사용해야 월말/정각 중복이 없다. 서버 DAL은 `provider -> total + models[]`로 집계하고, 모델 행은 UI-SPEC대로 호출 수 내림차순 후 모델명 오름차순으로 정렬한다. [CITED: .planning/phases/11-byok-ux/11-UI-SPEC.md]

설정 페이지는 이미 `Promise.all`로 키/모델을 읽는다. 사용량 loader는 throw하지 않고 `{ ok: true, data } | { ok: false }`를 반환해야 사용량 장애가 기본값/삭제/재확인 기능까지 깨뜨리지 않는다. [VERIFIED: codebase] [CITED: node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md]

### 7. 모든 생성 진입점을 공통 경로로 수렴시킨다

`chat()`과 document planning은 공통 paid-generation 경로를 사용하지만, `regenerateDocumentWithTemplate()`는 아직 `modelTier`와 외부에서 받은 `ProviderClient`를 사용한다. Phase 11에서 이 경로에 trusted selection/work/chapter reference를 전달하도록 바꾸지 않으면 D-13/COST-02에 구멍이 생긴다. [VERIFIED: codebase]

플래너는 최소한 다음 호출 그래프를 한 wave에서 함께 변경해야 한다.

```text
AiPanel -> chatAction -> chat
                    ├─ ordinary chat
                    └─ document-plan

document regeneration action -> regenerateDocumentWithTemplate

all paths -> resolve route -> preflightPaidGeneration -> settlePaidGeneration
```

재생성 입력에 `chapterId`가 없으면 `chapter_id`는 nullable로 기록하되 `work_id`는 반드시 전달한다. 향후 UI가 회차 문맥을 가지고 있다면 action boundary에서 `chapterId`를 추가하고 소유권 검증 후 전달한다. [VERIFIED: codebase]

## Provider Failure Classification

현 공통 sanitizer는 status만 읽어 `429 => rate_limited`, `null/5xx => unavailable`, 나머지 4xx => config로 분류한다. 이는 동일 429 안의 rate limit과 credit exhaustion을 구별하지 못한다. raw object를 퍼뜨리지 말고, 각 adapter catch에서 **구조화된 allowlist 필드만 읽어** 공통 `SanitizedProviderError`를 만든다. [VERIFIED: codebase]

| Provider | `invalid_key` | `credit_exhausted` | `rate_limited` | `unavailable` |
|---|---|---|---|---|
| OpenAI | 401, BYOK 문맥의 인증 실패. 403은 키 권한/지역 등 원인이 섞여 있으므로 safe code가 없으면 `config` 또는 제품 결정에 따라 invalid 처리한다. | 429 + `error.code`가 `credit_balance_exhausted`, `organization_spend_limit_exceeded`, `project_spend_limit_exceeded`, `organization_usage_limit_exceeded` | 그 외 429 | status null, timeout/connection, 5xx |
| Anthropic | 401; 403 permission은 현재 키로 사용 불가하므로 BYOK에서 invalid 계열로 취급 가능 | 429 + `error.details.error_code === 'enforced_spend_limit_reached'`; 402 billing. 사용자 지정 spend limit의 400은 공식 구조 code가 없어 message matching 없이 완전 분류할 수 없음 | 그 외 429 | status null, timeout/connection, 5xx |
| Gemini | 401 authentication; 403 permission | 402 `payment_required` | 429 `RESOURCE_EXHAUSTED` (spend-based rate도 일시 한도이므로 retry UI가 맞음) | status null, timeout/connection, 5xx |

분류 근거: [CITED: https://developers.openai.com/api/docs/guides/error-codes] [CITED: https://platform.claude.com/docs/en/api/errors] [CITED: https://platform.claude.com/docs/en/api/rate-limits] [CITED: https://ai.google.dev/gemini-api/docs/api-errors]

Anthropic의 사용자 지정 spend limit은 HTTP 400 + 자연어 message로만 구분되는 문서 계약이어서, Phase 8의 “raw message를 제어 흐름에 쓰지 않는다” 보안 경계를 유지하면 `credit_exhausted`로 완전 분류할 수 없다. 계획에는 (a) SDK가 보존하는 structured field가 실제 응답에서 있는지 fixture/live probe로 확인하고, 없으면 (b) 400을 generic config/invalid로 안전하게 처리한다는 명시적 fallback을 넣어야 한다. message substring 분류는 추천하지 않는다. [CITED: https://platform.claude.com/docs/en/api/rate-limits]

### 자동 재시도는 SDK에서도 꺼야 한다

UI에 자동 재시도 코드가 없어도 OpenAI와 Anthropic SDK는 기본적으로 일시 실패를 2회 재시도한다. locked D-05의 “자동 재시도 없음”을 만족하려면 생성 provider constructor에 `maxRetries: 0`을 명시해야 한다. Gemini는 이미 `retryOptions.attempts: 1`로 단일 HTTP 시도를 고정했다. [VERIFIED: codebase] [CITED: https://github.com/openai/openai-node/blob/main/docs/configuration.md] [CITED: node_modules/@anthropic-ai/sdk/client.d.ts]

## UI Integration Guidance

### AI panel

- `keySource === 'byok'`일 때 보내기 비활성화와 `BYOK_COPY.sendBoundary`를 제거하고, 정확한 안내 `내 키로 호출해요 · 지갑 토큰은 차감되지 않아요`를 표시한다. 예시 비용 계산/문구는 렌더하지 않는다. [CITED: .planning/phases/11-byok-ux/11-UI-SPEC.md]
- `ChatResult`에 `invalid_key`, `credit_exhausted`, `replacement_required`를 표현하는 discriminant를 추가한다. 임의 boolean 조합보다 `notice.kind` 또는 `status/failureKind`의 명시적 유니온이 안전하다. [VERIFIED: codebase]
- retry 가능한 세 실패는 기존 `failedAttemptRef`의 frozen payload와 같은 `idempotencyKey`를 그대로 사용한다. invalid key는 retry가 아니라 설정 링크만 제공하고 `router.refresh()`로 picker의 failed 상태를 반영한다. [VERIFIED: codebase]
- unavailable preflight의 서비스 키 동의는 원본 `SendAttempt`를 직접 mutate하지 말고, 같은 content/work/chapter/idempotency snapshot에 selection만 서버 제시 대체값으로 바꾼 파생 attempt를 만든다. 이전 BYOK provider 호출/usage/debit가 없으므로 같은 idempotency key를 유지할 수 있다. [VERIFIED: codebase]
- 대체 알림은 최초 초점을 [취소]에 두고, invalid 알림은 [설정에서 키 확인] 링크에 둔다. 실패는 `role="alert"`, 일반 상태는 `role="status"`, 모델 상세는 `aria-expanded`/`aria-controls`를 구현한다. [CITED: .planning/phases/11-byok-ux/11-UI-SPEC.md]

정확한 실패 문구와 버튼은 `11-UI-SPEC.md`를 단일 출처로 사용하고 `byok-copy.ts` 또는 `chat-result.ts`의 client-safe 상수에 모은다. 서버에서 raw provider 문구를 반환하지 않는다. [CITED: .planning/phases/11-byok-ux/11-UI-SPEC.md]

### BYOK settings cards

- 등록된 카드에는 status가 `failed`여도 사용량을 표시한다. 미등록 카드에는 표시하지 않는다. [CITED: .planning/phases/11-byok-ux/11-UI-SPEC.md]
- 합계는 `{N}회 · 입력 {X} · 출력 {Y} 토큰`, 보조 문구는 KST 월 경계를 명시한다. 금액/환율/추정 비용은 계산도 렌더도 하지 않는다. [CITED: .planning/phases/11-byok-ux/11-UI-SPEC.md]
- 상세 토글은 기존 카드 안에 두고 모바일에서 `flex-wrap`을 허용한다. 새 chart/table 패키지는 필요 없다. [CITED: .planning/phases/11-byok-ux/11-UI-SPEC.md]
- Server Component가 집계 DTO를 props로 전달한다. 브라우저에서 service-role 조회를 호출하거나 secret 관련 RPC를 노출하지 않는다. [CITED: node_modules/next/dist/docs/01-app/02-guides/data-security.md]

## Output Limit Verification

프로젝트 카탈로그의 Gemini 3.5 Flash, OpenAI GPT-4o mini/GPT-5.6 Terra, Anthropic Claude Haiku 4.5/Sonnet 5는 모두 8192 output tokens 이상을 지원한다. 확인된 최소치는 GPT-4o mini 16,384이고, 나머지는 64K 이상이므로 단일 8192 상한은 안전하다. [CITED: https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash] [CITED: https://developers.openai.com/api/docs/models/gpt-4o-mini] [CITED: https://developers.openai.com/api/docs/models/gpt-5.6-terra] [CITED: https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-5]

상한은 클라이언트 prop이 아니라 trusted route의 서버 상수로 선택한다. 서비스 키의 `PER_REQUEST_MAX_OUTPUT_TOKENS = 2048`와 비용 기반 cap 로직은 변경하지 않는다. [VERIFIED: codebase]

## Suggested File Plan

### Wave 0 — 검증 기반

- `tests/ai/byok-generation.test.ts`: server rederive, zero balance, deleted/failed key, no wallet calls, 8192.
- `tests/ai/provider-errors.test.ts`: 세 vendor의 4분류와 message/secret 비노출.
- `tests/ai/ai-usage.test.ts`: completed/refused/error/duplicate/best-effort 규칙.
- `tests/ai/ai-usage-db.test.ts`: schema/RLS/grants/unique/FK/index/comment.
- 기존 `ai-panel-model`, `ai-panel-notice`, `byok-settings-ui`, `chat-action`, `paid-generation`, `document-regenerate` 테스트 확장.

이 테스트 파일 중 Phase 11 전용 usage/generation 케이스는 현재 존재하지 않으므로 먼저 실패하는 계약을 만든다. [VERIFIED: codebase]

### Wave 1 — DB와 순수 도메인

- `supabase/migrations/0018_ai_usage.sql`: table/RLS/grants/index/comment/conditional `mark_byok_failed` RPC.
- `lib/ai/usage.ts`: KST range, row validation, aggregate, best-effort insert.
- `lib/ai/providers/types.ts`, `errors.ts`, adapters: failure union과 allowlist 분류, retry 0.
- `lib/ai/providers/registry.ts`, `byok.ts`: trusted route resolution과 BYOK provider construction.

### Wave 2 — 공통 생성 수명주기

- `lib/ai/paid-generation.ts`: discriminated context, BYOK wallet bypass, usage insertion, invalid status transition.
- `lib/ai/chat.ts`, `document-plan.ts`, `document-regenerate.ts`, 관련 actions/request/result 타입: 공통 route와 usage refs 전달.

DB/오류 타입이 먼저 안정되어야 settle 경로가 하나의 계약에 맞춰 구현된다. [VERIFIED: codebase]

### Wave 3 — UI

- `AiPanel.tsx`, `AiPanelNotice.tsx`, client-safe copy/result: 안내·4종 실패·명시 폴백·focus.
- settings `page.tsx`, `ByokKeyCards.tsx`: 사용량 DTO·합계·상세·실패 상태.
- `revalidatePath('/studio/settings/ai-providers')` 또는 현재 action redirect/refresh 흐름을 통해 invalid key 상태를 반영한다. [CITED: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md]

### Wave 4 — 통합/실 API 검증

- migration 적용 후 DB test skipped 0.
- 세 vendor 키로 성공/401/429/credit/timeout fixture 및 가능한 live probe.
- 브라우저에서 focus, retry, explicit fallback, zero wallet, mobile layout.
- full `npm test`, `npx tsc --noEmit`, lint, `graphify update .`.

## Anti-Patterns to Avoid

- **클라이언트 `keySource`로 지갑 분기:** TOCTOU와 조작 가능성이 있다. 반드시 서버가 키 행을 재조회한다. [CITED: .planning/phases/11-byok-ux/11-CONTEXT.md]
- **BYOK를 `maxOutputTokens=0` 또는 debit 0인 서비스 호출로 표현:** wallet read/cap/ledger가 여전히 실행되어 BYOK-06과 “0원 행 없음”을 깨뜨린다. [VERIFIED: codebase]
- **각 action에 BYOK 예외를 복제:** 문서 재생성이나 이후 진입점이 빠진다. 공통 preflight/settle에 둔다. [VERIFIED: codebase]
- **HTTP status만으로 429 분류:** OpenAI/Anthropic의 credit/spend exhaustion과 rate limit을 혼동한다. structured code를 allowlist한다. [CITED: https://developers.openai.com/api/docs/guides/error-codes] [CITED: https://platform.claude.com/docs/en/api/rate-limits]
- **raw SDK error/message를 로그·응답·DB에 저장:** API key/header/request/prompt가 포함될 수 있다. adapter 경계에서 새 객체로 재구성한다. [CITED: .planning/phases/08-provider-adapter-idempotent-debit/08-CONTEXT.md]
- **OpenAI/Anthropic 기본 retry를 그대로 사용:** 사용자가 누르지 않은 추가 요청이 발생한다. constructor에 `maxRetries: 0`을 명시한다. [CITED: https://github.com/openai/openai-node/blob/main/docs/configuration.md] [CITED: node_modules/@anthropic-ai/sdk/client.d.ts]
- **provider 응답 성공 전에 usage insert:** 실패 호출을 오염시킨다. 성공/보고된 refusal 뒤에만 쓴다. [CITED: .planning/phases/11-byok-ux/11-CONTEXT.md]
- **usage insert 실패로 생성 실패:** telemetry가 사용자 기능을 막는다. catch/log 후 계속한다. [CITED: .planning/phases/11-byok-ux/11-CONTEXT.md]
- **사용량 조회 실패를 settings page throw로 전파:** 키 등록/삭제/기본값 UI 전체가 사라진다. per-section error DTO로 격리한다. [CITED: .planning/phases/11-byok-ux/11-UI-SPEC.md]
- **Anthropic 400 message substring 매칭:** 문구 변화·현지화·정보 노출 위험이 있다. structured code가 없으면 generic 안전 분류를 쓴다. [ASSUMED]

## Common Pitfalls

### Idempotency의 범위

현 wallet 멱등성은 동일 키의 중복 debit을 막지만, 완전히 동시인 두 요청이 provider를 둘 다 호출할 가능성까지 제거하지는 않는다. `ai_usage` unique는 “논리 전송 1건”의 중복 기록을 막는 것이며 실제 vendor HTTP attempt 수를 정확히 세는 운영 telemetry는 아니다. 이번 phase의 locked 목적과 UI에는 논리 요청 단위가 맞고, 물리 attempt 분석은 deferred다. [VERIFIED: codebase]

### Refusal usage 조건

D-12 문장은 “성공한 호출”은 기록하고, “제공자 거부”는 usage가 보고된 경우만 기록하는 것으로 해석하는 것이 자연스럽다. 따라서 completed는 정상 기록하고 refusal은 `reported.input || reported.output` 조건을 둔다. 이 해석을 plan task acceptance에 명시해 구현자마다 다르게 해석하지 않게 한다. [CITED: .planning/phases/11-byok-ux/11-CONTEXT.md]

### Service fallback와 동일 멱등 키

`replacement_required`는 provider 호출 전 결과이므로 동일 `idempotencyKey`를 서비스 fallback에 재사용할 수 있다. 반대로 실제 BYOK provider가 invalid/credit/rate/outage로 실패한 뒤 자동으로 service fallback을 붙이면 안 된다. invalid은 설정 링크, 나머지는 동일 BYOK 수동 retry만 제공한다. [CITED: .planning/phases/11-byok-ux/11-CONTEXT.md]

### UI refresh와 stale selection

invalid 키를 DB에서 failed로 바꾼 뒤 현재 Client Component의 choices는 stale할 수 있다. action 결과 처리 시 route refresh 또는 동일한 authoritative choice reload가 필요하다. refresh 전에도 notice는 서버 결과에 따라 즉시 invalid UX를 보여야 한다. [VERIFIED: codebase]

### 사용량 숫자 타입

DB token 컬럼은 장기 누계를 고려해 `bigint`가 안전하지만 Supabase/JS 직렬화 타입을 확인해야 한다. 월간 개인 사용량은 JS safe integer를 넘을 가능성이 낮으나 row validator에서 음수·비정수·범위 초과를 방어하거나 SQL aggregate를 text/number DTO로 정규화한다. [ASSUMED]

## Validation Architecture

`nyquist_validation`이 켜져 있으므로 계획은 구현 task 뒤에 테스트를 덧붙이는 방식이 아니라, 각 요구사항에 자동/수동 증거를 먼저 매핑해야 한다. [VERIFIED: codebase]

### Test layers

1. **Pure unit:** KST range, aggregate ordering, provider error classification, fallback selection, output cap, notice model. 빠르고 모든 커밋에서 실행한다.
2. **Lifecycle/action unit:** mocked Supabase/admin/provider로 wallet call 여부, usage insert ordering/best-effort, key status race, same idempotency를 검증한다.
3. **DB integration:** 실제 migration이 적용된 Supabase에서 RLS/grant/unique/FK/comment/RPC race를 검증한다. `SUPABASE_DB_URL` 없으면 skip되지만 phase gate에서는 skipped 0이어야 한다.
4. **Browser UAT:** 실제 AI panel/settings에서 focus, alert semantics, retry/fallback consent, mobile wrap, refresh를 확인한다.
5. **Live provider smoke:** 비밀을 로그하지 않는 별도 환경에서 세 vendor의 성공·인증 실패·가능한 rate/credit fixture를 확인한다. 재현이 어려운 credit/rate는 structured fixture를 주 증거로 하고 최소 한 번의 live shape probe를 보조 증거로 둔다.

### Requirement-to-evidence matrix

| Requirement | 자동 검증 | 수동/통합 검증 | 실패 시 차단 |
|---|---|---|---|
| `PROV-06` | deleted/failed key가 provider를 호출하지 않고 `replacement_required`; same-model/Gemini replacement; consent attempt가 동일 idempotency 유지 | 알림 문구, [취소] 초기 focus, 명시 버튼 없이 전송 없음 | HIGH |
| `BYOK-05` | vendor별 4분류; only invalid calls conditional mark; SDK retries 0; retry reuses frozen attempt | 네 카드의 정확한 문구/링크/버튼/focus | HIGH |
| `BYOK-06` | wallet balance 0 BYOK success; wallet read/cap/RPC spy 모두 0회; ledger row 0 | 실제 0잔액 계정 생성 | HIGH |
| `BYOK-07` | KST 월초/월말/다음달 경계; provider/model aggregate와 sort; failed card에도 usage | settings 카드 desktop/mobile, empty/error state | HIGH |
| `BYOK-08` | BYOK selection snapshot에서 cost copy 없음, 안내 있음; service에서는 반대 | picker 전환 시 즉시 표시 변화 | MEDIUM |
| `BYOK-09` | BYOK adapter params 8192, service 기존 2048/cost cap; 모든 catalog model capability fixture | 세 provider smoke request | HIGH |
| `COST-02` | completed/service/byok와 reported refusal insert; failures no insert; duplicate one row; insert failure non-blocking; no zero ledger | DB RLS 및 실제 조회 | HIGH |

### Recommended commands

빠른 수정 루프:

```powershell
npx vitest run tests/ai/provider-errors.test.ts tests/ai/byok-generation.test.ts tests/ai/ai-usage.test.ts
npx vitest run tests/ai/chat-action.test.ts tests/ai/paid-generation.test.ts tests/ai/ai-panel-model.test.ts tests/ai/ai-panel-notice.test.ts tests/ai/byok-settings-ui.test.ts
```

DB gate:

```powershell
npx vitest run tests/ai/ai-usage-db.test.ts
```

Phase gate:

```powershell
npm test
npx tsc --noEmit
npm run lint
graphify update .
```

현재 조사 시 기존 관련 6개 test file, 83 tests가 통과했다. Vite native config loader 예정 변경 경고가 있으나 테스트 실패는 아니다. [VERIFIED: codebase]

### Nyquist-specific planning rule

각 PLAN task의 `<verify>`에는 최소 하나의 자동 명령과 관찰할 assertion을 적고, `<done>`에는 해당 requirement ID를 적는다. DB migration task는 환경변수 부재로 skip된 상태를 완료로 인정하지 않는다. 브라우저 전용 접근성/초점 검증은 자동 테스트와 별도로 UAT checkpoint를 둔다. [CITED: .planning/config.json]

## Security Domain

### Threats and mitigations

| Threat | Mitigation |
|---|---|
| 조작된 `keySource='byok'`로 지갑 우회 | owner/provider/model/key row를 서버에서 매 호출 재도출; trusted discriminated route만 preflight에 전달 |
| 다른 사용자의 키/usage 접근 | `owner_id=auth.uid()` RLS, service role 함수는 서버에서 인증 owner를 주입, Client Component에는 집계 DTO만 전달 |
| 키 삭제·재등록 race가 새 키를 failed 처리 | `expected_key_id` 조건부 RPC |
| raw error/키/프롬프트 유출 | adapter allowlist reconstruction; DB schema에 prompt/response 컬럼 없음; 정제 로그만 사용 |
| usage table이 정산 근거로 오용 | table comment에 settlement/accounting 금지 명시, wallet ledger와 FK/함수 분리 |
| duplicate retry가 이중 usage | `(owner_id,idempotency_key)` unique + conflict-ignore |
| SDK 내부 자동 retry | OpenAI/Anthropic `maxRetries:0`, Gemini `attempts:1` |
| 사용량 장애가 생성 장애로 확대 | insert/query 오류 격리; 생성은 계속, 카드만 오류 상태 |

모든 mitigation은 CONTEXT의 보안/UX 결정과 현재 service-role/RLS 패턴에서 도출했다. [VERIFIED: codebase]

## Don't Hand-Roll

- 새로운 암호화/Vault 계층을 만들지 말고 Phase 10의 `get_byok_secret`/Vault 패턴을 확장한다. [VERIFIED: codebase]
- 별도 provider HTTP client를 만들지 말고 설치된 공식 SDK와 기존 adapter를 재사용한다. [VERIFIED: codebase]
- 새 toast/대화 말풍선 시스템을 만들지 말고 기존 `AiPanelNotice`를 확장한다. [CITED: .planning/phases/11-byok-ux/11-CONTEXT.md]
- 새 차트/시간대 패키지를 설치하지 말고 단순 집계/상세 목록과 UTC range helper를 사용한다. [VERIFIED: codebase]
- usage를 wallet ledger에 끼워 넣거나 0 delta row를 만들지 않는다. [CITED: .planning/phases/11-byok-ux/11-CONTEXT.md]

## Open Questions for Planning

### 1. Anthropic user-defined spend limit 400

공식 문서는 400 `invalid_request_error`와 자연어 message만 설명하고, SDK가 안정적인 structured code를 보존한다는 근거는 확인되지 않았다. 계획은 fixture/live probe task를 포함하고, structured code가 없으면 raw message를 파싱하지 않고 generic invalid/config로 degrade하는 정책을 명시해야 한다. 이는 UI 4분류의 완전성에 남는 유일한 provider 계약 불확실성이다. [CITED: https://platform.claude.com/docs/en/api/rate-limits]

### 2. Post-provider write denial도 usage로 남길지

추천은 “남긴다”이다. provider가 성공/usage를 반환했다면 실제 소비가 발생했고 `ai_usage`는 정산이 아닌 사용 관측이기 때문이다. 이 ordering을 plan acceptance에 명시하면 D-12 해석 차이를 제거할 수 있다. [ASSUMED]

### 3. Regeneration의 `chapter_id`

현재 regeneration 함수 입력은 `workId`는 있지만 `chapterId`는 없다. UI/action이 이미 회차를 알고 있으면 전달·검증하고, 그렇지 않으면 nullable로 저장한다. Phase 11에서 억지로 잘못된 회차 참조를 추정하지 않는다. [VERIFIED: codebase]

## Environment Availability

| 항목 | 조사 결과 | 계획 영향 |
|---|---|---|
| Node.js | `v22.14.0` | 로컬 build/test 가능 |
| npm | `10.9.2` | 기존 dependency로 실행 가능 |
| 관련 unit tests | 6 files / 83 tests passed | Phase 11 baseline 존재 |
| `SUPABASE_DB_URL` | 현재 shell에 없음 | DB integration/migration proof는 실행 환경 준비 후 필수 |
| `OPENAI_API_KEY` | 현재 shell에 없음 | live OpenAI smoke 불가 |
| `ANTHROPIC_API_KEY` | 현재 shell에 없음 | live Anthropic smoke 불가 |
| `GEMINI_API_KEY` | 현재 shell에 없음 | live Gemini smoke 불가 |

환경변수는 존재 여부만 확인했으며 값은 읽거나 출력하지 않았다. [VERIFIED: codebase]

## Assumptions Log

| Assumption | 영향 | 검증 시점 |
|---|---|---|
| usage는 논리 전송 1건당 1행이다. | 동시 duplicate provider attempt를 별도 행으로 세지 않는다. | PLAN에서 unique acceptance 확정 |
| provider 성공 뒤 app write denial도 usage에 포함한다. | 실제 vendor 소비를 더 정확히 반영한다. | settle ordering test 작성 전 |
| JS 메모리의 plaintext key를 강제 wipe할 수 없으므로 요청 스코프 최소 수명이 최선이다. | secret cache/DTO/context 보관을 금지한다. | 구현 review |
| Anthropic 400 spend limit은 structured code가 없으면 완전 분류하지 않는다. | 일부 credit exhaustion이 generic invalid/config UX가 될 수 있다. | fixture/live probe |
| work/chapter hard delete 시 usage row는 유지하고 FK만 null 처리한다. | 장기 월간 합계를 보존한다. | migration plan/DB test |

## Sources

### Primary project sources

- [CITED: .planning/phases/11-byok-ux/11-CONTEXT.md] — locked scope/decisions/deferred.
- [CITED: .planning/phases/11-byok-ux/11-UI-SPEC.md] — exact copy, focus, accessibility, responsive contract.
- [CITED: .planning/REQUIREMENTS.md] — PROV-06, BYOK-05~09, COST-02.
- [CITED: .planning/ROADMAP.md] — Phase 11 goal/success criteria/notes.
- [CITED: .planning/phases/08-provider-adapter-idempotent-debit/08-04-SUMMARY.md] — idempotency/error boundary.
- [CITED: .planning/phases/09-openai-anthropic/09-05-SUMMARY.md] — provider adapters/catalog/pricing lifecycle.
- [CITED: .planning/phases/10-byok/10-06-SUMMARY.md] — Vault/key selection implementation and gaps.
- [VERIFIED: codebase] `lib/ai/**`, AI panel/settings components, migrations `0002`, `0014`, `0015`, relevant tests.

### Local framework/SDK sources

- [CITED: node_modules/next/dist/docs/01-app/02-guides/server-actions.md]
- [CITED: node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md]
- [CITED: node_modules/next/dist/docs/01-app/02-guides/data-security.md]
- [CITED: node_modules/openai/client.d.ts] — `maxRetries` default 2.
- [CITED: node_modules/openai/core/error.d.ts] — structured `status`, `error`, `code`.
- [CITED: node_modules/@anthropic-ai/sdk/client.d.ts] — `maxRetries` default 2.
- [CITED: node_modules/@anthropic-ai/sdk/core/error.d.ts] — structured `status`, `error`.
- [CITED: node_modules/@google/genai/dist/genai.d.ts] — `ApiError.status`.

### Official provider sources

- [CITED: https://developers.openai.com/api/docs/guides/error-codes]
- [CITED: https://github.com/openai/openai-node/blob/main/docs/configuration.md]
- [CITED: https://ai.google.dev/gemini-api/docs/api-errors]
- [CITED: https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash]
- [CITED: https://platform.claude.com/docs/en/api/errors]
- [CITED: https://platform.claude.com/docs/en/api/rate-limits]
- [CITED: https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-5]

## Metadata

**Research status:** Ready for planning, with Anthropic 400 spend-limit classification retained as an explicit validation spike.

**Recommended next step:** Create Phase 11 plans in the wave order above, keeping migration/provider classification before the common lifecycle and UI work.
