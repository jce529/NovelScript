---
phase: 14-mcp-write-review
plan: 02
subsystem: mcp
tags: [mcp, write-tools, proposals, oauth, cross-user]
requirements: [MCP-05, MCP-06]
dependency_graph:
  requires: [14-01 (0041 mcp_propose_* RPCs)]
  provides:
    - withMcpWriteTool / MCP_WRITE_ANNOTATIONS / mcpRpcError (lib/mcp/tool-runtime.ts)
    - save_draft, propose_kb_document (lib/mcp/tools/proposals.ts)
    - /mcp registers 9 tools (7 read + 2 proposal)
  affects: [14-04+ review queue (reviewUrl = /studio/{workId}/review/{proposalId}), manual Claude acceptance D-P14-09]
tech_stack:
  added: []
  patterns: [write wrapper mirroring withMcpReadTool, exact-match RPC error allowlist, discriminatedUnion of strictObjects]
key_files:
  created:
    - lib/mcp/tools/proposals.ts
    - tests/mcp/tools-proposals.test.ts
    - tests/mcp/tools.proposals.cross-user.database.test.ts
  modified:
    - lib/mcp/tool-runtime.ts
    - app/mcp/route.ts
    - tests/mcp/tool-annotations.test.ts
    - tests/mcp/route-auth.test.ts
    - tests/mcp/no-admin-client.test.ts
    - tests/mcp/tools.cross-user.database.test.ts
decisions:
  - "RPC errors map by exact message match on the 5 allowlisted codes; everything else (live grant required, mcp_invalid_*, PostgREST errors) becomes the generic write failure"
  - "Write tools use their own Korean messages (scope/suspended/cap/no_change/failed); read-tool messages unchanged"
  - "reviewUrl origin resolved before the RPC: no proposal is saved if MCP_PUBLIC_ORIGIN is invalid"
  - "propose_kb_document = z.discriminatedUnion('mode', [strictObject create, strictObject edit]); SDK lists it as {type:object, oneOf:[...]}"
  - "Blank (whitespace-only) content/name rejected in the schema too, so it is an input error instead of a generic failure"
metrics:
  duration: ~35min
  completed: 2026-11-04
  tasks: 2
  files: 9
---

# Phase 14 Plan 02: MCP 제안 쓰기 도구 등록 Summary

`withMcpWriteTool`(propose_draft scope 확인, 0041 RPC 오류 5종만 한국어 문구로 매핑)과 `save_draft`·`propose_kb_document` 두 도구를 만들어 `/mcp`에 등록했다(총 9개). 두 도구는 bearer 전용 `createMcpDbClient`로 0041 RPC만 호출하고, 응답은 `{proposalId, status:'pending', expiresAt, supersededProposalId?, reviewUrl, message}`이다. 일회용 DB에서 B 토큰에 A의 ID를 넣어도 고정 not_found만 돌아오고 A 데이터·제안은 바뀌지 않음을 확인했다.

## What was built

- `lib/mcp/tool-runtime.ts`: `MCP_WRITE_ANNOTATIONS`(readOnly false, destructive false, idempotent true, openWorld false. 근거는 0041의 같은 연결·같은 내용 dedupe), `McpToolError` 코드 확장(`missing|suspended|cap|no_change|scope`), `mcpRpcError`(정확히 일치하는 메시지만 매핑, `Object.hasOwn`), `withMcpWriteTool`, `MCP_WRITE_ERROR_MESSAGES`. 읽기 래퍼는 전과 같이 `missing`만 구체 문구로 돌려준다.
- `lib/mcp/tools/proposals.ts`: strict 입력 스키마. 모든 필드에 한국어 `.describe`를 달았고 NUL·공백만 있는 값은 거부한다. 길이는 초안 1..100000, 설정 1..50000, 이름 1..100이고, category는 `KB_CATEGORIES`만 받는다. userId/ownerId/source 인자는 없다. 테이블에 직접 접근하지 않는다(`.from` 없음).
- `app/mcp/route.ts`: `registerProposalTools(server)`를 추가하고 주석을 9개 도구 기준으로 고쳤다.

## Verification

| Command | Result |
|---------|--------|
| `vitest run tests/mcp/tools-proposals.test.ts --project unit` | 55 passed |
| `vitest run tools-proposals, tool-annotations, route-auth, no-admin-client --project unit` | 4 files, 93 passed |
| `vitest run tests/mcp --project unit` (regression) | 13 files, 382 passed |
| run-db.mjs `tests/mcp/tools.proposals.cross-user.database.test.ts --project db` | 4 passed, 0 skipped |
| run-db.mjs `tests/mcp tests/proposals --project db` (regression) | 10 files, 83 passed, 0 skipped |
| `tsc --noEmit` | 기존 `LayoutProps` 1건 외 오류 없음 |
| eslint `--max-warnings=0` on changed files | clean |

DB는 일회용 `anzafn…`에서만 돌렸다. 마이그레이션은 적용하지 않았고 0040은 쓰지 않았다.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | fb183d4 | feat(14-02): add withMcpWriteTool and strict save_draft / propose_kb_document tools |
| 2 | fff8861 | feat(14-02): register proposal tools on /mcp (9 tools) with cross-user injection DB test |

## Deviations from Plan

1. **[Process] TDD RED/GREEN 분리 커밋 없음.** Task 1의 테스트와 구현을 함께 쓰고 한 번에 커밋했다(첫 실행에서 통과). 계약은 테스트 55개로 고정돼 있다.
2. **[Rule 2] 공백만 있는 content/name을 스키마에서 거부.** DB도 `mcp_invalid_content`로 거부하지만 그 경우 일반 실패 문구가 나가므로, 입력 오류 문구가 나오게 앞단에서 막았다.
3. **[Rule 2] origin을 먼저 확인.** `MCP_PUBLIC_ORIGIN`이 유효하지 않으면 RPC를 호출하지 않는다. reviewUrl 없이 제안이 저장되는 일을 막기 위해서다.
4. **[Rule 2] route-auth 테스트 보강.** fake RPC가 authorize와 제안 RPC를 구분하도록 `writeRpc`를 추가했다. 쓰기 도구에 대해 bearer 없음·철회 시 401, 읽기 전용 grant 거부, route 경유 저장과 reviewUrl(x-forwarded-host 무시), SQL 원문 비노출을 확인한다.
5. `tools.cross-user.database.test.ts`: 철회 테스트를 9개 도구 전부로 넓히고, 고정 오류 문구 샘플에 쓰기 도구 2개를 넣었다.

## Open Issues / Notes for manual acceptance (D-P14-09)

- `propose_kb_document`의 `tools/list` 스키마는 루트가 `{type:"object", oneOf:[create, edit]}`다. SDK는 이를 허용하지만, 실제 claude.ai 커넥터가 루트 `oneOf`를 제대로 다루는지는 수동 인수에서 확인해야 한다. 문제가 있으면 `mode` enum 하나에 선택 필드를 두는 평면 스키마로 바꾸는 방안을 검토한다(CONTEXT 변경이 아니라 스키마 형태만 바뀐다).
- 이 Windows 환경에서는 `python3`이 Store 스텁이라 실행되지 않고 `python`은 동작한다. `scripts/graph-link-requirements.py` 실행 시 참고(이 plan에서는 그래프 갱신 금지라 실행하지 않음).

## Known Stubs

None. `reviewUrl` 경로 `/studio/{workId}/review/{proposalId}`는 리뷰 큐 plan에서 구현한다(RESEARCH 지정 경로).

## Self-Check: PASSED
