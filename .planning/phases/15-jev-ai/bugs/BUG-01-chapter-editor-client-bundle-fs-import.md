---
id: BUG-01
title: 회차 편집기 열람 시 Turbopack 청킹 패닉 (node:fs/promises가 클라이언트 번들에 유입)
status: open
severity: high
found: 2026-09-27
found_during: Phase 15 Wave 6 수동 브라우저 UAT 준비 중 (사용자가 회차 생성/편집 화면 진입 시 재현)
origin_phase: 15 (72faac3 feat(15-07) — quick-add-folders.ts 신설)
files:
  - app/studio/[workId]/chapters/[chapterId]/ai-panel/quick-add-folders.ts
  - lib/kb/actions.ts
  - lib/kb/templates.ts
---

# BUG-01: 회차 편집기 열람 시 Turbopack 청킹 패닉

> 처음에는 Phase 04 `bugs/BUG-04`로 기록됐으나, 원인 재조사(2026-09-27) 결과 원인 코드가 Phase 15-07에서 들어온 것으로 확인되어 이 폴더로 옮겼다.

## 증상

회차를 생성하거나 기존 회차 편집 화면(`/studio/[workId]/chapters/[chapterId]`)에 들어가면 다음 런타임 오류가 뜨고 페이지가 열리지 않는다.

```
Runtime Error
An unexpected Turbopack error occurred. Please see the output of `next dev` for more details.
```

`next dev` 서버 로그:

```
FATAL: An unexpected Turbopack error occurred. ...
Failed to write app endpoint /studio/[workId]/chapters/[chapterId]/page
Caused by:
- the chunking context (unknown) does not support external modules (request: node:fs/promises)
```

## 재현

1. `npm run dev` (Turbopack, Next 16.3.2) 실행.
2. 아무 작품의 회차 상세(`/studio/{workId}/chapters/{chapterId}`)로 이동.
3. 즉시 위 Runtime Error. `.next` 캐시를 지워도 동일(코드 문제).

## 기대 / 실제

- 기대: 회차 편집기 페이지가 정상적으로 열리고 AI 패널·멘션 자동완성·빠른 추가가 동작한다.
- 실제: 라우트의 브라우저 청크에 `node:fs/promises`가 포함되어 Turbopack이 패닉을 일으키고 라우트가 컴파일되지 않는다.

## 원인

회차 편집기 페이지의 클라이언트 import 그래프(`import type`은 제외, `'use server'` 경계에서 멈춤)를 따라가면 fs에 도달하는 값 import 경로가 정확히 하나 있다:

```
app/studio/[workId]/chapters/[chapterId]/page.tsx ('use client')
 → ai-panel/MentionAutocomplete.tsx
 → ai-panel/QuickAddDialog.tsx:12          import { ... } from './quick-add-folders'
 → ai-panel/quick-add-folders.ts:1         import { FOLDER_COPY, ... } from '@/lib/kb/actions'   ← 값 import
 → lib/kb/actions.ts:3                     import { buildSeedContent, readCanonicalSeed } from './templates'
 → lib/kb/templates.ts:2                   import { readFile } from 'node:fs/promises'
```

- `quick-add-folders.ts`는 `72faac3 feat(15-07): QuickAddDialog real folder picker`(2026-09-27)에서 새로 만든 클라이언트용 리듀서 모듈이다. `FOLDER_COPY`를 `lib/kb/actions.ts`의 재수출(`export { FOLDER_COPY } from './folder-copy'`)로 가져왔다.
- `lib/kb/actions.ts`는 `'use server'`가 없는 일반 서버 모듈이므로, 클라이언트에서 값 하나만 가져와도 모듈 전체(→ `templates.ts` → `node:fs/promises`)가 브라우저 청크로 딸려 온다.
- `FOLDER_COPY`의 원래 정의 위치는 fs가 없는 `lib/kb/folder-copy.ts`이며, 같은 Phase의 `SaveDocumentPlanModal.tsx`(15-06)는 이미 그쪽에서 가져오고 있다.

### 최초 문서(Phase 04 BUG-04)의 오진

