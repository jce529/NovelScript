---
phase: 13-mcp-read-context
plan: 02
subsystem: mcp-read-tools
requirements: [MCP-02, MCP-09]
requirements-completed: []
status: implementation complete; validation blocked by pre-existing LayoutProps error
dependency_graph:
  requires: [13-01, 13-01b]
  provides: [bearer-only data client, shared read-tool runtime, registerWorkTools]
  affects: [13-03, 13-04, 13-05]
key-files:
  created:
    - lib/mcp/db-client.ts
    - lib/mcp/tool-runtime.ts
    - lib/mcp/tools/works.ts
    - tests/mcp/tools-works.test.ts
metrics:
  completed: 2026-11-03
  tasks: 2
  new_unit_tests: 58
  mcp_unit_tests: 147
  commits: 0
---

# Phase 13 Plan 02 실행 결과

Task 1·Task 2 구현 완료. 단위 테스트는 모두 통과했으나 전체 TypeScript 검사는 기존 `app/layout.tsx:23:50`의 `TS2304: Cannot find name 'LayoutProps'` 1건으로 실패했다. 해당 파일은 이번 요청의 수정 금지 범위다. 전체 검증 완료로 판정하지 않는다.

## 구현

- `db-client.ts`: 공개 anon key와 검증된 호출자 bearer 헤더만 쓰는 요청별 Supabase 클라이언트. 세션 저장·자동 갱신·URL 세션 감지를 끄고 5초 fetch 제한과 기존 취소 신호를 합친다. 쿠키 클라이언트·관리자 클라이언트·토큰 저장·로깅 없음.
- `tool-runtime.ts`: `ctx.http?.authInfo`를 `readMcpAuthExtra`로 읽어 사용자와 `read` grant를 확인한다. strict 입력을 재검증하고 인증·입력·조회 오류를 한국어 `isError:true` 응답으로 정제한다. 공통 SDK 등록 타입·결과·페이지 DTO·annotation을 export한다.
- `tools/works.ts`: `registerWorkTools(server)`만 export해 `list_works`, `list_chapters`, `get_chapter` 등록을 제공한다. 입력에 사용자 ID가 없고 UUID·정수 범위·추가 필드 거부를 적용한다. 제목과 네 annotation은 모든 도구에 설정한다. 실제 라우트 연결은 13-05에 남긴다.
- 작품 소유권과 삭제 여부를 오류 확인 가능한 쿼리로 판정하고, 본문 전에는 회차 ID와 `work_id`도 확인한다. 본문은 오직 `mcp_read_owned_chapter_content({p_chapter_id})`의 text/null 반환 계약을 사용한다. 초안·미발행·유료·잠금 상태 필터 없음.
- 타인·다른 작품 소속·삭제·미존재 ID 및 RPC null은 모두 `요청한 항목을 찾을 수 없습니다.`로 통일한다. DB 오류와 행이 함께 반환돼도 실패하며, null/비정상 목록을 빈 성공으로 바꾸지 않는다.

## DTO와 페이지 결정

- 목록: `{items, offset, limit, nextOffset}`. 기본 20, 상한 50. DB에서 한 행을 추가 조회해 다음 페이지를 판정한다. 작품은 `created_at DESC, id ASC`, 회차는 `order_index ASC, id ASC`로 안정 정렬한다.
- 작품 DTO: `id/title/synopsis/coverImageUrl/genre/createdAt`. 회차 DTO: `id/workId/title/orderIndex/isPublished/priceTier/publishedAt/updatedAt`. 본문과 내부 소유자 필드는 목록에 포함하지 않는다.
- 본문 DTO: `id/workId/title/content/offset/maxChars/totalChars/nextOffset/truncated`. 기본 20,000, 상한 50,000. offset·길이는 JavaScript UTF-16 코드 단위다. `truncated`는 반환 구간 뒤에 남은 본문이 있는지 뜻하며, 끝·빈 본문·끝 이후 offset은 `nextOffset:null`, `truncated:false`다.

## TDD 및 검증

