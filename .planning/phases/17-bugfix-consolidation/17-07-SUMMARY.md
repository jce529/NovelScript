---
phase: 17-bugfix-consolidation
plan: "07"
subsystem: studio-sidebar
tags: [studio, kb-tree, chapters, dnd-kit, move]
requires: ["17-06"]
provides:
  - "작품 폴더 / 계정 폴더 두 루트 사이드바 트리(접이식 그룹)"
  - "회차·설정 문서/폴더 이동(행 메뉴 '이동…' + 드래그앤드롭)"
  - "moveKbNode / moveChapter 서버 액션과 공통 순수 이동 규칙(lib/kb/move-rules.ts)"
affects: [app/studio/[workId]/layout.tsx, components/studio/*]
tech-stack:
  added: []
  patterns:
    - "드래그·다이얼로그·서버가 같은 순수 판정 함수(kbMoveVerdict / resolveDrop)를 공유"
    - "dnd-kit PointerSensor 서브클래스로 터치 제외(마우스/펜만 8px), KeyboardSensor"
key-files:
  created:
    - lib/kb/move-rules.ts
    - components/studio/sidebar-groups.tsx
    - components/studio/tree-dnd.tsx
    - tests/kb/move-rules.test.ts
    - tests/kb/move-node.test.ts
    - tests/chapters/move-chapter.test.ts
    - tests/studio/sidebar-tree.test.ts
    - tests/studio/tree-move-ui.test.ts
  modified:
    - app/studio/[workId]/layout.tsx
    - app/studio/[workId]/kb/[nodeId]/actions.ts
    - app/studio/[workId]/chapters/actions.ts
    - lib/kb/actions.ts
    - lib/chapters/actions.ts
    - lib/kb/kb-node-menu-controller.ts
    - components/studio/kb-tree.tsx
    - components/studio/kb-node-menu.tsx
    - components/studio/kb-node-dialogs.tsx
    - components/studio/studio-panel-shell.tsx
    - tests/kb/template-tree-ui.test.ts
    - tests/kb/kb-node-menu.test.ts
decisions:
  - "설정 이동의 '같은 카테고리'는 category 값 일치로 판정한다. custom 폴더는 같은 scope 안의 모든 custom 폴더가 한 영역이고, custom 폴더에 한해 영역 최상위('설정 (최상위)')로도 옮길 수 있다."
  - "회차 루트로 옮기면 folder_id=null로 저장한다. 기존 행에 루트 id가 저장된 경우도 '루트'로 보고 no-op 판정한다."
  - "이동은 parent_id / folder_id만 바꾼다(updated_at도 건드리지 않음). 이름 충돌은 자동 개명 없이 한국어 안내."
metrics:
  duration: "약 40분"
  completed: 2026-10-25
  tasks: 3
---

# Phase 17 Plan 07: 사이드바 트리 개편 + 회차·설정 이동 Summary

스튜디오 사이드바를 "작품 폴더(회차·설정·템플릿) / 계정 폴더(설정)" 접이식 트리로 바꾸고, 회차와 설정 문서·폴더를 행 메뉴 "이동…" 다이얼로그 또는 dnd-kit 드래그로 옮기게 했다. 두 방식 모두 같은 서버 액션(moveKbNodeAction / moveChapterAction)과 같은 순수 판정 함수를 쓴다.

## 완료한 Task

| Task | 내용 | 커밋 |
| ---- | ---- | ---- |
| 1 | 이동 서버 액션 + 공통 이동 규칙 + 단위 테스트(테스트 먼저) | 77e0b03 |
| 2 | 사이드바 트리 개편(SidebarGroup, 작품/계정 폴더) | b546f17 |
| 3 | 이동 메뉴·다이얼로그, 드래그앤드롭(tree-dnd) | 8bfb4e6 |
| 4 | 브라우저 확인 — 총괄이 수행(이 executor 범위 아님) | - |

## 변경 내용

- **이동 규칙(lib/kb/move-rules.ts, 클라이언트 안전)**: `kbMoveVerdict`가 템플릿·회차 영역 제외, 잠금 노드, 다른 scope/작품, 자기 자신, 하위 폴더(순환), 다른 카테고리, 파일 대상, `MAX_FOLDER_DEPTH`(=32, 옮긴 하위 트리의 가장 깊은 폴더 기준), 같은 위치 no-op을 판정한다. `kbMoveTargets` / `chapterMoveTargets`는 다이얼로그 목록을, `resolveDrop`은 드래그 대상 판정을 만든다. 한국어 문구는 `MOVE_COPY`와 `nameConflictMessage`에 모았다. `MAX_FOLDER_DEPTH`는 여기로 옮기고 lib/kb/actions.ts에서 다시 export한다.
- **서버**: `moveKbNode`는 쓰기 권한 → 원본 재조회(소유자·작품 범위) → 영역 전체 + 대상 재조회 → 같은 판정 → `parent_id`만 UPDATE. 23505는 "‘{대상}’ 폴더에 같은 이름의 ‘{이름}’이 이미 있어요. 이름을 바꾼 뒤 옮겨 주세요.", `locked_node_immutable`/`world_branch_confirmed_immutable`/`world_branch_inherited_immutable`도 한국어로 바꾼다. 그 밖의 오류는 원문을 노출하지 않는다. `moveChapter`는 쓰기 권한 → 작품 소유 → 회차 조회 → 회차 루트 조회 → `assertChapterFolder` → `folder_id`만 UPDATE한다. 발행 상태와 order_index는 그대로 둔다.
- **트리(Task 2)**: `SidebarGroup`(client)은 aria-expanded, aria-controls, 좌우 화살표 키를 지원하고, 접힘 상태는 저장하지 않는다. 내용은 마운트한 채 `hidden`으로만 숨긴다. 템플릿은 기본으로 접혀 있고 "기본 N · 내 M" 배지를 단다. 회차 섹션 헤더는 회차 루트 역할(회차 목록 링크, 새 회차/새 폴더 버튼, 루트 드롭 대상)을 맡고, 그 아래에는 루트의 하위 폴더와 루트 회차를 그린다. 행 높이는 32px(lg 미만 40px), 들여쓰기는 단계당 20px이고, 활성 행은 #ede9fe 배경에 #3f2fd0 글자다. 사이드바 폭은 296px로 맞췄다.
- **이동 UI(Task 3)**: 설정 문서·폴더 행과 회차 행 메뉴에 "이동…"을 넣었다. 회차 이동 다이얼로그에는 회차 (최상위)와 깊이별 폴더, "회차 N개", 현재 위치 배지, 안내 문구가 있다. 폴더/문서 이동 다이얼로그에는 같은 카테고리 폴더, 막힌 사유, "다른 영역" 그룹이 나온다. 두 다이얼로그 모두 radiogroup "옮길 폴더"를 쓰고, 서버 오류는 role=alert 배너로 보여 준다. 드래그는 마우스/펜으로 8px 움직이면 시작하고 키보드로도 할 수 있으며, 터치에서는 시작하지 않는다. 끄는 동안 원래 행은 흐리게 점선으로 남고, 유효한 대상은 2px #4f3cf5 외곽선과 #ede9fe 배경에 "여기로 이동"을 띄운다. 무효한 대상은 흐려지고, 그 위에 올리면 사유가 뜬다. 고스트 칩이 포인터를 따라오고, 하단 안내 pill에는 "{이름} → {대상} · 놓으면 이동해요  Esc로 취소"가 나온다. 스크린 리더 안내는 한국어다. 놓으면 서버 액션을 부르고 성공하면 toast와 router.refresh를, 실패하면 toast.error를 띄우며 트리는 그대로 둔다.
- **모바일**: lg 미만 "설정집·회차" 탭에 같은 트리가 나온다. 활성 행에 "…" 버튼이 보이고, 기존 행 메뉴에 "이동…"을 넣었으며 메뉴 항목 높이는 44px 이상이다.

## 검증

- `npx vitest run --project unit`: 172개 파일, 2607개 테스트 통과. 새로 추가한 테스트는 move-rules 20개, move-node 19개, move-chapter 9개, sidebar-tree 9개, tree-move-ui 9개, kb-node-menu 2개다.
- `npx eslint . --max-warnings=0`: 오류·경고 없음.
- `npx tsc --noEmit`: 오류 없음(이번 실행에서는 환경 탓인 LayoutProps 오류도 나오지 않았다).
- DB 스위트는 실행하지 않았다(일회용 DB env 없이 실행 금지). 공유 Supabase와 dev 서버(3199)는 건드리지 않았고, 마이그레이션도 없다.

## Deviations from Plan

### Auto-fixed / 범위 조정

1. **[Rule 2] 사이드바 폭 256px → 296px**: 목업 사양에 맞추느라 files_modified에 없던 `components/studio/studio-panel-shell.tsx`를 수정했다(w-64 → w-[296px]).
2. **[Rule 3] `lib/kb/kb-node-menu-controller.ts` 수정**: 폴더 행에도 메뉴가 필요해 `menuActionsFor`에 `treeMove` 옵션과 `tree-move` 액션을 넣었다. 옵션이 없을 때의 기존 동작과 테스트는 그대로다.
3. **custom 폴더 최상위 이동 추가**: 사용자 폴더를 하위로만 넣고 다시 꺼낼 수 없으면 안 되므로, custom 폴더에 한해 "설정 (최상위)" / "계정 설정 (최상위)" 대상과 섹션 헤더 드롭을 허용했다. 카테고리 폴더(인물 등)의 문서·폴더는 카테고리 루트 밖으로 나갈 수 없다.
4. **"…" 버튼은 데스크톱에서도 표시**: 행 액션 오버레이에 넣어 hover나 포커스 때 보인다. 모바일에서는 활성 행에서 항상 보인다.
5. **template-tree-ui 소스 순서 테스트 갱신**: 새 구조 순서(회차 → 설정 → 템플릿 → 계정 설정)에 맞췄다. mobile-workspace-* 테스트는 고치지 않았고 모두 통과한다(탭 3개·포커스 규칙 그대로).
6. **TDD 범위**: 순수 규칙과 서버 액션, SidebarGroup은 실패하는 테스트를 먼저 쓰고 확인한 뒤 구현했다. 다이얼로그 렌더 테스트(tree-move-ui)는 구현 뒤에 작성했다.

## Open Issues / Known Limits

- 일회용 DB 통합 테스트가 없다. 서버 액션은 query-boundary 더블로만 검증했다. 0023 잠금 가드, 0034 가지 불변식, sibling unique 인덱스의 실제 거부 메시지 매핑은 브라우저나 DB 확인(Task 4) 때 같이 봐야 한다.
- 모바일 행 메뉴는 기존 팝업 메커니즘을 유지했다. 목업의 바텀시트 모양은 nice-to-have라 하지 않았다.
- 키보드 드래그는 dnd-kit 기본 좌표 이동(화살표당 25px)과 rectIntersection 대체 판정을 쓴다. 실제 트리에서 쓰기 편한지는 브라우저로 확인해야 한다.
- 드래그 중에는 드롭 대상이 아닌 섹션 헤더(작품 폴더/계정 폴더 루트, 템플릿)도 흐려지지 않고 그대로 보인다(행만 흐림).
- 새 BUG 문서는 없다.

## Self-Check: PASSED

- 생성 파일 8개 존재 확인, 커밋 77e0b03 / b546f17 / 8bfb4e6 존재 확인.
