# Phase 15: Jev 선계획 기반 AI 문서 생성 · 저장 위치 선택 - Research

**Researched:** 2026-09-23
**Domain:** 외부 결정 모델(TypeSafe AI "Jev") 온보딩 + 기존 Gemini 생성 파이프라인 재설계 + KB 저장 위치 검증
**Confidence:** MEDIUM (벤더 온보딩 세부는 LOW — 아래 참고)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** "Jev"는 내부 코드네임이 아니라 TypeSafe AI가 2026-09-15에 공개한 실제 결정 모델(System 1 — 상태+타입 후보를 주면 확률·확신도가 붙은 타입 결정을 70~500ms에 반환)이다.
- **D-02:** 이 페이즈는 실제 Jev(TypeSafe AI)를 신규 벤더로 온보딩해서 쓴다. Gemini로 흉내 내는 대체안은 채택하지 않는다.
- **D-03:** Jev는 신생 벤더(출시 1주일 이내)이므로 키 발급·계약·SLA·API 안정성이 검증되지 않은 상태로 시작한다. research-phase에서 API 문서·요금제·Vercel AI Gateway 경유 가능 여부·데이터 처리 정책을 확인해야 한다.
- **D-04:** Gemini는 기존과 동일하게 최종 문서 생성(제목·본문)을 담당한다. 역할 분리(Jev=결정, Gemini=생성)는 변경하지 않는다.
- **D-05:** BUG-01의 5단계 도입 경로(오프라인 평가 → 그림자 계획 → 템플릿 생성 비교 → 추천 활성화 → 운영 관측) 전체를 이 페이즈 안에서 구축한다.
- **D-06:** 오프라인 평가(정답셋 100~300건, 후보 순서 교란 평가)와 그림자 계획(기록만, 미적용)을 반드시 거친 뒤에만 Jev 추천을 실제 Gemini 프롬프트에 반영한다.
- **D-07:** 계획 수락률·폴더/템플릿 변경률·clarify 비율·폴백률·P50/P95 지연시간·호출당 비용·재생성률에 대한 운영 관측을 이 페이즈 산출물에 포함한다.
- **D-08:** 데이터 처리 정책 검토 전에는 실제 작품 본문을 프로덕션 Jev 호출에 보낼 수 없다. 개발·오프라인 평가·그림자 계획은 전부 목업(합성) 데이터로만 진행한다.
- **D-09:** 데이터 처리 정책 검토 완료 전까지 실사용자 트래픽에 대한 Jev 실운영(추천 활성화)을 비활성화 상태로 둔다. 코드·UI·평가 파이프라인은 이 페이즈 안에서 전부 완성하되, 활성화 스위치는 검토 완료 후로 미룰 수 있다 — 검토 완료 자체를 페이즈 완료 조건으로 강제하지 않는다(Phase 5 Toss 심사와 같은 외부 대기열 취급).
- **D-10:** 검토 주체와 검토 완료 여부는 STATE.md Blockers에 추적한다. 계획 단계에서 검토 요청을 누가 언제 시작할지 명시한다.
- **D-11:** 추천 저장 위치·템플릿 확인 UI는 "문서로 저장하기" 클릭 시 뜨는 별도 확인 모달(저장 직전 단계)로 구현한다. 인라인 카드에 붙이지 않는다.
- **D-12:** @멘션 빠른 추가의 폴더 선택기는 Jev를 거치지 않고 QuickAddDialog 안에 카테고리별 실제 폴더 선택 UI로 직접 넣는다(모달 분리 없음). 기본값은 해당 카테고리 최상위 폴더.

### Claude's Discretion

- 확신도 임계값의 구체적 수치는 오프라인 평가 데이터로 결정하고 설정값으로 관리한다.
- 저장 직전 확인 모달의 정확한 레이아웃·카피는 UI-SPEC 단계(`/gsd:ui-phase 15`)에서 구체화한다.
- Jev 호출 실패·타임아웃 시 폴백 동작(최상위 폴더/기본 템플릿 추천)은 BUG-01 문서의 규칙을 그대로 따른다.

### Deferred Ideas (OUT OF SCOPE)

