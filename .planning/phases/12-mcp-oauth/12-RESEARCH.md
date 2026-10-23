# Phase 12: MCP OAuth 기반 · 연결/해제 - Research

**Researched:** 2026-10-23
**Domain:** MCP 원격 서버 인증(OAuth 2.1 Authorization Server = Supabase Auth, Resource Server = Next.js `mcp-handler`), grant 기록·매 호출 검증·해제
**Confidence:** MEDIUM (Supabase 동작은 문서 + `supabase/auth` 소스 + 설치된 `@supabase/auth-js` 타입으로 교차 확인했지만, Claude 커스텀 커넥터와의 실제 상호운용은 스파이크 전까지 미검증)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**스파이크 (첫 작업, 도구 작업과 섞지 않음)**
- **D-01:** 스파이크는 **일회용 Supabase + 공개 터널(또는 Vercel 프리뷰)** 에서 수행한다. 공유 Supabase 프로젝트에는 마이그레이션·설정 변경을 적용하지 않는다.
- **D-02:** 합격선은 **실제 Claude 커스텀 커넥터로 discovery → 등록 → 동의 → 토큰 교환 → 인증된 호출 1회, 그리고 토큰 폐기 후 같은 토큰 호출이 실패하는 것까지** 확인하는 것이다.
- **D-03:** 후보는 Supabase Auth OAuth 2.1 Server(기본)와 WorkOS AuthKit. 스파이크가 요건(매 호출 grant 조회 가능, Claude 등록 방식 호환)을 못 채우면 **멈추고 사용자와 재논의**한다. WorkOS 자동 전환·직접 AS 구현은 하지 않는다.

**동의 화면 · 권한**
- **D-04:** 동의 화면은 **NovelScript 앱 내 `/oauth/consent`** 로 두고 Supabase OAuth 서버의 authorization path로 지정한다. 한국어 문구·기존 로그인 세션을 쓴다. (UI hint: yes → UI 목업 필요)
- **D-05:** 독자 전용 계정(작가 프로필 없음)이 연결을 시도하면 **작가 활성화 안내 후 거절**한다. 연결은 성립시키지 않는다.
- **D-06:** 동의 시 **scope를 `읽기`와 `초안 제안 저장`으로 나눠 grant에 기록**한다. 작가는 한 번에 둘 다 승인하며(UX 단일 승인), Phase 13·14가 재동의 없이 도구별 scope 검사를 쓰도록 하기 위한 구조다.
- **D-07:** 동의 화면 문구: 클라이언트명 + 접근 범위, 해제 방법 안내를 보여준다. ('본문 직접 수정 불가' 명시 문구는 이번에 선택되지 않았으므로 필수 아님 — 플래너 재량.)
- **D-08:** 본문 반영 정책(MCP-05)은 유지한다: 대화로 생성·수정한 결과는 '제안된 초안'으로 도착하고 작가가 스튜디오에서 수락해야 반영된다. 본문 직접 수정 도구는 만들지 않는다. (Phase 14 소관, 이번 설계의 scope 구조에만 영향)

**해제 즉시 차단**
- **D-09:** **MCP 호출마다 살아있는 grant를 DB에서 조회**해 유효할 때만 통과시킨다. 서명·만료만 보는 stateless JWT 검증을 단독으로 쓰지 않는다. (나중에 덧붙일 수 없으므로 설계 초기부터 포함)
- **D-10:** grant 조회 실패(DB 장애 등) 시 **호출을 차단(fail closed)** 한다.
- **D-11:** 액세스 토큰 수명은 짧게 유지한다(분 단위 권장, 구체 값은 리서치·플래너 결정).
- **D-12:** 해제 검증은 UI 목록이 아니라 **해제 이전에 발급된 토큰으로 실제 도구 호출을 시도해 차단되는지** 로 한다.

**연결 관리 UI**
- **D-13:** 위치는 **스튜디오 설정 > AI 커넥터**(`app/studio/settings/` 아래, `ai-providers` 옆 신규 페이지).
- **D-14:** 목록 항목: **클라이언트명 · 연결일 · 마지막 사용**. 마지막 사용 시각은 매 호출 grant 조회 시 갱신한다. (승인 scope 표시와 호출 도구/횟수는 이번에 선택되지 않음 — 후순위)
- **D-15:** 해제 UX: **확인 대화상자 + '다음 호출부터 차단됩니다' 문구**. 즉시 차단 보장 이상으로 과장하지 않는다. 재연결이 필요함을 안내한다.

**검증용 도구**
- **D-16:** 이 phase의 MCP 엔드포인트에는 **whoami류 읽기 도구 1개**만 둔다. 연결·본인 범위·해제 차단을 실제 호출로 증명하는 최소 도구이며, 작품 도구는 Phase 13에서 추가한다. 읽기 annotation을 붙인다.

### Claude's Discretion
토큰 수명 구체 값, 터널 도구 선택(ngrok/cloudflared/Vercel 프리뷰), grant 테이블 스키마 세부, 동의 화면의 세부 레이아웃, '본문 직접 수정 불가' 명시 문구 포함 여부.

### Deferred Ideas (OUT OF SCOPE)
- 연결 목록에 승인 scope 표시, 최근 호출 도구/횟수 — 호출 로그 필요, 후순위
- 작가 선택형 '자동 수락' 옵션 — Phase 14 이후 후보
- 작품·회차·설정집 읽기 도구 — Phase 13
- 쓰기 제안·리뷰 큐 — Phase 14
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MCP-01 | 작가가 Claude에서 NovelScript를 커스텀 커넥터로 연결하고, OAuth 계정 연결로 자기 계정 데이터에만 접근하도록 승인할 수 있다 | Supabase OAuth 서버 + DCR(Claude `oauth_dcr`), `/oauth/consent` + `getAuthorizationDetails/approve/deny`, `mcp-handler` `withMcpAuth` + RFC 9728 PRM, 사용자 JWT 스코프 클라이언트 (Q1, Q3, Q4) |
| MCP-08 | 작가가 NovelScript에서 연결된 클라이언트 목록과 마지막 사용 시각을 보고 해제할 수 있으며, 해제 후에는 해당 토큰의 접근이 즉시 차단된다 | 자체 `mcp_connections` 테이블 + 매 호출 SECURITY DEFINER 검증 RPC + `revokeGrant` 병행 (Q2, Q8) |
</phase_requirements>

## Summary

