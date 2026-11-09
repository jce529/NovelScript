# Phase 14: MCP 쓰기 도구 + 스튜디오 리뷰 큐 - Research

**Researched:** 2026-11-09
**Domain:** MCP 쓰기 도구(OAuth bearer) + Supabase RLS/SECURITY DEFINER RPC + 스튜디오 리뷰 UI + 줄 단위 diff
**Confidence:** HIGH (코드·마이그레이션 직접 확인), 라이브러리·브라우저 동작 일부 MEDIUM/ASSUMED (아래 Assumptions Log)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-P14-01:** 초안 수락은 **작가 에디터로 불러오는 동작**이다. 서버는 `chapters.content`를 쓰지 않는다. 실제 본문 저장은 작가의 기존 에디터 저장 동작이다. 이 구조 때문에 "조용한 덮어쓰기"가 데이터 레이어에서 불가능하다.
- **D-P14-02:** 한 회차에 pending 초안을 **여러 개** 둘 수 있고, 각각 독립적으로 검토한다. 새 초안이 이전 초안을 대체하지 않는다.
- **D-P14-03:** 초안은 **에디터로 가져오는 시점에 accepted**로 전이한다. 에디터 저장 여부는 서버가 추적하지 않는다. 저장 없이 나가도 작가가 이력에서 다시 가져올 수 있어야 한다.
- **D-P14-04:** 초안 본문의 형식(평문/마크다운)과 길이 상한은 **리서치에서 결정**한다. `chapters.content` 현재 형식과 에디터를 조사한 뒤 정한다. 서버는 어떤 경우에도 입력을 정규화·검증한다(스크립트·HTML 주입 방지).
- **D-P14-05:** 새 초안 **회차를 만드는 도구는 두지 않는다.** 초안은 이미 있는 회차에만 붙는다. 본문 직접 수정 도구도 만들지 않는다.
- **D-P14-06:** 외부 AI는 설정집 문서의 **신규 생성안** 또는 **기존 문서 수정안**을 제안할 수 있다. 둘 다 pending 객체만 만든다. 실제 `kb_nodes`는 작가가 수락할 때만 바뀐다.
- **D-P14-07:** 수정안 수락은 **변경 덩어리(hunk) 단위 부분 수락**이다. 작가가 "필요한 부분만" 골라 적용한다. 원문과 수정안을 나란히 보여준다.
- **D-P14-08:** 제안 이후 작가가 원문을 고쳐 제안 시점의 원문과 달라진 경우, **최신 원문 기준으로 diff를 다시 계산해** 보여준다. 수락은 그 재계산된 diff 위에서 이뤄진다. 제안에는 base 버전을 기록해 둔다.
- **D-P14-09:** 잠긴 템플릿 문서(`is_locked`)는 수정안 대상이 될 수 없다. 신규 생성안의 폴더·카테고리 지정은 서버가 소유권·범위·삭제 상태로 재검증한다(Phase 15의 폴더 검증 방식을 재사용하는 방향, 세부는 plan).
- **D-P14-10:** 목록은 **한 목록 + 종류 필터**(전체 / 초안 / 설정집)다. 모든 행에 출처(클라이언트명, 도착 시각)를 같은 형식으로 표시한다.
- **D-P14-11:** 진입점은 **A + B·C 바로가기** 조합이다. A: 스튜디오 헤더의 "AI 검토 대기" 배지 → 전체 인박스(모든 작품). B: 회차 트리 항목과 에디터 안내줄 → 그 회차의 초안만. C: 설정집 트리 항목 → 그 문서의 수정안만.
- **D-P14-12:** 세부 화면(모바일 탭 3개 셸에서의 배치 포함)은 UI-SPEC으로 확정한다(완료, 14-UI-SPEC.md approved).
- **D-P14-13:** **작품당 pending 상한**을 둔다. 상한 초과 시 도구는 "검토 대기가 가득 찼다"는 오류를 돌려주고 새 제안을 받지 않는다. 숫자는 plan에서 정한다.
- **D-P14-14:** 수락·거절한 항목과 방치된 pending은 **전부 영구 보관**한다(자동 만료·삭제 없음). 출처와 함께 이력으로 남는다.
- **D-P14-15:** **정지된 계정은 MCP 쓰기 도구와 수락·거절 모두 차단**한다. 이미 쌓인 항목은 읽기로 볼 수 있다. 탈퇴 계정은 Phase 12 정책대로 전면 차단이다.
- **D-P14-16:** `save_draft` / `propose_kb_document` 둘 다 pending 상태 객체(`mcp_drafts` / `mcp_kb_proposals`)만 만든다. "외부 AI가 제안하고 작가가 결정한다"를 UI 카피가 아니라 **데이터 접근 레이어에서** 강제한다.
- **D-P14-17:** LLM이 넘긴 `work_id`/`chapter_id`/`node_id`는 **비신뢰 입력**이다. 매 호출 서버에서 소유권을 재검증한다. 주입된 도구 결과로 유도된 교차 사용자 쓰기 테스트(실DB, 일회용 DB에서만)를 포함한다.
- **D-P14-18:** 쓰기 도구에는 `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint`와 `openWorldHint: false` annotation을 붙인다(MCP-09 형식 유지). 도구는 user-scoped 클라이언트를 쓰고 `createAdminClient`를 쓰지 않는다.

### Claude's Discretion
- 초안 본문 형식·길이 상한(D-P14-04), pending 상한 숫자, hunk 분할 알고리즘과 diff 라이브러리, 테이블 컬럼·인덱스 설계, 도구 이름과 zod 스키마.
- 같은 요청이 반복될 때의 멱등성 처리(중복 제안 방지) 방식.

### Deferred Ideas (OUT OF SCOPE)
- 보관 기간·자동 정리 정책(영구 보관으로 시작)
- 도구 호출 로그·호출 횟수 표시
- 세계수(Phase 18) 데이터를 제안 대상에 포함
- 범위 밖: 읽기 도구(Phase 13 완료), 회차 본문을 직접 수정하는 도구(영구 제외)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MCP-05 | 연결된 AI가 회차에 '제안된 초안'을 저장(본문 덮어쓰기 불가) | §1 본문 형식, §2 쓰기 권한 경로, §3 `mcp_drafts` + `mcp_save_draft` RPC, §4 도구 등록, §7 에디터 가져오기 |
| MCP-06 | 연결된 AI가 설정집 신규 생성안·수정안 제안 | §3 `mcp_kb_proposals` + RPC 2종, §5 hunk diff, §6 폴더 검증 재사용 |
| MCP-07 | 작가가 스튜디오에서 출처와 함께 검토해 수락/거절 | §3 studio RPC, §5 hunk 수락, §7 스튜디오 통합, UI-SPEC |
</phase_requirements>

## Summary

**가장 중요한 발견 두 가지.** (1) `checkWriteAccess(mcpDbClient, userId)`는 **OAuth bearer로 호출하면 항상 `write_unavailable`로 거절**된다. 0039가 `get_write_access(uuid)`에 `mcp_reject_oauth_caller()`를 주입했고(0039 line 355, 테스트 카탈로그 `'get_write_access(uuid)': 'block'`), profiles는 `oauth_browser_only` RESTRICTIVE RLS로 REST 조회도 막힌다. 따라서 정지·탈퇴 판정은 **쓰기 RPC 본문 안에서** `user_can_write(v_user)`(어느 롤에도 EXECUTE 없음, 정의자 소유 함수 안에서만 호출 가능) + `mcp_grant_is_live()`로 한다. 앱 레이어 `checkWriteAccess`를 MCP 경로에서 재사용하려 하지 말 것. (2) 이 코드베이스의 회차 본문은 **평문**(`chapters.content` text, `<Textarea>` 편집기, 독자 뷰어 `whitespace-pre-wrap`, 마크다운/HTML 렌더러 없음)이므로 초안도 평문으로 정한다.

구조: 두 테이블(`mcp_drafts`, `mcp_kb_proposals`)은 RLS로 소유자 SELECT만 허용(+`client_id is null` RESTRICTIVE), INSERT/UPDATE/DELETE 권한은 아무에게도 주지 않고, 모든 쓰기는 SECURITY DEFINER RPC로만 한다. MCP 쪽 RPC(`mcp_save_draft`, `mcp_propose_kb_create`, `mcp_propose_kb_edit`)는 "OAuth 전용·live grant·`propose_draft` scope·정지/탈퇴 차단·소유권 재검증·작품별 advisory lock 아래 cap 집계·내용 해시 dedupe"를 한 트랜잭션에서 처리하고, 출처(client_name, redirect_host)는 인자가 아니라 `mcp_connections`에서 읽는다. 스튜디오 쪽 RPC(`studio_*`)는 `mcp_reject_oauth_caller()`를 첫 문장에 두고 `user_can_write`로 정지 계정을 막는다. KB 수정안 수락은 TS에서 `diffLines`로 hunk를 계산·적용(순수 함수)하고, 최종 쓰기는 해시 비교(CAS)를 하는 RPC 한 번으로 상태 전이와 `kb_nodes.content` 갱신을 원자적으로 한다.

**Primary recommendation:** 평문 본문(상한 30,000자) + 쓰기 RPC 전용 설계 + `diff@9.0.0`(`diffLines`)로 hunk를 직접 구성한다. 0051 이상 마이그레이션 1~2개로 테이블·RLS·RPC를 묶고, 같은 plan에서 `tests/mcp/read-boundary.database.test.ts`의 테이블/RPC 카탈로그와 `tool-annotations.test.ts`를 함께 갱신한다(안 하면 기존 스위트가 깨진다).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 외부 AI 초안/제안 수신 | API (`/mcp` route + 도구) | DB (SECURITY DEFINER RPC) | 신뢰 경계는 DB 함수. 도구는 zod 입력 검증 + RPC 호출만 한다 |
| 소유권·정지·cap·dedupe 판정 | Database (RPC, advisory lock) | — | 앱 레이어 검사는 race·OAuth RLS 차단 때문에 원자적일 수 없다 |
| OAuth 토큰의 직접 REST 접근 차단 | Database (RLS RESTRICTIVE + grant 없음) | RPC guard | 0038/0039 경계와 동일 방식 |
| 인박스·상세 렌더링 | Frontend Server (RSC, `app/studio/review/**`) | Browser (필터 탭, hunk 선택) | 서버가 diff를 계산해 내려주고 클라이언트는 선택 상태만 가진다 |
| hunk 계산·적용 | 순수 TS 모듈 (서버 액션에서 실행) | Browser(표시만) | 최신 원문 재계산을 서버가 소유해야 충돌 판정이 신뢰 가능 |
| 수락/거절/가져오기 상태 전이 | Server Action → DB RPC | — | 세션 기반(browser) 호출만 허용, 정지 계정 차단 |
| 초안 본문 삽입 | Browser (회차 에디터 `<Textarea>`) | Server(본문 조회만) | D-P14-01: 서버는 `chapters.content`를 쓰지 않는다 |
| 대기 건수 배지 | Frontend Server (layout 쿼리) | Browser(표시) | 폴링 없음, `revalidatePath`로 갱신 |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@modelcontextprotocol/server` | 2.3.1 (기설치, 핀) | `McpServer.registerTool` 타입 | 기존 도구와 동일 [VERIFIED: package.json] |
| `mcp-handler` | 2.3.0 (기설치, 핀) | `/mcp` 라우트 | 기존 [VERIFIED: package.json] |
| `@supabase/supabase-js` | ^2.112.4 (기설치) | bearer 클라이언트 `rpc()` | `createMcpDbClient` 그대로 [VERIFIED: lib/mcp/db-client.ts] |
| `zod` | ^4.4.3 (기설치) | 도구 입력 strictObject | 기존 도구 규약 [VERIFIED: lib/mcp/tools/kb.ts] |
| `diff` (jsdiff) | **9.0.0 (신규, 정확 핀)** | `diffLines`로 줄 단위 diff | 사실상 표준(주 187M 다운로드), 무의존성, 자체 타입 포함(v8+), ESM/CJS [VERIFIED: npm registry v9.0.0, modified 2026-04-13; downloads api.npmjs.org 187,498,035/week; CITED: github.com/kpdecker/jsdiff] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:crypto` | Node 22.14 | sha256 해시(서버 액션) | 원문 해시 비교. DB는 `sha256(convert_to(x,'UTF8'))`와 동일 결과 |
| vitest | ^4.1.11 (기설치) | unit/db 프로젝트 | 기존 `vitest.config.ts` 분류 규칙(`SUPABASE_DB_URL` 포함 파일은 db 프로젝트) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `diff` `diffLines`로 직접 hunk 구성 | `structuredPatch` + `applyPatch` | 패치 적용은 fuzz·줄번호 결합으로 "더 이상 안 맞는 hunk" 판정이 불투명. 재계산 모델(D-P14-08)과도 안 맞음 |
| 2-way(최신 원문 vs 제안) | `node-diff3` 3-way | D-P14-08이 "최신 원문 기준 재계산"을 확정했으므로 3-way 불필요. base는 알림 문구(원문 변경됨)와 이력 diff 용도만 |
| `diff-match-patch` | — | 문자 단위·퍼지 패치 지향. 산문 줄 단위 비교 UI에 부적합, 유지보수 빈도 낮음 [ASSUMED] |

