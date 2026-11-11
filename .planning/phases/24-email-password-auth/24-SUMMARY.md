---
phase: 24
status: code_complete
requirements: [AUTH-04, AUTH-05, AUTH-06, AUTH-07, AUTH-08]
files_modified:
  - lib/auth/email-password.ts
  - lib/auth/password-actions.ts
  - components/auth/EmailAuthForms.tsx
  - app/login/page.tsx
  - app/signup/page.tsx
  - app/auth/forgot-password/page.tsx
  - app/auth/reset-password/page.tsx
  - lib/chapters/actions.ts
  - supabase/migrations/0051_verified_account_gates.sql
  - tests/auth/email-password.test.ts
  - tests/auth/password-actions.test.ts
  - tests/chapters/publish-verification.test.ts
---

# Phase 24 요약: 이메일 가입·비밀번호 로그인 + 미인증 계정 제한

GSD plan 없이 사용자와의 대화로 범위를 확정해 구현했다(정식 phase로 사후 등록).

## 결정 (2026-11-11)
- 이메일 인증 메일 필수 · 비밀번호 재설정 포함 · 소셜과 같은 이메일은 자동 연결하지 않고 "이미 가입" 안내.
- 본인 확인 = 카카오·구글 연결 또는 번호 인증(이메일 인증은 별개). 번호 인증 화면은 Phase 25로 분리.
- 미인증 계정: 랭킹 입력 지표(조회·완독)를 새로 집계하지 않음(기존 누적 유지), 유료 회차 발행 불가. 무료 발행·초안·AI 작성은 허용.

## 구현
- 서버 액션 `signInWithPasswordAction` / `signUpWithPasswordAction` / `requestPasswordResetAction` / `updatePasswordAction`. 인증·재설정 링크는 기존 `/auth/callback` 재사용. 소프트 삭제 계정은 소셜 경로와 같은 정책.
- 0051: `user_is_verified`, `is_verified_account`, `increment_chapter_view`·`complete_chapter` 미인증 제외, `chapters` 유료 발행 트리거(`verification_required_for_paid`).

## 검증
- 단위 테스트(`tests/auth`, `tests/chapters/publish-verification.test.ts`), `tsc`, eslint 통과.
- 일회용 DB: 미인증/인증 로그인, `handle_new_user`(프로필·지갑), 유료 발행 차단·허용, 조회수 집계 제외를 스크립트로 확인.

## 남은 일
- 메일 가입·재설정의 end-to-end는 일회용 DB의 내장 SMTP 제한으로 미검증(커스텀 SMTP 필요).
- 0051은 공유 DB에 미적용(사용자가 직접). 적용하면 이메일 전용 기존 가입자는 즉시 미인증이 된다.
- Supabase 대시보드: Email provider 허용·Confirm email·Redirect URLs·SMTP.
- 번호 인증/소셜 연결 화면(Phase 25).