- 확신도 임계값 조정을 위한 관리자 설정 화면 — 이번 페이즈는 config 값으로만 관리.
- Jev를 다른 결정 계층(신고 우선순위, 추천 랭킹 등)에 재사용하는 것 — 이번 페이즈는 AI 문서 생성 흐름에만 한정.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AIDOC-01 | 문서 생성 전 Jev가 제한된 후보 안에서 작업 종류·카테고리·폴더·템플릿을 계획, 확신도 낮으면 clarify | Jev API 계약(Choice primitive), BUG-01 §Jev 입력 계약, 확신도 임계값을 config로 관리하는 기존 프로젝트 패턴(예: 09-CONTEXT 확신도류 설정) |
| AIDOC-02 | Gemini가 선택된 템플릿의 제목·필수 섹션·순서를 유지해 생성, 사용자가 결과·추천 위치·템플릿을 확인·변경 | 기존 `listTemplateOptions`/`createNode`의 `templateOverrideContent`, BUG-01 §Gemini 생성 계약, D-11 저장 확인 모달 |
| AIDOC-03 | 저장 시 서버가 targetFolderId·템플릿을 소유권·작품·범위·카테고리·삭제 상태로 재검증, 위치 무효 시 조용히 대체 저장 금지 | 기존 Server Action 소유권 검증 패턴(`checkWriteAccess`, Phase 2/7 authorize-before-validate), `resolveCategoryFolderId` 버그의 원인·해결 설계 |
| AIDOC-04 | Jev 추천은 오프라인 평가·그림자 계획을 거친 뒤에만 활성화, 데이터 정책 검토 전에는 프로덕션에 실제 본문 미전송 | TypeSafe AI 공식 프라이버시 정책(아래 확인됨), D-08/D-09/D-10 |

</phase_requirements>

## Summary

Jev는 실존하는 신생 벤더로 확인되었다. TypeSafe AI(전 OpenAI 연구원 Diogo/Diego Almeida 창업)가 2026-09-15에 "System One Models"라는 새 모델 클래스의 첫 제품 Jev를 공개했고, $40M 시드(DCVC 주도)를 함께 발표했다. Jev는 텍스트를 생성하지 않고 사전 정의된 스키마(Choice/Score/Noul 세 가지 primitive)에 대해 확률·확신도가 붙은 타입 결정을 70~500ms, 병렬 1회 호출로 반환한다. 이는 BUG-01 설계 문서가 요구하는 "후보 중 선택 + 확률" 계약과 정확히 일치한다.

공식 HTTP API는 `POST https://api.typesafe.ai/v1/systemone` (모델 라우트 `jev-latest`)로 2026-09-21부터 열려 있고, 공식 Python/JS SDK가 있다고 보도됨. 가격은 입력 $0.042/MTok, 출력 무료. Vercel AI Gateway에도 `typesafe-ai/jev`로 이미 통합되어 출시 며칠 만에 AI Gateway 역사상 가장 빠르게 채택된 모델이 되었다고 보도됨(같은 무료 출력·$0.042 입력 가격, 마크업 없음). TypeSafe AI 공식 프라이버시 정책 페이지에서 "Input을 모델 학습에 쓰지 않으며 서비스 제공자 외 제3자에 공개하지 않는다", "데이터는 미국에서 저장·처리된다", "요청 시 삭제한다"는 문구를 확인했다 — AIDOC-04/D-08/D-09가 요구하는 데이터 정책 검토의 1차 입력으로 쓸 수 있다.

**다만 핵심 불확실성이 남는다.** 이 조사에서 실제로 열람한 1차 소스는 (a) TypeSafe AI 자사 블로그 1건(`typesafe.ai/blog/introducing-system-one-models-and-jev`, WebFetch로 일부만 확인 — 인증 방식·정식 스키마·rate limit·SLA는 이 글에 없었고 "Docs는 docs.typesafe.ai를 보라"는 안내만 있었음)과 (b) 같은 도메인의 프라이버시 정책 페이지, (c) Vercel 공식 changelog/모델 카드(WebSearch 요약, 미검증 원문)뿐이다. `docs.typesafe.ai`(API 레퍼런스), 인증 헤더 형식, rate limit 수치, SLA 문서, 신규 벤더 계약·결제 절차는 이번 조사에서 직접 열람하지 못했고 WebSearch 요약에만 등장한다(`jevai.dev`, `jevmodel.org`, `jevaiguide.com`, `jevtypesafeai.com` 등 제3자/비공식으로 보이는 사이트들이 다수 검색되었는데, 이 중 상당수는 TypeSafe AI 공식 도메인이 아니다 — 출시 직후 흔한 SEO 파밍 사이트일 가능성이 있으므로 계획 단계에서 신뢰하지 말 것). **벤더 자체(TypeSafe AI, Jev, Vercel AI Gateway 통합)의 실존과 대략적인 가격/기능은 MEDIUM 확신도로 확인되지만, 정식 API 인증·스키마·SLA·rate limit·계정 발급 절차는 LOW 확신도이며 계획 단계에서 실제 `docs.typesafe.ai`를 사람이 열람하거나 스파이크로 계정을 발급받아 직접 검증해야 한다.**

