---
phase: 13-mcp-read-context
plan: 03
subsystem: mcp-read-tools
requirements: [MCP-03, MCP-09]
requirements-completed: [MCP-03, MCP-09]
status: implementation and unit validation complete; full tsc blocked by existing LayoutProps error
dependency_graph:
  requires: [13-01, 13-02]
  provides: [registerKbTools, search_kb, get_kb_document]
  affects: [13-04, 13-05]
key-files:
  created:
    - lib/mcp/tools/kb.ts
    - tests/mcp/tools-kb.test.ts
metrics:
  completed: 2026-11-03
  tasks: 2
  new_unit_tests: 83
  mcp_unit_tests: 231
  commits: 0
---

# Phase 13 Plan 03 실행 결과

Task 1·Task 2를 순서대로 TDD로 구현했다. KB 단위 83개, 전체 MCP 단위 231개가 통과했다. 전체 TypeScript 검사는 기존 `app/layout.tsx:23:50`의 `TS2304: Cannot find name 'LayoutProps'` 1건으로 실패했고 신규 오류는 없다. 실제 DB/RLS 통합 검증과 라우트 연결은 13-05에 남는다.

## 구현 및 경계

- `registerKbTools(server)`가 `search_kb`, `get_kb_document` 두 도구의 등록만 제공한다. 라우트는 변경하지 않았다. strict object, UUID, 추가 입력 거부, 정수 범위, 제목, 네 읽기 annotation을 적용했다. 사용자 ID는 입력에서 받지 않고 `withMcpReadTool`의 검증된 AuthInfo에서만 얻는다. read grant 검사와 오류 정제도 공통 래퍼를 재사용한다.
- 두 도구 모두 작품 소유자·미삭제 여부를 오류 확인 가능한 쿼리로 먼저 검사한다. 작품 미존재와 DB 오류를 구분하며, 오류를 삼키는 `getWork`·`getWorkKbNodes`·`getAccountSharedNodes`는 보안 판단에 사용하지 않았다.
- KB 쿼리마다 owner·file·미삭제 조건과 정확한 작품 scope/work_id 또는 소유자 account_template scope를 강제한다. 타인 작품·공유 파일, 다른 작품, 삭제 파일, 폴더를 제외한다. 세계수 데이터는 다루지 않는다.
- `searchMentionNodes`를 제목 검색에 재사용한다. 좁은 조회 어댑터가 기존 helper의 20개 제한을 이름·ID로 정렬한 20행 offset 페이지로 바꾸고, null/비정상 목록을 helper가 빈 성공으로 변환하기 전에 거부한다. 사용자 지정 범위가 모든 작품 파일을 포함하므로 UI helper의 category 목록에는 `template`도 포함한다.
- 본문 검색·빈 검색은 직접 두 scope를 조회한다. DB 조회는 100행씩 끝까지 읽어 REST 기본 행 제한에 따른 누락을 피한다. 제목·본문 중복 ID를 병합한 뒤 이름·ID로 안정 정렬하고 offset/limit 페이지를 반환한다. 기본 20, 상한 50이다.
- `%`, `_`, 역슬래시는 ilike 패턴에서 이스케이프한다. 사용자 문자열을 `.or()` 문법에 결합하지 않으므로 쉼표·괄호가 필터를 확장하지 않는다. PostgREST의 `*` 별칭으로 결과가 넓어져도 제목·본문의 대소문자 무시 리터럴 부분 일치를 다시 확인한다.
- `get_kb_document`는 먼저 두 정확한 scope에서 대상 메타데이터를 검증한 후 `getMentionedNodesContent`에 ID 하나를 전달한다. 실제 본문 쿼리에도 file/live/정확한 scope를 다시 적용하고 검증된 대상 ID·scope로 고정한다. 반환 문서가 정확히 한 개이며 같은 ID인지 확인한다. 중간 삭제·폴더 전환·scope 변경·소유자 변경·작품 이동도 누출되지 않는다. `[[ ]]`는 그대로 보존한다.
- 조회 오류·throw·행과 함께 온 오류·null/비정상 목록은 정제된 실패다. 폴더·삭제·타인·다른 작품·미존재 문서는 모두 `요청한 항목을 찾을 수 없습니다.`로 응답한다. SQL·테이블명·토큰은 오류 응답에 포함하지 않는다.

## DTO 및 페이지 결정

- 검색: `{items, offset, limit, nextOffset}`. 각 항목은 `{id, name, scope, category, matchedIn, snippet}`이다. `matchedIn`은 `['title']`, `['body']`, `['title','body']` 또는 빈 질의의 `[]`이다. 제목만 일치하면 제목 snippet, 본문 일치·빈 질의에는 본문 snippet을 사용한다. snippet은 최대 240 UTF-16 단위이며 본문 일치점 앞 60단위부터 잡는다. 이모지 쌍 경계를 보존한다.
- 본문: `{id, workId, name, scope, category, content, offset, maxChars, totalChars, nextOffset, truncated}`. `workId`는 접근 문맥이며 계정 공유 파일이 해당 작품에 소속된다는 의미는 아니다.
- 본문 기본 20,000, 상한 50,000. offset/길이는 JavaScript UTF-16 코드 단위다. 시작 offset이 서로게이트 쌍 중간이면 한 칸 앞으로 이동하고 실제 offset을 반환한다. 끝은 쌍 앞 경계로 줄이며 maxChars=1로 쌍 하나도 담을 수 없으면 한 칸 늘려 온전한 쌍을 반환한다. 끝·빈 본문·끝 이후 offset은 `nextOffset:null`, `truncated:false`다. null 본문은 기존 mention helper 계약대로 빈 문서다.

