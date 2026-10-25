---
phase: 12-mcp-oauth
plan: 05
subsystem: mcp-connection-settings
tags: [mcp, oauth, supabase, server-action]
requires:
  - phase: 12-mcp-oauth/12-02
    provides: mcp_connections RLS and mcp_disconnect RPC
  - phase: 12-mcp-oauth/12-03
    provides: per-call grant check that blocks revoked rows
provides:
  - Task 1 only: owner-scoped active connection listing and ordered disconnect action
affects: [12-05-task-2, 12-06]
tech-stack:
  added: []
  patterns: [browser-session client, owner-filtered RLS reads, database-first revocation]
key-files:
  created:
    - lib/mcp/connections.ts
    - app/studio/settings/mcp-connections/actions.ts
    - tests/mcp/connections.test.ts
    - .planning/phases/12-mcp-oauth/12-05-SUMMARY.md
---

# Phase 12 Plan 05: MCP 연결 관리 Task 1 Summary

세션 사용자의 활성 연결만 조회하고, 해제 시 DB grant를 먼저 폐기한 뒤 Supabase OAuth grant를 정리하는 서버 경계를 만들었다.

## Task 1 결과

- `lib/mcp/connections.ts`: 본인 `user_id`와 `revoked_at is null` 조건으로 세션 클라이언트에서 목록 조회. `lastUsedAt ?? connectedAt` 최신순 정렬. UI에는 `clientId`, `clientName`, `redirectHost`, `connectedAt`, `lastUsedAt`만 반환하며 scope·토큰·DB 내부 오류는 반환하지 않는다. 활성 본인 행 조회와 `mcp_disconnect` RPC 호출도 이 DAL에 둔다.
- `app/studio/settings/mcp-connections/actions.ts`: 매 호출마다 로그인·활성 프로필·작가 역할을 확인하고 UUID를 검증한다. 타인 ID와 이미 해제된 ID는 같은 `already_disconnected` 무변경 결과로 처리한다. 본인 활성 행에만 `mcp_disconnect`를 호출하고, 성공한 뒤에만 `auth.oauth.revokeGrant({ clientId })`를 호출한다. 후단 실패는 행을 복구하지 않고 `partial`과 정제된 안내를 반환한다. DB 해제 후 페이지를 재검증한다.
- `tests/mcp/connections.test.ts`: 목록 정렬·revoked 제외·재연결 중복 제거, DB → OAuth 호출 순서, 후단 실패 시 DB 해제 유지, 비로그인·독자·잘못된 UUID 거절, 타인 ID·재실행 무변경, DB 실패 시 후단 호출 금지를 검증한다.

## Task 2 연동 시그니처

- `listMcpConnections(supabase: SupabaseClient, userId: string): Promise<ListMcpConnectionsResult>` — 세션에서 얻은 사용자 ID와 `createClient()` 결과를 전달한다. 성공은 `{ ok: true, connections: McpConnection[] }`, 실패는 `{ ok: false, connections: [] }`. `McpConnection`은 `clientId`, `clientName`, `redirectHost`, `connectedAt`, `lastUsedAt`만 가진다.
- `disconnectMcpConnectionAction(clientId: string): Promise<DisconnectMcpConnectionResult>` — `clientId`는 목록의 OAuth client UUID. 결과는 `{ ok, status, message }`; status는 `disconnected`, `already_disconnected`, `partial`, `unauthorized`, `forbidden`, `invalid`, `error`. `partial`은 `ok: false`이지만 우리 행 해제는 완료된 상태이므로 카드가 다시 표시되지 않도록 목록을 갱신해야 한다.

## 검증

- `npx vitest run tests/mcp/connections.test.ts --project unit`: 이 Windows sandbox에서는 Vite의 `net use` 및 기본 fork worker가 `spawn EPERM`으로 시작하지 못했다. 같은 대상 파일을 Node 진입점에서 `net use` 조회만 우회하고 `--pool=threads`로 실행해 **1 파일, 9 테스트 통과**했다. 원래 명령 자체는 통과하지 못한 것으로 기록한다.
- `npx tsc --noEmit`: 이번 세 파일 오류 없음. 기존 `app/layout.tsx(23,50): Cannot find name 'LayoutProps'`만 보고됨.
- 지정한 두 파일의 ESLint: 오류·경고 0건.
- `rg -n 'mcp_disconnect|revokeGrant' app/studio/settings/mcp-connections/actions.ts lib/mcp/connections.ts`: RPC와 후속 OAuth 정리 경계 확인.
- `rg -n 'createAdminClient' app/studio/settings/mcp-connections lib/mcp`: 0건.
- `git diff --check`: 공백 오류 없음. 병렬 12-04 파일은 수정하지 않았다.

## 편차

