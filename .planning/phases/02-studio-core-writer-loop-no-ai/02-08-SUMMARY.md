---
phase: 02-studio-core-writer-loop-no-ai
plan: "08"
subsystem: kb-templates
tags: [templates, server-actions, reopen-d10, copy, tdd]
gap_closure: true
requirements: [KB-01]
dependency_graph:
  requires: [02-07 (0022/0023 locked defaults, area name unique index, seedTemplateFiles locked contract)]
  provides:
    - copyTemplateFile(supabase,{ownerId,workId,nodeId,name}) -> NodeMutationResult
    - locked default template guard in saveNodeContent/renameNode/deleteNode/moveTemplateFile
    - FRIENDLY_LOCKED_TEMPLATE / FRIENDLY_TEMPLATE_NAME_COLLISION / FRIENDLY_TEMPLATE_NAME_RESERVED
    - listTemplateOptions canonical-only default (id null, single isDefault)
  affects: [02-09 (copy wrapper + 기본 템플릿 UI), Phase 15 validateTargetTemplate(null) consumers]
tech_stack:
  added: []
  patterns: [owner-scoped source re-read before every mutation, DB guard error -> friendly copy mapping]
key_files:
  created:
    - tests/kb/template-policy.test.ts
    - tests/kb/template-copy.test.ts
  modified:
    - lib/kb/actions.ts
    - tests/kb/template-options.test.ts
    - tests/kb/template-tree-mutations.test.ts
decisions:
  - "Auto default is always the canonical seed: resolveTemplateOverride removed; createNode treats templateOverrideContent undefined and null the same (canonical)"
  - "listTemplateOptions lists only unlocked owner-scoped files; canonical stays last with id null + isDefault so validateTargetTemplate(null) contract is unchanged"
  - "Locked-default rejection happens app-side after an owner-scoped read (no write issued); DB guard errors are still mapped as a second line"
  - "Template-file 23505 and template_name_reserved map to template-specific copy; ordinary documents keep the generic file/folder collision copy"
  - "copyTemplateFile returns generic failure copy for unexpected DB errors instead of raw messages"
metrics:
  duration: "~35m"
  completed: 2026-10-13
  tasks: 2
  files: 5
---

# Phase 02 Plan 08: 템플릿 사본·불변성·중복 이름 서버 계약 Summary

기본 템플릿(잠긴 template file)의 저장·이름 변경·삭제·이동을 Server Action 경계에서 쓰기 전에 거부하고, 원문 그대로 같은 카테고리 폴더에 잠금 없는 사본을 만드는 `copyTemplateFile`을 추가했다. 새 문서의 자동 기본 양식은 canonical 하나로 고정하고, 사용자 템플릿은 영역(scope)·id로 구분해 명시적으로만 선택된다. 0023 DB 제약(영역 내 이름 유일·예약 이름·잠금 guard) 오류는 사용자 문구로 바꾼다.

## What was built

| Task | Step | Commit | Files |
|------|------|--------|-------|
| 1 | RED | d344789 | tests/kb/template-policy.test.ts, tests/kb/template-copy.test.ts |
| 1 | GREEN | d839ea5 | lib/kb/actions.ts, tests/kb/template-copy.test.ts |
| 2 | RED | 9689481 | tests/kb/template-policy.test.ts |
| 2 | GREEN | 2c2b905 | lib/kb/actions.ts, tests/kb/template-options.test.ts, tests/kb/template-tree-mutations.test.ts |

REFACTOR 단계는 별도 변경이 없어 커밋하지 않았다.

### lib/kb/actions.ts
- `readMutationSource`: `checkWriteAccess` 다음에 `owner_id`·`deleted_at is null`로 대상 행을 읽는다. 없으면 `문서를 찾을 수 없어요.`, 조회 오류면 일반 안내 문구. 이 경우 쓰기를 하지 않는다.
- `saveNodeContent` / `renameNode` / `deleteNode` / `moveTemplateFile`: 잠긴 template file이면 `기본 템플릿은 수정·이름 변경·삭제·이동할 수 없어요. 사본을 만들어 수정해주세요.`로 거부한다. DB guard(`locked_template_immutable`·`locked_node_immutable`)가 걸리면 template file은 같은 문구, 구조 폴더는 기존 `기본 폴더는…` 문구를 낸다. 일반 문서 CRUD와 제재 검사는 그대로다.
- `copyTemplateFile`: 이름을 trim하고 빈 이름은 거부 → 쓰기 권한 검사 → 소유자의 활성 template file인지 확인(작품 source는 `work_id = workId`, 계정 source는 `work_id = null`) → 부모와 root를 `templateCategoryOf`와 같은 영역 조건으로 재검증 → `is_locked:false`, `content = source.content`(원문 그대로)로 insert 한 번. 이름은 서버가 정하지 않는다. `23505`는 `이미 같은 이름의 템플릿이 있어요. 다른 이름을 사용해주세요.`, `template_name_reserved`는 `기본 템플릿 이름은 사용할 수 없어요. 다른 이름을 사용해주세요.`, 그 밖의 오류는 일반 문구로 바꾸고 원문 DB 메시지는 노출하지 않는다.
- `listTemplateOptions`: 기본값은 canonical 하나(`id:null`, `isDefault:true`)뿐이다. 잠긴 작품·계정 기본 파일은 목록에서 뺀다. 작품 root·카테고리 폴더·파일 조회에 모두 `owner_id`를 걸었다. 이전에는 작품 root를 `work_id`로만 찾았다. `validateTargetTemplate(null)`은 계속 canonical을 돌려준다.
- `createNode`: `resolveTemplateOverride`(카테고리 이름 파일 자동 적용)를 없앴다. 선택값이 없거나 `null`이면 canonical, 문자열이면 그 원문으로 `buildSeedContent`(제목 치환)를 탄다. `initialContent` 계약과 template 생성 시 canonical만 쓰는 동작은 그대로다. template의 `23505`/예약 이름 오류는 템플릿 문구로 바꾼다.
- `renameNode`: template file의 `23505`/예약 이름 오류는 템플릿 문구로, 일반 문서는 기존 파일/폴더 중복 문구로 낸다.

