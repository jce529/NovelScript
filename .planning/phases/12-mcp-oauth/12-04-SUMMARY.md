---
phase: 12-mcp-oauth
plan: 04
subsystem: oauth-consent
tags: [mcp, oauth, consent, nextjs, login-return]
requires:
  - phase: 12-mcp-oauth/12-02
    provides: mcp_connect, mcp_disconnect, grant schema
  - phase: 12-mcp-oauth/12-03
    provides: bearer call verifier and /oauth/consent proxy coverage
provides:
  - validated social-login return path
  - server-rendered consent states and guarded approve/deny actions
  - route-specific anti-framing headers
affects: [12-06, phase-13, phase-14]
key-files:
  created:
    - lib/auth/redirect.ts
    - app/oauth/consent/page.tsx
    - app/oauth/consent/actions.ts
    - app/oauth/consent/ConsentForm.tsx
    - tests/mcp/login-return.test.ts
    - tests/mcp/consent-guard.test.ts
    - .planning/phases/12-mcp-oauth/12-04-SUMMARY.md
  modified:
    - app/login/page.tsx
    - app/auth/callback/route.ts
    - next.config.ts
requirements: [MCP-01]
requirements-completed: [] # 실 OAuth/브라우저 검증은 12-06
completed: 2026-10-25
---

# Phase 12 Plan 04: 로그인 복귀와 MCP 동의 화면

## Task별 결과

1. **Task 1 — 로그인 복귀:** `/login`이 검증된 `next`를 Google/Kakao `redirectTo`의 callback 쿼리로 전달한다. callback은 같은 `safeReturnPath`로 다시 검증한다. `/`로 시작하는 내부 경로만 허용하고 `//`, 역슬래시, `@`, 제어문자, 외부 절대 URL, 반복 인코딩 우회를 `/`로 보낸다. `next` 없는 기존 소셜 로그인과 이메일 보완/탈퇴 분기를 유지했다. 단위 테스트는 정상 복귀, 경계값, callback 실제 리다이렉트를 확인한다.
2. **Task 2 — 동의:** `/oauth/consent`는 ID 조회 → 비로그인 → 탈퇴/비활성 → 독자 → 호스트 → 정상 순서로 서버에서 판정한다. GET은 승인·거부를 호출하지 않는다. 클라이언트명은 React 텍스트로 60자까지, 두 줄 말줄임으로 표시하고 호스트를 함께 표시한다. 승인 액션은 ID, 사용자, 프로필, 작가 역할, 정확한 호스트를 재검사한 다음 사용자 세션 RPC `mcp_connect`에 `read`/`propose_draft`를 기록한다. 반환된 이전 client ID마다 `revokeGrant`를 호출하고, 실패해도 새 승인을 계속한다. Supabase 승인 실패 또는 반환 호스트 이상 시 `mcp_disconnect`/`revokeGrant`로 보상을 시도한다. 거부는 POST Server Action에서만 실행한다. `/oauth/consent`에만 `frame-ancestors 'none'`과 `X-Frame-Options: DENY`를 설정했다.

## 지킨 지시 항목

- **1, 7:** 승인된 Copywriting Contract A, Interaction 1~7과 카드/모바일 레이아웃을 구현했다. h1/실패 알림 포커스, DOM 거부→승인, 모바일 `flex-col-reverse sm:flex-row`, 중복 제출 잠금과 두 버튼 비활성화를 포함한다.
- **2, 3, 4:** RSC 판정 순서, POST 전용 deny, 승인 시 재검사·RPC·이전 grant 해제·승인 리다이렉트, 정확한 4개 호스트 허용목록을 적용했다.
- **5, 6:** 안전한 로그인 복귀와 라우트별 클릭재킹 헤더를 구현했다.
- **8, 9:** MCP bearer 인증은 이 화면에 넣지 않았고 `proxy.ts`는 그대로 두었다. OIDC 설명 문구는 화면에 추가하지 않았다.

