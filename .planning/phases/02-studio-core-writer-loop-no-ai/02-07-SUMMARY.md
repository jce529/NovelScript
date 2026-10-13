---
phase: 02-studio-core-writer-loop-no-ai
plan: "07"
subsystem: kb-templates
tags: [templates, migration, rls, guard, reopen-d10]
gap_closure: true
requirements: [KB-01, KB-02]
dependency_graph:
  requires: [0002_studio.sql, 0004_kb_custom_folders.sql, 0008_sanction_enforcement.sql, 0012_template_category_folders.sql]
  provides:
    - kb_template_seed_catalog (private canonical seed catalog)
    - kb_template_backfill_copies (private provenance)
    - kb_nodes_template_area_name_unique (owner+work area name uniqueness)
    - guard_kb_template_policy trigger (locked default / reserved name / parent spoof guard)
    - seedTemplateFiles locked-default contract (SeedTemplateResult)
  affects: [lib/kb/actions.ts createNode/renameNode/saveNodeContent on template files, 02-08~02-13]
tech_stack:
  added: []
  patterns: [trigger-only SECURITY DEFINER guard reading a private catalog, deterministic rename-on-collision migration]
key_files:
  created:
    - supabase/migrations/0022_template_readonly_backfill.sql
    - supabase/migrations/0023_template_policy_guards.sql
    - tests/kb/template-migration-source.test.ts
    - tests/kb/template-seeding.test.ts
    - tests/kb/template-policy-migration.test.ts
  modified:
    - lib/kb/templates.ts
    - tests/studio/schema-smoke.test.ts
decisions:
  - "Canonical seed = docs/Template original with CR removed and leading BOM kept; readCanonicalSeed and the 0022 catalog both strip CR so Windows (core.autocrlf) and Linux produce identical bytes"
  - "Edited-default detection ignores CR and leading BOM differences, so unedited CRLF-seeded rows are restored in place without a spurious copy"
  - "Guard is a trigger-only SECURITY DEFINER function (search_path pinned, EXECUTE revoked) so the catalog stays private; caller identity via auth.uid(), no custom GUC"
  - "Locked nodes can no longer be unlocked (guard_locked_kb_node extended); locked nodes cannot be hard-deleted"
  - "Template area unique index keys on owner_id + coalesce(work_id) + btrim(name); reserved default names are kept by locked defaults and user templates holding them get ' (N)'"
  - "seedTemplateFiles returns {created, existing, blocked} and still throws for missing root/folder and query errors (callers' behavior unchanged); 23505 race re-checks state"
metrics:
  duration: "~1h"
  completed: 2026-10-13
  tasks: 3
  files: 7
---

# Phase 02 Plan 07: 수정된 기본 템플릿 보존 이관과 DB 잠금 Summary

기본 템플릿 5종을 읽기 전용으로 바꾸는 데이터 이관(0022: 수정본은 `{카테고리} 사본`으로 byte 그대로 보존 → 원본 복원·잠금 → 누락 기본 채움)과 DB 경계 guard(0023: 영역 내 이름 유일 인덱스, 잠금 해제·위장 seed·예약 이름·영역 위장 차단)를 작성하고, `seedTemplateFiles`를 잠긴 canonical seed 계약으로 전환했다. 실DB 적용과 integration suite 실행은 02-13 게이트로 넘긴다.

## What was built

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | 예약 번호 이관 SQL + 잠금 제약 + source 계약 테스트 | 55493ae | 0022, 0023, tests/kb/template-migration-source.test.ts |
| 2 (RED) | 잠금 seed 계약 실패 테스트 | d05390c | tests/kb/template-seeding.test.ts |
| 2 (GREEN) | seed를 잠금 정책으로 전환 | abf38bc | lib/kb/templates.ts |
| 3 | 실DB 검증 suite(opt-in) + smoke 역사 replay 분리 | be4ed22 | tests/kb/template-policy-migration.test.ts, tests/studio/schema-smoke.test.ts, tests/kb/template-migration-source.test.ts |

