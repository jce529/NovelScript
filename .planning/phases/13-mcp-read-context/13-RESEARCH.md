# Phase 13: MCP 읽기 도구 + 집필 컨텍스트 번들 - Research

**Researched:** 2026-11-02
**Domain:** MCP 읽기 도구(mcp-handler + @modelcontextprotocol/server), Supabase RLS 기반 소유권 격리, 집필 프롬프트 번들
**Confidence:** MEDIUM-HIGH (코드·마이그레이션·SDK 소스는 직접 확인해 HIGH, Claude 클라이언트의 한도 수치와 한국어 토큰 비율은 일부 MEDIUM/LOW)

<user_constraints>
## User Constraints (from 13-CONTEXT.md, 요약 인용)

### Locked Decisions
- **D-P13-01** `get_writing_context`는 작품 ID · 회차 ID · 설정집 노드 ID 목록을 명시적으로 받는다. 설정집 전체 포함·AI 검색 결과 자동 포함은 택하지 않는다.
- **D-P13-02** 설정집 검색·읽기 범위는 작품 설정집 + 계정 공유 폴더(`account_template`). 소유권은 계정 기준.
- **D-P13-03** 작가 본인 회차는 초안·미발행·유료·잠금과 무관하게 전부 조회. 접근 제어는 상태가 아니라 소유권.
- **D-P13-04** 프리셋(3단계)·문체(4종)·작품 시스템 지시는 작가의 저장값을 기본으로, 도구 인자로 덮어쓰기 허용.
- **D-17(선행 조건)** `client_id is null` RESTRICTIVE RLS를 전 `public` 테이블에 적용하기 전에는 Phase 13 도구를 열지 않는다.
- **D-09·D-10·D-11·D-19·D-21** 매 호출 grant 조회, fail closed, 토큰 수명 3600초, 탈퇴 차단·정지 읽기 허용.
- 설계 원칙: user-scoped 클라이언트, `createAdminClient` 금지, 교차 사용자 테스트, 기존 모듈 재사용(fork 금지), 읽기 도구 annotation 4종, 세계수(Phase 18) 제외.

### Claude's Discretion
도구 이름·zod 스키마·개수 상한·페이지네이션, 회차 본문 반환 형식·최대 길이, 설정집 검색 방식·정렬, 번들 응답 구조(분리 vs 단일 문자열), `RESPONSE_PROTOCOL_INSTRUCTIONS` 포함 여부(열린 확인 사항), 모킹 vs 실DB 테스트(교차 사용자는 실DB).

### Deferred Ideas (OUT OF SCOPE)
세계수 데이터 노출, 도구 호출 로그·횟수 표시, 쓰기 도구(`save_draft`, `propose_kb_document`, Phase 14).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MCP-02 | 작품 목록·회차 목록·회차 본문 조회 | `listWorks`/`listChapters` 재사용, 본문은 `read_chapter_content` RPC만 가능(컬럼 SELECT revoke, 아래 3절) |
| MCP-03 | 설정집 검색·읽기 | `searchMentionNodes`(제목)·`getMentionedNodesContent`(본문) 재사용, 본문 검색은 추가 쿼리 필요 |
| MCP-04 | 집필 컨텍스트 번들 | `composeSystemInstruction`/`assembleUserContent` 재사용. 단 두 함수가 응답 프로토콜을 무조건 붙이는 점이 핵심 쟁점 |
| MCP-09 | 모든 도구 annotation | SDK 타입에서 4종 힌트 확인, Anthropic 공식 문서가 `title`+`readOnlyHint`를 필수로 규정 |
</phase_requirements>

## 요약

Phase 13은 새 테이블 없이 기존 모듈을 감싸는 도구 6개로 구현할 수 있다. 다만 사전 조사에서 **plan 전에 결정해야 할 구조적 충돌 2건**이 나왔다.

1. **D-17과 "user-scoped 클라이언트 + 기존 모듈 재사용"이 그대로는 양립하지 않는다.** 도구가 OAuth bearer로 `works`·`chapters`·`kb_nodes`·`work_ai_instructions`를 읽는 순간, D-17의 전 테이블 `client_id is null` RESTRICTIVE 정책이 그 읽기를 막는다. 현재 0038은 10개 테이블만 덮고(40개 중), 나머지 30개는 안 덮는다. 해결안은 "읽기 4개 테이블만 SELECT 허용 + 라이브 grant 조건, 쓰기는 차단, 나머지 26개는 일괄 차단"이다(권장안 R1). 이는 Phase 12 D-17 문구의 수정이므로 사용자 승인이 필요하다.
2. **D-P13-04의 "작가의 저장값" 중 프리셋·문체는 저장된 값이 없다.** `AiPanel`의 React `useState`(기본 `intermediate` / `concise-hemingway`)일 뿐 DB 컬럼이 없다. 저장값이 있는 것은 작품 시스템 지시(`work_ai_instructions`)와 작품 장르(`works.genre`)뿐이다.

추가로, **회차 본문은 `chapters.content` 컬럼을 읽을 수 없고**(anon/authenticated SELECT revoke, 0009) `read_chapter_content` RPC로만 읽는다. 이 RPC는 소유자 전용이 아니라 `can_view`(공개 열람 가능)까지 통과시키므로 도구가 직접 소유권을 재검증해야 한다. `works_public_read` 정책 때문에 `works`도 RLS만으로는 타인 작품이 보인다. 즉 이 코드베이스에서는 **RLS만으로 교차 사용자 격리가 성립하지 않는 테이블이 있고**, 서버 측 `owner_id` 재검증이 필수다.

**Primary recommendation:** bearer 전용 cookie-less user-scoped 클라이언트 + 모든 쿼리에 `ownerId=인증 identity` 강제 + 읽기 4개 테이블만 라이브 grant 조건부 SELECT 허용(R1) + 도구 핸들러에서 모든 예외 포착·정제 메시지 반환 + 번들은 `systemInstruction`/`userContext` 두 문자열과 manifest로 반환하되 응답 프로토콜은 기본 제외(`prompt.ts`에 옵션 추가).

## 확정 가능한 권장안

