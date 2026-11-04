---
phase: 14
slug: mcp-write-review
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-04
---

# Phase 14 — Validation Strategy

> 상세 근거와 시나리오는 `14-RESEARCH.md`의 `## Validation Architecture`가 원본이다. 이 문서는 실행 중 피드백 샘플링 계약이다.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.11 (프로젝트 `unit`, `db`) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/proposals tests/mcp/tool-annotations.test.ts tests/mcp/route-auth.test.ts tests/mcp/no-admin-client.test.ts --project unit` |
| **Full suite command** | `npx vitest run --project unit` + 일회용 DB: `node --env-file=.env.disposable node_modules/vitest/vitest.mjs run tests/mcp tests/proposals --project db` |
| **Estimated runtime** | unit ~60초, db ~150초 |

일회용 DB 규약: `.env.disposable` 내용은 출력하지 않고 키 존재는 `node scripts/check-env.mjs .env.disposable`로만 본다. DB 스위트는 `assertDisposableRef()`로 공유 ref(`ymudwg…`)가 아님을 확인한다. 마이그레이션 0041~은 일회용 DB(`anzafn…`)에만 0037 → 0038 → 0039 → 0041 순서로 적용한다. 모든 DB 명령은 실행 수 > 0, skipped 0이 필수다.

## Sampling Rate

- **After every task commit:** 해당 task의 unit 파일 + `no-admin-client` + `tool-annotations`
- **After every plan wave:** `npx vitest run --project unit` + `npx tsc --noEmit` + 변경 파일 eslint
- **Before `/gsd:verify-work`:** 일회용 DB `tests/mcp tests/proposals --project db` 전부 green, 같은 날 2회 연속
- **Max feedback latency:** 180초

## Per-Task Verification Map

| Req | Behavior | Test Type | Automated Command | File Exists | Status |
|-----|----------|-----------|-------------------|-------------|--------|
| MCP-05 | `save_draft`가 pending만 만들고 `chapters.content` 불변, 회차당 pending 1개(superseded), 50건 상한 | db | `tests/proposals/draft-tools.database.test.ts --project db` | ❌ W0 | ⬜ |
| MCP-05 | 도구 9개·쓰기 annotation·strict schema·한국어 describe·정지 계정·scope 거부 | unit | `npx vitest run tests/mcp/tool-annotations.test.ts tests/mcp/tools-proposals.test.ts --project unit` | ❌ W0 | ⬜ |
| MCP-05/06 | 교차 사용자 주입 쓰기 | db | `tests/mcp/tools.proposals.cross-user.database.test.ts --project db` | ❌ W0 | ⬜ |
| MCP-06 | `propose_kb_document` edit/create 제약(잠김·삭제·scope·카테고리) | db | `tests/proposals/kb-tools.database.test.ts --project db` | ❌ W0 | ⬜ |
| D-17 | 카탈로그 41표·`mcp_proposals` oauth_browser_only·definer RPC 분류·bearer REST 거부 | db | `tests/mcp/read-boundary.database.test.ts --project db` | ✅ 확장 | ⬜ |
| MCP-07 | 출처 스냅샷 서버 채움·해제 후 보존 | db | `tests/proposals/source-snapshot.database.test.ts --project db` | ❌ W0 | ⬜ |
| MCP-06/07 | 수락 RPC: stale 무변경, 이중 수락 불가, 원자성, undo 1회, bearer 42501 | db | `tests/proposals/accept-revert.database.test.ts --project db` | ❌ W0 | ⬜ |
| MCP-06 | 문단 3-way 병합 순수 함수 | unit | `npx vitest run tests/proposals/paragraph-merge.test.ts --project unit` | ❌ W0 | ⬜ |
| D-P14-04 | TS/SQL 해시 일치 | unit+db | `tests/proposals/hash.test.ts` | ❌ W0 | ⬜ |
| MCP-07 | 큐·배지 쿼리, 서버 액션 소유권·재계산 | unit | `npx vitest run tests/proposals/queries.test.ts tests/proposals/actions.test.ts --project unit` | ❌ W0 | ⬜ |
| D-P14-11 | 사이드 채팅 비신뢰 인용·상한·자동 반영 없음 | unit | `npx vitest run tests/proposals/refine.test.ts --project unit` | ❌ W0 | ⬜ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

## Wave 0 Requirements

- [ ] `tests/proposals/paragraph-merge.test.ts`, `hash.test.ts`, `queries.test.ts`, `actions.test.ts`, `refine.test.ts`
- [ ] `tests/proposals/draft-tools|kb-tools|accept-revert|source-snapshot.database.test.ts`
- [ ] `tests/mcp/tools.proposals.cross-user.database.test.ts`, `tests/mcp/tools-proposals.test.ts`
- [ ] 기존 갱신: `read-boundary.database.test.ts`(카탈로그 상수), `tool-annotations`, `route-auth`, `no-admin-client`, `tools.cross-user`(ALLOWED_ERRORS)
- [ ] `npm install diff@9.0.0`

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 실제 Claude `save_draft`/`propose_kb_document` 왕복, 쓰기 도구 승인 흐름, 큐 출처 표시, 부분 수락·되돌리기·원본 변경 경고 | MCP-05/06/07 | 외부 클라이언트 | 14-RESEARCH 수동 인수 묶음 1번 |
| 리뷰 큐 375px·키보드·Dialog 포커스·role status/alert | MCP-07 | 시각·접근성 | 묶음 2번 |
| 12-06 #7 동의 화면 상태, #8 375px, #9 refresh 1시간 후 | MCP-01 (이월) | 시간·시각 | 묶음 3번 (D-P14-09) |
| 사이드 채팅 과금 문구·실패 문구·후보 주입 | D-P14-11 | 실제 AI | 묶음 4번 |

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
