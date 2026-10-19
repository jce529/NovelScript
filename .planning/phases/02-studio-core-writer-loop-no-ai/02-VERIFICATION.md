---
phase: 02-studio-core-writer-loop-no-ai
verified: 2026-08-28T00:00:00Z
status: passed
score: 5/5 must-haves verified (35/35 plan-level sub-truths verified)
---

# Phase 2: Studio Core (Writer Loop, No AI) Verification Report

**Phase Goal:** Writers can build a knowledge base and draft/publish chapters, independent of AI assistance.
**Verified:** 2026-08-28
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Writer can create, edit, and delete KB documents across all 5 templates (인물/장소/사건/세력/아이템) | VERIFIED | `lib/kb/actions.ts` `createNode`/`saveNodeContent`/`deleteNode`, wired to UI via `components/studio/kb-node-dialogs.tsx` (`CreateNodeDialog`/`DeleteNodeDialog`) and `app/studio/[workId]/kb/[nodeId]/page.tsx` (single-textarea editor). `tests/kb/document-crud.test.ts` proves correct seeding for all 5 categories including the 사건 edge case. All 51 vitest tests pass against the live Supabase project. |
| 2 | Writer can view their KB documents in an IDE-style folder/file tree, organized by template type, scoped per work | VERIFIED | `lib/kb/tree.ts` (`buildTree`) + `lib/kb/actions.ts` (`getKbTree`, merges work-scoped + account-level template root) wired into `app/studio/[workId]/layout.tsx` → `components/studio/kb-tree.tsx`. `tests/kb/tree-query.test.ts` proves nesting + account-root merge + cross-owner isolation. |
| 3 | Writer can create and save a chapter draft with a title and order | VERIFIED | `lib/chapters/actions.ts` `createChapter`/`saveChapterContent` wired to `app/studio/[workId]/chapters/new/page.tsx` and `[chapterId]/page.tsx`. `tests/chapters/draft.test.ts` proves default order = max+1. |
| 4 | Writer can publish a chapter, marking it free or paid with a price | VERIFIED | `lib/chapters/actions.ts` `publishChapter` (zod-restricted to `PRICE_TIERS = [10,30,50,100]`) wired to `[chapterId]/page.tsx`'s free/paid `Button` toggle + `Select`. `tests/chapters/publish.test.ts` proves out-of-set tiers (e.g. 25) are rejected before any DB write. |
| 5 | Writer can edit or unpublish a chapter after publishing | VERIFIED | `saveChapterContent` works identically regardless of `is_published` (D-21); `unpublishChapter` is a distinct action that never touches `content` (D-22), confirmed byte-for-byte unchanged in `tests/chapters/edit-unpublish.test.ts`. UI's unpublish confirmation dialog uses `variant="outline"` only — never `destructive`. |

**Score:** 5/5 ROADMAP success criteria verified.

### Plan-Level Must-Haves (granular, from PLAN frontmatter)