| # | 권장안 | 근거 | 신뢰도 |
|---|--------|------|--------|
| R1 | D-17을 "전 테이블 일괄 차단"에서 "26개 차단 + 읽기 4개 라이브 grant 조건부 SELECT, 쓰기 3종 차단"으로 정정한다 | 아래 3절. 일괄 차단하면 도구가 기존 모듈로 읽을 수 없음 | HIGH(충돌 사실), MEDIUM(해법 선택은 사용자 승인) |
| R2 | 도구용 클라이언트는 `createClient(url, anonKey, {global:{headers:{Authorization:`Bearer ${authInfo.token}`}}, auth:{persistSession:false,...}})`로 만든다. `lib/supabase/server.ts`의 `createClient()`는 쓰지 않는다 | `server.ts`는 `cookies()` 기반이라 MCP 요청에서 브라우저 쿠키 세션과 섞일 위험, bearer와 무관. `lib/mcp/auth.ts`의 `createSupabaseUserClient`가 같은 방식(타임아웃 5초는 데이터 조회용으로 늘릴 것) | HIGH |
| R3 | 모든 도구는 `readMcpAuthExtra(ctx.http?.authInfo)`로 `userId`만 쓰고 인자에서 사용자 ID를 받지 않는다. 모든 입력 스키마는 `z.strictObject` | `whoami` 패턴, 알 수 없는 인자(`user_id` 등) 거부 | HIGH |
| R4 | 도구 핸들러는 `try/catch`로 전부 감싸고 정제된 한국어 메시지만 `isError:true`로 반환한다 | SDK는 핸들러가 던진 예외의 `error.message`를 그대로 클라이언트에 돌려준다(`mcp-DIH4cS6P.mjs` tools/call 핸들러 확인). 재사용 함수 `listWorks`·`listChapters`·`readChapterContent`는 `throw new Error(error.message)`(Supabase 오류 원문)를 던진다 | HIGH |
| R5 | 소유 아닌 리소스와 존재하지 않는 리소스는 **동일한 "찾을 수 없어요" 응답**으로 통일한다 | 존재 여부 오라클 방지. 기존 `listChapters`도 비소유 시 `[]` | HIGH |
| R6 | 회차 본문은 평문 그대로 반환한다(에디터가 textarea라 서식·마크다운 변환 없음). `get_chapter`는 `offset`/`maxChars` 인자와 `totalChars`·`nextOffset`·`truncated`를 반환한다 | 에디터는 `<textarea>`(`app/studio/.../AiPanel.tsx` 주석 "Current editor textarea content"), Claude.ai 도구 결과 한도 약 150,000자 | HIGH(형식) / MEDIUM(수치) |
| R7 | 번들은 `systemInstruction`(composeSystemInstruction 결과) + `userContext`(assembleUserContent 결과) 두 문자열 + `manifest`(포함·누락 ID, 크기, 적용 설정)로 반환한다 | 5절. 기존 두 함수를 그대로 호출해 "앱과 같은 구성"을 보장하고, 내용 중복 없이 분리 | MEDIUM(설계 판단) |
| R8 | `RESPONSE_PROTOCOL_INSTRUCTIONS`와 `assembleUserContent` 마지막의 `[REPLY]/[DRAFT]/[DOCUMENT] 형식을 지키세요` 문장은 번들 기본값에서 **제외**하고, 인자 `includeAppResponseProtocol`(기본 false)로 옵트인한다. 이를 위해 `prompt.ts`의 두 함수에 기본값이 기존 동작인 선택 옵션을 추가한다 | 5절. 두 함수가 프로토콜을 하드코딩해 호출만으로는 제외 불가 | MEDIUM(사용자 판단 사항, 열린 질문 Q3) |
| R9 | 설정집 검색은 제목 부분 일치(기존 `searchMentionNodes` 재사용) + 본문 부분 일치(신규 쿼리, 같은 두 범위)를 한 도구 `search_kb`에서 제공한다. 빈 질의는 목록(`getWorkKbNodes` + `getAccountSharedNodes`)을 반환한다. 인덱스 추가는 하지 않는다(마이그레이션 불필요) | 6절 | MEDIUM |
| R10 | 도구 6개: `list_works`, `list_chapters`, `get_chapter`, `search_kb`, `get_kb_document`, `get_writing_context`. 이름 모두 64자 이하, 모두 `title`+annotation 4종 | Anthropic 검토 기준 | HIGH |

## Standard Stack

### Core
| Library | 설치 버전 | 최신(npm view, 2026-11-02) | Purpose | 비고 |
|---------|----------|---------------------------|---------|------|
| mcp-handler | 2.3.0 | 2.3.0 | Next 라우트용 MCP 핸들러, `withMcpAuth` | 최신. 변경 불필요 |
| @modelcontextprotocol/server | 2.3.1 | 2.4.0 | `registerTool`, AuthInfo 타입 | 최신보다 한 단계 낮음. 이 phase에서 올리지 않는다(변경 이유 없음) |
| zod | ^4.4.3 | - | 도구 입력 스키마 | `z.strictObject` 사용 중 |
| @supabase/supabase-js | ^2.112.4 | - | bearer 클라이언트 | `auth.ts`와 동일 방식 |

신규 설치 패키지는 없다.

### Don't Hand-Roll
| 문제 | 직접 만들지 말 것 | 대신 쓸 것 | 이유 |
|------|------------------|-----------|------|
| 시스템 지시 조립 | 번들용 문자열 이어붙이기 | `composeSystemInstruction` | fork 금지(D), 앱과 동일성 보장 |
| 사용자 컨텍스트 조립 | 설정집·본문 포맷 | `assembleUserContent` | 동일 |
| 멘션 노드 본문 해석 | 새 쿼리 | `getMentionedNodesContent` | 작품+공유 범위, owner 검사 내장 |
| 작품 시스템 지시 읽기 | 직접 select | `getWorkSystemInstruction` | zod 검증 + 소유권 + 정제된 오류 |
| 인증 identity | 요청 헤더·인자 파싱 | `readMcpAuthExtra` | 검증된 AuthInfo만 신뢰 |
| 도구 입력 검증 | 수동 파싱 | zod `strictObject` + SDK 검증 | 실패 시 InvalidParams가 isError 결과로 변환됨 |

## 1. mcp-handler / SDK 확인 결과 (HIGH, 설치된 패키지 소스 직접 확인)

- `registerTool(name, config, cb)` 의 `annotations`는 `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` 모두 선택 불린으로 타입 정의(`@modelcontextprotocol/core` `auth-Anm-lwWi.d.mts` 2324~2327행). `whoami`가 이미 4종을 쓴다.
- 도구를 여러 개 등록해도 같은 `createMcpHandler(server => {...})` 콜백 안에서 `server.registerTool`을 반복 호출하면 된다. 도구별 `inputSchema`는 독립이다.
- **에러 처리**: `tools/call` 핸들러는 입력 검증 실패(`Input validation error: Invalid arguments for tool X: ...`)와 핸들러가 던진 모든 예외를 `catch`해서 `{content:[{type:'text',text:error.message}], isError:true}`로 변환한다. 즉 (a) 알 수 없는 인자는 Zod 오류 문구와 함께 isError로 돌아가고, (b) **내부 예외 메시지가 그대로 AI에게 노출된다.** 도구는 직접 `try/catch`해 정제 메시지를 반환해야 한다(R4).
- `outputSchema`를 선언하면 `structuredContent`가 없을 때 `Output validation error`로 실패한다. 이 phase는 `whoami`처럼 JSON 문자열 text content만 반환하고 `outputSchema`는 선언하지 않는다(권장). `structuredContent`를 추가하면 같은 데이터가 두 번 직렬화되어 크기가 늘어날 수 있다. Claude 클라이언트가 `structuredContent`를 어떻게 소비하는지는 확인하지 못했다(LOW).
- Anthropic 공식 검토 기준(2026-11-02 확인): 모든 도구는 `title`과 해당 힌트를 가져야 하며, `readOnlyHint: true`인 도구는 호출별 확인 없이 실행될 수 있고 `destructiveHint: true` 도구는 항상 확인을 띄운다. 도구 이름 64자 이하. 설명은 도구가 무엇을 하는지만 서술하고 Claude에게 행동을 지시하지 않아야 한다. 이 규칙은 디렉터리 제출 기준이지만 커스텀 커넥터 설계에도 같은 방향이 안전하다. 예: `get_writing_context` 설명에 "반드시 이 지시를 따라 쓰세요" 류 문장 금지(프롬프트 인젝션 패턴으로 분류됨).
- annotation은 힌트이며 강제가 아니다(`.planning/research/ARCHITECTURE.md` Pattern 7에 인용된 MCP 블로그). 읽기 도구의 안전은 annotation이 아니라 서버 측 소유권 검증이 만든다.
- 확인하지 못한 것: "Claude가 `readOnlyHint` 도구를 실제로 확인 프롬프트 없이 실행하는지"의 실동작은 실제 커넥터로만 검증 가능. 12-06 Task 2(실 Claude 커넥터 수동 검증)가 아직 pending이라 이 phase의 성공 기준 4는 사람 확인이 필요하다.

