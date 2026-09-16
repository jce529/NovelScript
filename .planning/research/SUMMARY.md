# Project Research Summary

**Project:** NovelScript — v1.1 멀티 프로바이더 AI 연결 · BYOK · 구독형 AI MCP
**Domain:** 멀티 벤더 LLM 어댑터 레이어 + 사용자 API 키(BYOK) 위탁 보관 + 원격 OAuth 인증 MCP 서버 (기존 Next.js + Supabase 단일 앱 위에 증축)
**Researched:** 2026-09-16
**Confidence:** MEDIUM-HIGH

## Executive Summary

v1.1은 새 제품이 아니라 **기존 `lib/ai/` 모듈의 증축 마일스톤**이다. 새 배포 단위도, 새 서비스도 추가되지 않는다. 리서치 4건이 일관되게 가리키는 결론은 하나다 — v1.0이 이미 확립한 패턴(DI 가능한 벤더 클라이언트 인터페이스, `SECURITY DEFINER` RPC, RLS 기반 소유권 모델, commerce의 `idempotencyKey` 패턴)을 **재사용해서 확장**하는 것이 새 추상화 라이브러리를 도입하는 것보다 모든 축에서 낫다. 구체적으로: Vercel AI SDK가 아니라 vendor SDK(`openai`, `@anthropic-ai/sdk`)를 프로젝트 소유의 `ProviderClient` 인터페이스 뒤에 두고(BYOK가 호출마다 런타임 키를 요구하고 스트리밍은 v2+로 유예됐으므로 AI SDK의 주된 가치가 적용되지 않는다), MCP는 Vercel이 만든 `mcp-handler@2.x`를 같은 Next.js 앱의 라우트로 마운트한다.

마일스톤은 **명확한 2단 구조**를 가진다. 1단계(멀티 프로바이더 + BYOK)는 "NovelScript가 LLM을 호출한다", 2단계(MCP)는 "LLM이 NovelScript를 호출한다" — 방향이 반대이고 공유 코드가 사실상 없다. 두 단계를 하나의 "auth 페이즈"로 묶는 것은 리서치가 명시적으로 경고하는 실수다. 1단계의 최우선 작업은 화려한 기능이 아니라 **어댑터 인터페이스 + 멱등 정산 수정**이라는 두 개의 기반 작업이며, 특히 후자는 현재 코드의 **살아있는 정합성 버그**다(`chat.ts`가 `p_reference_id`에 매 호출 새 `crypto.randomUUID()`를 넘겨 ledger의 dedupe 제약을 무력화하고 있다). 429 재시도 로직은 이 수정 이후에만 추가할 수 있다.

주된 리스크는 세 갈래다. (1) **비밀 누출** — BYOK 키는 provider 응답 본문이 아니라 HTTP 클라이언트가 던지는 **Error 객체의 request config**를 통해 로그/에러 트래커로 새어나간다. 어댑터 인터페이스 자체에 스크러빙 choke point를 함께 출하해야 한다. (2) **MCP confused deputy** — 이 코드베이스에는 이미 `createAdminClient()`로 RLS를 우회하는 선례가 있고, MCP 도구 구현자가 그 관행을 그대로 복사하면 유효한 OAuth 토큰 하나로 교차 사용자 읽기/쓰기가 가능해진다. 도구는 기본적으로 user-scoped 클라이언트를 쓰고, LLM이 넘긴 `work_id`/`chapter_id`는 매 호출 서버에서 소유권을 재검증해야 한다. (3) **외부 리드타임** — OpenAI Organization Verification(정부 신분증 기반)과 vendor rate-limit tier는 v1.0 Phase 5의 PG 심사 지연과 구조적으로 동일한 리스크다. 어댑터 코드 착수와 **동시에** 시작하고 STATE.md Blockers에 추적해야 한다.

## Key Findings

### Recommended Stack

기존 스택(Next.js 16 / React 19 / Supabase / Vercel)은 그대로 두고 얇게 추가한다. 핵심 판단은 "공용 추상화 라이브러리를 사지 말고, 이미 검증된 프로젝트 자체 인터페이스를 넓혀라"이다. v1.0 STACK.md의 AI SDK 권고는 **의도적으로 뒤집혔다** — 그 권고는 단일 벤더 + 플랫폼 키 전제에서 나왔고, BYOK(호출별 런타임 키)와 non-streaming 확정이라는 새 제약 아래에서는 성립하지 않는다.