- `MentionAutocomplete.tsx`의 `import type { KbCategory } from '@/lib/kb/templates'`는 타입 전용이라 번들 시 지워진다 — 원인 아님.
- `actions.ts`('use server') → `lib/ai/mentions.ts` → `templates.ts`: 클라이언트는 Server Action 파일의 참조 stub만 받으므로 원인 아님. 게다가 `actions.ts:10` → `lib/kb/actions` → `templates.ts` 경로는 그 "수정" 후에도 남아 있었다.
- 당시 "패닉 0건" 검증은 같은 세션에 해당 라우트가 `ENOENT: build-manifest.json`을 반환해 실제 컴파일 성공을 증명하지 못했다.
- 해당 두 import를 `lib/kb/categories`로 옮긴 변경은 해는 없는 정리이므로 유지한다.

## 수정 방향

1. `quick-add-folders.ts:1`을 fs-free 경로로 교체:
   ```ts
   import { FOLDER_COPY } from '@/lib/kb/folder-copy';
   import type { FolderCandidate, FolderCandidatesResult } from '@/lib/kb/actions';
   ```
2. 이미 워킹 트리에 있는 정리 유지: `MentionAutocomplete.tsx`, `lib/ai/mentions.ts`의 `KbCategory`/`KB_CATEGORIES` import를 `@/lib/kb/categories`로.
3. 방어선: `lib/kb/templates.ts` 최상단 `import 'server-only';` — 앞으로 fs 모듈이 클라이언트 그래프에 섞이면 Turbopack 패닉 대신 명확한 `server-only` 빌드 에러가 난다.
4. 회귀 테스트: 회차 편집기 페이지에서 시작해 클라이언트 값 import 그래프를 따라가며 `node:fs`/`fs/promises`/`templates.ts`에 도달하지 않음을 검사하는 정적 테스트 추가.

정책 결정이 필요 없는 순수 코드 수정.

### 적용 내역 (2026-09-27, bug-execute)

- 1~3 모두 적용. 회귀 테스트는 `tests/studio/client-bundle-fs-free.test.ts` — `app/`·`components/`의 모든 `'use client'` 모듈에서 TypeScript AST로 런타임 import 그래프를 따라가며 `node:fs`/`path`/`child_process`/`os`/`crypto`/`server-only` 도달을 금지한다(`import type`·전부 type인 named import 제외, `'use server'` 파일에서 정지).
- 수정 전 상태에서 테스트가 위 체인을 정확히 보고하며 실패함을 확인.

## 검증

- 새 회귀 테스트 + 기존 `tests/ai/quick-add-folders.test.ts` 등 전체 `vitest run` 통과, `tsc --noEmit` 통과.
- `.next` 삭제 후 `next dev`에서 회차 편집기 URL 요청 → 200 응답, 서버 로그에 `panic`/`server-only` 에러 없음, 빠른 추가 다이얼로그 열림 확인.

### 검증 결과 (2026-09-27)

- 새 회귀 테스트 + `tests/ai/quick-add-folders.test.ts` + `tests/ai/mention-search.test.ts` 통과. `tsc --noEmit` 통과.
- 전체 `vitest run`: 병렬 실행 시 DB 통합 테스트들이 deadlock/Auth 오류로 흔들림 → `--no-file-parallelism` 재실행 시 `tests/auth/writer-upgrade.test.ts` 1건만 실패하며, 이는 수정 전 HEAD에서도 동일하게 실패(무관한 기존 실패).
- `next build`(Turbopack): 수정 후 전 라우트 컴파일 성공. `quick-add-folders.ts` 수정만 되돌리면 빌드가 `server-only` 에러로 실패하고 Turbopack이 `page.tsx → MentionAutocomplete → QuickAddDialog → quick-add-folders.ts [Client Component Browser]` 체인을 직접 보고 — 원인 확정.
- Chrome(로그인 세션) + `.next` 삭제 후 `next dev`: 회차 편집기 정상 표시, 원고에서 `@새캐릭터` 입력 → "새 문서 만들기" 제안 → QuickAddDialog 열림, 저장 폴더 목록(인물 (최상위)/서브인물) 로드 확인. 서버 에러 로그 0건. (테스트 입력은 저장 없이 새로고침으로 폐기)
- 별건 관찰: QuickAddDialog 열 때 브라우저 콘솔에 Base UI `Select` uncontrolled→controlled 경고 1건 — 이 버그와 무관.
