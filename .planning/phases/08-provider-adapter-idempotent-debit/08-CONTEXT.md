# Phase 8: 프로바이더 어댑터 기반 · 멱등 차감 수정 - Context

**Gathered:** 2026-09-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Gemini 생성 경로(`lib/ai/chat.ts` → `lib/ai/gemini.ts`)를 공통 `ProviderClient` 어댑터 인터페이스 뒤로 이관한다. 정상 경로에서 작가가 체감하는 동작은 달라지지 않아야 한다(PROV-01). 같은 페이즈에서:
- 매 호출 `crypto.randomUUID()`를 `p_reference_id`로 넘겨 원장 중복 방지를 무력화하던 이중 차감 버그를 고친다(COST-01).
- 사전 비용 상한 계산을 원격 `countTokens` 없이 로컬 추정으로 전환한다.
- 제공자의 구조화된 안전 거절 신호를 정규화해 한국어 안내로 보여준다.
- 에러 스크러빙 choke point를 어댑터 인터페이스와 함께 출하한다.

범위 밖: OpenAI/Anthropic 어댑터·제공자별 단가(Phase 9), BYOK(Phase 10~11), 429 자동 재시도 로직(Phase 11 — 멱등 수정이 선행 조건일 뿐 이번에 추가하지 않음), 사용 기록 테이블(COST-02, Phase 11), 스키마 변경.

</domain>

<decisions>
## Implementation Decisions

### 같은 호출 판정 (멱등 차감)
- **D-01:** 멱등 키는 **작가의 전송 1회당 1개**. AI 패널이 전송 시점에 클라이언트에서 UUID를 생성해 `chatAction`에 `idempotencyKey`로 넘기고, 같은 전송의 재전송(더블클릭·네트워크 재시도)은 같은 키를 재사용한다. 커머스의 `idempotencyKey: z.string().uuid()` 패턴(`lib/commerce/actions.ts`)을 따른다. 서버는 키 형식을 검증한다.
- **D-02:** 이 키에서 원장 `reference_id`를 파생한다(`reference_type = 'ai_generation'`). 서버에서 요청마다 새 UUID를 만들지 않는다.
- **D-03:** **이미 차감이 기록된 키로 요청이 오면 제공자 호출 전에 차단**한다 — 제공자를 다시 부르지 않아 플랫폼이 이중 원가를 내지 않는다. 작가에게는 "이미 처리된 요청"이라는 안내와 현재 잔액을 돌려준다. 이전 응답 본문은 복구하지 않는다(스키마 변경 없음 원칙 — 응답 저장소를 만들지 않음).
- **D-04:** 제공자 호출이 실패해 차감이 기록되지 않은 키는 같은 키로 다시 보낼 수 있다(원장 행이 없으므로 자연스럽게 허용).

### 안전 거절 (refusal)
- **D-05:** "안전 거절"은 **제공자가 구조화된 신호를 준 경우만** 뜻한다. Gemini 기준:
  - (A) 입력 차단 — 후보 없이 `promptFeedback.blockReason` 존재
  - (B) 생성 중 차단 — `finishReason` ∈ {`SAFETY`, `PROHIBITED_CONTENT`, `BLOCKLIST`, `SPII`, `RECITATION` 등 안전·정책 계열}
  - (C) 모델이 정상 완료(`STOP`)하며 문장으로 거절하는 경우는 판별하지 않는다 — 일반 답변으로 렌더링·과금(텍스트 패턴 추측 금지, 오탐 위험).
  - 어댑터는 이 신호를 **정규화된 필드**(예: `refusal: { reason } | null` 또는 정규화 finishReason)로 반환하고, `chat.ts`는 `parseChatResponse`의 raw-text 폴백 **이전에** 검사한다.
- **D-06:** 거절된 호출도 **제공자가 보고한 실사용량대로 차감**한다(A·B 모두). 입력만 과금되면 입력만, 출력이 일부 생성됐으면 그만큼. 차감도 D-01의 멱등 키를 그대로 사용한다.
- **D-07:** 거절 안내는 **기존 인라인 에러 자리**(`ok: false` 형태의 결과)에 표시한다 — 새 말풍선 타입을 만들지 않는다. 초안(`draft`)·문서 제안(`proposal`)은 만들지 않는다.
- **D-08:** 안내 문구에 **사용 토큰 수와 갱신된 잔액**을 함께 보여준다. 예: "이 요청은 안전 정책에 따라 답할 수 없어요. 표현을 바꿔 다시 시도해보세요. (12토큰 사용)". 결과에 `remainingBalance`를 실어 지갑 표시도 갱신한다.
- **D-09:** 접기(토글) 영역에는 **거절 사유만** 보여준다 — 제공자 사유 코드(예: `SAFETY`, `RECITATION`)와 짧은 한국어 설명. 차단 전까지 생성된 잘린 글이나 제공자 원문 텍스트는 **노출하지 않는다**.