**Core technologies:**
- `openai@7.15.0` + `@anthropic-ai/sdk@0.125.0`: provider 어댑터 구현체 — 생성자 기반 클라이언트라 기존 `createMockGeminiClient()` DI/모킹 패턴에 1:1로 들어맞는다. Node 22/24 필요(OpenAI가 Node 20을 2026-04-30 EOL 처리).
- `js-tiktoken` (pure JS, WASM 아님): pre-call 토큰 추정 — OpenAI에는 remote count 엔드포인트가 아예 없고, Anthropic 것은 BYOK 사용자의 rate limit을 두 배로 소모한다. 추정은 **cap 계산용**일 뿐, 실제 차감은 항상 post-call `usage`가 기준.
- Node 내장 `crypto` (AES-256-GCM) **또는** Supabase Vault: BYOK 암호화 — 두 리서치가 갈린 유일한 지점, 아래 "Gaps" 참조.
- `mcp-handler@2.1.1` + `@modelcontextprotocol/server@^2.0.0`: Next.js Route Handler를 spec 준수 MCP 서버로 — Vercel 1st-party, 2026-07-28 spec 네이티브, stateless(Redis 불필요). 구형 `@modelcontextprotocol/sdk@1.x`와 **함께 설치 금지**.
- 기존 `zod@^4.4.3`: `mcp-handler`의 `^4.2.0` 요구를 이미 충족, 버전 업 불필요.

**쓰지 말 것:** Vercel AI SDK(call layer로서), 커스텀 OpenAI 호환 base URL / OpenRouter 등 게이트웨이(SSRF 표면 + BYOK 신뢰 모델 파괴), provider별 remote pre-call 토큰 카운팅, `settings` JSON 컬럼에 키 평문 저장.

**정리 필요:** 워크트리의 `mcpres/` (수동 다운로드한 tarball + 추출 디렉터리)는 커밋 대상이 아니다. 채택 시 npm registry에서 정식 설치하고 `mcpres/`는 삭제한다.

### Expected Features

**Must have (table stakes) — 1단계:**
- 공통 `ProviderClient` 인터페이스 + Gemini 이관 (동작 변화 0, 회귀 테스트로 증명)
- OpenAI + Anthropic 어댑터 (non-streaming, 고정 base URL)
- 로컬 토큰 추정 (remote `countTokens` 의존 제거)
- provider/model별 가격·역량 테이블 (Gemini 가격으로 GPT 비용을 표시하는 것은 아무것도 안 보여주는 것보다 나쁘다)
- BYOK: 설정 페이지에서 등록 → **models-list 호출로 저장 전 검증**(실제 생성 호출로 검증하면 사용자에게 과금됨) → 마스킹 표시(provider + last4 + 생성일) → 삭제 → 교체는 삭제+재등록
- BYOK 호출 경로: 지갑 차감 0 + `ai_usage` 기록 (`wallet_ledger`에 0-delta 행을 쓰지 않는다)
- 서비스 키 경로의 **멱등 정산 수정** (현존 버그)
- 4종 BYOK 오류 분류(invalid / rate-limited / out-of-credit / timeout)별 구분된 한국어 메시지와 키 상태 부수효과
- provider/model 선택기: 계정 기본값 + 호출별 드롭다운 + **모델별 `BYOK`/`서비스 키` 뱃지**
- 선택 불가 시 **보이는** 폴백 (무음 cross-mode 폴백 절대 금지)

**Must have — 2단계:**
- 공개 HTTPS 원격 MCP 서버 (Anthropic 클라우드에서 접속하므로 localhost/stdio 불가)
- OAuth 2.1 + PKCE 계정 연결, 사용자별 토큰 스코핑, **취소 가능한 grant 기록**
- 읽기 도구 5종 + `get_writing_context` (mention 형태 컨텍스트 번들)
- 쓰기 도구는 `save_draft` / `propose_kb_document` 2종뿐 — **`update_chapter_body`는 아예 존재하지 않는다**
- 모든 도구에 tool annotation (`readOnlyHint` 등)
- MCP 유래 초안/제안을 위한 **스튜디오 리뷰 큐 UI** (아직 없음, 실제 스코프)
- 연결/해제 UI + 서버 측 실제 revocation

**Should have (competitive):**
- `get_writing_context` — MCP 페이즈가 단순 CRUD API가 아니게 만드는 유일한 차별화 도구. `composeSystemInstruction`/`assembleUserContent`를 **재사용**(fork 금지).
- 모델별 BYOK 뱃지 + "이번 달 내 키로 쓴 양" 라인 — 조사한 어떤 BYOK 제품도 제대로 못 하는 영역
- MCP 초안 provenance 표시 ("Claude에서 저장됨")
- 한국 소설 창작 관점의 모델 힌트 ("대사체가 자연스러움") — 실사용 데이터 이후

**Defer (v2+):**
- 스트리밍 (`[REPLY]/[DRAFT]/[DOCUMENT]` 텍스트 프로토콜을 structured output으로 교체해야 함 — 별도 마일스톤)
- 커스텀 OpenAI 호환 엔드포인트 / 로컬 모델
- provider당 복수 키, 팀 키 공유
- MCP prompts/resources (클라이언트 지원이 불균일 — 대상 클라이언트가 실제로 렌더링하는 게 확인되면)
- `propose_kb_document`의 기존 문서 수정 + diff 리뷰 UI

### Architecture Approach