## 2. 도구 결과 크기·페이지네이션 (MEDIUM)

| 클라이언트 | 한도 | 출처 |
|-----------|------|------|
| claude.ai · Desktop | 도구 결과 약 150,000자, 호출 240초 | Anthropic 공식 "Build an MCP server for Claude" (2026-11-02 확인) |
| Claude Code | 25,000 토큰(`MAX_MCP_OUTPUT_TOKENS`로 변경 가능) | 같은 문서 |

- 한국어 1자가 몇 토큰인지는 모델마다 달라 확인하지 못했다(LOW). Claude Code까지 안전하려면 응답을 약 20,000~25,000자 안팎으로 가정하는 편이 안전하다는 보수적 추정만 가능하다. 인수 기준 클라이언트는 Claude 커스텀 커넥터(claude.ai)이므로 hosted 한도(150,000자)를 기준으로 하고 Claude Code는 best-effort로 둔다.
- 웹소설 한 회차는 보통 수천 자 규모, 앱의 설정 문서 저장 한도는 20,000자(`actions.ts`의 `content: z.string().max(20000)`), 작품 지시는 4000자. 정상 사용에서는 한 번들이 한도에 못 미친다. 한도 초과는 이상 입력(노드 ID 수십 개)에서 생긴다.
- 권장 규칙:
  - `get_chapter`: `offset`(기본 0)·`maxChars`(기본 30,000, 상한 60,000) 인자, 응답에 `totalChars`, `offset`, `nextOffset|null`, `truncated`. 잘림은 항상 표시하고 조용히 자르지 않는다.
  - `get_writing_context`: 총 응답 상한 약 100,000자(150,000자 한도에 JSON 이스케이프·메타 여유). 입력 `nodeIds` 개수 상한(예: 20, 앱의 `MAX_ATTACHMENTS`류 상수와 맞출지는 plan에서 확인), 직전 본문은 `precedingMaxChars`(기본 30,000)로 **끝부분(최근 글)을 남기고** 앞을 자른다. 상한을 넘으면 자르지 말고 "어떤 ID를 줄이세요" 형태의 실행 가능한 오류를 반환한다(Anthropic 기준도 실행 가능한 오류 메시지 요구).
  - 목록·검색 도구: `limit` 기본 20(앱 `searchMentionNodes`와 같은 20), 상한 50, `offset` 기반. 정렬은 안정적으로(작품: `created_at desc`, 회차: `order_index`, 설정집: `name`).
- 페이지네이션은 MCP 스펙의 cursor 방식이 `tools/list` 같은 목록 RPC용이라 도구 결과에는 해당하지 않는다. 인자 기반 offset이 일반 관행이다(벤더 블로그 권고 수준, LOW). `_meta["anthropic/maxResultSizeChars"]`는 Claude Code 전용 비공식 정보(LOW)라 사용하지 않는다.

## 3. 교차 사용자 접근 차단과 D-17 현황 (HIGH, 마이그레이션 파일 직접 확인)

### 3.1 이 코드베이스의 실제 격리 구조
- `works`: `works_owner_all`(owner) + **`works_public_read`: `deleted_at is null`이면 누구나 SELECT**(0003). 즉 OAuth bearer든 익명이든 타인의 미발행 작품 행도 RLS로는 보인다. 서버 `owner_id` 필터 필수.
- `chapters`: owner 정책 + `chapters_public_read`(발행분 공개). **`chapters.content` 컬럼은 anon/authenticated에서 SELECT revoke**(0009 헤더 주석). 본문은 `read_chapter_content(p_chapter_id)` RPC(SECURITY DEFINER, authenticated 실행 가능)로만 읽고, 이 RPC는 `can_view`(공개 열람 가능) **또는** 작품 소유자를 통과시킨다. 따라서 호출 전에 `works.owner_id = userId`를 반드시 재검증해야 한다(타인의 무료 발행 회차가 반환되는 것을 막기 위해). 소유자 분기는 초안·유료·블라인드와 무관하게 본문을 돌려주므로 D-P13-03과 일치한다.
- `kb_nodes`·`work_ai_instructions`: owner 전용(공개 정책 없음). `kb_nodes_owner_all`은 `deleted_at is null`까지 포함.
- 정지 계정: 0008의 RESTRICTIVE 가드는 INSERT/UPDATE에만 걸려 읽기는 허용(D-21과 일치).

### 3.2 충돌: D-17 전 테이블 정책 vs OAuth bearer 읽기
0038의 정책 `oauth_browser_only`는 `(auth.jwt()->>'client_id') is null`을 `as restrictive for all to authenticated`로 건다. 이를 `works`/`chapters`/`kb_nodes`/`work_ai_instructions`에도 그대로 적용하면 OAuth bearer(= MCP 도구의 데이터 클라이언트)는 **SELECT도 0행**이 된다. 반대로 적용하지 않으면 D-17의 목적(토큰이 REST 전체에 닿는 문제)이 이 4개 테이블에서 남는다. 특히:
- **폐기된 grant의 토큰이 만료 전(최대 3600초)에 REST로 직접 읽을 수 있다.** 현재 즉시 차단은 `/mcp` 라우트의 `mcp_authorize_call()`에만 있고, PostgREST 직접 호출은 JWT 서명만 본다(sensitive-rls 테스트가 민감 테이블에서만 이를 막는다).
- 그래서 읽기 4개 테이블은 "OAuth bearer를 완전 차단"이 아니라 "OAuth bearer는 라이브 grant가 있을 때만 SELECT"가 되어야 한다. 이를 위해 부수효과 없는(`last_used_at` 갱신 없음) `stable` 보조 함수(예: `public.mcp_grant_is_live()`, `mcp_authorize_call`의 조건부와 같은 grant·세션·동의·프로필 조회)가 필요하다. 정책 식은 `(select auth.jwt()->>'client_id') is null or (select public.mcp_grant_is_live())` 형태로 InitPlan화해 행마다 재평가되지 않게 한다.
- 위 4개 테이블의 INSERT/UPDATE/DELETE는 OAuth bearer 차단(`client_id is null` RESTRICTIVE, 명령별 정책). Phase 14의 쓰기는 별도 제안 테이블/RPC로 가므로 영향 없다.

### 3.3 D-17 현황 표 (40개 테이블, 마이그레이션 0001~0038 기준)

