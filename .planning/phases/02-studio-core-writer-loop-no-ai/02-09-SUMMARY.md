---
phase: 02-studio-core-writer-loop-no-ai
plan: "09"
subsystem: kb-templates-ui
tags: [templates, server-actions, dialogs, toolbar, reopen-d10]
gap_closure: true
requirements: [KB-01, KB-02]
dependency_graph:
  requires: [02-08 (copyTemplateFile, canonical-only default, validateTargetTemplate)]
  provides:
    - getNodeContentAction(nodeId, workId?) -> content + metadata + mode
    - copyTemplateFileAction(workId,nodeId,name)
    - createDocumentFromTemplateAction(workId,{category,parentId|null,name,templateId|null})
    - CopyTemplateDialog / CreateTemplateDialog / CreateNodeDialog(preselectedTemplateId)
    - TemplateEditorToolbar
  affects: [02-10 (tree/menu wiring reuses the dialogs), 02-12 (editor page consumes metadata + toolbar), 02-13 (gates)]
key_files:
  created:
    - components/studio/template-editor-toolbar.tsx
    - tests/kb/template-action-wrappers.test.ts
    - tests/kb/template-dialogs.test.ts
  modified:
    - app/studio/[workId]/kb/[nodeId]/actions.ts
    - components/studio/kb-node-dialogs.tsx
decisions:
  - "getNodeContentAction takes an optional workId; omitted keeps the current editor page working until 02-12 passes it. When passed, other-work rows fail."
  - "Mode (document / user_template / default_template) and templateCategory are derived server-side from the row, its parent and the template root, never from the client."
  - "createDocumentFromTemplateAction accepts parentId null = category root folder (resolved server-side), so the open-template CTA needs no folder picker."
  - "Dialog submit logic lives in exported plain async functions (runCopyTemplate/runCreateFromTemplate/runCreateTemplate) with success/error callbacks, so tests run the real submit paths without jsdom."
  - "Locked default CTA selects the default (id null); a 내 템플릿 CTA preselects its own id. Select value 'canonical' maps to null, never mixed with user ids."
metrics:
  tasks: 2
  files: 5
  completed: 2026-10-13
---

# Phase 02 Plan 09: 템플릿 열기, 사본 이름 입력, 새 문서 연결 Summary

기본 템플릿에서 "사본 만들어 수정"과 "이 템플릿으로 새 문서"로 이어지는 서버 wrapper와 재사용 dialog, 템플릿 toolbar를 만들었다. 새 문서는 클라이언트가 보낸 template id를 서버에서 다시 검증하고 저장된 최신 원문으로 만든다.

## What was built

| Task | Commit | Files |
|------|--------|-------|
| 1 wrappers | c2ed513 | app/studio/[workId]/kb/[nodeId]/actions.ts, tests/kb/template-action-wrappers.test.ts |
| 2 dialogs/toolbar | 1bf3980 | components/studio/kb-node-dialogs.tsx, components/studio/template-editor-toolbar.tsx, tests/kb/template-dialogs.test.ts |

### actions.ts
- `getNodeContentAction`: content에 id/name/category/node_type/is_locked/scope/parent_id, `templateCategory`, `mode`를 더해 돌려준다. 없는/삭제된/다른 사용자/다른 작품/폴더 노드는 `ok:false`.
- `saveNodeContentAction`: 저장 전에 노드가 이 작품(또는 계정 템플릿)에 속하는지 확인, 아니면 저장 함수를 부르지 않고 실패.
- `copyTemplateFileAction`: session user id로 02-08 `copyTemplateFile` 호출, 성공 때만 layout revalidate, 새 nodeId 반환.
- `createDocumentFromTemplateAction`: 카테고리 검증 -> `validateTargetFolder`(또는 null이면 카테고리 root) -> `validateTargetTemplate` -> `createNode(templateOverrideContent)`. 클라이언트 content는 받지 않는다.

### UI
- `CreateNodeDialog`: id 기반 action 사용, `preselectedTemplateId`/`parentId:null` 지원, 실패 시 입력·선택 보존. 02-08이 남긴 낡은 "category-name match" 주석 제거.
- `CopyTemplateDialog`: "<이름> 사본" 제안, 성공 시 새 편집기로 push, 실패/중복은 닫지 않고 push 없음.
- `CreateTemplateDialog`: 이름·영역(2개 이상일 때 선택)·카테고리를 받아 기존 `createNodeAction(category=template)` 경로 사용.
- `KbTreeActions`: 템플릿 파일 행에 사본/새 문서 버튼, 템플릿 root 행에 "내 템플릿 만들기". 잠긴 기본 파일의 이동 버튼은 숨김.
- `TemplateEditorToolbar`: 기본은 읽기 전용 안내 + "사본 만들어 수정", 저장/이름 변경 없음. 내 템플릿은 이름 변경 + `saveSlot`. 카테고리가 있는 모든 템플릿에 "이 템플릿으로 새 문서".

## Verification (실제 실행)

| 명령 | 결과 |
|------|------|
| `npx vitest run --project unit tests/kb/template-action-wrappers.test.ts` | 15 passed |
| `npx vitest run --project unit tests/kb/template-dialogs.test.ts tests/kb/template-action-wrappers.test.ts tests/kb/template-tree-ui.test.ts` | 3 files, 37 passed |
| `npx vitest run --project unit tests/kb tests/studio` | 14 files, 193 passed |
| `npx tsc --noEmit` | 이 plan 오류 0. 범위 밖 untracked `tests/payments/*` 3건 TS2307만 |

## Deviations from Plan

**1. [Process] TDD RED 커밋 생략**
Task 1/2 모두 구현과 테스트를 같이 작성해 처음부터 통과했다. 실패 확인용 RED 커밋은 없다.

**2. [Rule 2 - 보안] saveNodeContentAction에 작품 소속 검사 추가**
"다른 작품은 저장 실패" 요구를 wrapper 계층에서 충족하려고 추가했다.

**3. [Scope] 선택적 `workId` 인자**
편집기 page.tsx는 02-12 소유라 현재 `getNodeContentAction(nodeId)` 호출이 그대로 동작해야 한다. 02-12가 workId를 넘기면 작품 소속 검사가 켜진다.

## Pending gates (02-13) / 이월

- 라이브 DB·브라우저 검증 없음. dialog 클릭, 사본 후 편집기 이동, 중복 이름 오류 표시는 mock/정적 렌더로만 확인했다. 실제 DOM 상호작용은 02-13에서 확인.
- 영역 선택은 `CreateTemplateDialog`가 받는 `areas` 개수에 따른다. 현재 tree row 연결은 해당 root 영역 하나만 넘기므로 작품/계정 선택 UI는 두 root를 함께 넘기는 호출부(02-10 kb-tree)에서 활성화된다.
- toolbar 연결과 `workId` 전달은 02-12, 행 메뉴 연결은 02-10 담당.
- 02-08의 DB suite(`template-options`, `template-tree-mutations`) 실DB 실행도 여전히 02-13 몫.

## Known Stubs

None.

## Self-Check: PASSED
