---
phase: 12-mcp-oauth
plan: 06
status: in-progress
task1: pass (human-run, 2026-10-25)
task2: pending
requirements: [MCP-01, MCP-08]
requirements-completed: []   # Task 2(Claude·브라우저 인수) 판정 후 기록
---

# 12-06 수동 게이트 결과 (진행 중)

> 판정은 사람이 남긴다. 토큰·비밀·authorization_id 원문은 기록하지 않는다.

## Task 1: 일회용 DB 적용과 해제/교차 사용자 실증 — 합격

**환경:** 일회용 Supabase(`.env.disposable`, ref `anzafn…`, 공유 프로젝트 `ymudwg…`와 다름). `0037_mcp_oauth_grants.sql`, `0038_oauth_sensitive_rls.sql`을 사용자가 SQL Editor에서 이 프로젝트에만 적용했다. 공유 DB에 적용한 변경은 0건.

**실행:** 사용자가 PowerShell에서 직접 실행(테스트가 테스트 계정을 만들기 때문).
`$env:MCP_DISPOSABLE_PROJECT_REF="<일회용 ref>"; $env:MCP_PUBLIC_ORIGIN="http://localhost:3000"; node --env-file=<.env.disposable> node_modules\vitest\vitest.mjs run tests/mcp --project db`

**결과:** `Test Files 4 passed (4)`, `Tests 22 passed (22)`, **skipped 0**, 실패 0 (약 74초).

| 파일 | 건수 | 증명된 것 |
|---|---|---|
| `revoke-blocks.database.test.ts` | 4 | 해제 전 발급 토큰이 `exp` 전에 변형 A(`mcp_disconnect`만)·B(`revokeGrant`만)·C(둘 다) 모두 차단. DB 장애 때 fail closed, 복구 뒤 같은 토큰 정상화 |
| `cross-user.database.test.ts` | 9 | 토큰은 자기 소유자만 인식, B 토큰으로 A 행·리소스 접근 불가, 클라이언트 X 토큰은 같은 작가의 클라이언트 Y grant로 인증 불가, 한 클라이언트 해제는 그 토큰만 차단 |
| `grants.database.test.ts` | 6 | 활성 grant 1행(컬럼 충돌 회귀 방지), 해제·연결 해제·세션 삭제·타 client·동의 해제·탈퇴 계정 0행, 정지 계정 읽기 허용, EXECUTE 권한, 60초 스로틀, 재연결 시 이전 연결 revoke와 ID 반환 |
| `sensitive-rls.database.test.ts` | 3 | 민감 테이블 RESTRICTIVE 정책 카탈로그, OAuth bearer REST 직접 접근 차단과 일반 세션 owner 접근 유지, OAuth PATCH가 값을 바꾸지 못함 |

**진행 중 발견·조치**
- 첫 실행에서 `PGRST202`(함수 없음): 마이그레이션 적용 전에 테스트를 먼저 돌린 것이 원인(적용 후 해소).
- `grants`·`sensitive-rls`는 `MCP_TEST_*` 토큰 환경변수가 없으면 항상 skipped 되는 구조였다(토큰을 만드는 단계 부재). 두 테스트가 `revoke-blocks`와 같은 방식으로 `beforeAll`에서 헬퍼(`createWriter`, `issueMcpToken`)로 직접 토큰을 발급하게 수정했다(단언 6건·3건 보존, 공유 ref 가드 유지). 수정은 Claude sonnet이 수행했고 Codex 한도 초과 중이라 폴백했다.

**충족한 ROADMAP 성공 기준:** 2(연결 토큰은 승인한 작가 본인 데이터에만), 4(해제 이전 발급 토큰의 호출이 즉시 차단)가 실DB로 증명됐다. 민감 테이블 RESTRICTIVE RLS(D-17)와 fail closed(D-10)도 실DB로 확인됐다.

## Task 2: Claude와 UI-SPEC 브라우저 인수 — 대기

사람이 확인할 항목:
- 실제 Claude 커스텀 커넥터에서 연결·동의·whoami·해제·다음 호출 차단 (ROADMAP 성공 기준 1·3).
- 동의 화면 상태: 정상, 로그인 필요(중립 문구 확정 필요), 독자 전용, 만료 ID, 허용 외 호스트, 승인 실패.
- 관리 화면: 목록, 빈 상태, 해제 다이얼로그, 복사 성공·실패, 목록 실패.
- 375px: 가로 스크롤 없음, 버튼 전폭, 내용 접힘. 키보드 포커스·Esc·status/alert 읽기. 해제 성공 후 포커스 이동(첫 해제·마지막 카드·두 번째 이후 해제).

이월 항목(12-01~12-05에서 넘어옴): refresh token 갱신(수명 경과 후 호출), `last_used_at` 스로틀 실측, 이미 동의된 요청이 동의 화면 없이 바로 이동할 때 연결 행 일치 여부, 해제 `partial` 이후 `revokeGrant` 재정리 경로, 로그인 필요 화면 중립 문구 확정(UI-SPEC 갱신).