**Installation:**
```bash
npm install --save-exact diff@9.0.0
```
**Version verification:** `npm view diff version` → 9.0.0, `dist-tags.latest = 9.0.0`, modified 2026-04-13, repository `github.com/kpdecker/jsdiff`, dependencies 없음, `scripts.postinstall` 없음 [VERIFIED: npm registry, 2026-11-09 실행].

## Package Legitimacy Audit

slopcheck 설치(`pip install`)가 이 세션에서 실행 거부되어 **slopcheck 미실행**. 패키지 이름이 공식 문서(README)와 npm 메타데이터에서 모두 확인되지만 프로토콜상 `[ASSUMED]`로 두고 planner가 설치 전 `checkpoint:human-verify`를 둔다.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| diff | npm | 10년+ (jsdiff) | ~187M/주 | github.com/kpdecker/jsdiff | 미실행 | **[ASSUMED]** — 설치 전 사람 확인 체크포인트 1개. postinstall 없음, 의존성 없음 |

**Packages removed due to slopcheck [SLOP] verdict:** none (미실행)
**Packages flagged as suspicious [SUS]:** none. 단 slopcheck 미실행이므로 `diff` 설치 task 앞에 checkpoint:human-verify 필요.

## Architecture Patterns

### System Architecture Diagram

```
 Claude 커넥터 (외부 AI, OAuth bearer: JWT에 client_id)
        │  tools/call: save_draft / propose_kb_document / propose_kb_edit
        ▼
 app/mcp/route.ts ── withMcpAuth(verifyMcpToken: 서명 + mcp_authorize_call 라이브 grant)
        │
        ▼
 lib/mcp/tools/propose.ts ── withMcpWriteTool(zod strict, scope 'propose_draft' 확인,
        │                     createMcpDbClient(bearer) — admin client 없음)
        ▼  db.rpc(...)                     ┌──────────────────────────────────────────┐
 ┌──────────────────────────────────────┐  │ 테이블 mcp_drafts / mcp_kb_proposals     │
 │ mcp_save_draft / mcp_propose_kb_*    │─▶│ RLS: owner SELECT + client_id is null    │
 │ SECURITY DEFINER                     │  │ authenticated: SELECT만 (DML grant 없음) │
 │ 1 OAuth 전용 + mcp_grant_is_live     │  └──────────────────────────────────────────┘
 │ 2 connection scope ∋ propose_draft   │            ▲ select (browser 세션)
 │ 3 user_can_write (정지/탈퇴 차단)    │            │
 │ 4 소유권(work→chapter/node) 재검증   │  ┌─────────┴────────────────────────────────┐
 │ 5 advisory lock(work) → dedupe → cap │  │ app/studio/review/**  (RSC + Server      │
 │ 6 insert pending (출처는 connection) │  │ Actions, 세션 클라이언트)                │
 └──────────────────────────────────────┘  │  · 목록/필터  studio_list_review_items   │
                                           │  · 건수       studio_pending_counts      │
 작가(browser 세션, client_id 없음)        │  · 가져오기   studio_import_draft ──────┐│
        ▼                                  │  · 거절       studio_reject_*           ││
 SiteHeader 배지 / 트리 배지 / 에디터 안내줄 │  · KB 수락    diffLines hunk 적용 →     ││
        │                                  │               studio_accept_kb_edit(CAS)││
        ▼                                  │  · 신규 문서  validateTargetFolder →    ││
 /studio/review ─▶ /studio/review/{id}     │               studio_accept_kb_new      ││
                                           └─────────────────────────────────────────┘│
 /studio/{workId}/chapters/{id}?importDraft={id} ◀── redirect ─────────────────────────┘
   회차 에디터(client)가 본문 조회 → 커서 위치/끝에 삽입 → 작가가 기존 저장 버튼으로 저장
   (서버는 chapters.content를 어떤 경로로도 쓰지 않는다)
```

### Recommended Project Structure
```
supabase/migrations/
├── 0051_mcp_review_queue.sql      # 테이블 2개, 인덱스, RLS, oauth_browser_only, mcp_* RPC (guard 분류)
└── 0052_studio_review_rpcs.sql    # studio_* RPC (block 분류), 카운트/목록 RPC (분리하면 롤백 단위가 작다; 하나로 합쳐도 무방)
lib/mcp/
├── tool-runtime.ts                # + withMcpWriteTool, MCP_WRITE_ANNOTATIONS, McpToolError 코드 확장
└── tools/propose.ts               # save_draft, propose_kb_document, propose_kb_edit
lib/review/                        # 스튜디오 쪽(세션 클라이언트 사용 가능; lib/mcp 밖에 둔다)
├── text.ts                        # 순수: normalizeProposalText, 상수(MAX_*), sha256Hex
├── kb-diff.ts                     # 순수: computeHunks, applyHunks, 문맥 줄
├── queries.ts                     # 목록/건수/상세 조회(세션 클라이언트)
└── actions-core.ts                # accept/reject 핵심 로직(테스트 가능, 'use server' 아님)
app/studio/review/
├── page.tsx                       # 인박스 (searchParams: kind,status,work,chapter,node)
├── [id]/page.tsx                  # 상세 (lg: 목록+상세 2열 재사용)
└── actions.ts                     # 'use server' 얇은 래퍼 + revalidatePath('/studio','layout')
components/studio/review/          # ReviewCountBadge, ReviewInbox, ReviewRow, DraftReview, KbProposalReview, DiffHunk, EditorDraftNotice, ReviewSuspendedBanner
tests/mcp/propose-*.database.test.ts, tests/mcp/tools-propose.test.ts, tests/review/*.test.ts
```
> `lib/mcp/**`와 `app/mcp/**`는 `tests/mcp/no-admin-client.test.ts`가 `lib/supabase/server`·`admin`·`next/headers` import를 금지한다. 스튜디오용 코드는 반드시 `lib/review/` 등 **lib/mcp 밖**에 둔다. [VERIFIED: tests/mcp/no-admin-client.test.ts]

### Pattern 1: 쓰기 도구 래퍼 (기존 `withMcpReadTool` 미러)
**What:** 읽기 래퍼와 같은 구조에 (a) `propose_draft` scope 확인, (b) 로컬 오류 코드 확장.
```typescript
// Source: lib/mcp/tool-runtime.ts (기존 패턴 확장)
export const MCP_WRITE_ANNOTATIONS = {
  readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false,
} as const;

export class McpToolError extends Error {
  constructor(readonly code: 'missing' | 'queue_full' | 'suspended' | 'too_large' | 'no_change') { super(code); }
}
// ERRORS에 추가(모두 로컬 한국어 고정문. DB 메시지는 절대 통과시키지 않는다):
//   scope:      '제안을 저장할 권한이 없습니다.'            (grantScopes에 propose_draft 없음)
//   queue_full: '검토 대기가 가득 찼습니다. 작가가 기존 제안을 처리한 뒤 다시 시도해주세요.'
//   suspended:  '작가 계정이 제한되어 지금은 제안을 저장할 수 없습니다.'
//   too_large / no_change: 고정 안내문
export function withMcpWriteTool<S extends z.ZodType>(schema: S, handler: (input: z.output<S>, s: McpToolSession) => Promise<object>) { /* withMcpReadTool과 동일, 'read' 대신 'propose_draft' 확인 */ }

// RPC 오류 → McpToolError 매핑 (RPC는 고정 마커 문자열로 raise):
export function mapProposeRpcError(error: { message?: string; code?: string }): never {
  const m = error.message ?? '';
  if (m.includes('mcp_not_found')) throw new McpToolError('missing');
  if (m.includes('mcp_pending_limit')) throw new McpToolError('queue_full');
  if (m.includes('mcp_write_denied')) throw new McpToolError('suspended');
  if (m.includes('mcp_too_large') || m.includes('mcp_invalid_input')) throw new McpToolError('too_large');
  if (m.includes('mcp_no_change')) throw new McpToolError('no_change');
  throw error; // 나머지(42501 포함)는 일반 실패문으로 떨어진다
}
```
**주의:** `McpToolError` 생성자 시그니처가 바뀌므로 기존 `tools-works/kb` 테스트의 'missing' 사용처는 그대로 유효하다.

