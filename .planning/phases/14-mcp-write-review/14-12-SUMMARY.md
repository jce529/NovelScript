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
- **Codex 교차 검증(사후 1회):** Codex `gpt-6-sol`(추론 high, 읽기 전용)로 병합 이후 변경(0043·14-11·충돌 해결)을 교차 검토했다: **블로커 0 / 경고 5**. 고친 것 3건 — 헤더 전체 건수가 삭제된 작품의 대기 제안을 세던 문제, 작품·제안을 200건으로 자른 뒤 삭제 작품을 거르던 문제(201번째 작품·오래된 이력 누락), 트리 배지의 작은 클릭 영역. 고치지 않은 것 2건 — (1) master의 `0050` `world_work_base_visible(uuid)`가 anon에게 열린 SECURITY DEFINER라 작품 UUID를 아는 사람이 비공개 작품의 존재 여부를 참/거짓으로 알 수 있다(0050은 BUG-02 소관이라 BUG-02 쪽에서 판단, 우리는 read-boundary 분류만 `keep`으로 올림), (2) 0042 `mcp_proposal_caller`/0043의 만료 판정이 트랜잭션 시작 시각 `now()`라 작가별 잠금을 기다리는 사이 만료된 제안이 있으면 만료 ID를 돌려줄 수 있는 아주 좁은 경합(후속 후보).
- **로그인 화면을 보지 못했다.** 인박스·헤더 링크·트리 배지는 단위 렌더 테스트, 타입, 린트, 개발 서버 컴파일(비로그인 307)까지만 확인했다. 14-09 수동 인수 항목(런북 §5.15~5.18).
- 추가 테스트 이전에는 "다중 초안이 있어도 수락 쪽 변경이 필요 없다"는 판단이 코드 읽기 추론이었다. 이제 DB 테스트(첫 초안 수락 뒤 둘째가 `mcp_stale`, 최신 해시로 다시 수락하면 성공)로 확인했다.
- 공유 DB는 읽지도 쓰지도 않았다.

## 가져오지 않은 데스크탑 항목
`0051_mcp_review_queue.sql`, `tests/mcp/propose-write.database.test.ts`, 12개 plan, 테이블 2개 설계(`mcp_drafts`, `mcp_kb_proposals`), 정규화의 빈 줄 접기·끝 공백 제거, 설정집 트리 배지(C), 문서 화면 안내줄, 모바일 3탭 셸 배치.
