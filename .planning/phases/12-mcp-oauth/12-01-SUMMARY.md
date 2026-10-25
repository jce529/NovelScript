---
phase: 12-mcp-oauth
plan: 01
status: draft
verdict: pending-human-approval
executed: 2026-10-25
requirements: [MCP-01, MCP-08]
---

# 12-01 스파이크 결과 (Supabase Auth OAuth 2.1 Server × Claude 커스텀 커넥터)

> **판정은 사람이 남긴다.** 이 문서는 관측 기록이며 합격/불합격 판정란은 사용자 승인 전까지 비어 있다. 12-02 이후는 이 문서에 사용자 합격 판정이 기록돼야 시작한다.

## 환경
- 일회용 Supabase 프로젝트(`.env.disposable`의 ref `anzafn…`, 공유 프로젝트 `ymudwg…`와 다름) + cloudflared quick tunnel + 로컬 Next dev(3101).
- 임시 키트: 브랜치 `spike/12-01-mcp-oauth`의 `spike-12/` (폐기 대상). 모든 값은 비밀·토큰 없이 기록했다.
- 클라이언트: claude.ai 커스텀 커넥터(DCR 경로). 테스트 계정은 사용자가 대시보드에서 직접 생성.

## 체크리스트 결과

| 항목 | 결과 | 증거(요약) |
|---|---|---|
| S1 | 합격 | 무토큰 `POST /mcp` → 401 + `WWW-Authenticate: Bearer … resource_metadata="https://<tunnel>/.well-known/oauth-protected-resource/mcp"` |
| S2 | 합격 | PRM `resource`=`https://<tunnel>/mcp`, `authorization_servers[0]`=`<supabase>/auth/v1` |
| S3 | 합격 | AS 메타데이터: `registration_endpoint`=`…/auth/v1/oauth/clients/register`, `S256`(+`plain`도 광고), 인증 방식에 `none`, `scopes_supported`=openid·profile·email·phone·offline_access, CIMD 필드 없음 |
| S4 | 합격 | DCR 자동 등록 성공(클라이언트명 `Claude`). `redirect_uri=https://claude.ai/api/mcp/auth_callback`. Claude가 **5개 scope 전부** 요청(`openid profile email phone offline_access`). `getAuthorizationDetails` 응답에 `resource` 없음 |
| S5 | 합격 | 동의 화면 도달 → 승인 → Claude 연결됨 |
| S6 | 부분 합격 | 토큰 클레임에 `client_id`·`session_id` 존재, `aud=authenticated`, 수명 3600초. **refresh 발급·갱신은 미확인**(수명 경과 후 호출 시험 필요) |
| S7 | 합격 | Claude 대화에서 whoami → 본인 userId·clientId |
| S8 | 합격 | `mcp_authorize_call`이 `auth.sessions`·`auth.oauth_consents` 조회 성공(`getuser` 대안 불필요) |
| S9 | 합격(변형 A·B) | 아래 참조 |
| S10 | 관찰 | 재인증마다 새 DCR 클라이언트 생성(`c34f989e…`→`508d85f9…`→`d9252a00…`), 매번 동의 화면 표시 |
| S11 | 관찰(노출 확인) | 아래 참조 |
| S12 | 관찰 | 아래 참조 |

### S9 해제 후 같은 토큰 차단
- 변형 A (`mcp_disconnect`만, 우리 행 `revoked_at`): 해제 전 200 → 해제 후 같은 토큰 **401**, `exp` 약 2114초 남음. 서버 판정 `rpc 0행`.
- 변형 B (`revokeGrant`만, Supabase 동의·세션 삭제): 해제 전 200 → 해제 후 같은 토큰 **401**, `exp` 약 3432초 남음. 서버 판정 `rpc 0행`(세션 검사 경로).
- 변형 C(`둘 다`): 미실행. 프로덕션 경로이며 12-03의 DB 테스트에서 검증한다.
- Claude 쪽: 해제 후 401을 받은 Claude가 OAuth를 처음부터 다시 돌려 새 DCR 클라이언트로 재연결했고 동의 화면이 다시 떴다. **같은 클라이언트 ID로 재연결해 동의 화면이 생략되는 막다른 길은 관측되지 않았다.**

