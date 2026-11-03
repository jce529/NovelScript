# Phase 13 — Nyquist 검증 초안

`workflow.nyquist_validation=true` (`.planning/config.json`). 이 문서는 계획 시점 초안이며, 13-05(2026-11-03)에서 자동·일회용 DB 실행 결과만 갱신했다. Claude 인수 관찰은 아직 없다(pending).

일회용 DB 검증은 프로젝트 루트 `.env.disposable`이 있을 때만 한다. 파일이 없으면 즉시 중단하고 사용자에게 보고한다. 실행 전 API·DB URL의 프로젝트 ref 일치와 공유 프로젝트 ref와의 차이를 확인한다. 모든 DB 명령은 실제 실행 테스트 수 0 초과, skipped 0이 필수다. 공유 Supabase 프로젝트에서는 실행하지 않는다.

| 요구사항 | 자동 검증 명령 | 일회용 DB 검증 명령 | 상태 |
|---|---|---|---|
| MCP-02 | `npx vitest run tests/mcp/tools-works.test.ts --project unit` | `node --env-file=.env.disposable node_modules/vitest/vitest.mjs run tests/mcp/read-boundary.database.test.ts tests/mcp/tools.cross-user.database.test.ts --project db` | 자동 PASS — 단위 59/59, DB 16+12/28, skipped 0 |
| MCP-03 | `npx vitest run tests/mcp/tools-kb.test.ts --project unit` | `node --env-file=.env.disposable node_modules/vitest/vitest.mjs run tests/mcp/tools.cross-user.database.test.ts --project db` | 자동 PASS — 단위 85/85, DB 12/12, skipped 0 |
| MCP-04 | `npx vitest run tests/mcp/writing-context.test.ts tests/ai/prompt.test.ts --project unit` | `node --env-file=.env.disposable node_modules/vitest/vitest.mjs run tests/mcp/tools.cross-user.database.test.ts --project db` | 자동 PASS — 단위 69+18/87, DB 12/12, skipped 0 |
| MCP-09 | `npx vitest run tests/mcp/tool-annotations.test.ts tests/mcp/route-auth.test.ts --project unit` | `node --env-file=.env.disposable node_modules/vitest/vitest.mjs run tests/mcp/tools.cross-user.database.test.ts --project db` | 자동 PASS — 단위 4+16/20, DB 12/12, skipped 0. 실제 Claude 무확인 호출은 pending |

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
| D-17 선행 경계 (13-01·13-01b) | PASS | Task 1 전에 `read-boundary.database.test.ts` 단독 실행 16/16 통과(skipped 0). 40개 테이블 카탈로그·네 테이블 소유자 SELECT·본문 RPC·노출 SECURITY DEFINER 37개 분류 포함 |
| grant 조회 장애 fail closed | PASS | `tests/mcp/grant-fail-closed.test.ts` 12/12 (단위, 13-01 오류 주입). 실DB 재현은 요구하지 않음 |
| 일회용 DB 전체 (`tests/mcp --project db`) | PASS — 50/50, failed 0, skipped 0 | 6개 파일: read-boundary 16, tools.cross-user 12(신규), cross-user 9, grants 6, revoke-blocks 4, sensitive-rls 3. 기존 38개 + 신규 12개. 같은 날 두 번 연속 실행해 모두 통과(JSON reporter: numPendingTests 0, numTodoTests 0) |
| 여섯 도구 교차 사용자 (MCP-02/03/04) | PASS | `tools.cross-user.database.test.ts`: 먼저 A 토큰으로 A의 작품·초안/유료/공개 회차·작품/공유 문서·번들이 읽히는지 확인(음성 결과가 의미 있도록), 이어 B 토큰에 A의 ID를 주입. list_works는 B 행만, list_chapters·get_chapter·search_kb(A 작품)·get_kb_document·get_writing_context(A 작품·회차)는 고정 문구 "요청한 항목을 찾을 수 없습니다."만 반환하고 A ID를 되돌려주지 않음. B 작품에서 A 본문 문자열로 검색하면 빈 결과, 전체 목록 페이지에도 A 노드 없음. 응답 원문 어디에도 A 고유 표식 문자열·SQL/PostgREST 오류 조각(PGRST, permission denied, 42501 등) 없음 |
| 혼합 번들 (MCP-04) | PASS | B 공유·작품 노드 + A 작품·공유·폴더 노드를 섞은 nodeIds에서 includedDocuments는 B 두 문서뿐(요청 순서 유지), missingNodeIds는 A 세 ID뿐, systemInstruction·userContext에 A 지시·본문 없음 |
| 해제 후 차단 (MCP-02/03/04/09) | PASS | grant 해제 전에 발급한 B 토큰(만료 전)으로 해제 후 7개 도구 모두 HTTP 401 + Bearer challenge, 본문에 B 데이터·ID 없음. 별도 client의 B 토큰은 계속 동작 |
| 정적 계약 (MCP-09) | PASS | `tool-annotations.test.ts` 4/4: 라우트가 등록하는 7개 도구(whoami 포함)의 네 annotation(true,false,true,false)·title·description·strict schema(userId/ownerId 추가 거부). `route-auth.test.ts` 16/16: tools/list 7개·`additionalProperties:false`, 토큰 없음·grant 0행 시 여섯 도구 401·DB 조회 0회, SQL 오류 주입 시 원문 미노출. `no-admin-client.test.ts` 11/11: `lib/mcp/**`·`app/mcp/**`에 admin client·service role 참조와 쿠키 기반 클라이언트(`next/headers`, `@/lib/supabase/server|client`) import가 없음. 상대·동적·require 경로 import도 정규식으로 잡는다(교차 리뷰 반영) |
| 타입 검사 | 신규 오류 없음(통과 아님: 기존 오류 1건 남음) | `tsc --noEmit`: `app/layout.tsx`의 `LayoutProps` 오류 1건만 나온다. 이 파일은 Phase 13에서 수정하지 않았다. 이 오류를 해결하지 않았으므로 `tsc` 전체는 통과가 아니다 |
| 실제 Claude 커넥터 (13-05 Task 3, 성공 기준 4) | 조건부 통과(일회용 환경, 2026-11-03) | 아래 "Task 3 실제 Claude 인수 기록" 참고. 도구 7개가 Claude에서 "읽기 전용 도구"로 분류됐고 해제 후 호출이 차단됐다. 단 Claude의 **기본 도구 권한은 "승인 필요"** 라서 기본 상태에서는 읽기 도구도 승인 카드가 나왔고, 그룹을 "항상 허용"으로 바꾼 뒤에야 무확인으로 실행됐다. 성공 기준 4를 완료로 볼지는 사용자 판단 대기 |