| 구분 | 테이블 | 0038 적용 | Phase 13 처리 |
|------|--------|----------|--------------|
| 이미 차단 (10) | wallets, ledger_entries, byok_keys, byok_validation_log, orders, order_items, entitlements, payment_orders, ai_usage, mcp_connections(0037에도 자체 정책) | 예 | 변경 없음 |
| **MCP 읽기 4개** | works, chapters, kb_nodes, work_ai_instructions | 아니오 | SELECT는 라이브 grant 조건부 허용, 쓰기 3종 차단(R1) |
| 사용자 본인 데이터, 미적용 (7) | profiles, work_likes, reading_progress, work_subscriptions, work_bookmarks, chapter_reading_state, reports | 아니오 | 일괄 차단 대상 |
| 관리자 (5) | admin_users, admin_actions, user_sanctions, warning_acknowledgements, moderation_review_requests | 아니오 | 일괄 차단 대상 |
| AI 문서 계획 (4) | ai_doc_activation_approvals, ai_doc_activation_evidence, ai_doc_plan_shadow_log, ai_doc_plan_decision_log | 아니오 | 일괄 차단 대상 |
| 기타 (5) | ai_generation_locks, kb_template_seed_catalog, kb_template_backfill_copies, payment_topup_tiers, publication_notifications | 아니오 | 일괄 차단 대상 |
| 세계수 (5) | world_branches, world_branch_docs, world_eras, world_era_placements, world_branch_notices | 아니오 | 일괄 차단 대상(Phase 18 데이터는 도구에서 제외 원칙) |

- 미적용 합계 30개 = 읽기 4 + 일괄 차단 대상 26. 모든 테이블에 RLS는 켜져 있다(마이그레이션 grep으로 확인).
- 한계: 이는 **마이그레이션 파일 기준 목록**이다. 실제 DB에 대시보드·확장으로 만든 테이블이 있으면 빠진다. plan의 Wave 0에서 일회용 DB에 `select tablename from pg_tables where schemaname='public' except select tablename from pg_policies where schemaname='public' and policyname='oauth_browser_only'`로 대조해야 한다. `0031` 번호는 파일이 없다(번호 공백, 영향 불명). 다음 번호는 0039이나 병합 직전에 재확인한다.
- **D-17이 다루지 않는 면: RPC.** `authenticated`에 EXECUTE가 부여된 SECURITY DEFINER/INVOKER 함수가 많다(그랜트 구문만 19건 확인, 0019는 동적 루프): `create_purchase_order`, `pay_purchase_order`, `soft_delete_kb_node`, `create_chapter_atomic`, `begin_world_branch`, `confirm_world_branch`, `save_world_timeline`, `read_chapter_content` 등. SECURITY DEFINER는 테이블 RLS를 우회하므로 테이블 정책으로 막히지 않는다. OAuth bearer가 REST `/rpc/...`로 호출할 수 있는지는 함수별로 확인해야 하며 이 조사에서는 전수 검증하지 못했다(미검증). 최소 조치는 (a) 전수 목록화, (b) 쓰기·결제성 함수에 `client_id is null` 가드 추가 여부를 사용자와 정하기, (c) `read_chapter_content`의 OAuth 직접 호출 경로는 MCP 전용 RPC 또는 가드로 정리하기다.
- **공유 DB 규칙(위험 R6)**: 공유 Supabase 프로젝트 `ymudwg…`에는 어떤 마이그레이션도 적용하지 않는다. 0037·0038도 공유 DB에는 아직 미적용(12-06-SUMMARY)이며 병합 후 별도 승인 대상이다. Phase 13의 새 마이그레이션(0039)은 일회용 `anzafn…`에만 적용·검증한다. 테스트 파일은 기존 `assertDisposableRef`(공유 ref 접두 `ymudwg` 거부, API·DB URL ref 일치 확인) 패턴을 반드시 복사한다.

## 4. 재사용 모듈 표 (시그니처 직접 확인)

| 파일:함수 | 시그니처(요지) | 역할 | MCP 사용 시 주의 |
|----------|---------------|------|------------------|
| `lib/ai/prompt.ts:composeSystemInstruction` | `({presetLevel, styleId, genre, documentPlan?, customInstruction?, workSystemInstruction?}) => string` | baseline + 작품 지시 + 장르 + 문체 + 프리셋 + (documentPlan) + **RESPONSE_PROTOCOL(무조건 마지막)** | 프로토콜 제외 옵션 없음. 작품 지시는 beginner에서 무시, customInstruction은 freeform에서만 적용 |
| `lib/ai/prompt.ts:assembleUserContent` | `({mentionedDocs:{name,category,content}[], precedingText, chatHistory:ChatTurn[], contextKind?}) => string` | 설정 문서 + 직전 본문 + 대화 + **마지막에 "[REPLY]/[DRAFT]/[DOCUMENT] 형식을 지키세요" 고정 문장** | 외부 AI는 `chatHistory: []`. 마지막 문장 제외 옵션 없음 |
| `lib/ai/prompt.ts:PRESET_INSTRUCTIONS / STYLE_PRESETS / DEFAULT_STYLE_PRESET` | 상수 | 프리셋 3종·문체 4종, 기본 `concise-hemingway` | zod enum은 이 키에서 생성(키 복제 금지) |
| `lib/ai/mentions.ts:getMentionedNodesContent` | `(supabase, {ownerId, workId, nodeIds}) => MentionedDoc[]` (`id,name,category,content`) | 작품 범위 + 계정 공유 범위 본문, 두 쿼리 모두 `owner_id` 고정 | 요청 ID 중 못 찾은 것은 **조용히 누락**. `node_type` 필터 없음(폴더 ID는 content `''`로 포함될 수 있음). 오류는 `throw new Error(error.message)` |
| `lib/ai/mentions.ts:searchMentionNodes` | `(supabase, {ownerId, workId, query}) => MentionCandidate[]` | 제목 `ilike` 검색, 작품(5카테고리+custom) + 공유(전 카테고리), 각 20건, `name` 정렬 | 빈 질의는 `[]`. `%`·`_` 이스케이프 없음. 본문 검색 아님. 오류는 throw |
| `lib/ai/work-instructions.ts:getWorkSystemInstruction` | `(supabase, {ownerId, workId}) => {ok:true,instruction}|{ok:false,error}` | 소유권(owner_id+deleted_at) 확인 후 `work_ai_instructions` 읽기 | 정제된 한국어 오류, 예외 없음. `import 'server-only'` |
| `lib/kb/actions.ts:getWorkKbNodes` | `(supabase,{ownerId,workId}) => FlatKbNode[]` | 작품 범위 노드 목록(본문 없음) | 오류 시 빈 배열(조용히 삼킴) |
| `lib/kb/actions.ts:getAccountSharedNodes` | `(supabase,{ownerId}) => FlatKbNode[]` | 계정 공유 노드 목록 | 동일 |
| `lib/chapters/actions.ts:listChapters` | `(supabase,{ownerId,workId}) => rows` | 소유 확인 후 회차 목록(`id,title,order_index,is_published,price_tier,folder_id`), `order_index` 정렬 | 비소유면 `[]`. 오류는 throw |
| `lib/access/actions.ts:readChapterContent` | `(supabase, chapterId) => string|null` | `read_chapter_content` RPC | **호출 전에 작품 소유 확인 필수**(RPC가 공개 열람도 통과). 오류는 throw |
| `lib/works/actions.ts:listWorks` / `getWork` | `(supabase,{ownerId})` / `(supabase,{ownerId,workId})` | 소유 작품 목록·단건(`id,title,synopsis,cover_image_url,genre,...`) | `getWork`는 오류를 삼키고 `null`. 장르 null이면 앱은 `GENRES[0]`(`'로맨스'`) 사용 |
| `lib/mcp/auth.ts:readMcpAuthExtra` | `(authInfo) => {userId,sessionId,grantScopes}|null` | 검증된 identity | 도구 첫 줄에서 null이면 isError |
| `lib/mcp/auth.ts:createSupabaseUserClient`(비공개) | `(url, anonKey, bearer)` | bearer를 Authorization 헤더로 쓰는 cookie-less 클라이언트 | export하거나 `lib/mcp/db-client.ts`에 같은 방식으로 새로 만든다. `timedFetch`(5초)는 읽기용으로 조정 |

