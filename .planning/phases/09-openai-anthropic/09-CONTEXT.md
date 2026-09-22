# Phase 9: OpenAI · Anthropic 어댑터 + 제공자별 단가 - Context

**Gathered:** 2026-09-22
**Status:** Ready for planning

<domain>
## Phase Boundary

작가가 플랫폼(서비스) 키로 Gemini 외 OpenAI·Anthropic 모델을 실제로 골라 집필할 수 있고, 무엇을 고르든 그 모델의 진짜 단가로 계산된 비용을 생성 전에 본다. Phase 8이 이관한 `ProviderClient` 어댑터 인터페이스 뒤에 OpenAI/Anthropic 어댑터를 추가하고, 플랫폼 키로만 동작을 증명한다.

범위 밖: BYOK(Phase 10~11), MCP(Phase 12~14), 구독제/정기결제 인프라(별도 백로그 — 이번 논의에서 제안됐으나 마일스톤 범위 밖으로 확인).

</domain>

<decisions>
## Implementation Decisions

### 모델 카탈로그
- **D-01:** 고정 tier(lite/pro) 유니언 타입 개념을 버린다. `lib/ai/providers/types.ts`의 `ModelTier`처럼 제공자 전체에 공통 2단계를 강제하지 않고, **제공자별로 운영이 실제로 활성화한 모델을 개수 제한 없이 목록**으로 관리하는 구조로 전환한다 — 예: Anthropic은 3개(Haiku/Sonnet/Opus), 다른 제공자는 2개나 1개일 수 있음.
- **D-02:** 모델 피커 UI에는 "라이트/프로" 같은 tier 라벨이 아니라 **실제 모델명**을 직접 노출한다(예: "Gemini 3.5 Flash", "GPT-4o mini", "Claude Sonnet 4.5").
- **D-03:** 구체적으로 어떤 모델(들)을 각 제공자에서 노출할지(정확한 모델 ID·개수)는 **리서치 단계에서 결정**한다 — OpenAI/Anthropic의 현재 GA 모델 현황을 리서치 시점에 재확인.

### 기본 제공자·모델 설정 UX
- **D-04:** 계정 기본 제공자·모델 지정 UI는 새 페이지 **`/studio/settings/ai-providers`**에 둔다. Phase 10의 BYOK 키 관리 섹션이 같은 페이지에 합류할 예정이므로 이 페이즈에서 그 확장을 염두에 두고 레이아웃을 잡는다.
- **D-05:** AI 패널 드롭다운에서 이번 호출만 다른 제공자·모델로 전환하면 **그 전송에만 적용**된다 — 다음 메시지는 계정 기본값으로 돌아간다(PROV-04 문구 그대로). 세션 동안 유지되는 방식은 채택하지 않는다.

### 제공자별 단가·비용 표시
- **D-06:** 단가 테이블은 **제공자별 파일로 분리**한다(예: `lib/ai/providers/openai/cost.ts`, `lib/ai/providers/anthropic/cost.ts`) — 공통 인터페이스로 묶어 `lib/ai/cost.ts`의 기존 `computeMaxOutputTokens`/`computeDebitAmount` 계열 함수가 제공자별 단가 소스를 받아 쓰도록 확장한다.
- **D-07:** 작가에게 보여주는 비용 추정치 단위는 기존과 동일하게 **지갑 토큰(원)**으로 통일한다 — 제공자별 실제 USD/KRW 단가는 내부 환산에만 쓰고 UI 단위를 벤더별로 바꾸지 않는다(PROV-07: Gemini 단가를 다른 제공자에 재사용하지 않는다는 요건은 내부 계산에서 지킨다).

### 거절(refusal)·에러 문구
- **D-08:** Phase 8에서 정한 한국어 거절 안내 문구와 원인별 에러 분류(08-CONTEXT.md D-07~D-10)를 **3개 벤더 공통으로 그대로 재사용**한다. 벤더별로 다른 문구를 만들지 않는다. 내부적으로만 OpenAI `finish_reason`/Anthropic `stop_reason`을 Phase 8이 정의한 공통 `refusal` 신호(`ProviderRefusal`)로 정규화한다(Pitfall 5 대응 — 구조화된 신호 없는 문장형 거절은 이번 범위에서도 판별하지 않음, 08-CONTEXT.md D-05(C) 유지).

### Claude's Discretion
- 제공자별 모델 목록의 저장 형태(코드 상수 배열 vs 구조화된 config) — 스키마 변경 없음 원칙 안에서 플래너가 결정.
- 리서치 단계에서 확정되는 정확한 모델 ID·개수·단가 수치.
- 드롭다운의 "· N개" 표시 등 세부 UI 카피와 레이아웃.
- provider별 `finishReason`/`stop_reason` 필드명 매핑의 정확한 구현 위치.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 페이즈 정의 · 요구사항
- `.planning/ROADMAP.md` §"Phase 9: OpenAI · Anthropic 어댑터 + 제공자별 단가" — 목표, 성공 기준 4개, Notes(플랫폼 키로만 증명, UsageReport 정규화, 로컬 토큰 추정 provider별 분리 — 단 08-CONTEXT.md 결정으로 로컬 추정 자체가 제거됨)
- `.planning/REQUIREMENTS.md` — PROV-02, PROV-03, PROV-04, PROV-07, 그리고 매핑 표(PROV-05→Phase 10, PROV-06→Phase 11)

