---
phase: 06-paid-chapter-unlock
plan: unplanned
duration: not-recorded
completed: 2026-10-01
type: retrospective
status: complete-unverified
subsystem: commerce
tags: [supabase, postgres, entitlement, wallet]
requires:
  - phase: 01-foundation-wallet-infrastructure
    provides: profiles, wallets and ledger
  - phase: 02-studio-core-writer-loop-no-ai
    provides: works and chapters
provides:
  - Separate orders, order items and sparse entitlements
  - Token purchase service and protected chapter reads
affects: [05-real-payment-integration, 07-admin-moderation-surface]
key-files:
  created:
    - supabase/migrations/0005_commerce.sql
    - lib/commerce/actions.ts
    - lib/access/actions.ts
    - tests/commerce/actions.test.ts
    - tests/commerce/database.test.ts
  modified:
    - lib/chapters/actions.ts
    - components/reader/viewer-shell.tsx
requirements-completed: [PAY-02]
documented: 2026-09-15
---

# Phase 6: Implementation Summary

**거래와 열람 권한을 분리한 회차 구매 기반을 구현했다. 작가 정산 및 실제 DB/E2E 검증은 남아 있다.**

## Provenance
GSD 실행 이전에 작성된 커밋을 최신 문서 형식으로 요약한 retrospective 문서다.
완료된 개별 PLAN의 SUMMARY가 아니며 과거 GSD 실행·테스트를 새로 주장하지 않는다.
- 57e1c8e — Implement paid chapter access and purchasing
- fc8a4a5 — test(commerce): finalize purchase verification and implementation report

## Accomplishments
- 기존 User/Work/Chapter/Wallet 재사용.
- orders → order_items 1:N, 가격/조건 snapshot, sparse entitlements.
- RPC 내부의 지갑 차감·PAID·권한 생성, 재시도 멱등성.
- DB content 컬럼 보호, 권한 검사 본문 RPC, Studio/목차 연결.
- 뷰어 구매 버튼·오류·재시도·성공 refresh.
- 단위 테스트와 PostgreSQL 통합 테스트 코드, 구현 보고서 작성.

## Files Created/Modified
전체 목록과 PK/FK/Index는 docs/commerce-entitlements.md §2~3 참조.
추가 연결 파일:
- app/works/[workId]/chapters/[chapterId]/actions.ts
- app/works/[workId]/chapters/[chapterId]/page.tsx
- app/studio/[workId]/chapters/[chapterId]/actions.ts

## Decisions Made
Entitlement를 유일한 유료 권한 기준으로 사용한다.
작품/기간/출처/회수 확장 필드를 마련하되 현재 판매는 회차 영구 소장이다.
본문을 별도 테이블로 이동하지 않고 metadata 공개 + 보호된 본문 RPC를 사용한다.

## Deviations from Earlier Planning
chapter_unlocks / unlock_paid_chapter를 만들지 않았다.
현재 UI는 확인 모달 대신 구매 버튼과 refresh 흐름이다.
로그인/실제 충전 복귀는 아직 연결되지 않았다.
작가 90/10 정산은 0017_author_settlement.sql로 구현했다(2026-10-01 실DB 적용, tests/commerce 전체 통과 — 브라우저 E2E·독립 세션 동시성은 미검증). 비율은 settlement_author_rate_bps() 한 곳, 분배는 order_items 스냅샷, 작가 크레딧은 pay_purchase_order 내 원자 처리.
Phase 6의 구매 기반이 Phase 5 실충전보다 먼저 구현됐다.

## Tests and Outcomes
이전 실행 기록: 단위/회귀 26 통과, DB 통합 10 미실행.
TypeScript·변경 파일 ESLint 통과. 빌드 컴파일 후 /login에서 Supabase 설정 누락으로 실패.
이번 문서 정리에서는 이 검사를 재실행하지 않았다.
DB migration은 이전 작업에서 적용하지 않았고 현재 배포 확인도 수행하지 않았다.

## Issues Encountered
- SUPABASE_DB_URL 미설정 및 사용자의 DB 테스트 미실행 선택.
- 공개 Supabase URL/API key 미설정으로 전체 빌드 실패.
- 실제 SQL 동시성·RLS·구매 브라우저 E2E 증거 없음.

## Next Phase Readiness
PAY-02 구현 완료(2026-10-01). 작가 정산 SQL은 구현됐으나 실제 DB 동시성·RLS·E2E 검증은 남아 있다 (tests/commerce/settlement.test.ts는 SUPABASE_DB_URL 필요).
Phase 5 실충전과 DB 환경이 준비되면 해당 연결과 검증을 수행한다.
멀티 AI/BYOK 목표는 이 phase와 별도다.

## 독립 세션 동시성 검증 (2026-10-08)
테스트 DB에 임시 스키마(커밋)를 만들고 독립된 PostgreSQL 연결 여러 개로 create_purchase_order/pay_purchase_order를 동시에 호출했다(종료 후 스키마 삭제, 잔여 0). 6/6 통과:
- T1 같은 구매자·회차를 서로 다른 멱등 키로 동시 구매 → 1건만 성공(다른 쪽 content_unavailable_or_owned), 구매자 -30·작가 +27·열람권 1.
- T2 같은 멱등 키 동시 구매 → 이중 차감 없음.
- T3 한 주문에 pay_purchase_order 동시 호출 → CONTENT_SALE 원장 1건.
- T4 잔액 40에서 30/50 동시 구매 → 1건 성공, 다른 쪽 insufficient balance, 잔액 10(음수 없음).
- T5 구매자 2명이 작가 2명 회차를 반대 순서로 동시 구매 → 데드락 없음, 작가 54/90.
- T6 같은 구매자·회차 8세션 동시 구매 → 성공 1/8, 열람권 1.
스크립트는 저장소에 넣지 않았다(scratchpad 일회용). 브라우저 구매 E2E는 별도로 남음.
