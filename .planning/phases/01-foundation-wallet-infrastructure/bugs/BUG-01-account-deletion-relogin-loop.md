---
id: BUG-01
title: 탈퇴 후 같은 소셜 계정으로 재로그인하면 로그인 화면 무한 반복
status: open
severity: high
found: 2026-10-09
found_during: Phase 11 브라우저 UAT 중 새작가 계정 BYOK 키 확인하다가 계정 탈퇴를 눌러 발견
origin_phase: 01 (01-05 `e478cbb` 계정 설정/탈퇴, D-08 soft delete 정책)
files:
  - app/account/page.tsx
  - app/account/actions.ts
  - lib/auth/account.ts
  - app/auth/callback/route.ts
  - app/studio/settings/ai-providers/page.tsx
  - lib/ai/providers/byok.ts
---

# BUG-01: 탈퇴 후 같은 소셜 계정으로 재로그인하면 로그인 화면 무한 반복

## 증상
1. 계정 설정에서 "계정 탈퇴하기"를 누르면 확인 없이 즉시 탈퇴되고 `/login`으로 이동한다.
2. 같은 소셜 계정으로 다시 로그인하면 로그인은 성공하는 것처럼 보인다(탈퇴한 계정으로 세션이 만들어진다).
3. 설정 등 보호 페이지로 이동하면 다시 `/login`으로 튕긴다. 이후 몇 번을 로그인해도 반복되고, 새 계정으로 가입할 방법이 없다.

## 재현
1. 작가 계정으로 로그인 → `/account` → "계정 탈퇴하기" 클릭(확인창 없음).
2. `/login`에서 같은 Google 계정으로 로그인.
3. `/studio/settings/ai-providers` 이동 → `/login`으로 리다이렉트, 반복.

DB 증거(2026-10-09 원격): `새작가`(changeun34@gmail.com) 프로필 `deleted_at=02:21:16`, auth `last_sign_in_at=02:23:23`(탈퇴 2분 뒤 재로그인 성공), auth 사용자는 삭제되지 않음. 같은 상태의 테스트 계정 12개(`삭제테스트`)도 `deleted_at`만 찍히고 auth 사용자가 남아 있다.

## 기대 / 실제
- 기대: 탈퇴 전에 의사를 다시 확인하고, 탈퇴가 끝까지 안정적으로 처리된다. 같은 소셜 계정으로 다시 로그인하면 **새 계정으로 가입**된다(확정 정책 A).
- 실제: 탈퇴는 `profiles.deleted_at`만 찍는 soft delete다. auth 사용자와 소셜 연결(identity)이 그대로라 재로그인하면 같은 user id로 세션이 만들어지고, 모든 보호 경로가 `isAccountActive`로 로그아웃시켜 `/login`으로 보낸다. 로그인 → 차단 → 로그인이 반복된다.

## 원인
- `lib/auth/account.ts` `softDeleteAccount`는 `profiles.deleted_at`과 `pen_name_bio`만 갱신한다. 주석대로 사용자 id 기준 전체 세션 무효화도 하지 않고, auth 사용자도 건드리지 않는다("v1에서는 불가"로 판단해 `isAccountActive` 게이트에만 의존).
- `app/auth/callback/route.ts`는 `exchangeCodeForSession` 직후 `deleted_at`을 확인하지 않고 로그인 성공으로 처리한다.
- `handle_new_user` 트리거는 `on conflict (id) do nothing`이라 같은 id로는 프로필이 새로 만들어지지 않는다(트리거는 신규 auth 사용자일 때만 의미가 있다).
- 사용자 입장에서 되돌릴 수 없는 탈퇴 버튼에 확인 단계가 없다(`app/account/page.tsx`의 단순 `<form action>`).
- 부수 문제: 탈퇴 시 BYOK 키(`byok_keys`와 Vault 시크릿)와 필명이 남는다. `byok_keys`는 `profiles` 삭제 시에만 cascade되고 soft delete에서는 유지된다(보안상 위험).
- FK 제약: `works`, `orders`, `kb_nodes`, `entitlements` 등 다수가 `profiles(id)`를 `no action`으로 참조하므로 auth 사용자/프로필을 hard delete하면 작품이 있는 작가는 실패한다(D-08 append-only 원칙과도 충돌).

## 수정 방향 (정책 확정: 재로그인 시 새 계정 가입 + BYOK 키·개인정보만 삭제)
1. **확인 모달**: 탈퇴 버튼을 클라이언트 확인 모달로 바꾼다. "정말 탈퇴할까요?" + 되돌릴 수 없음, 삭제되는 것(필명·소개·BYOK 키)과 남는 것(결제·원장 기록) 안내, 취소 버튼에 초기 포커스, "탈퇴하기" 명시 클릭 시에만 서버 액션 실행. 처리 중 중복 제출 방지, 실패 시 오류 문구 표시.
2. **탈퇴 처리를 순서 있게·재시도 가능하게 구성** (`softDeleteAccount` 확장 또는 새 함수):
   - (a) BYOK 키 삭제(Vault 시크릿 포함, 기존 `deleteByokKey` 경로 재사용), `byok_validation_log` 정리
   - (b) `profiles`: `deleted_at` 기록, `pen_name`·`pen_name_bio`·기타 개인정보 비움(필명 unique index와 충돌하지 않게 처리)
   - (c) auth 사용자 **soft delete**: `admin.auth.admin.deleteUser(userId, true)` — auth 행은 남아 FK를 유지하되 이메일·identity가 제거되어(익명화) 같은 소셜 계정의 다음 로그인이 **새 auth 사용자 → 새 profiles/wallets**로 가입된다. 설치된 `@supabase/auth-js` 타입에 `shouldSoftDelete`가 있음을 확인했다. **구현 전 실제 Supabase 프로젝트에서 identity 제거와 재가입 동작을 먼저 검증**하고, 안 되면 `auth.identities` 정리 등 대안을 이 문서에 기록한다.
   - (d) 현재 세션 `signOut()` 후 `/login`으로 이동
   - 중간 실패 시 일부만 처리된 상태가 남지 않도록 단계별 오류를 잡아 사용자에게 알리고, 같은 요청을 다시 눌러도 이어서 끝나도록(멱등) 한다.