**Primary recommendation:** Jev 클라이언트는 기존 `ProviderClient`(텍스트 생성 인터페이스)를 재사용하지 말고 별도의 `DecisionClient`류 어댑터로 신설하되, Phase 8의 DI/에러 정규화 패턴(`ProviderCallError`, `toSanitizedProviderError`, 실패를 rate_limited/unavailable/config로 정규화)을 그대로 복제한다. 온보딩 리드타임과 API 안정성이 확정 안 됐으므로, 계획은 Wave 0에서 "Jev 계정 발급 + `docs.typesafe.ai` 실제 열람 + 스파이크 호출 성공"을 실행 전제 조건(로드맵의 Phase 8/9 벤더 온보딩과 동일한 구조)으로 명시해야 한다. 코드/UI/평가 파이프라인은 이 페이즈 안에서 전부 완성하되 실제 활성화는 D-08/D-09에 따라 목업 데이터 검증과 데이터 정책 검토가 끝난 뒤로 게이팅한다.

## Standard Stack

### Core

| Library/서비스 | 버전/시점 | 목적 | 근거 |
|---------|---------|------|------|
| TypeSafe AI Jev (`jev-latest`) | 2026-09-15 공개, 2026-09-21 API 오픈(보도 기준) | 작업 종류·카테고리·폴더·템플릿 결정(Choice primitive), 확신도 스코어 | D-01/D-02, WebSearch(MarkTechPost, Requesty, DataCamp 등 복수 소스 교차) + 공식 블로그 WebFetch |
| Google Gemini (`lib/ai/providers/gemini.ts`) | 기존 사용 중 | 최종 문서 제목·본문 생성 | D-04, 기존 코드 |
| Vercel AI Gateway (선택적 경유 경로) | Jev를 `typesafe-ai/jev`로 이미 게시 | 벤더 키 직접 발급 대신 게이트웨이 경유 옵션 | WebSearch(Vercel 공식 changelog/모델 페이지 요약) — 1차 소스 직접 열람은 못함, MEDIUM |

**버전 확인 경고:** `jev-latest`라는 별칭 자체가 BUG-01 원문의 원칙("프로덕션에서는 평가한 고정 버전을 사용하고 `latest` 별칭은 사용하지 않는다")과 정면으로 충돌한다. 벤더가 고정 버전 태그(`jev-2026-09-15`류)를 제공하는지 `docs.typesafe.ai`에서 반드시 확인해야 하며, 없다면 이 페이즈에서 별도의 버전 고정/스냅샷 전략(예: 응답을 자체 로깅해 회귀 감지)을 설계해야 한다. 확인 전까지 LOW.

### Supporting

| 항목 | 목적 | 비고 |
|------|------|------|
| Jev Python/JS 공식 SDK (보도됨) | HTTP 직접 호출 대신 SDK 사용 가능성 | 이번 조사에서 SDK 리포지토리 자체는 열람하지 못함 — 계획 단계에서 npm/PyPI 실재 확인 필요 |
| 기존 `lib/ai/providers/*` 어댑터 패턴 | Jev 클라이언트 설계 템플릿 | `types.ts`의 `ProviderClient`/`ProviderCallError`/에러 정규화 shape 재사용 가능, 단 인터페이스 자체는 신규(`ProviderClient`는 텍스트 생성 전용 계약이라 그대로 구현체로 넣으면 의미가 어긋남) |
| `lib/kb/actions.ts`의 `listTemplateOptions`/`createNode` | 폴더·템플릿 후보 조회, 템플릿 강제 적용 | 이미 존재, 재사용 대상 (D-05 원문 명시) |

### Alternatives Considered

| 대신 | 대안 | 트레이드오프 |
|------|------|--------------|
| Jev 실사용(D-02 확정) | Gemini로 "결정 모델" 역할 흉내(구조화 출력 prompt) | CONTEXT.md에서 명시적으로 기각됨 — 채택 안 함 |
| TypeSafe 직접 API | Vercel AI Gateway 경유 | 게이트웨이는 마크업 없음+기존에 Phase 8/9서 어댑터 패턴을 쓰고 있다면 운영 편의성 있음. 다만 이 프로젝트가 실제로 Vercel AI Gateway를 이미 쓰고 있는지는 코드베이스에서 확인 안 됨(`lib/ai/providers/*`는 각 벤더 SDK를 직접 호출하는 구조로 보임) — 계획 단계에서 직접 호출 vs 게이트웨이 경유를 결정해야 함 |

**Installation:** 확정 불가(LOW) — 공식 SDK 패키지명(npm/pip)을 이번 조사에서 확인하지 못했다. 계획 단계에서 `docs.typesafe.ai` 실열람 후 확정.

**버전 검증:** 시도했으나 npm/PyPI 레지스트리 조회를 이번 세션에서 수행하지 않음(패키지명 불확실). 계획 단계 선행 작업.

## Architecture Patterns

### 권장 흐름 (BUG-01 §해결 설계를 그대로 구조화)

