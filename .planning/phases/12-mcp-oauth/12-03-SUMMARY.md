---
phase: 12-mcp-oauth
plan: 03
subsystem: mcp-auth
tags: [mcp, oauth, supabase, rfc9728, mcp-handler, nextjs-route-handler, proxy]
requires:
  - phase: 12-mcp-oauth/12-01
    provides: 스파이크 합격과 설계 입력(resourceUrl 구분, x-forwarded 불신, required:true)
  - phase: 12-mcp-oauth/12-02
    provides: mcp_connections, mcp_connect/mcp_disconnect, mcp_authorize_call (out_user_id/out_scopes)
provides:
  - 사용자 bearer 검증 + 매 호출 live grant RPC (lib/mcp/auth.ts)
  - required:true MCP 라우트와 whoami 도구 1개 (app/mcp/route.ts)
  - RFC 9728 PRM (app/.well-known/oauth-protected-resource/mcp/route.ts)
  - proxy matcher에서 /mcp, PRM 제외
  - 해제 차단·교차 사용자 실DB 회귀 테스트 2개 + OAuth 흐름 헬퍼 (12-06에서 실행)
affects: [12-04, 12-05, 12-06, phase-13, phase-14]
tech-stack:
  added: [mcp-handler@2.3.0, "@modelcontextprotocol/server@2.3.1"]
  patterns: [fail-closed verifier with injectable user client, per-request env read, explicit public origin]
key-files:
  created:
    - lib/mcp/auth.ts
    - app/mcp/route.ts
    - app/.well-known/oauth-protected-resource/mcp/route.ts
    - tests/mcp/fail-closed.test.ts
    - tests/mcp/route-auth.test.ts
    - tests/mcp/prm.test.ts
    - tests/helpers/mcp-oauth.ts
    - tests/mcp/revoke-blocks.database.test.ts
    - tests/mcp/cross-user.database.test.ts
  modified:
    - package.json
    - package-lock.json
    - proxy.ts
key-decisions:
  - MCP_PUBLIC_ORIGIN이 없거나 https(루프백 http 제외) 순수 origin이 아니면 /mcp와 PRM은 503으로 거절한다(헤더 기반 origin 추정 금지).
  - verifyMcpToken은 RPC 전에 iss=Supabase /auth/v1, role=authenticated, sub/client_id/session_id UUID, exp>now를 직접 확인하고, RPC 결과는 정확히 1행·out_user_id=sub·scope 부분집합일 때만 통과시킨다.
  - Supabase 호출(getClaims의 JWKS/getUser, RPC)에 5초 fetch 타임아웃을 걸어 지연도 fail closed로 끝낸다.
  - whoami 입력 스키마는 z.strictObject({})이며 반환은 {userId}뿐이다.
requirements: [MCP-01, MCP-08]
requirements-completed: [] # 실DB·Claude 수동 게이트(12-06) 전에는 완료로 판정하지 않음
duration: 약 65분
completed: 2026-10-25
---

# Phase 12 Plan 03: MCP bearer 인증·PRM·whoami Summary

**Supabase OAuth bearer를 사용자 권한 클라이언트로 getClaims 검증한 뒤 같은 bearer로 `mcp_authorize_call()`을 매 호출 요청하고, 어떤 오류든 401로 끝내는 `withMcpAuth(required:true)` 라우트, RFC 9728 PRM, 읽기 전용 whoami 1개를 만들었다.** 실DB 회귀 테스트는 작성만 했고 12-06에서 실행한다.

## Task별 결과

1. **Task 1 — bearer 인증과 fail-closed 경계** (`lib/mcp/auth.ts`, `tests/mcp/fail-closed.test.ts`, 패키지 설치)
   - `createMcpTokenVerifier(options)`가 검증기를 만들고, `verifyMcpToken`은 요청마다 env를 읽는 운영용 인스턴스다. 사용자 클라이언트는 anon key + `Authorization: Bearer <사용자 토큰>`으로 만들며 서비스롤은 쓰지 않는다.
   - 거절 사유 코드: `config_missing`, `bearer_missing`(없음·8192자 초과), `claims_invalid`(getClaims 오류, iss/role/UUID/exp 불일치), `web_session_token`(client_id 없음), `rpc_error`, `grant_missing`(0행), `grant_mismatch`(타 사용자 행·2행 이상·잘못된 scope), `exception`. 운영에서는 인프라 사유(`rpc_error`/`exception`/`config_missing`)만 사유 코드로 `console.warn`하고 토큰·클레임 값은 남기지 않는다.
   - `AuthInfo.scopes`와 `extra.grantScopes`에 grant의 `read`/`propose_draft`를 담아 Phase 13·14의 도구별 판정에 쓰도록 남겼다. withMcpAuth의 scope 옵션은 쓰지 않는다.
   - 단위 테스트 20건: 정상, 무토큰/과대 토큰, getClaims 오류, 웹 세션 토큰, session_id·client_id·sub·iss·exp·role 이상, RPC 0행/null/오류/예외, 팩토리 예외, 타 사용자 행·2행·잘못된 scope·옛 컬럼명(`user_id`/`scopes`) 행, 거절 사유에 토큰 미포함, 설정 누락, `MCP_PUBLIC_ORIGIN` 형식 검증.