`getWork`/`listWorks`는 `'server-only'`가 아니지만 `work-instructions.ts`는 `server-only`다. 라우트 핸들러는 서버 환경이라 문제없다(Phase 12도 `lib/mcp/auth.ts`에서 사용). 단위 테스트에서는 기존 `tests/helpers/server-only-stub.ts`가 필요하다.

## 5. 집필 컨텍스트 번들

### 5.1 앱이 실제로 조립하는 방식 (`lib/ai/chat.ts`)
1. `getMentionedNodesContent(supabase, {ownerId, workId, nodeIds})`
2. 첨부 파일(번들에는 해당 없음)
3. `composeSystemInstruction({presetLevel, styleId, genre, customInstruction, workSystemInstruction})` — `workSystemInstruction`은 서버가 `getWorkSystemInstruction`으로 읽는다(클라이언트 입력 아님, `actions.ts` 131~154행)
4. `assembleUserContent({mentionedDocs, precedingText, chatHistory, contextKind})`
5. 입력은 `precedingText`(편집기의 회차 전체 텍스트), `genre`(작품 장르 기본, 패널에서 변경 가능), `presetLevel`/`styleId`/`customInstruction`(패널 상태)

### 5.2 저장값 현황 (D-P13-04의 사실관계)
| 설정 | 저장 위치 | 번들 기본값 |
|------|----------|-------------|
| 작품 시스템 지시 | `work_ai_instructions.instruction` (DB, 소유자 전용) | 저장값. 없으면 `''` |
| 장르 | `works.genre` (DB) | 저장값, null이면 `'로맨스'` |
| 프리셋 3단계 | **저장 없음**(`AiPanel` 로컬 상태, 기본 `intermediate`) | 앱 기본값 `intermediate`, 인자로 덮어쓰기 |
| 문체 4종 | **저장 없음**(로컬 상태, 기본 `DEFAULT_STYLE_PRESET`=`concise-hemingway`) | 앱 기본값, 인자로 덮어쓰기 |
| 자유형 customInstruction | **저장 없음**(로컬 상태, freeform에서만 전송) | 없음, 인자로만 |

따라서 프리셋·문체의 "저장값을 기본으로"는 현재 불가능하고 "앱 UI 기본값을 기본으로"만 가능하다. 저장하려면 새 컬럼과 UI 변경이 필요하다(Phase 13 범위 밖 가능성이 큼). 번들 `manifest.settings`에 각 값의 `source`(`saved`|`default`|`override`)를 넣어 AI와 작가가 무엇이 적용됐는지 알 수 있게 한다.

### 5.3 RESPONSE_PROTOCOL 포함 여부 근거
- 사실: `composeSystemInstruction`은 `RESPONSE_PROTOCOL_INSTRUCTIONS`를 **조건 없이 마지막에** 붙이고, `assembleUserContent`도 마지막에 "위에서 지시한 [REPLY]/[DRAFT]/[DOCUMENT] 형식을 반드시 지키세요"를 붙인다. 호출만으로는 제외할 수 없다.
- 프로토콜의 용도: 앱의 `parseChatResponse`(`lib/ai/chat.ts`)가 `[REPLY]/[DRAFT]/[DOCUMENT]`를 파싱해 UI 버블·초안·문서 제안으로 나누기 위한 약속이다. 외부 AI(Claude)는 자기 대화창에서 작가와 말하고, 초안은 Phase 14의 `save_draft` 같은 **도구 호출**로 돌려준다. 그 경우 프로토콜 태그는 파싱하는 쪽이 없어 대화에 노이즈가 되고, "한 응답에 [DRAFT]와 [DOCUMENT]를 함께 쓰지 마세요" 같은 규칙이 Phase 14 도구 흐름과 충돌할 수 있다.
- 포함해야 한다는 근거: ROADMAP 성공 기준 3 "앱 안에서 생성한 것과 같은 구성", REQUIREMENTS MCP-04 "앱 안에서와 같은 구성". 단 "구성"을 (설정집 + 프리셋 + 문체 조합)으로 괄호 정의하므로 응답 프로토콜은 구성 요소가 아니라 출력 형식이라는 해석이 자연스럽다.
- **권장**: 기본 제외 + 옵트인(`includeAppResponseProtocol`). 구현은 `prompt.ts`에 `ComposeSystemInstructionInput.includeResponseProtocol?: boolean`(기본 true), `AssembleUserContentInput.includeResponseDirective?: boolean`(기본 true)를 추가하는 최소 변경이다. 기본값이 기존 동작이므로 Phase 4의 기존 단위 테스트가 그대로 통과해야 하며, 기본 호출 출력이 변경 전과 문자 단위로 같다는 회귀 테스트를 추가한다. 이 변경은 `prompt.ts` 수정이므로 plan에서 명시적 작업으로 잡는다. 최종 판단은 사용자(열린 질문 Q3).
- 번들에서 `documentPlan`은 쓰지 않는다(설정 문서 생성 계획 흐름은 앱 전용).