## TDD 및 검증

| 실행 | 결과 |
|---|---|
| Task 1 테스트 먼저 작성 | 미구현 모듈 import 실패, 수집용 빈 등록 함수 추가 후 **36 failed** (RED) |
| Task 1 구현 | **36 passed** (GREEN) |
| Task 2 테스트 먼저 추가 | **44 failed / 36 passed** (RED) |
| Task 2 구현 | **80 passed** (GREEN) |
| 제목 template 및 `*` 별칭, 100행 이후 조회 경계 보강 | **2 failed / 81 passed** 확인 후 수정 (RED → GREEN) |
| `node node_modules/vitest/vitest.mjs run tests/mcp/tools-kb.test.ts --project unit` | **83 passed, skipped 0** |
| `node node_modules/vitest/vitest.mjs run tests/mcp --project unit` | **231 passed, 9 files, skipped 0** |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | 기존 LayoutProps 오류 **1건**, 신규 오류 **0건** |
| 신규 코드·테스트 ESLint `--max-warnings=0` | 통과 |

인메모리 PostgREST 더블은 owner/scope/file/deleted/ID 필터, SQL LIKE 이스케이프, 정렬, 범위를 실제 적용한다. 두 사용자 방향, 20개 이후 제목 전용 결과, 100행 이후 목록·본문 검색, 특수문자, 오류+행, throw, 비정상 결과, 조회 사이 상태 변경, helper ID 불일치, 이모지 경계를 검증했다. 설치된 실제 MCP SDK에도 등록하여 계약을 확인했다. 단언을 약화시키지 않았다. 네트워크 fetch는 테스트에서 거부하도록 막았다. DB 프로젝트와 공유 Supabase는 호출하지 않았다.

## 계획과 다른 점

1. `works.ts`의 `requireOwnedWork`는 export되지 않았고 해당 파일 수정이 금지되어, 동일한 오류 확인·미존재·소유자 검증을 `kb.ts` 안에 구현했다. 공통 래퍼·annotation·오류 클래스와 기존 두 mention 함수는 그대로 재사용했다.
2. 별도 `text-page.ts`는 만들지 않았다. 기존 회차 구현의 시작 경계는 실제로 뒤로 이동하지만, 이번 명시 지시인 "한 칸 앞으로"를 KB에 적용했다. 기존 `works.ts`는 수정하지 않았다.
3. tsc에는 `--incremental false`를 추가해 허용 범위 밖의 tsbuildinfo를 변경하지 않았다. PowerShell 실행 정책 때문에 npx 대신 지정된 node 진입점을 사용했다.
4. 사용자 금지 범위를 우선하여 ROADMAP·STATE·REQUIREMENTS·SSOT·graphify 출력과 요구사항 링크는 갱신하지 않았다. graphify는 기존 그래프 읽기 질의만 사용했다. 커밋·푸시·브랜치 변경·외부 AI 호출은 없었다.

## 남은 위험 및 후속

- 전체 tsc 통과는 기존 LayoutProps 생성 타입 오류 때문에 막혀 있다. 범위 밖 선언을 추가하거나 오류를 숨기지 않았다.
- 실제 bearer 토큰·라이브 grant 폐기·RLS 교차 사용자 검증과 라우트 연결은 13-05 범위다. 단위 더블은 실제 PostgREST/RLS 동작을 증명하지 않는다. 이 도구는 기존 `withMcpAuth`의 서명·live grant 검증 뒤에서 사용해야 한다.
- 검색은 두 scope의 모든 일치 행을 페이지로 읽은 후 병합·정렬한다. 대형 설정집에서는 조회 횟수·본문 전송·메모리가 증가한다. 본문 읽기도 전체 문자열을 받은 후 응답 구간을 자른다. 동시 삽입·삭제에 대한 스냅샷 일관성은 제공하지 않는다.
- mention helper의 fluent API 변경 시 좁은 어댑터도 함께 갱신해야 한다. 테스트는 실제 helper를 사용하여 현재 호출 계약을 검증한다.
- 최종 Git 확인은 git-dir/work-tree를 명시한 읽기 전용 status로 수행했다. 기존 미추적 `.agents/skills/phase-session-dispatch/`는 그대로 두었고, 이번 산출물 외 추적 파일 변경은 없다.

Known stubs: 없음.

## 사후 보정 (Claude sonnet 교차 리뷰 반영)

- 리뷰 판정 ISSUES(blocker 없음, warning 3). 범위 누출·검색어 이스케이프·존재 오라클·오류 fail closed·페이지네이션·snippet·annotation은 통과.
- 반영: (1) `get_kb_document`의 서로게이트 쌍 중간 offset 처리를 앞으로 건너뛰기에서 한 칸 뒤로(`start -= 1`) 바꿔 `get_chapter`와 같은 규칙으로 맞췄다. 테스트 기대값 갱신. (2) `search_kb`의 `query`에 `.max(200)` 상한 추가, 201자 거부 테스트 추가. MCP 단위 233개 통과.
- 보류: (3) `requireOwnedWork`가 `works.ts`와 `kb.ts`에 중복 구현돼 있다. 현재는 동등하지만 한쪽만 바뀌면 어긋날 수 있어, 두 도구를 모두 등록하는 13-05 전후에 공용 모듈로 합치는 정리를 권장한다(`works.ts` 수정이 필요해 이 plan 범위 밖).
- 추정(경미): 서버 `ilike`와 JS `toLowerCase`의 대소문자 접기 차이로 일부 유니코드 일치가 빠질 수 있다.