2. **Task 2 — PRM·라우트·whoami·proxy** (`app/mcp/route.ts`, PRM 라우트, `proxy.ts`, `tests/mcp/route-auth.test.ts`, `tests/mcp/prm.test.ts`)
   - `/mcp`: `withMcpAuth(handler, verifyMcpToken, { required: true, resourceMetadataPath: '/.well-known/oauth-protected-resource/mcp', resourceUrl: <origin> })`, GET/POST 내보냄. origin 설정이 잘못되면 503.
   - 도구는 `whoami` 1개(`readOnlyHint:true`, `destructiveHint:false`, `idempotentHint:true`, `openWorldHint:false`)이고, 인증 컨텍스트의 `extra.userId`만 `{userId}`로 반환한다.
   - PRM: `protectedResourceHandler({ authServerUrls: [<supabase>/auth/v1], resourceUrl: <origin>/mcp })` + `OPTIONS` CORS. `scopes_supported`는 없다.
   - `proxy.ts` matcher 부정 전방탐색에 `mcp(?:/|$)`와 `\\.well-known/oauth-protected-resource(?:/|$)`를 더했다. Next 16.3.2 설치 문서(`proxy.md` Matcher, Unit testing)를 확인했고, 문서가 말하는 `unstable_doesProxyMatch`는 이 설치본에 없어 같은 모듈의 `unstable_doesMiddlewareMatch`로 테스트했다.
   - 단위 테스트 18건(route-auth 13 + prm 5): 무토큰 POST/GET 401과 `resource_metadata` 전체 URL 단언, `scope=` 없음, x-forwarded-*/Forwarded 무시, Basic 헤더 거절, 웹 세션 토큰 거절(RPC 미호출), RPC 0행·오류 401, bearer와 anon key로 클라이언트 생성·`mcp_authorize_call` 인수 없이 호출, tools/list에 whoami 1개·입력 속성 0개, whoami가 소유자 ID만 반환, 인수로 타 사용자 ID 주입 불가, origin 미설정 503. PRM의 resource/issuer, 헤더 무시, 끝 슬래시 정규화, CORS, 설정 누락 503. matcher의 /mcp·PRM 제외, `/oauth/consent`·`/mcpx`·`/studio/settings/mcp-connections` 포함, 기존 toss webhook·정적 파일 제외 유지.
   - 변형 검사: `required:false` + PRM형 resourceUrl로 바꾸면 route-auth 5건이 실패하는 것을 확인한 뒤 원복했다.
3. **Task 3 — 실DB 회귀 테스트 작성(미실행)** (`tests/helpers/mcp-oauth.ts`, 두 `*.database.test.ts`)
   - 헬퍼: AS 메타데이터 탐색 → DCR → `/authorize`(PKCE S256, state, resource) → 동의(브라우저 세션으로 `getAuthorizationDetails` → `mcp_connect` → `approveAuthorization(skipBrowserRedirect)`) → `/token` 교환. 발급 토큰의 sub/client_id/session_id를 확인한다. `callWhoami`는 실제 `app/mcp/route.ts`의 POST를 호출한다. 오류 메시지에는 HTTP 상태만 남긴다.
   - `revoke-blocks.database.test.ts`: 변형 A(`mcp_disconnect`만, Supabase 동의가 살아있음을 `listGrants`로 확인), 변형 B(`revokeGrant`만, 우리 행 `revoked_at` null 확인), 변형 C(둘 다, 재호출도 401), DB 장애(`mcp_authorize_call` EXECUTE 회수 → 401 → 복구 후 같은 토큰 200). 모든 변형에서 해제 전 200과 해제 후 같은 토큰 401, 그리고 exp가 아직 남아 있음을 단언한다.
   - `cross-user.database.test.ts`: A(X·Y 클라이언트)·B(Z) 토큰 각각 본인만 반환, B 토큰 + 인수 A ID, A 토큰으로 B 연결 행 REST 조회, B 토큰으로 A의 `mcp_connections`/`wallets` REST 조회, A 브라우저의 연결 목록 범위, A의 B 연결 해제 시도(무효), grant 없는 클라이언트 W 토큰 거절(Y grant 활성 상태), B가 A의 클라이언트 X로 승인받은 토큰 거절, X 해제 시 X만 차단.
   - 두 파일 모두 `SUPABASE_DB_URL` 마커(db 프로젝트로 분류 확인)와 인라인 가드를 둔다. 가드는 일회용 ref와 API·DB URL이 일치하는지 보고, 공유 프로젝트 ref 접두어(`ymudwg`)면 바로 실패시킨다. env가 없으면 skip한다(12-06 합격 조건은 skipped 0).