```
[사용자 요청/멘션/챕터 컨텍스트]
        │
        ▼
[서버: 판단 문맥 구성 — 요청/세션/챕터 본문/멘션 문서]
        │
        ▼
[Jev 호출 1: reply/draft/document/clarify + (document면) 카테고리, 확률·확신도]
        │  확신도 낮음 → clarify 응답 생성, Gemini 미호출
        ▼
[서버: 확정된 카테고리로 폴더·템플릿 후보 조회 (listTemplateOptions 등)]
        │
        ▼
[Jev 호출 2: 폴더 키·템플릿 키 결정, 확률·확신도]
        │  실패/저확신 → 최상위 폴더 + 우선순위 기본 템플릿 폴백
        ▼
[서버: 후보 키 → 실제 folder/template 매핑 + 검증]
        │
        ▼
[Gemini: 선택 템플릿 원문 + 계획 정보로 전용 프롬프트 생성]
        │
        ▼
[UI: 결과 + 추천 저장 위치/템플릿 표시 (제안 카드는 기존 그대로, D-11: 별도 정보만)]
        │
        ▼
["문서로 저장하기" 클릭 → 확인 모달(D-11) → 위치/템플릿 변경 가능]
        │
        ▼
[서버: 저장 직전 targetFolderId·템플릿 재검증(AIDOC-03) → 저장]
```

### Pattern 1: 결정 계층 어댑터를 생성 계층 인터페이스와 분리

**What:** `ProviderClient`(텍스트 생성)와 별도로 `lib/ai/providers/jev.ts` 또는 `lib/ai/decision/`을 신설, `decide(state, candidates): { choice, probabilities, confidence }` 형태의 자체 계약 정의.
**When to use:** Jev는 자유 텍스트가 아닌 타입 결정만 반환하므로 `GenerateResult`(text/finishReason 등)에 억지로 맞추면 의미가 어긋난다.
**Example (개념적):**
```ts
// 신규, 기존 lib/ai/providers/types.ts 패턴을 참고하되 별도 인터페이스로
export interface DecisionClient {
  decide<T extends string>(params: {
    state: Record<string, unknown>;
    candidates: { key: string; [k: string]: unknown }[];
  }): Promise<{ key: T; confidence: number; probabilities: Record<T, number> }>;
}
```

### Pattern 2: 후보는 항상 불투명 키(BUG-01 원문)

**What:** 실제 DB id를 Jev에 노출하지 않고 매 요청 `folder_1`, `template_2` 같은 키를 생성해 전달, 응답을 서버에서 재매핑.
**When to use:** AIDOC-03의 재검증 요구와 직결 — 키가 곧 검증 대상이 됨.

### Pattern 3: 저장 직전 재검증 (Server Action authorize-before-validate)

기존 `checkWriteAccess` + Phase 7 authorize-before-validate 패턴을 그대로 확장. `targetFolderId`/템플릿 선택은 `owner_id`, `work_id`, `scope`, `category`, `deleted_at IS NULL`을 모두 재확인(BUG-01 §후보 및 예외 처리 규칙과 동일 조건 — 기존 `resolveCategoryFolderId` 버그가 바로 이 조건 중 `node_type='folder'`만 걸고 유일성을 가정한 것이 원인이었음).

### Anti-Patterns to Avoid

- **`maybeSingle()`로 카테고리 폴더 유일성 가정:** `resolveCategoryFolderId`의 실제 버그 원인. 하위 폴더가 있으면 깨짐. 후보는 항상 배열로 조회.
- **`latest` 별칭 프로덕션 사용:** BUG-01 원문이 명시적으로 금지. 고정 버전 필요.
- **Jev 실패 시 조용한 대체 저장:** AIDOC-03이 명시적으로 금지 — 위치 무효화 시 반드시 사용자에게 재선택을 요구.
- **@멘션 빠른 추가에 Jev 호출 추가:** CONTEXT.md D-12가 명시적으로 금지 — 이 경로는 Jev 없이 직접 폴더 선택 UI.

## Don't Hand-Roll

| 문제 | 직접 만들지 말 것 | 대신 사용 | 이유 |
|------|-------------------|-----------|------|
| 확률 붙은 다지선다 결정 | 자체 프롬프트+JSON 파싱으로 Gemini에 "이 중 골라줘" 시키기 | Jev의 Choice primitive | D-02가 명시적으로 대체안 기각; Jev는 병렬 1회 호출로 여러 질문을 동시에 답함(문서 종류+카테고리를 한 번에 물을 수 있는지 API 확정 필요) |
| 템플릿 후보 조회/우선순위 | 새 템플릿 저장소 | `lib/kb/actions.ts`의 `listTemplateOptions` | 이미 작품 전용→계정 공유→기본 우선순위 로직 존재 |
| 저장 시 권한 검증 | 커스텀 ad-hoc 체크 | 기존 `checkWriteAccess` + Phase 2/7 authorize-before-validate 패턴 확장 | 검증된 패턴, 신규 취약점 표면 최소화 |

