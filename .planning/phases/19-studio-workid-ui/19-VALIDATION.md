---
phase: 19
slug: studio-workid-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-01
---

# Phase 19 — Validation Strategy

> 근거: `19-RESEARCH.md` §Validation Architecture. 요구사항별 상세 매핑은 그 표를 따른다.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.11 (node 환경, `tests/**/*.test.ts`만 수집) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- tests/works/work-home.test.ts tests/works/work-home-page.test.ts` |
| **Full suite command** | `npm test -- tests/works tests/studio tests/kb/sidebar-sections.test.ts tests/world-tree/entrypoints.test.ts` |
| **Estimated runtime** | ~5 seconds |

신규 테스트에 `helpers/db`, `SUPABASE_DB_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `postgres(` 문자열을 넣지 않는다(DB 직렬 프로젝트로 분류됨). JSX 대신 `createElement`를 쓴다.

## Sampling Rate

- **After every task commit:** quick run command
- **After every plan wave:** full suite command
- **Before `/gsd:verify-work`:** full suite + `npx tsc --noEmit` + `npm run lint` 모두 green
- **Max feedback latency:** 30 seconds

## Per-Task Verification Map

플랜별 `<verify>` 명령이 원본이다. 요구사항 ↔ 자동 검증 대응은 `19-RESEARCH.md`의 표(WORKHOME-01~07 전부)를 따른다. T-19-03: `getWork`가 null이면 `listChapters`·`getWorkKbNodes`·심사 상태 조회가 0회 호출됨을 확인한다.

## Wave 0 Requirements

- [ ] `tests/works/work-home.test.ts` — WORKHOME-01·02·03·05 계산 로직
- [ ] `tests/works/work-home-page.test.ts` — WORKHOME-02·03·05·06 표시
- [ ] `tests/studio/sidebar-empty-copy.test.ts` — WORKHOME-04·05 빈 폴더 문구
- [ ] 기존 `tests/world-tree/entrypoints.test.ts` 홈 블록 수정 (R1: 새 페이지의 `listChapters`·심사 상태 목과 충돌)

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 목업 대비 실화면 | WORKHOME-07 | 시각 비교 | 19-05 human-check: viewport 크기·스크린샷 경로를 SUMMARY에 기록 |
| 모바일 가로 스크롤 없음, 탭 전환 후 내용 유지 | WORKHOME-06 | 레이아웃 실측 | 390px에서 `집필` 탭 확인 |
| 카드 열기 동작(심사 카드) | WORKHOME-03 | 상호작용 | 19-04 결정 후 키보드·클릭으로 확인 |

## Validation Sign-Off

- [ ] 모든 task에 `<automated>` verify 또는 Wave 0 의존이 있다
- [ ] Wave 0이 누락된 참조를 모두 덮는다
- [ ] watch 모드 플래그가 없다
- [ ] `nyquist_compliant: true`는 execute 중 Wave 0 완료 뒤 설정한다

**Approval:** pending
