# Phase 14 PLAN 실행 메모 (checker 권고, 비차단)

plan-checker(sonnet) 판정: VERIFICATION PASSED (수정 루프 1회). 아래는 실행자가 지킬 권고다.

1. 14-03 T1·14-04 T1의 verify는 `node --check`뿐이다. 같은 plan의 T2에서 마이그레이션 적용 후 DB 테스트가 돌기 전에는 T1을 검증된 것으로 취급하지 않는다.
2. `vitest.config.ts`는 파일 내용의 DB 마커(`helpers/db`, `SUPABASE_DB_URL`, `postgres(` 등)로 db 프로젝트를 가른다. 신규 `*.database.test.ts`에는 마커가 있어야 하고, 신규 `tests/review/*`·`tests/mcp/tools-propose.test.ts` 단위 테스트에는 없어야 한다(있으면 unit에서 조용히 건너뛴다, passWithNoTests).
3. 14-12 T1의 `tests/mcp --project db` 전체 래퍼는 skipped 0을 요구한다. 기존 DB 테스트는 `describe.skipIf(!ready)`라서 `.env.disposable`에 필요한 키가 모두 있어야 한다.
4. 14-11의 `?importDraft` 서버 액션은 클라이언트 페이지에서 돈다. StrictMode 개발 모드에서 두 번 실행되면 `import_count`가 두 배가 되므로 ref 등으로 중복 실행을 막는다.
5. 14-10 T1이 쓰는 `lib/review/queries.ts`는 T2와 frontmatter에만 적혀 있다(표기 문제).
6. 이 체크아웃은 `node_modules`가 비어 있다. Wave 0(14-01)의 `npm ci`가 먼저다.
