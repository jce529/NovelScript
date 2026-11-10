---
phase: 14-mcp-write-review
plan: 12
subsystem: integration / docs
tags: [merge, verification, handover]
requires: [14-10, 14-11]
provides: [verified merge of the desktop Phase 14 line into the 0041/0042 line, updated ROADMAP/STATE/handover]
affects: [.planning/ROADMAP.md, .planning/STATE.md, 14-HANDOVER.md, 14-ROUTING.md, 14-ACCEPTANCE-RUNBOOK.md]
requirements: [MCP-05, MCP-06, MCP-07]
key-decisions:
  - "Local 0041/0042 line is the base; desktop 0051, its propose-write test and its 12 plans are not adopted (design docs kept under _superseded/desktop-14-mcp/)."
  - "Only one code conflict (tests/mcp/read-boundary.database.test.ts), resolved to the mcp_proposals catalog; master-only changes (Phase 19, promo docs, 0040, 0050) preserved."
metrics:
  completed: 2026-11-10
---

# 14-12 요약 — 통합 검증과 문서 동기화

## 직접 재실행한 수치 (병합 세션, 일회용 DB `anzafn…`만)

| 항목 | 결과 |
|---|---|
| 전체 단위 (`--project unit`) | 203개 파일 **3258/3258** |
| `npx eslint .` | 경고·오류 0 |
| `npx tsc --noEmit` | 기존 `LayoutProps` 1건뿐 |
| DB `tests/mcp tests/proposals --project db` 1회차 | 11개 파일 **112/112**, 건너뜀 0 |
| DB 2회차(1회차 직후) | `DCR failed with HTTP 429` 3건 실패 — 일회용 프로젝트 OAuth 클라이언트 등록 한도(환경 요인, 기존 인수 문서에 기록된 현상). 판정에서 제외 |
| DB 3회차(12분 대기 뒤) | 11개 파일 **112/112**, 건너뜀 0 |
| 그 뒤 추가한 테스트 | `accept-revert`에 다중 초안 수락 케이스 1건 추가, 해당 스위트 **27/27**. 전체 DB 스위트는 이 추가분을 포함해 다시 돌리지 않았다 |

## 검증 범위의 한계
- **Codex 교차 검증을 돌리지 않았다.** 0043은 제안 RPC 3개를 재정의한 보안 경계 변경이다. 병합 전에 읽기 전용으로 한 번 필요하다.
- **로그인 화면을 보지 못했다.** 인박스·헤더 링크·트리 배지는 단위 렌더 테스트, 타입, 린트, 개발 서버 컴파일(비로그인 307)까지만 확인했다. 14-09 수동 인수 항목(런북 §5.15~5.18).
- 추가 테스트 이전에는 "다중 초안이 있어도 수락 쪽 변경이 필요 없다"는 판단이 코드 읽기 추론이었다. 이제 DB 테스트(첫 초안 수락 뒤 둘째가 `mcp_stale`, 최신 해시로 다시 수락하면 성공)로 확인했다.
- 공유 DB는 읽지도 쓰지도 않았다.

## 가져오지 않은 데스크탑 항목
`0051_mcp_review_queue.sql`, `tests/mcp/propose-write.database.test.ts`, 12개 plan, 테이블 2개 설계(`mcp_drafts`, `mcp_kb_proposals`), 정규화의 빈 줄 접기·끝 공백 제거, 설정집 트리 배지(C), 문서 화면 안내줄, 모바일 3탭 셸 배치.
