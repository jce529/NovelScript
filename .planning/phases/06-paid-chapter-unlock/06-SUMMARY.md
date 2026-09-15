---
phase: 06-paid-chapter-unlock
plan: unplanned
duration: not-recorded
completed: null
type: retrospective
status: partial
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
requirements-completed: []
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
작가 90/10 정산은 구현되지 않았으며 최신 사용자 지시대로 로드맵에 구현 예정으로 남긴다.
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
PAY-02 전체 완료 아님. 작가 정산은 로드맵에 남겨 둔다.
Phase 5 실충전과 DB 환경이 준비되면 해당 연결과 검증을 수행한다.
멀티 AI/BYOK 목표는 이 phase와 별도다.