**핵심 발견 5가지.** (1) Supabase Auth OAuth 2.1 Server는 **아직 베타**이며(공식 문서 명시), 토큰 교환/동의 API/DCR/discovery/grant 목록·해제가 있다. (2) **Supabase는 CIMD를 지원하지 않고(공개 이슈 #2850 open) DCR만 지원**한다. Claude는 AS 메타데이터에 `client_id_metadata_document_supported: true`가 없으면 DCR로 폴백하므로 **claude.ai 커스텀 커넥터는 DCR 경로로 동작할 가능성이 높다**(스파이크 검증 대상). (3) Supabase 토큰은 **`aud: "authenticated"` 고정이며 RFC 8707 `resource`를 `aud`에 반영하지 않는다**(이슈 #2610 open) → MCP 스펙의 audience 검증 요구는 Supabase 토큰만으로 충족 불가, 우리가 `client_id` 클레임 + 자체 grant 행 + 세션 생존 검사로 보완해야 한다. (4) **`revokeGrant`는 consent를 revoked로 표시하고 해당 클라이언트 세션을 삭제**하지만 이미 발급된 access JWT는 `exp`까지 암호학적으로 유효하다. 그러나 JWT의 `session_id`가 `auth.sessions`에 없으면 GoTrue 보호 엔드포인트는 `session_not_found`로 거절하므로, **호출마다 세션 생존을 DB에서 확인**하면 즉시 차단이 가능하다. (5) Supabase는 **커스텀 scope를 지원하지 않는다**(허용: `openid profile email phone offline_access`; 그 외는 authorize에서 `unsupported scope` 오류) → D-06의 `읽기`/`초안 제안 저장` scope는 **Supabase scope가 아니라 우리 DB(`mcp_connections.scopes`)에 기록**해야 하며, `withMcpAuth`의 `requiredScopes`를 라우트 레벨에 쓰면 401 챌린지에 `scope=...`가 실려 Claude가 Supabase에 미지원 scope를 요청해 연결이 깨진다.

**권장 접근.** Supabase OAuth Server(AS) + `mcp-handler@2.3.0`(RS) + **자체 `public.mcp_connections` 테이블**(scope·마지막 사용·revoked_at의 정본) + **사용자 bearer로 호출하는 SECURITY DEFINER RPC `mcp_authorize_call()`** 하나가 (a) 연결 행 활성, (b) `auth.sessions`의 session_id 생존, (c) 프로필 활성(탈퇴/삭제 아님)을 한 번에 검사하고 `last_used_at`을 스로틀 갱신한다. 서비스롤 키는 MCP 인증 경로에 쓰지 않는다(Pitfall 2 준수). 해제는 서버 액션이 **(1) 우리 행 `revoked_at` 설정 → (2) `auth.oauth.revokeGrant`** 순서로 수행한다. 스파이크는 일회용 클라우드 Supabase 프로젝트 + 공개 터널로 한다(이 Windows 환경에는 Docker·Supabase CLI·cloudflared·ngrok이 모두 없다).

**Primary recommendation:** 스파이크(plan 1) → grant 스키마 + 검증 RPC + MCP 라우트(plan 2) → `/oauth/consent`(plan 3) → 설정 > AI 커넥터 UI(plan 4). 스파이크 불합격 시 D-03에 따라 멈추고 사용자와 재논의(WorkOS는 폴백 비교만).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| OAuth 발급(authorize/token/DCR/JWKS/discovery) | Supabase Auth (외부 AS) | — | 자체 AS 구현 금지(Anti-Pattern 2). 우리는 설정만 한다 |
| 동의 화면 `/oauth/consent` | Frontend Server (SSR, Next.js) | Browser (버튼 폼) | 로그인 쿠키 세션 + Supabase `oauth.*` 서버 호출 필요. Server Action으로 approve/deny |
| Protected Resource Metadata (`/.well-known/oauth-protected-resource…`) | API / Backend (Route Handler) | CDN(캐시 가능, 1h) | RFC 9728 필수. `resource`가 MCP URL과 정확히 일치해야 함 |
| MCP 엔드포인트 + bearer 검증 | API / Backend (Route Handler, Node 런타임) | Database (grant RPC) | `withMcpAuth` verifyToken에서 JWT 검증 + RPC |
| 매 호출 grant 조회·last_used 갱신 | Database / Storage (SECURITY DEFINER RPC) | API | 해제 즉시 차단의 정본. 서비스롤 없이 사용자 JWT로 호출 |
| scope 기록(`읽기`/`초안 제안 저장`) | Database (`mcp_connections.scopes`) | API (도구별 검사) | Supabase가 커스텀 scope 미지원 |
| 연결 목록/해제 UI | Frontend Server (RSC + Server Action) | Database | 기존 `ai-providers` 패턴 |
| 독자 전용 계정 거절(D-05) | Frontend Server (동의 단계) | Database(approve 시 재검사) | 승인 전에 `denyAuthorization`으로 종료 |
| 브라우저 세션 쿠키 갱신(`proxy.ts`) | Frontend Server (Proxy) | — | bearer 요청과 무관해야 함 → matcher에서 `mcp`·PRM 제외 권장 |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `mcp-handler` | 2.3.0 (npm modified 2026-10-07) | Streamable HTTP MCP 라우트 + `withMcpAuth` + `protectedResourceHandler` | Vercel 공식. peer: `next>=13`, `@modelcontextprotocol/server@^2`. postinstall 없음 [VERIFIED: npm registry; slopcheck OK] |
| `@modelcontextprotocol/server` | 2.3.1 (modified 2026-10-05) | MCP SDK v2 (필수 peer) | `mcp-handler@2.x`의 비선택 peer [VERIFIED: npm registry] |
| `@supabase/supabase-js` | 이미 `^2.112.4` (최신 2.118.0) | `auth.oauth.*`(consent/grants), 사용자 JWT 스코프 클라이언트, `auth.getClaims(jwt)` | 설치본 타입에서 `getAuthorizationDetails/approveAuthorization/denyAuthorization/listGrants/revokeGrant` 확인 [VERIFIED: node_modules/@supabase/auth-js types] |
| `zod` | 이미 `^4.4.3` | MCP tool inputSchema | `mcp-handler@2`가 `zod^4.2` 요구, 충족 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@supabase/server` | 1.9.2 (modified 2026-10-12) | `withOAuthProtectedResource()` / `withSupabase({auth:'user'})` | **채택하지 않는다.** 공식 MCP 문서 예제는 Deno Edge Function 기준이고 Next.js 라우트에는 `mcp-handler`가 이미 같은 역할. 필요하면 스파이크에서 비교만 [VERIFIED: npm; 용도 CITED: supabase.com/docs/guides/auth/oauth-server/mcp-authentication] |
| `supabase` CLI | 2.121.0 (npm) | 일회용 로컬 스택 | Docker 필요. 이 환경엔 없음 → 클라우드 일회용 프로젝트 권장 [VERIFIED: npm registry; 환경 점검] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Supabase OAuth Server | WorkOS AuthKit (`@workos-inc/authkit-nextjs` 4.5.0) | 아래 Q5. 스파이크 실패 시 재논의용. 지금 채택 안 함(D-03) |
| 자체 `mcp_connections` + RPC | `auth.sessions`만 신뢰 | scope(D-06)·마지막 사용(D-14)을 기록할 곳이 없어 불가 |
| RPC에서 `auth.sessions` 직접 조회 | 호출마다 `supabase.auth.getUser(token)` | `getUser`는 공식 API만 써서 내부 스키마 의존이 없지만 HTTP 1회 추가. 스파이크에서 지연 비교 후 택1 (기본: RPC) |

**Installation (실제 설치는 plan 2에서, 스파이크 브랜치에서는 같은 버전 사용):**
```bash
npm install mcp-handler@2.3.0 @modelcontextprotocol/server@2.3.1
```
- 루트에 남아 있던 `mcpres/` 타르볼은 이 worktree에는 없음(STACK.md 언급). 레지스트리에서 설치한다.

**Version verification:** `npm view mcp-handler version` → 2.3.0, `npm view @modelcontextprotocol/server version` → 2.3.1, `npm view @supabase/supabase-js version` → 2.118.0 (2026-10-23 실행) [VERIFIED: npm registry].

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| mcp-handler | npm | 2025-05 생성(약 17개월), 메인테이너 vercel-release-bot/zeit-bot | 미측정 | github.com/vercel-labs/mcp-handler | [OK] | Approved (postinstall 없음 확인) |
| @modelcontextprotocol/server | npm | 2026-04 생성 | 미측정 | github.com/modelcontextprotocol/typescript-sdk | [OK] | Approved |
| @supabase/server | npm | 2026-03 생성 | 미측정 | github.com/supabase/server | [OK] | 설치하지 않음(참고용) |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none
*`slopcheck scan`(pip slopcheck)으로 3개 모두 [OK]. 다만 출처가 "공식 Vercel 문서 + 기존 STACK.md 검토"이므로 설치는 plan 2 첫 작업에서 `npm view <pkg> scripts.postinstall` 재확인 후 진행.*

## Architecture Patterns

### System Architecture Diagram

```
 Claude (claude.ai 커스텀 커넥터; 아웃바운드 160.79.104.0/21)
   |
   | 1) POST https://APP/mcp  (토큰 없음)
   v
 [app/mcp/route.ts = withMcpAuth(handler, verifyToken, {required:true, resourceMetadataPath, resourceUrl})]
   |-- 토큰 없음/무효 --> 401 + WWW-Authenticate: Bearer resource_metadata="https://APP/.well-known/oauth-protected-resource/mcp"
   |
   | 2) GET /.well-known/oauth-protected-resource/mcp  -> {resource:"https://APP/mcp", authorization_servers:["https://<ref>.supabase.co/auth/v1"]}
   | 3) GET <AS>/.well-known/oauth-authorization-server/auth/v1  (discovery; registration_endpoint, S256, none 등)
   | 4) POST <AS>/oauth/clients/register 또는 /oauth/register (DCR; redirect_uri = https://claude.ai/api/mcp/auth_callback)
   v
 [Supabase Auth OAuth Server]  --302--> https://APP/oauth/consent?authorization_id=ID
                                              |
                       [app/oauth/consent/page.tsx (RSC)]
                         - 비로그인 -> /login (next 보존)   - getAuthorizationDetails(ID)
                         - 독자 전용 -> 안내 + denyAuthorization (D-05)
                         - 작가 -> 클라이언트명·redirect 호스트·scope·해제 안내
                                              |  Server Action(approve|deny)
                         approve: mcp_connect RPC(행 upsert, scopes={read,propose_draft}) -> approveAuthorization -> redirect_url
   v
 Claude: 5) POST <AS>/oauth/token (code + code_verifier + resource) -> access JWT(aud=authenticated, client_id, session_id) + refresh
   |
   | 6) POST /mcp  Authorization: Bearer <JWT>
   v
 verifyToken(): getClaims(jwt) [서명·exp]  -> client_id 클레임 없으면 거절(웹 세션 토큰 차단)
              -> 사용자 JWT 클라이언트로 rpc('mcp_authorize_call')  [연결 행 활성 ∧ auth.sessions 생존 ∧ 프로필 활성] + last_used 스로틀
              -> AuthInfo{token, clientId, scopes(DB), extra:{userId}}   (오류/빈 결과 = 거절 = fail closed)
   v
 whoami 도구(read annotation): 사용자 JWT 클라이언트로 본인 정보만 반환

 해제: 설정 > AI 커넥터 -> Server Action: (1) mcp_connections.revoked_at=now() -> (2) auth.oauth.revokeGrant({clientId})
       => 다음 /mcp 호출: RPC가 0행 -> 401
