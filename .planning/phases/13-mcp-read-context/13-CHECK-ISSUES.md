# Phase 13 plan 검수 결과: ISSUES FOUND (blocker 0, warning 7)

결정 D-P13-01~04, D-17 정정, 세계수 제외, 프리셋·문체 인자화는 모두 반영됐고 어긋남이 없다. MCP-02/03/04/09 및 Success Criteria 1~4는 plan/task에 대응한다. 교차 사용자 테스트는 6개 도구 전부 포함. 공유 Supabase 변경 task 없음, createAdminClient 금지 및 정적 테스트 있음, 본문은 신규 owner 전용 RPC 사용. wave와 depends_on 정상(D-17 게이트 13-01이 도구 등록 13-05보다 앞).

## Warnings
1. [nyquist] 13-VALIDATION.md가 plan 시점에 없고 13-05 Task 2(wave 4)에서 처음 작성된다. Check 8e 원칙상 파일 존재가 게이트다. 수정: plan-phase 단계에서 VALIDATION.md 초안(MCP-02/03/04/09별 명령 표)을 먼저 만들고 13-05는 실제 결과만 갱신하게 한다. (13-05-PLAN.md Task 2)
2. [verify 실행 가능성] 13-01 Task 1/2, 13-05 Task 2의 verify가 `--env-file=<disposable-env>` 자리표시자(&lt; &gt; 이스케이프 포함)를 쓴다. 수정: 환경 파일 경로 규약(예: .env.disposable.local)을 명시하고 파일 부재 시 중단하도록 적는다.
3. [DB 프로젝트 분류] vitest.config.ts는 파일 내용의 DB_MARKER(`helpers/db`, SUPABASE_DB_URL 등) 유무로 db/unit 프로젝트를 나눈다. 신규 *.database.test.ts가 마커를 안 가지면 `--project db`에서 0개 실행(passWithNoTests로 통과)된다. 수정: verify에 실행된 테스트 수/skipped 0 확인을 넣고, 마커 포함을 task action에 명시. (13-01 Task 1, 13-05 Task 2)
4. [가드 재사용] "기존 assertDisposableRef 가드"는 cross-user/revoke-blocks 테스트 각 파일의 로컬 함수이며 공유 헬퍼가 아니다. 수정: 신규 테스트가 복사하거나 tests/helpers로 추출함을 명시. (13-01 done)
5. [DB 장애 테스트 모호] 13-01/13-05 behavior의 "grant 조회 장애 시 읽기 불가"를 실DB에서 어떻게 재현할지 없다. 수정: helper 함수 오류 주입 방식(예: 일회용 DB에서 함수 임시 교체) 또는 단위 fail-closed 테스트로 범위를 명시.
6. [scope] 13-01은 40개 테이블 정책 + 전체 SECURITY DEFINER RPC 전수 감사를 한 plan(2 task, 한 SQL 파일)에 담아 컨텍스트 위험이 크다. 수정: Task 2의 RPC 감사를 별도 plan(13-01b)으로 분리하거나 감사 산출 목록을 먼저 SUMMARY에 쓰게 하고 처리 방식 결정 기준(차단/가드/유지)을 구체화.
7. [frontmatter 형식] must_haves의 artifacts가 문자열 목록, key_links가 문장이라 gsd-tools의 path/provides, from/to/via 구조와 맞지 않아 자동 검증이 무력할 수 있다. 수정: 구조화된 객체로 작성. 또한 13-05 Task 1은 route-auth.test.ts가 whoami 단일 도구를 가정하면 깨질 수 있으니 files_modified에 포함 검토.

## Info
- 응답 프로토콜 기본 제외(includeAppResponseProtocol=false)는 CONTEXT의 열린 확인 사항에 대한 planner 판단이다. 두 층 분리 방침과 부합하나 사용자 확인 기록은 없다.
- 성공 기준 4는 12-06 Task 2 pending에 의존해 수동 게이트로 남는 점을 plan이 올바르게 명시했다.

## 수정 기록 (round 1)

