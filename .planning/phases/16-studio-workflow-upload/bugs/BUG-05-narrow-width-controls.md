---
id: BUG-05
title: 375px에서 AI 설정 모델 select 글자가 잘리고 업로드 다이얼로그 모드 버튼이 2+1로 줄바꿈됨
status: fixed-pending-device-check (Phase 17에서 수정, 사용자 브라우저 확인 대기)
severity: low (레이아웃, 기능 영향 없음)
found: 2026-10-25
found_during: Phase 17 UI 점검(Haiku 서브에이전트 + 직접 측정)
origin_phase: 16 (업로드 다이얼로그) / 9·11 (AI 설정 화면 모델 선택)
files:
  - app/studio/settings/ai-providers/page.tsx
  - app/studio/[workId]/chapters/[chapterId]/ai-panel/UploadFilesDialog.tsx
  - tests/ai/narrow-width-controls.test.ts
---

# BUG-05: 좁은 폭의 글자 잘림·줄바꿈

## 증상

- `/studio/settings/ai-providers`의 "제공자와 모델" 선택 칸이 375px에서 "Gemini 3.5 Flash [서비스 키] · 빠르고 저렴"의 끝을 말줄임 없이 잘라 보여준다(네이티브 `select`).
- 업로드 다이얼로그 상단 모드 버튼 3개("설정 문서로 저장 / AI 자동 분류 / 이번 대화에만 첨부")가 375px에서 2개 + 1개로 어색하게 줄바꿈된다.

## 원인

- select: 선택된 옵션 전체 문구("이름 [배지] · 설명")를 그대로 표시하고 `text-overflow` 처리가 없다. 측정: 글자 폭 256px, 쓸 수 있는 폭 약 247px(375px). 다른 옵션은 88~91자.
- 모드 버튼: `flex flex-wrap`이라 폭이 모자라면 자동으로 2+1로 내려간다(측정: 첫 줄 2개 y=220, 둘째 줄 1개 y=256).

## 수정

- select에 `min-w-0 truncate`(말줄임). 펼친 목록의 옵션은 기존 전체 문구 유지.
- 모드 버튼 그룹을 `flex-col gap-2 sm:flex-row sm:flex-wrap`, 버튼에 `w-full sm:w-auto`: 375px에서는 같은 폭으로 세로로 쌓고 640px 이상은 한 줄.

## 검증

- `tests/ai/narrow-width-controls.test.ts` 2건(수정 전 실패 → 통과), 기존 `upload-files-dialog.test.ts` 7건 통과.
- 브라우저 측정(375px): select `text-overflow: ellipsis`로 "… "처리됨, 모드 버튼 3개가 폭 295px로 세로 정렬(y=212/246/280).
- 남은 확인: 사용자 브라우저 확인 후 `bug-complete`.
