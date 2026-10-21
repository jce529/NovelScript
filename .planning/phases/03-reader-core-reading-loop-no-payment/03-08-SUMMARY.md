---
phase: 03-reader-core-reading-loop-no-payment
plan: "08"
subsystem: reader
tags: [work-detail, tabs, pagination, ui-spec]
requires: []
provides:
  - "작품 상세 4탭(intro/chapters/lore/reviews) 셸, lore 슬롯(Phase 18 선행)"
  - "lib/reader/work-detail.ts: getWorkReadingStats, paginateChapters, resolveResumeChapter, getWorkViewCount"
  - "03-UI-SPEC Reopen 개정 절"
affects: [03-18, 03-19, 03-20, 18]
tech-stack:
  added: []
  patterns: ["RSC page를 vitest에서 직접 호출 + renderToStaticMarkup"]
key-files:
  created: [lib/reader/work-detail.ts, components/reader/work-chapter-list.tsx, tests/reader/work-detail.test.ts, tests/reader/work-detail-shell.test.ts]
  modified: [".planning/phases/03-reader-core-reading-loop-no-payment/03-UI-SPEC.md", "app/works/[workId]/page.tsx"]
requirements-completed: [READ-01, READ-04, READ-05, READ-07, READ-08]
duration: ~20min
completed: 2026-10-17
---

# Phase 3 Plan 08: 작품 상세 4탭 셸 Summary

작품 상세를 소개/회차/세계관/리뷰 4탭으로 바꾸고, 신고를 탭 밖 상단에 한 번만 두며, 연독률·완독률을 null 기반 "집계 중"으로 표시하고, 회차를 10화 페이지로 나눴다.

## Commits
- a04f9df docs: 03-UI-SPEC Reopen 개정 (과거 승인은 이력으로 보존, 현행은 재검증 대기로 표기)
- (RED) test: work-detail 계약 실패 테스트
- 039e165 feat: lib/reader/work-detail.ts
- a1f35eb feat: page.tsx 4탭, work-chapter-list.tsx, shell 테스트

## Tests
- `npx vitest run tests/reader` : 12 files / 109 tests pass (work-detail 15, work-detail-shell 5 포함). 신규 테스트 RED 실패 후 GREEN 확인.
- `npx tsc --noEmit`: 이번 변경 파일 관련 오류 없음.

## Decisions
- 이어보기 fallback: 사라진 progress면 비블라인드 첫 공개 회차(없으면 첫 행).
- 조회 합계는 `getWorkViewCount`가 published·미삭제 chapters.view_count만 조회(본문 미조회).
- 신고는 wrapper `role=group aria-label="신고"`(모바일) + 데스크톱 전용 보조 텍스트 "불일치·표절 신고". ReportDialog 파일은 수정하지 않음.
- 모바일은 SiteHeader를 `hidden md:block` 래퍼로 숨기고 같은 상단 행에 뒤로/신고/WorkHeaderActions/검색 준비 중 아이콘을 둠.

## Deviations from Plan
None - 계획대로 실행. (작품설정 탭은 세계관으로 대체됨; 블라인드 분기는 기존 유지.)

## Known Stubs / Gaps
- 세계관·리뷰 탭은 의도된 "준비 중" 셸(Phase 18 / 리뷰 phase).
- 연독률·완독률은 의도적으로 null("집계 중"); 산출은 완독 데이터 phase.
- 검색 아이콘은 disabled 자리 표시(준비 중).
- 브라우저 렌더/반응형(모바일 헤더 숨김, 탭 전환 시 신고 유지)과 실DB 검증은 이 환경에서 불가 -> 03-19에서 검증. 페이지네이션 클릭/입력 이동은 단위 테스트가 순수 함수까지만 커버(클라이언트 상호작용은 브라우저 검증 대기).
- 잔액부족 소장 연결은 03-18 소비자 보완 몫. graphify/STATE/ROADMAP 갱신은 오케스트레이터 몫(미실행).

## Self-Check: PASSED