3. **안전망**: `/auth/callback`에서 세션 교환 직후 프로필이 `deleted_at`이면 즉시 `signOut`하고 안내 문구와 함께 `/login`으로 보낸다(이미 탈퇴됐지만 auth가 남아 있는 기존 계정이 무한 루프에 빠지지 않게). `?error=` 안내 노출.
4. **기존 잔여 계정 정리**: `deleted_at`이 찍힌 채 auth 사용자가 살아 있는 계정(새작가 포함, 테스트 계정 12개)을 같은 로직으로 마저 탈퇴 처리하는 일회성 스크립트 또는 마이그레이션. 실제 계정(새작가)은 스크립트 실행 전 사용자 확인.
5. 문서/테스트 갱신: D-08 주석과 `tests/auth/account-deletion.test.ts`를 새 동작(auth soft delete, BYOK 삭제, 재가입 가능)에 맞춘다.

## 검증
- 단위: 탈퇴 액션이 BYOK 삭제 → 프로필 비움 → auth soft delete → signOut 순으로 실행, 중간 실패 시 오류 반환 후 재시도 가능, 이미 `deleted_at`인 계정 재실행이 오류 없이 끝남.
- 단위/컴포넌트: 확인 모달이 취소 시 서버 액션을 호출하지 않고, 확인 시 한 번만 호출.
- callback: 탈퇴 프로필이면 세션 폐기 후 `/login` 리다이렉트.
- 실제 환경(테스트 계정): 탈퇴 → 같은 계정 재로그인 → 새 프로필·지갑(잔액 0)으로 가입, 이전 작품·원장 접근 불가, 루프 없음, `byok_keys` 0행, 필명 비어 있음.

## 적용한 수정 (2026-10-09, `/bug-execute`)
- **사전 검증**: 테스트 계정으로 `admin.auth.admin.deleteUser(id, true)`를 확인했다. 이메일은 해시로 익명화되어 같은 이메일로 재가입이 되지만 **`auth.identities`는 남는다**. OAuth는 identity로 사용자를 찾으므로 identity를 따로 정리해야 해서 계획서의 전제를 보강했다.
- `supabase/migrations/0022_account_deletion_purge.sql` (원격 DB에 적용됨): `purge_account_data(p_owner)` — BYOK 시크릿(Vault)·키·검증 로그 삭제, 필명·소개·`pen_name_set_at` 비움, `default_key_source='service'`, `deleted_at`은 `coalesce`로 최초 시각 유지, `auth.identities` 삭제. 멱등, service_role 전용.
- `lib/auth/account.ts` `softDeleteAccount`: `purge_account_data` → `deleteUser(id, true)` 순서. 오류는 던지고(이미 soft delete된 사용자는 무시) 재시도하면 이어서 끝난다.
- `app/account/actions.ts`: 결과 객체(`{ok, message}`)를 반환하도록 변경. 실패 시 세션을 유지해 같은 버튼으로 재시도 가능.
- `app/account/DeleteAccountButton.tsx`(신규) + `page.tsx`: 확인 모달("정말 탈퇴할까요?", 되돌릴 수 없음·삭제/보존 항목 안내, 취소에 초기 포커스, 처리 중 중복 클릭·닫기 방지, 실패 문구).
- `app/auth/callback/route.ts`: 탈퇴 표시만 된 기존 계정이 로그인하면 그 자리에서 탈퇴를 마무리하고 세션을 버린 뒤 `/login?error=account_deleted`로 보낸다(다음 로그인부터 새 계정). `app/login/page.tsx`에 안내 문구.
- 계획서의 "기존 잔여 계정 일회성 정리"는 위 callback 자가 치유로 대체했다(별도 스크립트 불필요). 로그인하지 않는 기존 테스트 계정 12개는 그대로 남지만 접근 경로가 없다.
- 테스트: `tests/auth/account-deletion.test.ts`(DB, 5건 — 개인정보·BYOK·identity 정리, 지갑/원장 보존, 같은 이메일 재가입, 멱등, 레거시 반쯤 삭제 계정 마무리, 프로필 없음 시 실패), `tests/auth/account-deletion-ui.test.ts`(모달 문구·초기 포커스·액션 미호출, callback 3경로).
- 검증: tests/auth 25건, sanctions.database·byok-db 25건 통과, `tsc --noEmit`·eslint 클린.
- **남은 확인(브라우저/실계정)**: 실제 Google 로그인으로 (1) 모달 표시·취소·탈퇴 진행, (2) 탈퇴 후 재로그인 시 새 계정으로 가입되는지. Google identity 동작은 테스트 계정으로 흉내낼 수 없어 실계정 확인이 필요하다.
