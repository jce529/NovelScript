---
phase: 14-mcp-write-review
plan: 11
subsystem: studio-ui
tags: [proposals, review-inbox, header-entry, chapter-tree]
requires: [14-07]
provides: [global review inbox (/studio/review), studio header entry, chapter tree badges]
affects: [lib/proposals/queries.ts, components/layout/site-header.tsx, app/studio/layout.tsx, components/studio/kb-tree.tsx]
key-files:
  created:
    - app/studio/review/page.tsx
    - components/proposals/inbox.tsx
    - components/proposals/inbox-model.ts
    - components/proposals/header-review-link.tsx
    - tests/proposals/inbox-queries.test.ts
    - tests/proposals/inbox-model.test.ts
    - tests/proposals/inbox-ui.test.ts
  modified:
    - lib/proposals/queries.ts
    - components/proposals/proposal-queue.tsx
    - components/layout/site-header.tsx
    - app/studio/layout.tsx
    - app/studio/[workId]/layout.tsx
    - components/studio/kb-tree.tsx
    - lib/kb/tree.ts
requirements: [MCP-07]
key-decisions:
  - "The inbox is server-rendered links only (URL = state: status, kind, work, chapter); rows reuse the per-work queue card and open the existing per-work detail/decision screens."
  - "Header entry (desktop A): SiteHeader takes an optional entry node; the studio layout always shows 'AI 검토 대기', number only when > 0, a failed count omits the number and never blocks the studio."
  - "Chapter tree entry (desktop B): a sibling badge link per chapter to the inbox scoped to that chapter. Desktop C (document tree badge), the document-level notice and the mobile 3-tab shell placement were not built."
  - "Malformed scope ids are ignored (unscoped list), never matched; rows of other owners or deleted works never show."
  - "Failure degrades: listInboxProposals -> {ok:false} (error state), total count -> null, per-chapter counts -> {}."
metrics:
  completed: 2026-11-10
---

# 14-11 요약 — 전역 인박스·헤더 진입·트리 배지

## 한 일
- `lib/proposals/queries.ts`에 `listInboxProposals`, `countPendingProposalsTotal`, `countPendingDraftsByChapter`를 추가하고, 상태 필터 로직(`fetchProposalRows`)을 작품 큐와 공유하게 했다.
- `/studio/review` 인박스, 스튜디오 헤더 `AI 검토 대기` 링크, 회차 트리 행 배지를 만들었다.

## 직접 재실행한 수치
- 새 단위 테스트 3개 파일 18건을 추가했고, 전체 단위 결과는 14-12 SUMMARY에 기록한다.
- `npx eslint .` 경고·오류 0, `npx tsc --noEmit`은 기존 `LayoutProps` 1건뿐.
- 개발 서버(일회용 DB, 3100)에서 `/studio/review`가 컴파일되고 비로그인은 `/login`으로 307 이동하는 것까지 확인했다.

## 확인하지 못한 것 (14-09 수동 인수에서)
- 로그인한 작가 계정으로 본 실제 화면(인박스 레이아웃, 헤더 링크 모양, 375px, 트리 배지 겹침). 런북 §5.15~5.18에 항목을 넣었다.