### Pattern 2: 쓰기 RPC 골격 (SECURITY DEFINER, `mcp_authorize_call`/`create_chapter_atomic` 규약 혼합)
```sql
-- Source: 0037(mcp_connect 스타일: set search_path = '', pg_catalog., out_ 접두 컬럼), 0020(소유권+advisory/row lock), 0039(guard)
create function public.mcp_save_draft(p_work_id uuid, p_chapter_id uuid, p_body text)
returns table(out_id uuid, out_duplicate boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_client uuid := nullif((select auth.jwt()) ->> 'client_id', '')::uuid;
  v_conn public.mcp_connections%rowtype;
  v_work uuid; v_hash text; v_id uuid; v_cap constant int := public.mcp_review_pending_cap();
begin
  -- 1 OAuth 전용(브라우저 세션은 거부) + live grant
  if v_user is null or v_client is null or not public.mcp_grant_is_live() then
    raise exception 'live MCP grant required' using errcode = '42501';
  end if;
  -- 2 scope: 앱 grant의 propose_draft (Supabase OIDC scope와 별개)
  select c.* into v_conn from public.mcp_connections c
   where c.user_id = v_user and c.oauth_client_id = v_client and c.revoked_at is null;
  if not found or not ('propose_draft' = any(v_conn.scopes)) then raise exception 'mcp_scope' using errcode = '42501'; end if;
  -- 3 정지/탈퇴: 앱의 checkWriteAccess 대신 DB 함수 직접 호출(정의자 소유 함수 안에서만 호출 가능)
  if not public.user_can_write(v_user) then raise exception 'mcp_write_denied'; end if;
  -- 4 입력: 길이(평문 상한은 TS와 같은 상수), 잘못된 문자 방어
  if p_body is null or pg_catalog.char_length(p_body) not between 1 and 30000 then raise exception 'mcp_invalid_input'; end if;
  -- 5 소유권: 작품-회차 쌍과 소유자, 삭제 상태까지 한 쿼리로. 없으면 존재 여부를 구분하지 않는다
  select w.id into v_work from public.chapters ch join public.works w on w.id = ch.work_id
   where ch.id = p_chapter_id and ch.work_id = p_work_id and w.owner_id = v_user
     and ch.deleted_at is null and w.deleted_at is null;
  if not found then raise exception 'mcp_not_found'; end if;
  -- 6 같은 작품의 동시 호출 직렬화 → dedupe → cap (순서 중요: 재시도는 cap 초과여도 중복으로 응답)
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mcp_review:' || p_work_id::text, 0));
  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_body, 'UTF8')), 'hex');
  select d.id into v_id from public.mcp_drafts d
   where d.chapter_id = p_chapter_id and d.body_hash = v_hash and d.status = 'pending';
  if found then return query select v_id, true; return; end if;
  if (select pg_catalog.count(*) from public.mcp_drafts where work_id = p_work_id and status = 'pending')
   + (select pg_catalog.count(*) from public.mcp_kb_proposals where work_id = p_work_id and status = 'pending') >= v_cap then
    raise exception 'mcp_pending_limit';
  end if;
  insert into public.mcp_drafts (owner_id, work_id, chapter_id, oauth_client_id, client_name, redirect_host, body, body_hash)
  values (v_user, p_work_id, p_chapter_id, v_client, v_conn.client_name, v_conn.redirect_host, p_body, v_hash)
  returning id into v_id;
  return query select v_id, false;
end; $$;
revoke all on function public.mcp_save_draft(uuid, uuid, text) from public, anon, service_role;
grant execute on function public.mcp_save_draft(uuid, uuid, text) to authenticated;
```
(`mcp_propose_kb_create`, `mcp_propose_kb_edit`도 1~3·6단계는 동일, 4~5단계만 다름 — §3.)

### Anti-Patterns to Avoid
- **`checkWriteAccess(db, userId)`를 MCP 도구에서 호출:** OAuth bearer에서는 항상 `write_unavailable`(§2). 정지 판정은 RPC 안에서.
- **도구가 `client_name`/`owner_id`를 인자로 받기:** 출처는 `mcp_connections`에서 읽어 저장한다(공격자가 "Anthropic" 이름을 위조 못 한다는 보장은 DCR 특성상 없지만, 최소한 인자 위조는 막는다. UI는 호스트를 함께 표시).
- **인박스 목록을 두 테이블 각각 offset 페이지네이션:** "전체" 탭에서 정렬·페이지가 어긋난다. `studio_list_review_items` 한 쿼리(UNION ALL, keyset)로 낸다.
- **authenticated에 `mcp_*` 테이블 UPDATE 권한 부여:** 본문·출처 위변조 경로가 열린다. SELECT만 주고 전이는 RPC로.
- **layout에서 건수를 읽고 갱신 안 하기:** App Router 레이아웃은 내비게이션 간 재렌더되지 않는다(§7 pitfall).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 줄 단위 diff (LCS) | 자체 diff 알고리즘 | `diff`의 `diffLines` | 엣지(끝 개행·반복 줄) 많음, 성능 보장 |
| 정지/탈퇴 판정 | profiles 직접 조회·TS 시각 비교 | DB `user_can_write(uuid)` (DB `now()` 사용, 0008 D-08) | 시각 비교 금지 규약, OAuth RLS가 profiles 읽기를 막음 |
| 폴더 소유·범위·루트 재검증 | 새 SQL 검증 전체 재구현 | `validateTargetFolder` / `listCategoryFolderCandidates` (lib/kb/actions.ts) + SQL 쪽은 핵심 술어만 이중 방어 | Phase 15가 15-03에서 해결한 루트 유일성·version·깊이 한도 포함 |
| 문서 생성 쓰기 경로 | `kb_nodes` 직접 INSERT 코드 복제 | 신규 문서 수락 RPC가 `createNode`와 같은 컬럼 집합만 사용 (§6) | 트리거(0023, 회차 폴더 가드) 그대로 발화 |
| 해시 | 임의 문자열 비교 | sha256 (SQL `sha256()`, Node `createHash`) | 대용량 text 비교·로그 안전 |
| 클라이언트 인증 판별 | 요청 헤더/토큰 파싱 | `auth.jwt() ->> 'client_id'` + `mcp_grant_is_live()` | 0039가 이미 검증된 경계 |

**Key insight:** 이 phase의 안전성은 "도구가 아무것도 직접 쓰지 못한다"가 아니라 "OAuth 토큰이 닿는 쓰기 경로는 정확히 3개의 RPC뿐이고 그 RPC가 pending 행만 만든다"는 구조에서 나온다. 그래서 RLS(테이블 DML 차단) + RPC(쓰기 경로 한정) + 카탈로그 테스트(새 테이블·RPC 분류 누락 방지) 3중이 한 세트다.

## 1. D-P14-04: 본문 형식 (코드 근거)

**조사 결과 [VERIFIED: 코드]**
- 저장: `chapters.content text not null default ''` (`supabase/migrations/0002_studio.sql:74`). 길이 제약·CHECK 없음.
- 편집기: `app/studio/[workId]/chapters/[chapterId]/page.tsx` — 클라이언트 컴포넌트, shadcn `<Textarea>`(순수 `<textarea>`), 상태는 `lib/studio/editor-state.ts` 리듀서(`currentContent`/`savedContent`). 리치텍스트·마크다운 파서 없음.
- 저장: `saveChapterContentAction(workId, chapterId, content)` → `saveChapterContent`(`lib/chapters/actions.ts:101`, 주석 "D-19: plain-text content, no rendering") → `checkWriteAccess` + `chapters.update({content, updated_at})`.
- 렌더: 독자 `components/reader/viewer-shell.tsx:233` `className="... whitespace-pre-wrap"`로 `chapter.content`를 React 텍스트로 출력. `dangerouslySetInnerHTML`/`react-markdown`/`marked`/`remark`는 app·components·lib·package.json 어디에도 없다 [VERIFIED: grep].
- 커서 삽입: 같은 페이지의 `insertTextAtCursor(text)`가 `spliceAtSelection(latest, text, start, end)`(`lib/studio/editor-session.ts`)로 `onEdit` 리듀서 이벤트를 쏘고 `notifyInsert()`를 호출. `start/end`가 null이면 **본문 끝에 이어 붙인다**. AI 패널 `onInsertText`가 같은 함수를 쓴다 (설정 문서 편집기 `kb/[nodeId]/page.tsx:116`도 동일).

**권장 (D-P14-04 확정안)**
| 항목 | 값 |
|------|-----|
| 형식 | **평문(plain text)**. 마크다운 렌더러를 도입하지 않는다(UI-SPEC open item 11 확정 근거) |
| 길이 상한 | **30,000자**(`char_length`/JS `.length`). 한국어 웹소설 한 회 통상 5~6천 자 대비 5배 여유이고, 기존 `MAX_ATTACHMENT_CHARS = 30000`(lib/ai/attachments.ts)과 일치 [ASSUMED: 통상 분량 수치는 훈련 지식] |
| 최소 | 1자(공백만 있는 본문 거부: 정규화 후 `trim()` 비어 있으면 `mcp_invalid_input`) |
| 정규화(TS `normalizeProposalText`, DB는 길이·NUL만 이중 방어) | ① `\r\n`,`\r` → `\n` ② NUL 및 탭·개행 제외 C0/C1 제어문자 제거 ③ BOM(U+FEFF) 제거 ④ 양방향 제어문자(U+202A–202E, U+2066–2069) 제거(방향 위장 방지) ⑤ 깨진 서로게이트는 `String.prototype.toWellFormed()`로 U+FFFD 치환(Node 22) ⑥ 연속 3개 초과 개행은 2개로 축소, 끝 공백 제거 |
| HTML/스크립트 | **태그를 벗겨내지 않는다**(대사의 `<말줄임>` 같은 산문 훼손). 대신 모든 경로가 React 텍스트·`whitespace-pre-wrap`로만 렌더하고 `dangerouslySetInnerHTML` 금지를 정적 테스트로 고정한다(D-P14-04 "주입 방지"는 *출력 이스케이프*로 달성) |
| 삽입 구분 | 기존 본문이 비어 있지 않고 개행으로 끝나지 않으면 삽입 텍스트 앞에 `\n\n`을 붙인다(끝에 이어 붙이는 경우) |

