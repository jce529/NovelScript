---
phase: 01-foundation-wallet-infrastructure
verified: 2026-08-28T00:00:00Z
documented: 2026-10-04
status: passed
score: 3/3 success criteria verified (자동 테스트 + 실DB + OAuth 브라우저 왕복)
residual:
  - item: "새로고침·재방문 시 세션 유지의 브라우저 직접 관찰 기록"
    status: "문서에 기록 없음 — proxy.ts의 매 요청 세션 갱신(getClaims)과 matcher는 자동 테스트로 증명됨"
  - item: "글쓰기 시작하기(작가 전환) 화면의 브라우저 관찰 기록"
    status: "문서에 기록 없음 — 필명 유일성 동시성·소프트 삭제는 실DB 테스트로 증명됨"
  - item: "01-VALIDATION.md frontmatter status가 planned로 남아 있음"
    status: "실행 후 갱신 누락. 내용은 이 문서와 SUMMARY가 대체"
source: "01-01~01-05-SUMMARY.md와 01-VALIDATION.md를 근거로 2026-10-04에 정리했다. 이 정리 시점에 테스트를 다시 실행하지는 않았다."
---

# Phase 1 검증 보고서

**목표:** 사용자가 계정을 만들고 접근할 수 있고, 토큰 지갑 원장 로직이 가짜 크레딧으로 동시성 하에서 정확함이 증명된다 — AI 비용이나 실결제 코드가 생기기 전에.
**상태:** passed. 기록상 갭은 없고, 브라우저 관찰 기록이 빠진 2건은 residual에 적었다.

## 검증 근거
| 영역 | 근거 |
|---|---|
| 환경·테스트 러너 (01-01) | 실제 Supabase 프로젝트에 Google·Kakao 제공자 활성, 세션 풀러 Postgres 연결, Vitest 설치 (2026-08-26) |
| 지갑 원장 (01-02) | `apply_wallet_delta`: 동시 100건 연산에서 갱신 손실 없음, 같은 키 재전송 멱등, 지갑별 격리, 음수 잔액 거부. 세션 풀러 한도(15) 때문에 `pgPool` max를 5로 낮춤 |
| 세션 갱신 (01-03) | 루트 `proxy.ts`가 매 비정적 요청에서 `auth.getClaims()`로 세션 갱신 (`middleware.ts` 없음). matcher와 getClaims 호출을 `tests/auth/session-refresh.test.ts`로 증명, tsc·전체 테스트 통과 |
| 로그인·콜백 (01-04) | email-guard 5케이스, 로그인/콜백/에러/이메일 보완 페이지. 2026-08-28 **브라우저 OAuth 왕복 확인**: Google·Kakao 모두 인증 상태 도달, `auth.users`·`profiles`(reader)·`wallets`(0) 자동 생성, code 없는 콜백이 `/auth/auth-code-error`로 안전하게 이동(크래시·무한 리다이렉트 없음) |
| 작가 전환·탈퇴 (01-05) | 필명 유일성: 대소문자 다른 같은 필명을 서로 다른 두 사용자가 `Promise.all`로 제출해 정확히 1건만 성공(DB 제약 기반). `softDeleteAccount`: `deleted_at` 설정, 소개 null, 지갑 잔액·원장 불변(실제 원장 항목이 있는 지갑으로 검증). `isAccountActive`를 `/account`에 연결해 탈퇴 계정은 다음 로드에 로그아웃·`/login` 이동 |

회차 시점 전체 테스트: 21/21 통과(01-05 기준), `npx tsc --noEmit` 통과.

## Success Criteria
| # | 기준 | 상태 | 근거 |
|---|---|---|---|
| 1 | Kakao 또는 Google 소셜 로그인으로 가입·로그인 | VERIFIED | 01-04 브라우저 OAuth 왕복(둘 다), DB 행 자동 생성 확인 |
| 2 | 한 계정이 독자·작가 역할을 겸하고 "글쓰기 시작하기"로 같은 계정을 전환 | VERIFIED (테스트) | 01-05 동시성·무결성 테스트. 브라우저 관찰 기록은 없음 (residual) |
| 3 | 새로고침·재방문에도 세션 유지 | VERIFIED (테스트) | `proxy.ts` 세션 갱신 + matcher 테스트. 브라우저 직접 관찰 기록은 없음 (residual) |

## 요구사항
AUTH-01, AUTH-02, AUTH-03: 충족.

## 실행 중 발견·해결된 이슈
- **Kakao KOE205:** Supabase Kakao 제공자는 `account_email profile_image profile_nickname`을 고정 세트로 요청하는데 콘솔에는 `account_email`만 켜져 있었다. 세 동의 항목을 모두 켜서 해결(2026-08-28). 운영용 별도 Kakao 앱에도 같은 설정이 필요하다.
- **풀러 한도:** 세션 풀러 하드 캡 15 때문에 테스트 풀 크기를 5로 조정.

## 알려진 한계
- 지갑 크레딧 지급 UI는 의도적으로 없다 (01-CONTEXT: 동시성 증명은 자동 테스트가 `apply_wallet_delta`를 직접 호출).
- 소프트 삭제 계정 차단은 `/account`에만 연결돼 있다 (전역 라우트 게이트 없음, STATE.md Phase 01 결정 기록).
- Kakao Biz App `account_email` 승인 여부는 외부 심사라 API로 확인할 수 없다 (01-VALIDATION 수동 항목). 미승인이면 D-02 이메일 직접 입력 폴백이 동작한다.
