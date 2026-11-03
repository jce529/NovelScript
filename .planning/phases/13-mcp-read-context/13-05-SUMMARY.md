---
phase: 13-mcp-read-context
plan: 05
subsystem: mcp
tags: [mcp, oauth, rls, annotations, cross-user, revoke]
status: partial  # Task 1·2 완료, Task 3(Claude 커넥터 수동 인수) pending
requirements: [MCP-02, MCP-03, MCP-04, MCP-09]
requirements_status: 자동 검증 PASS, 완료 선언 안 함 (성공 기준 4 pending)
dependency_graph:
  requires: [13-01, 13-01b, 13-02, 13-03, 13-04, 12-06]
  provides:
    - /mcp 라우트의 7개 읽기 도구 등록 (whoami + 여섯 도구)
    - 여섯 도구 두 사용자 실DB 격리·해제 회귀 스위트
    - 등록 annotation·strict schema·no-admin 정적 계약
  affects: [Phase 14 propose_draft 등록(같은 라우트), 12-06 Task 2 Claude 연결 인수]
tech-stack:
  added: []
  patterns:
    - 라우트 모듈을 createMcpHandler 기록기로 mock해 실제 등록 목록을 검증
    - 고유 표식 문자열을 A 데이터에 심고 B 응답 원문 전체에서 부재를 단언
key-files:
  created:
    - lib/mcp/owned-work.ts
    - tests/mcp/tool-annotations.test.ts
    - tests/mcp/no-admin-client.test.ts
    - tests/mcp/tools.cross-user.database.test.ts
  modified:
    - app/mcp/route.ts
    - lib/mcp/tools/works.ts
    - lib/mcp/tools/kb.ts
    - tests/helpers/mcp-oauth.ts
    - tests/mcp/route-auth.test.ts
    - .planning/phases/13-mcp-read-context/13-VALIDATION.md
decisions:
  - requireOwnedWork는 lib/mcp/owned-work.ts 한 곳으로 합치고 zod literal 검증(kb.ts 쪽 구현)을 채택했다. works.ts의 수동 비교와 도구 경계에서 같은 결과(일반 실패 문구)를 낸다.
  - writing-context.ts의 작품 조회는 title·genre까지 읽는 다른 쿼리라 합치지 않았다(동작 변경 방지).
  - whoami annotation은 MCP_READ_ANNOTATIONS 상수로 바꿨다(값 동일).
  - B 토큰으로 A 작품 ID를 준 검색(search_kb)은 작품 소유 확인에서 "미존재"로 끝난다. "검색의 빈 결과"는 B 자기 작품에서 A 본문 문자열을 검색하는 경우로 검증했다.
metrics:
  completed: 2026-11-03
  tasks_done: 2
  tasks_pending: 1
---

# Phase 13 Plan 05: 읽기 도구 등록과 두 사용자 격리 검증 Summary

`/mcp` 라우트에 여섯 읽기 도구(whoami 포함 7개)를 Phase 12 인증 경로 그대로 등록했다. 정적 계약(annotation·strict schema·admin client 금지)과 일회용 DB의 두 사용자 OAuth 격리·해제 회귀 테스트가 모두 통과했다. 실제 Claude 커넥터 인수(Task 3)는 pending이다.

## 완료 / 보류

| 항목 | 상태 |
|---|---|
| 사전 단계: requireOwnedWork 통합 | 완료 |
| Task 1: 도구 등록과 정적 계약 | 완료 (자동 검증 PASS) |
| Task 2: 두 사용자 실DB 공격과 Nyquist 매핑 | 완료 (자동 검증 PASS) |
| Task 3: Claude 커넥터 무확인 읽기 인수 | **pending**: Phase 12 `12-06` Task 2(실제 Claude 연결)가 아직 pending |
| 성공 기준 4 (실제 Claude에서 확인 없이 읽기 호출) | **pending** |
| MCP-02/03/04/09 완료 선언 | 하지 않음 (MCP-09의 실제 무확인 동작이 남음) |

커밋은 하지 않았다(오케스트레이터 지시). 커밋 해시는 없다.

## 사전 단계: requireOwnedWork 통합

- 새 파일 `lib/mcp/owned-work.ts`에 `requireOwnedWork(db, userId, workId)`를 두고 `works.ts`·`kb.ts`가 import한다. 같은 쿼리(`id`·`owner_id`·`deleted_at is null`)를 쓰고, DB 오류는 그대로 던지며 행이 없으면 `McpToolError('missing')`, 결과 불일치는 zod 오류를 던진다.
- 두 원래 구현의 차이는 마지막 불일치 검사 방식뿐이었다(works는 `new Error`, kb는 zod parse). 둘 다 `McpToolError`가 아니므로 런타임이 같은 일반 실패 문구로 바꾼다. 따라서 도구 경계의 동작과 오류 문구는 그대로다.
- 기존 단위 테스트(`tools-works` 59, `tools-kb` 85, `writing-context` 69)는 수정하지 않았고 모두 통과했다.
- `writing-context.ts`는 같은 쿼리로 title·genre까지 읽어 번들에 쓰므로 합치지 않았다.