### 5.4 번들 필드 제안
```jsonc
{
  "systemInstruction": "...",          // composeSystemInstruction 결과(프로토콜 기본 제외)
  "userContext": "...",                // assembleUserContent 결과(chatHistory=[], 끝 지시문 기본 제외)
  "manifest": {
    "work":    { "id": "...", "title": "...", "genre": "로맨스" },
    "chapter": { "id": "...", "title": "...", "orderIndex": 3, "totalChars": 5200, "includedChars": 5200, "truncated": false },
    "docs":    [ { "id": "...", "name": "...", "category": "인물", "scope": "work|account_template", "chars": 1800 } ],
    "missingNodeIds": ["..."],         // 못 찾았거나 접근 불가(두 경우 구분하지 않음)
    "settings": {
      "presetLevel":  { "value": "intermediate", "source": "default" },
      "style":        { "value": "concise-hemingway", "source": "default" },
      "workInstruction": { "applied": true, "source": "saved" },
      "customInstruction": { "applied": false },
      "includesAppResponseProtocol": false
    },
    "totalChars": 31200
  }
}
```
- 분리 근거: CONTEXT 재량 항목("분리 쪽이 외부 AI가 쓰기 쉽다"). 완전 분해(문서 배열을 별도 필드로)는 `assembleUserContent`를 호출하지 않아 fork가 되므로, "두 문자열 + 구조화된 manifest" 절충이 재사용 원칙과 가독성을 함께 만족한다. 내용(`docs[].content`)은 `userContext`에만 있어 중복이 없다.
- 입력: `workId`(uuid), `chapterId`(uuid), `nodeIds`(uuid 배열, 기본 `[]`), `presetLevel?`, `styleId?`, `genre?`, `customInstruction?`(freeform에서만 의미), `workSystemInstruction?`(덮어쓰기, 최대 4000자 — `WORK_INSTRUCTION_MAX_LENGTH`), `precedingMaxChars?`, `includeAppResponseProtocol?`. zod enum은 `PRESET_INSTRUCTIONS`/`STYLE_PRESETS`의 키와 `GENRES`에서 생성한다.
- 덮어쓰기는 **그 호출에만 적용하고 저장하지 않는다**(읽기 도구, `idempotentHint: true` 유지). `customInstruction`은 앱의 `CUSTOM_INSTRUCTION_MAX_LENGTH`와 같은 상한을 쓴다(값은 `lib/ai/regenerate-contract.ts`에서 확인, 이 조사에서는 상수명만 확인).
- 흐름(모두 `ownerId = readMcpAuthExtra().userId`): ① `getWork` → null이면 "찾을 수 없어요" ② 회차가 그 작품 소속인지 `listChapters`로 확인(소유 재검증 후 `readChapterContent`) ③ `getMentionedNodesContent`(요청 ID와 결과 ID 차집합이 `missingNodeIds`) ④ `getWorkSystemInstruction`(`ok:false`면 오류 반환, 조용히 `''`로 대체하지 않음) ⑤ 두 조립 함수 호출 ⑥ 크기 검사.
- 앱과의 동일성 검증: 같은 입력으로 `chat.ts` 경로가 만드는 `systemInstruction`/`contents`와 번들 출력이 (프로토콜 옵션을 켠 상태에서) 문자열 동일함을 단위 테스트로 못 박는다.

## 6. 설정집 검색(MCP-03) 쿼리와 인덱스 현황 (HIGH)