시스템 형태는 v1.0에서 바뀌지 않는다 — 하나의 Next.js 앱 + Supabase. 추가되는 것은 `lib/ai/` 안의 세 개 seam(`providers/`, `byok.ts`, `usage.ts`)과 하나의 새 공개 표면(`app/mcp/[transport]/route.ts`)이다. MCP를 같은 앱에 두는 이유는 편의가 아니라 **도구들이 나머지 앱과 동일한 RLS/소유권 모델을 재사용해야 하기 때문**이다 — 별도 서비스는 service-role 자격증명 배포와 소유권 검사 로직의 두 번째 사본을 만든다.

**Major components:**
1. `lib/ai/providers/` (types, registry, gemini, openai, anthropic) — vendor SDK import가 허용되는 **유일한** 폴더. registry가 (providerId, modelId, ownerId) → 살아있는 클라이언트 + `keySource` 해석을 독점한다.
2. `lib/ai/byok.ts` — 복호화된 평문 키를 메모리에 가질 수 있는 유일한 파일(하드 신뢰 경계). 암호화/복호화/마스킹/검증. 크기와 무관하게 단독 파일로 유지해 보안 리뷰를 1파일 읽기로 만든다.
3. `lib/ai/usage.ts` + `ai_usage` 테이블 — `cost.ts`(플랫폼이 지불할 돈)와 **분리**. 누가 냈든 무슨 일이 있었는지의 기록. `apply_wallet_delta`를 절대 경유하지 않는다.
4. `lib/ai/chat.ts` — 오케스트레이션 전용. `keySource`에 따라 **cap 계산 블록 전체**를 감싸는 분기(플래그를 여러 곳에서 검사하지 않는다). BYOK 호출은 `computeMaxOutputTokens`를 문자 그대로 실행하지 않는다.
5. `app/mcp/[transport]/route.ts` + `lib/mcp/` (tools, auth, drafts) — `lib/ai/`와 별도 최상위 모듈. `prompt.ts`를 import해서 쓰되 fork하지 않는다.
6. `mcp_drafts` / `mcp_kb_proposals` + 스튜디오 리뷰 큐 — "외부 AI가 제안하고 작가가 결정한다"를 UI 카피가 아니라 **데이터 접근 레이어에서** 강제.

### Critical Pitfalls

1. **BYOK 키는 응답 본문이 아니라 Error 객체로 샌다** — provider는 본문에서 키를 마스킹하지만, 같은 에러의 request config에 담긴 `Authorization` 헤더는 평문이다. BYOK 마이그레이션 중 누군가 관찰성을 위해 `console.error(err)` 한 줄을 추가하는 순간 끝난다(로그는 회수 불가, 키 rotation만이 복구). → 세 어댑터의 에러가 모이는 **단일 choke point에서 스크러빙**하고, 어댑터 인터페이스와 **같이** 출하한다. 에러 트래커 도입 시 `beforeSend` 훅에서 초기화 시점에 처리(호출부 관행은 세 번째 어댑터에서 잊힌다).
2. **MCP 도구가 `createAdminClient()` 관행을 복사해 소유권 스코핑을 우회한다** — Server Action에서는 옳았던 패턴(세션이 상류에서 검증됨)이 bearer 토큰으로 호출되는 MCP 도구에서는 confused deputy가 된다. → 도구는 기본적으로 user-scoped 클라이언트. admin 클라이언트 사용은 감사 대상 예외. `assertOwnsWork(userId, workId)` 같은 **공유 테스트 가능 predicate**를 쓰고, 모든 도구에 대해 교차 사용자 테스트 스위트를 통과시킨다.
3. **LLM이 넘긴 `work_id`를 인증된 인간이 입력한 것처럼 신뢰한다** — 읽기 도구 결과(KB 문서 본문 등)는 다음 도구 호출의 **비신뢰 입력**이다. prompt injection으로 남의 작품에 제안이 저장될 수 있다. "초안/제안 객체만 쓴다"는 설계는 이 문제의 **대체재가 아니라 짝**이다 — 매 호출 소유권 재검증이 별도로 필요하다.
4. **안전 거절(safety refusal)은 에러가 아니라 정상 200 응답이고, `parseChatResponse`가 그것을 평범한 답변으로 렌더링한다** — Anthropic은 `stop_reason: refusal`, OpenAI는 `finish_reason: content_filter`, Gemini는 `finishReason: SAFETY` — 셋 다 모양이 다르고 셋 다 `[REPLY]` 태그가 없다. 작가는 영어 거절문을 창작 결과물과 같은 UI로 보고 같은 프롬프트를 반복 재시도한다. → 어댑터가 refusal 신호를 **정규화 필드로 노출**하고, raw-text 폴백 **이전에** 검사해 한국어 안내를 낸다. 어댑터와 동시 출하, 후속 작업 아님.
5. **ledger 멱등성 수정이 vendor 이중 과금을 막아주지 않는다** — 안정적 `reference_id`는 지갑 중복 차감을 no-op으로 만들지만, 응답이 네트워크에서 유실된 뒤의 재시도는 vendor가 이미 생성·과금한 호출을 한 번 더 태운다. ledger는 완벽히 일관돼 보이므로 **vendor 대시보드와 대조하지 않으면 발견 불가**. → 재시도는 바이트가 오기 전의 실패에만 한정. 부분 응답 후 연결 끊김은 자동 재시도 대상이 아니라 사용자 재시도 대상.
6. **provider별 토큰 추정 오차가 한국어에서 특히 갈린다** — 세 벤더 토크나이저가 다르고, Hangul 음절 블록에 대한 BPE 어휘 차이는 영어보다 발산이 크다. Gemini `countTokens`에 맞춰 튜닝한 단일 상수는 나머지 둘에서 검증되지 않은 방향으로 틀린다. 이는 추정치 부정확에 그치지 않고 **동일 잔액에 대해 provider마다 출력 예산이 달라지는** 사용자 체감 문제가 된다. → provider별 명명 상수로 분리하고 한국어 산문 샘플로 보정, 실측 대비 20~30% 이상 벌어지면 재보정.
7. **"연결 해제"가 행 하나를 지울 뿐 이미 발급된 접근을 끊지 않는다** — stateless JWT 검증(가장 흔한 튜토리얼 경로)은 로드맵의 "연결 해제 후 접근 차단" 완료 조건을 **구조적으로 충족할 수 없다**. → 매 도구 호출마다 살아있는 grant 기록을 조회(introspection). 검증은 UI 목록이 아니라 **해제 이전에 발급된 토큰으로 실제 도구 호출을 시도**해서 한다.
8. **vendor 온보딩 리드타임** — OpenAI Organization Verification(신분증 기반)과 초기 rate-limit tier는 v1.0 Phase 5의 PG 심사와 같은 모양의 외부 큐다. → 어댑터 코드 착수와 **병행** 시작, STATE.md Blockers에 명시 추적.