| Plan | Truth | Status |
|------|-------|--------|
| 02-01 | works/kb_nodes/chapters schema live with ownership-scoped RLS | VERIFIED — `supabase/migrations/0002_studio.sql` applied; `tests/studio/schema-smoke.test.ts` passes |
| 02-01 | 6 fixed structural folders created atomically, immutable | VERIFIED — `guard_locked_kb_node` trigger + smoke test |
| 02-01 | Account-level template root idempotent | VERIFIED — `ensure_account_template_root` double-call test |
| 02-01 | Chapter reorder resequences without premature uniqueness violation | VERIFIED — `deferrable initially deferred` constraint + smoke test |
| 02-01 | 사건 template substitution handles missing placeholder | VERIFIED — `tests/kb/template-substitution.test.ts` |
| 02-02 | Writer creates work with title-only (D-03) | VERIFIED — `tests/works/work-crud.test.ts` |
| 02-02 | Work creation seeds 6 folders + 5 template files atomically (11 rows) | VERIFIED — asserted directly in test |
| 02-02 | Writer sees all works on dedicated 작품 목록 page (D-06) | VERIFIED — `app/studio/page.tsx` |
| 02-02 | Non-writer accounts blocked from /studio | VERIFIED — `app/studio/layout.tsx` redirects to `/write/start` |
| 02-02 | Writer never sees another writer's works | VERIFIED — `listWorks` scoped by `owner_id`, test asserts isolation |
| 02-02 | Genre select uses shadcn Select | VERIFIED — `app/studio/works/new/page.tsx` |
| 02-03 | Nested tree merges account-level template root | VERIFIED — `tests/kb/tree-query.test.ts` |
| 02-03 | New document seeded from correct template per Pattern 3 | VERIFIED — `tests/kb/document-crud.test.ts` |
| 02-03 | D-10 create-time template picker (arbitrary-named templates selectable) | VERIFIED — `tests/kb/template-options.test.ts`, `listTemplateOptions` |
| 02-03 | Locked folders reject rename/delete via direct Server Action call | VERIFIED — `tests/kb/locked-folder-guard.test.ts` |
| 02-03 | Cross-owner KB node mutation has no effect | VERIFIED — `tests/kb/ownership-guard.test.ts` |
| 02-03 | Sibling name collision rejected | VERIFIED — `createNode` catches Postgres `23505` |
| 02-04 | Chapter draft create/save + default order | VERIFIED — `tests/chapters/draft.test.ts` |
| 02-04 | Publish free/paid, fixed tiers only | VERIFIED — `tests/chapters/publish.test.ts` |
| 02-04 | Immediate edit while published (D-21) | VERIFIED — `tests/chapters/edit-unpublish.test.ts` |
| 02-04 | Unpublish distinct, content-preserving (D-22) | VERIFIED — same test file |
| 02-04 | Reorder resequences in one transaction (Pitfall 4) | VERIFIED — `tests/chapters/reorder.test.ts`, 3-chapter cyclic swap |
| 02-04 | Cross-owner chapter mutation rejected | VERIFIED — `tests/chapters/ownership-guard.test.ts`, 4 mutation fns |
| 02-05 | Writer opens work, sees 6-folder tree + account root nested | VERIFIED — `app/studio/[workId]/layout.tsx` calls `getKbTree`+`buildTree`, renders `KbTree` |
| 02-05 | Writer can create/rename/delete KB docs+folders via UI, locked folders protected | VERIFIED — `KbTreeActions` in `kb-node-dialogs.tsx`, conditionally hides rename/delete for `is_locked` nodes |
| 02-05 | Writer can open KB doc, edit full raw content, save | VERIFIED — `app/studio/[workId]/kb/[nodeId]/page.tsx` hydrates via `getNodeContentAction`, saves via `saveNodeContentAction` |
| 02-05 | Icon-only tree actions have tooltip/aria-label | VERIFIED — `IconButton` wraps every action in `Tooltip` + `aria-label` |
| 02-05 | Pinned 회차 nav link always visible while browsing KB tree (D-14) | VERIFIED — `ChaptersNavLink` rendered in `[workId]/layout.tsx` alongside (not inside) `KbTree` |
| 02-05 | D-10 create-time template picker surfaced in UI | VERIFIED — `CreateNodeDialog` fetches `listTemplateOptionsAction`, renders `Select` defaulting to `isDefault` |
| 02-06 | Chapters visible in order, drag-reorder persists after reload | VERIFIED — `ChapterList` uses `DndContext`/`useSortable`, `onDragEnd` calls `reorderChaptersAction` which `revalidatePath`s |
| 02-06 | New chapter draft appears at end of list | VERIFIED — `submitCreateChapter` → `createChapter` (default order = max+1) |
| 02-06 | Edit chapter content regardless of publish state | VERIFIED — `[chapterId]/page.tsx` `save()` always enabled once loaded |
| 02-06 | Publish free/paid via dropdown, never freeform | VERIFIED — shadcn `Select` renders exactly `PRICE_TIERS` |
| 02-06 | Unpublish distinct, non-destructive-styled confirmation | VERIFIED — confirmation dialog uses `variant="outline"` only, contains exact UI-SPEC copy |
| 02-06 | Forms built entirely from shadcn components | VERIFIED — zero raw `<input`/`<select`/`<button` in `chapters/new/page.tsx` and `[chapterId]/page.tsx` |