### 실패 시 작가 안내 · 로그
- **D-10:** 제공자 호출 실패(차감 없음) 문구를 **원인별 2~3가지**로 나눈다:
  - 사용량 초과(429): "지금 요청이 몰려 있어요. 1분 뒤 다시 시도해주세요."
  - 일시 장애(5xx·타임아웃·네트워크): "AI 응답을 받지 못했어요. 잠시 후 다시 시도해주세요." (기존 문구 유지)
  - 설정 오류(인증·모델 없음 등 4xx): "AI 기능에 문제가 생겼어요. 계속되면 문의해주세요."
  - 이 분류는 어댑터가 정규화한 에러 종류(예: `rate_limited | unavailable | config`)에서 나오고, Phase 11 BYOK 실패 UX가 그대로 확장한다. 정확한 문구는 Claude 재량으로 다듬어도 됨.
- **D-11:** 에러 스크러빙 choke point를 어댑터 경계에 둔다 — 제공자 SDK의 raw error 객체는 절대 로그·반환값으로 흘리지 않고 `{ provider, status, kind, providerErrorCode }` 모양으로 새로 구성한다.
- **D-12:** 서버 로그는 **정제된 요약만** `console.error`로 남긴다: `{ provider, status, kind, idempotencyKey }` 수준. API 키·헤더·요청 config·프롬프트/본문 텍스트는 남기지 않는다(지금은 catch에서 아무것도 안 남김 → 이번에 추가).

### Claude's Discretion
- **로컬 토큰 추정 방식(논의 안 함):** 문자 수 기반 휴리스틱과 계수, 넉넉하게(과대) 잡을지 실측에 가깝게 잡을지. 제약: 사후 차감은 여전히 실사용량 기준이며, `apply_wallet_delta`는 잔액이 음수가 되면 예외를 던지므로 과소 추정으로 차감이 실패하는 경우의 처리(특히 D-06 거절 차감 포함)를 플래너가 설계해야 한다. 추정 상수는 제공자별 명명 상수로 분리할 수 있는 구조로 둔다(Phase 9 대비, 리서치 Pitfall 6). 작가에게 보이는 예상 토큰 수가 약간 달라지는 것은 허용.
- 동시에 도착한 같은 키 요청 두 개(둘 다 사전 확인을 통과하는 경합)의 처리 방식 — 원장 unique 제약이 최후 방어선이므로 최소한 이중 차감은 없어야 한다.
- D-03의 "이미 처리된 키" 사전 확인 구현(원장 조회 등, 스키마 변경 없이).
- `ProviderClient` 인터페이스의 정확한 모양, `lib/ai/providers/` 파일 구성, `ModelTier` → 모델 ID 매핑 위치.
- 거절·에러 문구 최종 워딩과 접기 토글의 UI 세부.
- 거절이 AiPanel 대화 기록(history)에 어떻게 남는지(기존 에러 처리 흐름을 따름).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 페이즈 정의 · 요구사항
- `.planning/ROADMAP.md` §"Phase 8: 프로바이더 어댑터 기반 · 멱등 차감 수정" — 목표, 성공 기준 4개, Notes(스키마 변경 없음, 스크러빙 동시 출하, 외부 신청 병행)
- `.planning/REQUIREMENTS.md` — PROV-01, COST-01, 그리고 "로컬 토큰 추정이 숨은 선행 조건 / 멱등 차감이 재시도보다 먼저" 노트

### v1.1 리서치
- `.planning/research/SUMMARY.md` §"Phase 8" — Delivers 목록(providers/ types·registry·gemini, estimateInputTokens, 정규화 refusal/finishReason, 스크러빙, chatAction idempotencyKey)
- `.planning/research/PITFALLS.md` — Pitfall 1(키 유출·스크러빙), 4(원장 멱등 ≠ 벤더 멱등), 5(refusal은 200 응답), 6(제공자별 토크나이저 차이)
- `.planning/research/ARCHITECTURE.md` — `lib/ai/providers/*` 배치와 `ProviderClient`/registry 구조
- `.planning/research/STACK.md` — vendor SDK를 프로젝트 소유 인터페이스 뒤에 두는 결정(Vercel AI SDK 미채택)

