---
id: BUG-01
title: 업로드 다이얼로그 파일 입력 기본 문구 노출 + 저장 폴더 Select 비제어 경고
status: fixed-pending-device-check
severity: low
found: 2026-10-23
found_during: 16-UAT G2/G3 점검, Phase 17-02
origin_phase: 16 (2535ead feat(16) 스튜디오 작업 흐름 확장)
files:
  - app/studio/[workId]/chapters/[chapterId]/ai-panel/UploadFilesDialog.tsx
  - tests/ai/upload-files-dialog.test.ts
---

# BUG-01: 업로드 다이얼로그 입력 문구·Select 경고

## 증상

- G3: "파일 선택" 영역에 브라우저 기본 `<input type="file">` 문구("파일 선택 / 선택된 파일 없음" 등)가 그대로 보인다. 폴더째 선택 입력도 같다.
- G2: 저장 폴더 `Select`가 폴더 로드 전 `value={undefined}`였다가 문자열로 바뀌며 Base UI가 uncontrolled→controlled 경고를 냈다.

## 재현

- G3: 파일 업로드 다이얼로그를 열면 두 네이티브 입력이 `className="text-sm"`만 가진 채 렌더된다.
- G2: 다이얼로그를 열고 폴더 로드가 끝나는 동안 콘솔 확인.

## 기대 / 실제

- 기대: 네이티브 입력은 시각적으로 숨고 명확한 버튼이 선택창을 연다. Select는 처음부터 제어형.
- 실제(수정 전): 기본 문구 노출. G2는 `3b9ca0f`로 이미 수정됨.

## 원인

- G3: `UploadFilesDialog.tsx`의 두 `<input type="file">`에 `sr-only`/`hidden` 처리가 없었다.
- G2: `quick-add-folders.ts`의 `selectedFolderId`가 로드 전 `undefined`. 이미 `value={folderState.selectedFolderId ?? null}`로 수정(`3b9ca0f`) — 이번에는 재구현하지 않고 회귀 테스트로 보호만 한다.

## 수정 방향

두 입력에 `sr-only`와 ref를 적용하고 `type="button"` 버튼이 `ref.current.click()`으로 선택창을 연다. 기존 `onChange`, value 초기화, `pickFiles`, `MAX_IMPORT_FILES`/`MAX_ATTACHMENTS`/accept 제한은 그대로 둔다.

## 검증

- `npx vitest run --project unit tests/ai/upload-files-dialog.test.ts`
- 실제 모바일 선택창·시각 확인은 17-06 checkpoint에서 수행.

## 수정 결과 (bug-execute, Phase 17-02)

- `UploadFilesDialog.tsx`: 두 입력에 `sr-only`·`tabIndex={-1}`·`aria-label`·ref 적용, "파일 선택"/"폴더째 선택" `type=button` 버튼이 `click()`으로 연다. 첨부 모드에서는 폴더 입력·버튼을 렌더하지 않는 기존 동작 유지.
- 자동 검증: `tests/ai/upload-files-dialog.test.ts` 7개 통과, ESLint `--max-warnings=0`·tsc 통과.
- 남은 일: 실제 모바일/브라우저 선택창·시각 확인은 17-06 checkpoint 후 `bug-complete`로 `.planning/fixed/16-NN ...`에 이관.