**Key insight:** 이 페이즈의 실제 신규 표면은 "Jev 벤더 온보딩"과 "다중 폴더 후보 처리"뿐이다. 템플릿 조회, 소유권 검증, 저장 액션 골격은 전부 기존 자산 재사용으로 충분하다.

## Common Pitfalls

### Pitfall 1: 신생 벤더 문서 신뢰 오염

**What goes wrong:** 검색 결과 상위에 `jevai.dev`, `jevmodel.org`, `jevaiguide.com`, `jevtypesafeai.com` 등 TypeSafe AI 공식 도메인이 아닌 사이트가 다수 섞여 있다. 이런 사이트를 1차 소스로 착각해 API 스펙을 그대로 코드에 반영하면 실제 계약과 어긋날 위험이 크다.
**Why it happens:** 출시 1주일 이내 벤더는 공식 문서가 안정화되기 전에 SEO 목적의 요약/가이드 사이트가 먼저 검색 상위를 차지한다.
**How to avoid:** 계획/실행 단계에서 반드시 `typesafe.ai`(공식 도메인, 블로그/legal 확인됨)와 `api.typesafe.ai`/`docs.typesafe.ai`(추정 공식, 미열람)만 1차 소스로 취급. 그 외 도메인은 정황 참고용으로만 쓰고 코드 계약 근거로 인용하지 않는다.
**Warning signs:** 여러 블로그가 서로 다른 엔드포인트/파라미터명을 보도하면 즉시 공식 문서를 재확인.

### Pitfall 2: `docs.typesafe.ai` 미검증 상태로 스키마를 확정

**What goes wrong:** 인증 헤더 형식, 요청/응답 JSON 스키마, rate limit, 에러 코드 체계를 모두 확정 못 한 채 플랜 태스크를 세분화하면 실행 중 구조가 흔들릴 위험.
**Why it happens:** 이번 리서치에서 `docs.typesafe.ai` 자체를 열람하지 못함(공식 블로그의 안내 링크만 확인).
**How to avoid:** 계획 Wave 0에 "Jev 계정 발급 + 공식 docs 열람 + 최소 스파이크 호출(목업 state로 1회 성공)"을 명시적 선행 태스크로 넣는다. Phase 8/9의 벤더 온보딩(Organization Verification 등)과 동일하게 STATE.md Blockers에 추적.
**Warning signs:** 계획 단계에서 요청 바디 예시가 BUG-01 문서(프로젝트 자체 설계안)에서만 나오고 벤더 공식 예시와 대조되지 않은 채로 진행되는 경우.

### Pitfall 3: 다중 폴더 후보를 다시 단일 가정으로 회귀

**What goes wrong:** BUG-01의 근본 원인이 그대로 재발 — Jev 결정 이후 서버 매핑 단계에서 다시 `.maybeSingle()`이나 "카테고리당 폴더 1개" 가정을 쓰면 같은 버그가 새 경로에서 재현.
**How to avoid:** 후보 조회는 항상 배열(`select`), Jev가 준 키로 정확히 하나를 골라야만 확정. 코드 리뷰 체크리스트에 "카테고리 폴더 조회는 항상 다건 가능성 처리" 명시.

### Pitfall 4: 목업 데이터와 실제 데이터 경계 흐림 (D-08)

**What goes wrong:** 오프라인 평가·그림자 계획 파이프라인이 실수로 실제 작품 콘텐츠를 Jev 프로덕션 엔드포인트에 흘려보냄(예: 그림자 계획을 "실사용자 트래픽"이라고 했지만 실제로는 실사용자의 실제 챕터 본문을 그대로 Jev에 보내는 구현이 되어버리는 경우).
**Why it happens:** "그림자 계획 = 실사용자 트래픽에 대해 판단만 기록"이라는 요구(D-06)와 "실제 본문은 프로덕션에 보내면 안 됨"(D-08)이 동시에 존재 — 그림자 계획 단계에서 사용하는 입력이 합성 데이터인지 실제 데이터인지 헷갈리기 쉽다.
**How to avoid:** 그림자 계획 단계도 D-08 적용 대상으로 명시(합성 데이터로 실사용자 트래픽 "패턴"만 흉내내거나, 실제 트래픽의 메타데이터만 쓰고 본문은 제외). 계획 단계에서 "그림자 계획에 어떤 데이터가 실제로 들어가는가"를 태스크 단위로 명시적으로 답해야 한다 — 이 리서치는 답을 내리지 않고 Open Question으로 남긴다.