### S11 OAuth 토큰의 Supabase REST 직접 접근 (revokeGrant 이후에도 같은 토큰)
상태 코드와 응답 크기만 기록(본문 미기록).
- `wallets` 200(행 있음), `profiles` 200(행 있음), `mcp_connections` 200(본인 행).
- `ledger_entries`·`orders`·`order_items`·`entitlements`·`payment_orders` 200(빈 배열: 테스트 계정에 행이 없을 뿐 접근은 허용됨).
- `byok_keys`·`byok_validation_log` 403(기존 권한으로 막힘).
- 결론: OAuth access token은 일반 사용자 JWT로 REST 전체에 닿는다. `revokeGrant` 후에도 JWT는 `exp`까지 Supabase REST에서 유효하다. → D-17(`client_id is null` RESTRICTIVE RLS)이 필요하다는 근거. 우리 RPC는 MCP 라우트만 막을 뿐 REST는 막지 못한다.

### S12 지연
- 서버 검증 지연(`rpc` 모드, getClaims + RPC): p50 약 190~216ms, p95 약 510~614ms, max 약 1.7초(표본 67, 실패 경로 포함). Claude 타임아웃(10초) 대비 여유가 있다. 토큰 재사용 부하 시험(`latency.mjs`)은 하지 않았다.

## 설계 입력 (12-02 이후에 반영)
1. `withMcpAuth`의 `resourceUrl`은 **origin**이다(`resource_metadata` = origin + path). PRM(`protectedResourceHandler`)의 `resourceUrl`은 **전체 MCP URL**이다. 혼동하면 챌린지의 `resource_metadata` URL이 틀어진다.
2. Next는 로컬 요청에도 `x-forwarded-*`를 붙인다. 프록시 여부 판정에 쓰지 말 것.
3. plpgsql `RETURNS TABLE` 출력 컬럼명이 본문의 컬럼 참조와 충돌한다(`user_id` 모호성 오류 → 전 호출 401). 출력명을 접두어로 구분하거나 `#variable_conflict`를 쓴다.
4. Claude는 재인증마다 새 DCR 클라이언트를 만든다. D-20(같은 작가·클라이언트 이름·호스트의 기존 연결 자동 해제)이 필수이고, 자동·수동 해제 모두 `revokeGrant`까지 호출해 Supabase 쪽 동의·세션을 정리한다.
5. Claude는 `scopes_supported` 전체(`profile`, `email`, `phone` 포함)를 요청한다. 실제 동의 화면에서는 이 OIDC scope를 우리 자체 scope(`읽기`/`초안 제안 저장`)와 구분해 설명해야 한다(UI-SPEC Open Item 후보).
6. 401 응답의 `error_description`이 토큰이 있어도 "No authorization provided"로 나온다(`mcp-handler` 기본 문구). 기능상 문제 없음.
7. `/mcp` 무토큰 요청 처리와 `required:true`는 의도대로 동작했다.
8. refresh token 발급·갱신은 이 스파이크에서 확인하지 못했다. 12-06 수동 게이트에서 수명 경과 후 호출로 확인한다.

## 판정 (사람 기록란)
- [ ] 합격 — 12-02 이후 진행
- [ ] 불합격 — D-03에 따라 재논의
- 사용자 판정/날짜: (미기록)

## 정리 상태
- 스파이크 키트 정리와 일회용 DB의 스파이크 객체(`mcp_connections`, `mcp_connect`, `mcp_disconnect`, `mcp_authorize_call`) 삭제는 판정 후 진행한다. 12-02의 0037 마이그레이션과 이름이 겹치므로 삭제 전에는 이 DB에 0037을 적용하지 않는다.
- 터널과 스파이크 서버는 실험 종료 때 종료한다.