## Implications for Roadmap

PROJECT.md 기준 v1.1 페이즈 번호는 **8부터** 이어간다(v1.0 잔여 Phase 5~7은 v1.0 트랙 유지). 아래 순서는 FEATURES.md의 의존성 그래프와 ARCHITECTURE.md의 build order가 독립적으로 도출한 동일한 결론이다.

### Phase 8: 프로바이더 어댑터 기반 + 멱등 정산 수정
**Rationale:** 이후 모든 것이 `ProviderClient` 존재에 의존한다. 동시에 멱등 정산은 **현존하는 정합성 버그**이자 이후 모든 재시도/에러 로직의 전제라서 값싸게 지금 고쳐야 한다(스키마 변경 없음 — 제약은 이미 있다). 벤더를 늘리기 전에 추상화를 증명한다.
**Delivers:** `lib/ai/providers/` 기반(types/registry/gemini), `estimateInputTokens` 로컬 추정, 정규화된 refusal·finishReason 필드, 에러 스크러빙 choke point, `chatAction`의 `idempotencyKey` 수용 + `apply_wallet_delta` 호출 수정. Gemini 서비스 키 흐름은 **동작 무변화**(회귀 테스트로 증명).
**Addresses:** 공통 인터페이스, 로컬 토큰 추정, 멱등 정산
**Avoids:** Pitfall 1(스크러빙을 인터페이스와 동시 출하), 4(refusal 정규화), 5(재시도 전에 멱등성 선행), 6(provider별 추정 상수 구조)
**병행 착수:** OpenAI Organization Verification / Anthropic 빌링·tier 신청 (Pitfall 8) — 코드 작업이 아니지만 이 페이즈 킥오프 체크리스트에 넣는다.

### Phase 9: OpenAI · Anthropic 어댑터 + 제공자별 가격·역량 테이블
**Rationale:** BYOK와 새 벤더를 동시에 디버깅하지 않는다. 먼저 **플랫폼 키로** 어댑터가 작동함을 증명한다.
**Delivers:** `providers/openai.ts`, `providers/anthropic.ts`, usage 형태 정규화(각 벤더의 prompt/input/promptTokenCount 필드를 공통 `UsageReport`로), provider×model 가격/컨텍스트/최대출력 레코드, provider별 한국어 토큰 추정 보정.
**Uses:** `openai@7.x`, `@anthropic-ai/sdk@0.125.x`, `js-tiktoken`
**Avoids:** Pitfall 4(세 벤더 각각에 실제 거절 프롬프트로 검증), 6(실측 대비 보정)

### Phase 10: BYOK 키 저장 · 검증 · 설정 UI
**Rationale:** 호출 경로와 독립적으로 만들고 테스트할 수 있는 기반 조각이다(키 등록 → 검증 → 마스킹 목록까지가 실제 생성 호출 없이 완결된다).
**Delivers:** `byok_keys` 마이그레이션(별도 평문 `masked_hint` 컬럼 — BYOK 슬라이스에서 가장 중요한 스키마 결정), `lib/ai/byok.ts`, `/studio/settings/ai-providers` 페이지와 server actions, models-list 기반 "연결 테스트", 연결됨/검증 실패/미등록 상태 표시.
**Avoids:** Pitfall 1(평문 키가 어떤 경로로도 로그에 닿지 않음을 테스트에서 확인)
**결정 필요:** 암호화 방식(아래 Gaps) — 이 페이즈 **계획 시점**에 확정한다. 구현 중 미루면 데이터 마이그레이션이 된다.