## Code Examples

### 기존 소유권/스코프 검증 패턴 (재사용 대상)

```ts
// Source: lib/ai/chat.ts (기존 코드)
const access = await checkWriteAccess(supabase, ownerId);
if (!access.ok) return failed('write_denied', access.error, { code: access.code });
// ... 프로바이더 호출 후 ...
const stillAllowed = await checkWriteAccess(admin, ownerId);
if (!stillAllowed.ok) return failed('write_denied', stillAllowed.error, { code: stillAllowed.code });
```
AIDOC-03의 "저장 직전 재검증"은 이 이중 체크(호출 전 + 커밋 직전) 패턴을 그대로 targetFolderId/템플릿 검증에 적용할 수 있다.

### 기존 버그 원인 코드 (수정 대상)

```ts
// Source: lib/ai/mentions.ts (버그 원인, 그대로 두면 안 됨)
export async function resolveCategoryFolderId(...) {
  const { data } = await supabase
    .from('kb_nodes').select('id')
    .eq('owner_id', ownerId).eq('work_id', workId)
    .eq('category', category).eq('node_type', 'folder')
    .is('deleted_at', null)
    .maybeSingle(); // 하위 폴더가 있으면 다건 → 에러 → null 반환
  return data?.id ?? null;
}
```

### 기존 템플릿 후보 조회 (재사용)

```ts
// Source: lib/kb/actions.ts listTemplateOptions (기존 코드, 그대로 재사용)
// 작품 전용 → 계정 공유 → 기본(docs/Template) 순으로 TemplateOption[] 반환
// isDefault 플래그로 우선순위 노출
```

## State of the Art

| 기존 방식 | 새 방식 | 변경 시점 | 영향 |
|-----------|---------|-----------|------|
| Gemini가 자유 형식으로 `[DOCUMENT]` 블록 생성 → 사후 카테고리 파싱 → `quickAddMentionNode`로 기본 템플릿 잠깐 적용 후 덮어쓰기 | Jev가 사전에 계획(카테고리/폴더/템플릿) 확정 → Gemini는 선택된 템플릿을 프롬프트에 받아 처음부터 구조를 유지 | Phase 15 | 템플릿 품질 일관성 향상, 그러나 파이프라인 단계가 2단계(Jev) + 1단계(Gemini)로 늘어나 지연시간·비용 구조가 바뀜(D-07 운영 관측 필요 이유) |
| 카테고리 폴더를 단일 가정(`maybeSingle`) | 카테고리 폴더 다건 조회 + 후보 중 명시적 선택 | Phase 15 | BUG-01 근본 수정 |

**Deprecated/outdated:**
- `resolveCategoryFolderId`의 `.maybeSingle()` 단일 폴더 가정 — 이 페이즈에서 교체 대상.
- 제안 카드에서 "문서로 저장하기" 클릭 즉시 저장하는 현재 흐름 — D-11에 따라 확인 모달 경유로 변경.

## Open Questions

1. **Jev 공식 인증/스키마/rate limit/SLA 세부**
   - What we know: 엔드포인트(`api.typesafe.ai/v1/systemone`), 모델 라우트(`jev-latest`), 가격($0.042/MTok 입력, 출력 무료), 응답 지연(70~500ms), 3 primitive(Choice/Score/Noul) — 모두 WebSearch 요약 교차 확인, 공식 블로그 일부 확인.
   - What's unclear: 정확한 인증 헤더 형식, 요청/응답 JSON 스키마 필드명, rate limit 수치, 에러 코드 체계, SLA/가동률 보장, 계정·결제 신청 절차, 조직 검증 필요 여부.
   - Recommendation: 계획 Wave 0에 "docs.typesafe.ai 사람이 직접 열람 + 계정 발급 + 스파이크 호출"을 필수 선행 태스크로 넣는다. 벤더 온보딩 리드타임을 STATE.md Blockers에 Phase 8/9 벤더 온보딩과 동일하게 추적(D-10 요구사항과도 연결).

2. **Vercel AI Gateway 경유 여부**
   - What we know: Jev가 `typesafe-ai/jev`로 Vercel AI Gateway에 게시되어 있다고 보도됨(마크업 없음, 동일 가격).
   - What's unclear: 이 프로젝트가 실제로 Vercel AI Gateway를 다른 벤더에 이미 쓰고 있는지 코드베이스에서 확인 안 됨(`lib/ai/providers/gemini.ts` 등은 벤더 SDK 직접 호출 구조로 보임 — 코드 직접 열람은 이번 조사에서 gemini.ts 내용까지는 안 함, 존재만 확인). 게이트웨이 경유가 키 관리·과금 집계 측면에서 이득이 될지 계획 단계에서 비교 필요.
   - Recommendation: 계획 단계에서 "직접 API 대 AI Gateway 경유" 결정을 Claude's Discretion 항목으로 명시하고, 기존 BYOK/서비스 키 과금 인프라(Phase 8~11)와의 통합 용이성 기준으로 선택.