## Task 1: 도구 등록과 정적 계약

- Next.js 16.3.2 `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`를 확인했다. Route Handler는 `GET`/`POST` 같은 이름 있는 내보내기와 `Request` 인자 방식 그대로이고, 이번 변경에 필요한 라우트 구조 변경(세그먼트 설정, 캐시 옵션 등)은 **없다**. 기존 `export { handle as GET, handle as POST }`를 유지했다.
- 선행 게이트: 등록 전에 `read-boundary.database.test.ts`(13-01 경계와 13-01b RPC 감사)를 일회용 DB에서 단독 실행했고 16/16, skipped 0이었다.
- `app/mcp/route.ts`: 기존 `createMcpHandler` 콜백 안에서 `registerWorkTools`(list_works, list_chapters, get_chapter), `registerKbTools`(search_kb, get_kb_document), `registerWritingContextTools`(get_writing_context)를 호출한다. whoami, `withMcpAuth(required:true, verifyMcpToken)`, PRM 경로, origin 503 처리는 그대로다.
- `tests/mcp/route-auth.test.ts`: whoami 단일 도구를 가정한 테스트를 7개 도구 목록 검증(네 annotation 정확값, `additionalProperties:false`)으로 바꿨다. 두 테스트를 추가했다. (1) 토큰이 없거나 grant RPC가 0행이면 여섯 도구 모두 401이고 DB 조회가 0회다. (2) 가짜 PostgREST가 SQL 오류(메시지·code·details·hint)를 돌려줘도 응답에 원문이 나오지 않는다. 가짜 supabase 클라이언트에 체이닝 가능한 `from()`을 추가했다.
- `tests/mcp/tool-annotations.test.ts`: 실제 라우트 모듈을 import하되 `createMcpHandler`만 기록기로 바꿔, 라우트가 등록하는 7개 도구 각각이 한 번씩 등록되는지, 네 annotation이 정확히 `(true,false,true,false)`인지, title·description·handler가 있는지, 입력 schema가 유효 인자는 받고 `userId`·`ownerId` 추가 키는 거부하는지 확인한다.
- `tests/mcp/no-admin-client.test.ts`: `lib/mcp/**`·`app/mcp/**`의 모든 소스(8개 파일)를 읽어 `createAdminClient`, `SUPABASE_SERVICE_ROLE_KEY`, `service_role`, `supabase/admin` import 문자열이 없는지 확인한다. 금지 문자열은 실행 시 조립한다. 그래서 이 파일 자체는 `vitest.config.ts`의 DB_MARKER에 걸리지 않고 unit project에 남는다.

## Task 2: 두 사용자 실DB

- `tests/helpers/mcp-oauth.ts`: `callTool(accessToken, name, args)`를 추가했다. 반환값은 status, isError, challenge, raw, text, data, jsonRpcError다. `callWhoami`는 같은 시그니처와 반환형을 유지한 채 `callTool` 위에 다시 만들었다. 기존 호출부(`cross-user`, `revoke-blocks`, `grants`)는 수정 없이 통과했다.
- `tests/mcp/tools.cross-user.database.test.ts` (12 tests, `SUPABASE_DB_URL` 참조로 db project에 분류, 시작 시 `assertDisposableRef()`):
  - 픽스처는 superuser 직접 연결로 넣는다. A 작품, A의 초안·유료(price_tier 30)·공개 회차, A 작품 폴더+파일, A 계정 공유 폴더+파일, A 작품 지시가 있고, B도 같은 구성이다. A의 모든 텍스트에는 무작위 고유 표식을 넣었다.
  - 양성 확인: A 토큰으로 A의 모든 자료가 읽히고, B 토큰으로 B 자기 자료가 읽힌다. 이 확인이 있어야 아래 음성 결과가 의미를 가진다.
  - B 토큰에 A의 ID를 주입한 결과는 다음과 같다. whoami는 B로 고정된다. list_works는 B 행만 반환한다(페이지 3종). list_chapters는 미존재다. get_chapter는 A 작품 ID와 B 작품 ID 양쪽으로 초안·유료·공개 회차를 요청해도 모두 미존재다. search_kb는 A 작품이면 미존재이고, B 작품에서 A 표식으로 검색하면 `items: []`이며, 전체 목록을 끝까지 넘겨도 A 노드가 없다. get_kb_document는 A 작품·공유·폴더 노드 모두 미존재다. get_writing_context는 A 작품이나 A 회차 조합이면 미존재다.
  - 미존재 응답은 고정 문구 "요청한 항목을 찾을 수 없습니다."와 정확히 같고, A의 ID를 되돌려주지 않는다. 모든 응답 원문에서 A 표식과 SQL/PostgREST 오류 조각이 나오지 않는다.
  - 혼합 번들: `[B공유, A작품, B작품, A공유, A폴더]`를 요청하면 includedDocuments는 `[B공유, B작품]`, missingNodeIds는 `[A작품, A공유, A폴더]`이고, systemInstruction·userContext에 A 표식이 없다.
  - 해제: grant 해제 전에 발급한 B 토큰은 해제 후 7개 도구 모두에서 401과 Bearer challenge를 받고, 본문에 B 데이터가 없다. 다른 client의 B 토큰은 계속 동작한다.
  - 계정 정리는 기존 방식대로 한다. 회차·노드(파일 → 폴더)·작품·지시를 SQL로 지운 뒤 `cleanupMcpOAuth`를 호출한다.
