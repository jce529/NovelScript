---
phase: 06-paid-chapter-unlock
verified: 2026-09-15
updated: 2026-10-12
status: gaps_found
score: 1/3 phase success criteria verified at DB level (browser E2E and independent-session concurrency pending); blueprint scope reopened 2026-10-12
gaps:
  - truth: "Purchased tokens unlock a chapter for immediate reading"
    status: partial
    reason: "Source wiring exists; real top-up and DB/browser E2E not verified"
    missing:
      - "Phase 5 integration and runtime evidence"
  - truth: "Atomic purchase does not double-charge under concurrency"
    status: partial
    reason: "2026-10-01 DB tests passed (idempotent retry, rollback); independent-session concurrent purchase evidence for Phase 6 itself is still missing (Phase 7 concurrency suite covers the purchase-vs-blind race only)"
    missing:
      - "Independent-session concurrent purchase evidence"
  - truth: "Author receives the provisional 90 percent share"
    status: partial
    reason: "Implemented in 0017_author_settlement.sql (settlement_author_rate_bps = 9000, distribution snapshot); DB tests passed 2026-10-01 (44 tests); browser E2E pending. The 2026-09-15 'not implemented' finding is superseded."
    missing:
      - "Browser E2E, live DB re-run"
  - truth: "Blueprint payment model (2026-10-12): 소장/대여 선택, 대여 기간, 정주행 자동 결제, 소장함, 정산·수익 화면"
    status: failed
    reason: "Only permanent purchase is implemented (06-CONTEXT D: 대여 deferred). entitlements.expires_at and can_view already support time limits, so no schema change is required; grant logic and UI are missing."
    missing:
      - "소장/대여 선택 팝업, 대여 기간 부여·만료, 정주행 자동 결제, 소장함, 작가 정산·수익 화면 — see .planning/gaps/2026-10-12-blueprint-reconcile.md (Phase 6)"
---

# Phase 6: Paid Chapter Unlock Verification Report

**Phase Goal:** 구매 토큰으로 회차 소장, 원자적 차감·권한 부여, 작가 정산.
**Status:** gaps_found (2026-10-12 갱신: 작가 정산 구현 반영, 청사진 갭으로 phase 재개)
**Scope:** 최신 코드 기준 문서 감사. gsd-verifier 에이전트 실행 보고나 새 DB 검증 결과가 아니다.

## Goal Achievement

### Observable Truths
| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | 토큰 구매 → 권한 → 본문 표시 | PARTIAL | 구매 버튼·서비스·본문 RPC 연결 존재. 실충전/DB/E2E 미검증 |
| 2 | 원자적 차감·중복 방지 | PARTIAL (2026-10-12 갱신) | 단일 SQL 함수·UNIQUE, 2026-10-01 DB 테스트로 멱등 재시도·롤백 확인. 독립 세션 동시 구매 증거는 아직 없음 |
| 3 | 작가 90% / 플랫폼 10% | PARTIAL (2026-10-12 갱신) | 0017_author_settlement.sql 구현, 2026-10-01 DB 테스트 44개 통과. 브라우저 E2E 미검증. (2026-09-15의 FAILED 판정은 이후 구현으로 대체됨) |

0/3은 코드가 없다는 뜻이 아니라 phase 전체 완료 기준의 실행 증거가 부족하다는 뜻이었다(2026-09-15 기준). 2026-10-01 DB 검증 이후 1·2·3 모두 PARTIAL이며 브라우저 E2E와 독립 세션 동시성이 남아 있다.

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
| pay_purchase_order | author wallet | apply_wallet_delta (0017) | 구현됨, DB 테스트 통과(2026-10-01), E2E 미검증 |
| 구매 | 실제 토큰 충전 | Phase 5 | 미연결 |

## Requirements Coverage
PAY-02: PARTIAL. 2026-10-12 청사진 재판정으로 REQUIREMENTS 체크박스 해제·Phase 6 Reopened(청사진 결제 모델 갭).
새 구매·권한 구조의 존재와 작가 정산까지 포함하는 PAY-02의 전체 충족을 구분한다.

## Validation Evidence
docs/commerce-entitlements.md의 기존 실행: 총 26개 통과(commerce 11 + 회귀 15), DB 10개 미실행.
TypeScript·변경 파일 ESLint 통과 기록. 컴파일 이후 /login 환경변수 오류로 전체 빌드 실패.
이번 문서 정리에서는 테스트·migration·실제 결제를 재실행하지 않았다.

## Historical UX Differences
현재 구현은 구매 버튼과 router.refresh를 사용한다.
이전 확인 모달·목록 구매·로그인/충전 복귀 논의는 06-DISCUSSION-LOG.md에 보존한다.
이번에는 최신 버전을 기준으로 기록하며 이 차이를 해소하는 새 실행 계획을 만들지 않는다.

## DB Verification Update (2026-10-01)
0017_author_settlement.sql·0016_payments.sql을 테스트 DB에 적용하고 `tests/commerce`·`tests/payments` 7파일 44개 통과(skip 0). 작가 90/10 분배·스냅샷, 반올림, 작가별 1회 정산, 재시도 멱등, 잔액 부족 시 무정산, 롤백, 교차 사용자 거부 확인. 독립 세션 동시 구매와 브라우저 E2E는 아직 미검증이며 Truth 2는 UNVERIFIED(동시성 부분)로 유지, Truth 3 구현은 DB 테스트로 확인됨.

## Human Verification Required
- 테스트 DB에서 migration과 SQL/RLS 실행. 기존 미실행 선택 유지.
- 별도 연결의 동시 구매, 실패 rollback, 멱등성 검증.
- 현재 구매 UI에서 소장·재열람·잔액 부족·로그인 안내·작가 편집 확인.
- Phase 5가 구현되면 검증된 충전 후 전체 구매 흐름 확인.

## Gaps Summary
- 작가 정산(90/10): 구현됨(0017), DB 테스트 통과. 정산 화면은 없음(청사진 갭).
- DB/동시성/E2E: 브라우저 E2E와 독립 세션 동시 구매 증거 필요, 미실행을 성공으로 처리하지 않음.
- 실충전: Phase 5 의존.
- 청사진 갭(2026-10-12 재개): 소장/대여 선택, 대여 기간, 정주행 자동 결제, 소장함, 정산·수익 화면. 이어갈 단계는 discuss(Phase 6 확장 vs 신규 phase) — `.planning/gaps/2026-10-12-blueprint-reconcile.md`.
