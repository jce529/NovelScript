---
phase: 2
slug: studio-core-writer-loop-no-ai
status: draft
nyquist_compliant: true
wave_0_complete: false
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
| **Quick run command** | `npx vitest run tests/kb/` or `npx vitest run tests/chapters/` (scoped to touched files) |
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

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