| 실행 | 결과 |
|---|---|
| Task 1 테스트 먼저 실행 | 미구현 `db-client` import 실패(RED) |
| Task 1 클라이언트·런타임 구현 후 | 16 passed |
| Task 2 테스트 추가 후 | 미구현 도구 import 실패; 빈 등록 함수로 수집 가능하게 한 뒤 42 failed / 16 passed(RED) |
| `node node_modules/vitest/vitest.mjs run tests/mcp/tools-works.test.ts --project unit` | **58 passed, skipped 0** |
| `node node_modules/vitest/vitest.mjs run tests/mcp --project unit` | **147 passed, 8 files, skipped 0** |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | **실패: 기존 LayoutProps 오류 1건, 신규 파일 오류 0** |
| 신규 4개 파일을 root 목록에서 제외한 읽기 전용 TypeScript API 검사 | 동일한 기존 오류 1건 재현 |
| 신규 4개 파일 ESLint, `--max-warnings=0` | 통과 |

단언을 약화시키지 않았다. PostgREST 대역은 필터·정렬·range·컬럼 투영을 실제 적용해 소유권/삭제 필터가 빠지면 누출 테스트가 실패하게 구성했다. 두 사용자 방향, 모든 조회 단계의 반환 오류·오류+행·throw, 비정상 결과, 본문 경계값을 검사했다. 설치된 실제 `McpServer`에도 등록하여 SDK 계약을 확인했으며 HTTP·DB·외부 네트워크는 사용하지 않았다.

## 계획과 다른 점

1. 기존 `listWorks`/`listChapters` 호출 대신 같은 소유자·삭제 술어를 갖는 MCP 전용 DB 조회를 썼다. 기존 함수에는 DB range·ID 동률 정렬 인자가 없고, 회차 함수 내부의 소유권 검사는 DB 오류를 삼킨다. 수정 금지 파일을 변경하지 않으면서 정확한 페이지네이션과 오류 차단을 보장하기 위한 선택이다.
2. 파일 수정 범위를 지키기 위해 tsc에 `--incremental false`를 추가했다. 기존 `tsconfig.tsbuildinfo`는 변경하지 않았다.
3. 사용자 지시에 따라 라우트·마이그레이션·ROADMAP·STATE·REQUIREMENTS·SSOT·graphify 출력은 수정하지 않았다. graphify는 기존 그래프를 읽는 query만 사용했고 update·요구사항 연결 갱신은 실행하지 않았다. 커밋·푸시·브랜치 변경 없음.

## 남은 위험 및 후속

- 전체 tsc 통과는 기존 LayoutProps 생성 타입 부재 때문에 막혀 있다. 이 오류를 우회하는 선언이나 범위 밖 파일 수정은 하지 않았다.
- 실제 DB 교차 사용자·grant 폐기·RLS 통합 검증과 라우트 등록은 13-05 범위다. 런타임은 기존 `withMcpAuth`의 요청별 서명·live grant 검증 뒤에서 사용해야 한다. 단위 대역은 실제 RLS를 증명하지 않는다.
- offset 페이지네이션은 정렬 동률을 해결하지만 동시 삽입·삭제에 대한 스냅샷 일관성을 제공하지 않는다. 본문 RPC는 전체 문자열을 받은 뒤 응답 구간을 자른다.
- Git 상태에서 기존 추적 파일 변경 없음. 기존 미추적 `.agents/skills/phase-session-dispatch/`는 그대로 두었다.

Known stubs: 없음.

## 사후 보정 (Claude sonnet 교차 리뷰 반영)

- 리뷰 판정 PASS, warning 1건: `get_chapter`가 UTF-16 단위로 자르며 서로게이트 쌍(이모지)을 쪼갤 수 있었다. 시작이 쌍 중간이면 한 칸 앞으로, 끝이 쌍 중간이면 쌍 경계로 맞추고(maxChars가 쌍 하나도 못 담으면 한 칸 늘림) 응답의 `offset`은 실제 시작 위치를 돌려준다. 테스트 1개 추가(MCP 단위 148개 통과).
- `tsc`의 `app/layout.tsx` `LayoutProps` 오류는 이 plan 파일이 아니며 해결하지 않았다.
