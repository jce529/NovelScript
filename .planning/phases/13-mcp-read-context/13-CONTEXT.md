# Phase 13: MCP 읽기 도구 + 집필 컨텍스트 번들 - Context

**Gathered:** 2026-11-02
**Status:** Discuss 완료 (사용자 결정 4건 반영), plan 전

<domain>
## Phase Boundary

Phase 12에서 연결된 MCP 클라이언트(Claude 커스텀 커넥터)가 **작가 본인의 작품·회차·설정집을 읽고**, 앱 안에서 멘션으로 생성할 때와 같은 구성의 **집필 컨텍스트 번들**을 한 번에 받아 초안을 쓸 준비를 마치게 한다.

요구사항: MCP-02, MCP-03, MCP-04, MCP-09.

범위 밖: 쓰기 도구·초안 제안 저장·설정집 수정안(Phase 14), 세계수 데이터(Phase 18), 연결 목록의 승인 scope·호출 로그(Phase 12 deferred).

</domain>

<decisions>
## Implementation Decisions

### 사용자 확정 (2026-11-02 discuss)
- **D-P13-01 (번들 입력):** `get_writing_context`는 **작품 ID · 회차 ID · 설정집 노드 ID 목록을 명시적으로 받는다.** 앱에서 작가가 멘션한 문서만 번들에 넣는 방식과 같다. 설정집 전체 포함이나 AI가 검색 결과를 골라 넣는 방식은 택하지 않는다.
- **D-P13-02 (설정집 검색·읽기 범위):** 작품 설정집 **+ 계정 공유 폴더**를 모두 검색·읽기 대상으로 한다. 앱의 멘션 범위(`searchMentionNodes` / `getMentionedNodesContent`의 작품 범위 + account_template 범위)와 같다. 소유권은 계정 기준이며 다른 사용자의 공유 폴더는 보이지 않는다.
- **D-P13-03 (회차 본문 범위):** 작가 본인의 회차는 **초안·미발행·유료·잠금 상태와 무관하게 전부** 조회한다. 작가 본인 데이터이므로 접근 제어는 상태가 아니라 **소유권**으로만 판정한다.
- **D-P13-04 (번들 설정값, 2026-11-02 정정):** 프리셋(AI 지시 3단계)·문체(4종)는 **호출 인자로 받는다.** 인자를 생략하면 앱의 기본값(`intermediate`, `DEFAULT_STYLE_PRESET`)을 쓴다. 이 값들은 DB에 저장되지 않고 AiPanel의 React 상태로만 존재하므로, 이전의 "작가 저장값 기본" 전제는 틀렸다. 작품 시스템 지시만 `work_ai_instructions`(0026)에 저장되어 있으므로 번들이 그 저장값을 읽는다.

### 선행 조건 (Phase 12 CONTEXT에서 이미 결정됨)
- **D-17 (Phase 13 착수 전 필수, 2026-11-02 정정 승인):** OAuth 토큰이 Supabase REST 전체에 닿는 문제를 막는다. 0038은 민감 테이블 10개(wallets, ledger_entries, byok_keys, byok_validation_log, orders, order_items, entitlements, payment_orders, mcp_connections, ai_usage)에만 `client_id is null` RESTRICTIVE RLS를 걸었다(파일 확인). **승인된 방향:** 전 `public` 테이블을 OAuth 토큰에 대해 일괄 차단하고, 작품·회차·설정집·작품 시스템 지시(works, chapters, kb_nodes, work_ai_instructions)만 Phase 13 도구용으로 라이브 grant 조건부 SELECT를 연다. 일괄 차단이 들어가면 기존 Server Action 모듈은 OAuth 토큰으로 직접 쓸 수 없으므로 번들·도구는 bearer 전용 클라이언트와 서버 소유권 검사로 접근한다. 리서처가 센 테이블 수(40개, 미적용 30개)는 아직 확인하지 않았으므로 plan 전 카탈로그로 검증한다. 이 선행 조건이 충족되지 않으면 Phase 13 도구를 열지 않는다.
- **D-11·D-19:** 토큰 수명은 프로젝트 기본값(3600초)을 유지한다. 즉시 차단은 매 호출 grant 조회 RPC가 보장한다.
- **D-09·D-10:** 모든 도구 호출은 살아있는 grant를 DB에서 조회해 통과시키며, 조회 실패 시 fail closed 한다. Phase 13 도구도 이 경로를 그대로 탄다.
- **D-21:** 탈퇴 계정은 RPC에서 차단하고, 정지 계정은 읽기를 허용한다. 쓰기 차단은 Phase 14 몫이다.

