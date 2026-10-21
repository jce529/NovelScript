---
phase: 2
slug: studio-core-writer-loop-no-ai
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-25
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (installed in Phase 1 Wave 0 — reuse, do not reinstall) |
| **Config file** | `vitest.config.ts` (created in Phase 1 Wave 0) |
| **Quick run command** | `npx vitest run --project unit tests/kb tests/studio` (unit, DB 불필요); DB suite는 `--project db` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30-60 seconds (integration tests hit real Postgres via Supabase test project) |

---

## Sampling Rate

- **After every task commit:** Run the specific scoped test file(s) touched by that task (`npx vitest run tests/kb/<file>.test.ts` or `tests/chapters/<file>.test.ts`)
- **After every plan wave:** Run `npx vitest run` (full suite, including Phase 1's carried-forward auth/wallet tests to catch regressions)
- **Before `/gsd:verify-work`:** Full suite must be green, plus one manual QA pass through the actual Studio UI (tree create/rename/delete, KB doc create-from-template, chapter draft → publish → edit → unpublish) — drag-and-drop feel and locked-folder visual cues aren't meaningfully covered by integration tests alone
- **Max feedback latency:** ~60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-xx-xx | TBD | TBD | KB-01 | integration | `npx vitest run tests/kb/document-crud.test.ts` | ❌ W0 | ⬜ pending |
| 02-xx-xx | TBD | TBD | KB-01 | unit | `npx vitest run tests/kb/template-substitution.test.ts` | ❌ W0 | ⬜ pending |
| 02-xx-xx | TBD | TBD | KB-02 | integration | `npx vitest run tests/kb/tree-query.test.ts` | ❌ W0 | ⬜ pending |
| 02-xx-xx | TBD | TBD | KB-02 | integration | `npx vitest run tests/kb/locked-folder-guard.test.ts` | ❌ W0 | ⬜ pending |
| 02-xx-xx | TBD | TBD | CONT-01 | integration | `npx vitest run tests/chapters/draft.test.ts` | ❌ W0 | ⬜ pending |
| 02-xx-xx | TBD | TBD | CONT-01 | integration | `npx vitest run tests/chapters/reorder.test.ts` | ❌ W0 | ⬜ pending |
| 02-xx-xx | TBD | TBD | CONT-02 | integration | `npx vitest run tests/chapters/publish.test.ts` | ❌ W0 | ⬜ pending |
| 02-xx-xx | TBD | TBD | CONT-03 | integration | `npx vitest run tests/chapters/edit-unpublish.test.ts` | ❌ W0 | ⬜ pending |
| 02-xx-xx | TBD | TBD | CONT-03 | integration | `npx vitest run tests/security/ownership-guard.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Plan/Wave/Task-ID columns are filled in by the planner once PLAN.md files assign concrete task IDs to these requirement checks.*

---

## Wave 0 Requirements

- [ ] `tests/kb/document-crud.test.ts` — KB doc create/edit/delete (soft) across all 5 categories, seeded from correct template with title substituted
- [ ] `tests/kb/template-substitution.test.ts` — unit test proving 사건 template's absent `<% tp.file.title %>` placeholder does not error (Pitfall 3)
- [ ] `tests/kb/tree-query.test.ts` — nested tree structure per category, scoped to one work, account-level `template/` merged in
- [ ] `tests/kb/locked-folder-guard.test.ts` — locked folders (D-15) reject rename/delete Server Action calls even when called directly, not just hidden in UI
- [ ] `tests/chapters/draft.test.ts` — chapter draft create/save persists title + content + default order
- [ ] `tests/chapters/reorder.test.ts` — full ID list resequences `order_index` correctly under a deferred unique constraint (proves Pitfall 4 handled)
- [ ] `tests/chapters/publish.test.ts` — publish sets `is_published` + valid `price_tier`; rejects out-of-set price_tier at DB constraint level
- [ ] `tests/chapters/edit-unpublish.test.ts` — editing published chapter content updates immediately (D-21); unpublish is distinct action that doesn't alter content (D-22)
- [ ] `tests/security/ownership-guard.test.ts` — Server Action call for another writer's node/chapter is rejected (Pitfall 1)
- [ ] `supabase/migrations/..._works.sql`, `..._kb_nodes.sql`, `..._chapters.sql` — including deferred unique constraint (Pitfall 4) and partial unique index for sibling-name collisions (Open Question 3)
- [ ] Seed/fixture helper provisioning the 6 fixed structural folders (account `template/` + per-work `docs/template/`, `인물/`, `장소/`, `사건/`, `세력/`, `아이템/`, `회차/`) mirroring the real work-creation Server Action
- [ ] Install `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` (not yet in `package.json`)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Drag-and-drop feel/responsiveness for chapter reorder | CONT-01 (D-17) | Pointer/touch interaction quality is not meaningfully assertable via integration tests | Open `/studio/[workId]/chapters`, drag a chapter to a new position, confirm smooth visual feedback and persisted order after reload |
| Locked-folder visual cues in the tree (D-15 "cannot delete/rename" signaling) | KB-02 | Visual/UX judgment, not a functional assertion | Open Studio tree, confirm the 6 fixed folders visually differ from user-created folders and show no rename/delete affordance |
| Full Studio walkthrough: tree create/rename/delete → KB doc create-from-template → chapter draft → publish → edit → unpublish | KB-01, KB-02, CONT-01, CONT-02, CONT-03 | End-to-end UX coherence across the whole writer loop | Follow the full writer flow in the actual UI before `/gsd:verify-work`, per the phase's UI hint |

---

## Reopen 보완 검증 맵 (2026-10-12, plan 02-07~02-13)

> Wave 0 파일과 위 표의 "W0/TBD"는 구현 완료로 갱신됐다(원 표는 역사 기록으로 둔다). 보완 정책(기본 템플릿 읽기 전용+사본, 이름 중복 불가, 메뉴·섹션·패널 접기·저장 칩)의 test map은 아래이며 게이트는 unit / DB / 브라우저로 분리한다.

### Unit (DB 불필요) — 02-13 Task 1 실행: 14 files / 214 passed
| Plan | 대상 | 파일 |
|------|------|------|
| 02-07 | 이관 SQL source 계약, 잠금 seed | tests/kb/template-migration-source.test.ts, tests/kb/template-seeding.test.ts |
| 02-08 | 서버 policy/사본/이름 충돌 | tests/kb/template-policy.test.ts, tests/kb/template-copy.test.ts |
| 02-09 | 액션 wrapper, 다이얼로그 submit | tests/kb/template-action-wrappers.test.ts, tests/kb/template-dialogs.test.ts |
| 02-10 | 사이드바 섹션, 행 메뉴, 트리 UI | tests/kb/sidebar-sections.test.ts, tests/kb/kb-node-menu.test.ts, tests/kb/template-tree-ui.test.ts |
| 02-11 | 저장 상태 reducer, 패널 shell | tests/studio/editor-state.test.ts, tests/studio/studio-panel-shell.test.ts |
| 02-12 | KB/회차 에디터 상태, client bundle | tests/studio/kb-editor-state.test.ts, tests/studio/chapter-editor-state.test.ts, tests/studio/client-bundle-fs-free.test.ts |

### DB 체크포인트 (02-13 Task 2) — PASSED (2026-10-17)
1회용 Supabase 프로젝트에서 `--project db` 실행(`node --env-file=.env.disposable ...` 방식, ref 일치 확인 후): template-policy-migration(0022->0023->재실행, `TEMPLATE_MIGRATION_DISPOSABLE_PROJECT_REF` opt-in) 10/10, template-options, template-tree-mutations, document-crud, locked-folder-guard, ownership-guard, schema-smoke, chapters draft/publish/edit-unpublish 외. 브랜치 `phase2/db-browser-gate`(c34cb97) 기준 **14 files / 66 tests passed**. `--mode disposable`만으로는 공유 env가 섞일 수 있으므로 사용 금지(VERIFICATION 참조).

### 브라우저 체크포인트 (02-13 Task 3) — APPROVED (2026-10-19, 사용자 지시)
통과: 기본 템플릿 읽기 전용·사본 만들기, 기본 이름·rename·같은 scope 중복 거부와 서로 다른 scope 허용, 새 문서 제목 치환, 우클릭 메뉴, 폴더 접기, 좌·우·동시 패널 접기 DOM/selection 유지, 진행 중 AI 요청 중 접기(대화·입력 DOM 유지), KB·회차 저장 칩 전이와 저장 실패→재시도·저장 중 추가 입력(외부 fetch wrapper), 유료 30토큰 발행→취소 보존, touch long press 합성 이벤트 에뮬레이션. 사용자가 보고한 레이아웃 이슈 2건(fixed/02-02, 02-03)은 수정·재검증됐다. 승인 근거: 사용자의 "전부 진행해줘" 지시(수정 후 `/bug-complete` 진행 확인). 에이전트가 독립 검증하지 못한 항목: 실제 touch 기기 long press·tap·scroll 취소, 실제 AI 응답(AI 키)·React DevTools mount count. 모바일 하단 탭은 Phase 16이라 제외.

### Sign-off 상태
Unit 회귀 통과. DB 게이트 통과. 브라우저 게이트는 사용자 지시로 승인됐다(실제 touch 기기·실제 AI 응답은 에이전트가 독립 검증하지 못함). 아래 Validation Sign-Off 체크박스와 `nyquist_compliant`는 별도 감사(`/gsd:validate-phase`) 대상이라 채우지 않는다.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** 브라우저 게이트 승인 2026-10-19 (사용자 지시). Validation Sign-Off 감사는 pending.
