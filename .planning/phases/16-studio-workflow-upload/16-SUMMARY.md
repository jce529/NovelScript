---
phase: 16-studio-workflow-upload
plan: unplanned
duration: not-recorded
completed: 2026-10-02
type: retrospective
status: complete-unverified
subsystem: studio-ai
tags: [byok, ai-panel, upload, jev, dnd-kit, responsive]
requires:
  - phase: 10-byok
    provides: BYOK key list (listByokKeys) and settings page
  - phase: 15-jev-ai
    provides: DecisionClient, planFolderAndTemplate, validateTargetFolder
affects: [11-byok-ux]
key-files:
  created:
    - lib/ai/attachments.ts
    - app/studio/[workId]/chapters/[chapterId]/ai-panel/UploadFilesDialog.tsx
    - app/studio/[workId]/chapters/[chapterId]/ai-panel/PlacementTree.tsx
    - tests/ai/upload-classify.test.ts
  modified:
    - app/account/page.tsx
    - app/studio/[workId]/kb/[nodeId]/page.tsx
    - app/studio/[workId]/chapters/[chapterId]/actions.ts
    - app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanel.tsx
    - app/studio/[workId]/layout.tsx
    - lib/ai/chat.ts
    - lib/ai/document-plan.ts
    - lib/ai/prompt.ts
    - lib/ai/decision/plan.ts
requirements-completed: [STUDIO-01, STUDIO-02, STUDIO-03, STUDIO-04]
---

# Phase 16 Summary (retrospective)

GSD 계획 흐름 밖에서 구현됐다. 실제 PLAN은 만들지 않았고 이 문서가 회고형 요약이다.

## 구현 내용

- **STUDIO-01**: `/account`(작가)에 OpenAI·Anthropic·Gemini 연결 상태 + 키 끝 4자리 요약, 설정 페이지 링크.
- **STUDIO-02**: 설정 문서 페이지에 AiPanel 재사용. `chatAction`이 `chapterId` 또는 `nodeId` 중 정확히 하나를 받고, `getNodeAiContextAction`이 기본 모델·BYOK 모델·장르를 제공한다. `contextKind: 'document'`로 프롬프트 머리말이 바뀐다.
- **STUDIO-03**: `UploadFilesDialog` 3방식(저장 / 대화 첨부 / AI 자동 분류). 자동 분류는 `classifyUploadFilesAction`(Jev, 저장 없음) → `PlacementTree`(기존 카테고리 트리 + 제안 배치, `@dnd-kit` 드래그앤드롭) → `importClassifiedFilesAction`(폴더 재검증 후 저장). `planCategoryOnly`를 `lib/ai/decision/plan.ts`에 추가.
- **STUDIO-04**: 작품 레이아웃 사이드바 접이식(`md` 미만), AiPanel 세로 스택, 페이지 여백 축소, 업로드 다이얼로그 스크롤.

## 알려진 제약

- 설정 문서 AI 채팅의 BYOK 모델 전송은 Phase 11 전까지 불가(`CHAT_COPY.byokPending`).
- 업로드 자동 분류는 Jev 활성화 게이트(Phase 15 AIDOC-04, `ai_doc_planning` 모드)와 별개로 Jev 연결만 있으면 동작한다. 정책 검토 전 실제 작품 본문 전송 여부는 미결정.
- 서버 액션 `classifyUploadFilesAction`·`importClassifiedFilesAction`에 대한 단위 테스트 없음(헬퍼·`planCategoryOnly`만 테스트).