수정 파일: `13-01-PLAN.md`, `13-02-PLAN.md`, `13-03-PLAN.md`, `13-04-PLAN.md`, `13-05-PLAN.md`, `13-PLAN-NOTES.md`, `13-CHECK-ISSUES.md`. 신규 파일: `13-01b-PLAN.md`, `13-VALIDATION.md`.

| Warning | 처리 결과 |
|---|---|
| W1 | `13-VALIDATION.md`를 계획 시점 초안으로 작성하고 13-01 Task 2에 배치했다. 13-05는 실제 결과만 갱신한다. |
| W2 | DB 환경 파일을 프로젝트 루트 `.env.disposable`로 통일했다. 13-01 Task 1에 부재 시 중단·보고 및 ref 확인을 명시하고 자리표시자를 제거했다. |
| W3 | 신규 DB 테스트 action에 `SUPABASE_DB_URL` DB_MARKER와 verify의 실행 수 0 초과·skipped 0을 명시했다. |
| W4 | 두 로컬 원본 테스트의 `assertDisposableRef`를 `tests/helpers/disposable-ref.ts`로 추출해 재사용하도록 13-01 done에 명시했다. |
| W5 | grant 조회 실패 주입 단위 테스트로 fail closed를 확인하고 실DB 장애 재현은 요구하지 않도록 13-01·13-05 behavior를 분리했다. |
| W6 | RPC 전수 감사를 13-01b(wave 2)로 분리하고 차단/가드/유지 판정 표와 13-05 선행 의존성을 추가했다. |
| W7 | 모든 plan의 `must_haves.artifacts`와 `key_links`를 객체 배열로 바꾸고 `route-auth.test.ts`를 13-05 Task 1·files_modified에 포함했다. |

Info: `13-PLAN-NOTES.md`의 정정·실행 제약에 응답 프로토콜 기본 제외의 사용자 확인 기록이 없음을 적었다.

## round 2 검수

판정: VERIFICATION PASSED (blocker 0, warning 0, info 2)

round 1 W1~W7 해결을 파일에서 직접 확인했다.
- W1: 13-VALIDATION.md가 plan 시점에 존재하고 MCP-02/03/04/09 명령 표를 담는다. 13-01 Task 2가 보유하고 13-05는 실행 결과만 갱신한다.
- W2: 자리표시자 없음. `.env.disposable`(gitignore의 `.env*`에 포함)로 통일했고 부재 시 중단·ref 확인이 13-01 Task 1과 VALIDATION에 명시됐다.
- W3: 신규 DB 테스트(read-boundary, tools.cross-user)에 `SUPABASE_DB_URL`이 명시되어 vitest.config.ts의 DB_MARKER에 분류된다. DB verify마다 실행 수 0 초과·skipped 0 확인이 있다.
- W4: `tests/helpers/disposable-ref.ts` 추출이 13-01 files·done에 있다.
- W5: grant-fail-closed.test.ts 단위 테스트로 범위를 분리했다.
- W6: 13-01b(wave 2, depends 13-01)로 분리, 차단/가드/유지 기준 표가 있고 13-05가 13-01·13-01b에 의존한다(wave 4). 교차 사용자 테스트는 13-05의 tools.cross-user suite, D-17 RPC 일관성은 13-01b에 있다.
- W7: 전 plan의 artifacts는 {path, provides}, key_links는 {from, to, via} 객체이며 route-auth.test.ts가 13-05 files에 포함됐다.

결정 사항(D-P13-01~04, D-17 정정, 세계수 제외, createAdminClient 금지)은 유지되며 MCP-02/03/04/09와 성공 기준 1~4 매핑이 완전하다. wave 구조: 01(1) -> 01b, 02(2) -> 03, 04(3) -> 05(4).

Info
1. 13-COVERAGE.md의 요구사항 매핑에 13-01b가 빠져 있다(MCP-02/03/04). 문서 정합성만의 문제다.
2. 13-01 Task 1의 verify는 ref 일치 검사를 명령이 아닌 action 문장에만 둔다. 실행 시 가드 테스트(assertDisposableRef)가 보완한다. 13-05 truth는 "six tools", artifact는 "Seven"(whoami 포함)으로 표현이 다르다.
