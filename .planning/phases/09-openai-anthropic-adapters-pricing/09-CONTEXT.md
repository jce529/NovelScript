# Phase 9: OpenAI · Anthropic 어댑터 + 제공자별 단가 - Context

**Gathered:** 2026-09-19
**Status:** Ready for planning

<domain>
## Phase Boundary

작가가 **플랫폼(서비스) 키로만** Gemini 외에 OpenAI·Anthropic 모델을 골라 본문 생성·어시스트를 받고, 결과가 기존 `[REPLY]/[DRAFT]/[DOCUMENT]` 초안·제안 UI로 똑같이 들어온다(PROV-02, PROV-03). 작가는 계정 설정에서 기본 제공자·모델을 지정하고 AI 패널 드롭다운에서 다른 모델로 전환할 수 있다(PROV-04). 드롭다운은 선택한 제공자·모델의 실제 단가를 보여준다 — Gemini 단가를 다른 제공자에 재사용하지 않는다(PROV-07).

같은 페이즈에서: 세 벤더의 사고·reasoning 설정을 끄거나 최소화하고, 사고 토큰을 출력 단가로 차감하는 규칙을 세 벤더 모두에 동일하게 적용한다.

범위 밖: BYOK 키 등록·검증·배지(Phase 10), BYOK 호출 경로·사용 기록·4종 실패 UX·보이는 폴백 일반 규칙(Phase 11), 429 자동 재시도(Phase 11), 작가가 사고 강도를 조절하는 UI(별도 페이즈 — Deferred 참조).

**선행 조건:** BUG-04(기존 Gemini 경로의 사고 토큰 차감 누락)는 Phase 9 착수 **전에** `/gsd:quick`으로 별도 수정한다(D-13). Phase 9는 그 수정이 들어간 `computeDebitAmount`를 전제로 새 벤더에 같은 규칙을 확장한다.

</domain>

<decisions>
## Implementation Decisions

### 모델 라인업 · 표기
- **D-01:** AI 패널 드롭다운은 **제공자별 그룹 + 실제 모델명**으로 표시한다(예: Google / OpenAI / Anthropic 그룹 아래 "Gemini 3.5 Flash", "GPT-5 mini" 식). 기존 `라이트/프로` 추상 티어 표기는 폐기한다. 2단(제공자→모델) 드롭다운은 쓰지 않는다 — 패널 폭(w-96) 때문에 컨트롤 하나로 유지.
- **D-02:** 제공자당 **2개 모델: 저가 1 + 고성능 1** (총 6개). 정확한 모델 ID는 리서치 시점에 각 벤더의 현행 GA 모델과 공식 단가로 확정한다(프리뷰·퇴역 예정 모델 지양).
- **D-03:** 서버에 서비스 키가 설정되지 않은 제공자(`OPENAI_API_KEY`/`ANTHROPIC_API_KEY`/`GEMINI_API_KEY` 없음)는 **목록에서 숨긴다** — 비활성·"준비 중" 표시 없음. 서버가 실제 호출 가능한 모델 목록을 내려주고, 클라이언트는 그것만 렌더링한다.
- **D-04:** Gemini 고성능 슬롯은 **실제 Pro 모델로 교체**한다(현재 `pro`도 `gemini-3.5-flash`). Google 프로젝트 결제 활성화는 외부 선행 조건 — STATE.md Blockers에 추적한다. 결제 미활성 상태에서 Pro가 404/429를 내는 경우의 처리(목록 제외 vs config 에러)는 플래너 재량이나, 작가가 고를 수 있는 모델이 호출 불가능한 상태로 남지 않게 한다.