### 이전 페이즈 결정
- `.planning/phases/04-ai-gateway-mention-based-generation/04-CONTEXT.md` — D-06(모델 티어), D-12(토큰 수만 표시), D-13(잔액까지만 생성하는 상한), D-14(기본 시스템 프롬프트)
- `.planning/phases/07-admin-moderation-surface/07-CONTEXT.md` — D-07(생성 전·차감 직전 이중 쓰기 권한 확인; `lib/ai/chat.ts` 주석에 반영됨)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/ai/gemini.ts` `GeminiClient` + `createMockGeminiClient()`: 이미 DI 가능한 클라이언트 인터페이스 — `ProviderClient`로 일반화하는 출발점. 테스트는 mock 팩토리를 계속 사용.
- `lib/ai/cost.ts` `computeMaxOutputTokens` / `computeDebitAmount`: 상한·차감 계산. 입력 토큰 수를 원격 `countTokens` 대신 로컬 추정으로 받도록 호출부만 바뀐다.
- `lib/ai/chat.ts` `parseChatResponse`: `[REPLY]/[DRAFT]/[DOCUMENT]` 파싱 — 동작 유지, refusal 검사가 그 앞에 들어간다.
- `lib/commerce/actions.ts`: `idempotencyKey: z.string().uuid()` 검증 패턴 — D-01에 복제.
- `supabase/migrations/0001_init.sql` `apply_wallet_delta`: `on conflict (wallet_id, reference_type, reference_id) do nothing` 후 현재 잔액 반환. 음수 잔액이면 `insufficient balance` 예외.

### Established Patterns
- 지갑 읽기/쓰기는 service-role admin 클라이언트, `ownerId`는 반드시 세션에서(클라이언트 입력 금지).
- 제공자 예외는 차감 전에 잡아 친근한 인라인 에러로 반환 — 실패한 호출은 과금하지 않음.
- 결과 모양 `ChatResult { ok, error, reply, draft, proposal, wasCapped, remainingBalance, code }` — AiPanel이 소비. 거절 안내(D-07/D-08)는 이 모양 안에서 표현(필드 추가는 가능).

### Integration Points
- `app/studio/[workId]/chapters/[chapterId]/actions.ts` `chatAction` / `getGeminiClientOrError` — idempotencyKey 수신, 클라이언트 생성이 registry 경유로 바뀜.
- `app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanel.tsx` — 전송 시 키 생성·재전송 시 재사용, 거절 안내 + 사유 접기 토글, 원인별 에러 문구 표시.
- `lib/ai/chat.ts:150` — `p_reference_id: crypto.randomUUID()` 제거 지점.

</code_context>

<specifics>
## Specific Ideas

- 거절 안내 예시 문구: "이 요청은 안전 정책에 따라 답할 수 없어요. 표현을 바꿔 다시 시도해보세요. (12토큰 사용)"
- 성공 기준 4("영어 거절문이 창작 결과물처럼 렌더링되지 않음")는 **구조화된 신호가 있는 거절(A·B)** 에 대해 보장한다. 모델이 정상 완료하며 말로 거절하는 경우(C)는 이번 범위에서 판별하지 않음 — 검증 시 이 구분을 기준으로 한다.
- 리서치 단계 확인 항목: Gemini가 차단된 요청(A·B)에 대해 `usageMetadata`를 어떻게 보고하는지(입력 토큰 과금 여부), `@google/genai`에서 `promptFeedback.blockReason`과 안전 계열 `finishReason` 값의 정확한 목록.

</specifics>

<deferred>
## Deferred Ideas

- 모델이 문장으로 거절하는 경우(C)의 휴리스틱 감지 — 오탐 위험 때문에 보류. 필요성이 확인되면 별도 작업.
- 중복 요청에 이전 응답 본문을 그대로 돌려주는 방식 — 응답 저장소(스키마 변경)가 필요해 보류.
- 429/일시 장애 자동 재시도 — Phase 11(BYOK 호출 경로)에서, 바이트 도착 전 실패로 한정.
- OpenAI Organization Verification / Anthropic 빌링·tier 신청 — 엔지니어링 범위는 아니지만 Phase 8 킥오프와 병행 착수(STATE.md Blockers 추적).

</deferred>

---

*Phase: 08-provider-adapter-idempotent-debit*
*Context gathered: 2026-09-17*
