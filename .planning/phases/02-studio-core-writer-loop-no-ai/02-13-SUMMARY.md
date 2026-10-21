---
phase: 02-studio-core-writer-loop-no-ai
plan: "13"
subsystem: validation-docs
tags: [gap-closure, docs, real-db-gate, browser-gate]
gap_closure: true
status: complete
completed: 2026-10-19
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
  tasks_complete: 3
  tasks_total: 3
---

# Phase 2 Plan 13: Decision wording alignment and final gates (COMPLETE)

**All three tasks complete (2026-10-19).** Task 1 (wording), Task 2 (real DB, disposable project) and Task 3 (browser gate, approved by the user's go-ahead on 2026-10-19) are done; the residual items listed under "Residual unverified items" were not independently verified and are recorded as such.

## Task 1 (done)

- UI-SPEC: context-menu is now required (not optional), "템플릿 만들기" copy, locked-default-template message, and a new "Reopen 개정 (2026-10-12)" section covering KB-01 (read-only defaults, `사본 만들어 수정`, name uniqueness, migration of edited defaults) and KB-02 (row menu, template sidebar sections, `새 문서 (템플릿에서)`, desktop «·» panel collapse, save-status chip) plus the Phase 18 readonly+copy contract (no worldview-publish policy).
- VALIDATION: Wave 0 marked complete, quick-run command updated, added a Reopen test map split into unit / DB / browser gates.
- VERIFICATION: 2026-08-28 results preserved; appended a Reopen section (R1-R7) recording unit evidence and PENDING for DB/browser.
- Automated verify (plan command, `--project unit`, 14 files): **14 passed files, 214 passed tests**.

## Task 2 (done, 2026-10-17)

- Disposable Supabase project created; migrations 0001-0021 applied (0011 needed its leading BOM stripped), then `--project db` suites run with process env pinned via `node --env-file=.env.disposable`: **14 files / 66 tests passed** on branch `phase2/db-browser-gate` (c34cb97). The migration suite (0022 -> 0023 -> rerun) passed 10/10.
- Safety finding: `vitest --mode disposable` alone still resolved the shared `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_DB_URL` inside the test process (the migration suite's ref guard aborted the first attempt with no DB change). All later runs pinned env at process level and verified refs first. Details in 02-VERIFICATION.md.

## Task 3 (automated checks passed, 2026-10-17 and 2026-10-19)

Passed in the browser against the disposable DB: default templates read-only + copy-only menu, duplicate-name rejection on copy/rename/create (same scope) with different scopes allowed, title substitution in new docs, right-click menus, folder collapse, left/right/both panel collapse (same textarea/AiPanel DOM node, selection kept, no mount increase), collapse while an AI request is in flight (conversation and input node kept; result attached to the same conversation), save-status chips in KB and chapter editors including save failure -> retry and edit-while-saving (fault injection via an external `window.fetch` wrapper, no app code changed), paid 30-token publish -> unpublish with content kept, and touch long-press logic via synthetic `pointerType: touch` events (500ms opens the menu; short tap, scroll and move cancel it).

## Issues found and fixed

User-reported layout failures (2026-10-19) were fixed and re-verified in the browser: `fixed/02-02` (template editor toolbar, now two tiers) and `fixed/02-03` (sidebar rows keep their names; row buttons show only for the hovered row on pointer devices and the tapped/active row on touch-only devices; root cause of every row showing buttons on mobile was the drawer's unnamed `details.group`). They no longer block approval.

## Approval

The user was shown the two layout failures they reported (fixed as `fixed/02-02`, `fixed/02-03`), was asked whether to proceed to `/bug-complete` or check on a phone first, and answered "전부 진행해줘" and said they are about to bring the changes to `master`. That instruction is recorded as the browser-gate approval. It is not a separate phone test result.

## Residual unverified items (accepted, not failed)

| Item | Status | Reason |
|------|--------|--------|
| long press -> rename, tap navigation, scroll cancel on a real touch device | not independently verified | only synthetic `pointerType: touch` events and the browser's mobile emulation (`hover: none`, `pointer: coarse`) were exercised by the agent |
| real AI response in flight across panel collapse, mount count via React DevTools | not independently verified | no AI key on the disposable project (error response used); DOM-node removal observer used instead of DevTools |
| Validation Sign-Off checkboxes / `nyquist_compliant` | not set | a separate audit (`/gsd:validate-phase`), not part of this gate |

## Closing steps (2026-10-19)

- `gsd-tools roadmap update-plan-progress 02` -> `{"updated": true, "plan_count": 13, "summary_count": 13, "status": "Complete"}`. It only flipped the 02-13 checkbox; the phase checkbox, the reopen banner, the 02-13 description and the Progress row (13/13, Complete, 2026-10-19) were aligned by hand.
- `graphify update .` -> 5344 nodes, 9503 edges, 540 communities (graph reflects this branch's base `c34cb97` plus this plan's changes, not the newer `master`).
- `scripts/graph-link-requirements.py` (run right after) -> 53 requirement nodes, 585 edges. The script only covers the v1.1 IDs; the v1.0 IDs of this plan (KB-01, KB-02, CONT-01..03) exist only as UI-SPEC heading nodes (degree 1), so no code/test links are expected from it. Warnings about missing `tests/world-tree/*` files are expected on this branch (those files only exist on `master`).
- STATE.md, REQUIREMENTS.md, the SSOT and other phases' docs were not modified (outside this plan's scope); run `traceability-sync` after the merge to master.

## Deviations from Plan

None in Task 1. Per instruction, ROADMAP.md, STATE.md, REQUIREMENTS.md were not modified, `roadmap update-plan-progress` and graphify were not run; they belong to the Task 3 closing step after both gates are approved.

## Known Stubs

None.
