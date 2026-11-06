---
phase: 12-mcp-oauth
type: uat
status: partial
verdict: 자동·실DB·공개 경로 합격 / 로그인 후 화면·Claude 실왕복 미확인
checked: 2026-11-01
requirements: [MCP-01, MCP-08]
---

# Phase 12 유저 검증 (UAT)

> 판정 칸: PASS / partial / blocked / pending / FAIL. PASS는 이번 세션에서 직접 확인하거나 기록(12-06 Task 1 실행 기록)으로 확인한 항목만 쓴다.
> 토큰·비밀·`authorization_id` 원문은 기록하지 않는다.

## 환경

- 검증 코드: 브랜치 없이 detached worktree `.claude/worktrees/phase-12-uat` (HEAD `fca88c6`). 공유 체크아웃의 `.next` 락을 피하려고 따로 만들었다.
- 서버: `next dev -p 3001` (worktree 안, `.env.disposable` 로드, `MCP_PUBLIC_ORIGIN=http://localhost:3001`).
- DB: 일회용 Supabase `anzafn…`만 사용. 공유 프로젝트 `ymudwg…`는 접근·쓰기 없음. 이 세션은 DB에 쓰기 명령을 실행하지 않았다.
- 실제 Claude 커넥터는 localhost를 호출할 수 없어 이 세션에서 실행하지 않았다(터널 필요).

## 1. 자동 검증

| ID | 항목 | 판정 | 근거 |
|---|---|---|---|
| A-1 | `tests/mcp` 단위 테스트 (unit 프로젝트) | PASS | 이번 세션 실행: 6 files, 77 tests passed (`--pool=threads`, Windows Vite fork 제약 우회) |
| A-2 | 실DB suite (`tests/mcp --project db`, 일회용 DB) | PASS | 12-06 Task 1 실행 기록(2026-10-25): 4 files, 22 passed, skipped 0, 실패 0. 이 세션에서 재실행하지 않음 |
| A-3 | 해제 후 같은 토큰 차단 (변형 A·B·C), DB 장애 fail closed | PASS | A-2의 `revoke-blocks.database.test.ts` 4건 |
| A-4 | 교차 사용자 차단 (B 토큰 → A 행, client X 토큰 → Y grant) | PASS | A-2의 `cross-user.database.test.ts` 9건 |
| A-5 | 민감 테이블 OAuth REST 차단 (RESTRICTIVE RLS, D-17) | PASS | A-2의 `sensitive-rls.database.test.ts` 3건 |
| A-6 | `last_used_at` 60초 스로틀, 재연결 시 이전 연결 해제(D-20) | PASS | A-2의 `grants.database.test.ts` 6건 |

## 2. 공개 경로 (로그인 없이 확인)

| ID | 항목 | 기대 | 판정 | 근거 |
|---|---|---|---|---|
| P-1 | `POST /mcp` 무토큰 | 401 + `resource_metadata`가 `<origin>/.well-known/oauth-protected-resource/mcp` | PASS | curl: 401, `www-authenticate: Bearer … resource_metadata="http://localhost:3001/.well-known/oauth-protected-resource/mcp"` |
| P-2 | `POST /mcp` 잘못된 bearer | 401 (fail closed) | PASS | curl `Bearer abc.def.ghi` → 401 |
| P-3 | PRM 본문·OPTIONS | `resource=<origin>/mcp`, `authorization_servers=[일회용 auth/v1]`, OPTIONS 200 | PASS | GET 본문: `{"resource":"http://localhost:3001/mcp","authorization_servers":["https://anzafn…supabase.co/auth/v1"]}`, OPTIONS 200 |
| P-4 | 동의 화면 보안 헤더 (클릭재킹) | `frame-ancestors 'none'`, `X-Frame-Options: DENY` | PASS | curl `/oauth/consent?authorization_id=…` 응답 헤더 |
| P-5 | 동의 화면, 비로그인 + 요청 ID 있음 | 중립 문구 "로그인이 필요해요", 로그인 링크가 `/login?next=<동의 경로>` | PASS | 브라우저 `get_page_text`; 링크 `/login?next=%2Foauth%2Fconsent%3Fauthorization_id%3D…` |
| P-6 | 동의 화면, 요청 ID 없음 | "연결 요청을 찾을 수 없어요" + 홈 링크 | PASS | 브라우저 `get_page_text` (`/oauth/consent`) |
| P-7 | 관리 화면 비로그인 접근 | `/login`으로 이동 | PASS | curl `/studio/settings/mcp-connections` → 307 `location: /login` |
| P-8 | 로그인 페이지 `next` 전달 | Google/카카오 버튼 노출 | partial | 페이지 렌더 확인. 소셜 로그인 왕복은 이 세션에서 불가(실제 계정 필요) |
| P-9 | 375px 동의 화면 (비로그인) | 가로 스크롤 없음, 버튼 전폭 가능 | PASS | 375×812 에뮬레이션: scrollWidth 375 = clientWidth 375. 스크린샷으로 카드·CTA 확인 |
| P-10 | 콘솔 에러 (동의 화면) | 없음 | PASS | `read_console_messages` onlyErrors: 0건 |