### 0022_template_readonly_backfill.sql
- `begin` → `lock table kb_nodes in exclusive mode` → … → `commit` (부분 이관 없음).
- `kb_template_seed_catalog`: docs/Template 5종 원문을 dollar quote로 담음(`chr(65279) ||` BOM + 본문, `replace(…, chr(13), '')`). RLS on, `revoke all … from public, anon, authenticated`.
- `kb_template_backfill_copies(original_id PK, copy_id unique)`: 같은 원본을 두 번 복사하지 않음. 이미 보존한 원본이 다시 달라졌으면 조용히 덮지 않고 `template_backfill_conflict`로 실패.
- 대상은 활성 root → 활성 카테고리 폴더 안의 `name = 폴더 이름` 파일만. 이름 변경·이동된 파일은 추측하지 않고 사용자 템플릿으로 남김. 삭제 행·일반 문서·사용자 폴더·회차는 건드리지 않음.
- 사본 이름 충돌은 `{카테고리} 사본`, ` 2`, ` 3` … (같은 영역 template 이름·같은 부모 sibling 둘 다 피함).

### 0023_template_policy_guards.sql
- 같은 영역에 잠긴 기본이 같은 이름으로 둘 이상이면 `duplicate_default_templates`로 실패(사람이 정리).
- 기존 충돌 정리: 영역별 (잠긴 기본 우선, created_at, id) 순서 첫 이름 유지, 나머지와 예약 이름을 쓰는 사용자 템플릿은 `{이름} (N)`. 내용·id 보존.
- `kb_nodes_template_area_name_unique (owner_id, coalesce(work_id), btrim(name)) where file/template/active`. 부모·카테고리는 키에 없음.
- `guard_locked_kb_node` 확장: 잠긴 노드 잠금 해제 금지.
- `guard_kb_template_policy` (BEFORE INSERT/UPDATE/DELETE, trigger 전용 SECURITY DEFINER, `search_path` 고정, EXECUTE revoke): 잠긴 기본 파일 열 변경(`locked_template_immutable`)·잠긴 노드 hard DELETE·위장 잠금 INSERT/잠금 전환(`invalid_template_seed`: 소유 root 바로 아래 잠긴 카테고리 폴더 + 정확한 이름 + catalog와 같은 내용만 허용)·예약 이름(`template_name_reserved`)·다른 영역 부모(`template_parent_invalid`)·소유자 위장(`template_owner_invalid`)을 거부. 사용자 GUC 우회 없음, profiles 무변경.

### lib/kb/templates.ts
- `KbNodeInsert.is_locked: true`, `seedTemplateFiles`는 root를 owner/scope/work로 재검증 후 카테고리 폴더별로 잠긴 기본(existing, 무쓰기) / 기본 이름을 쥔 잠금 없는 파일(blocked, 덮어쓰지 않음) / 없음(created) 분류. 반환 `SeedTemplateResult`. 동시 seed 23505는 재조회 후 실제 상태 보고.
- `readCanonicalSeed`는 CR 제거(아래 Deviation 1). `buildSeedContent`/`substituteTitle` 무변경. server-only 유지, client는 categories.ts만 value import(번들 테스트 통과).

## Verification (실제 실행한 명령)

| 명령 | 결과 |
|------|------|
| `npx vitest run --project unit tests/kb/template-migration-source.test.ts` | 19 passed (Task 1 직후 15, Task 3에서 4 추가) |
| `npx vitest run --project unit tests/kb/template-seeding.test.ts tests/kb/template-substitution.test.ts tests/studio/client-bundle-fs-free.test.ts` | RED 15 failed → GREEN 23 passed |
| `npx vitest run --project unit tests/kb tests/studio` | 8 files, 62 passed |
| `npx vitest run --project db tests/kb/template-policy-migration.test.ts` (opt-in 없음) | 10 skipped (수집 오류 없음) |
| `npx tsc --noEmit` | 이 plan 파일 오류 0. 기존 `app/layout.tsx(22,50) LayoutProps` 1건만 — Next 생성 타입(`.next/types`)이 이 워크트리에 없어서 나는 기존 오류(범위 밖) |
| 로컬 PGlite 정합성 점검(스크래치, 커밋 안 함) | 0002→0004→0010→0012 위에 이관 전 fixture 구성 후 0022→0022→0023→0023→0022: 32/32 PASS (보존/복원/누락 채움/이름 충돌/두 영역/재실행, authenticated 역할의 UPDATE·잠금 해제·DELETE·위장 INSERT·예약 이름·영역 위장·동일 영역 중복 거부, 정상 seed 허용) |

PGlite 점검은 SQL 문법·로직 sanity check일 뿐이며 Supabase(PostgREST·실제 auth·실데이터) 검증을 대신하지 않는다.

