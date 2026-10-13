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

**Task 1 complete; Tasks 2 (real-DB) and 3 (browser) are PENDING, so this plan is NOT complete.**

## Task 1 (done)

- UI-SPEC: context-menu is now required (not optional), "템플릿 만들기" copy, locked-default-template message, and a new "Reopen 개정 (2026-10-12)" section covering KB-01 (read-only defaults, `사본 만들어 수정`, name uniqueness, migration of edited defaults) and KB-02 (row menu, template sidebar sections, `새 문서 (템플릿에서)`, desktop «·» panel collapse, save-status chip) plus the Phase 18 readonly+copy contract (no worldview-publish policy).
- VALIDATION: Wave 0 marked complete, quick-run command updated, added a Reopen test map split into unit / DB / browser gates.
- VERIFICATION: 2026-08-28 results preserved; appended a Reopen section (R1-R7) recording unit evidence and PENDING for DB/browser.
- Automated verify (plan command, `--project unit`, 14 files): **14 passed files, 214 passed tests**.

## Pending (not verified, not failed)

| Task | Gate | Status | Reason |
|------|------|--------|--------|
| 2 | Real DB: 0022/0023 apply and rerun, content preservation, direct-SQL/RLS bypass, concurrent duplicates, chapters regression (`--project db` suite) | PENDING | no disposable DB (only the shared project is configured; running the migration suite there is forbidden by the plan) |
| 3 | Browser: copy/new doc/menu/long press/panel collapse mount retention/save chip/paid 30-token publish-unpublish | PENDING | browser gate not run (requires the DB gate's verification project) |

## Deviations from Plan

None in Task 1. Per instruction, ROADMAP.md, STATE.md, REQUIREMENTS.md were not modified, `roadmap update-plan-progress` and graphify were not run; they belong to the Task 3 closing step after both gates are approved.

## Known Stubs

None.