### 비용 추정 표시 (PROV-07)
- **D-05:** 생성 전 "비용 추정"은 **모델별 단가만** 보여준다. 이번 호출의 예상 비용·범위는 예측하지 않는다(Phase 8에서 로컬 입력 추정을 제거한 결정 유지 — 표시용으로도 부활시키지 않는다).
- **D-06:** 단위는 **지갑 토큰만**. 원화 병기 없음(P4 D-12 "토큰 수만 표시"와 일치, 환율 상수가 아직 임시값).
- **D-07:** 형태는 **글자 수 기준, 입력·출력 둘 다**: 예) "출력 1,000자 ≈ N토큰 · 입력 1,000자 ≈ M토큰". 한국어 글자→LLM 토큰 비율은 **벤더별 실측 상수**로 구한다(리서치 Pitfall 6 — 벤더마다 토크나이저가 다름). 이 상수는 표시 전용이며 상한·차감 계산에 쓰지 않는다.
- **D-08:** 단가는 **드롭다운 항목에만** 표시한다. 선택 후 패널에 별도 줄을 두지 않는다.
- **D-09:** 단가는 사고 토큰을 끈/최소화한 기준(D-11)의 명목 단가다. 사고 토큰이 소량 발생해 실제 차감이 표시 단가보다 약간 클 수 있음은 허용한다.

### 기본값 · 호출별 전환 (PROV-04)
- **D-10a:** 기본 제공자·모델은 기존 **`/account` 계정 설정 페이지에 "AI 기본 모델" 섹션**을 추가해 지정한다(작가 계정 대상). 별도 설정 페이지를 신설하지 않는다 — Phase 10 BYOK 키 등록도 같은 계정 설정에 들어갈 자리. 저장 위치(예: `profiles` 컬럼 추가 마이그레이션)는 플래너 재량.
- **D-10b:** 패널에서 바꾼 모델은 **패널이 열려 있는 동안** 다음 전송에도 유지되고, 새로고침·다른 회차 이동 시 계정 기본값으로 돌아간다(현재 `modelTier` useState와 같은 수명). localStorage 기억 없음.
- **D-10c:** 계정 기본 모델을 쓸 수 없게 되면(서비스 키 제거, 모델 퇴역, D-04 결제 미활성 등) **시스템 기본 모델로 대체하고 패널에 한 줄 안내**한다(예: "기본 모델을 쓸 수 없어 ○○로 바꿨어요"). 조용한 대체 금지 — PROV-06 취지를 서비스 키 범위에서 선반영. 시스템 기본 모델은 저가 Gemini로 두는 것을 기본으로 하되 플래너 재량.
- **D-10d:** 서버는 클라이언트가 보낸 모델 ID를 **허용 목록(현재 호출 가능한 모델)으로 재검증**한다 — 숨겨진/퇴역 모델 ID로 직접 호출할 수 없어야 한다.

### 사고 토큰 · 과금
- **D-11:** 세 벤더 모두 본문 생성 호출에서 사고·reasoning을 **끌 수 있으면 끄고, 불가능하면 최소**로 설정한다(Gemini `thinkingConfig`, OpenAI reasoning effort, Anthropic extended thinking 미사용). 모델별로 실제 가능한 최솟값은 리서치가 공식 문서로 확인한다. 목적: 비용 절감 + 사고 토큰이 `maxOutputTokens`를 잠식해 본문이 잘리는 현상 제거(08-09 실측: 사고 ~245토큰, 3회 모두 `max_tokens` 종료).
- **D-12:** 그래도 발생한 사고·reasoning 토큰은 **출력 단가로 지갑 차감에 포함**한다(BUG-04 A안, Sudowrite·Novelcrafter처럼 실제 연산 비용을 전가). 세 벤더의 사고 토큰 필드를 공통 `UsageReport.thoughtsTokens`로 정규화한다. 거절(refusal) 차감 경로도 같은 합산을 쓴다. 차감 안내에는 **합계만** 표시하고 사고 토큰을 따로 노출하지 않는다.
- **D-13:** BUG-04(기존 Gemini 경로 차감 누락)는 **Phase 9 전에 `/gsd:quick`으로 먼저 수정**한다 — 범위는 `computeDebitAmount`의 사고 토큰 합산 + 거절 차감 경로 + 관련 테스트. Gemini 사고 설정 최소화(D-11)는 Phase 9에서 세 벤더와 함께 적용한다. Phase 9 플래너는 quick 수정이 이미 반영됐는지 확인하고 그 위에 확장한다.