**Score:** 35/35 plan-level must-have truths verified.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/0002_studio.sql` | works/kb_nodes/chapters schema, RLS, guard trigger, 3 functions | VERIFIED | Applied to live Supabase; contains `create_work`, `ensure_account_template_root`, `reorder_chapters`, `guard_locked_kb_node`, `deferrable initially deferred` |
| `lib/kb/templates.ts` | Template substitution + seed helpers | VERIFIED | Exports `substituteTitle`, `readCanonicalSeed`, `buildSeedContent`, `seedTemplateFiles`, `KB_CATEGORIES` |
| `lib/kb/tree.ts` | Pure tree builder | VERIFIED | Exports `buildTree` |
| `lib/kb/actions.ts` | KB CRUD + tree query + template picker | VERIFIED | Exports `getKbTree`, `listTemplateOptions`, `createNode`, `renameNode`, `deleteNode`, `saveNodeContent` |
| `lib/works/actions.ts` | Work CRUD | VERIFIED | Exports `createWork`, `listWorks`, `getWork`, `GENRES` |
| `lib/chapters/actions.ts` | Chapter CRUD/publish/reorder | VERIFIED | Exports `createChapter`, `saveChapterContent`, `publishChapter`, `unpublishChapter`, `reorderChapters`, `listChapters`, `PRICE_TIERS` |
| `app/studio/layout.tsx` | Writer-role gate + account template provisioning | VERIFIED | Redirects non-writers, calls `ensure_account_template_root` + `seedTemplateFiles` every request |
| `app/studio/page.tsx` | 작품 목록 | VERIFIED | Contains literal string, calls `listWorks` |
| `app/studio/works/new/page.tsx` | 새 작품 만들기 form | VERIFIED | shadcn Input/Textarea/Select/Button only |
| `app/studio/[workId]/layout.tsx` | Work-scoped shell: tree + pinned chapters link | VERIFIED | Calls `getKbTree`, renders `ChaptersNavLink` + `KbTree` |
| `app/studio/[workId]/kb/[nodeId]/page.tsx` | KB document editor | VERIFIED | Single textarea, hydrates real content, saves via `saveNodeContentAction` |
| `components/studio/kb-tree.tsx` | Recursive tree component | VERIFIED | Exports `KbTree`, renders `Lock` icon w/ `aria-label` for locked nodes |
| `components/studio/kb-node-dialogs.tsx` | Create/Rename/Delete dialogs + D-10 picker | VERIFIED | Exports `KbTreeActions`, `CreateNodeDialog`, `RenameNodeDialog`, `DeleteNodeDialog` |
| `components/studio/chapters-nav-link.tsx` | Pinned 회차 nav | VERIFIED | Exports `ChaptersNavLink` |
| `components/studio/chapter-list.tsx` | dnd-kit sortable chapter list | VERIFIED | Contains `DndContext`, `useSortable`, calls `reorderChaptersAction` |
| `app/studio/[workId]/chapters/[chapterId]/page.tsx` | Chapter editor + publish controls | VERIFIED | Contains `publishChapter` flow, shadcn Select for price tiers |

All 16 artifacts across all 6 plans: exist, are substantive (no stubs/placeholders found), and are wired (see Key Link Verification below).

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `lib/works/actions.ts` (`createWork`) | `supabase/migrations/0002_studio.sql` | `create_work` RPC → `seedTemplateFiles` | WIRED | `supabase.rpc('create_work', ...)` at line 34, followed by `seedTemplateFiles` call |
| `app/studio/layout.tsx` | `supabase/migrations/0002_studio.sql` | `ensure_account_template_root` RPC | WIRED | Called every request, followed by `seedTemplateFiles` |
| `lib/kb/actions.ts` (`createNode`) | `lib/kb/templates.ts` | `buildSeedContent` | WIRED | Explicit call with resolved override |
| `app/studio/[workId]/layout.tsx` | `lib/kb/actions.ts`/`lib/kb/tree.ts` | `getKbTree` → `buildTree` | WIRED | Both called, tree passed to `KbTree` component |
| `components/studio/kb-tree.tsx` | `components/studio/kb-node-dialogs.tsx` | `renderRowActions` render-prop → `KbTreeActions` | WIRED | Layout supplies `renderRowActions={(node) => <KbTreeActions .../>}` |
| `components/studio/kb-node-dialogs.tsx` (`CreateNodeDialog`) | `lib/kb/actions.ts` | `listTemplateOptionsAction` → `listTemplateOptions` | WIRED | Fetched on dialog open, `Select` rendered from result |
| `components/studio/chapter-list.tsx` | `lib/chapters/actions.ts` | `reorderChaptersAction` → `reorderChapters` | WIRED | Called from `onDragEnd`, followed by `revalidatePath` |
| `app/studio/[workId]/chapters/[chapterId]/page.tsx` | `lib/chapters/actions.ts` | `publishChapterAction`/`unpublishChapterAction` | WIRED | Called from Button handlers, state updated on success |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `app/studio/page.tsx` | `works` | `listWorks(supabase, {ownerId})` → real `works` table query, `.eq('owner_id')` | Yes | FLOWING |
| `app/studio/[workId]/layout.tsx` | `flatNodes`/`tree` | `getKbTree` → real `kb_nodes` table query (two parallel selects) | Yes | FLOWING |
| `app/studio/[workId]/chapters/page.tsx` | `chapters` | `listChapters` → real `chapters` table query, ownership-verified | Yes | FLOWING |
| `app/studio/[workId]/kb/[nodeId]/page.tsx` | `content` | `getNodeContentAction` → real `kb_nodes.content` select | Yes | FLOWING |
| `app/studio/[workId]/chapters/[chapterId]/page.tsx` | `content`/`isPublished`/`priceTier` | `getChapterAction` → real `chapters` select via `works!inner(owner_id)` join | Yes | FLOWING |

No hardcoded/empty data sources found; all list/detail pages query the live Supabase tables established in `0002_studio.sql`.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full business-logic test suite (schema, works, KB, chapters — 13 files) | `npx vitest run tests/kb/ tests/works/ tests/chapters/ tests/studio/` | 51/51 tests passed against live Supabase | PASS |
| Whole-repo type check | `npx tsc --noEmit` | 0 errors | PASS |
| Migration idempotency / schema presence | grep for `create_work`, `ensure_account_template_root`, `reorder_chapters`, `guard_locked_kb_node`, `deferrable initially deferred` in `0002_studio.sql` | all present | PASS |
| Indigo accent applied | grep `var(--color-indigo-600)` / `var(--color-indigo-500)` in `app/globals.css` | present in both `:root` and `.dark` | PASS |
| No raw form elements in shadcn-mandated forms | grep `<input\|<select\|<button` across `works/new`, `chapters/new`, `chapters/[chapterId]` pages | zero matches | PASS |
| No `destructive` styling on unpublish confirmation | grep `destructive` in `chapters/[chapterId]/page.tsx` | zero matches | PASS |

Note: I did not start a dev server (`next dev`) to click through the UI live — this is covered under Human Verification below per 02-VALIDATION.md's own "Manual-Only Verifications" contract, which explicitly defers UI feel/interaction checks to a human QA pass.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| KB-01 | 02-01, 02-03, 02-05 | Writer can create, edit, and delete KB documents across 5 templates | SATISFIED | `lib/kb/actions.ts` CRUD + UI wiring, `tests/kb/document-crud.test.ts` |
| KB-02 | 02-01, 02-02, 02-03, 02-05 | Writer can browse KB documents in an IDE-style folder/file tree, scoped per work | SATISFIED | `lib/kb/tree.ts`/`getKbTree` + `components/studio/kb-tree.tsx`, `tests/kb/tree-query.test.ts` |
| CONT-01 | 02-01, 02-04, 02-06 | Writer can create and save chapter drafts with title and order | SATISFIED | `createChapter`/`saveChapterContent`, `tests/chapters/draft.test.ts`, `tests/chapters/reorder.test.ts` |
| CONT-02 | 02-01, 02-04, 02-06 | Writer can publish a chapter, marking it free or paid with a price | SATISFIED | `publishChapter` (fixed tiers), `tests/chapters/publish.test.ts` |
| CONT-03 | 02-04, 02-06 | Writer can edit or unpublish their own chapters after publishing | SATISFIED | `saveChapterContent` (works while published) + `unpublishChapter`, `tests/chapters/edit-unpublish.test.ts` |

All 5 requirement IDs declared for Phase 2 across the 6 plans' frontmatter are accounted for and marked `[x]` in `.planning/REQUIREMENTS.md`. Cross-referencing `.planning/ROADMAP.md`'s requirements-coverage table confirms no additional IDs are mapped to Phase 2 beyond these 5 — no orphaned requirements found.

### Anti-Patterns Found

None. Scanned all Phase 2 files (`lib/kb/*`, `lib/chapters/*`, `lib/works/*`, `app/studio/**`, `components/studio/*`) for TODO/FIXME/placeholder comments, empty implementations, hardcoded empty data, empty event handlers, and console.log-only implementations. No matches beyond a documentation comment referencing "the placeholder stays literal" (accurately describing intended template behavior, not a stub marker).

One pre-existing, unrelated `tsc` error documented in `deferred-items.md` (`app/layout.tsx` `LayoutProps` type) was checked and found to no longer reproduce — `npx tsc --noEmit` is fully clean across the whole repo at verification time.

### Human Verification Required

These items are explicitly called out in `02-VALIDATION.md`'s "Manual-Only Verifications" table as requiring interactive UI judgment that integration tests cannot meaningfully assert. All underlying business logic and wiring for these flows is verified above; only the felt UX quality remains unverified.

### 1. Drag-and-drop feel for chapter reorder

**Test:** Open `/studio/[workId]/chapters`, drag a chapter row to a new position using the grip handle.
**Expected:** Smooth visual feedback during drag; after releasing, the new order persists across a page reload (confirms `reorderChaptersAction` → `revalidatePath` round-trip feels correct, not just functionally correct).
**Why human:** Pointer/touch interaction quality and visual smoothness are not assertable via integration tests; `tests/chapters/reorder.test.ts` only proves the underlying DB resequencing is correct.

### 2. Locked-folder visual cues in the tree

**Test:** Open a work's Studio tree, inspect the 6 fixed folders (template/인물/장소/사건/세력/아이템) versus a user-created folder/file.
**Expected:** Locked folders show a `Lock` icon with tooltip and have no rename/delete action buttons rendered; user-created nodes show full action affordances.
**Why human:** Visual/UX distinction judgment; code confirms the icon and conditional rendering exist (`is_locked` gates the action buttons in `KbTreeActions`), but the actual visual clarity/discoverability needs a human eye.

### 3. Full Studio writer-loop walkthrough

**Test:** Starting from `/studio`, create a new work → open its tree → create a KB document (with an explicit non-default template choice via the D-10 picker) → edit and save it → navigate via the pinned 회차 link → create a chapter draft → edit content → publish as paid (30 토큰) → confirm it displays as published → unpublish it via the non-destructive confirmation → confirm content is unchanged.
**Expected:** Every step completes without error, with UI copy matching UI-SPEC exactly and no broken navigation.
**Why human:** End-to-end UX coherence across the whole writer loop — the individual pieces are each proven correct in isolation (51 passing tests + clean typecheck + wiring verification above), but a full walkthrough catches integration issues (e.g., stale cache, unexpected redirect loops, layout shift) that unit/integration tests don't cover by design. This is explicitly deferred to a human QA pass per `02-VALIDATION.md`.

### Gaps Summary

No gaps found. All 5 ROADMAP success criteria are verified with passing automated tests (51/51) against the live Supabase schema, a clean whole-repo `tsc --noEmit`, and confirmed wiring from UI through Server Actions through business logic through the database for every truth in scope. All 5 requirement IDs (KB-01, KB-02, CONT-01, CONT-02, CONT-03) are satisfied and cross-referenced with no orphans. The only remaining items are 3 human-verification checks for interactive UX feel, which were already flagged as manual-only in the phase's own validation strategy and do not block goal achievement — the underlying functionality they'd be judging is fully verified.

---

*Verified: 2026-08-28*
*Verifier: Claude (gsd-verifier)*


---

# Reopen 보완 검증 (2026-10-12 정책, plan 02-07~02-13)

> 위 2026-08-28 결과는 기존 구현에 대한 역사 증거로 보존한다. 아래 신규 truth는 과거 `passed`를 승계하지 않고 실제 증거만 기록한다. 전체 상태: **PASSED - Unit·실DB·브라우저 게이트 통과, 브라우저 게이트는 사용자 지시로 승인(2026-10-19). 실제 touch 기기·실제 AI 응답은 에이전트가 독립 검증하지 못한 잔여 항목**.

| # | 신규 truth | 증거 | 상태 |
|---|-----------|------|------|
| R1 | 기본 템플릿 5종 읽기 전용, 서버 guard가 우회 차단 | unit: template-policy, template-seeding, template-migration-source. 실DB(`--project db`): template-policy-migration·locked-folder-guard·schema-smoke 통과. 브라우저: 기본 템플릿 textarea `readOnly`, "읽기 전용" 칩, 저장/AI 삽입 버튼 없음, 우클릭 메뉴는 사본 만들기만 | **통과** (실DB + 브라우저) |
| R2 | 기존 수정 내용이 `내 템플릿` 사본으로 보존되고 기본 5종 원문 복원 | 1회용 DB에서 0022→0023→재실행 통과(template-policy-migration 10/10, 최신 policy 복원 확인) | **통과** (실DB) |
| R3 | 템플릿 이름 중복 불가, 사본/새 문서/템플릿 만들기 | unit 통과. 실DB template-options·template-tree-mutations 통과. 브라우저: 기본 이름 "인물"로 사본 생성 거부+입력 유지, 다른 이름은 생성, 새 문서에서 `<% tp.file.title %>` 치환. **rename 중복**("게이트 인물 양식"으로 변경) "이미 같은 이름의 템플릿이 있어요" 거부+입력 유지, 정상 이름 rename 성공. **scope**: "템플릿 만들기"에서 `이 작품 전용`·`계정 공용` 각각 생성, 같은 scope 중복은 거부, 서로 다른 scope의 같은 이름은 허용(DB: `account_template`/`work` 각 1행, unique index는 `(owner_id, work_id, btrim(name))` 기준) | **통과** |
| R4 | 우클릭·long press 메뉴, 템플릿 섹션, 폴더 접기 | unit 통과. 브라우저: 일반 문서 우클릭=이름 바꾸기/삭제, 기본 템플릿 우클릭=사본 만들기만, 템플릿 섹션 구성, 폴더 접기/펼치기(접으면 하위 문서 숨김·펼치면 복귀). touch long press는 `pointerType: touch` **합성 PointerEvent 에뮬레이션**: 500ms 이상 누르면 메뉴(이름 바꾸기·삭제), 250ms에는 미표시, 100ms 짧은 탭·누르는 중 scroll·누르는 중 40px 이동에서는 미표시 | **부분 통과** — 실제 touch 기기/touch 브라우저에서의 long press→이름 바꾸기, 일반 tap 이동은 PENDING (사용자 확인) |
| R5 | 좌·우 패널 접기에서 editor/AiPanel 유지(mount·selection·대화) | unit 통과. 브라우저(1440px): 좌/우/동시 접기 3회 반복 후 textarea·AiPanel DOM 노드 동일, MutationObserver 제거 0건(mount 증가 없음), selectionStart/End 유지, 본문 폭 705→925(좌)→1273(동시)→705 복원. **진행 중 AI 요청**: 서버 액션을 6초 지연시켜 전송 후 접기/펼치기 2회 반복(요청 진행 중) → 입력 DOM 동일(removed 0), 사용자 메시지 1건 유지, 완료 후 같은 대화에 결과(오류 안내+다시 시도)가 붙음 | **부분 통과** — 이 프로젝트에는 AI 키가 없어 실제 AI 응답 본문은 미검증(오류 응답으로 대체). React DevTools mount count 대신 MutationObserver 제거 감지 사용 |
| R6 | 저장 상태 칩(저장됨/저장 중/저장 안 됨/저장 실패+재시도) | unit 통과. 브라우저(KB 문서·회차 모두): 저장됨→저장 안 됨→저장 중→저장됨 전이. **fault injection**(브라우저 `fetch` wrapper로 서버 액션 POST만 실패): 저장 실패 칩 표시, 본문·DOM 유지, wrapper 해제 후 재시도로 저장됨(회차는 DB 반영도 확인). **저장 중 추가 입력**(서버 액션 3초 지연): 저장 중 입력 → 완료 후 "저장 안 됨" 유지 | **통과** (앱 코드 수정 없이 외부 wrapper 사용) |
| R7 | 기존 draft·고정 가격 발행·발행 후 수정·발행 취소 회귀 없음 | 실DB tests/chapters(draft·publish·edit-unpublish·reorder 등) 통과. 브라우저: 유료 30토큰 발행(`is_published=true`, `price_tier=30`) → 발행 취소(`is_published=false`, `unpublished_at` 기록, 본문·price_tier 보존) | **통과** |

## 실행한 자동 검증 (02-13 Task 1)
`npx vitest run --project unit` (14 files: template-migration-source, template-seeding, template-policy, template-copy, template-action-wrappers, template-dialogs, sidebar-sections, kb-node-menu, template-tree-ui, editor-state, studio-panel-shell, kb-editor-state, chapter-editor-state, client-bundle-fs-free): **14 files / 214 tests passed**.

## 실행한 실DB 검증 (02-13 Task 2, 2026-10-17)
1회용 Supabase 프로젝트(전용 `.env.disposable`, 공유 프로젝트와 분리)에 0001~0021을 적용하고(0011은 파일 선두 BOM 때문에 BOM 제거 후 적용) `npx vitest run --project db`로 실행: template-policy-migration, template-options, template-tree-mutations, document-crud, locked-folder-guard, ownership-guard, schema-smoke, tests/chapters/*. 브랜치 `phase2/db-browser-gate`(c34cb97) 기준 **14 files / 66 tests passed**(분기 전 작업 트리에서도 이관 10 tests + 나머지 13 files 56 tests 통과).

> **실행 안전 규칙:** vitest는 `--mode disposable`만으로는 공유 `.env.local` 값이 섞여 들어와 공유 프로젝트를 가리킬 수 있었다(이관 테스트의 ref 가드가 차단했고 DB 변경은 없었다). DB suite는 반드시 `node --env-file=.env.disposable node_modules/vitest/vitest.mjs run --project db ...`처럼 프로세스 환경변수를 1회용 값으로 고정해 실행하고, URL·DB URL·두 키의 ref가 1회용 프로젝트와 일치하는지 먼저 확인한다. `next dev`는 `--env-file`을 NODE_OPTIONS로 넘기다 실패하므로 셸에서 export 후 실행한다.

## 실행한 브라우저 검증 (02-13 Task 3, 2026-10-17~19)
1회용 DB + `next dev -p 3100`(1회용 env만 주입, 별도 worktree). 테스트 작가 계정은 서비스 롤로 생성한 세션 쿠키로 로그인(앱 로그인은 OAuth 전용). 위 R1·R3~R7의 브라우저 증거 참조. 2026-10-19에 rename 중복·scope·폴더 접기·touch 에뮬레이션·fault injection·진행 중 AI 요청을 추가로 확인했다.

> **검증 방법 주의:** fault injection과 요청 지연은 앱 코드가 아니라 페이지의 `window.fetch`를 감싸 서버 액션(`next-action` 헤더 POST)만 실패/지연시키는 개발 검증용 외부 wrapper다. dev 서버가 파일 변경으로 Fast Refresh되면 클라이언트 상태(예: AI 채팅 입력)가 꼬여 입력이 반영되지 않을 수 있으므로, 검증 중에는 worktree 파일을 건드리지 말고 이상하면 페이지를 새로 불러온다. 창 폭을 에뮬레이션해도 레이아웃(lg 이상) 반영에 재적용이 필요할 수 있다.

## 승인과 잔여 항목
- **브라우저 gate(02-13 Task 3)는 2026-10-19 사용자의 "전부 진행해줘" 지시로 승인됐다.** 사용자가 보고한 레이아웃 이슈 2건은 수정·재검증됐다. 별도의 폰 테스트 결과가 아니라 지시를 승인 근거로 기록한다.
- 에이전트가 독립 검증하지 못한 잔여 항목(failed 아님): 실제 touch 기기에서의 long press→이름 바꾸기·일반 tap 이동·long press 중 scroll 취소(합성 이벤트·모바일 에뮬레이션만 확인), 실제 AI 응답이 진행 중일 때의 대화 유지(이 프로젝트에 AI 키가 없어 오류 응답으로만 확인)·React DevTools mount count.
- ROADMAP은 `gsd-tools roadmap update-plan-progress 02`로 동기화한다. STATE/REQUIREMENTS·타 phase 문서는 이 plan 범위가 아니다.

## 발견 사항 — 레이아웃 버그 (사용자 보고, 수정 완료)
- BUG-02 → [fixed/02-02](../../fixed/02-02%20%ED%85%9C%ED%94%8C%EB%A6%BF%20%ED%88%B4%EB%B0%94%20%EC%A2%81%EC%9D%80%20%ED%8F%AD%20%EA%B9%A8%EC%A7%90%20%EC%88%98%EC%A0%95.md): 템플릿 툴바를 위/아래 2단으로 분리(390px 실측 이름 폭 0 → 98px, 겹침 0).
- BUG-03 → [fixed/02-03](../../fixed/02-03%20%ED%8A%B8%EB%A6%AC%20%ED%96%89%20%EC%9D%B4%EB%A6%84%20%EC%9E%98%EB%A6%BC%EA%B3%BC%20%EB%B2%84%ED%8A%BC%20%EB%8F%99%EC%8B%9C%20%ED%91%9C%EC%8B%9C%20%EC%88%98%EC%A0%95.md): 트리 행 이름 보존, 행 액션은 hover(마우스)/활성 행(터치)만 표시. 모바일 드로어 `details.group`이 모든 행 버튼을 동시에 켜던 원인을 이름 그룹(`group/row`)으로 해결.
- 두 건 모두 수정·재검증되어 브라우저 게이트의 승인 차단 사유가 해소됐다.

## 발견 사항 (비차단)
- 기본 템플릿 본문과 이를 복사한 새 문서 본문이 BOM(`U+FEFF`)으로 시작한다.
- `supabase/migrations/0011_ai_doc_planning.sql`이 BOM으로 시작해 `scripts/apply-migration.mjs`로 그대로 적용하면 구문 오류가 난다.

## Phase 18 의존 계약
기본 template은 readonly+copy만 제공한다. 세계관 공개 정책은 포함되지 않는다.
