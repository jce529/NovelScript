# Phase 1: Foundation & Wallet Infrastructure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-25
**Phase:** 01-foundation-wallet-infrastructure
**Areas discussed:** 소셜 로그인 범위, 작가 전환(업그레이드) 플로우, 계정/세션 UX

---

## 소셜 로그인 범위 (Social Login Scope)

| Option | Description | Selected |
|--------|-------------|----------|
| 카카오 + 구글 둘 다 | 처음부터 둘 다 지원 | |
| 카카오만 먼저 | 한국 커뮤니티 베타에 가장 자연스러움 | |
| 구글만 먼저 | 구현이 가장 간단(표준 OAuth) | ✓ |

**User's choice:** 구글만 먼저
**Notes:** 카카오는 Phase 1 내에서 빠른 후속(fast-follow)으로 추가 — 별도 마일스톤/phase로 미루지 않음.

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 1 내 빠른 후속 | 구글 검증 후 같은 phase 내에서 카카오 provider 추가 | ✓ |
| v2/후순위 백로그 | 구글만으로 Phase 1 종료, 카카오는 별도 단계 | |

**User's choice:** Phase 1 내에서 빠른 후속(fast-follow)

| Option | Description | Selected |
|--------|-------------|----------|
| 이메일 필수 아님 | 온보딩 마찰 최소화 | |
| 이메일 필수 | 이메일 없으면 가입 차단/추가 입력 요구 | ✓ |

**User's choice:** 필수 — 이메일 없으면 가입 차단/추가 입력 요구

| Option | Description | Selected |
|--------|-------------|----------|
| 소셜 로그인만 (구글+카카오) | 요구사항(AUTH-01)과 일치, 구현 범위 축소 | ✓ |
| 소셜 + 이메일/비밀번호 둘 다 | 추가 구현 부담 발생 | |

**User's choice:** 소셜 로그인만 (구글+카카오)

---

## 작가 전환(업그레이드) 플로우 (Writer Upgrade Flow)

| Option | Description | Selected |
|--------|-------------|----------|
| 즉시 역할 전환, 추가 입력 없음 | 마찰 최소화 | |
| 최소 정보 수집 후 전환 (필명 등) | 도메인 요구사항 반영 | (custom) |

**User's choice (free text):** 첫 전환시에만 필명은 필수 필드로 전달받고, 간단한 소개글을 선택 필드로 전달받음

| Option | Description | Selected |
|--------|-------------|----------|
| 예, 중복 불가 (유니크) | URL/식별자로 쓰기 편리, 중복 검사 로직 필요 | ✓ |
| 아니오, 중복 허용 | 단순 표시용 네임 | |

**User's choice:** 예, 중복 불가 (유니크)

| Option | Description | Selected |
|--------|-------------|----------|
| 예, 언제든지 수정 가능 (유니크 재검사) | | |
| Phase 1에서는 수정 불가 (이후 단계에서 추가) | 구현 범위 축소 | ✓ |

**User's choice:** Phase 1에서는 수정 불가 (이후 단계에서 추가)

---

## 계정/세션 UX (Account / Session UX)

| Option | Description | Selected |
|--------|-------------|----------|
| 로그인 상태 헤더 + 로그아웃만 | 최소 범위 | |
| + 간단한 계정 설정 페이지 | 프로필/닉네임 확인, 필명 확인, 계정 삭제 진입점 포함 | ✓ |

**User's choice:** + 간단한 계정 설정 페이지

| Option | Description | Selected |
|--------|-------------|----------|
| 예, 실제 계정 삭제(탈퇴) 기능 포함 | soft delete(deleted_at) 기반 계정 유효화 시킴 | ✓ |
| 아니오, Phase 1은 UI 진입점만 준비 (미구현) | 실제 삭제 로직은 후순위 | |

**User's choice:** 예, 실제 계정 삭제(탈퇴) 기능 포함

---

## Claude's Discretion

- 지갑 원장(wallet ledger) 검증 방식(자동화된 동시성 테스트 vs. 개발자용 UI 노출) — 논의되지 않음, Claude/researcher 판단에 위임.
- Auth 세션 관리 구현 방식(Supabase Auth vs NextAuth 등) — 기술 구현 세부사항으로 위임.
- 계정 삭제의 정확한 데이터 처리 범위(연관 레코드 처리 등) — soft-delete 원칙(docs/4 §4.4) 준수 하에 위임.

## Deferred Ideas

- 필명 수정 UI — 이후 단계(설정/마이페이지)로 이연.