### Phase 11: BYOK 호출 경로 + ai_usage + 오류 UX
**Rationale:** 8/9/10을 엮는 지점이자, "빈 지갑 BYOK 사용자도 성공한다"는 구조적 보장이 실제로 행사되는 곳.
**Delivers:** `chat.ts`의 `keySource` 분기(cap 계산 블록 전체를 감싸는 형태), `ai_usage` 테이블 + `usage.ts`, 4종 오류 분류 처리, 보이는 폴백 규칙.
**Implements:** Architecture Pattern 2(호출 경로 분기), Pattern 4(원장 분리)
**Avoids:** 과금 모드 TOCTOU — 모드는 **매 호출 서버에서 재도출**(클라이언트가 보낸 `byok: true`를 분기 입력으로 쓰지 않는다). 그리고 `ai_usage`에 정산 무관 명시 SQL 주석 + STATE.md forward note(향후 작가 90/10 정산 쿼리 오염 방지).
**핵심 회귀 테스트:** 잔액 0 + BYOK 키 보유 사용자가 성공해야 한다. 패널 로드와 전송 사이에 키를 삭제하는 케이스를 명시적으로 테스트한다.

### Phase 12: 제공자/모델 선택 UI + BYOK 사용량 뷰
**Rationale:** 백엔드가 완전히 굳은 뒤에 UI를 만들면 움직이는 API를 상대로 picker를 만들지 않아도 된다.
**Delivers:** `ProviderModelPicker`(계정 기본값 + 호출별 오버라이드 + 모델별 BYOK/서비스 키 뱃지), 선택 provider 기준 비용 추정 표시, 월간 BYOK 사용량 뷰(호출수/토큰/추정 비용).
**Addresses:** 선택기, 사용량 뷰
**UI 페이즈:** CLAUDE.md 규칙에 따라 UI-SPEC.md 승인 + **브라우저에서 볼 수 있는 Artifact 목업**까지가 완료 조건.

### --- 하드 경계: 1단계가 안정화되기 전에 2단계를 시작하지 않는다 ---

### Phase 13: MCP OAuth 기반 + 연결/해제
**Rationale:** OAuth는 MCP 페이즈 **전체를 게이트**한다. 그리고 리서치 두 건이 authorization server 선택에서 갈린 유일한 지점이므로, 도구를 한 줄이라도 쓰기 전에 **스파이크로 결판**내야 한다.
**Delivers:** `app/mcp/[transport]/route.ts` (`mcp-handler`), 토큰 검증 경로, 살아있는 grant introspection, 연결/해제 UI.
**Uses:** `mcp-handler@2.1.1`, `@modelcontextprotocol/server@^2`
**Avoids:** Pitfall 7(연결 해제 환상) — introspection 메커니즘을 처음부터 설계에 넣는다. 나중에 붙일 수 없다.
**첫 작업은 스파이크:** 실제 Claude custom connector로 discovery → 등록 → 토큰 교환을 왕복시켜 본다. 성공하면 Supabase Auth OAuth 2.1 Server 경로 확정, 실패하면 WorkOS AuthKit로 전환(아래 Gaps).

### Phase 14: MCP 읽기 도구 + get_writing_context
**Rationale:** 단순 list/fetch 도구로 RLS 스코핑이 증명된 뒤에 차별화 도구를 올린다.
**Delivers:** `search_works` / `list_chapters` / `get_chapter` / `search_kb` / `get_kb_document` / `get_writing_context`, 전 도구 tool annotation.
**Avoids:** Pitfall 2 — 모든 도구에 대해 두 번째 사용자 토큰으로 첫 사용자 리소스를 찌르는 교차 사용자 테스트 스위트. `createAdminClient` import는 그 자체로 추가 리뷰 대상.

### Phase 15: MCP 쓰기 도구 + 스튜디오 리뷰 큐
**Rationale:** 리뷰 큐 UI는 "도구 몇 개 더"의 반올림 오차가 아니라 실제 UI 스코프다. 마지막에 두되 축소하지 않는다.
**Delivers:** `save_draft` / `propose_kb_document`(둘 다 pending 상태 객체 생성), `mcp_drafts`/`mcp_kb_proposals` 마이그레이션, 스튜디오 리뷰 큐 + provenance 표시 + accept/reject, 해제 후 접근 차단 E2E 검증.
**Avoids:** Pitfall 3(주입된 도구 결과로 유도된 교차 사용자 쓰기 테스트), Pitfall 7(해제 이전 발급 토큰으로 실제 호출을 시도해 차단 확인).
**UI 페이즈:** 리뷰 큐는 UI-SPEC + Artifact 목업 대상.

### Phase Ordering Rationale