### 설계 원칙 (ROADMAP Notes·STATE 제약에서 유지)
- **도구는 user-scoped 클라이언트**(`lib/supabase/server.ts` 계열)를 쓴다. `createAdminClient()`를 복사하지 않는다. 쓰면 bearer 토큰 하나로 교차 사용자 읽기가 가능해지는 confused deputy가 된다. `createAdminClient` import는 그 자체로 추가 리뷰 대상이다.
- **교차 사용자 테스트 스위트:** 모든 도구에 대해 두 번째 사용자 토큰으로 첫 사용자 리소스를 찌르는 테스트를 통과시킨다.
- **`get_writing_context`는 기존 모듈을 재사용한다.** `lib/ai/prompt.ts`의 `composeSystemInstruction` / `assembleUserContent`, `lib/ai/mentions.ts`의 `getMentionedNodesContent`, `lib/ai/work-instructions.ts`의 `getWorkSystemInstruction`을 호출하고 복제하지 않는다(fork 금지).
- **MCP-09 annotation:** 모든 읽기 도구는 `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false`를 붙인다. Phase 12의 `whoami`가 같은 형식을 쓴다.
- **세계수(Phase 18) 데이터는 Phase 13 도구에서 제외한다.** 번들이 세계관 슬롯을 다루지 않는다는 뜻이다. 필요해지면 Phase 14 이후에 다룬다.

### Claude's Discretion (plan 단계에서 정함)
- 도구 이름·입출력 스키마(zod)와 목록·검색 결과 개수 상한·페이지네이션 방식.
- 회차 본문의 반환 형식(평문 vs 원본 마크다운/에디터 형식)과 최대 길이 처리.
- 설정집 검색 방식(제목 부분 일치 vs 본문 포함 검색)과 정렬.
- 번들 응답 구조: 시스템 지시·멘션 문서·문체를 **분리된 필드로** 줄지, 조립된 문자열 하나로 줄지. 분리 쪽이 외부 AI가 쓰기 쉽다.
- **열린 확인 사항:** `composeSystemInstruction`의 `RESPONSE_PROTOCOL_INSTRUCTIONS`(앱 내부 응답 형식: 초안·제안 프로토콜)을 번들에 포함할지 여부. "앱과 같은 구성" 요구사항상 포함이 기본이지만, 외부 AI는 앱의 응답 프로토콜을 따를 필요가 없다. plan 단계에서 번들을 두 층(구성 지시 / 응답 프로토콜)으로 나눠 판단한다. 판단이 어려우면 사용자에게 묻는다.
- 도구 테스트를 DB 없이 할지(모킹) 실DB 테스트로 할지. 교차 사용자 테스트는 실DB 테스트로 한다(Phase 12의 `*.database.test.ts` 패턴, 일회용 DB에서만 실행).

</decisions>

<canonical_refs>
## Canonical References

### 요구사항·로드맵
- `.planning/ROADMAP.md` — Phase 13 항목(Goal, Success Criteria 1~4, Notes)
- `.planning/REQUIREMENTS.md` — MCP-02, MCP-03, MCP-04, MCP-09 (Phase 13 매핑)
- `.planning/STATE.md` — 하드 경계, confused deputy·grant introspection 제약

