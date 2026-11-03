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

### D-17 선행 경계 (13-01, MCP-02/03/04 공통 전제)

MCP-02(작품·회차), MCP-03(설정집), MCP-04(번들의 작품 시스템 지시)는 모두 `0039_mcp_read_boundary.sql`의 네 테이블(works, chapters, kb_nodes, work_ai_instructions) live grant 소유자 SELECT와 소유자 전용 본문 RPC `mcp_read_owned_chapter_content(uuid)`에 기대므로, 위 표의 도구 테스트 전에 아래 게이트가 통과해야 한다. 마이그레이션은 0037 → 0038 → 0039 순서로 일회용 DB에만 적용한다.

| 요구사항 | 게이트 내용 | 명령 | 기준 |
|---|---|---|---|
| MCP-02 | works·chapters: OAuth는 live grant의 자기 행만 SELECT, DML 거부, 타인 공개 작품·회차 0행, 해제·revokeGrant·grant 없음 즉시 0행, 본문 RPC가 초안·유료·무료·블라인드 자기 회차만 반환하고 타인·삭제·미존재는 null, 브라우저·anon은 RPC 거부 | `node --env-file=.env.disposable node_modules/vitest/vitest.mjs run tests/mcp/read-boundary.database.test.ts --project db` | 실행 수 > 0, skipped 0 |
| MCP-03 | kb_nodes: 작품 범위 + 계정 공유(`account_template`) 자기 노드만 SELECT, 타인 노드 0행, DML 거부 | 같은 명령 | 실행 수 > 0, skipped 0 |
| MCP-04 | work_ai_instructions: 자기 작품 지시만 SELECT, DML 거부. 나머지 36개 public 테이블은 OAuth 전면 차단(카탈로그 40개 대조) | 같은 명령 | 실행 수 > 0, skipped 0 |
| MCP-02/03/04 | grant 조회 함수 실패(DB 오류·권한·네트워크·타임아웃) 주입 시 인증 거부, 허용 캐시 없음 | `npx vitest run tests/mcp/grant-fail-closed.test.ts --project unit` | 실행 수 > 0, skipped 0 |
| 회귀 | Phase 12 해제·교차 사용자·민감 RLS·grant 스위트가 0039 적용 뒤에도 통과 | `node --env-file=.env.disposable node_modules/vitest/vitest.mjs run tests/mcp --project db` | 실행 수 > 0, skipped 0 |

일회용 DB 파일 규약: `.env.disposable`은 커밋하지 않고 내용을 출력하지 않는다. 키 존재는 `node scripts/check-env.mjs .env.disposable`로만 본다. DB 스위트는 `MCP_DISPOSABLE_PROJECT_REF`가 API·DB URL ref와 같고 공유 ref(`ymudwg…`)가 아니어야 실행된다(`tests/helpers/disposable-ref.ts`). 파일에 이 키가 없으면 실행 프로세스 환경에만 일회용 ref를 넣는다. 13-01 실행 기록은 `13-01-SUMMARY.md`에 있으며, 아래 실행 결과 표는 13-05에서 갱신한다.

Claude 커넥터 인수: Phase 12의 실제 연결 성공 후 여섯 읽기 도구의 추가 확인 프롬프트 유무와 grant 해제 후 다음 호출 거부를 관찰한다. 현재 pending이며 관찰 전 성공 기준 4는 완료로 표시하지 않는다.

## 실행 결과

| 항목 | 결과 | 근거 |
|---|---|---|
| 자동·DB 테스트 | 미실행 | 13-05에서 갱신 |
| 실제 Claude 커넥터 | pending | Phase 12 연결 인수 후 갱신 |