- 사용자가 `graphify-out/` 수정을 명시적으로 금지했으므로 AGENTS.md의 코드 변경 후 `graphify update .` 및 요구사항 링크 스크립트는 실행하지 않았다.
- 커밋·STATE/ROADMAP 갱신은 이번 실행 범위에서 금지되어 수행하지 않았다.

## Task 2

### 만든 파일과 변경

- `app/studio/settings/mcp-connections/page.tsx`: 작가 세션과 활성 계정을 확인하고, 독자 계정은 `/studio`로 이동시킨 뒤 소유자 연결 목록과 완성된 MCP 주소만 클라이언트 UI에 전달한다.
- `app/studio/settings/mcp-connections/ConnectionCards.tsx`: 빈 상태, 목록 `<ul>/<li>`, 날짜 `<dl>/<dt>/<dd>`, KST 날짜, 주소 복사 상태/실패, 접근 가능한 해제 확인 Dialog와 성공·실패 상태를 구현했다.
- `app/studio/settings/ai-providers/page.tsx`: 기존 구조를 보존하고 페이지 하단 보조 링크로 `AI 커넥터 관리` 진입 링크를 추가했다. 분리된 설정 화면을 위한 UI-SPEC Open Items 2의 권장 위치다.

### 계약 준수와 편차

- UI-SPEC Interaction 8~12를 따랐다: 취소 초기 포커스와 트리거 최종 포커스, 복사 2초 상태, 복사/목록/해제 실패 alert, 해제 성공 status 포커스, 모바일 전폭 버튼과 긴 텍스트 줄바꿈을 적용했다.
- `partial` 해제 결과는 DB 차단이 이미 완료된 상태이므로 Task 1의 결과 계약에 따라 카드를 제거해 다시 표시되지 않게 했다. 일반 실패는 Dialog를 열어 둔 채 카드를 유지한다.
- 주소 원본이 없으면 입력칸을 비우고 복사 버튼을 비활성화한다. 새 안내 문구는 추가하지 않았다.

### 검증 요약

- `npx tsc --noEmit`: 내 파일 오류가 없는지 확인했다. 병렬 12-04 파일 및 기존 `app/layout.tsx` 오류는 범위 밖으로 처리했다.
- 필수 카피·접근성 구조·`createAdminClient` 부재 검색과 `git diff --check`, `git status`를 실행했다.

### 12-06 수동 검증 인계

- 데스크톱/375px 시각 상태, 키보드/Esc, Dialog 포커스 이동·복귀, 클립보드 허용/거부, 실제 연결 해제 성공·실패·부분 성공 상태를 브라우저에서 확인한다.

## 검증 후 수정 (2026-10-25, sonnet 검증 WARNING 6건 중 5건)
- 해제가 두 번째 이후여도 포커스가 상태 영역으로 가도록 `successTick` 카운터를 effect 의존성으로 쓰고 Dialog `finalFocus`를 성공 시 상태 영역으로 지정했다.
- 복사 성공 문구 `복사했어요`는 버튼 라벨에만 보이고 별도 status 요소는 `sr-only`로 바꿨다(중복 표시 제거).
- `아직 사용 안 함` 배지를 `dl` 안 `dt`(sr-only, 마지막 사용)와 `dd` 쌍으로 넣어 구조를 유효하게 했다.
- ai-providers 진입 링크 색을 `text-primary`에서 `text-muted-foreground`로 바꿨다(accent 예약 규칙).
- 커넥터 주소는 12-03의 `getMcpPublicOrigin`(https 또는 루프백 http, 순수 origin만 허용)을 재사용해 검증한다. 값이 유효하지 않으면 입력칸을 비우고 복사 버튼을 비활성으로 둔다(새 문구 없음).
- 이 수정은 Codex gpt-5.6-terra가 수행하다 **ChatGPT 사용 한도 초과**로 SUMMARY 기록 직전에 멈췄다. 코드 변경은 모두 적용된 것을 확인했고 SUMMARY는 오케스트레이터가 마저 적었다.

### 수정하지 않고 12-06으로 넘기는 항목
- `actions.ts`는 소유 확인에서 `missing`이면 `revokeGrant`를 호출하지 않는다. DB 해제는 됐지만 `revokeGrant`가 실패한 `partial` 이후 카드가 사라지면 Supabase 쪽 잔존 grant를 다시 정리할 수 없다(접근은 12-01 S9 근거로 차단되므로 보안 영향은 낮음, 정리 재시도 경로는 후속 검토).
- `partial`이면 UI가 성공 경로로 카드를 제거하고 성공 문구를 보여 준다(위 partial 안내문은 UI에 노출되지 않음).
- 포커스 이동(첫 해제·마지막 카드·두 번째 이후 해제), 모바일, 키보드 실화면 확인.