3. **그림자 계획 단계에 정확히 어떤 데이터가 들어가는가 (D-06 vs D-08 경계)**
   - What we know: D-06은 "실사용자 트래픽에 대해 기록만"을 요구, D-08은 "실제 본문을 프로덕션 호출에 보내지 않음"을 요구.
   - What's unclear: 두 요구가 동시에 성립하려면 그림자 계획 단계의 입력이 실제 사용자 트래픽의 메타데이터(요청 발생 여부, 타이밍)만인지, 아니면 합성으로 재구성한 유사 입력을 실사용자 트래픽 발생 시점에 맞춰 실행하는 것인지 CONTEXT.md에 명시가 없다.
   - Recommendation: 계획 단계에서 이 경계를 태스크 수준으로 명시적으로 정의(예: "그림자 계획은 실제 트래픽 타이밍에 맞춰 합성 대체 입력으로 Jev를 호출하고 결과만 기록"). 사용자 확인이 필요하면 `/gsd:plan-phase 15` 진행 중 AskUserQuestion으로 확인.

4. **Jev가 한 번에 여러 질문(Choice)을 병렬 처리할 때 "작업 종류+카테고리"를 한 호출로 묶을 수 있는지**
   - What we know: Jev는 "3 primitive가 1 request를 공유할 수 있다"고 보도됨(병렬 처리).
   - What's unclear: BUG-01 설계는 판단을 2단계(1차: 작업+카테고리, 2차: 폴더+템플릿)로 나눴는데, 이것이 API 제약 때문인지 설계상 선택인지 불명확. 공식 스키마 확인 후 1차 호출에서 여러 Choice를 동시에 물어볔 지연시간을 줄일 수 있는지 검토 여지 있음.
   - Recommendation: 벤더 문서 확인 후 계획 단계에서 최적 호출 횟수 결정, 단 BUG-01의 2단계 순서(카테고리 확정 후에만 폴더/템플릿 후보 조회)는 서버 로직상 필요(카테고리 없이는 폴더 후보를 좁힐 수 없음)하므로 최소 2회 호출은 유지될 가능성 높음.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| TypeSafe AI API 키 | Jev 호출 전체 | ✗ (미발급, 신규 온보딩 필요) | — | 없음 — Phase 15 진행에 필수, D-08 적용 전까지는 목업 데이터로만 개발 가능하므로 API 키 발급 전에도 목업 기반 코드/평가 파이프라인 구축은 가능 |
| Vercel AI Gateway 계정/설정 (경유 선택 시) | Jev 호출 경로 대안 | 불명 — 코드베이스에서 기존 사용 여부 미확인 | — | TypeSafe 직접 API 호출 |
| Gemini API 키 | 최종 문서 생성 | ✓ (기존 Phase 4에서 사용 중, STATE.md에 라이브 UAT 일부 미완 기록) | 기존 확인됨 | — |
| `docs.typesafe.ai` 접근 | API 스펙 확정 | 미검증(이번 세션에서 열람 실패) | — | 없음 — Wave 0 필수 선행 |

**Missing dependencies with no fallback:**
- TypeSafe AI API 키 발급 및 공식 문서 열람 — Wave 0 필수, 없으면 실제 통합 태스크가 시작 불가(목업 개발은 가능).

