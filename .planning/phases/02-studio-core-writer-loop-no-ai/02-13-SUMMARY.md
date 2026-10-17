---
phase: 02-studio-core-writer-loop-no-ai
plan: "13"
subsystem: validation-docs
tags: [gap-closure, docs, partial, pending-gates]
gap_closure: true
status: partial
requirements: [KB-01, KB-02, CONT-01, CONT-02, CONT-03]
dependency_graph:
  requires: [02-07, 02-08, 02-09, 02-10, 02-11, 02-12]
  provides:
    - Reopen-aligned UI-SPEC / VALIDATION / VERIFICATION wording
  affects: [Phase 18 (readonly+copy template contract)]
key_files:
  modified:
    - .planning/phases/02-studio-core-writer-loop-no-ai/02-UI-SPEC.md
    - .planning/phases/02-studio-core-writer-loop-no-ai/02-VALIDATION.md
    - .planning/phases/02-studio-core-writer-loop-no-ai/02-VERIFICATION.md
metrics:
  tasks_complete: 1
  tasks_total: 3
---

# Phase 2 Plan 13: Decision wording alignment and final gates (PARTIAL)

**Task 1 and Task 2 (real-DB) complete; Task 3 (browser) is PARTIAL with remaining items PENDING, so this plan is NOT complete.** (updated 2026-10-17)

## Task 1 (done)

- UI-SPEC: context-menu is now required (not optional), "템플릿 만들기" copy, locked-default-template message, and a new "Reopen 개정 (2026-10-12)" section covering KB-01 (read-only defaults, `사본 만들어 수정`, name uniqueness, migration of edited defaults) and KB-02 (row menu, template sidebar sections, `새 문서 (템플릿에서)`, desktop «·» panel collapse, save-status chip) plus the Phase 18 readonly+copy contract (no worldview-publish policy).
- VALIDATION: Wave 0 marked complete, quick-run command updated, added a Reopen test map split into unit / DB / browser gates.
- VERIFICATION: 2026-08-28 results preserved; appended a Reopen section (R1-R7) recording unit evidence and PENDING for DB/browser.
- Automated verify (plan command, `--project unit`, 14 files): **14 passed files, 214 passed tests**.

## Task 2 (done, 2026-10-17)

- Disposable Supabase project created; migrations 0001-0021 applied (0011 needed its leading BOM stripped), then `--project db` suites run with process env pinned via `node --env-file=.env.disposable`: **14 files / 66 tests passed** on branch `phase2/db-browser-gate` (c34cb97). The migration suite (0022 -> 0023 -> rerun) passed 10/10.
- Safety finding: `vitest --mode disposable` alone still resolved the shared `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_DB_URL` inside the test process (the migration suite's ref guard aborted the first attempt with no DB change). All later runs pinned env at process level and verified refs first. Details in 02-VERIFICATION.md.

## Task 3 (partial, 2026-10-17)

Passed in the browser against the disposable DB: default templates read-only + copy-only menu, duplicate-name rejection on copy, title substitution in new docs, right-click menus, left/right/both panel collapse (same textarea/AiPanel DOM node, selection kept, no mount increase), save-status chip transitions in KB and chapter editors, paid 30-token publish -> unpublish with content kept.

## Pending (not verified, not failed)

| Item | Status | Reason |
|------|--------|--------|
| touch long press -> rename, tap navigation, scroll cancel | PENDING | needs a real touch device / touch browser (user check) |
| save failure -> body kept + retry, edit-while-saving | PENDING | needs dev-only fault injection |
| in-flight AI request / conversation retained across collapse, mount count via React DevTools | PENDING | no AI key on the disposable project; only DOM-node identity was checked |
| rename duplicate rejection, work vs account scope, folder collapse | PENDING | not run |
| final user UX approval (`approved` / concrete failures) | PENDING | user step |

## Deviations from Plan

None in Task 1. Per instruction, ROADMAP.md, STATE.md, REQUIREMENTS.md were not modified, `roadmap update-plan-progress` and graphify were not run; they belong to the Task 3 closing step after both gates are approved.

## Known Stubs

None.