### 선행 Phase
- `.planning/phases/12-mcp-oauth/12-CONTEXT.md` — D-09~D-21 (grant 조회·fail closed·RLS 선행 조건·whoami 패턴)
- `.planning/phases/12-mcp-oauth/12-06-SUMMARY.md` — 실DB 교차 사용자·해제 차단 증명 결과, Task 2(실 Claude 커넥터) 수동 대기
- 현재 코드: `app/mcp/route.ts`(`whoami` 1개 등록, `withMcpAuth`), `lib/mcp/auth.ts`(`verifyMcpToken`, `readMcpAuthExtra`, `McpUserClient`), `supabase/migrations/0037_mcp_oauth_grants.sql`, `0038_oauth_sensitive_rls.sql`

### 재사용할 집필 모듈
- `lib/ai/prompt.ts` — `composeSystemInstruction`, `assembleUserContent`, `PRESET_INSTRUCTIONS`, `STYLE_PRESETS`, `DEFAULT_STYLE_PRESET`
- `lib/ai/mentions.ts` — `searchMentionNodes`, `getMentionedNodesContent` (작품 + 계정 공유 범위, 소유권 검사 포함)
- `lib/ai/work-instructions.ts` — `getWorkSystemInstruction`
- `lib/kb/actions.ts` — `getWorkKbNodes`, 계정 공유 노드 조회
- `lib/chapters/actions.ts` — `listChapters` (작가 소유 기준)
- `lib/works/actions.ts` — `listWorks`, `getWork`

### 리서치 원본
- `.planning/research/PITFALLS.md` — Pitfall 2(confused deputy), 교차 사용자 공격 시나리오
- `.planning/research/ARCHITECTURE.md` — Pattern 6 (MCP 라우트 위치)

### 규칙
- `CLAUDE.md`, `AGENTS.md` — Next.js 16.3.2 변경 사항은 `node_modules/next/dist/docs/` 확인 후 코드 작성

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- 멘션 검색·본문 조회(`lib/ai/mentions.ts`)는 이미 작품 범위와 계정 공유 범위를 모두 다루며, 두 범위 모두 owner 기준 검사가 들어 있다(Phase 4.1-04).
- 집필 프롬프트 조립(`lib/ai/prompt.ts`)은 Phase 4에서 단위 테스트가 있다. 번들은 이 함수들의 출력을 그대로 쓴다.
- `whoami`는 `readMcpAuthExtra(ctx.http?.authInfo)`로 identity를 얻는다. 도구는 인자에서 사용자 ID를 받지 않는다. Phase 13 도구도 같은 원칙을 따른다.

### Established Patterns
- 소유권은 공유 술어 함수 + RLS 이중 방어(`lib/kb/actions.ts` 패턴). MCP 도구도 같은 술어를 쓴다.
- LLM이 넘긴 ID(`work_id`, `chapter_id`, `node_id`)는 **비신뢰 입력**이다. 매 호출 서버에서 소유권을 재검증한다. 이 원칙은 Phase 14 쓰기에도 이어진다.

### Integration Points
- `app/mcp/route.ts`: 현재 `whoami` 하나. Phase 13 도구를 같은 `createMcpHandler` 안에 등록한다.
- `lib/mcp/`: 도구 모듈을 여기에 둔다(Phase 12 구조 유지).
- 마이그레이션: 최신 번호는 0038. Phase 13은 새 테이블이 필요 없을 가능성이 높다. 필요하면 일회용 DB에서만 검증한다.

</code_context>

<specifics>
## Specific Ideas

- 사용자 의도: MCP는 집필 환경에서 대화로 초안을 함께 쓰는 흐름을 지원하는 것이다. 읽기 전용이 목적이 아니다. 읽기 단계는 Phase 14의 '제안 → 작가 수락' 흐름의 입력이 된다.
- 번들의 핵심 가치는 "앱에서 멘션해 생성한 것과 같은 결과"다. 같은 설정집·같은 프리셋·같은 문체가 들어가야 한다. 그래서 번들은 조립 모듈을 재사용하고 결과를 비교 가능하게 둔다.

</specifics>

<deferred>
## Deferred Ideas

- 세계수(Phase 18) 데이터를 읽기 도구에 노출 — 필요성이 확인되면 이후 phase
- 도구 호출 로그·호출 횟수 표시 — Phase 12 deferred와 함께 후순위
- 쓰기 도구(`save_draft`, `propose_kb_document`) — Phase 14

</deferred>