## Pending gates (02-13)

- **실DB 미적용:** 0022·0023은 어떤 Supabase 프로젝트에도 적용하지 않았다. 이 워크트리에 `.env.local`(SUPABASE_DB_URL 등)이 없다.
- **`tests/kb/template-policy-migration.test.ts`**: 전용 disposable 프로젝트에서 `TEMPLATE_MIGRATION_DISPOSABLE_PROJECT_REF=<NEXT_PUBLIC_SUPABASE_URL의 ref>`로 opt-in 해서 실행해야 한다(공유 DB에서는 skip, ref 불일치면 즉시 실패). 0023 guard/index를 잠시 내리고 0004·0012를 재적용해 이관 전 fixture를 만든 뒤 0022→0023→재실행, 마지막에 최신 정책(guard trigger·index·잠금 해제 guard·0008 soft_delete 본문) 복원을 확인한다.
- **`tests/studio/schema-smoke.test.ts`**: 0022·0023 적용된 DB에서 `--project db`로 실행 필요(seed가 잠금 canonical인지, 잠긴 기본 content UPDATE 거부).
- **DB 검증 완료로 기록하지 않는다** — 위 두 suite가 02-13에서 통과하기 전까지.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] readCanonicalSeed가 작업 트리 줄바꿈에 따라 다른 바이트를 반환**
- **Found during:** Task 1
- **Issue:** 저장소 원본(index)은 LF인데 `core.autocrlf=true`라 Windows 작업 트리에서는 CRLF. `readCanonicalSeed`가 OS마다 다른 내용을 돌려줘서 0023 guard의 "정확한 canonical 내용" 검증이 Windows 개발 환경 seed를 거부하게 된다. 같은 이유로 SQL 파일 dollar quote 안에도 CR이 섞일 수 있다.
- **Fix:** `readCanonicalSeed`에서 CR 제거, 0022 catalog도 `replace(…, chr(13), '')`. 선두 BOM(U+FEFF, 원본 5종 모두 있음)은 원문 그대로 유지(SQL은 `chr(65279)`로 명시). 수정 여부 비교는 CR·선두 BOM 차이를 무시해 기존 CRLF seed가 가짜 "사본"을 만들지 않게 했다.
- **Files modified:** lib/kb/templates.ts, 0022
- **Commit:** 55493ae, abf38bc

**2. [Rule 2 - Critical] 잠금 해제 우회 차단**
- **Found during:** Task 1
- **Issue:** 0002 guard는 잠긴 노드의 이름·삭제만 막아 `is_locked=false`로 바꾼 뒤 수정하는 우회가 열려 있었다(구조 폴더 포함).
- **Fix:** 0023에서 `guard_locked_kb_node`가 잠금 해제도 거부. 계획의 "잠금 해제 차단"을 기본 템플릿뿐 아니라 모든 잠긴 노드에 적용.
- **Commit:** 55493ae

**3. [Rule 1 - Bug] 0004 재적용이 soft_delete_kb_node를 0008 이전 본문으로 되돌림**
- **Found during:** Task 3
- **Issue:** 기존 schema-smoke의 역사 replay(0004)는 0008의 쓰기 권한·소유자 검사가 들어간 `soft_delete_kb_node`를 옛 본문으로 덮어쓴다(공유 DB에서 실행되면 보안 회귀).
- **Fix:** 역사 replay를 opt-in 전용 DB suite로 옮기고, replay 직후 0008의 최신 정의를 다시 적용하며 마지막에 `write_access_denied` 포함 여부를 검사.
- **Commit:** be4ed22

### Notes for later plans (범위 밖, 수정하지 않음)
- `lib/kb/actions.ts`(이 plan 소유 아님): 기본 이름으로 템플릿을 만들거나 바꾸면 DB가 `template_name_reserved`, 잠긴 기본을 저장·이름 변경·이동하면 `locked_template_immutable`/`locked_node_immutable`를 원문 메시지로 돌려준다. 사용자 문구 매핑과 기본 템플릿 UI(사본 만들기만 활성)는 02-08 이후 plan 소관.
- `graphify update .` / `scripts/graph-link-requirements.py`는 병렬 워크트리 충돌을 피하려고 실행하지 않았다 — 병합 후 orchestrator가 한 번 실행해야 한다.

## Known Stubs

None.

## Self-Check: PASSED