### 이전 페이즈에서 이어받는 결정 (재논의 없음)
- 안전 거절은 **구조화된 제공자 신호만** 판별(P8 D-05). OpenAI·Anthropic의 대응 신호(예: 거절 필드, 거절 계열 finish/stop reason)를 리서치가 공식 문서로 확인해 `ProviderRefusal`로 정규화한다. 모델이 말로 거절하는 경우는 판별하지 않음.
- 거절 호출도 실사용량대로 차감(P8 D-06), 안내는 인라인 에러 자리(P8 D-07~09).
- 실패 문구 3종 `rate_limited | unavailable | config`(P8 D-10), 스크러빙 choke point — 새 어댑터도 raw SDK 에러를 절대 흘리지 않는다(P8 D-11~12).
- 멱등 키는 전송 1회당 1개, 원장 `reference_id` 파생(P8 D-01~04). 벤더가 Idempotency-Key 헤더를 지원하면 같은 값을 넘길지 리서치가 확인(research Gaps).
- 입력 토큰 로컬 추정 없음; 출력 상한은 잔액 전체 기준, 차감은 실사용량을 호출 전 잔액까지만(P8, 2026-09-18). 출력 상한은 **provider·model별 출력 단가**로 환산한다.
- 비스트리밍, 고정 base URL(PROV-02/03).

### Claude's Discretion
- `ProviderId` 확장, `ModelTier` 폐기/대체 방식, provider×model 레코드(ID·표시명·입출력 단가·최대 출력·글자당 토큰 상수)의 파일 위치와 모양.
- registry가 모델 ID로 어댑터를 고르는 방식, 벤더 SDK(`openai`, `@anthropic-ai/sdk`) 사용 여부와 버전(STACK.md 권고 참고).
- 드롭다운 그룹·단가 텍스트의 세부 레이아웃과 문구.
- 대화 중 모델을 바꿨을 때 history 전달 방식(기존 텍스트 history 그대로 전달 가능).
- 개발용 provider fixture(`lib/ai/providers/fixture.ts`)를 새 제공자로 확장하는 방식.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 페이즈 정의 · 요구사항
- `.planning/ROADMAP.md` §"Phase 9: OpenAI · Anthropic 어댑터 + 제공자별 단가" — 목표, 성공 기준 4개, Notes(플랫폼 키로만, `UsageReport` 정규화, 출력 상한은 provider별 출력 단가)
- `.planning/REQUIREMENTS.md` — PROV-02, PROV-03, PROV-04, PROV-07 (참고: PROV-05/06은 Phase 10/11)

### v1.1 리서치
- `.planning/research/SUMMARY.md` §"Phase 9" 및 §"Gaps to Address"(OpenAI Idempotency-Key 확인 항목)
- `.planning/research/STACK.md` — `openai`, `@anthropic-ai/sdk` 버전, 프로젝트 소유 인터페이스 뒤에 SDK를 두는 결정
- `.planning/research/ARCHITECTURE.md` — `lib/ai/providers/*` 배치, registry 구조
- `.planning/research/PITFALLS.md` — Pitfall 1(스크러빙), 4(원장 멱등 ≠ 벤더 멱등), 5(refusal은 200 응답), 6(벤더별 토크나이저·한국어 비율), 9(벤더 온보딩 리드타임)

### 이전 페이즈 결정 · 이슈
- `.planning/phases/08-provider-adapter-idempotent-debit/08-CONTEXT.md` — D-01~12(멱등 키, 거절, 실패 문구, 스크러빙)
- `.planning/phases/08-provider-adapter-idempotent-debit/08-UI-SPEC.md` — AI 패널 알림 슬롯·문구 계약
- `.planning/phases/08-provider-adapter-idempotent-debit/bugs/BUG-04-thinking-tokens-not-debited.md` — 사고 토큰 실측과 수정 방향(D-12/D-13의 근거)
- `.planning/phases/04-ai-gateway-mention-based-generation/04-CONTEXT.md` — D-06(모델 티어), D-12(토큰 수만 표시), D-13(잔액까지만 생성)