**에디터 삽입 구현 지침**
- 가져오기 후 `/studio/{workId}/chapters/{chapterId}?importDraft={draftId}`로 이동 → 에디터 페이지가 `loaded && synced` 이후 1회: `getImportDraftAction(draftId, chapterId)`로 본문 조회 → `insertTextAtCursor` 계열로 삽입 → `router.replace`로 쿼리 제거. React Strict Mode 이중 effect 방지를 위해 처리한 draftId를 `useRef<Set>`에 기록.
- **커서 판정:** 새로 마운트된 `<textarea>`는 포커스가 없으므로 `document.activeElement !== textarea`면 `start/end = null`(본문 끝)으로 처리한다. 브라우저가 selectionStart를 value 길이/0으로 돌려주는 불확실성을 피하기 위함 [ASSUMED].
- **Undo 주의(UI-SPEC #11 "Ctrl+Z로 되돌림"):** 기존 `insertTextAtCursor`는 React 제어 입력 값 교체라 **네이티브 undo 스택에 남지 않는다**. 되돌림을 보장하려면 `textarea.focus()` → `setSelectionRange(pos,pos)` → `document.execCommand('insertText', false, text)` 경로(deprecated이나 textarea에서 undo 지원)로 삽입하고 `onChange`가 리듀서를 갱신하게 하고, 실패 시 기존 splice 경로로 폴백한다 [ASSUMED: 브라우저 동작, 수동 검증 항목]. 이 동작은 plan에 별도 task + 수동 확인으로 둔다.

## 2. `checkWriteAccess`와 OAuth bearer (확정: 막힘)

**근거 체인 [VERIFIED: 마이그레이션·코드]**
1. `checkWriteAccess(supabase, userId)`(lib/auth/write-access.ts:54)는 `supabase.rpc('get_write_access', { p_user_id })` 한 번만 호출한다.
2. `get_write_access`는 0008의 plpgsql SECURITY DEFINER 함수. **0039 section 4b가 `'get_write_access(uuid)'`를 주입 대상 배열에 포함**(0039:355)하여 본문 첫 `begin` 뒤에 `perform public.mcp_reject_oauth_caller();`를 넣는다. `mcp_reject_oauth_caller()`는 JWT에 `client_id`가 있으면 `42501 'browser session required'`를 raise한다.
3. 테스트 카탈로그도 `'get_write_access(uuid)': 'block'`로 분류하고 OAuth 호출이 raise함을 검증한다(tests/mcp/read-boundary.database.test.ts `RAISING_BLOCKED_RPCS`).
4. 오류가 나면 `checkWriteAccess`는 `deny('write_unavailable')`(fail closed)를 돌려준다 → **OAuth bearer 클라이언트로 부르면 모든 쓰기가 영원히 거절**된다. 정지 계정만이 아니라 정상 계정도 막힌다.
5. 대체 경로(profiles REST 직접 조회)도 막혀 있다: 0039 section 1이 `profiles`를 포함한 모든 테이블에 `oauth_browser_only` RESTRICTIVE 정책(`client_id is null`)을 건다. (`profiles` RLS 활성은 0039가 보장하지 않으면 마이그레이션이 실패하도록 되어 있다.)

**결론/최소 설계**
- 완화(예: `get_write_access`에서 가드 제거)는 **하지 않는다** — 0039 분류(`block`)와 카탈로그 테스트를 깨고, 다른 경로 노출을 키운다.
- **쓰기 RPC 본문 안에서** `public.user_can_write(v_user)`를 직접 호출한다. `user_can_write`는 0008에서 모든 API 롤의 EXECUTE를 회수했지만, postgres 소유 SECURITY DEFINER 함수 안에서는 호출 가능하다(`soft_delete_kb_node`, `create_chapter_atomic`이 이미 그렇게 쓴다 — 0008, 0020). 결과: 정지(기간/영구)와 탈퇴(`deleted_at`)는 `user_can_write`가 false, 탈퇴는 `mcp_grant_is_live()`도 false.
- 오류 마커는 `mcp_write_denied`(→ `McpToolError('suspended')`)로 raise해 도구가 고정 한국어 문구로 응답.
- **스튜디오(브라우저) 쪽**은 문제 없다: browser JWT에는 `client_id`가 없으므로 `checkWriteAccess(sessionClient, user.id)`가 그대로 동작한다. UI의 `readOnly` 플래그는 서버 컴포넌트에서 이걸로 계산한다. 단 RPC 자체도 `user_can_write`를 재확인한다(UI 비활성화는 UX일 뿐 방어선이 아니다).
- 테스트(일회용 DB 필수): ① 정상 작가의 OAuth 토큰으로 `save_draft` 성공 ② `profiles.sanction_kind='suspension', sanctioned_until=now()+interval '1 day'` 설정 후 같은 토큰 거절(`suspended`), 만료 시각 과거면 허용(D-08) ③ `permanent_suspension` 거절 ④ 탈퇴(`deleted_at`) 거절 ⑤ **회귀 증명:** 같은 OAuth 토큰으로 `get_write_access`를 직접 호출하면 42501(이 phase가 의존하지 않는다는 근거 고정).

## 3. 스키마·RLS·RPC 제안 (마이그레이션 0051+)

**번호:** `ls supabase/migrations` 결과 최신 `0050_feed_public_read_cost.sql`, 0041~0049는 결번. 신규는 `0051_...`부터. `tests/migrations/numbering.test.ts`는 4자리 중복만 검사하므로 0051/0052 가능 [VERIFIED]. **공유 DB에는 적용하지 않는다**(STATE: 공유 DB는 0001~0021·0028만 적용, 일회용 DB에서만 검증).

### 3.1 `mcp_drafts`
```sql
create table public.mcp_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  work_id uuid not null references public.works(id),
  chapter_id uuid not null references public.chapters(id),
  oauth_client_id uuid not null,                    -- 스냅샷. FK 없음(클라이언트가 지워져도 이력 유지)
  client_name text not null check (pg_catalog.char_length(pg_catalog.btrim(client_name)) between 1 and 200),
  redirect_host text not null check (pg_catalog.char_length(pg_catalog.btrim(redirect_host)) between 1 and 253),
  body text not null check (pg_catalog.char_length(body) between 1 and 30000),
  body_hash text not null check (body_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default pg_catalog.now(),
  decided_at timestamptz,                           -- 첫 전이 시각
  last_imported_at timestamptz,                     -- 마지막 에디터 가져오기
  import_count integer not null default 0,
  check ((status = 'pending') = (decided_at is null))
);
create index mcp_drafts_owner_pending_idx on public.mcp_drafts (owner_id, created_at desc, id) where status = 'pending';
create index mcp_drafts_owner_done_idx    on public.mcp_drafts (owner_id, decided_at desc, id) where status <> 'pending';
create index mcp_drafts_chapter_pending_idx on public.mcp_drafts (chapter_id) where status = 'pending';
create index mcp_drafts_work_pending_idx    on public.mcp_drafts (work_id)    where status = 'pending';
create unique index mcp_drafts_pending_dedupe on public.mcp_drafts (chapter_id, body_hash) where status = 'pending';
```
`client_name`은 필요 시 DB에서 `btrim`/제어문자 제거 후 저장(DCR 이름은 공격자 입력, §8).

### 3.2 `mcp_kb_proposals`
```sql
create table public.mcp_kb_proposals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  work_id uuid not null references public.works(id),
  kind text not null check (kind in ('create','edit')),
  target_node_id uuid references public.kb_nodes(id),   -- edit: 대상 문서 / create: 수락 후 생성 노드는 result_node_id
  category text check (category in ('인물','장소','사건','세력','아이템')),  -- create 전용. 'template'·'회차'·'custom' 불가
  name text not null check (pg_catalog.char_length(pg_catalog.btrim(name)) between 1 and 80),  -- create: 제안 제목 / edit: 제안 시점 문서명 스냅샷
  body text not null check (pg_catalog.char_length(body) between 1 and 50000),
  body_hash text not null check (body_hash ~ '^[0-9a-f]{64}$'),
  base_content text,                                    -- edit 전용: 제안 시점 원문 스냅샷(이력 diff 용)
  base_hash text check (base_hash ~ '^[0-9a-f]{64}$'),  -- edit 전용: D-P14-08 "base 버전 기록"
  oauth_client_id uuid not null,
  client_name text not null check (...), redirect_host text not null check (...),
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default pg_catalog.now(),
  decided_at timestamptz,
  applied_hunks integer, total_hunks integer,           -- 이력 표시 "수락함 · k/N곳"
  result_node_id uuid references public.kb_nodes(id),   -- create 수락 시 생성된 노드
  check ((status = 'pending') = (decided_at is null)),
  check ((kind = 'create' and target_node_id is null and category is not null and base_hash is null and base_content is null)
      or (kind = 'edit'   and target_node_id is not null and category is null and base_hash is not null and base_content is not null))
);
-- 인덱스: owner pending/done, work pending, target_node pending (트리 배지 C)
create unique index mcp_kb_edit_dedupe   on public.mcp_kb_proposals (target_node_id, body_hash) where status='pending' and kind='edit';
create unique index mcp_kb_create_dedupe on public.mcp_kb_proposals (work_id, category, name, body_hash) where status='pending' and kind='create';
```

### 3.3 RLS·권한 (0038/0039 경계 재현)
```sql
alter table public.mcp_drafts enable row level security;   -- mcp_kb_proposals 동일
create policy mcp_drafts_select_own on public.mcp_drafts for select to authenticated
  using (owner_id = (select auth.uid()));
create policy oauth_browser_only on public.mcp_drafts as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);
revoke all on public.mcp_drafts from public, anon, authenticated;
grant select on public.mcp_drafts to authenticated;      -- INSERT/UPDATE/DELETE 권한·정책 없음
```
- 0039의 `oauth_browser_only` 루프는 **적용 시점에 존재하던 테이블만** 덮는다. 새 테이블은 위 정책을 **직접** 만들어야 한다. 두 겹(grant 없음 + RESTRICTIVE)으로 OAuth 토큰은 REST로 읽기도 쓰기도 못 한다.
- 정지 계정 읽기 허용(D-P14-15): SELECT 정책에 write-access 조건을 넣지 않는다.
- 탈퇴 계정: 앱 레이어에서 이미 세션이 차단된다(Phase 12). 필요 시 select 정책에 `exists live profile`을 더하는 것은 선택(권장하지 않음 — 복잡도 대비 이득 낮음) [ASSUMED].

### 3.4 RPC 목록과 분류 (카탈로그 테스트에 반드시 등록)
| RPC | 호출자 | 카탈로그 분류 | 핵심 검사 |
|-----|--------|--------------|----------|
| `mcp_review_pending_cap()` (immutable, `returns int` = 30) | 내부 | 정의자 아님(권한 회수) | cap 단일 출처. TS는 `studio_pending_counts` 결과의 `cap`으로 읽는다 |
| `mcp_save_draft(uuid,uuid,text)` | OAuth | **guard** | §2 골격 |
| `mcp_propose_kb_create(uuid,text,text,text)` (work, category, name, body) | OAuth | **guard** | category ∈ 5종, 이름 길이/금지문자, 작품 소유권, 중복(작품 내 동일 category+name 살아있는 노드가 이미 있으면 `mcp_invalid_input`이 아니라 안내용 마커 `mcp_name_taken` 선택) |
| `mcp_propose_kb_edit(uuid,uuid,text)` (work, node, body) | OAuth | **guard** | 대상: `owner_id=v_user and work_id=p_work and scope='work' and node_type='file' and deleted_at is null and is_locked=false and category<>'template'`; 현재 content와 동일하면 `mcp_no_change`; 현재 content가 50,000자 초과면 `mcp_too_large`; base_content/base_hash를 같은 쿼리로 읽어 저장 |
| `studio_import_draft(uuid)` returns text | browser | **block** (첫 문장 `perform public.mcp_reject_oauth_caller();`) | 소유자·`user_can_write`·`for update`; chapter가 살아있어야 함; pending/rejected→accepted, accepted면 `import_count` 증가만; body 반환 |
| `studio_reject_draft(uuid)` / `studio_reject_kb_proposal(uuid)` | browser | **block** | pending→rejected, 이미 rejected면 멱등, accepted면 `already_decided` |
| `studio_accept_kb_edit(uuid, text new_content, text expected_hash, int applied, int total)` | browser | **block** | 아래 §5 CAS |
| `studio_accept_kb_new(uuid proposal, uuid folder, text name)` | browser | **block** | §6 |
| `studio_pending_counts()` / `studio_list_review_items(...)` | browser | 호출 시 `security invoker`로 만들면 카탈로그(정의자만 대상) 제외; RLS가 소유자 한정 | 목록은 UNION ALL + keyset(`created_at desc, id`) 한 쿼리 |

- 모든 정의자 함수: `set search_path = ''`, 모든 객체 `public.` 한정, `revoke all ... from public, anon, service_role`, `grant execute ... to authenticated`, 끝에 `notify pgrst, 'reload schema'`.
- **카탈로그 테스트 갱신 필수:** `tests/mcp/read-boundary.database.test.ts`의 `EXPECTED_PUBLIC_TABLES`(40개 → 42개)와 `EXPOSED_DEFINER_RPCS`(37개 → 신규 함수 추가; `guard`/`block` 분류). `block` 항목은 `RAISING_BLOCKED_RPCS`가 "임의 인자로 호출해도 `browser session required`"를 기대하므로 **가드가 인자 검증보다 먼저** 실행돼야 한다. 또한 `oauth_browser_only` 존재/OAuth 토큰의 REST SELECT·INSERT·PATCH·DELETE 거부 케이스를 신규 테이블에 추가.
- `p_body` 해시를 DB가 계산(`sha256(convert_to(...))`)하므로, TS는 수락 시점의 원문 해시를 `createHash('sha256').update(text,'utf8').digest('hex')`로 계산해 비교한다. 두 계산은 같은 UTF-8 바이트에 대해 동일하다(정규화에서 서로게이트 정상화로 불일치 방지).

### 3.5 pending 상한 (D-P14-13)
- **작품당 30건**(초안+KB 제안 합산 pending). 정원은 SQL 함수 `mcp_review_pending_cap()` 한 곳. UI-SPEC의 `{N}/{상한}` 안내와 같은 값을 `studio_pending_counts`가 `cap`으로 함께 반환 [ASSUMED: 30은 임의 권고값, 사용자 확정 필요].
- 원자성: `pg_advisory_xact_lock(hashtextextended('mcp_review:'||work_id,0))` 아래에서 dedupe → count → insert. 병렬 N호출이 cap-1에서 동시에 들어와도 합계가 cap을 넘지 않는다는 DB 테스트를 둔다. `works` 행 `for update` 잠금(0020 방식) 대신 advisory lock을 쓰는 이유는 작품 편집 쿼리와 경합하지 않기 위함.
- 회차당 cap은 만들지 않는다(D-P14-02: 회차당 여러 개 허용; 작품 합계로 충분).

## 4. 도구 등록·테스트 패턴 (그대로 미러)

**등록 [VERIFIED: app/mcp/route.ts, lib/mcp/tools/*.ts]**
- `app/mcp/route.ts`의 `createMcpHandler((server) => {...})` 안에서 `registerWorkTools(server)` 등 도메인별 `registerXTools(server: McpToolRegistrar)`를 호출. 신규: `registerProposeTools(server)` (`lib/mcp/tools/propose.ts`)를 `registerWritingContextTools(server)` 뒤에 추가하고 헤더 주석("Seven read-only tools")을 갱신.
- 각 도구: `server.registerTool(name, { title, description, inputSchema: z.strictObject({...}), annotations }, withMcpXTool(schema, async (input, {db, userId}) => {...}))`. 핸들러는 `{ db, userId }`만 받고 `db`는 `createMcpDbClient(info.token)`(Authorization = 호출자 bearer, anon key, 5초 타임아웃). 인증은 `withMcpAuth(required: true)`가 라우트에서 매 요청 서명+`mcp_authorize_call()`로 확인.
- 신원은 인자가 아닌 `readMcpAuthExtra(ctx.http.authInfo)` — `userId`/`ownerId` 키가 스키마에 없어 `strictObject`가 거부한다(`tool-annotations.test.ts`가 이를 검증).
- **권장 도구 3개 (이름은 재량; 단 ROADMAP 명칭 유지):**

| 도구 | 입력(strictObject) | 호출 RPC | 반환 |
|------|-------------------|----------|------|
| `save_draft` | `workId: uuid`, `chapterId: uuid`, `body: string`(1..30000) | `mcp_save_draft` | `{ draftId, status:'pending', duplicate }` |
| `propose_kb_document` (신규 문서) | `workId`, `category: enum 5종`, `name: string(1..80)`, `content: string(1..50000)` | `mcp_propose_kb_create` | `{ proposalId, status:'pending', duplicate }` |
| `propose_kb_edit` (기존 문서 수정) | `workId`, `nodeId`, `content: string(1..50000)` | `mcp_propose_kb_edit` | `{ proposalId, status:'pending', duplicate }` |
  - 신규/수정을 한 도구의 optional `nodeId`로 합치면 `refine`이 필요하고, 클라이언트가 JSON Schema 분기를 잘못 다룰 수 있어 **도구를 분리**한다 [ASSUMED]. 총 도구 수 7→10. 폴더 ID 인자는 두지 않는다: 읽기 도구가 폴더 ID를 노출하지 않으므로 AI는 알 수 없다(§6).
  - 응답에 다른 제안·pending 개수·타인 데이터를 넣지 않는다.

**Annotation 값 (D-P14-18):** `{ readOnlyHint:false, destructiveHint:false, idempotentHint:true, openWorldHint:false }`. 근거: MCP 스펙에서 `readOnlyHint=false`일 때 `destructiveHint` 기본값이 true이므로 **명시적 false** 필수. `idempotentHint:true`는 "같은 인자로 반복 호출해도 추가 효과 없음"으로, pending 상태에서 내용 해시 dedupe(`duplicate:true`)로 뒷받침된다 [CITED: modelcontextprotocol.io 도구 annotations 정의 — 세션에서 원문 재확인은 하지 못함, MEDIUM].

**McpToolError → 상한 오류 매핑:** RPC가 `mcp_pending_limit`를 raise → `mapProposeRpcError` → `McpToolError('queue_full')` → `withMcpWriteTool`이 `{ isError:true, content:[{type:'text', text: ERRORS.queue_full}] }`. 에러 메시지에 SQL/PostgREST 문자열이 섞이지 않도록 기존 `SQL_LEAK` 정규식 테스트(tools.cross-user.database.test.ts)에 새 문구를 `ALLOWED_ERRORS`로 추가.

**테스트 패턴**
| 종류 | 기존 예 | 이 phase |
|------|---------|----------|
| 등록 계약 | `tests/mcp/tool-annotations.test.ts` — 라우트를 import하고 `createMcpHandler`를 레코더로 대체 | **갱신 필수:** "정확히 7개 읽기 도구" 단언과 "모든 도구가 읽기 annotation" 단언이 신규 도구에서 깨진다 → `READ_TOOLS`/`WRITE_TOOLS` 분리, 쓰기 annotation exact 값 단언 |
| 단위(가짜 supabase) | `tests/mcp/tools-kb.test.ts` — `vi.mock('@supabase/supabase-js')`로 `createClient` 가짜, `McpServer`에 직접 등록 | `tools-propose.test.ts`: scope 없음→거절, strict 키 거절, RPC 오류 마커별 고정 문구, 응답에 SQL 문자열 없음 |
| 정적 | `tests/mcp/no-admin-client.test.ts` | 그대로 통과해야 함 + 신규: `lib/mcp/tools/propose.ts`에 `.from('chapters')`/`kb_nodes` 쓰기 호출이 없고 `.rpc('mcp_`만 있음을 정규식 단언 |
| 실DB | `tests/mcp/tools.cross-user.database.test.ts` — `describe.skipIf(!ready)`, `assertDisposableRef()`, `createWriter()`/`issueMcpToken()`/`callTool()` (`tests/helpers/mcp-oauth.ts`), 픽스처는 `postgres(SUPABASE_DB_URL)`로 직접 INSERT | `propose-write.database.test.ts` 신규(§8) |
| 일회용 DB 규약 | `tests/helpers/disposable-ref.ts`가 `MCP_DISPOSABLE_PROJECT_REF`·API URL·DB URL ref 일치와 공유 ref(`ymudwg…`) 아님을 강제 | 같은 헬퍼. 실행: `node --env-file=.env.disposable node_modules/vitest/vitest.mjs run tests/mcp/propose-write.database.test.ts --project db` (13-VALIDATION.md 규약, **skipped 0 필수**, `.env*`는 읽지 않고 `node scripts/check-env.mjs .env.disposable`로만 확인) |

## 5. Hunk diff와 부분 수락

**접근 (재계산 모델, 2-way)**
- 입력은 항상 `(latestOriginal, proposal.body)` 두 문자열. 둘을 `\n`으로 정규화하고(원문에 `\r`이 있으면 결과도 `\n`으로 통일됨을 plan에 명시), 끝 개행 불일치로 마지막 줄이 가짜 변경이 되지 않도록 `proposal` 끝 개행 여부를 원문과 맞춘다.
- `diffLines(a, b)` 결과 part 배열을 순회해 **연속된 removed/added를 하나의 변경 구간(hunk)**으로 묶고, 공통(`!added && !removed`) part는 `same`으로 둔다.
- 적용 = 순회하며 `same`은 그대로, `change`는 선택됐으면 `added` 쪽, 아니면 `removed` 쪽(=원문 유지)을 이어 붙인다. **패치 적용기를 쓰지 않는다** → "hunk가 더 안 맞는다"는 개념이 없고, 충돌은 해시 불일치로만 판정된다.
```typescript
// lib/review/kb-diff.ts  (순수 모듈, 'server-only' 없음 → 클라이언트 표시에도 import 가능)
// Source: jsdiff README (diffLines는 {value, count, added?, removed?} part 배열을 반환) — github.com/kpdecker/jsdiff [MEDIUM]
import { diffLines } from 'diff';

export type Segment =
  | { type: 'same'; text: string }
  | { type: 'change'; index: number; removed: string; added: string };

export function buildSegments(original: string, proposal: string): Segment[] | null {
  const parts = diffLines(original, proposal);   // v9 옵션(timeout/maxEditLength) 존재 여부는 설치 후 타입으로 확인 [ASSUMED]
  if (!parts) return null;                        // 시간 초과 등 → 호출측이 "비교할 수 없음"(전체 수락/거절만)으로 처리
  const out: Segment[] = []; let removed = '', added = '', pending = false, index = 0;
  const flush = () => { if (pending) { out.push({ type: 'change', index: index++, removed, added }); removed = added = ''; pending = false; } };
  for (const p of parts) {
    if (p.removed) { removed += p.value; pending = true; }
    else if (p.added) { added += p.value; pending = true; }
    else { flush(); out.push({ type: 'same', text: p.value }); }
  }
  flush();
  return out;
}

export function applyHunks(segments: Segment[], selected: ReadonlySet<number>): string {
  return segments.map((s) => s.type === 'same' ? s.text : selected.has(s.index) ? s.added : s.removed).join('');
}
```
- 문맥 줄 2줄(UI-SPEC #16)은 `same` 세그먼트의 앞/뒤 2줄을 잘라 표시용으로 만든다. 행 번호 "원문 n행 근처"는 이전 세그먼트들의 줄 수 누적.

**최신 원문 재계산 + 충돌 (D-P14-08)**
1. 상세 화면 로드: 서버가 `kb_nodes.content`(최신)를 읽어 `latestHash = sha256(content)` 계산 → `buildSegments(latest, proposal.body)` → hunk 배열 + `latestHash`를 내려준다. `latestHash !== proposal.base_hash`면 "제안한 뒤 원문이 바뀌어서…" 알림 표시.
2. 적용 클릭: 클라이언트가 `{ proposalId, selected: number[], originalHash }`를 보낸다.
3. 서버 액션: 최신 원문을 **다시 읽어** 해시 계산. `!== originalHash`면 **쓰지 않고** 재계산된 hunk 배열 + 새 `originalHash`를 `{status:'conflict'}`로 반환(UI: 선택 초기화 + `role="alert"` 문구). 같으면 `applyHunks`로 최종 문자열 생성.
4. `studio_accept_kb_edit(p_id, p_new_content, p_expected_hash, p_applied, p_total)` — 한 트랜잭션: `for update`로 제안 행 잠금, status가 pending인지(아니면 `already_decided`), 소유자·`user_can_write`, 대상 노드(`owner_id`, `deleted_at is null`, `is_locked = false`, `category<>'template'`)를 `for update`로 읽고 **현재 content의 sha256이 `p_expected_hash`와 같은지 확인(다르면 `base_changed` → 서버 액션이 다시 conflict 응답)**, 같으면 `update kb_nodes set content = p_new_content, updated_at = now()`와 `status='accepted', decided_at, applied_hunks, total_hunks` 갱신. 3→4 사이의 경합(작가가 다른 탭에서 저장)도 CAS가 잡는다.
5. `p_applied = 0`인 요청은 거부(UI도 비활성). 선택 수가 0이면 전체 거절 경로만 있다.
6. 이력 diff는 **제안 시점 기준**: `base_content` vs `body`로 `buildSegments`, 선택 표시 없이 읽기 전용(재계산 없음, UI-SPEC D).
7. "이미 반영된 내용" 상태: `buildSegments` 결과 change 0개면 적용 숨김, 거절만.
- 기존 `saveNodeContent`(lib/kb/actions.ts:701)는 CAS가 없어 직접 재사용하지 않는다. 대신 같은 의미(소유자, 잠긴 템플릿 거부, `updated_at` 갱신)를 RPC에서 이중 방어로 반복한다.

**의존성 결정:** `diff@9.0.0` 정확 핀 [ASSUMED 패키지 합법성, 위 Audit]. package.json에 `"diff": "9.0.0"`만 추가(타입 번들, `@types/diff` 불필요 — v8+ [CITED: jsdiff README]).

## 6. 신규 문서 제안과 Phase 15 검증 재사용

**제안 시점(MCP, RPC `mcp_propose_kb_create`)**: category enum 5종만(템플릿/회차/custom 불가 → 잠긴 템플릿 만들기 원천 차단), 이름 1..80자·`/` 금지, 작품 소유권 재검증. **폴더 ID는 받지 않는다**(AI가 알 수 없음). 즉 제안은 "카테고리 + 이름 + 내용"이고 위치는 수락 시 결정.

**수락 시점(스튜디오 서버 액션)** — Phase 15 `saveDocumentProposalAction`(app/studio/[workId]/chapters/[chapterId]/actions.ts:353)의 순서를 미러:
1. `supabase.auth.getUser()` → `checkWriteAccess(supabase, user.id)` (browser 세션이므로 정상 동작).
2. 제안 행 조회(소유자 RLS, pending 확인). 제안의 `work_id`를 신뢰 기준으로 사용(클라이언트가 보낸 workId 무시).
3. `listCategoryFolderCandidates`로 기본 위치 = `root`(카테고리 최상위 폴더, Phase 15 D-12 "기본값은 최상위 카테고리 폴더") 계산, 작가가 폴더 선택기(`listCategoryFoldersAction` 재사용)에서 하위 폴더를 고르면 `targetFolderId`와 `folderVersion`을 전달.
4. `validateTargetFolder(supabase, { ownerId, workId, category, targetFolderId, expectedVersion })` — 소유자·작품·scope·category·삭제 상태·루트 유일성(`root_missing`/`root_duplicate`)·깊이 한도·version(`folder_changed`)을 재검증. 실패 시 `FOLDER_COPY[reason]`을 UI-SPEC E의 "제안한 폴더를 쓸 수 없어요 → 폴더 선택기" 상태로 매핑.
5. 템플릿 검증(`validateTargetTemplate`, `validateDocumentAgainstPlan`)은 **적용하지 않는다**: 이들은 Jev가 추천한 템플릿 id/필수 헤딩 계약을 위한 것이고 MCP 제안에는 템플릿 선택이 없다. 작가가 내용을 직접 검토한다. (`createNode`가 `initialContent`를 받으면 시드 템플릿 대신 그 내용을 쓴다 — lib/kb/actions.ts:317~)
6. 생성: **권장 = 원자적 RPC `studio_accept_kb_new(p_id, p_folder_id, p_name)`**. 한 트랜잭션에서 제안 `for update`(pending 확인) → `user_can_write` → 폴더 핵심 술어(`id = p_folder_id and owner_id = auth.uid() and work_id = proposal.work_id and scope='work' and category = proposal.category and node_type='folder' and deleted_at is null`) → `insert into kb_nodes (owner_id, work_id, scope, parent_id, node_type, category, is_locked, name, content) values (uid, work, 'work', p_folder_id, 'file', category, false, p_name, body)`(createNode와 동일 컬럼. `ancestor_ids`/`depth`는 기본값 그대로 — 사용처 없음 [VERIFIED: createNode]) → 제안 `accepted` + `result_node_id`. 기존 BEFORE 트리거(0002 잠금, 0004 회차 폴더 파일 금지, 0023 템플릿 정책)는 정의자 함수 안에서도 발화한다. 이름 충돌은 unique index(`kb_nodes_sibling_name_unique`) 23505 → 기존 `FRIENDLY_NAME_COLLISION` 문구로 매핑하고 작가가 이름을 바꿔 재시도.
   - 대안(비권장): `createNode` 호출 후 상태 전이 RPC. 두 요청이 원자적이지 않아 "노드는 만들어졌는데 제안은 pending"인 중간 상태가 생긴다. 이 대안을 택하면 재시도 시 이름 충돌을 "이미 우리가 만든 것(내용 해시 일치)"으로 판정하는 복구 분기가 필요하다.
7. 수락 후 `revalidatePath('/studio', 'layout')`와 해당 작품 트리 갱신.

**잠금 템플릿 존중:** 신규 생성안은 category 5종이고 `is_locked=false`로 만든다. 수정안은 `is_locked=true`나 `category='template'`이면 제안 단계(RPC)에서 `mcp_not_found`로 거절하고(존재 여부를 구분하지 않음), 수락 단계(RPC)에서 이중 확인한다.

## 7. 스튜디오 통합 지점

| UI-SPEC 항목 | 코드 지점 [VERIFIED] | 지침 |
|--------------|---------------------|------|
| 헤더 배지 A | `app/studio/layout.tsx`가 `<SiteHeader />`를 렌더, `components/layout/site-header.tsx`는 reader 페이지도 쓰는 공용 서버 컴포넌트 | `SiteHeader`에 선택 prop `extraNav?: ReactNode`를 추가해 studio layout에서만 `ReviewCountBadge`를 주입. 건수 쿼리는 studio layout에서 `studio_pending_counts()` **1회**(소유자 pending 인덱스, 행 수는 cap×작품 수로 작음). 실패하면 try/catch로 배지 숨김(UI-SPEC) |
| 회차 트리 배지 B | `app/studio/[workId]/layout.tsx`가 `Promise.all`로 노드·회차를 읽어 `buildTree`/`groupChaptersByFolder`로 `components/studio/kb-tree.tsx`에 전달. `ChapterLeaf`는 `{id,title,isPublished}` | 같은 `Promise.all`에 작품별 카운트 조회 추가 → `ChapterLeaf`/`TreeNode`에 `pendingReviewCount?: number` 병합. 접힌 폴더 합산은 서버에서 자손 합계를 미리 계산해 내려보내는 편이 클라이언트 재귀보다 단순 |
| 설정집 트리 배지 C | `TreeRow`(kb-tree.tsx) 파일 행의 `Link`/`RowActions` 구조 | 배지는 행의 **형제 `<Link>`**(`ml-auto`, `aria-label`), 링크 안 링크 금지. **주의:** `RowActions`가 행 오른쪽을 `absolute right-1`로 덮으므로 hover/focus 시 배지가 가려진다 — 배지는 `RowActions` 앞 흐름 안(`shrink-0`)에 두고 호버 시 겹침을 수동 확인 |
| 에디터 안내줄 B | `chapters/[chapterId]/page.tsx`는 클라이언트 컴포넌트, 데이터는 `getChapterAction`(서버 액션)이 반환 | `getChapterAction` 반환에 `pendingDraftCount`(그 회차 pending, RLS 소유자 count) 추가. 줄은 `<ReviewRequestPanel/>`와 `<Textarea>` 사이에 렌더(0건이면 null). 가져오기 직후 상태 문구 `role="status"`는 편집/저장 시 해제 |
| 라우트 | `app/studio/layout.tsx`가 `/studio/*` 전체에 작가 게이트+SiteHeader 제공. 정적 세그먼트 `settings`, `works`, `[workId]`가 공존 | `app/studio/review/page.tsx`, `app/studio/review/[id]/page.tsx`는 `[workId]` 셸 **밖**(UI-SPEC M1)이라 3탭 모바일 셸을 건드리지 않는다. 정적 세그먼트가 동적 `[workId]`보다 우선하므로 충돌 없음 [ASSUMED: Next 라우팅 규칙 일반론, node_modules 없어 docs 미확인] |
| 서버 액션 후 갱신 | layout은 내비게이션 시 재렌더되지 않음 | 모든 수락/거절/가져오기 액션이 `revalidatePath('/studio', 'layout')`를 호출해야 헤더·트리 배지가 갱신된다 (UI-SPEC "revalidatePath" 요구의 구체형) |
| `?importDraft` | 에디터는 `use(params)` 기반 클라이언트 페이지 | `useSearchParams` 사용 시 Suspense 경계 필요 여부는 Next 16 docs 확인 필요 — 대안: `StudioEditorPanels` 바깥 얇은 래퍼 서버 컴포넌트가 `searchParams`(Promise)를 읽어 prop으로 전달 |

**Next.js 주의 (AGENTS.md):** 이 체크아웃에는 `node_modules`가 없어(`ls node_modules/next` 실패) `node_modules/next/dist/docs/`를 읽지 못했다. 권고한 API(Server Actions, `revalidatePath(path,'layout')`, `searchParams`/`params` Promise, `redirect`)는 모두 현 코드베이스가 이미 쓰는 형태를 따랐다(`use(params)`, `revalidatePath`, `after` 등). **planner는 `npm ci` 후 `node_modules/next/dist/docs/`에서 `revalidatePath`, `searchParams`, `useSearchParams`/Suspense 항목을 먼저 확인하는 task(Wave 0)를 둘 것.**

## 8. 보안·테스트 목록

**위협 벡터와 대응**
| 패턴 | STRIDE | 대응 |
|------|--------|------|
| 주입된 도구 결과(타인 작품/회차 ID)로 교차 사용자 쓰기 | Tampering/Elevation | RPC가 `works.owner_id = auth.uid()`와 `chapters.work_id = p_work_id`를 한 쿼리로 재검증, 실패는 **존재 여부 비구분** `mcp_not_found`. 응답에 입력 ID 에코 금지 |
| 작품 A(소유) + 회차는 같은 작가의 작품 B 소속 | Tampering | `chapters.work_id = p_work_id` 조건으로 불일치 거부(소유권만 확인하면 통과하는 케이스) |
| 읽기 도구 결과 속 프롬프트 인젝션이 `save_draft` 폭주 유도 | DoS | 작품당 pending 30 cap, 내용 해시 dedupe, 본문 상한. 사람이 승인하기 전까지 아무 것도 바뀌지 않음 |
| 공격자 제어 문자열이 작가 UI로 렌더(본문, 제안 제목, **DCR 클라이언트명**) | Spoofing/XSS | React 텍스트만(`dangerouslySetInnerHTML` 금지 정적 테스트), 클라이언트명은 `btrim`+제어/양방향 문자 제거 후 저장, UI는 `truncate`/`line-clamp-2`, 호스트(`redirect_host`) 병기(UI-SPEC #28) |
| OAuth 토큰으로 REST 직접 INSERT/UPDATE(상태를 accepted로 위조 등) | Tampering | DML grant·정책 없음 + `oauth_browser_only` RESTRICTIVE. 테스트: 토큰으로 `/rest/v1/mcp_drafts` GET/POST/PATCH/DELETE 모두 거부 |
| OAuth 토큰이 `studio_*` RPC 호출(자기 제안을 스스로 수락) | Elevation | 첫 문장 `mcp_reject_oauth_caller()` → 42501. 카탈로그 `block` 분류 + 테스트가 임의 인자로 호출해 확인 |
| 해제된 grant의 토큰으로 쓰기 | Elevation | `mcp_grant_is_live()` + 라우트 `mcp_authorize_call`. 해제 전 발급 토큰으로 `save_draft` 재호출 시 거절 테스트(revoke-blocks 패턴) |
| 정지/탈퇴 계정 | Elevation | §2 RPC 내 `user_can_write`. 수락/거절/가져오기 RPC도 동일(D-P14-15), 읽기(SELECT)는 허용 |
| 동일 수락 동시 클릭/이중 탭 | Tampering | `for update` + status 확인(+CAS 해시). 한쪽만 성공, 나머지는 `already_decided` → UI "다른 곳에서 이미 처리" |
| 사용자가 보는 diff와 쓰는 내용 불일치 | Tampering | 서버가 diff 재계산·적용(클라이언트가 최종 문자열을 보내지 않음), 해시 CAS |
| 에러 메시지로 SQL/토큰 누출 | Info disclosure | 고정 한국어 문구만(기존 `SQL_LEAK` 검사 확장) |
| 회차 본문 조용한 덮어쓰기 | Tampering | 구조적으로 불가: 쓰기 RPC들은 `chapters`를 UPDATE하지 않음. 정적 테스트(소스에 `chapters` 쓰기 없음) + DB 테스트("save_draft/수락/거절 후 `chapters.content`·`updated_at` 불변") |

**멱등성/dedupe:** `(chapter_id, body_hash) where pending`, `(target_node_id, body_hash) where pending and kind='edit'`, `(work_id, category, name, body_hash) where pending and kind='create'` 부분 unique. RPC는 insert 전 조회 + advisory lock으로 `duplicate:true`를 돌려준다. 거절/수락된 것과 같은 내용의 재제안은 새 pending으로 허용(작가가 거절한 내용을 AI가 다시 보내는 것을 막을지는 Open Question 3).

**실DB 테스트 목록 (일회용 DB 전용, `tests/mcp/propose-write.database.test.ts`)**
1. 정상: A 토큰으로 A 회차에 `save_draft` → pending 1행, `client_name`/`redirect_host`가 `mcp_connections` 값, `chapters.content` 불변.
2. 교차 사용자: B 토큰 + A의 `workId`/`chapterId` → missing, 응답 raw에 A 텍스트·ID 없음, DB에 B 소유 행 0, A 행 증가 0. KB 신규/수정 동일. (주입 시나리오: A 비밀 문구가 든 문서를 *읽도록 유도된* B 도구가 그 ID로 쓰기 시도.)
3. 작품/회차 불일치(같은 소유자의 다른 작품) → missing.
4. 삭제된 회차/작품, 잠긴 템플릿 문서, `category='template'` 문서, account_template 범위 문서 → missing.
5. 정지(기간·영구)·탈퇴·grant 해제·scope 없음(`mcp_connections.scopes`에서 제거 불가 제약이 있으므로 단위 테스트로 대체) → 각각 고정 문구 거절.
6. cap: 29건 채운 뒤 병렬 5호출 → pending 합계 정확히 30; 31번째는 `queue_full`; 이미 있는 내용 재호출은 cap 도달 후에도 `duplicate:true`.
7. dedupe: 같은 본문 2회 → 1행, `duplicate:true`.
8. 크기: 30,000자 정상, 30,001자 거절(zod와 RPC 양쪽), 제어문자 포함 입력 정규화 결과 확인.
9. REST 직접 접근: OAuth 토큰으로 두 테이블 GET(0행/거부)·POST·PATCH·DELETE 거부; `studio_*` RPC 호출 42501.
10. 브라우저 세션: 타 작가 제안 SELECT 0행, 타 작가 `studio_*` 호출 not found; 정지 계정은 SELECT 가능·`studio_*` 거절.
11. 수락 경로: `studio_import_draft` pending→accepted, 재호출 `import_count` 증가·상태 유지, rejected→accepted 허용, chapter 삭제 시 거절; KB 수정 CAS(중간에 content 변경 시 `base_changed`), 선택 0개 거부, 잠긴/삭제 노드 거부; 신규 문서 이름 충돌·잘못된 폴더·`root_duplicate`.
12. 카탈로그: `read-boundary` 갱신본이 42개 테이블, 신규 RPC 분류를 모두 통과.

**단위 테스트 목록 (`tests/review/*.test.ts`, `tests/mcp/tools-propose.test.ts`)**
`normalizeProposalText`(CRLF, 제어문자, 양방향 문자, 서로게이트, 개행 축소, 빈 문자열), `buildSegments/applyHunks`(빈 변경, 전부 선택, 부분 선택, 끝 개행, 반복 줄, CRLF, 변경 0개), 해시 일치(JS vs 알려진 sha256 벡터), 도구 입력 strictObject 키 거부·상한, `mapProposeRpcError` 매핑 전수, 정적 스캔(dangerouslySetInnerHTML 부재, 쓰기 도구에 admin client/`from('chapters')` 부재).

## Common Pitfalls

### Pitfall 1: `checkWriteAccess`를 MCP 경로에서 재사용
**What goes wrong:** 모든 쓰기가 `write_unavailable`로 실패(또는 테스트에서만 우연히 통과).
**Why:** 0039가 `get_write_access`를 OAuth에 대해 `block`. **How to avoid:** 쓰기 RPC 내부 `user_can_write`. **Warning signs:** 일회용 DB에서 정상 계정이 도구 호출 즉시 "제안을 저장할 수 없음"을 받음.

### Pitfall 2: 새 테이블이 0039 OAuth 경계 밖에 놓임
**What goes wrong:** 0039의 `oauth_browser_only` 루프는 일회성이라 새 테이블에 자동 적용되지 않는다 → OAuth 토큰이 `/rest/v1/mcp_drafts`를 SELECT(또는 정책/그랜트 실수 시 UPDATE)할 수 있다.
**How to avoid:** 마이그레이션 안에서 정책 생성 + 카탈로그 테스트 갱신. **Warning signs:** `read-boundary` 카탈로그 테스트가 "42개 기대, 실제 다름"으로 실패하지 않고 **목록만 갱신하고 정책 확인을 빼먹음** — 정책 존재 단언을 추가.

### Pitfall 3: 기존 테스트 2종이 신규 도구/RPC로 깨짐
`tool-annotations.test.ts`("정확히 7개", "모든 도구가 읽기 annotation")와 `read-boundary.database.test.ts`(테이블 40개/RPC 37개 카탈로그). 같은 plan에서 갱신하지 않으면 다른 task의 DB 스위트가 붉어진다.

### Pitfall 4: 레이아웃 배지 갱신 누락
Next App Router 레이아웃은 클라이언트 내비게이션에서 재렌더되지 않는다. 액션 후 `revalidatePath('/studio','layout')`를 빼면 수락해도 배지가 남는다. 반대로 AI가 새 제안을 보내도 새로고침 전까지 숫자가 변하지 않는 것은 UI-SPEC 의도(폴링 없음)이다.

### Pitfall 5: 프로그램 삽입은 네이티브 undo에 남지 않음
React 제어 `<textarea>` 값 교체는 undo 스택을 지운다. UI-SPEC #11이 Ctrl+Z 되돌림을 요구하므로 `execCommand('insertText')` 경로를 시도하고 수동 검증한다(§1).

### Pitfall 6: diff 끝 개행·CRLF
`diffLines`는 마지막 줄 개행 유무 차이를 변경으로 본다. 정규화(§5)와 전용 단위 테스트가 없으면 "아무것도 안 바꾼 hunk"가 생긴다. CRLF 원문은 결과가 LF로 통일되는 부작용을 문서화한다.

### Pitfall 7: 트리 배지가 `RowActions`에 가려짐 / 링크 중첩
행 오른쪽을 `RowActions`가 덮는다(hover/active 시). 배지를 `<Link>` 안에 넣으면 링크 안 링크 위반. 형제 요소로 두고 시각 확인.

### Pitfall 8: 인박스 "전체" 탭 페이지네이션
두 테이블을 각각 offset으로 읽어 합치면 정렬·페이지 경계가 틀어진다. 한 RPC/UNION ALL + keyset.

### Pitfall 9: 삭제된 회차/작품의 임베드가 null
`works_owner_all` RLS는 `deleted_at is null`만 보이므로 삭제 작품은 임베드 select에서 null → UI 분기("대상 회차가 삭제되어…") 필요. 목록 쿼리에서 `inner join`을 쓰면 이력이 사라지므로 left join.

## Code Examples

### 도구 등록 (기존 kb.ts 패턴 미러)
```typescript
// Source: lib/mcp/tools/kb.ts (구조), 신규 파일 lib/mcp/tools/propose.ts
export const saveDraftInputSchema = z.strictObject({
  workId: z.string().uuid(), chapterId: z.string().uuid(), body: z.string().min(1).max(30000),
});
server.registerTool('save_draft', {
  title: '회차 초안 제안 저장',
  description: '본인 회차에 대한 초안을 "검토 대기"로 저장합니다. 회차 본문은 바뀌지 않으며 작가가 스튜디오에서 수락해야 에디터로 가져갑니다.',
  inputSchema: saveDraftInputSchema, annotations: MCP_WRITE_ANNOTATIONS,
}, withMcpWriteTool(saveDraftInputSchema, async ({ workId, chapterId, body }, { db }) => {
  const text = normalizeProposalText(body);                 // 정규화 후 빈 문자열이면 McpToolError('too_large'→입력 오류 문구)
  const { data, error } = await db.rpc('mcp_save_draft', { p_work_id: workId, p_chapter_id: chapterId, p_body: text });
  if (error) mapProposeRpcError(error);
  const row = z.array(z.object({ out_id: z.string().uuid(), out_duplicate: z.boolean() })).length(1).parse(data)[0];
  return { draftId: row.out_id, status: 'pending', duplicate: row.out_duplicate };
}));
```

### 스튜디오 RPC 가드 + 상태 전이 (block 분류)
```sql
-- Source: 0039 section 4 패턴 (가드가 첫 문장)
create function public.studio_import_draft(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_row public.mcp_drafts%rowtype;
begin
  perform public.mcp_reject_oauth_caller();
  v_user := (select auth.uid());
  if v_user is null or not public.user_can_write(v_user) then raise exception 'write_access_denied'; end if;
  select d.* into v_row from public.mcp_drafts d where d.id = p_id and d.owner_id = v_user for update;
  if not found then raise exception 'review_not_found'; end if;
  if not exists (select 1 from public.chapters c join public.works w on w.id = c.work_id
                  where c.id = v_row.chapter_id and c.deleted_at is null and w.deleted_at is null) then
    raise exception 'chapter_unavailable';
  end if;
  update public.mcp_drafts set
    status = 'accepted', decided_at = coalesce(decided_at, pg_catalog.now()),
    last_imported_at = pg_catalog.now(), import_count = import_count + 1 where id = p_id;
  return v_row.body;
end; $$;
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| 앱 레이어에서 `checkWriteAccess` 후 직접 INSERT | OAuth 호출은 definer RPC 안에서 `user_can_write` | 0039 이후 필수 |
| `@types/diff` 별도 설치 | jsdiff v8+ 자체 타입 | 추가 devDependency 없음 [CITED: jsdiff README] |

**Deprecated/outdated:** `document.execCommand`는 deprecated이나 textarea undo 보존 용도로는 여전히 쓰인다 — 폴백 경로 필수 [ASSUMED].

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | pending 상한 30건/작품(초안+KB 합산) | §3.5 | 숫자만 조정(SQL 함수 한 곳). 사용자 확정 필요 |
| A2 | 초안 상한 30,000자, KB 제안 50,000자 | §1, §3 | 긴 회차 거절 증가. 사용자 분량 기준 확인 필요 |
| A3 | `diff@9.0.0`의 합법성(slopcheck 미실행), `diffLines` 반환 형태·`timeout` 옵션 존재 | Standard Stack, §5 | 설치 후 타입 확인으로 해소. 옵션 없으면 입력 길이 상한으로 방어 |
| A4 | `execCommand('insertText')`가 textarea에서 undo를 보존 | §1, Pitfall 5 | Ctrl+Z 요구(UI-SPEC #11)를 못 지킴 → 수동 검증, 폴백은 undo 없음 고지 |
| A5 | 도구 3분할(`propose_kb_document`+`propose_kb_edit`) | §4 | 도구 수·테스트 기대값 변경 정도. 합치려면 optional nodeId + refine |
| A6 | 폴더 ID를 AI가 알 수 없어 인자에서 제외 | §6 | 폴더 지정 UX 요구가 있으면 읽기 도구 확장(Phase 13 재오픈) 필요 |
| A7 | 수정안 대상은 `scope='work'` 비템플릿 문서만(account_template·템플릿 제외) | §3.4 | 계정 공유 문서 수정안 요구 시 RPC 술어 확장 |
| A8 | 새 pending dedupe는 pending 한정(거절/수락 내용 재제안은 허용) | §8 | AI가 거절 내용을 반복 제안해 작가 피로 → 별도 정책 필요 |
| A9 | Next 정적 세그먼트가 `[workId]`보다 우선, `useSearchParams` Suspense 필요 여부 | §7 | node_modules 없어 docs 미확인. 추정 틀리면 라우트 이동/래퍼 조정 |
| A10 | 한국어 웹소설 한 회 통상 5~6천 자 | §1 | 상한 근거 약화 |
| A11 | 통상 Supabase Postgres 버전에서 `sha256()`/`hashtextextended` 사용 가능 | §2~3 | 이미 0037이 `hashtextextended` 사용 [VERIFIED], `sha256`은 PG11+ [ASSUMED 일회용 DB 버전] |

## Open Questions

1. **pending 상한 30과 본문 상한 30,000자를 확정할 것인가?**
   - 알려진 것: 숫자는 plan 재량(D-P14-13/04). 근거는 기존 상수와 통상 분량.
   - 불명: 작가의 실제 한 회 분량·한 작품 검토 용량.
   - 권고: 30 / 30,000 / 50,000으로 시작, SQL 함수·TS 상수 각 한 곳에서만 정의하고 값 변경 시 테스트가 두 곳을 함께 검증.
2. **신규 문서 제안에서 폴더 지정을 AI에게 줄 것인가?** 현재는 category+name만, 위치는 수락 시. UI-SPEC E의 "제안한 폴더를 쓸 수 없어요" 문구는 *카테고리 루트가 없거나 중복·변경된 경우*에 사용. 권고: 그대로 진행(읽기 도구가 폴더 ID를 노출하지 않음).
3. **거절된 내용의 동일 재제안 허용 여부?** 권고: 허용(pending dedupe만). 반복 제안 억제는 사용 후 판단.
4. **`SiteHeader` prop 확장 vs studio 전용 헤더 래퍼?** 권고: 선택 prop `extraNav` 1개 추가(영향 최소).
5. **KB 수락이 CRLF 원문을 LF로 바꾸는 것을 허용?** 권고: 허용하고 문서화(대부분의 설정집은 브라우저 `<textarea>` 입력이라 LF). 아니면 줄 단위로 원래 종결자를 보존하는 변형 필요.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | 모든 task | ✓ | v22.14.0 | — |
| npm | `diff` 설치, vitest | ✓ | (npm view 동작 확인) | — |
| `node_modules/` | 테스트·Next docs 열람 | ✗ (이 체크아웃에 없음) | — | **Wave 0에 `npm ci` 필요**, 이후 `node_modules/next/dist/docs/` 확인 |
| `.env.disposable` | 실DB 스위트 | ✓ 파일 존재(내용은 읽지 않음, `node scripts/check-env.mjs .env.disposable`로만 확인) | — | 없으면 DB 스위트는 skip이 아니라 **중단·보고**(13-VALIDATION 규약) |
| 일회용 Supabase 프로젝트 (0001~0050 적용) | DB 스위트, 0051+ 검증 | 미확인(가정: 13 phase에서 0037~0039 적용됨, 0050 적용 여부 확인 필요) | — | `scripts/apply-pending-migrations.mjs --env-file .env.disposable --expect-ref <ref> --from 0040 --to 0051 --execute`(공유 ref는 스크립트가 거부) |
| 공유 Supabase 프로젝트 | — | 사용 금지 | — | 0037~ 미적용 상태이며 별도 승인 필요 |

**Missing dependencies with no fallback:** `node_modules`(Wave 0에서 설치). **Missing with fallback:** 없음.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.11 (프로젝트 `unit` / `db` 분리) [VERIFIED: vitest.config.ts] |
| Config file | `vitest.config.ts` (DB 마커: `helpers/db`, `SUPABASE_DB_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `postgres(` 포함 파일은 자동 `db` 프로젝트, 직렬) |
| Quick run command | `npx vitest run tests/review tests/mcp/tools-propose.test.ts tests/mcp/tool-annotations.test.ts tests/mcp/no-admin-client.test.ts --project unit` |
| Full suite command | `npx vitest run --project unit` + DB: `node --env-file=.env.disposable node_modules/vitest/vitest.mjs run tests/mcp --project db` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MCP-05 | save_draft가 pending만 만들고 chapters 불변, 소유권·정지·cap·dedupe | unit + db | `npx vitest run tests/mcp/tools-propose.test.ts --project unit` / `...propose-write.database.test.ts --project db` | ❌ Wave 0 |
| MCP-05 | 본문 정규화·상한 | unit | `npx vitest run tests/review/text.test.ts --project unit` | ❌ Wave 0 |
| MCP-06 | 신규/수정 제안 pending만 생성, 잠긴/템플릿 문서 거절 | unit + db | 위와 동일 | ❌ Wave 0 |
| MCP-06 | hunk 계산·부분 적용·충돌 | unit | `npx vitest run tests/review/kb-diff.test.ts --project unit` | ❌ Wave 0 |
| MCP-06/07 | 수락 RPC CAS·원자성·이중 수락 | db | `...propose-review.database.test.ts --project db` | ❌ Wave 0 |
| MCP-07 | 인박스 목록/건수/필터, 정지 계정 읽기전용, 출처 표시 | unit(쿼리 헬퍼) + db + 수동 | `npx vitest run tests/review/queries.test.ts --project unit` | ❌ Wave 0 |
| MCP-05~07 | 도구 등록·annotation | unit | `npx vitest run tests/mcp/tool-annotations.test.ts --project unit` | ✅ (갱신 필요) |
| MCP-05~07 | 새 테이블/RPC가 OAuth 경계 안 | db | `...read-boundary.database.test.ts --project db` | ✅ (카탈로그 갱신 필요) |

### Sampling Rate
- **Per task commit:** 위 Quick run (unit).
- **Per wave merge:** unit 전체 + 일회용 DB에서 `tests/mcp` db 프로젝트 전체(skipped 0, 실행 수 > 0).
- **Phase gate:** 둘 다 green + 수동 검증 후 `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `npm ci` (node_modules 부재) 및 Next 16 docs 확인 task
- [ ] `tests/review/text.test.ts`, `tests/review/kb-diff.test.ts`, `tests/review/queries.test.ts`
- [ ] `tests/mcp/tools-propose.test.ts`, `tests/mcp/propose-write.database.test.ts`, `tests/mcp/propose-review.database.test.ts`
- [ ] `tests/mcp/tool-annotations.test.ts`, `tests/mcp/read-boundary.database.test.ts` 카탈로그 갱신(기존 파일 수정)
- [ ] 일회용 DB에 0051+ 적용 절차(`apply-pending-migrations.mjs`) 확인

### 수동 검증 (자동화 불가)
- 실제 Claude 커스텀 커넥터에서 `save_draft`/`propose_kb_*` 호출 → 인박스 도착(출처 표시) (Phase 13과 같은 일회용 DB + 터널 방식).
- 에디터 가져오기: 커서 위치/끝 삽입, **Ctrl+Z 되돌림**, 저장 전 이탈 후 이력에서 재가져오기.
- 모바일 폭에서 인박스·상세·고정 액션바, 트리 배지 hover 겹침, 스크린리더로 diff 접두/라벨.

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (MCP bearer) | 기존 `verifyMcpToken` + 라이브 grant (변경 없음) |
| V3 Session Management | yes | browser 세션(`client_id` 없음) vs OAuth 토큰 구분: RLS RESTRICTIVE + `mcp_reject_oauth_caller()` |
| V4 Access Control | yes | RPC 내 소유권 재검증, 정지/탈퇴 차단, 소유자 SELECT RLS |
| V5 Input Validation | yes | zod strictObject + `normalizeProposalText` + DB CHECK/길이 + 출력 이스케이프(React 텍스트) |
| V6 Cryptography | 해시만 | sha256(Node/PG 내장). 직접 구현 금지 |
| V7 Error Handling/Logging | yes | 고정 문구, SQL/토큰 비노출 |

### Known Threat Patterns
위 §8 표 참조 (교차 사용자 쓰기, 프롬프트 인젝션 폭주, 출처 위장, REST 직접 접근, 이중 수락, 정지 우회).

## Sources

### Primary (HIGH confidence)
- 코드 직접 확인: `lib/mcp/{tool-runtime,db-client,auth,owned-work}.ts`, `lib/mcp/tools/{kb,works}.ts`, `app/mcp/route.ts`, `lib/auth/write-access.ts`, `lib/kb/actions.ts`, `lib/ai/{document-contract,document-plan}.ts`, `app/studio/layout.tsx`, `app/studio/[workId]/layout.tsx`, `app/studio/[workId]/chapters/[chapterId]/{page.tsx,actions.ts}`, `lib/studio/{editor-state,editor-session}.ts`, `lib/chapters/actions.ts`, `components/studio/{kb-tree,sidebar-groups}.tsx`, `components/layout/site-header.tsx`, `components/reader/viewer-shell.tsx`
- 마이그레이션: `supabase/migrations/0002, 0004, 0008, 0020, 0023, 0028, 0037, 0038, 0039, 0050`
- 테스트/규약: `tests/mcp/{tool-annotations,tools-kb,tools.cross-user.database,read-boundary.database,no-admin-client}.test.ts`, `tests/helpers/{disposable-ref,mcp-oauth}.ts`, `vitest.config.ts`, `.planning/phases/13-mcp-read-context/13-VALIDATION.md`
- npm registry: `npm view diff` (version 9.0.0, modified 2026-04-13, repo kpdecker/jsdiff, 의존성·postinstall 없음), api.npmjs.org 주간 다운로드

### Secondary (MEDIUM confidence)
- https://github.com/kpdecker/jsdiff README (WebFetch): `diffLines`, `structuredPatch`, `applyPatch` 존재, v8부터 타입 번들, ESM/CJS

### Tertiary (LOW confidence — 검증 필요)
- MCP annotations 기본값(`destructiveHint` 기본 true) 정의: 훈련 지식, 세션에서 스펙 원문 미확인
- `execCommand` undo 동작, 라우팅 우선순위, jsdiff v9 세부 옵션: 설치 후/브라우저에서 확인

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM — `diff` 메타데이터는 확인했으나 slopcheck 미실행, API 세부는 설치 후 확인
- Architecture: HIGH — 0037~0039, 기존 도구/테스트 패턴을 직접 읽고 일치시킴
- Pitfalls: HIGH — OAuth 차단·카탈로그 테스트 파손은 코드로 확증, UI/브라우저 항목은 MEDIUM

**Research date:** 2026-11-09
**Valid until:** 2026-12-09 (코드 기반 사실은 0051 선점이나 0039 변경 시 재확인)