```

### Recommended Project Structure
```
app/
├── mcp/route.ts                                  # withMcpAuth(createMcpHandler(...)) ; export {handler as GET, handler as POST}
├── .well-known/oauth-protected-resource/mcp/route.ts   # protectedResourceHandler({authServerUrls, resourceUrl}) + OPTIONS
├── oauth/consent/page.tsx                        # 동의 화면(RSC)
├── oauth/consent/actions.ts                      # approveAction / denyAction (Server Action)
└── studio/settings/mcp-connections/              # page.tsx, actions.ts, 클라이언트 컴포넌트(해제 대화상자)
lib/mcp/
├── auth.ts          # verifyMcpToken(req, bearer): AuthInfo | undefined  (fail closed)
├── connections.ts   # list/connect/disconnect 헬퍼 (사용자 세션 클라이언트)
├── scopes.ts        # MCP_SCOPES = ['read','propose_draft'], 표시 문구
└── tools/whoami.ts
supabase/migrations/00NN_mcp_connections.sql      # 일회용 DB에서만 검증 (최신 0036 → 번호는 플래너가 확정; 0022 중복·0028/0031 결번 주의)
tests/mcp/*.test.ts
```

### Pattern 1: 매 호출 검증 (verifyToken)
**What:** JWT를 로컬 검증한 뒤, 같은 토큰을 bearer로 쓰는 사용자 스코프 Supabase 클라이언트로 RPC를 호출한다. PostgREST가 서명·exp를 다시 검증하고, 함수는 `auth.jwt()`에서 `client_id`/`session_id`를 읽는다.
**When to use:** 모든 `/mcp` 요청(Phase 13·14 도구 포함).
```typescript
// lib/mcp/auth.ts (설계 스케치; 구현은 plan 2)
// Source: mcp-handler docs/AUTHORIZATION.md (verifyToken 시그니처), supabase-js getClaims(jwt?) 타입
import { createClient } from '@supabase/supabase-js';
import type { AuthInfo } from '@modelcontextprotocol/server';

export async function verifyMcpToken(_req: Request, bearer?: string): Promise<AuthInfo | undefined> {
  if (!bearer) return undefined;
  try {
    const anon = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${bearer}` } } });
    const { data: claims, error } = await anon.auth.getClaims(bearer);      // 서명·exp
    if (error || !claims?.claims?.client_id) return undefined;              // 웹 세션 JWT(client_id 없음) 거절
    const { data, error: rpcErr } = await anon.rpc('mcp_authorize_call');   // 연결 활성 ∧ 세션 생존 ∧ 계정 활성
    if (rpcErr || !data?.[0]) return undefined;                             // 어떤 오류도 거절
    return { token: bearer, clientId: String(claims.claims.client_id),
             scopes: data[0].scopes, extra: { userId: claims.claims.sub } };
  } catch { return undefined; }                                             // fail closed
}
```

### Pattern 2: 라우트 구성 (fail-open 함정 방지)
```typescript
// app/mcp/route.ts (스케치)
import { createMcpHandler, withMcpAuth } from 'mcp-handler';
const handler = createMcpHandler((server) => { /* registerTool('whoami', ... annotations:{readOnlyHint:true}) */ });
const authed = withMcpAuth(handler, verifyMcpToken, {
  required: true,                                                    // 기본값 false = 토큰 없으면 handler가 그대로 실행됨(fail-open)!
  resourceMetadataPath: '/.well-known/oauth-protected-resource/mcp',
  resourceUrl: process.env.MCP_PUBLIC_ORIGIN,                         // 프록시/터널 뒤에서 origin 오판 방지
  // requiredScopes 사용 금지: 401 챌린지에 scope=... 가 실려 Claude가 Supabase 미지원 scope를 요청함
});
export { authed as GET, authed as POST };
```
(소스 `withMcpAuth`: `required=false` 기본, `verifyToken` throw 시 401 invalid_token, `requiredScopes`는 `authInfo.scopes`와 비교해 403 — `mcp-handler@2.3.0` dist 직접 확인 [VERIFIED: 패키지 소스].)

### Pattern 3: 동의 화면 (Supabase 공식 흐름 + 우리 보강)
Supabase 공식 흐름: `authorization_id` 쿼리 → 로그인 확인(없으면 `/login`으로 보내며 보존) → `getAuthorizationDetails` → (이미 동의했으면 `redirect_url`로 즉시 이동) → 클라이언트명·redirect URI·scope 표시 → approve/deny → 반환된 `redirect_url`로 이동 [CITED: supabase.com/docs/guides/auth/oauth-server/getting-started].
보강(우리 몫):
- 승인 직전 서버에서 `profiles.role='writer'` + `isAccountActive` 재확인(UI 신뢰 금지). 독자 전용이면 안내 화면 + "돌아가기"(POST) → `denyAuthorization`. **GET 렌더에서 부작용(deny) 실행 금지.**
- approve 순서: `mcp_connect`(행 upsert, `revoked_at=null`, scopes 고정 `{read,propose_draft}`) → `approveAuthorization`. approve 실패 시 행은 남지만 토큰이 없으므로 무해(검증은 세션 생존도 요구).
- `/oauth/consent`에 `Content-Security-Policy: frame-ancestors 'none'`(+ `X-Frame-Options: DENY`) 헤더(클릭재킹). Server Action은 Next가 Origin/Host를 비교(CSRF) [CITED: node_modules/next/dist/docs/01-app/02-guides/data-security.md "Allowed origins"].
- redirect URI **호스트를 크게 표시**(MCP 스펙 MUST). DCR이 열려 있으면 누구나 "Claude"라는 이름의 클라이언트를 등록할 수 있으므로, 허용 호스트(`claude.ai`, `claude.com`, 루프백 `localhost`/`127.0.0.1`) 밖이면 강한 경고 또는 거절을 권장.

### Anti-Patterns to Avoid
- **서명·exp만 보는 검증**(D-09 위반) / `createAdminClient`로 MCP 인증·도구 구현(Pitfall 2).
- **`withMcpAuth` 기본값(`required:false`) 사용** — 토큰 없는 요청이 도구까지 도달한다.
- **웹 세션 JWT(`client_id` 없음)를 MCP에서 수용** — `client_id` 클레임 필수.
- **`requiredScopes`/PRM `scopes_supported`에 `read` 같은 커스텀 scope를 광고** — Supabase authorize가 `unsupported scope`로 거절.
- **PRM `resource`를 origin만으로 내보내기** — 사용자가 Claude에 입력한 MCP URL(`https://APP/mcp`)과 정확히 같아야 한다(Claude 요구). `protectedResourceHandler`는 `explicit resourceUrl`이 없으면 요청 URL에서 `/.well-known/<seg>`를 떼어 계산하므로 `…/oauth-protected-resource/mcp` 경로에 두거나 `resourceUrl`을 명시한다.
- **UI 목록만 갱신하는 해제**(Pitfall 8).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OAuth AS(authorize/token/DCR/JWKS/PKCE) | 자체 AS | Supabase Auth OAuth Server | Anti-Pattern 2. PKCE·코드 1회성·redirect 정확 일치 내장 |
| RFC 9728 PRM + 401 챌린지 | 수제 `WWW-Authenticate` | `mcp-handler` `protectedResourceHandler`/`withMcpAuth` | 헤더 형식·CORS 처리 내장 |
| Streamable HTTP MCP 전송 | 수제 JSON-RPC | `mcp-handler` + `@modelcontextprotocol/server` | 구/신 스펙 폴백 포함 |
| JWT 서명 검증 | 수제 jose 코드 | `supabase.auth.getClaims(jwt)` | 프로젝트가 이미 `getClaims` 사용; 비대칭 키면 JWKS 로컬 검증, 아니면 서버 조회 |
| PKCE/코드 교환 테스트 상대 | 수제 클라이언트 흉내 | 테스트에서는 REST 호출(아래 Q8) | 프로토콜 로직은 Supabase 몫 |

**Key insight:** 이 phase에서 직접 짜는 것은 "grant 정본 + 검증 RPC + 동의/관리 UI" 세 가지뿐이어야 한다.

## Runtime State Inventory
해당 없음 (greenfield 기능 추가; 이름 변경/마이그레이션 phase 아님). 단 신규 운영 상태: 일회용 Supabase 프로젝트의 OAuth 서버 설정(대시보드 토글)과 DCR로 생성되는 `auth.oauth_clients` 행은 git에 없는 외부 상태이므로 스파이크 종료 시 프로젝트째 폐기한다.

## Common Pitfalls

### Pitfall 1: `revokeGrant`만 호출하면 "즉시 차단"이 아니다
**What goes wrong:** 해제 후에도 이미 발급된 access JWT가 `exp`까지 PostgREST/우리 라우트에서 통과.
**Why:** `revokeGrant`는 consent revoke + 세션 삭제 + refresh 무효화이고, 문서도 "Access tokens of revoked sessions remain valid until exp"라고 밝힌다 [CITED: supabase.com/docs/guides/auth/signout 등; 소스 확인: supabase/auth `UserRevokeOAuthGrant`]. GoTrue 자체 보호 엔드포인트만 `session_id`가 없으면 `session_not_found`를 낸다(`internal/api/auth.go`).
**How to avoid:** 매 호출 `auth.sessions` 생존 검사(+ 우리 `revoked_at`) — Pattern 1.
**Warning signs:** 해제 테스트가 "목록에서 사라짐"만 확인.

