---
phase: 13-mcp-read-context
plan: 04
subsystem: mcp-writing-context
requirements: [MCP-04, MCP-09]
requirements-completed: [MCP-04, MCP-09]
status: implementation and unit validation complete; full tsc blocked by existing LayoutProps error
dependency_graph:
  requires: [13-01, 13-02, 13-03]
  provides: [registerWritingContextTools, get_writing_context, optional app response protocol]
  affects: [13-05]
key-files:
  modified:
    - lib/ai/prompt.ts
  created:
    - lib/mcp/tools/writing-context.ts
    - tests/mcp/writing-context.test.ts
    - tests/ai/prompt.test.ts
metrics:
  completed: 2026-11-03
  tasks: 1
  new_unit_tests: 87
  writing_context_unit_tests: 69
  prompt_unit_tests: 18
  ai_unit_tests: 929
  mcp_unit_tests: 302
  commits: 0
---

# Phase 13 Plan 04 실행 결과

TDD로 구현 완료. 신규 단위 테스트 87개와 전체 AI 929개·MCP 302개가 통과했다(두 전체 스위트 합계 1,231개, 대상 87개는 이 합계에 포함). 전체 TypeScript 검사는 기존 `app/layout.tsx:23:50`의 `TS2304: Cannot find name 'LayoutProps'` 1건으로 실패했고 신규 오류는 없다. 실제 DB/RLS 검증과 라우트 연결은 수행하지 않았다.

## 구현

- `prompt.ts`: 두 조립 함수에 `includeAppResponseProtocol?: boolean`을 추가했다. 기본은 `true`이며 기존 호출부와 문자열 상수는 변경하지 않았다. `false`는 시스템 끝의 응답 프로토콜과 사용자 컨텍스트 끝의 형식 지시만 제외한다. 작가가 입력한 태그·문서 본문·회차 본문은 그대로 보존한다.
- `writing-context.ts`: `registerWritingContextTools`만 export하고 `get_writing_context` 등록을 제공한다. title과 공통 네 읽기 annotation을 설정했다. `withMcpReadTool`이 인증·read grant·strict 입력 검증·bearer DB 생성·오류 정제를 담당한다. 실제 라우트는 수정하지 않았다.
- 필수 입력은 UUID `workId/chapterId`와 최대 20개 UUID `nodeIds`다. 빈 목록을 허용하고 요청 순서대로 중복을 제거한다. 프리셋·문체는 `PRESET_INSTRUCTIONS/STYLE_PRESETS`의 키만 허용한다. 사용자 ID·시스템 지시 덮어쓰기·장르 덮어쓰기 등 추가 필드는 거부한다.
- 작품의 소유자·미삭제 조건을 먼저 검사하고, 회차의 같은 작품 소속·미삭제 조건을 검사한다. 전체 회차 본문은 `mcp_read_owned_chapter_content`로만 읽는다. 출판·가격·블라인드 상태 필터는 없다. 미존재·타인·다른 작품·삭제 회차와 RPC null은 같은 missing 오류다. 빈 문자열 본문은 정상이다.
- `getWorkSystemInstruction`을 같은 bearer 클라이언트로 호출한다. beginner에서도 조회 실패를 삼키지 않는다. 저장 행 부재/빈 값은 기존 helper 계약대로 추가 지시 없음이다. beginner의 작품 지시 제외와 freeform에서만 customInstruction 적용은 앱 조립 함수를 따른다. customInstruction은 앱의 4,000 UTF-16 단위 상한을 재사용한다.
- 문서를 읽기 전에 owner + 정확한 scope + work_id(작품 범위) + file + 미삭제 조건으로 메타데이터를 검증한다. 작품 파일과 같은 소유자의 account_template 파일을 허용하고, 실패한 ID는 이유 구분 없이 `manifest.missingNodeIds`에 모은다.
- 검증된 ID만 `getMentionedNodesContent`에 전달한다. 좁은 bearer 조회 어댑터가 실제 본문 쿼리에도 owner/file/미삭제와 검증 당시 ID·scope를 강제한다. null/비정상 목록과 조회 오류는 helper의 빈 성공 처리 전에 차단한다. 메타데이터 조회 뒤 삭제·이동·폴더 변환·소유자 변경으로 사라진 문서도 missing 목록으로 돌아간다.
- `composeSystemInstruction`과 `assembleUserContent`를 직접 호출한다. `chatHistory: []`, `precedingText`는 전체 회차 본문이다. 문서 순서는 요청 순서로 복원하며 `[[ ]]`와 이모지를 보존한다. 문서·회차 본문은 `userContext`에만 존재한다.

