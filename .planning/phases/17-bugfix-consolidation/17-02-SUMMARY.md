---
phase: 17-bugfix-consolidation
plan: "02"
subsystem: ui
tags: [react, file-input, base-ui-select, vitest]
requires:
  - phase: 16-studio-workflow-upload
    provides: UploadFilesDialog and G2 Select fix (3b9ca0f)
provides:
  - "Native file/folder inputs visually hidden (sr-only) with explicit type=button triggers"
  - "Regression tests for input hiding and controlled folder Select"
  - "Phase 16 bugs/ folder with BUG-01 (G2/G3)"
affects: [17-06]
tech-stack:
  added: []
  patterns: ["sr-only native input + ref.click() button"]
key-files:
  created: [tests/ai/upload-files-dialog.test.ts, .planning/phases/16-studio-workflow-upload/bugs/README.md, .planning/phases/16-studio-workflow-upload/bugs/BUG-01-upload-dialog-input.md]
  modified: [app/studio/[workId]/chapters/[chapterId]/ai-panel/UploadFilesDialog.tsx]
key-decisions:
  - "BUG-01 stays in Phase 16 bugs/ as fixed-pending-device-check; bug-complete move to fixed/ deferred until 17-06 device check"
requirements-completed: [BUGFIX-03]
duration: 10min
completed: 2026-10-23
---

# Phase 17 Plan 02: Upload dialog input Summary

업로드 다이얼로그의 두 네이티브 file input을 sr-only로 숨기고 "파일 선택"/"폴더째 선택" 버튼이 ref.click()으로 연다. G2 Select 제어 상태는 테스트로 보호.

## Tasks
1. 회귀 테스트 + BUG-01 문서/README (RED 3건 실패 확인) - 748941d
2. UploadFilesDialog 수정 (GREEN 7/7) - 8fdd2e9

## Verification
- `npx vitest run --project unit tests/ai/upload-files-dialog.test.ts`: 7 passed
- ESLint `--max-warnings=0` on owned files: clean; `tsc --noEmit`: no errors in owned files

## Deviations from Plan
- 워크트리에 node_modules가 없었지만 상위 저장소 node_modules가 모듈 해석으로 잡혀 설치 없이 실행했다.
- Next 문서(`node_modules/next/dist/docs`)는 순수 React/HTML 변경이라 상세 열람하지 않았다.
- bug-complete(fixed/ 이관)는 실기기 확인(17-06) 전이라 하지 않았다. 상태는 `fixed-pending-device-check`.

## Known Stubs
None.

## Self-Check: PASSED