**Missing dependencies with fallback:**
- Vercel AI Gateway 경유 — 직접 API 호출로 대체 가능.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (기존 `npx vitest run tests/ai --no-file-parallelism` 관례, BUG-01 §검증에도 명시) |
| Config file | 기존 `vitest.config.ts` (server-only 스텁 처리 패턴 이미 존재, Phase 4 Plan 04-01 참고) |
| Quick run command | `npx vitest run tests/ai --no-file-parallelism` |
| Full suite command | `npx vitest run --no-file-parallelism && npx tsc --noEmit && npm run lint` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AIDOC-01 | Jev가 작업+카테고리를 확률과 함께 결정, 저확신 시 clarify | unit (mocked DecisionClient) | `npx vitest run tests/ai/jev-plan.test.ts` | ❌ Wave 0 |
| AIDOC-02 | Gemini가 선택 템플릿 구조 유지, 사용자가 결과·위치·템플릿 확인 | unit + integration | `npx vitest run tests/ai/document-generation.test.ts` | ❌ Wave 0 (기존 chat.ts 테스트 확장 가능성 있음 — `tests/ai` 디렉터리 실재 확인 필요) |
| AIDOC-03 | 저장 직전 targetFolderId·템플릿 서버 재검증, 무효 시 비대체 | unit | `npx vitest run tests/ai/save-validation.test.ts` (또는 기존 `lib/kb/actions.test.ts` 확장) | ❌ Wave 0 |
| AIDOC-04 | 오프라인 평가·그림자 계획 후 활성화, 정책 검토 전 실제 본문 미전송 | 평가 스크립트 + 수동 게이트(정책 검토는 외부 승인이라 자동화 불가) | 평가 스크립트(예: `npm run eval:jev`) — 신설 필요 | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/ai --no-file-parallelism`
- **Per wave merge:** Full suite (`vitest` + `tsc --noEmit` + `lint`)
- **Phase gate:** Full suite green + 오프라인 평가 정확도/보정 기준 충족 확인 before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/ai/` 디렉터리 내 기존 테스트 파일 목록 실제 확인(이번 리서치에서 `tests/ai` 경로 자체를 직접 열람하지 않음 — BUG-01 §검증에서 언급된 명령만 인용) — 계획 단계에서 확인 필요
- [ ] Jev 결정 클라이언트 mock/fixture (`lib/ai/providers/fixture.ts` 패턴 참고 — 기존 파일 존재 확인됨, Gemini용으로 보임)
- [ ] 정답셋(오프라인 평가용 100~300건) 데이터 파일/스크립트 — 전혀 없음, 신규 구축
- [ ] 그림자 계획 로깅 테이블/저장소 — 신규 구축 필요(스키마 마이그레이션 가능성)
- [ ] 운영 관측 지표 수집(D-07: 수락률/변경률/clarify 비율/폴백률/P50·P95/비용/재생성률) — 신규 구축, 기존 관측 인프라 부재로 보임

*Wave 0 gaps는 이 리서치가 코드베이스를 표면적으로만 확인했기 때문에 계획 단계에서 `tests/ai` 실제 내용을 다시 확인할 것을 권장.*

## Sources

### Primary (HIGH confidence)
- `typesafe.ai/blog/introducing-system-one-models-and-jev` (WebFetch, 일부 내용만 접근 가능) — 가격, System One 개념, FAQ 존재 확인
- `typesafe.ai/legal/privacy-policy` (WebFetch) — 학습 미사용, 미국 저장/처리, 삭제 정책 확인
- 프로젝트 코드: `lib/ai/mentions.ts`, `lib/ai/chat.ts`, `lib/ai/providers/types.ts`, `lib/kb/actions.ts`(부분), `app/studio/.../QuickAddDialog.tsx` — Read 도구로 직접 확인
- `.planning/phases/04-ai-gateway-mention-based-generation/bugs/BUG-01-...md` — 설계 원본

### Secondary (MEDIUM confidence)
- WebSearch 결과 교차 확인(MarkTechPost, Requesty, DataCamp, TrueFoundry, LangChain 블로그, Startup Fortune, dev.to) — Jev 실존, 창업자, 시드 라운드, 가격, 지연시간, API 엔드포인트/모델 라우트, Vercel AI Gateway 채택 속도에서 다수 소스 일치
- Vercel 공식 changelog/모델 페이지(`vercel.com/changelog/typesafe-ai-jev-now-available-on-ai-gateway`, `vercel.com/ai-gateway/models/jev`) — WebSearch 요약으로만 확인, 원문 미열람

### Tertiary (LOW confidence)
- `docs.typesafe.ai`, `jevai.dev`, `jevmodel.org`, `jevaiguide.com`, `jevtypesafeai.com` — 검색 결과에 등장했으나 원문 미열람 또는 비공식 도메인으로 추정. **계획/실행 단계에서 1차 소스로 인용 금지, 반드시 사람이 직접 재확인.**
- 인증 방식, 정식 요청/응답 스키마, rate limit, SLA, 계정 발급 절차 — 전부 미확인, 이번 리서치의 최대 공백

## Metadata

**Confidence breakdown:**
- Standard stack (Jev 벤더 실존/가격/개념): MEDIUM — 다수 독립 소스 교차 확인, 단 공식 API 레퍼런스 미열람
- Architecture: MEDIUM-HIGH — 기존 코드베이스 패턴(어댑터 DI, authorize-before-validate)은 직접 확인, Jev 통합 지점만 설계 추정
- Pitfalls: MEDIUM — BUG-01 원인 버그는 코드로 직접 확인(HIGH), 벤더 온보딩 리스크는 정황상 LOW
- Validation Architecture: LOW-MEDIUM — 기존 테스트 명령은 BUG-01 문서 인용, `tests/ai` 실제 내용은 미확인

**Research date:** 2026-09-23
**Valid until:** 약 7일 — Jev는 출시 1주일 이내 벤더로 API 스펙·가격·정책이 빠르게 바뀔 수 있음(fast-moving으로 취급)