## 편차와 이유

- UI-SPEC Interaction 2의 `조회 실패 → 비로그인` 판정 순서를 `비로그인 → 조회`로 바꿨다. `@supabase/auth-js/src/GoTrueClient.ts`의 `_getAuthorizationDetails`(약 6148~6165줄)는 세션이 없으면 `AuthSessionMissingError`를 반환하므로, 조회를 먼저 하면 비로그인 방문자가 로그인 복귀 경로에 도달하지 못한다.
- 비로그인 상태에서는 연결 요청을 조회할 수 없어 클라이언트명과 출처를 표시하지 못한다. UI-SPEC Copywriting의 `{클라이언트명}` 문구 대신 중립 문구를 사용하며, UI-SPEC 갱신은 사용자 확인을 기다린다.
- 승인 API가 실패하거나 예상하지 않은 호스트를 반환하면 이미 작성된 연결 행과 동의를 가능한 범위에서 해제한다. 승인 실패가 유효한 연결로 남지 않도록 한 보상 처리다.
- Supabase가 이미 동의한 요청에 `redirect_url`만 반환하면 ID/클라이언트 상세가 없으므로 작가에게만 허용 호스트 URL로 이동한다. 독자에게는 활성화 안내를 보여 주되 이 경우 `denyAuthorization`에 필요한 상세가 없어 홈 링크를 제공한다.
- 사용자 지시에 따라 커밋, ROADMAP/STATE/REQUIREMENTS/docs 및 graphify-out 갱신을 하지 않았다. AGENTS.md의 `graphify update .`는 허용 파일 밖을 쓰므로 실행하지 않았다.

## 검증

- 지정 `npx vitest run tests/mcp/consent-guard.test.ts tests/mcp/login-return.test.ts --project unit`: 이 Windows 제한 환경에서 Vite의 `net use` 및 Vitest fork 생성이 `spawn EPERM`으로 실패했다. `net use` 탐지만 우회하고 `--pool threads`로 **같은 두 파일·unit 프로젝트**를 실행해 **2파일, 29테스트 통과**를 확인했다. 테스트 실행에 네트워크를 사용하지 않았다.
- `npx tsc --noEmit`: 기존 `app/layout.tsx:23 TS2304 Cannot find name 'LayoutProps'` 1건만 출력. 12-04 파일 오류 없음.
- 수정 파일만 지정한 `npx eslint`: 오류 없음.
- 필수 카피 `rg`, 클릭재킹 헤더 `rg`: 모두 일치. `rg -n 'createAdminClient' app/oauth lib/mcp`: 0건.
- `git diff --check`: 통과. 신규 파일은 추적 전이라 이 명령 범위 밖이며 ESLint와 단위 테스트로 확인했다. `git status --short`의 12-05 SUMMARY/설정·연결 파일은 병렬 작업자의 변경으로 건드리지 않았다.

## Open Items / 12-06 수동 게이트

- 이미 동의된 요청은 GET 렌더 중 허용 호스트로 즉시 redirect된다. 이때 `mcp_connect` 행과 어긋나는지 12-06에서 확인한다.
- Claude는 OIDC scope `openid profile email phone offline_access`를 요청한다. 승인 UI 계약의 두 범위 항목은 유지했으며 OIDC scope 설명 문구 추가 여부는 후속 UI 계약 결정으로 남긴다.
- 실제 Supabase OAuth 서버, DCR, 재동의, 같은 클라이언트 재연결과 이전 grant 해제, 승인 실패 보상, 독자/탈퇴 세션, Claude 복귀를 일회용 환경에서 검증한다.
- 375px 모바일 버튼 순서/전폭, 키보드 DOM 포커스 순서, h1 및 실패 알림 포커스, 시각 카피/레이아웃, 클릭재킹 헤더 실제 응답을 12-06에서 확인한다.