### Pitfall 2: Supabase scope 제약
`openid|profile|email|phone|offline_access` 외 scope는 authorize에서 거절. 기본 scope는 `email`(`default_scope`). → 우리 scope는 DB에만. Claude는 (1) 401 챌린지의 `scope`, (2) PRM `scopes_supported`, (3) 없으면 scope 생략 순으로 쓰므로 둘 다 비워 두면 `email`로 처리된다. Claude는 AS 메타데이터에 `offline_access`가 있으면 자동으로 덧붙여 refresh token을 요청 [CITED: claude.com/docs/connectors/building/authentication].

### Pitfall 3: 토큰이 Supabase 전체 API용 JWT이다
OAuth access token은 `role=authenticated`인 일반 Supabase JWT여서, Claude(또는 프롬프트 인젝션으로 조종된 Claude)가 이론상 `https://<ref>.supabase.co/rest/v1/...`에 직접 쓸 수 있고 **RLS는 "그 사용자"로 적용**되어 지갑·BYOK 메타·결제 테이블 등 사용자가 읽을 수 있는 모든 것에 닿는다. scope(`읽기`/`제안`)는 DB 레벨에서 강제되지 않는다. Supabase 문서는 `(auth.jwt() ->> 'client_id')` 기반 RLS(특히 `AS RESTRICTIVE` 정책으로 OAuth 클라이언트 차단)를 권고한다 [CITED: supabase.com/docs/guides/auth/oauth-server/token-security]. → **열린 질문 OQ-1** (아래).

### Pitfall 4: audience 미바인딩
`aud`가 항상 `authenticated`이고 `resource`는 `oauth_authorizations.resource`에 저장될 뿐 토큰에 반영되지 않는다(이슈 #2610; 토큰 교환 시 resource 불일치만 `invalid_grant`) [VERIFIED: supabase/auth 소스 `handlers.go` L356-358, issue #2610 본문]. MCP 스펙은 "intended audience 검증 MUST"([CITED: modelcontextprotocol.io/specification/2026-07-28/basic/authorization]). 완화: `client_id` 클레임 필수 + 자체 행(user, client) 필수 + 세션 소속 검사(`auth.sessions.oauth_client_id = client_id`). 이 편차를 PLAN의 위협모델에 "수용된 편차 + 보완 통제"로 명시. (Custom Access Token Hook으로 `aud`를 바꾸는 방법은 PostgREST/GoTrue의 `aud` 기대와 충돌 위험이 있어 스파이크 선택 항목으로만 둔다 [ASSUMED].)

### Pitfall 5: DCR 클라이언트 난립 + 사칭
Claude는 새 연결마다 DCR로 새 클라이언트를 등록하고 Supabase는 정리하지 않는다(이슈 #2850 설명). 사용자가 재연결할수록 같은 이름 연결이 여러 줄 생긴다. 또 `client_name`은 공격자 입력이다. → 목록은 `(client_name, redirect host, connected_at)`로 구분 표시, 옵션: 새 승인 시 동일 (이름, redirect 호스트)의 이전 연결 자동 해제.

### Pitfall 6: PRM `resource` 불일치 / 401 요건
Claude는 401이 아니면 `WWW-Authenticate`를 무시하고, `resource`가 사용자가 입력한 URL과 다르면 실패하며, `authorization_servers`의 첫 항목만 쓴다 [CITED: claude.com/docs/connectors/building/authentication]. Supabase `issuer`는 `https://<ref>.supabase.co/auth/v1`.

### Pitfall 7: 프로젝트 `/login`이 복귀 경로를 보존하지 않는다
`app/login/page.tsx`는 `redirectTo: …/auth/callback`만 쓰고 `next`를 전달하지 않는다. `app/auth/callback/route.ts`는 `next` 쿼리를 받지만 `` `${origin}${next}` `` 로 검증 없이 붙인다(`next=@evil.com`류 오픈 리다이렉트 가능성). 동의 화면은 비로그인 상태에서 `authorization_id`를 보존해 돌아와야 하므로 **로그인 복귀 경로 지원 + `next` 화이트리스트(`/`로 시작, `//` 금지, 오리진 상대 경로만)** 가 plan 3의 선행 작업이다. 로그인은 Google/Kakao 소셜 OAuth라 `redirectTo`에 `?next=` 를 실어야 한다.

### Pitfall 8: DB 장애 시 401이 "재연결 루프"를 유발
`verifyToken`이 throw하거나 undefined를 반환하면 `withMcpAuth`는 모두 401 `invalid_token`으로 응답한다. 일시적 DB 장애가 사용자에게 "연결 해제됨"으로 보일 수 있다. D-10(fail closed)은 지키되, 인프라 오류만 503(Retry-After)으로 구분할지는 스파이크에서 Claude의 401/503 반응을 보고 결정(OQ-6).

### Pitfall 9: 기타 Supabase 베타 이슈 (공개 이슈 기준)
- #2801: MFA 검증 시 사용자의 aal1 세션이 모두 삭제되어 OAuth 클라이언트 세션도 사라짐(open). NovelScript는 MFA 미사용이므로 현재 영향 낮음 — 향후 MFA 도입 시 재확인.
- #2703: 루프백 임의 포트 redirect URI 미지원(open) → **Claude Code(루프백 `localhost:<port>/callback`) 연결은 실패 가능**. claude.ai 웹/데스크톱/모바일은 고정 콜백이라 영향 없음. 이번 phase는 claude.ai 우선, Claude Code는 best-effort 문서화.
- #2408: 호스팅 프로젝트에서 authorization path 기본값 문제 보고(open) → Site URL + authorization path를 명시 설정하고 스파이크에서 리다이렉트 대상을 확인.

## Code Examples

### 동의 승인/거절 Server Action (Supabase 공식 API)
```typescript
// Source: @supabase/auth-js 타입(설치본) + supabase.com/docs/guides/auth/oauth-server/getting-started
'use server';
export async function decideAction(formData: FormData) {
  const id = String(formData.get('authorization_id'));
  const supabase = await createClient();                       // 쿠키 세션
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent('/oauth/consent?authorization_id=' + id)}`);
  if (formData.get('decision') === 'approve') {
    await assertActiveWriter(supabase, user.id);                // 서버 재검사 (D-05)
    const { data: d } = await supabase.auth.oauth.getAuthorizationDetails(id);
    if (!d || !('authorization_id' in d)) return redirect(d!.redirect_url);
    await supabase.rpc('mcp_connect', { p_client_id: d.client.id, p_client_name: d.client.name, p_scopes: ['read','propose_draft'] });
    const { data, error } = await supabase.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true });
    if (error) throw error; redirect(data.redirect_url);
  } else {
    const { data, error } = await supabase.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true });
    if (error) throw error; redirect(data.redirect_url);
  }
}
```
(`skipBrowserRedirect`는 설치본 타입에 존재 [VERIFIED].) 주의: 서버 컴포넌트/액션에서 `redirect()`는 Next 의 `next/navigation`을 사용.

### 검증 RPC 스케치 (SQL; 일회용 DB에서만 검증)
```sql
create table public.mcp_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  oauth_client_id uuid not null,              -- = JWT client_id 클레임 = auth.oauth_clients.id = consent.client.id
  client_name text not null,
  redirect_host text,                          -- 표시/구분용 스냅샷
  scopes text[] not null,                      -- {'read','propose_draft'}
  connected_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  unique (user_id, oauth_client_id)
);
alter table public.mcp_connections enable row level security;
-- SELECT: 본인 + OAuth 토큰(client_id 있음)으로는 접근 불가 (restrictive)
-- INSERT/UPDATE/DELETE 정책 없음: 쓰기는 SECURITY DEFINER 함수(mcp_connect/mcp_disconnect/mcp_authorize_call)만.

create function public.mcp_authorize_call() returns table(scopes text[], user_id uuid)
language sql security definer set search_path = '' as $$
  with me as (select auth.uid() uid, nullif(auth.jwt()->>'client_id','')::uuid cid, nullif(auth.jwt()->>'session_id','')::uuid sid)
  select c.scopes, c.user_id
  from public.mcp_connections c, me
  where c.user_id = me.uid and c.oauth_client_id = me.cid and c.revoked_at is null
    and exists (select 1 from auth.sessions s where s.id = me.sid and s.user_id = me.uid and s.oauth_client_id = me.cid)
    and exists (select 1 from public.profiles p where p.id = me.uid and p.deleted_at is null)