## 지킨 스파이크 입력

1. withMcpAuth `resourceUrl`=origin, PRM `resourceUrl`=origin+`/mcp`. 401 `resource_metadata` 전체 URL과 PRM `resource`를 각각 단언했다.
2. `required: true`. 무토큰 요청이 Supabase 호출·도구 실행 전에 401로 끝나는 것을 단언했다.
3. RPC 반환 `out_user_id`/`out_scopes`만 인정한다. 0행·오류·예외는 모두 거절하고, 옛 컬럼명 행도 거절한다.
4. x-forwarded-*를 쓰지 않는다. origin은 `MCP_PUBLIC_ORIGIN`에서만 오고, 없으면 503이다(헤더 주입 테스트 포함).
5. proxy matcher는 정확히 `/mcp`와 `/.well-known/oauth-protected-resource/mcp`(끝 슬래시 선택)만 제외하고 `/oauth/consent`는 계속 포함한다. 하위 경로(`/mcp/x`)와 유사 경로(`/mcpx`, `/mcp-foo`, `…-evil`)는 쿠키 proxy 대상으로 남는다. 기존 제외 항목도 유지하며 단위 테스트로 확인했다. (Codex 검증 WARNING으로 처음 구현의 `(?:/|$)` 하위 경로 제외를 오케스트레이터가 좁혔다.)
6. whoami 1개, `readOnlyHint:true`, `destructiveHint:false`. 사용자 ID는 요청 파라미터로 받지 않는다(`z.strictObject({})`).
7. 사용자 bearer 클라이언트로 getClaims를 부른 뒤 같은 bearer로 `rpc('mcp_authorize_call')`을 부른다. MCP 코드에 `createAdminClient`/서비스롤 사용은 없다.

## 패키지 감사

- 명령: `npm install --save-exact mcp-handler@2.3.0 @modelcontextprotocol/server@2.3.1 --ignore-scripts` (작업 트리에 node_modules가 없어 전체 설치도 함께 일어났다).
- 설치 전 `npm view`: mcp-handler 저장소 `github.com/vercel-labs/mcp-handler`, deps `chalk ^5.3.0`, `commander ^11.1.0`, peer `next >=13`, `@modelcontextprotocol/server ^2.0.0`. @modelcontextprotocol/server 저장소 `github.com/modelcontextprotocol/typescript-sdk`, deps `zod ^4.2.0`, `@modelcontextprotocol/core 2.3.1`. 둘 다 `preinstall`/`install`/`postinstall` 스크립트가 없다(core도 동일).
- `package.json`: 의존성 2줄만 추가했다(정확 버전, `^` 없음).
- `package-lock.json`: +78/-0. 추가 항목은 `node_modules/@modelcontextprotocol/core@2.3.1`, `@modelcontextprotocol/server@2.3.1`, `mcp-handler@2.3.0`, `mcp-handler/node_modules/chalk@5.6.2`, `mcp-handler/node_modules/commander@11.1.0`와 루트 의존성 2줄이다. 삭제·버전 변경은 없고 `hasInstallScript`는 0건이다. resolved는 모두 registry.npmjs.org다.
- `npm audit`: 기존 취약점 19건(next, vite, shadcn 경유 `@modelcontextprotocol/sdk` 등)은 이번 신규 패키지 5개와 관계없다. 신규 패키지에 해당하는 항목은 없다.

## 편차

- **[Rule 2 — 보안] 명시적 클레임 검사 추가:** 계획은 "client_id·session_id 존재와 issuer·만료 검사"였다. 여기에 `role=authenticated`, sub/client_id/session_id UUID 형식, RPC 행의 `out_user_id === sub`, 정확히 1행, scope 부분집합 검사를 더했다. 서명만 유효한 비정상 토큰이나 RPC 이상 응답을 통과시키지 않기 위해서다.
- **[Rule 2 — 가용성/fail closed] Supabase 호출 5초 타임아웃:** 응답이 없는 JWKS/RPC 호출에 요청이 매달리지 않도록 사용자 클라이언트의 fetch에 `AbortSignal.timeout`을 걸었다. 시간 초과는 `exception`으로 거절된다.
- **[Rule 2 — 보안] origin 미설정 시 503:** 계획에는 없던 처리다. `MCP_PUBLIC_ORIGIN`이 없으면 mcp-handler가 x-forwarded-*로 origin을 추정하므로(입력 4 위반) 라우트·PRM 모두 503으로 막았다. **배포 환경에 `MCP_PUBLIC_ORIGIN`(예: `https://<앱 도메인>`) 설정이 필요하다.**
- **matcher 테스트 API:** Next 문서의 `unstable_doesProxyMatch`가 16.3.2 설치본 export에 없어 `unstable_doesMiddlewareMatch`를 썼다(같은 `next/experimental/testing/server`).
- **matcher 테스트 위치:** 허용 파일 안에서 처리하려고 `tests/mcp/route-auth.test.ts`에 넣었다.
- 사용자 지시에 따라 커밋, STATE/ROADMAP/REQUIREMENTS 갱신, graphify 갱신은 하지 않았다(오케스트레이터 담당). 허용 목록 밖의 신규 파일은 만들지 않았다.

