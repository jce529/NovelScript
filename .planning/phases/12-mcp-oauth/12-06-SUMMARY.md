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

## 수동 확인 필요 (Task 2 — 상태: pending/blocked, PASS 아님)

> 사용자가 모바일 원격이라 이번 세션에서 사람 검증을 하지 못했다. 아래는 **미확인**이며 PASS로 간주하지 않는다. MCP-01·MCP-08의 Claude 실왕복(성공 기준 1·3)과 UI-SPEC 인수는 이 절이 끝나야 완료다. 에이전트 수행분은 아래 "Task 2 진행 기록"에 있다. 서버·터널은 정리했다(무료 터널이라 다시 켜면 주소가 바뀐다).

**준비물:** PC(Windows, PowerShell), 일회용 Supabase `anzafn…` 대시보드 접근, Claude에 로그인한 브라우저 1개(쿠키 심기용과 같은 브라우저), `D:\MyProject\NovelScript\.env.disposable`. 공유 프로젝트 `ymudwg…`는 쓰지 않는다.

| # | 할 일 | 명령/방법 | 기대 결과 | 상태 |
|---|---|---|---|---|
| 0 | 환경 재기동 | 이 브랜치에서 `npm run build`(env 래퍼 사용) 후 `node <scratchpad>\run-with-env.mjs D:\MyProject\NovelScript\.env.disposable MCP_PUBLIC_ORIGIN=<터널 origin> -- node node_modules/next/dist/bin/next start -p 3100`, 별도 창에 `cloudflared tunnel --url http://localhost:3100` (포트 3100만) | 터널 경유 `POST <origin>/mcp` → 401 + `resource_metadata` | blocked(서버 내림) |
| 1 | Site URL 변경 | 일회용 프로젝트 Authentication → URL Configuration → Site URL = 터널 origin, Redirect URLs 교체. 끝나면 원래 값 복구 | 저장됨 | pending |
| 2 | 작가 세션 쿠키 | `node --env-file=D:\MyProject\NovelScript\.env.disposable <scratchpad>\mint-writer-session.mjs` → 브라우저 `<origin>/studio`에서 F12 콘솔에 붙여넣기 (유효 약 55분, 만료 시 반복) | `/studio` 진입, 로그인 상태 | pending |
| 3 | Claude 커넥터 등록 | 기존 NovelScript 커넥터 삭제 → 커스텀 커넥터 URL `<origin>/mcp` → Connect | 동의 화면: 클라이언트명, "연결 요청 출처: claude.ai" 표시 | pending |
| 4 | 승인 후 호출 | Claude에서 `whoami` | 승인한 작가 본인 정보만 반환 (성공 기준 1·2) | pending |
| 5 | 관리 화면 | `<origin>/studio/settings/mcp-connections` | 연결 카드·마지막 사용 시각(성공 기준 3), 빈 상태, 복사 성공/실패 | pending |
| 6 | 해제 후 차단 | 관리 화면에서 해제 → Claude에서 같은 연결로 `whoami` 재호출 | 호출 실패/재연결 요구 (성공 기준 4). 해제 다이얼로그·해제 후 포커스 이동 확인 | pending |
| 7 | 동의 화면 상태 | 시크릿 창 `<origin>/oauth/consent?authorization_id=x` / 로그인 창에서 같은 URL / `$env:MINT_ROLE="reader"`로 독자 계정 쿠키 후 접근 | 비로그인: 중립 문구(확정 후 UI-SPEC 갱신), 만료 ID: 오류 상태, 독자: 작가 전용 안내 | pending |
| 8 | 반응형·접근성 | 375px 폭, Tab/Shift+Tab/Esc, 스크린리더 status/alert | 가로 스크롤 없음, 버튼 전폭, 포커스 순서·Esc 정상 | pending |
| 9 | refresh token | 연결 약 1시간 후 `whoami` 재호출 | 갱신 후 성공 (이월 미확인) | pending |
| 10 | 정리 | 터널·서버 종료, Site URL 복구, 테스트 계정(`ui-accept-*@novelscript.test`) 삭제(선택) | 공유 프로젝트 변경 0 | pending |

**Codex 한도로 못 끝낸 것:** 12-05 후반 수정은 Codex 한도 초과로 Claude가 폴백해 검증까지 마쳤다. `gpt-6.1-sol`은 이 계정에서 미지원이라 `.planning/model-routing/models.md` 갱신(사용자 승인 필요, 총괄 소관)만 남았다.

**병합 참고(총괄용):** master 최신 마이그레이션은 0036이라 0037·0038과 현재 번호 충돌은 없다. Phase 17이 새 마이그레이션을 추가하면 겹칠 수 있으니 병합 직전 `supabase/migrations` 번호를 재확인한다. 이 브랜치가 수정한 공용 파일은 `proxy.ts`, `next.config.ts`, `package.json`/lock, `lib/auth/redirect.ts`, `app/login/page.tsx`, `app/auth/callback/route.ts`, `app/studio/settings/ai-providers/page.tsx`이며 현재 master는 이 파일들을 바꾸지 않았다. 0037·0038은 일회용 DB에만 적용했고 공유 DB 적용은 병합 후 별도 승인 대상이다.

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

## Task 2 진행 기록 — 에이전트 수행분 (2026-11-01, 일회용 `anzafn…`, 프로덕션 빌드 3100 + 터널)

환경: `next start -p 3100`(포트 3199 미사용), `MCP_PUBLIC_ORIGIN`=터널 origin. 공유 프로젝트 `ymudwg…` 미접촉.

| 항목 | 결과 |
|---|---|
| S1 토큰 없는 `POST /mcp` | 401, `resource_metadata`가 터널 origin의 `/.well-known/oauth-protected-resource/mcp`를 가리킴 |
| S1 잘못된 Bearer | 401 (fail closed) |
| S2 PRM | `resource=<origin>/mcp`, `authorization_servers=[일회용 auth/v1]`, OPTIONS 200 |
| AS 메타데이터 | 일회용 프로젝트 issuer·authorize·token·jwks 노출 |
| 동의 화면 보안 헤더 | `frame-ancestors 'none'`, `X-Frame-Options: DENY` |
| 동의 화면 로그아웃 상태 | 200, 중립 문구 "먼저 로그인해 주세요. 로그인하면 이 화면으로 돌아와요." + "로그인하고 계속" 링크가 `/login?next=<동의 경로>` |
| 관리 화면 비로그인 | 307 `/login` |
| 외부 `next` 콜백 | `https://evil…`로 가지 않고 `/auth/auth-code-error`로 이동 |
| 유닛 `tests/mcp` | 77 passed |
| 토큰 기준 해제 후 차단 | Task 1 실DB 22건(`revoke-blocks`, `cross-user`)으로 이미 증명 |

관찰: `/auth/callback` 오류 리다이렉트가 터널 뒤에서 `https://localhost:3100/...`로 나간다(요청 origin 사용). 터널 환경 한정 증상일 수 있어 사람 확인 시 로그인 실패 경로에서 재확인.

사람이 꼭 해야 하는 항목(남음): Site URL 변경, 작가 세션 쿠키 심기, Claude 커넥터 등록·동의·whoami·해제·재호출 차단, 로그인 상태 동의 화면/관리 화면 렌더(세션 필요), 만료 ID, 독자 전용, 375px·키보드·포커스, refresh token 갱신.