- **어댑터 인터페이스가 1번인 이유:** 가장 레버리지가 크고 가장 위험한 리팩터다. BYOK나 MCP가 `chat.ts`를 건드리기 전에 격리된 상태로 회귀 테스트를 끝내야 한다.
- **멱등 정산이 8번에 끼는 이유:** 429 재시도 로직보다 먼저 와야 한다는 것이 FEATURES.md의 명시적 시퀀싱 노트다. 재시도를 먼저 넣으면 두 번째 시도가 다시 차감한다. 값싸고(스키마 변경 없음) 현존 버그다.
- **BYOK 저장(10)과 호출(11)을 나눈 이유:** 저장/검증은 생성 호출 없이 독립 테스트가 가능하고, 호출 경로는 8·9·10이 모두 있어야 성립한다. 한 페이즈로 묶으면 "키는 저장되는데 왜 호출이 실패하지"의 디버깅 표면이 두 배가 된다.
- **UI를 1단계 마지막(12)에 둔 이유:** picker는 "이 사용자가 무엇을 실행할 수 있나"에 대한 단일 진실원(= 키 검증이 돌려준 모델 목록)을 필요로 한다. 백엔드가 확정되기 전에 만들면 두 개의 진실원이 생긴다.
- **1단계/2단계 하드 경계:** BYOK는 "우리가 당신의 비밀을 보관해 밖으로 호출한다", MCP는 "우리가 비밀을 발급해 밖에서 들어오게 한다". 방향이 반대이고 공유 코드가 없다. 하나의 "auth 페이즈"로 계획하지 않는다.
- **MCP OAuth가 13번 단독인 이유:** 도구 전체를 게이트할 뿐 아니라, 리서치가 결론을 내지 못한 유일한 스택 결정을 품고 있다. 스파이크 실패 시 페이즈 내용 자체가 바뀌므로 도구 작업과 섞으면 안 된다.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 13 (MCP OAuth):** 최우선 리서치 대상. (a) Supabase Auth OAuth 2.1 Server vs WorkOS AuthKit 결정이 미해결, (b) 2026-07-28 spec 개정이 DCR을 CIMD로 대체해 2025년 튜토리얼이 전부 낡았다, (c) Claude/ChatGPT 커넥터 UI가 실제로 무엇을 보내는지는 구현 시점 재확인이 필요한 fast-moving 디테일. `/gsd:research-phase` 필수.
- **Phase 10 (BYOK 저장):** 암호화 방식 결정이 두 리서치에서 갈렸다. 전면 리서치보다는 **짧은 결정 스파이크**(Vault 복호화 왕복 지연 + 테스트 용이성 실측)면 충분하다.
- **Phase 9 (OpenAI/Anthropic 어댑터):** 가벼운 확인 수준. provider별 에러 바디 형태, rate-limit 헤더 형태(Gemini는 헤더를 안 준다), refusal 신호 필드명을 구현 시점에 각 벤더 공식 문서로 재확인.

Phases with standard patterns (skip research-phase):
- **Phase 8:** 기존 `lib/ai/gemini.ts` DI 패턴의 일반화 + commerce `idempotencyKey` 패턴 복제. 두 템플릿 모두 이 코드베이스 안에 이미 있다.
- **Phase 11:** 아키텍처 패턴이 코드 형태 수준까지 명시돼 있다.
- **Phase 12:** 표준 Next.js 설정 UI + 드롭다운. UI-SPEC 작업이지 리서치 대상이 아니다.
- **Phase 14, 15:** 13의 인증 기반이 서면 도구는 기존 `lib/kb`/`lib/chapters`/`lib/ai/prompt` 함수의 얇은 래퍼다.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH (1단계) / MEDIUM-LOW (2단계) | npm·vendor 라이브 조회로 버전 확인, `mcp-handler` 패키지 메타데이터를 직접 읽어 검증. MCP authorization 지형은 2026-07-28 spec 개정(CIMD)으로 최근 크게 바뀌어 생태계가 아직 안정화 중. |
| Features | MEDIUM-HIGH | MCP 클라이언트 현실(Anthropic 공식 지원 문서, ChatGPT 플랜 게이팅)은 HIGH. BYOK "저장 이후" UX 관례는 MEDIUM — NovelCrafter/JetBrains/Kilo 모두 키 추가만 문서화하고 마스킹·로테이션 UX는 아무도 문서화하지 않아 여러 제품에서 추론. |
| Architecture | MEDIUM-HIGH | Next.js/Supabase 플랫폼 사실과 provider usage 형태는 공식 문서 대조로 HIGH. Supabase Vault 권고와 MCP-on-Supabase-Auth는 MEDIUM — 문서는 상세하나 이 프로젝트가 써본 적 없는 비교적 새 기능. |
| Pitfalls | MEDIUM-HIGH | 코드 기반 항목(멱등성, admin 클라이언트 선례, refusal 파싱)은 실제 파일을 읽어 확인해 HIGH. provider별 동작 차이와 OpenAI 조직 인증 타임라인은 2차 출처 교차 검증 수준(MEDIUM). |

**Overall confidence:** MEDIUM-HIGH — 1단계(멀티 프로바이더 + BYOK)는 지금 계획해도 될 만큼 확실하다. 2단계(MCP)는 **형태**는 확실하지만(외부 AS + `mcp-handler` resource server + RLS 스코핑 도구 + 초안 전용 쓰기) **authorization server 선택**은 미결이다.

