---
phase: 14-mcp-write-review
plan: 10
subsystem: mcp-proposals / database
tags: [proposals, multi-draft, caps, normalization, migration-0043]
requires: [14-01, 14-06]
provides: [several pending drafts per chapter, per-work and per-writer pending caps, control-character stripping for AI text]
affects: [supabase/migrations/0043_mcp_proposal_multi_draft.sql, mcp_propose_chapter_draft, mcp_propose_kb_edit, mcp_propose_kb_create, mcp_proposal_normalize]
key-files:
  created:
    - supabase/migrations/0043_mcp_proposal_multi_draft.sql
  modified:
    - tests/proposals/draft-tools.database.test.ts
    - tests/mcp/read-boundary.database.test.ts
    - lib/mcp/tools/proposals.ts
    - tests/mcp/tools-proposals.test.ts
requirements: [MCP-05, MCP-06]
key-decisions:
  - "Accept RPCs already compare the live original's hash (0042 mcp_stale), so allowing several pending drafts needed no change on the decision side; the UI re-compares each remaining draft against the latest original."
  - "Identical pending text on a chapter returns the existing row whatever the connection (unique index on (chapter_id, content_hash) where pending). kb_edit / kb_create keep their per-connection dedupe: only chapter drafts were in scope."
  - "Caps: 30 live pending per work and 100 per writer, constants in mcp_proposal_pending_cap_per_work()/_per_writer() (revoked from every API role). Same error code mcp_cap_reached for both."
  - "Normalization adopts only the security part of the desktop SQL (C0/C1 controls except TAB/LF, DEL, BOM, bidi controls, via \\uXXXX regex escapes). The desktop collapsing of 4+ blank lines and trailing-whitespace trimming were NOT adopted: they would add a spurious end-of-text change against the original in the paragraph diff."
  - "Expired pending rows stay in the table as 'expired' (never deleted); only undo snapshots are dropped after their window (0042)."
  - "The save_draft tool text told the AI a second save replaces the first; changed to match."
metrics:
  completed: 2026-11-10
---

# 14-10 요약 — 다중 초안·상한·정규화 (0043)

## 한 일
- 테스트를 먼저 새 계약으로 바꿨다. 마이그레이션 없이 draft-tools DB 스위트 14건 중 6건이 의도대로 실패(red)했다.
- 증분 마이그레이션 `0043_mcp_proposal_multi_draft.sql`을 일회용 DB(`anzafn…`)에 적용했고 같은 스위트가 14/14 통과(green)했다. 0041·0042는 수정하지 않았다.
- `tests/mcp/read-boundary.database.test.ts`: 단일 인덱스 단정을 새 인덱스로 바꾸고, 병합으로 들어온 0050의 `world_work_base_visible(uuid)`를 분류표에 올렸다.

## 직접 재실행한 수치 (일회용 DB, 한 번에 한 스위트)
- `tests/proposals/draft-tools.database.test.ts` 14/14, `tests/mcp/read-boundary.database.test.ts` 20/20.
- `tests/mcp tests/proposals --project db` 전체 11개 파일 **112/112 통과, 건너뜀 0**(1회차).

## 미채택·남은 것
- 외부 AI 교차 검증(Codex)은 이 plan에서 돌리지 않았다. 보안 경계 변경이므로 병합 전에 한 번 돌리는 것을 권한다(읽기 전용).
- 설정집 수정안의 패치 형식(`find`/`replace`)은 이번 범위에 넣지 않았다. 사용자 답 대기.