### 이전 Codex 초안 처리
남아 있던 untracked 초안 `tests/kb/template-copy.test.ts`와 `tests/kb/template-policy.test.ts`를 계획과 대조해 채택했다. mock은 쿼리 경계(select 컬럼 projection, eq/is 필터, insert/update 캡처)만 흉내 내고 DB trigger는 흉내 내지 않는다. copy 테스트에서 쓰지 않는 상수 두 개를 지우고, 예약 이름 매핑과 원문 DB 메시지 비노출 케이스를 추가했다. policy 테스트에는 Task 2 동작(기본값 선택, 이름 충돌, 사용자 템플릿 이동)을 덧붙였다.

## Verification (실제 실행한 명령)

| 명령 | 결과 |
|------|------|
| `npx vitest run --project unit tests/kb/template-policy.test.ts tests/kb/template-copy.test.ts` (Task 1 RED) | 50 failed / 14 passed |
| 같은 명령 (Task 1 GREEN) | 66 passed |
| `npx vitest run --project unit tests/kb/template-policy.test.ts` (Task 2 RED) | 5 failed / 37 passed (rename·move 케이스는 Task 1 구현으로 이미 통과) |
| `npx vitest run --project unit tests/kb/template-policy.test.ts tests/kb/template-copy.test.ts tests/kb/template-substitution.test.ts` (Task 2 GREEN) | 3 files, 84 passed |
| `npx vitest run --project unit tests/kb tests/studio tests/admin` (Task 1 후 회귀 확인) | 19 files, 375 passed |
| `npx vitest run --project unit` (전체 unit) | 77 files 통과, 1077 tests passed. 실패 3개 파일은 다른 작업이 남긴 untracked `tests/payments/*.test.ts`이고 없는 route 모듈을 import하다 실패한다(범위 밖, 손대지 않음) |
| `npx tsc --noEmit` | 이 plan 파일 오류 0. 같은 untracked `tests/payments/*` 3건의 TS2307만 있다(범위 밖) |

## Pending gates (02-13)

- **`tests/kb/template-options.test.ts`, `tests/kb/template-tree-mutations.test.ts`는 `--project db` suite라 실행하지 않았다.** 실DB가 없다. fixture는 바꿨다: 카테고리 이름 편집본 → `인물 사본` 사본으로, 자동 기본 = canonical, 명시 선택 = 고른 원문, 카테고리 간 같은 이름 생성 성공 → 영역 내 중복 거부(다른 영역은 허용), 일반 사용자 템플릿 이동과 미분류 양식 정리 케이스는 유지했다. 0022·0023이 적용된 DB에서 02-13 Task 2가 통과해야 DB 검증 완료로 기록한다. 위 unit 통과를 두 DB suite 통과로 보지 않는다.
- 0023 trigger 자체(잠긴 행 UPDATE·예약 이름·영역 위장 거부)는 mock이 흉내 내지 않는다. 이것도 02-13 실DB에서 증명해야 한다.
- 브라우저 확인(사본 만들기 UI, 기본 템플릿 메뉴 비활성)은 02-09 UI 연결 뒤 02-13에서 한다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Security] 작품 템플릿 root·카테고리 폴더 조회에 owner 필터 누락**
- **Found during:** Task 2
- **Issue:** `listTemplateOptions`가 작품 template root를 `work_id`로만, 카테고리 폴더·파일을 `parent_id`로만 찾았다. service-role(admin) 클라이언트로 호출하면 다른 소유자의 행도 대상이 될 수 있었다.
- **Fix:** 모든 조회에 `owner_id`를 추가하고 작품 root에는 `scope='work'`도 걸었다. 다른 소유자의 위장 root fixture가 선택 불가인지 테스트로 확인했다.
- **Files modified:** lib/kb/actions.ts
- **Commit:** 2c2b905

**2. [Rule 2 - Critical] DB 원문 오류 메시지 노출 축소**
- **Found during:** Task 1
- **Issue:** 02-07이 넘긴 후속 과제다. `template_name_reserved`, `locked_template_immutable`, `locked_node_immutable`이 원문 그대로 UI에 나갔다.
- **Fix:** 세 코드 모두 사용자 문구로 바꿨고, copy의 예상 밖 오류도 일반 문구로 낸다. 단, 기존 일반 CRUD의 그 밖의 `error.message` 반환은 계획 범위 밖이라 그대로 두었다.
- **Commit:** d839ea5, 2c2b905

**3. [Rule 3 - Tooling] 초안 정리 스크립트 미실행**
- **Found during:** Task 1 RED
- **Issue:** `python3`가 Windows Store stub이라 정리 스크립트가 돌지 않았고, RED 커밋(d344789)에는 초안 원본이 들어갔다.
- **Fix:** Edit 도구로 같은 정리를 해서 GREEN 커밋(d839ea5)에 포함했다. 테스트 의미는 바뀌지 않았다.

## Notes for later plans
- `components/studio/kb-node-dialogs.tsx`의 주석("category-name match")은 이제 맞지 않는다. 동작은 `isDefault` 기준이라 정상이다. UI 소유 plan(02-09)에서 고친다.
- `copyTemplateFile`의 Server Action wrapper와 기본 템플릿 메뉴(`사본 만들기`만 활성)는 02-09에서 연결한다.

## Known Stubs

None.

## Self-Check: PASSED
