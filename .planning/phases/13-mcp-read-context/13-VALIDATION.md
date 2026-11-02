# Phase 13 — Nyquist 검증 초안

`workflow.nyquist_validation=true` (`.planning/config.json`). 이 문서는 계획 시점 초안이며 아래 실행 결과는 아직 없다. 13-05에서 실제 명령 결과와 Claude 인수 관찰만 갱신한다.

일회용 DB 검증은 프로젝트 루트 `.env.disposable`이 있을 때만 한다. 파일이 없으면 즉시 중단하고 사용자에게 보고한다. 실행 전 API·DB URL의 프로젝트 ref 일치와 공유 프로젝트 ref와의 차이를 확인한다. 모든 DB 명령은 실제 실행 테스트 수 0 초과, skipped 0이 필수다. 공유 Supabase 프로젝트에서는 실행하지 않는다.

| 요구사항 | 자동 검증 명령 | 일회용 DB 검증 명령 | 상태 |
|---|---|---|---|
| MCP-02 | `npx vitest run tests/mcp/tools-works.test.ts --project unit` | `node --env-file=.env.disposable node_modules/vitest/vitest.mjs run tests/mcp/read-boundary.database.test.ts tests/mcp/tools.cross-user.database.test.ts --project db` | 미실행 |
| MCP-03 | `npx vitest run tests/mcp/tools-kb.test.ts --project unit` | `node --env-file=.env.disposable node_modules/vitest/vitest.mjs run tests/mcp/tools.cross-user.database.test.ts --project db` | 미실행 |
| MCP-04 | `npx vitest run tests/mcp/writing-context.test.ts tests/ai/prompt.test.ts --project unit` | `node --env-file=.env.disposable node_modules/vitest/vitest.mjs run tests/mcp/tools.cross-user.database.test.ts --project db` | 미실행 |
| MCP-09 | `npx vitest run tests/mcp/tool-annotations.test.ts tests/mcp/route-auth.test.ts --project unit` | `node --env-file=.env.disposable node_modules/vitest/vitest.mjs run tests/mcp/tools.cross-user.database.test.ts --project db` | 미실행 |

공통 정적 확인: `npx tsc --noEmit`, `npx vitest run tests/mcp/no-admin-client.test.ts --project unit`. D-17 카탈로그·RPC 감사 게이트: 13-01 및 13-01b의 일회용 DB 테스트 결과를 기록한다. grant 조회 장애의 fail closed는 13-01의 오류 주입 단위 테스트로 확인하며 실DB 장애 재현은 요구하지 않는다.

Claude 커넥터 인수: Phase 12의 실제 연결 성공 후 여섯 읽기 도구의 추가 확인 프롬프트 유무와 grant 해제 후 다음 호출 거부를 관찰한다. 현재 pending이며 관찰 전 성공 기준 4는 완료로 표시하지 않는다.

## 실행 결과

| 항목 | 결과 | 근거 |
|---|---|---|
| 자동·DB 테스트 | 미실행 | 13-05에서 갱신 |
| 실제 Claude 커넥터 | pending | Phase 12 연결 인수 후 갱신 |
