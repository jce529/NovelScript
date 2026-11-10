# Phase 14 — Nyquist 검증 계획

`workflow.nyquist_validation=true`. 계획 시점 문서이며 아래 명령은 실행 결과가 아니다. 모든 DB 명령은 14-01에서 계획한 `scripts/assert-vitest-json.mjs` 래퍼로 Vitest JSON의 `numPassedTests > 0`, `numPendingTests === 0`, 실패 0을 검사한다. 테스트 파일의 `describe.skipIf(!ready)`만으로 통과로 판정하지 않는다.

| 요구사항 | 자동 검증 명령 | 핵심 단정 |
|---|---|---|
| MCP-05 | `npx vitest run tests/mcp/tools-propose.test.ts tests/review/text.test.ts tests/review/editor-import.test.ts --project unit` | 초안 입력·정규화·커서 삽입·전이 실패 시 미삽입 |
| MCP-05 | `node scripts/assert-vitest-json.mjs -- node --env-file=.env.disposable node_modules/vitest/vitest.mjs run tests/mcp/propose-write.database.test.ts tests/mcp/propose-review.database.test.ts --project db` | 소유권·cap·dedupe·초안 전이·회차 본문 불변 |
| MCP-06 | `npx vitest run tests/review/text.test.ts tests/review/kb-diff.test.ts tests/review/hunk-selection.test.ts --project unit` | 정규화·해시·hunk 부분 적용·선택 초기화 |
| MCP-06 | `node scripts/assert-vitest-json.mjs -- node --env-file=.env.disposable node_modules/vitest/vitest.mjs run tests/mcp/propose-write.database.test.ts tests/mcp/propose-review.database.test.ts --project db` | SQL↔TS 벡터 동치·CAS·폴더 검증·CRLF→LF |
| MCP-07 | `npx vitest run tests/review/queries.test.ts tests/review/filters.test.ts tests/review/detail-id.test.ts tests/review/counts.test.ts tests/review/entrypoints.test.ts --project unit` | 종류·상태·URL 필터·UUID 종류 판별·범위별 배지 합계·진입점 |
| MCP-07 | `node scripts/assert-vitest-json.mjs -- node --env-file=.env.disposable node_modules/vitest/vitest.mjs run tests/mcp/read-boundary.database.test.ts tests/mcp/propose-review.database.test.ts --project db` | 42개 테이블·RPC guard/block·소유자별 목록·건수 |

공통 게이트: `npx vitest run --project unit`, `node scripts/assert-vitest-json.mjs -- node --env-file=.env.disposable node_modules/vitest/vitest.mjs run tests/mcp --project db`, `npx tsc --noEmit`. 각 명령에서 실패 0, DB는 실행 테스트 수 > 0 및 skipped 0이 필수다.

## 샘플링 비율

- **Task 완료마다:** 14-RESEARCH.md Validation Architecture의 Quick run 단위 테스트를 실행한다. 계획 문서의 “per task commit”은 이번 무커밋 수정에 적용하지 않으며, 실제 구현 task 완료 시점의 검증 주기를 뜻한다.
- **Wave 병합마다:** unit 전체와 일회용 DB의 `tests/mcp --project db` 전체를 실행한다. DB는 실행 수 > 0, skipped 0을 단정한다.
- **Phase 게이트:** unit·DB 전체·타입 검사 통과와 아래 수동 확인을 기록한 뒤 `/gsd:verify-work`로 넘긴다.

## 일회용 DB 규칙

`.env.disposable`이 없거나 필수 키가 없으면 중단·보고한다. `node scripts/check-env.mjs .env.disposable`로 키 존재만 확인하고 파일 내용·비밀값은 출력하지 않는다. API·DB URL의 ref와 `MCP_DISPOSABLE_PROJECT_REF`가 같은지 `assertDisposableRef`로 확인하고 공유 ref는 거부한다. 14-01에서 0037, 0038, 0039, 0040, 0050 적용 상태를 먼저 확인한다. 신규 마이그레이션은 `node scripts/apply-pending-migrations.mjs --env-file .env.disposable --expect-ref <일회용-ref> --from 0051 --to 0051 --execute`와 0052의 동일 형식으로 일회용 DB에만 적용한다. 이미 적용된 파일은 재적용하지 않는다. 모든 DB verify는 JSON 래퍼로 `numPassedTests > 0 && numPendingTests == 0`을 확인한다.

## 수동 확인

- 실제 브라우저에서 초안 커서 위치·끝 삽입과 **Ctrl/Cmd+Z** undo, 저장 전 이탈 후 재가져오기.
- 모바일 폭의 인박스·상세·하단 액션바·집필 탭과 트리 배지 겹침.
- 스크린리더로 hunk 접두·라벨·선택 요약 및 오류 알림 확인.
- 실제 Claude 커넥터로 제안 3종 제출→출처 표시→부분 수락·거절·재가져오기 확인. 실행 전 사용자 이의가 없는 A1/A2/A6/A7/A8 기본값과 A3/A4/A9/A11 확인 결과는 SUMMARY에 기록한다.