### 외부 참고 (사고 토큰 정책 근거)
- Sudowrite 크레딧 문서 — 모델·맥락·기능에 따라 차감, 고정 단어당 요율 없음
- Novelcrafter Thinking/Reasoning 문서 — 사고 기능 기본 꺼짐(실험 기능 opt-in), 강도↑ 시 크레딧↑

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/ai/providers/types.ts`: `ProviderClient`, `GenerateParams/Result`, `UsageReport{ thoughtsTokens }`, `ProviderRefusal`, `SanitizedProviderError` — 새 어댑터가 구현할 계약. `ProviderId = 'gemini'`만 있음 → 확장.
- `lib/ai/providers/gemini.ts`: 참고 구현(거절·사용량 정규화, 단일 시도).
- `lib/ai/providers/errors.ts`: `ProviderCallError` 스크러빙 — 새 벤더의 에러 코드 매핑 추가 지점(`PROVIDER_ERROR_CODES`는 현재 Gemini/gRPC 계열 이름).
- `lib/ai/providers/registry.ts` `createPlatformProvider`: Gemini 고정 → 모델별 제공자 선택 + 키 존재 확인(D-03)으로 확장.
- `lib/ai/providers/models.ts` `MODEL_TIER_TO_ID`: 두 티어가 같은 Flash — provider×model 레코드로 대체.
- `lib/ai/cost.ts`: `GEMINI_PRICING_USD_PER_MILLION`(ModelTier 키), `computeMaxOutputTokens`, `computeDebitAmount` — 단가표를 provider×model로 일반화, 환율 상수(`KRW_PER_WALLET_TOKEN`, `USD_TO_KRW`)는 그대로 유일한 튜닝 지점.
- `lib/ai/providers/fixture.ts`: 개발 전용 canned provider.

### Established Patterns
- `ownerId`는 세션에서만, 지갑 쓰기는 service-role admin 클라이언트.
- 결과 모양 `ChatResult`를 AiPanel이 소비; 알림은 `AiPanelNotice` 슬롯.
- 클라이언트 컴포넌트는 `lib/ai/providers/types.ts`에서 type-import만(서버 전용 모듈은 `server-only`).

### Integration Points
- `app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanel.tsx:90,260` — `modelTier` 상태와 라이트/프로 Select → 제공자 그룹 드롭다운 + 단가 표기, 초기값은 계정 기본값.
- `app/studio/[workId]/chapters/[chapterId]/actions.ts` `chatAction` — 모델 ID 수신·허용 목록 재검증(D-10d).
- `lib/ai/chat.ts` — modelTier 기반 상한·차감 호출부를 모델 레코드 기반으로.
- `app/account/page.tsx` + `app/account/actions.ts` — "AI 기본 모델" 섹션 추가.

</code_context>

<specifics>
## Specific Ideas

- 드롭다운 항목 예: `Gemini 3.5 Flash   출력 1,000자 ≈ N토큰 · 입력 1,000자 ≈ M토큰`
- 대체 안내 예: "기본 모델을 쓸 수 없어 Gemini 3.5 Flash로 바꿨어요."
- 실제 서비스 비교(2026-09-19 조사): Sudowrite는 모델별 비용 차이를 그대로 전가(같은 분량에 100배 이상 차이), Novelcrafter는 사고 기능을 opt-in 베타로 두고 강도에 따라 비용 증가. 이번 페이즈는 "사고 끔/최소 + 발생분은 실비 차감"으로 간다.
- 리서치 확인 항목: 각 벤더의 사고 끔/최소 설정 가능 범위, usage 필드명(사고 토큰 포함), refusal 신호, 에러 바디·상태 코드 → `rate_limited|unavailable|config` 매핑, 한국어 글자당 토큰 실측.

</specifics>

<deferred>
## Deferred Ideas

- **작가가 사고 강도를 슬라이더로 조절하는 기능** — 별도 페이즈에서 제작(사용자 결정 2026-09-19). Novelcrafter식 강도 조절, 강도에 따른 비용 표시 포함. 이번 페이즈는 끔/최소 고정.
- 용도별 자동 사고 설정(본문 생성은 끔, 설정 질문·브레인스토밍은 켬) — 호출 전 용도 판별이 필요해 보류.
- 이번 호출 예상 비용·범위 표시 — 입력 추정을 다시 들여야 해서 보류(D-05).
- 원화 병기 — 환율 상수 확정(Phase 5) 이후 재검토.
- 한국 소설 창작 관점 모델 힌트(PROV-08) — v2, 실사용 데이터 확보 후.

</deferred>

---

*Phase: 09-openai-anthropic-adapters-pricing*
*Context gathered: 2026-09-19*
