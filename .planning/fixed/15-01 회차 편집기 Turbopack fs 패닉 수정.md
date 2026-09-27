---
id: 15-01
title: 회차 편집기 열람 시 Turbopack 청킹 패닉 (node:fs/promises가 클라이언트 번들에 유입)
fixed: 2026-09-27
files:
  - app/studio/[workId]/chapters/[chapterId]/ai-panel/quick-add-folders.ts
  - app/studio/[workId]/chapters/[chapterId]/ai-panel/MentionAutocomplete.tsx
  - lib/ai/mentions.ts
  - lib/kb/templates.ts
  - tests/studio/client-bundle-fs-free.test.ts
---

# 15-01: 회차 편집기 Turbopack fs 패닉 수정

> 처음에는 Phase 04 `BUG-04`로 기록됐으나, 재조사 결과 원인이 Phase 15-07(`72faac3`)에 있어 Phase 15 `BUG-01`로 옮겨 처리했다.

## 증상

`next dev`(Turbopack)에서 회차 편집기(`/studio/[workId]/chapters/[chapterId]`)에 들어가면 "An unexpected Turbopack error occurred" 화면이 뜨고, 서버 로그에 `the chunking context (unknown) does not support external modules (request: node:fs/promises)` 패닉이 반복됐다. `.next`를 지워도 재현됐다.

## 원인

15-07에서 새로 만든 클라이언트용 리듀서 `quick-add-folders.ts`가 `FOLDER_COPY`를 `'use server'`가 아닌 일반 서버 모듈 `lib/kb/actions.ts`의 재수출로 **값 import**했다. 그 결과 아래 체인이 브라우저 청크로 딸려 들어갔다.

```
page.tsx → MentionAutocomplete.tsx → QuickAddDialog.tsx → quick-add-folders.ts
 → lib/kb/actions.ts → lib/kb/templates.ts → node:fs/promises
```

최초 문서가 원인으로 지목한 `MentionAutocomplete`의 `import type`(번들에서 지워짐)과 `'use server'` 파일 너머의 `lib/ai/mentions.ts`(클라이언트는 참조 stub만 받음)는 원인이 아니었다.

## 수정

- `quick-add-folders.ts`: `FOLDER_COPY`를 fs-free 원본 `@/lib/kb/folder-copy`에서 가져오고, 타입은 `import type`으로 `lib/kb/actions`에서 가져옴.
- `lib/kb/templates.ts`에 `import 'server-only'` 추가 — 재발 시 Turbopack 패닉 대신 명확한 빌드 에러.
- 정리: `MentionAutocomplete.tsx`, `lib/ai/mentions.ts`의 `KbCategory`/`KB_CATEGORIES` import를 `@/lib/kb/categories`로.
- 회귀 테스트 `tests/studio/client-bundle-fs-free.test.ts`: `app/`·`components/`의 모든 `'use client'` 모듈에서 TypeScript AST로 런타임 import 그래프를 따라가 `fs`/`path`/`child_process`/`os`/`crypto`/`server-only` 도달을 금지.

## 검증

- 회귀 테스트는 수정 전 상태에서 위 체인을 보고하며 실패, 수정 후 통과. 관련 테스트(`quick-add-folders`, `mention-search`)와 `tsc --noEmit` 통과.
- `next build`: 수정 후 전 라우트 컴파일 성공. `quick-add-folders.ts`만 되돌리면 Turbopack이 같은 체인(`[Client Component Browser]`)을 지목하며 실패 — 원인 확정.
- Chrome(로그인 세션) + `.next` 삭제 후 `next dev`: 회차 편집기 정상 표시, `@새캐릭터` 입력 → 빠른 추가 다이얼로그 열림, 저장 폴더 목록 로드. 서버 에러 0건.
- 전체 스위트의 `tests/auth/writer-upgrade.test.ts` 1건 실패는 수정 전 HEAD에서도 동일한 기존 실패(무관).

## 커밋

- `3764da4` — `fix(15): BUG-01 keep fs out of chapter editor client bundle`
- `4106abd` — `docs(15): BUG-01 chapter editor Turbopack fs panic (moved from Phase 04 BUG-04)`

별건: QuickAddDialog 열 때 Base UI `Select` uncontrolled→controlled 콘솔 경고 1건이 관찰됐으나 이 버그와 무관해 범위 밖으로 남김.