- grant 조회 장애의 fail closed는 13-01 오류 주입 단위 테스트(`grant-fail-closed.test.ts` 12/12)를 인용한다. 실DB 재현은 하지 않았다.
- `13-VALIDATION.md`의 MCP-02/03/04/09 표와 실행 결과 표를 실제 수치로 갱신했다. Task 3은 pending으로 적었다.

## 검증 결과

| 명령 | 결과 |
|---|---|
| `tests/mcp --project db` (일회용 DB, `.env.disposable` + 프로세스 환경에만 일회용 ref·`MCP_PUBLIC_ORIGIN`) | 6 files, **50/50 passed, failed 0, skipped 0** (기존 38 + 신규 12). 두 번 연속 실행, 모두 통과 |
| `tests/mcp tests/ai --project unit` | 79 files, **1247/1247 passed**, skipped 0 |
| `tsc --noEmit` | `app/layout.tsx(23,50) LayoutProps` 1건만 남음 (기존 오류) |

공유 Supabase 프로젝트에는 아무 명령도 실행하지 않았다. 마이그레이션은 만들지 않았다.

## Deviations from Plan

### Auto-fixed / 추가 사항

1. **[지시된 사전 단계] requireOwnedWork 중복 제거.** 오케스트레이터 지시에 따라 `lib/mcp/owned-work.ts`를 새로 만들었고 `works.ts`·`kb.ts`를 수정했다(계획의 files_modified 밖이지만 허용됨).
2. **[Rule 2] route-auth에 SQL 오류 미노출 테스트 추가.** 계획 action의 "도구 예외가 원본 SQL 메시지를 밖으로 내보내지 않는지 확인"을 라우트 수준 단위 테스트와 DB 스위트 양쪽에 단언으로 넣었다.
3. **whoami annotation을 상수로 바꿈.** 값은 같고, 등록 테스트가 같은 기대값으로 검증한다.

그 밖에는 계획대로 했다.

## Known Stubs

없음.

## Deferred / Pending

- Task 3: 실제 Claude 커넥터에서 여섯 읽기 도구를 호출할 때 확인 프롬프트가 뜨지 않는지, 해제 후 다음 호출이 거부되는지 사람이 확인해야 한다. 이 검증은 12-06 Task 2 연결이 성공한 뒤에 한다. 결과는 `13-VALIDATION.md`의 "실제 Claude 커넥터" 행에 PASS/FAIL과 관찰로 남긴다.

## Self-Check: PASSED

- 신규 파일: `lib/mcp/owned-work.ts`, `tests/mcp/tool-annotations.test.ts`, `tests/mcp/no-admin-client.test.ts`, `tests/mcp/tools.cross-user.database.test.ts`가 모두 있다.
- 커밋은 지시에 따라 만들지 않았으므로 확인할 해시가 없다.

## 사후 확인 (Codex gpt-6-sol 교차 리뷰 + 오케스트레이터 재검증)

- 작성자가 Claude(opus)라 검증은 반대 계열 Codex `gpt-6-sol`(high, 읽기 전용 지시)로 했다. 판정 ISSUES(blocker 없음, warning 3). 7개 도구 등록·인증 경로 유지·requireOwnedWork 통합 동등성·교차 사용자 테스트 설계·annotation 테스트·callTool 일반화는 통과.
- 반영: (1) `no-admin-client.test.ts`가 금지 문자열만 보던 것을 보강했다. `next/headers`, `@/lib/supabase/server|client` 문자열과 상대·동적·require import 정규식을 추가하고 정규식 자체의 양성·음성 테스트를 넣었다(11/11). (2) `13-VALIDATION.md`가 `tsc` 기존 오류 1건을 PASS로 적은 것을 "신규 오류 없음(통과 아님)"으로 고쳤다.
- 비해당: (3) `.agents/skills/phase-session-dispatch/`는 이번 작업과 무관하게 이전부터 있던 미추적 폴더이며 커밋 범위에서 제외한다.
- 오케스트레이터가 직접 재실행: 일회용 DB `tests/mcp --project db` 6개 파일 50개 통과, 단위 `tests/mcp tests/ai` 1248개 통과, `tsc`는 `app/layout.tsx` 기존 오류 외 없음.
- 미완료: Task 3(실제 Claude 커넥터 무확인 호출·해제 후 거부)과 성공 기준 4는 Phase 12의 12-06 Task 2 수동 인수가 끝나야 한다. Phase 13 요구사항은 완료로 표시하지 않는다.