## 실행한 검증

- `npx vitest run tests/mcp/fail-closed.test.ts tests/mcp/route-auth.test.ts tests/mcp/prm.test.ts --project unit` → Test Files 3 passed, Tests 38 passed.
- `npx vitest run tests/mcp --project unit` → 3 files / 38 passed. `vitest list`에서 두 신규 DB 파일은 `[db]` 프로젝트로 분류되고 unit에는 0건이다.
- `npx tsc --noEmit` → 기존 `app/layout.tsx(23,50) TS2304 LayoutProps` 1건만 남고 신규 오류는 없다.
- `npx eslint --max-warnings=0 lib/mcp app/mcp app/.well-known proxy.ts tests/mcp tests/helpers/mcp-oauth.ts` → exit 0.
- `rg -n 'createAdminClient|requiredScopes' lib/mcp app/mcp app/.well-known` → 0건(`app/oauth`, `app/studio/settings/mcp-connections`는 아직 없다). `rg 'required: true|readOnlyHint|whoami' app/mcp/route.ts` → 세 항목 모두 있고 `registerTool`은 1회다. `rg 'mcp_authorize_call' lib/mcp/auth.ts` → 매 호출 경로(`authorizeCall`)에 있다.
- `git diff --check` → 통과. 신규 파일의 줄끝 공백도 별도로 검사해 통과했다. `git status`에는 허용 파일만 나온다.
- 참고(범위 밖): 전체 `vitest --project unit`은 2557 passed / 5 failed다. 실패는 `tests/ai/provider-fixture.test.ts`(2), `tests/migrations/numbering.test.ts`(기존 0022 중복), `tests/world-tree/schema-source.test.ts`(2, phase 18 마이그레이션 내용)이고, 모두 이번 변경 파일을 import하거나 검사하지 않는다. 그래서 고치지 않았다.
- DB 연결, psql/supabase CLI, DB 테스트 실행, .env 파일 읽기는 하지 않았다.

## 12-06 실DB·수동 게이트로 넘길 항목

- 일회용 프로젝트에 0037/0038을 적용한 뒤 `revoke-blocks`·`cross-user` DB suite를 실행해 실패 0·skipped 0을 확인한다. 필요한 env는 `MCP_DISPOSABLE_PROJECT_REF`, `SUPABASE_DB_URL`, `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, (선택) `MCP_PUBLIC_ORIGIN`이다.
- 헬퍼 가정 실측: AS 메타데이터 경로, DCR에 apikey 헤더가 필요한지, `/authorize`가 consent 경로로 302하며 `authorization_id`를 넘기는지, `/token`에 `resource` 파라미터를 받는지, 테스트 작가 프로필 갱신(`role`·`pen_name`)이 성공하는지.
- DB 장애 변형은 `mcp_authorize_call` EXECUTE 권한을 커밋으로 잠깐 회수했다가 finally에서 복구한다. 일회용 DB에서만 실행하고, 실행 뒤 권한이 복구됐는지 확인한다.
- 실제 Claude 커넥터로 `/mcp` 401 → PRM → 동의 → whoami 호출과, 해제 후 같은 토큰 차단을 확인한다. 배포 origin을 `MCP_PUBLIC_ORIGIN`으로 설정한다.
- refresh token 발급·갱신(12-01 S6 이월), `last_used_at` 60초 스로틀(12-02)도 이 게이트에서 함께 본다.

## Known Stubs

없음. whoami는 실제 인증 컨텍스트에 연결돼 있다.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: new-endpoint | app/mcp/route.ts | 쿠키 proxy 밖의 공개 bearer 엔드포인트. 매 호출 live grant RPC와 required:true로 보호하며 위협모델 범위 안이다. |
| threat_flag: new-endpoint | app/.well-known/oauth-protected-resource/mcp/route.ts | CORS `*` 공개 메타데이터. 비밀 정보는 없다(resource, issuer만 노출). |

## Self-Check: PASSED

- 신규 9개 파일과 수정 3개 파일이 존재하고 `git status`가 허용 목록과 일치함을 확인했다.
- 커밋은 지시에 따라 만들지 않았으므로 커밋 해시 검증 항목은 없다.