## 반환 및 결정

- 반환은 `{systemInstruction, userContext, manifest}`다. manifest는 `work`, `chapter`, `includedDocuments`, `missingNodeIds`, `settings`, `totalChars`를 갖는다. 문서 메타데이터에는 ID·이름·카테고리·scope만 들어간다.
- settings의 프리셋·문체·장르·customInstruction·프로토콜은 `{value, source}`다. source는 `arg/default/stored`다. 기본 프리셋은 `intermediate`, 문체는 `DEFAULT_STYLE_PRESET`, DB 장르가 null이면 `GENRES[0]`다. 명시적으로 기본과 같은 값을 전달해도 source는 arg다.
- 작품 지시는 `{value, applied, source:'stored'}`로 기록한다. value는 실제 적용된 공백 제거 문자열이며 beginner/빈 지시이면 null이다. 무시된 customInstruction은 `{value:null, source:'default'}`다. instruction 원문을 바꾸는 인자는 제공하지 않는다.
- 번들의 프로토콜 기본은 계획대로 `false`다. `true`이면 3개 프리셋 × 4개 문체 전체에서 같은 입력의 앱 조립 함수 기본 호출과 문자 단위로 일치한다.
- 100,000 UTF-16 단위 제한은 **manifest와 JSON 이스케이프를 포함한 전체 직렬화 번들**에 적용했다. `totalChars` 자체의 자릿수도 포함해 고정점으로 계산한다. 99,999/100,000 경계에서 두 고정점이 가능하므로 한도에서 계산을 시작한다. 정확히 100,000은 허용하고 초과하면 절단 없이 명시적 오류다.
- 공통 런타임은 사용자 정의 예외를 missing만 허용하므로, 크기 초과는 데이터 없는 내부 마커를 공통 런타임으로 반환한 뒤 정확히 그 마커만 고정 한국어 `isError:true`로 변환한다. 문구는 `집필 컨텍스트가 100,000자 한도를 초과했습니다. 선택한 문서를 줄여주세요.`다. 인증·입력·DB·파싱 예외는 기존 런타임의 정제 경로를 그대로 통과한다. 런타임 파일은 변경하지 않았다.

## TDD 및 검증

| 실행 | 결과 |
|---|---|
| prompt.ts 수정 전 기존 앱 출력 전체 인라인 스냅샷 생성 | 3 passed, 3 snapshots written |
| 프로토콜 옵션 테스트 추가 후 | 14 failed / 4 passed (RED), 기존 스냅샷 통과 |
| 번들 테스트 추가, 미구현 import 실패 후 수집용 빈 등록 함수로 재실행 | 83 failed / 4 passed (RED) |
| 옵션·번들 구현 후 | 87 passed (GREEN), 스냅샷 갱신 없음 |
| manifest 작품 지시 적용값 테스트 보강 | 14 failed / 55 passed (RED) → 구현 후 대상 87 passed |
| `node node_modules/vitest/vitest.mjs run tests/mcp/writing-context.test.ts tests/ai/prompt.test.ts --project unit` | **87 passed, 2 files, skipped 0** |
| `node node_modules/vitest/vitest.mjs run tests/ai --project unit` | **929 passed, 67 files, skipped 0** |
| `node node_modules/vitest/vitest.mjs run tests/mcp --project unit` | **302 passed, 10 files, skipped 0** |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | **기존 LayoutProps 오류 1건, 신규 오류 0** |
| 변경 코드·테스트 4개 파일 ESLint `--max-warnings=0` | 통과 |
| Git diff whitespace 검사 | 통과 |