## Task 3 실제 Claude 인수 기록 (2026-11-03, 일회용 Supabase `anzafn…` + 무료 터널 + `next start`)

환경: 일회용 프로젝트에서 사용자가 Site URL·Redirect URLs를 터널 주소로 바꾸고, 임시 작가(`@novelscript.test`) 세션 쿠키로 동의 화면을 승인했다(소셜 로그인 없음). 실제 claude.ai(사용자 계정, Pro)에서 커스텀 커넥터로 연결했다. 공유 프로젝트 `ymudwg…`는 사용하지 않았다. Claude in Chrome으로 에이전트가 화면을 조작했다.

| # | 확인 | 결과 | 관찰 |
|---|---|---|---|
| 1 | 연결 성립 (12-06 Task 2 #3·#4) | PASS | 동의 승인 후 커넥터 연결됨. DB `mcp_connections`: client `Claude`, 출처 `claude.ai`, 범위 `read`·`propose_draft`, `revoked_at` null |
| 2 | 도구 목록·annotation 인식 (MCP-09) | PASS | Claude 도구 권한 화면이 7개 도구를 모두 **"읽기 전용 도구 7"** 그룹으로 분류(한국어 title 표시) |
| 3 | 기본 권한에서의 호출 | **승인 필요** | 기본 권한이 "승인 필요"라 `연결된 작가 확인` 호출 시 승인 카드(`거부`/`항상 허용`/`한 번만 허용`)가 나타났다. `한 번만 허용` 후 정상 응답 |
| 4 | 그룹을 "항상 허용"으로 변경 후 호출 | PASS | 승인 카드 없이 작품 목록·회차 목록·회차 본문·설정집 검색·설정 문서 읽기·집필 컨텍스트 묶음이 실행됨. 권한 변경은 Claude 설정(사용자 계정)에서 한 것이며 우리 코드로 바꿀 수 없다 |
| 5 | 본인 데이터만 (MCP-02/03) | PASS | `whoami`가 승인한 작가의 사용자 ID 반환. 작품 목록은 작가 본인 작품 2개(시드 1 + 사용자가 직접 만든 1)만. 같은 DB의 다른 작가 작품 7개(`테스트 작품` 6, 총괄 계정 `전은재개패기`, 다른 작가 `타인의 비밀 작품`)는 나타나지 않음 |
| 6 | 초안·미발행 회차 본문 (D-P13-03) | PASS | 1화(미발행 초안) 본문이 그대로 읽힘 |
| 7 | 설정집 + 계정 공유 (D-P13-02) | PASS | 작품 설정집 `아린`·`무월`과 계정 공유 `문체 가이드`를 검색·읽기 |
| 8 | 집필 컨텍스트 묶음 (MCP-04) | PASS(관찰 1건) | 포함 문서 2개, 누락 ID 없음, 작품 시스템 지시는 저장값, 프리셋·문체는 기본값(`intermediate`, `concise-hemingway`), 장르 기본값(`GENRES[0]`). **관찰:** `includeAppResponseProtocol`를 Claude가 **직접 `true`로 지정**했다. 입력 스키마에 설명(`.describe`)이 없어 이름과 "앱 조립 순서"라는 도구 설명만 보고 켠 것으로 보인다. 기본값(false)은 인자를 생략할 때만 적용된다 |
| 9 | 격리 (두 사용자) | PASS | 다른 작가의 비밀 표식 `UAT-B-SECRET`을 설정집 검색과 회차 본문 전체 읽기로 찾게 했으나 어디에도 없음 |
| 10 | 연결 관리 화면 (MCP-08, 12-06 #5) | PASS | `/studio/settings/mcp-connections`에 카드(`Claude · claude.ai`, 연결일, 마지막 사용 `방금 전`, `연결 해제`)와 커넥터 주소 표시 |
| 11 | 해제 후 차단 (12-06 #6, 성공 기준 4의 해제 부분) | PASS | 확인창("다음 호출부터 이 커넥터의 접근이 차단돼요") 후 해제 → 같은 대화에서 `List works` 재호출 시 Claude가 "이 도구를 사용하려면 인증이 필요합니다"와 `연결` 버튼 표시. DB `revoked_at` 기록, `last_used_at`은 해제 이전 마지막 성공 호출 시각에서 갱신 안 됨 |

미확인: 12-06 #7(동의 화면 상태 변형), #8(375px·접근성), #9(refresh token 1시간 후)은 이번에 수행하지 않았다.
판정 보류: 성공 기준 4("읽기 호출에 불필요한 확인 없음")는 Claude 기본 권한이 "승인 필요"라서 기본 상태에서는 충족되지 않는다. annotation은 Claude가 인식(읽기 전용 그룹)하고 사용자가 그룹 단위로 한 번에 "항상 허용"할 수 있다는 점까지 확인했다.

### 후속 조치 (인수 직후)

- 관찰 8(`includeAppResponseProtocol`를 Claude가 직접 `true`로 지정): `get_writing_context` 입력 스키마의 모든 필드에 한국어 `.describe`를 추가했다. 특히 `includeAppResponseProtocol`는 "외부 AI 클라이언트에는 필요 없으므로 기본값은 false, 특별한 이유가 없으면 생략"이라고 적었다. 프리셋·문체·`customInstruction`·`nodeIds`도 의미와 생략 시 동작을 적었다. 테스트가 모든 필드에 설명이 있고 `includeAppResponseProtocol` 설명이 기본값·태그·생략을 언급하는지 검사한다. 같은 클라이언트에서 설명 추가 후 Claude가 이 옵션을 켜지 않는지는 다시 관찰하지 않았다(미검증).
- 성공 기준 4: "조건부 통과"로 둔다. annotation 인식과 그룹 단위 "항상 허용"까지는 확인했고, 기본 권한이 "승인 필요"인 것은 Claude 클라이언트 정책이라 코드로 바꿀 수 없다. 완료 처리는 사용자·총괄 판정 사항이다.
- 정리: 서버·터널 종료, 일회용 Supabase Site URL을 `http://localhost:3100`으로 복구(원래 값은 이력이 없어 사용자가 선택), Redirect URLs 비움, Claude의 NovelScript 커넥터 제거. 일회용 DB의 임시 작가 계정과 사용자가 만든 작품 1개는 `locked_node_immutable` 보호로 삭제하지 못해 남아 있고 살아있는 MCP 연결은 0이다.
