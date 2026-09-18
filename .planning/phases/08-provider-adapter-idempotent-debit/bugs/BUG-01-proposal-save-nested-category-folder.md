---
id: BUG-01
title: 하위 폴더가 있는 카테고리에서 AI 문서 제안 저장·빠른 추가 실패
status: open
severity: high
found: 2026-09-18
found_during: 08-09 체크포인트 (실제 Gemini, Chrome)
origin_phase: 04 (f407a3d, 6f3fc80)
phase8_regression: false
files:
  - lib/ai/mentions.ts
  - app/studio/[workId]/chapters/[chapterId]/actions.ts
---

# BUG-01: 하위 폴더가 있는 카테고리에서 AI 문서 제안 저장·빠른 추가 실패

## 증상

AI 패널에서 문서 제안의 **"문서로 저장하기"** 를 누르면 토스트 `카테고리 폴더를 찾을 수 없어요.`가 뜨고 문서가 만들어지지 않는다.
같은 함수를 쓰는 **@멘션 빠른 추가(QuickAddDialog)** 도 같은 카테고리에서 똑같이 실패한다.

## 재현

1. 작품의 카테고리 폴더 안에 하위 폴더를 만든다. 예: `인물` → `서브인물`
2. 챕터 편집기 AI 패널에서 "이 이야기에 어울리는 새 인물 설정 문서를 하나 제안해줘"를 보낸다.
3. 응답의 `[인물] …` 제안 아래 **문서로 저장하기**를 누른다.

재현된 작품: `버그 재현용 작품` (`e33f73fb-c36f-402e-9f20-1622aa04a01f`). 이 작품에는 카테고리가 `인물`인 폴더가 두 개 있다.

| name | category | root |
|---|---|---|
| 인물 | 인물 | true |
| 서브인물 | 인물 | false |

## 기대 / 실제

- **기대:** 제안한 문서가 해당 카테고리의 최상위 폴더에 저장되고 "문서로 저장됨 ✓"로 바뀐다.
- **실제:** `{ ok: false, error: '카테고리 폴더를 찾을 수 없어요.' }`가 반환되고 문서가 생성되지 않는다.

## 원인

`lib/ai/mentions.ts`의 `resolveCategoryFolderId`는 같은 작품·같은 카테고리의 폴더가 **정확히 하나**라고 가정하고 `.maybeSingle()`로 조회한다.

```ts
.from('kb_nodes').select('id')
  .eq('owner_id', ownerId).eq('work_id', workId)
  .eq('category', category).eq('node_type', 'folder')
  .is('deleted_at', null)
  .maybeSingle();
```

하위 폴더도 부모와 같은 `category` 값을 가지므로 두 행이 나오고, `maybeSingle`이 에러를 반환한다. 결국 `data`가 null이 되어 함수가 `null`을 돌려준다.

호출 경로:
- `quickAddMentionNode` (lib/ai/mentions.ts:83)
  - `quickAddMentionAction` (actions.ts:75)
  - 제안 저장 액션 (actions.ts:164)

## 수정 방향

- `create_work`(supabase/migrations 0002_studio.sql)가 시드하는 **최상위 카테고리 폴더**를 고르도록 조건을 추가한다. 후보는 `.is('parent_id', null)`인데, 적용 전에 이 전제가 맞는지 마이그레이션에서 확인한다.
- 최상위 폴더가 사용자에 의해 지워졌거나 옮겨진 경우의 동작도 함께 정한다(에러 유지 또는 가장 오래된 폴더 선택).

## 검증

- 실패하는 테스트를 먼저 작성한다: 같은 카테고리의 하위 폴더가 있는 상태에서 `resolveCategoryFolderId`가 최상위 폴더 id를 반환해야 한다.
- 수정 후 `npx vitest run tests/ai`와 `npx tsc --noEmit`을 통과시킨다.
- 브라우저에서 위 재현 절차로 저장 성공 토스트를 확인한다.

## 비고

Phase 8 변경(`chat()`, 프로바이더 어댑터)과 무관하다. 이 파일들은 Phase 4 이후 수정된 적이 없다. 수정은 별도 작업 칩("Fix AI proposal save when category has subfolders")으로 넘겨 두었다.