### Gaps to Address

- **BYOK 암호화 방식 — STACK.md와 ARCHITECTURE.md가 정면으로 갈린다.** STACK은 앱 레벨 AES-256-GCM(Vercel 암호화 env var의 KEK)을, ARCHITECTURE는 Supabase Vault를 권고한다. 양쪽 논거 모두 타당하다: Vault는 KEK 위탁을 Supabase 운영 책임으로 넘기고 `apply_wallet_delta`와 동일한 `SECURITY DEFINER` 형태를 재사용하지만, 매 생성 호출의 핫패스에 Postgres 왕복을 추가하고 단위 테스트를 통합 테스트로 만들며, 마침 pgsodium이 deprecation 사이클에 들어간 해에 그 위에 신규 인프라를 쌓는다.
  **결론(의견):** 기본값은 **앱 레벨 AES-256-GCM**으로 잡되 Phase 10 계획 시점에 짧은 스파이크로 확정한다. 근거 — 이 데이터는 "하나의 server action 안에서만 쓰이는 단일 핫패스 비밀"이라는 아주 좁은 모양이고, 프로젝트의 DI/모킹 테스트 규율과도 맞는다. **어느 쪽을 고르든 `byok_keys` 테이블 형태(별도 평문 `masked_hint` 컬럼, owner×provider 유니크)는 동일하고 컬럼만 ciphertext/iv/auth_tag ↔ secret_id로 갈린다** — 즉 결정은 되돌릴 수 있지만 출하 후에는 데이터 마이그레이션이 된다. 계획 시점에 확정하고 구현으로 미루지 않는다.
- **MCP authorization server — 역시 두 문서가 갈린다.** STACK은 "`mcp-handler`는 토큰을 검증만 하고 발급하지 않으므로 외부 AS(WorkOS AuthKit)가 필요하다"고 보고, ARCHITECTURE는 "Supabase Auth가 이미 MCP를 명시 타깃으로 하는 OAuth 2.1 Server 기능을 문서화하고 있으며, 그 경로를 타면 RLS가 정책 코드 0줄로 그대로 적용된다"고 본다.
  **결론(의견):** **Supabase 네이티브 경로를 먼저 시도**한다 — 두 번째 아이덴티티 벤더를 들이지 않고, 도구의 소유권 모델이 앱의 나머지와 문자 그대로 동일해지는 이점이 크다. 단 Phase 13의 **첫 작업은 반드시 스파이크**여야 한다: 실제 Claude custom connector로 discovery/등록/토큰 교환이 왕복하는지, 그리고 Pitfall 7이 요구하는 **즉시 취소(live grant introspection)** 가 그 경로에서 실제로 가능한지를 도구 코드 한 줄 쓰기 전에 확인한다. 실패 시 WorkOS AuthKit이 문서화된 폴백이며, 그 경우 Phase 13의 크기가 실질적으로 커진다(로드맵에 리스크로 표기).
- **CIMD 시대 클라이언트 등록 플로우:** Claude/ChatGPT 커넥터가 실제로 무엇을 보내는지는 구현 시점에 각 벤더 문서로 재확인한다. 지금 확정할 수 없는 종류의 디테일이다.
- **`@workos-inc/authkit-nextjs`의 Next 16.3.x peer 범위**는 이번 리서치에서 독립 확인되지 않았다. 폴백을 택하게 되면 설치 시점 확인 필요.
- **OpenAI Idempotency-Key 헤더 지원 여부**는 구현 시점 확인 항목. 지원한다면 ledger의 `reference_id`와 동일한 값을 파생해 vendor 재시도 의미론이 원장과 같은 방향을 보게 한다(Pitfall 5 완화).
- **미결 제품 질문(요구사항 정의 단계에서 사용자 확인 필요):** (a) BYOK 사용자에게 잔액·비용 게이지를 어떤 단위로 보여줄 것인가(권고: 지갑 토큰이 아니라 추정 통화), (b) BYOK가 호출당 최대 출력 상한(현재 2048)을 올려주는가(권고: 그렇다 — 자기 비용으로 쓰는데 플랫폼 티어 제한을 받는 것은 부조리), (c) MCP 수용 기준 클라이언트를 Claude로 확정할 것인가(ChatGPT Plus/Pro는 developer-mode 읽기 도구까지만 가능하고 쓰기는 Business/Enterprise/Edu 관리자 활성화 필요 — Plus 작가가 필수 대상이면 쓰기 완료 조건이 그들에게는 충족 불가), (d) `propose_kb_document`가 create-only인가 update 가능인가(update면 diff 리뷰 UI가 딸려온다), (e) MCP 초안이 새 회차 draft인가 기존 회차에 붙는 별도 "제안된 초안" 객체인가(리뷰 큐 스코프를 결정한다).

## Sources

집계 출처 전체는 각 리서치 문서(STACK.md / FEATURES.md / ARCHITECTURE.md / PITFALLS.md) 하단 참조. 아래는 로드맵 결정에 직접 영향을 준 것들.