기존 AI 테스트의 단언이나 스냅샷은 수정하지 않았다. 추가한 스냅샷도 prompt.ts 수정 후 갱신하지 않았다. 단위 PostgREST 더블은 실제 필터와 컬럼 투영을 적용한다. 정상 행과 함께 반환된 DB 오류, throw, 비정상 행, null 목록, 양방향 사용자 격리, 중간 문서 변경, 전체 JSON 정확한 상한, 이모지 합산을 검증한다. 실제 SDK McpServer에도 등록하여 계약을 확인했다. DB·네트워크는 사용하지 않았다.

## 계획과 다른 점 및 실행 제약

1. 지정된 `tests/ai/prompt.test.ts`가 없어서 신규 생성했다. 기존 회귀 파일은 수정하지 않았다.
2. 금지된 tsbuildinfo 변경을 피하려고 tsc에 `--incremental false`를 추가했다. npx 대신 지정된 node 진입점을 사용했다.
3. 번들 전체 제한의 정확한 기준을 JSON 직렬화 길이로 명시하고 manifest 자체도 포함했다. 공통 런타임 수정 없이 크기 오류를 표현하기 위해 위의 고정 마커 변환을 사용했다.
4. 사용자 금지 범위를 우선하여 ROADMAP·STATE·REQUIREMENTS·SSOT·graphify 출력과 요구사항 링크를 갱신하지 않았다. graphify는 기존 그래프 query만 실행했다. 외부 AI 호출·커밋·푸시·브랜치 변경은 없다.
5. 허용된 코드·테스트 4개와 이 SUMMARY만 변경했다. 기존 미추적 `.agents/skills/phase-session-dispatch/`는 그대로 두었다.

## 남은 위험

- **응답 프로토콜 기본 제외(false)는 계획의 결정이며 아직 사용자 확정 전이다. 기본값에 대한 사용자 확인이 필요하다.** 이번 코드는 명시된 계획대로 구현했다.
- 전체 tsc 통과는 기존 LayoutProps 오류로 막혀 있다. 수정 금지 파일에 타입 선언을 추가하거나 오류를 숨기지 않았다.
- 실제 bearer/RLS·교차 사용자·라이브 grant 폐기 통합 검증과 라우트 등록은 13-05에서 수행해야 한다. 이 등록 함수는 기존 withMcpAuth의 요청별 서명·라이브 grant 검증 뒤에서 사용해야 한다. 단위 더블은 실제 RLS를 증명하지 않는다.
- 본문은 전체를 읽고 조립한 뒤 크기를 검사한다. 큰 원문은 응답 오류가 되지만 DB 전송·메모리 사용은 발생한다. 여러 조회는 하나의 DB 스냅샷을 보장하지 않으며 실제 본문 쿼리에서 문서 경계를 재검사한다.
- mention helper의 fluent API가 바뀌면 좁은 어댑터도 함께 갱신해야 한다. 현재 테스트는 실제 helper를 호출한다.

Known stubs: 없음.

## 사후 확인 (Claude sonnet 교차 리뷰 + 오케스트레이터 재검증)

- 리뷰 판정 PASS(blocker 없음, warning 3). 앱 회귀·소유권·존재 오라클·크기 상한·manifest·신뢰 수준 분리·annotation은 통과.
- W1(앱 회귀 방어 약함) 대응: 변경 전(`HEAD`) `prompt.ts`를 임시 파일로 복사해 현재 구현과 직접 비교하는 일회용 테스트를 돌렸다. `composeSystemInstruction` 480개 조합(프리셋 3 x 문체 4 x 작품 지시 5 x 자유 지시 4 x 문서 계획 2)과 `assembleUserContent` 24개 조합이 옵션 생략 시 모두 문자 단위로 일치했다. 임시 파일은 삭제했고 커밋하지 않았다.
- W2: `manifest.settings.workSystemInstruction.value`가 작품 지시 원문(최대 4000자)을 `systemInstruction`과 중복해 담아 100,000자 한도를 소모한다. 투명성을 위한 의도로 보고 유지.
- W3: 자유형이 아닌데 `customInstruction`을 넘기면 조용히 무시되고 manifest에 "무시됨" 표시가 없다. 동작은 맞고 가시성만 아쉬워 후속 개선 후보.
- 사용자 확인 대기: 번들의 응답 프로토콜 기본 제외(`includeAppResponseProtocol=false`)는 계획의 결정이며 사용자가 확정하지 않았다.