### v1.1 리서치
- `.planning/research/SUMMARY.md` §"Phase 9" — Delivers 목록(`providers/openai.ts`, `providers/anthropic.ts`, `UsageReport` 정규화, provider×model 가격·컨텍스트·최대출력 레코드, provider별 토큰 추정 보정), Uses(`openai@7.x`, `@anthropic-ai/sdk@0.125.x`, `js-tiktoken`), Avoids(Pitfall 4, 6)
- `.planning/research/PITFALLS.md` — Pitfall 4(벤더 측 이중 과금은 원장 멱등과 별개 문제), Pitfall 6(제공자별·한국어별 토큰 추정 편차), Pitfall 5(refusal은 200 응답으로 옴), "Looks Done But Isn't" 체크리스트의 "Multi-provider chat generation" 항목
- `.planning/research/ARCHITECTURE.md` — `lib/ai/providers/*` 배치와 `ProviderClient`/registry 구조
- `.planning/research/STACK.md` — vendor SDK를 프로젝트 소유 인터페이스 뒤에 두는 결정

### 이전 페이즈 결정
- `.planning/phases/08-provider-adapter-idempotent-debit/08-CONTEXT.md` — D-01~D-04(멱등 키), D-05~D-09(거절 정규화·문구), D-10~D-12(에러 분류·스크러빙) — 이번 페이즈는 이 결정들을 3벤더로 확장할 뿐 재정의하지 않는다.
- `.planning/phases/04-ai-gateway-mention-based-generation/04-CONTEXT.md` — D-13(잔액까지만 생성하는 상한)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/ai/providers/types.ts` `ProviderClient`, `GenerateParams`, `GenerateResult`, `UsageReport`, `ProviderRefusal` — Phase 8이 이미 벤더 중립 계약으로 설계해둠. OpenAI/Anthropic 어댑터는 이 인터페이스를 구현하기만 하면 됨.
- `lib/ai/providers/registry.ts` `createPlatformProvider()` — 현재 Gemini 하드코딩(주석에 "Phase 9 adds OpenAI/Anthropic" 명시). 선택된 provider·model에 따라 분기하도록 확장 지점.
- `lib/ai/providers/models.ts` `MODEL_TIER_TO_ID` — 현재 Gemini `ModelTier`→모델ID 매핑 하나뿐. D-01에 따라 이 구조 자체가 provider별 모델 목록 구조로 대체됨.
- `lib/ai/cost.ts` `GEMINI_PRICING_USD_PER_MILLION`, `walletTokensPerGeminiToken`, `computeMaxOutputTokens`, `computeDebitAmount` — Gemini 전용 상수·함수명. D-06에 따라 provider별 파일로 분리하며 함수 시그니처도 provider 인자를 받도록 일반화 필요.
- `lib/ai/providers/errors.ts` `ProviderCallError`, `SanitizedProviderError` — Phase 8의 에러 스크러빙 choke point. 3벤더 공통으로 그대로 재사용(D-08).

### Established Patterns
- 벤더 SDK의 raw error는 절대 로그·반환값에 흘리지 않고 어댑터 경계에서 스크러빙(Phase 8 D-11/D-12) — OpenAI/Anthropic 어댑터도 동일 choke point를 통과해야 함.
- 거절 판정은 구조화된 신호(입력 차단/생성 중 차단)만 인정, 문장형 거절은 판별하지 않음(Phase 8 D-05) — 3벤더 모두 이 기준 유지.

### Integration Points
- `app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanel.tsx` — 현재 `Select`로 `modelTier`('lite'/'pro') 하나만 고름(line 260-267). D-01/D-02에 따라 제공자·모델 목록을 그룹핑해 보여주는 드롭다운으로 교체.
- 신규: `/studio/settings/ai-providers` 페이지(D-04) — 계정 기본 제공자·모델 저장. Phase 10에서 BYOK 섹션이 합류.

</code_context>

<specifics>
## Specific Ideas

- 모델 피커 목업(Artifact): 제공자 헤더에 "GEMINI · 2개" 식으로 실제 보유 모델 수를 표시하고, 그 아래 모델명 + 간단한 설명("빠르고 저렴 · 약 N토큰/100자") + "서비스 키" 배지를 나열하는 형태로 확인함. 하단에 "이번 전송에만 적용돼요" 안내문.
- 계정 기본값은 드롭다운과 별도로 "계정 기본값 (설정에서 변경)" 박스로 참고 표시.

</specifics>

<deferred>
## Deferred Ideas

- **구독제(월정액) 재해석** — 사용자가 논의 중 "Lite=무제한 읽기 전용 구독, Pro=무제한 읽기+AI 토큰 대납(플랫폼이 Gemini/Claude/GPT 비용을 대신 냄)" 아이디어를 제시함. 이는 PROJECT.md에 이미 "Out of Scope"로 명시된 구독제(정기결제 인프라 없음, v1 핵심 루프 검증 이후 별도 마일스톤 후보)와 겹치는 훨씬 큰 기능이며, 독자용 무제한 열람 게이팅·정기결제·구독 상태 관리가 전부 필요함. Phase 9의 "호출당 모델 선택 + 지갑 토큰 경제" 범위와 무관. 사용자 확인 후 백로그로 이관, Phase 9는 원래 범위 유지하기로 결정(2026-09-22).

</deferred>

---

*Phase: 09-openai-anthropic*
*Context gathered: 2026-09-22*