$$;
-- last_used_at 갱신(스로틀 ~60s)은 같은 트랜잭션의 plpgsql 버전에서 조건부 UPDATE. execute 권한: authenticated만(anon revoke).
```
컬럼/테이블 근거: `auth.oauth_consents(user_id, client_id uuid, scopes, granted_at, revoked_at; unique(user_id,client_id))`, `auth.sessions.oauth_client_id uuid` [VERIFIED: supabase/auth migrations `20250804100000`, `20250904133000`]. **`auth` 내부 스키마 의존이므로** 마이그레이션 직후 일회용 DB 테스트로 컬럼 존재를 고정하고, 의존을 피하려면 `getUser(token)` 대안(Alternatives 표)을 쓴다.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| MCP: DCR 중심 | **CIMD 권장(SHOULD) + DCR는 deprecated 폴백** | 2025-11-25 도입 → 2026-07-28 개정에서 DCR deprecated 명시 | Supabase는 DCR만 지원 → Claude는 폴백으로 DCR 사용(Claude 문서: CIMD는 AS 메타데이터에 두 값이 있을 때만) |
| 토큰 audience 느슨 | RFC 8707 `resource` MUST (클라이언트), 서버 audience 검증 MUST | 2025-06 이후 | Supabase 미지원(#2610) → 보완 통제 |
| `mcp-handler` 1.x SSE+Redis | 2.x stateless Streamable HTTP | 2.0 | Redis 불필요, `/sse` 폐기 |

**Deprecated/outdated:** `/api/mcp/[transport]` + `basePath` 방식(1.x 튜토리얼). 2.x는 `pathname`을 검사하지 않으므로 `app/mcp/route.ts` 단일 라우트로 충분. 이는 ARCHITECTURE.md의 `app/mcp/[transport]/route.ts`를 대체하는 권장이다(CONTEXT D-항목은 경로를 잠그지 않았고 "Integration Points"일 뿐) — 사용자 확인 불필요하나 플래너가 인지해야 함. URL이 `/mcp/mcp` 같은 이중 경로가 되는 것을 피한다.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Claude 커스텀 커넥터(claude.ai 웹)가 Supabase DCR(`token_endpoint_auth_method: none`, redirect `https://claude.ai/api/mcp/auth_callback`)로 등록·인증을 끝까지 완료한다 | Q3, 스파이크 | 연결 불가 → D-03에 따라 재논의 |
| A2 | 호스팅 Supabase에서 마이그레이션 함수(postgres 소유 SECURITY DEFINER)가 `auth.sessions`, `auth.jwt()`를 읽을 수 있다 | Q2 | `getUser(token)` 대안으로 전환(지연 증가) |
| A3 | Supabase 대시보드 JWT 만료 최소값이 약 5분이고 프로젝트 전체에 적용된다 | D-11 | 토큰 수명 단축 옵션이 제한적 → 즉시 차단은 RPC가 보장하므로 영향 낮음 |
| A4 | Custom Access Token Hook으로 `aud` 변경은 가능하나 PostgREST/GoTrue와 충돌할 수 있다 | Pitfall 4 | 선택 사항이라 영향 낮음 |
| A5 | 터널 도구 특성(ngrok 무료 정적 도메인·경고 interstitial, cloudflared quick tunnel URL 가변) | Q6 | 스파이크 절차 조정 |
| A6 | 공유 프로젝트가 아닌 새 클라우드 프로젝트에서 대시보드로 OAuth 서버를 켜는 것 외에 Management API로의 활성화는 확인 못함 | Q6, Q8 | 통합 테스트 사전 설정이 수동 1회 |
| A7 | Claude가 인프라 오류 503에 401과 다르게 반응한다 | Pitfall 8 | 단순 401 fail-closed로 고정 |

## Open Questions

1. **OQ-1 (사용자 결정 필요, 높음): OAuth 토큰이 Supabase REST 전체에 닿는 문제**
   - 알고 있는 것: 토큰은 일반 사용자 JWT. RLS는 사용자 단위로만 적용. scope는 DB에서 강제 안 됨.
   - 불명확: 어디까지 막을지. 선택지 (a) 이번 phase에서 `public` 전 테이블에 `client_id is null` RESTRICTIVE 정책을 일괄 추가하고 Phase 13에서 MCP가 쓸 테이블만 허용 목록으로 완화, (b) 민감 테이블(지갑·원장·BYOK·결제·mcp_connections)에만 우선 적용, (c) MCP 도구를 SECURITY DEFINER RPC 경유로만 구현.
   - 권고: (b)를 Phase 12 필수, (a)를 Phase 13 착수 전 필수 선행으로. 스파이크에서 실제로 토큰으로 `/rest/v1/wallets` 등을 쳐 현황을 증명한다.