### Primary (HIGH confidence)
- 코드 직접 읽기: `lib/ai/` (gemini, chat, cost, prompt, mentions), `lib/commerce/actions.ts`, `lib/kb/actions.ts`, `supabase/migrations/0001_init.sql`, `supabase/migrations/0005_commerce.sql`, `app/studio/[workId]/chapters/[chapterId]/` — 멱등성 버그, pgcrypto 기활성화, `parseChatResponse` 폴백, admin 클라이언트 선례 모두 실물 확인
- `mcpres/package/` 의 package.json·README — 벤더링된 `mcp-handler@2.1.1` 진위와 현재 API 형태를 파일명이 아닌 메타데이터로 검증
- [openai (npm)](https://www.npmjs.com/package/openai) 7.15.0 · [Node version policy](https://github.com/openai/openai-node/blob/main/NODE_VERSION_POLICY.md) · [@anthropic-ai/sdk (npm)](https://www.npmjs.com/package/@anthropic-ai/sdk) 0.125.0 · [@modelcontextprotocol/server (npm)](https://www.npmjs.com/package/@modelcontextprotocol/server) 2.0.0
- [vercel/mcp-handler](https://github.com/vercel/mcp-handler) · [Vercel Changelog — Latest MCP spec supported](https://vercel.com/changelog/latest-mcp-spec-now-supported-in-mcp-handler) · [AUTHORIZATION.md](https://github.com/vercel/mcp-handler/blob/main/docs/AUTHORIZATION.md)
- [Supabase Docs — Vault](https://supabase.com/docs/guides/database/vault) · [pgsodium (pending deprecation)](https://supabase.com/docs/guides/database/extensions/pgsodium) · [OAuth 2.1 Server](https://supabase.com/docs/guides/auth/oauth-server) · [MCP Authentication](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication)
- [OWASP MCP Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/MCP_Security_Cheat_Sheet.html) — confused deputy, prompt-injection-to-tool-call 체이닝
- [MCP blog — Tool Annotations as Risk Vocabulary](https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/) — annotation은 힌트지 강제가 아니다 (쓰기 도구 설계의 근거)
- [Claude Help — custom connectors using remote MCP](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp) · [OpenAI Cookbook — counting tokens with tiktoken](https://cookbook.openai.com/examples/how_to_count_tokens_with_tiktoken)

### Secondary (MEDIUM confidence)
- [ControlTheory — stop_reason refusal (200 OK)](https://www.controltheory.com/incidents/anthropic-stop-reason-refusal/) · [pydantic-ai #8176](https://github.com/pydantic/pydantic-ai/issues/8176) · [litellm #40903](https://github.com/BerriAI/litellm/pull/40903) — cross-provider refusal 형태 불일치
- [sentry-javascript #1911](https://github.com/getsentry/sentry-javascript/issues/1911) — HTTP 클라이언트 에러의 request config가 트래커로 그대로 들어가는 실증
- [openai-openapi #539](https://github.com/openai/openai-openapi/issues/539) — abort 시 usage 미반환, vendor 이중 과금 탐지 불가 문제의 방증
- [OpenAI Help — API Organization Verification](https://help.openai.com/en/articles/10910291-api-organization-verification) · [Forrester](https://www.forrester.com/blogs/openai-requires-identity-verification-for-access-to-its-latest-models/) — 리드타임 리스크
- [Peliqan — ChatGPT MCP: plans and limits (2026)](https://peliqan.io/blog/chatgpt-mcp/) — Plus/Pro는 읽기 커넥터까지, 쓰기는 Business/Enterprise/Edu
- [Kilo — BYOK](https://kilo.ai/docs/getting-started/byok) (모델 picker의 BYOK 뱃지) · [Novelcrafter AI Connections](https://www.novelcrafter.com/help/docs/ai-connections/openai) · [Cursor — Available models](https://cursor.com/help/models-and-usage/available-models)
- [WorkOS — MCP auth](https://workos.com/mcp) / [AuthKit MCP docs](https://workos.com/docs/authkit/mcp) · [Clerk — Build an MCP server](https://clerk.com/docs/nextjs/guides/ai/mcp/build-mcp-server) — 폴백 AS 후보
- rate-limit 헤더 형태 비교([Requesty](https://www.requesty.ai/blog/rate-limits-for-llm-providers-openai-anthropic-and-deepseek), [DevTk.AI](https://devtk.ai/en/blog/ai-api-rate-limits-comparison-2026/)) — Gemini는 정상 응답에 rate-limit 헤더를 주지 않는다

### Tertiary (LOW confidence — 검증 필요)
- "Vercel serverless에서는 `oidc-provider` 자체 호스팅이 불가능하다"는 주장 — 1차 출처로 추적되지 않음. 어떤 권고도 이 주장에 의존하지 않는다.
- 한국어 텍스트의 provider별 토큰/문자 비율 — 직접 측정된 수치 없음. Phase 9에서 실측 보정 필요.
- `@workos-inc/authkit-nextjs`의 Next 16.3.x 호환 — 독립 확인되지 않음.

---
*Research completed: 2026-09-16*
*Ready for roadmap: yes*
