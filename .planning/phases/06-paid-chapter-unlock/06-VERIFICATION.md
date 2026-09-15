---
phase: 06-paid-chapter-unlock
verified: 2026-09-15
status: gaps_found
score: 0/3 phase success criteria fully verified
gaps:
  - truth: "Purchased tokens unlock a chapter for immediate reading"
    status: partial
    reason: "Source wiring exists; real top-up and DB/browser E2E not verified"
    missing:
      - "Phase 5 integration and runtime evidence"
  - truth: "Atomic purchase does not double-charge under concurrency"
    status: unverified
    reason: "SQL and constraints exist; database tests not run"
    missing:
      - "SQL/RLS and independent-session concurrency evidence"
  - truth: "Author receives the provisional 90 percent share"
    status: failed
    reason: "Author settlement not implemented; retained as roadmap work"
    missing:
      - "Author credit, fee distribution and single rate adjustment point"
---

# Phase 6: Paid Chapter Unlock Verification Report

**Phase Goal:** 구매 토큰으로 회차 소장, 원자적 차감·권한 부여, 작가 정산.
**Status:** gaps_found
**Scope:** 최신 코드 기준 문서 감사. gsd-verifier 에이전트 실행 보고나 새 DB 검증 결과가 아니다.

## Goal Achievement

### Observable Truths
| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | 토큰 구매 → 권한 → 본문 표시 | PARTIAL | 구매 버튼·서비스·본문 RPC 연결 존재. 실충전/DB/E2E 미검증 |
| 2 | 원자적 차감·중복 방지 | UNVERIFIED | 단일 SQL 함수와 UNIQUE 존재. 실제 동시성 증거 없음 |
| 3 | 작가 90% / 플랫폼 10% | FAILED | 작가 credit·분배 snapshot·조정점 없음. 로드맵 구현 예정 |

0/3은 코드가 없다는 뜻이 아니라 phase 전체 완료 기준의 실행 증거가 부족하다는 뜻이다.

### Required Artifacts
| Artifact | Status | Details |
|---|---|---|
| supabase/migrations/0005_commerce.sql | EXISTS + SUBSTANTIVE | 거래/권한 테이블, RPC, grants |
| lib/commerce/actions.ts | EXISTS + SUBSTANTIVE | 생성·결제 래퍼, Zod |
| lib/access/actions.ts | EXISTS + SUBSTANTIVE | 세션 권한·본문 |
| lib/chapters/actions.ts | WIRED IN SOURCE | 본문/목차 연결 |
| components/reader/viewer-shell.tsx | WIRED IN SOURCE | 소장 버튼·오류·refresh |
| tests/commerce/actions.test.ts | EXISTS | 기존 11개 통과 기록 |
| tests/commerce/database.test.ts | EXISTS / NOT EXECUTED | 10개, 환경 없으면 skip |

### Key Link Verification
| From | To | Via | Status |
|---|---|---|---|
| ViewerShell | purchaseChapterAction | Server Action | 소스 확인 |
| purchaseChapterAction | create/pay_purchase_order | commerce service | 소스 확인 |
| pay_purchase_order | ledger/PAID/entitlements | 단일 함수 | 소스 확인, DB 미검증 |
| getPublicChapter | read_chapter_content | RPC | 소스 확인 |
| pay_purchase_order | author wallet | 없음 | 미구현 |
| 구매 | 실제 토큰 충전 | Phase 5 | 미연결 |

## Requirements Coverage
PAY-02: PARTIAL, 체크박스 미완료 유지.
새 구매·권한 구조의 존재와 작가 정산까지 포함하는 PAY-02의 전체 충족을 구분한다.

## Validation Evidence
docs/commerce-entitlements.md의 기존 실행: 총 26개 통과(commerce 11 + 회귀 15), DB 10개 미실행.
TypeScript·변경 파일 ESLint 통과 기록. 컴파일 이후 /login 환경변수 오류로 전체 빌드 실패.
이번 문서 정리에서는 테스트·migration·실제 결제를 재실행하지 않았다.

## Historical UX Differences
현재 구현은 구매 버튼과 router.refresh를 사용한다.
이전 확인 모달·목록 구매·로그인/충전 복귀 논의는 06-DISCUSSION-LOG.md에 보존한다.
이번에는 최신 버전을 기준으로 기록하며 이 차이를 해소하는 새 실행 계획을 만들지 않는다.

## Human Verification Required
- 테스트 DB에서 migration과 SQL/RLS 실행. 기존 미실행 선택 유지.
- 별도 연결의 동시 구매, 실패 rollback, 멱등성 검증.
- 현재 구매 UI에서 소장·재열람·잔액 부족·로그인 안내·작가 편집 확인.
- Phase 5가 구현되면 검증된 충전 후 전체 구매 흐름 확인.

## Gaps Summary
- 작가 정산: 미구현, ROADMAP Phase 6에 남겨 둠.
- DB/동시성/E2E: 증거 필요, 미실행을 성공으로 처리하지 않음.
- 실충전: Phase 5 의존.