- 기존: `searchMentionNodes` = `kb_nodes`에 `owner_id`·`work_id`·`scope='work'`·`node_type='file'`·`ilike('name','%q%')`·`deleted_at is null`·`order('name')`·`limit(20)`, 공유 범위는 `scope='account_template'`. **제목만** 검색하고 본문은 안 본다.
- 인덱스(0002·0010·0023·0032): `kb_nodes_work_category_idx(work_id, category)`, `kb_nodes_parent_idx`, `kb_nodes_owner_scope_idx(owner_id, scope)`(모두 `deleted_at is null` 부분 인덱스), `kb_nodes_sibling_name_unique`, 카테고리 루트 유니크 등. **`pg_trgm`/GIN/tsvector 인덱스는 없다**(grep으로 확인). `ilike '%q%'`는 소유자별 행 범위 안에서 순차 검색이다. 작가당 설정집 규모(수십~수백 문서)에서는 문제없다. 규모가 커지면 `pg_trgm` GIN을 새 마이그레이션으로 추가(일회용 DB 검증 필수).
- 권장: 제목 검색은 `searchMentionNodes` 재사용. 본문 검색은 같은 두 범위에 `content ilike` 쿼리를 추가(신규 함수, `lib/mcp/` 안에 두고 owner_id 필터 필수)하고 서버에서 질의어 주변 snippet(약 80자)을 만들어 반환한다. 결과에 `matchedIn: 'name'|'content'`, `scope`, `category`를 넣는다. 질의어 길이 상한(예: 100자).
- 함정: (a) `ilike` 패턴에 `%`·`_`·`\`가 들어오면 와일드카드로 해석된다. 이스케이프 후 사용. (b) PostgREST `.or('name.ilike.%q%,content.ilike.%q%')` 문자열에 질의어를 이어붙이면 `,`·`(`·`)`가 필터 문법을 깨거나 필터를 주입한다. `.or()`에 사용자 문자열을 넣지 말고 쿼리 두 개로 나눠 합치거나 따옴표 이스케이프를 한다(권장: 쿼리 분리). (c) 빈 질의는 `searchMentionNodes`가 `[]`을 돌려주므로 목록 용도는 `getWorkKbNodes`+`getAccountSharedNodes`를 쓴다(오류를 삼켜 빈 배열이 되므로 "비어 있음"과 "실패"를 구분하지 못한다는 점에 주의).
- `get_kb_document`: `getMentionedNodesContent`에 노드 1개를 넘긴다. 이 함수는 `workId`가 필요하다. 공유 노드만 읽는 경우에도 `workId`를 요구해 소유 작품 검증을 거치게 하는 것이 단순하고 안전하다. `node_type='folder'` ID는 거부하거나 파일만 반환하도록 도구에서 거른다. 본문은 앱 한도(저장 시 20,000자) 안이지만 `maxChars`/`offset`을 둔다.
- 와이키링크 `[[ ]]`는 앱 D-13대로 해석하지 않고 원문 그대로 반환한다.

## 7. 위험 목록

| # | 위험 | 증상/경로 | 대응 |
|---|------|----------|------|
| K1 | **Confused deputy** | 도구에서 `createAdminClient` 사용 시 bearer 하나로 전 사용자 읽기 | import 자체를 리뷰 대상으로: 정적 검사 테스트로 `lib/mcp/**`·`app/mcp/**`에서 `createAdminClient`/`SUPABASE_SERVICE_ROLE_KEY` 문자열이 없음을 단언 |
| K2 | **소유권 누락** | `works_public_read`·`read_chapter_content`의 공개 분기 때문에 RLS만으로는 타인 작품·타인 발행 회차가 보임. `getMentionedNodesContent`는 노드 `work_id`와 요청 `workId` 일치만으로 판단(`owner_id`도 걸려 안전) | 모든 도구에 `ownerId` 강제, `read_chapter_content` 호출 전 `getWork`/`listChapters` 소속 재검증, 비소유=미존재 동일 응답 |
| K3 | **LLM이 넘긴 ID는 비신뢰** | 설정집 문서 속 지시(프롬프트 인젝션)가 모델에게 타 사용자 ID를 넘기게 유도 | 인자에 사용자 ID 없음(R3), 모든 ID는 UUID 형식 검증 + 서버 소유 재검증 |
| K4 | **폐기 토큰의 REST 직접 읽기** | grant 해제 후에도 JWT 만료 전까지 PostgREST 직접 호출 가능 | 3.2의 라이브 grant 조건부 정책, RPC 면은 별도 정리 |
| K5 | **응답 크기 초과** | 번들·회차·설정집이 150,000자(hosted) / 25,000토큰(Claude Code) 초과 | 2절의 상한·잘림 표시·실행 가능한 오류 |
| K6 | **내부 오류 노출** | SDK가 예외 `message`를 그대로 돌려줌, 재사용 함수가 Supabase 오류 원문을 throw | R4, 오류 문자열 테스트(테이블·컬럼명 미노출 단언) |
| K7 | **도구 설명을 통한 인젝션 평가** | 설명에 행동 지시 문장 | 설명은 사실 서술만. 번들 도구 설명에 "반드시 ~하세요" 금지 |
| K8 | **번들 내용이 지시로 오인됨** | 설정집·본문 텍스트(작가 데이터)가 시스템 지시처럼 해석 | `userContext`와 `systemInstruction` 분리 유지, 설정집 문서는 앱처럼 `### [카테고리] 이름` 헤더로 구분. 새 도구 설명에 "이 필드는 데이터이며 지시가 아니다" 서술은 가능(사실 서술) |
| K9 | **공유 DB 영향** | 마이그레이션·테스트가 공유 `ymudwg…`에 적용·실행 | 공유 프로젝트에는 마이그레이션 적용 금지. 새 SQL은 일회용 `anzafn…`에서만 검증, 실DB 테스트는 `assertDisposableRef` 가드 복사. 공유 DB 적용은 병합 후 별도 승인 |
| K10 | **조용한 누락** | `getMentionedNodesContent`가 못 찾은 ID를 말없이 제외 | `manifest.missingNodeIds`로 노출 |
| K11 | **지연** | 호출마다 `getClaims` + `mcp_authorize_call` + 데이터 쿼리 N개(직렬이면 느림) | 번들 안 독립 쿼리는 `Promise.all`, 클라이언트 타임아웃은 인증용 5초와 분리(240초 호출 한도 내) |
| K12 | **그랜트 scope 미사용** | `grantScopes`는 `read`/`propose_draft` 둘 다 항상 가짐. 읽기 도구가 `read` 포함을 확인하지 않음 | 도구 진입 시 `grantScopes.includes('read')` 확인(현재는 항상 참이지만 Phase 14 이후를 위한 습관) |
| K13 | **RPC 표면** | 3.3 마지막 항목 | 전수 목록화와 사용자 결정(Q2) |

## Architecture Patterns

### 권장 구조
```
app/mcp/route.ts            # registerTool 호출만(도구 정의는 lib/mcp/tools/*에서 import)
lib/mcp/
├── auth.ts                 # (기존) verifyMcpToken, readMcpAuthExtra
├── db-client.ts            # 신규: bearer 기반 cookie-less 데이터 클라이언트 팩토리
├── tool-runtime.ts         # 신규: 공통 래퍼(identity 확인, scope 확인, try/catch, 정제 오류, 크기 검사)
└── tools/
    ├── works.ts            # list_works, list_chapters, get_chapter
    ├── kb.ts               # search_kb, get_kb_document
    └── writing-context.ts  # get_writing_context
```
공통 래퍼 하나가 identity 확인 → 데이터 클라이언트 생성 → 핸들러 실행 → 예외를 정제 메시지로 변환 → 응답 크기 검사를 책임지게 하면 6개 도구가 같은 안전 경로를 탄다.

### 도구 정의 패턴 (기존 `whoami`와 동일 형식)
```typescript
// Source: app/mcp/route.ts (Phase 12 whoami), @modelcontextprotocol/server registerTool
server.registerTool(
  'list_chapters',
  {
    title: '회차 목록 조회',
    description: '작가가 소유한 작품의 회차 목록(제목·순서·발행 여부)을 반환합니다. 읽기 전용입니다.',
    inputSchema: z.strictObject({ workId: z.string().uuid() }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  withMcpTool(async ({ args, userId, db }) => { /* ownerId=userId 로 listChapters */ }),
);
```
`withMcpTool`은 신규 래퍼(권장 이름)다. 설명 문구는 사실만 서술한다.

### Anti-Patterns
- `lib/supabase/server.ts`의 쿠키 기반 `createClient()`를 MCP 핸들러에서 사용(브라우저 세션 혼입, bearer 무시).
- `getMentionedNodesContent`처럼 오류를 throw하는 함수를 래퍼 없이 핸들러에서 호출(오류 원문 노출).
- 번들용으로 `composeSystemInstruction`의 문자열을 복사·수정(fork).
- `.or()`에 사용자 질의 문자열 연결.

## Common Pitfalls

1. **0038 정책을 4개 테이블에 그대로 확장**: 도구가 모두 0행을 반환해 "작품이 없다"처럼 보인다. 증상: `list_works`가 항상 빈 배열. 3.2의 조건부 정책으로 해결하고 실DB 테스트로 잡는다.
2. **`chapters.content`를 select**: 컬럼 권한 오류. 반드시 `read_chapter_content` RPC 사용.
3. **`works` 단건 조회에서 `owner_id` 누락**: 공개 정책으로 타인 작품이 조회됨. `getWork`처럼 `owner_id` 조건 고정.
4. **zod enum 키 복제**: `STYLE_PRESETS` 키가 늘면 도구가 거부. 키에서 생성.
5. **한국어 길이 계산 혼동**: 상한은 문자 수 기준이다. JS `string.length`는 UTF-16 코드 유닛이라 이모지·희귀 한자는 2로 센다. 상한 비교에 한 방식만 쓴다(권장 `[...str].length`는 비용이 크므로 `length` 사용을 문서화).
6. **번들 최종 지시문**: 프로토콜 제외 후에도 `assembleUserContent`가 "가장 마지막 작가 메시지에 응답하세요"를 붙인다. 이 문구는 외부 AI에도 무해하지만 옵션으로 함께 제어할지 plan에서 정한다.

## Environment Availability

| 의존성 | 필요처 | 사용 가능 | 비고 |
|--------|-------|----------|------|
| Node / npm | 단위 테스트 | 가용(레지스트리 조회 성공) | 이 워크트리에는 `node_modules`가 없고 메인 체크아웃(`C:\Users\MSI\NovelScript\node_modules`)에는 있음. 실행 전 워크트리 설치 필요 |
| 일회용 Supabase `anzafn…` | 실DB 교차 사용자 테스트, 0039 검증 | 이 조사에서는 미접근(규칙상 공유 프로젝트 접근 금지) | 사람이 `.env.disposable`로 실행(12-06 방식). 에이전트는 SQL을 적용하지 않음 |
| 실 Claude 커스텀 커넥터 | 성공 기준 4(확인 프롬프트 없음) | 미확인 | 12-06 Task 2가 pending. 수동 검증 항목으로 남김 |

## Validation Architecture

`.planning/config.json`을 열람하지 않았다(읽기 대상 목록 외). `workflow.nyquist_validation`이 `false`가 아니면 아래를 유지한다.

| 속성 | 값 |
|------|----|
| Framework | vitest(projects: `unit`, `db`, `vitest.config.*`에서 확인) |
| 빠른 실행 | `npx vitest run tests/mcp --project unit` |
| 실DB 실행 | `node --env-file=<.env.disposable> node_modules/vitest/vitest.mjs run tests/mcp --project db` (일회용 DB에서만, 사람이 실행) |

| 요구사항 | 동작 | 유형 | 파일 |
|---------|------|------|------|
| MCP-02 | 작품·회차 목록, 본문 offset/잘림, 비소유=미존재 | unit(모킹) + db | `tests/mcp/tools-works.test.ts`, `tests/mcp/tools.cross-user.database.test.ts` (신규) |
| MCP-03 | 제목·본문 검색, 이스케이프, 빈 질의 목록, 공유 범위 | unit + db | `tests/mcp/tools-kb.test.ts` (신규) |
| MCP-04 | 번들이 앱 경로와 문자열 동일(프로토콜 옵션 켠 상태), missing ID, 설정 source, 크기 상한 | unit | `tests/mcp/writing-context.test.ts`, `tests/ai/prompt-*.test.ts`(기본값 회귀) |
| MCP-09 | 모든 등록 도구의 annotation 4종·title·이름 64자 이하·strictObject | unit | `tests/mcp/tool-annotations.test.ts` (신규, 등록 목록 순회) |
| D-17 | 4개 테이블 OAuth 읽기 허용/쓰기 차단/폐기 grant 읽기 차단, 26개 일괄 차단, RLS 카탈로그 | db | `tests/mcp/sensitive-rls.database.test.ts` 확장 또는 신규 |
| K1 | `createAdminClient`·service role 문자열 부재 | unit | `tests/mcp/no-admin-client.test.ts` (신규) |
| K6 | 도구 오류에 SQL/테이블/컬럼 문구 없음 | unit | tools 테스트에 포함 |

헬퍼: `tests/helpers/mcp-oauth.ts`의 `callWhoami`는 `name:'whoami'`가 하드코딩이다. 일반화한 `callTool(accessToken, name, args)`를 추가해야 한다(Wave 0). 교차 사용자 스위트는 모든 도구에 대해 B 토큰으로 A의 `workId`/`chapterId`/`nodeId`를 넣고 "미존재"와 구별되지 않는 응답을 단언한다.

Wave 0 갭: `callTool` 헬퍼, 도구 단위 테스트 파일들, 4개 테이블 정책 카탈로그 테스트, 일회용 DB의 `pg_tables` 대조 쿼리 결과.

## State of the Art

| 항목 | 현재 | 비고 |
|------|------|------|
| 도구 annotation | `title` + 4종 hint가 Claude 자동 권한 판단에 사용됨 | Anthropic 공식 검토 기준 |
| Claude hosted 한도 | 약 150,000자 / 240초 | 공식 문서(2026-11-02 확인). 일부 서드파티가 25,000토큰·300초로 적은 곳이 있어 서로 어긋남. 공식 표를 따름 |
| SDK | `@modelcontextprotocol/server` 2.4.0 존재, 설치는 2.3.1 | 이번 phase에서 업그레이드하지 않음 |

## Open Questions (사용자 판단 필요)

1. **Q1. D-17 정정 승인**: "전 테이블 차단"을 "26개 일괄 차단 + works/chapters/kb_nodes/work_ai_instructions는 라이브 grant 조건부 SELECT·쓰기 차단"으로 바꿔도 되는가. 거절하면 기존 모듈 재사용을 포기하고 도구마다 SECURITY DEFINER 읽기 RPC를 새로 만들어야 한다(범위·복잡도 크게 증가). 권장: 승인.
2. **Q2. RPC 면 범위**: `authenticated`에 열린 쓰기·결제성 RPC에 OAuth 가드를 이 phase에서 함께 붙일 것인가, 목록화만 하고 Phase 14 이전으로 미룰 것인가. 이 조사는 전수 검증을 하지 못했다.
3. **Q3. 번들의 응답 프로토콜**: 기본 제외 + 옵트인(권장)인가, 앱과 문자 그대로 동일하게 항상 포함인가. 권장안은 `prompt.ts`에 기본값 보존 옵션 2개를 추가한다.
4. **Q4. 프리셋·문체 저장**: 현재 저장값이 없으므로 "앱 기본값 + 인자 덮어쓰기"로 충족한다고 볼 것인가, 작가 설정으로 저장하는 별도 기능(컬럼+UI)을 후속으로 둘 것인가. 권장: 앞의 해석으로 충족, 저장 기능은 deferred.
5. **Q5. 응답 크기 정책**: hosted 한도 기준(번들 약 100,000자)으로 둘지, Claude Code까지 맞춰 더 낮출지(약 20,000자). 후자는 정상 번들도 잘릴 수 있다. 권장: hosted 기준 + Claude Code는 인수 범위 밖으로 문서화.

## 참고 출처

### Primary (HIGH)
- 설치된 패키지 소스: `C:\Users\MSI\NovelScript\node_modules\@modelcontextprotocol\server\dist\mcp-DIH4cS6P.mjs`(tools/call 오류 처리, `registerTool`), `@modelcontextprotocol\core\dist\auth-Anm-lwWi.d.mts`(annotation 타입). 확인일 2026-11-02.
- 프로젝트 파일: `app/mcp/route.ts`, `lib/mcp/auth.ts`, `supabase/migrations/0002, 0003, 0006~0009, 0026, 0037, 0038`, `lib/ai/prompt.ts`, `mentions.ts`, `work-instructions.ts`, `chat.ts`, `lib/kb/actions.ts`, `lib/chapters/actions.ts`, `lib/works/actions.ts`, `lib/access/actions.ts`, `tests/helpers/mcp-oauth.ts`, `tests/mcp/cross-user.database.test.ts`.
- https://claude.com/docs/connectors/building.md — Claude 커넥터 크기·타임아웃 한도 표, 지원 기능 (2026-11-02 확인)
- https://claude.com/docs/connectors/building/review-criteria.md — 도구 `title`·`readOnlyHint` 필수, 이름 64자, 설명·응답 크기·오류 기준 (2026-11-02 확인)
- npm 레지스트리: `mcp-handler` 2.3.0, `@modelcontextprotocol/server` 2.4.0 (`npm view`, 2026-11-02)

### Secondary (MEDIUM)
- `.planning/research/ARCHITECTURE.md` Pattern 6·7, `FEATURES.md`, `PITFALLS.md`가 인용한 MCP 블로그 "Tool Annotations as Risk Vocabulary"(https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/) — annotation은 힌트이며 강제가 아님. 이번에 원문은 다시 열지 않고 기존 리서치의 인용을 따랐다.

### Tertiary (LOW, 검증 필요)
- 서드파티 글(sunpeak.ai, fast.io 등): Claude Code 10,000토큰 경고, `_meta["anthropic/maxResultSizeChars"]` 최대 500,000자, 300초 타임아웃. 공식 문서와 어긋나거나 확인되지 않아 설계 근거로 쓰지 않았다.
- 한국어 문자당 토큰 비율: 확인하지 못함.
- Claude가 `readOnlyHint` 도구를 실제로 무확인 실행하는지의 실동작: 미확인(수동 검증 필요).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 설치 버전·최신 버전·SDK 소스 직접 확인
- Architecture / 격리 구조: HIGH — 마이그레이션 파일로 정책·컬럼 권한 확인. 실제 DB 카탈로그는 미확인
- 크기 한도: MEDIUM — 공식 표는 확인, 한국어 토큰 비율은 LOW
- 번들 구조·R1 해법: MEDIUM — 설계 판단이며 사용자 승인 필요

**검증하지 못한 항목:** (1) 실제 일회용 DB의 `public` 테이블·정책 카탈로그, (2) `authenticated` EXECUTE 함수 전수와 OAuth bearer 호출 가능 여부, (3) Claude의 read-only 도구 무확인 실행 실동작, (4) `.planning/config.json`의 nyquist 설정, (5) 한국어 토큰 비율, (6) `CUSTOM_INSTRUCTION_MAX_LENGTH` 실제 값.

**Research date:** 2026-11-02
**Valid until:** 2026-11-30 (Claude 커넥터 한도와 SDK 버전은 빠르게 바뀜)