## 3. 로그인 후 화면 (작가 세션 필요)

이 세션에는 테스트 로그인 수단이 없다. 로그인은 Google·카카오뿐이고, 12-06 Task 2의 쿠키 심기(`mint-writer-session`)는 저장소에 없다. 아래는 확인하지 못했다.

| ID | 항목 | 판정 | 비고 |
|---|---|---|---|
| L-1 | 동의 화면 정상 (클라이언트명·호스트·승인/거부) | blocked | 작가 세션 + 유효한 `authorization_id` 필요 |
| L-2 | 독자 전용 계정 거절 안내 | blocked | 독자 세션 필요 |
| L-3 | 만료·이미 처리된 ID (로그인 상태) | blocked | 로그인 후에만 조회가 일어남 (UI-SPEC 판정 순서) |
| L-4 | 허용 외 호스트 | blocked | 연결 요청 필요 |
| L-5 | 관리 화면: 연결 카드, 마지막 사용, 빈 상태 | blocked | 작가 세션 필요 |
| L-6 | 해제 다이얼로그 (취소 포커스, Esc, 해제 후 포커스 이동) | blocked | 연결 1개 이상 필요 |
| L-7 | 주소 복사 성공·실패 | blocked | 작가 세션 필요 |
| L-8 | 키보드 전체 포커스 순서, status/alert 읽기 | pending | 데스크톱 키보드 확인 미실시 |

## 4. Claude 커넥터 실왕복 (사람 확인 필요)

| ID | 항목 | 판정 | 비고 |
|---|---|---|---|
| C-1 | Claude 커스텀 커넥터 등록 → 동의 → 연결 | pending | 공개 터널 origin + `MCP_PUBLIC_ORIGIN` 재기동 필요. `localhost:3001`로는 Claude가 접근 불가 |
| C-2 | 연결 후 `whoami`가 본인 정보만 반환 | pending | 작가 계정 필요 |
| C-3 | 해제 후 같은 연결의 다음 호출 차단 (D-12, 실제 Claude 호출) | pending | DB 수준 차단은 A-3으로 확인됨. 실제 호출은 미확인 |
| C-4 | refresh token 발급·갱신 (수명 경과 후 호출) | pending | 12-01 S6 이월 항목 |
| C-5 | 이미 동의된 요청이 화면 없이 리다이렉트될 때 연결 행 일치 | pending | 12-04 Open Item |
| C-6 | 해제 `partial` 이후 `revokeGrant` 재정리 경로 | pending | 12-05 Open Item (보안 영향 낮음, 후속 검토) |

## 5. 알려진 이슈·후속 (코드 수정 없이 기록만)

- `/auth/callback` 오류 리다이렉트가 터널 뒤에서 `https://localhost:3100/...`로 나갔다(12-06 Task 2 기록). 요청 origin을 쓰는 것으로 보인다. 터널 환경에서 로그인 실패 경로를 다시 확인한다.
- 12-02 D-17: 민감 테이블 외 `public` 전체 테이블의 OAuth 제한은 Phase 13 착수 전 필수다. Phase 12 범위 밖이므로 UAT 실패로 보지 않는다.
- 12-05: `partial` 해제 후 UI가 카드를 제거하므로 재시도 경로가 없다(C-6).

## 6. 요약

- 합격: 자동 테스트 전부(A-1~A-6), 공개 경로 P-1~P-7·P-9·P-10. 동의 화면 보안 헤더와 375px 레이아웃 확인.
- partial: P-8 (소셜 로그인 왕복 미실행).
- 미확인: 로그인 후 화면 L-1~L-8 전부, Claude 실왕복 C-1~C-6 전부.
- 서버: `localhost:3001`은 검증 후에도 실행 중이다. 종료하려면 해당 백그라운드 프로세스를 중지한다. worktree `.claude/worktrees/phase-12-uat`는 검증 후 `git worktree remove`로 정리할 수 있다.
- 커밋·push 없음. STATE/ROADMAP 갱신 없음 (Phase 12 완료 판정은 사용자 판정 후 총괄이 기록).