2. **OQ-2: DCR(무마찰) vs 사전 등록 클라이언트(Claude "Advanced settings > OAuth client ID" 직접 입력).** 권고: DCR + redirect 호스트 허용목록. Supabase가 CIMD를 지원하면(이슈 #2850) 재평가.
3. **OQ-3: D-11 토큰 수명 값.** 즉시 차단은 RPC가 보장하므로 프로젝트 전역 JWT 만료를 건드릴 필요 없음(기본 3600초). 사용자에게 "공유 프로젝트 JWT 만료를 줄일지" 확인(웹 세션 갱신 빈도에 영향).
4. **OQ-4: 재연결 시 이전 동일 클라이언트 연결 자동 해제 여부**(난립 완화) — 플래너/사용자.
5. **OQ-5: `withMcpAuth` 래퍼가 인프라 오류를 401/503 중 무엇으로 줄지** — 스파이크 관찰 후.
6. **OQ-6: 스파이크 실행 주체/환경.** 이 환경은 Docker·Supabase CLI·cloudflared·ngrok 없음, Node 22.14.0만 있음. 일회용 클라우드 프로젝트 생성(사용자 계정 필요)과 Claude 커스텀 커넥터 등록(사용자 claude.ai 계정, 브라우저)은 **사람이 해야 하는 수동 게이트**다.
7. **OQ-7: 계정 탈퇴/제재 시 연결 처리.** 권고: RPC가 `profiles.deleted_at`을 검사해 차단(위 SQL). 정지(sanction) 상태의 읽기는 허용(기존 D-07 정책과 일치), 쓰기 도구(Phase 14)에서 `get_write_access` 사용.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js / npm | 전체 | ✓ | 22.14.0 / 10.9.2 | — |
| Docker | 로컬 Supabase 스택 | ✗ | — | 일회용 **클라우드** Supabase 프로젝트 |
| Supabase CLI | 로컬 스택/`config.toml` | ✗ | (npm `supabase` 2.121.0 가능, Docker 없이는 `start` 불가) | 대시보드 설정 |
| cloudflared / ngrok | 공개 터널 | ✗ | — | `winget install Cloudflare.cloudflared` 또는 ngrok 설치, 또는 Vercel Preview(Deployment Protection 해제) |
| 일회용 Supabase(`env.disposable`) | 통합 테스트 | 기존 관행 존재(프로젝트 메모리) | — | — |
| Claude 계정(커스텀 커넥터 추가 가능) | D-02 합격선 | 사용자 보유 가정 | Free 플랜은 커스텀 커넥터 1개 | — |

**Missing dependencies with no fallback:** 없음(수동 게이트로 처리).
**Missing with fallback:** Docker/CLI → 클라우드 일회용 프로젝트; 터널 → 설치 필요(`cloudflared` 권장).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.11 (unit / db 두 프로젝트) |
| Config file | `vitest.config.ts` (DB 마커 정규식으로 db 프로젝트 자동 분류, 직렬 실행) |
| Quick run command | `npx vitest run tests/mcp --project unit` |
| Full suite command | `node --env-file=env.disposable node_modules/vitest/vitest.mjs run` (일회용 DB; 공유 DB 금지) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MCP-01 | 토큰 없는 `/mcp` → 401 + `resource_metadata` 챌린지; `required:true` 고정 | unit (route 모듈에 `Request` 직접 주입) | `npx vitest run tests/mcp/route-auth.test.ts` | ❌ Wave 0 |
| MCP-01 | PRM `resource`/`authorization_servers` 형식 | unit | `npx vitest run tests/mcp/prm.test.ts` | ❌ Wave 0 |
| MCP-01 | 웹 세션 JWT(`client_id` 없음) 거절 | db | `…vitest.mjs run tests/mcp/verify-token.test.ts` | ❌ Wave 0 |
| MCP-01 | 교차 사용자: A 토큰은 A만, 타 사용자 연결 행/세션 없는 토큰 거절 | db | `…run tests/mcp/cross-user.test.ts` | ❌ Wave 0 |
| MCP-01 | 독자 전용 계정 승인 거절(서버 재검사) | db/unit | `…run tests/mcp/consent-guard.test.ts` | ❌ Wave 0 |
| MCP-08 | **해제 전 발급 토큰으로 whoami 호출 → 해제 후 거절 (토큰 exp 미경과 단언)** | db(통합) | `…run tests/mcp/revoke-blocks.test.ts` | ❌ Wave 0 |
| MCP-08 | RPC/DB 오류 시 거절(fail closed) | unit(RPC mock) + db | `npx vitest run tests/mcp/fail-closed.test.ts` | ❌ Wave 0 |
| MCP-08 | `last_used_at` 갱신(스로틀) / 목록 필드 | db | `…run tests/mcp/last-used.test.ts` | ❌ Wave 0 |
| D-02 | 실제 Claude 커스텀 커넥터 E2E | **manual-only** | 스파이크 체크리스트 | 사람 수행 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/mcp --project unit`
- **Per wave merge:** 일회용 DB로 `tests/mcp` 전체
- **Phase gate:** 전체 스위트 green + 수동 D-02 체크리스트 서명 후 `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/helpers/mcp-oauth.ts` — 프로그램 방식 OAuth 흐름(클라이언트 생성 → authorize 302 파싱 → approve → 토큰 교환) 헬퍼
- [ ] `tests/mcp/*.test.ts` 위 표의 파일들
- [ ] 일회용 프로젝트에서 OAuth 서버 활성화(수동 1회; Management API 경로는 미확인 [ASSUMED])

**해제 차단 통합 테스트 구성 (D-12):**
1. `createTestUser` ×2(A, B) + 각자 `profiles.role='writer'`. `adminClient().auth.admin.oauth.createClient({ name, redirect_uris:['http://localhost:3000/cb'], client_type:'public', token_endpoint_auth_method:'none' })`(공식 `admin.oauth.createClient` [CITED: getting-started]).
2. S256 PKCE 쌍 생성 → `GET {SUPABASE_URL}/auth/v1/oauth/authorize?client_id&response_type=code&redirect_uri&code_challenge&code_challenge_method=S256&scope=email&resource=<MCP URL>&state` 를 `redirect:'manual'`로 호출 → `Location`의 `authorization_id` 추출.
3. `signedInClient(A)`(기존 헬퍼, 매직링크 세션)로 `getAuthorizationDetails(id)` → `mcp_connect` → `approveAuthorization(id,{skipBrowserRedirect:true})` → `redirect_url`의 `code`.
4. `POST {SUPABASE_URL}/auth/v1/oauth/token` (form: `grant_type=authorization_code`, code, code_verifier, client_id, redirect_uri, `resource`) → `access_token`.
5. `verifyMcpToken(access_token)` 성공 + 도구 호출 성공, `exp - now > 60s` 단언(만료 때문이 아님을 증명).
6. 해제: 앱의 `disconnect` 로직(= `mcp_disconnect` + `revokeGrant`) 실행 → **같은 토큰으로** 다시 호출 → 거절. 추가로 (i) `revokeGrant`만 실행, (ii) `mcp_connections.revoked_at`만 설정 — 각각도 거절(이중 방어 개별 증명).
7. 교차 사용자: B로 같은 흐름 → A 토큰은 B 데이터 도달 불가(whoami는 항상 토큰 소유자); A 토큰 + B의 연결 행 조작 불가(RLS); client X 토큰 + client Y 행만 존재 → 거절.
8. 정리: `deleteTestUser`; 일회용 프로젝트라도 DCR/수동 클라이언트 삭제.
(`vitest.config.ts`가 `helpers/db`/`SUPABASE_DB_URL` 등을 import하는 파일을 자동으로 직렬 db 프로젝트에 넣는다.)

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Supabase Auth OAuth 2.1(PKCE S256 강제, 코드 1회성·10분) — 자체 구현 금지 |
| V3 Session Management | yes | `session_id` 생존 검사, 해제 시 `revokeGrant`(세션 삭제) + 자체 revoked_at |
| V4 Access Control | yes | 사용자 JWT 스코프 클라이언트 + RLS + `client_id` 클레임 필수 + 공유 소유권 술어(Pitfall 2) |
| V5 Input Validation | yes | zod(도구 inputSchema), `authorization_id`·`next` 검증 |
| V6 Cryptography | no(위임) | JWT 서명은 Supabase(가능하면 비대칭 서명 키 활성화 권장) |
| V7/V8 Error handling & Data protection | yes | 토큰·authorization code를 로그에 남기지 않음, `req.auth.token` 비영속 |
| V13 API/Web Service | yes | 401/403 규약, CORS는 PRM에만 `*` |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Redirect URI 조작/오픈 리다이렉트 | Spoofing/Tampering | Supabase는 등록된 URI 정확 일치만 허용(와일드카드 없음) [CITED]. 동의 화면에 redirect 호스트 표시 + 허용목록 경고 |
| DCR 사칭 클라이언트("Claude" 이름 도용) | Spoofing | 호스트 허용목록, 동의 필수(`allow_dynamic_registration` 켜도 모든 클라이언트 승인 필요) |
| 인증 코드 가로채기 | Info disclosure | PKCE S256(Supabase 필수), 코드 1회성 |
| Confused deputy / 서비스롤 남용 | Elevation | MCP 경로에서 `createAdminClient` 금지, 사용자 JWT 클라이언트만 |
| 토큰 오용(웹 세션·타 클라이언트 토큰) | Elevation | `client_id` 필수 + (user, client) 행 + 세션 소속 |
| Supabase REST 직접 호출 | Elevation | OQ-1: `client_id is null` RESTRICTIVE RLS |
| 동의 화면 CSRF/클릭재킹 | Tampering | Server Action(Origin 검사) + `frame-ancestors 'none'` + `authorization_id`는 로그인한 본인에게만 유효 |
| 해제 후 재사용 | Elevation | 매 호출 RPC, fail closed |
| 프롬프트 인젝션으로 본문 변조 | Tampering | 본문 직접 수정 도구 금지(D-08, Phase 14) |
| 오픈 리다이렉트(`/auth/callback?next=`) | Tampering | `next` 화이트리스트(Pitfall 7) |

## Q&A 상세 (질문별 발견)

### Q1. Supabase Auth OAuth 2.1 Server
- **상태: 베타**, 모든 플랜에서 무료, 로그인한 OAuth 사용자는 MAU에 포함 [CITED: supabase.com/docs/guides/auth/oauth-server/getting-started, 확인 2026-10-23]. 공식 OAuth 서버 개요 페이지는 GA/베타를 직접 언급하지 않으나 getting-started에는 "beta" 명시.
- **활성화:** 대시보드 Authentication > OAuth Server(Authorization Path 지정) 또는 `config.toml`:
  `[auth.oauth_server] enabled = true; authorization_url_path = "/oauth/consent"; allow_dynamic_registration = false`. 동의 URL = Site URL + path. 터널 로컬 테스트 시 `[auth] jwt_issuer`를 터널의 `/auth/v1` URL로 [CITED: getting-started].
- **Discovery:** `/.well-known/oauth-authorization-server/auth/v1`, `/auth/v1/.well-known/openid-configuration`, JWKS `/auth/v1/.well-known/jwks.json`. 엔드포인트: `/auth/v1/oauth/authorize`, `/oauth/token`(form), `/oauth/userinfo` [CITED].
- **서명 키:** 기본 HS256; `openid` scope(ID 토큰)는 RS256/ES256 필요. 이 phase는 ID 토큰 불필요 → HS256도 동작하나 `getClaims`는 HS256이면 서버 조회로 폴백 [ASSUMED: supabase-js 동작].
- **클라이언트 등록:** 대시보드/`admin.oauth.createClient`(secret key) 수동, 또는 **DCR**(`allow_dynamic_registration`; DCR 엔드포인트 소스상 `OAuthServerClientDynamicRegister`, 등록 필드는 `redirect_uris, token_endpoint_auth_method, grant_types, client_name, client_uri, logo_uri`) [VERIFIED: supabase/auth 소스]. **CIMD 미지원**(이슈 #2850, 2026-10-02 open) [VERIFIED: GitHub API].
- **동의 API(supabase-js):** `auth.oauth.getAuthorizationDetails(id)` → `{authorization_id, redirect_uri, client{id,name,uri,logo_uri}, user{id,email}, scope}` 또는 이미 동의했으면 `{redirect_url}`; `approveAuthorization(id,{skipBrowserRedirect})`, `denyAuthorization(id,{skipBrowserRedirect})` → `{redirect_url}` (deny는 `access_denied`) [VERIFIED: 설치본 타입].
- **토큰:** access = Supabase JWT, 클레임 `sub, role, aud=authenticated, user_id, email, client_id(UUID), aal, amr, session_id, iss, iat, exp`. 코드 TTL 10분(단 `oauth_authorizations` 기본 만료 3분 — 설정 `authorization_ttl` 기본 10m), access `expires_in` 기본 3600(프로젝트 JWT 만료), refresh는 회전될 수 있음, grant_type은 `authorization_code`/`refresh_token`만 [CITED: oauth-flows, token-security; VERIFIED: 소스 `client_id`는 `session.OAuthClientID` 문자열].
- **폐기/목록:** REST `GET /auth/v1/user/oauth/grants`(목록: client, scopes, granted_at), `DELETE /auth/v1/user/oauth/grants?client_id=<uuid>`(consent revoke + 세션 삭제 + 감사 로그, 204) — supabase-js에서는 **설치본 기준 `auth.oauth.listGrants()` / `revokeGrant({clientId})`**(문서 일부는 `getUserGrants`/`revokeGrant(clientId)`로 표기: 버전별 차이 → plan 시 설치 타입 확인). 별도 RFC 7009 `/oauth/revoke` 엔드포인트는 문서에 없음 [CITED/VERIFIED].
- **scope:** `openid profile email phone offline_access`만; 커스텀 scope 미지원 [VERIFIED: `models/oauth_scope.go`, 문서 "Custom scopes are not supported yet"].

### Q2. 매 호출 살아있는 grant 조회 (핵심 쟁점)
- **결론:** Supabase가 "해제 즉시 무효"를 JWT 검증 단계에서 보장하지는 않는다. 보장되는 것: `revokeGrant`가 `auth.oauth_consents.revoked_at`을 채우고 `auth.sessions`에서 해당 사용자·클라이언트 세션을 삭제한다 → refresh 불가, GoTrue 보호 엔드포인트(`/user` 등)는 `session_not_found`(403). **access JWT 자체는 `exp`까지 유효**(RS 검증만 하는 라우트·PostgREST는 통과). 따라서 **우리가 호출마다 조회**해야 한다 [VERIFIED: 소스 `UserRevokeOAuthGrant`, `auth.go` L147-155; CITED: Supabase 세션/로그아웃 문서].
- **어디서 읽나:** `auth` 스키마는 PostgREST에 노출되지 않는다. 선택지: (1) **SECURITY DEFINER RPC**(권장; 사용자 JWT로 호출, `auth.jwt()`의 `client_id`/`session_id` 사용, 서비스롤 불필요), (2) 서비스롤 + 직접 Postgres(`postgres` 패키지; Pitfall 2상 비권장), (3) `auth.getUser(token)` HTTP 호출(내부 스키마 비의존, 지연↑).
- **필요 테이블:** `public.mcp_connections` (위 SQL). 이유: scope(D-06)·last_used(D-14)·클라이언트명 스냅샷을 Supabase가 저장하지 않음. `auth.oauth_consents.scopes`는 Supabase scope 문자열이고 커스텀 값을 넣을 수 없다.
- **마지막 사용 갱신:** RPC 내부 조건부 UPDATE(`last_used_at < now() - interval '60 seconds'`일 때만) → 쓰기 증폭 방지. D-14 "매 호출 갱신"의 의미는 분 단위 정밀도로 충족(표시는 분/상대 시간) — 플래너가 확정.
- **RLS/권한:** `mcp_connections`는 RLS 켜고 SELECT만 본인 허용, 쓰기 정책 없음(함수 전용). 모든 정책에 `(auth.jwt()->>'client_id') is null` RESTRICTIVE 추가해 OAuth 토큰이 직접 읽기·수정 못 하게(OQ-1과 연동). 함수는 `revoke execute … from public, anon`, `grant execute … to authenticated`.
- **마이그레이션:** 신규 `00NN_mcp_connections.sql`; **일회용 DB에서만 검증**(D-01). 번호는 최신 0036 이후이나 저장소에 0022 중복·0028/0031 결번 관례가 있어 plan에서 확정.

### Q3. MCP 2026-07-28 개정 · Claude 실제 요청
- **스펙(2026-07-28):** AS/클라이언트는 CIMD를 SHOULD, **DCR는 deprecated(하위호환 폴백)**, 서버는 RFC 9728 PRM MUST, 클라이언트는 RFC 8707 `resource`를 authorize·token 모두에 MUST, 서버는 audience 검증 MUST, RFC 9207 `iss` 응답 파라미터 SHOULD, 토큰은 매 요청 `Authorization: Bearer`(쿼리 금지) [CITED: modelcontextprotocol.io/specification/2026-07-28/basic/authorization 및 draft security-considerations, 확인 2026-10-23].
- **Claude(claude.ai/데스크톱/모바일):** 인증 유형 `oauth_dcr`/`oauth_cimd` 기본 지원. 커스텀 커넥터 UI에서 "Claude 공개 신원(CIMD, 권장) / 자동 등록(DCR) / 직접 OAuth 클라이언트". **CIMD는 AS 메타데이터에 `client_id_metadata_document_supported:true` AND `token_endpoint_auth_methods_supported`에 `none`이 있을 때만 사용, 아니면 DCR 폴백.** 고정 콜백 `https://claude.ai/api/mcp/auth_callback`(향후 claude.com 경로로 이전 가능 → 둘 다 허용 권장). Claude Code는 루프백 임의 포트(`http://localhost:<port>/callback`, `127.0.0.1`). 공개 클라이언트(secret 없음). PKCE S256 항상. DCR/discovery/token 10초, refresh 30초 타임아웃. 401이어야 로그인 시작(200+WWW-Authenticate 무시), PRM `resource` = 사용자 입력 URL 정확 일치, `authorization_servers` 첫 항목만 사용. refresh는 401 시 또는 만료 5분 전, `invalid_grant` 에러코드 기대. 인바운드 IP 160.79.104.0/21 [CITED: claude.com/docs/connectors/building/authentication, claude.com/docs/connectors/custom/remote-mcp, 확인 2026-10-23].
- **Supabase 지원:** DCR ✓(`registration_endpoint`는 메타데이터에서 확인), CIMD ✗, RFC 8707 `resource`: authorize/token에서 형식 검증 + 코드 불일치 시 `invalid_grant`, **`aud` 미반영**, loopback 임의 포트 ✗, PKCE ✓, 공개 클라이언트(`none`) ✓. 서드파티 이슈 리포트에 "Supabase MCP 서버"가 claude.ai에서 연결 실패한 사례(2026-03~08)가 있으나 이는 Supabase 자체 MCP 서비스 기준이며 우리 구성과 동일하지 않음 — 그래도 "Claude Code는 되는데 claude.ai는 안 됨" 유형 실패 가능성을 스파이크가 직접 확인해야 한다.

### Q4. `mcp-handler` / Next.js 16 통합
- 버전 2.3.0, `next>=13` 선택 peer, Node 20+. Next 16.3.2 `node_modules/next/dist/docs/01-app`의 Route Handlers(`route.ts`, 비캐시 기본)와 Proxy(`proxy.ts`, 이전 middleware) 문서 확인. `.well-known` 경로는 Route Handler로 서빙 가능(문서의 `.well-known` 항목, 폴더명 `app/.well-known/...` 은 mcp-handler 문서가 사용) [CITED: next docs backend-for-frontend; mcp-handler AUTHORIZATION.md].
- API: `withMcpAuth(handler, verifyToken, {required, requiredScopes, resourceMetadataPath, resourceUrl})`; `verifyToken(req, bearer?) → AuthInfo | undefined`; 도구는 `ctx.http?.authInfo`로 접근. **소스 확인:** `required` 기본 false(fail-open), `verifyToken` throw → 401, 만료/ scope 검사는 `authInfo`로 수행, `req.auth` 설정 [VERIFIED: dist/index.js].
- stateless: 2026-07-28은 세션 없음, 구 스펙은 stateless 폴백(GET/DELETE 405), Redis 불필요 → Vercel 서버리스 적합.
- 경로: v2는 pathname 비검사 → `app/mcp/route.ts` 단일 라우트 권장(`[transport]` 불필요).
- **proxy.ts 충돌:** 현 matcher는 `api/payments/toss/webhook$`와 정적 확장자만 제외하므로 `/mcp`와 `/.well-known/*`에도 `getClaims()`가 돈다. bearer 요청에는 쿠키가 없어 세션 갱신이 실질 부작용을 내지는 않지만(쿠키 없으면 `getClaims`는 세션 없음 처리 [ASSUMED]) 불필요한 비용 + 응답에 Set-Cookie 가능성이 있다. **권장:** matcher에 `mcp`와 `\\.well-known/oauth-protected-resource`를 제외 추가(Next 문서: `.well-known`은 확장자 매칭에서 별도 취급). `/oauth/consent`는 **제외하지 않는다**(쿠키 세션 필요).
- Node 런타임 고정(기본값), Edge 금지.

### Q5. WorkOS AuthKit (폴백 비교만)
- 장점: CIMD·DCR 둘 다(대시보드 Connect 설정에서 활성화), 토큰 `aud` = 요청한 `resource`(Resource Indicator 설정), 호스티드 동의 UI [CITED: workos.com/docs/authkit/mcp, 확인 2026-10-23].
- 단점/불명: 별도 ID 벤더(NovelScript 사용자 ↔ WorkOS 사용자 매핑 필요), 해제/introspection 방식 문서 미확인, 동의 화면 커스텀 가능 범위 미확인, 가격 미확인. D-04(앱 내 `/oauth/consent`)·D-09(NovelScript DB grant)와 정합시키려면 어차피 우리 grant 테이블이 필요 → 스파이크 실패 시에만 재논의. **지금 채택하지 않는다.**

### Q6. 스파이크 설계
**환경:** 일회용 **클라우드** Supabase 프로젝트 1개(공유 프로젝트와 분리, 스파이크 후 삭제) + 로컬 `next dev`(포트 3100 관행) + 공개 HTTPS 터널. Docker 없음 → 로컬 `supabase start` 제외.
**터널 선택(재량):** (1순위) `cloudflared tunnel --url http://localhost:3100` (Windows `winget install Cloudflare.cloudflared`; quick tunnel은 URL이 매번 바뀌므로 실행마다 Supabase **Site URL**을 새 URL로 갱신), (2) ngrok 무료 정적 도메인(고정 Site URL, 브라우저 경고 interstitial 가능 [ASSUMED]), (3) Vercel Preview(Deployment Protection을 꺼야 Claude 서버가 접근 가능). 어떤 경우든 MCP URL·PRM `resource`·Site URL·`MCP_PUBLIC_ORIGIN` 환경값이 일치해야 한다.
**준비:** 일회용 프로젝트에 앱 마이그레이션 적용(기존 일회용 DB 관행), `mcp_connections` 마이그레이션, 대시보드: Authentication > OAuth Server 활성화, Authorization Path=`/oauth/consent`, Dynamic registration ON, Site URL=터널 URL. (가능하면 비대칭 서명 키로 전환 — 선택.) 환경변수는 `env.disposable`/스파이크 전용 `.env.local`만.
**Claude 등록 절차(사람):** claude.ai > Customize > Connectors > Add custom connector > URL=`https://<tunnel>/mcp` > OAuth client = "자동 등록(DCR)" 선택(기본/CIMD 선택은 Supabase 미지원이라 폴백 동작 관찰용으로도 1회 시도) > Add > Connect > 브라우저에서 NovelScript 로그인 → `/oauth/consent` 승인 > 대화에서 whoami 호출.

**합격 체크리스트(D-02 확장; 각 항목 증거 로그 첨부):**
- [ ] S1 `POST /mcp` 무토큰 → 401 + `WWW-Authenticate: Bearer resource_metadata="…"` (`curl -i`)
- [ ] S2 PRM: `resource` = 입력한 MCP URL 정확 일치, `authorization_servers[0]` = Supabase `/auth/v1`
- [ ] S3 AS 메타데이터: `registration_endpoint`, `code_challenge_methods_supported` ∋ `S256`, `token_endpoint_auth_methods_supported` ∋ `none`, `scopes_supported`, (CIMD 필드 없음 확인)
- [ ] S4 Claude가 DCR 등록 성공(서버 로그/`auth.oauth_clients` 행의 redirect_uris = claude.ai 콜백; **Claude가 보낸 authorize의 scope·resource 값 캡처**)
- [ ] S5 동의 화면 도달(authorization_id 수신) → 승인 → Claude "연결됨"
- [ ] S6 토큰 교환 성공; 액세스 토큰 클레임에 `client_id`·`session_id` 존재, `aud=authenticated`, `exp` 확인; refresh 발급 여부
- [ ] S7 Claude에서 whoami 호출 성공(본인 userId만)
- [ ] S8 `mcp_authorize_call`가 `auth.sessions`/`oauth_consents` 조회 성공(권한 오류 없음) — 실패 시 `getUser(token)` 대안 측정
- [ ] S9 앱에서 해제 → **같은 토큰**(`curl`로 직접 재사용) 호출 401, `exp` 미경과 확인; Claude 쪽에서도 다음 호출 실패/재인증 요구
- [ ] S10 재연결 시 새 DCR 클라이언트 생성 여부(난립) 관찰
- [ ] S11 (OQ-1 현황 증명) 같은 토큰으로 `/rest/v1/<민감 테이블>` 접근 가능 여부 기록
- [ ] S12 호출당 지연(RPC) p50/p95 측정, Claude 타임아웃(10초) 대비 여유

**불합격 → 멈추고 사용자 재논의 기준(D-03):** S4/S5/S6 중 하나라도 해결 불가(claude.ai가 DCR 흐름을 완료하지 못함), S8과 `getUser` 대안 모두 해제 즉시 차단을 만족 못 함, S9 실패. **그 외(S10–S12)는 불합격이 아닌 설계 입력.**
산출: `12-SPIKE-RESULT.md`(체크리스트 결과 + 캡처한 요청/응답 요약, 토큰 원문 금지). 스파이크 코드는 도구/UI와 섞지 않고 plan 1에서 별도 커밋(재사용 가능한 `lib/mcp/auth.ts` 초안만 이월).

### Q7. 보안 함정 요약
- redirect URI: Supabase가 정확 일치만 허용 + 우리 표시/허용목록. PKCE: S256 필수(Supabase), 클라이언트도 항상 전송. Audience: Pitfall 4 보완 통제. Confused deputy: 서비스롤 금지·단일 소유권 술어(`assertOwnsWork`류, Phase 13부터). CSRF/클릭재킹: Server Action + frame-ancestors. Fail-closed: `required:true`, catch→undefined, RPC 0행→거절. 독자 전용 거절(D-05): **동의 단계에서 `denyAuthorization`으로 가능**(API 존재 확인) — GET에서 자동 deny하지 말고 안내 + 명시적 "돌아가기" POST; approve Server Action에서도 서버 재검사. 토큰/코드 로그 금지. `iss`(RFC 9207) 응답 파라미터 지원 여부는 스파이크에서 AS 메타데이터로 확인.

### Q8. 테스트 전략
위 Validation Architecture의 "해제 차단 통합 테스트 구성" 참조. 추가: 단위 테스트는 `verifyMcpToken`에 Supabase 클라이언트 팩토리를 주입해 RPC 오류/빈 결과/예외 → `undefined` 단언(fail closed), 라우트 모듈을 직접 import해 `Request`로 401/성공 경로 검증(Next 서버 불필요). 수동 게이트(D-02)는 `12-HUMAN-UAT`로 분리.

## 권장 plan 분할 힌트
1. **12-01 스파이크 (게이트)** — 일회용 프로젝트/터널 구성, 최소 라우트(`/mcp` + PRM + 임시 동의 페이지)로 S1–S12 수행, `12-SPIKE-RESULT.md`. 합격 전에는 이후 plan 착수 금지. 불합격 시 사용자 재논의.
2. **12-02 grant 스키마 + 검증 + MCP 라우트** — `mcp_connections` + RLS(restrictive) + `mcp_connect/mcp_disconnect/mcp_authorize_call`, `lib/mcp/auth.ts`, `app/mcp/route.ts`, PRM 라우트, whoami(읽기 annotation), `proxy.ts` matcher 조정, 통합/교차 사용자/fail-closed/해제 차단 테스트(핵심). OQ-1(b) 민감 테이블 restrictive 정책 포함.
3. **12-03 동의 화면** — UI-SPEC/목업 필요(UI hint: yes → `/gsd:ui-phase`가 선행), `/login` 복귀 경로 + `next` 검증, `/oauth/consent` + Server Action, 독자 전용 거절(D-05), 보안 헤더, redirect 호스트 표시/허용목록.
4. **12-04 관리 UI** — 설정 > AI 커넥터(`app/studio/settings/mcp-connections`), 목록(클라이언트명·연결일·마지막 사용), 해제 확인 대화상자(D-15 문구), 해제 Server Action(행 revoke → `revokeGrant`), 재연결 안내. 스튜디오 설정 허브 진입 링크.
(웨이브: 1 → 2 → {3,4 병렬 가능} → 최종 수동 D-02 UAT.)

## Sources

### Primary (HIGH confidence)
- Supabase OAuth 2.1 Server getting-started — https://supabase.com/docs/guides/auth/oauth-server/getting-started (베타, config.toml, 엔드포인트, consent API, 클라이언트 등록, 확인 2026-10-23)
- Supabase OAuth flows — https://supabase.com/docs/guides/auth/oauth-server/oauth-flows (토큰 엔드포인트, scope, grants, 만료)
- Supabase Token Security & RLS — https://supabase.com/docs/guides/auth/oauth-server/token-security (JWT 클레임, `client_id` RLS)
- Supabase MCP Authentication — https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication (DCR 토글, `@supabase/server` 예제)
- `supabase/auth` 소스(master, 2026-10-23 조회): `internal/api/oauthserver/{authorize,handlers,service}.go`, `internal/models/oauth_scope.go`, `internal/api/auth.go`, migrations `20250731150234`, `20250804100000`, `20250904133000`, `internal/conf/configuration.go`
- GitHub issues `supabase/auth` #2850(CIMD), #2610(RFC 8707 aud), #2703(루프백 포트), #2801(MFA 세션 삭제), #2408(authorization path)
- 설치본 `node_modules/@supabase/auth-js` 타입(2.112.4): `AuthOAuthServerApi`
- MCP 스펙 2026-07-28 authorization / draft security-considerations — https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization , https://modelcontextprotocol.io/specification/draft/basic/authorization/security-considerations
- Claude 커넥터 인증 — https://claude.com/docs/connectors/building/authentication ; 커스텀 커넥터 추가 — https://claude.com/docs/connectors/custom/remote-mcp
- `mcp-handler@2.3.0` 패키지 소스(npm pack 직접 열람) 및 https://github.com/vercel/mcp-handler , `docs/AUTHORIZATION.md`
- Next.js 16.3.2 문서 `node_modules/next/dist/docs/01-app/` (proxy, route handlers, data-security)
- npm registry (`npm view`, 2026-10-23)

### Secondary (MEDIUM confidence)
- WorkOS AuthKit MCP — https://workos.com/docs/authkit/mcp
- Supabase CLI 시작 가이드(Windows) — https://supabase.com/docs/guides/local-development/cli/getting-started
- 웹 검색 요약: Supabase 세션/로그아웃 문서의 "revoked 세션의 access token은 exp까지 유효" 서술(직접 페이지 미열람)

### Tertiary (LOW confidence)
- Claude + Supabase MCP 연결 실패 사례 이슈(anthropics/claude-code#84609, claude-ai-mcp#212/#227) — 우리 구성과 다른 서비스 기준, 참고용

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 버전·peer·소스 직접 확인
- Supabase OAuth 동작(scope/aud/revoke): HIGH — 공식 문서 + 서버 소스
- Claude와의 실제 상호운용(DCR 완주): MEDIUM-LOW — 문서상 가능, 실물 미검증 → 스파이크
- RPC로 `auth.sessions` 조회 가능성: MEDIUM — 스키마 확인, 호스팅 권한은 스파이크 확인
- 아키텍처/pitfalls: MEDIUM-HIGH

**Research date:** 2026-10-23
**Valid until:** 2026-11-06 (Supabase OAuth 서버는 베타·이슈 다수 open, MCP 스펙·Claude 문서가 빠르게 변함 → 스파이크 직전 #2850/#2610/#2703 상태 재확인)
