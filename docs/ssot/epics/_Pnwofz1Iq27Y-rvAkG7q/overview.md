---
id: "doc:SlWYMrN2ubEGjL4zbuXGm"
name: "Work Workspace"
type: "overview"
scope: "epic"
scopeId: "_Pnwofz1Iq27Y-rvAkG7q"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
itemCount: 0
relatedDocs: []
serviceMapNodes: []
---
# Work Workspace

Routing card for the work detail landing page where an authenticated user reviews a work summary and navigates into chapter work.

## Summary

Home base for a work where writers review core details and move into editing tasks.

## Evidence Gaps

- The exact authorization boundary is not fully confirmed beyond the user-scoped work lookup described in the source card.
- The chapter-list navigation target is referenced by the source summary, but the underlying chapter workflow is not verified here.
- The business rules noted in the context are not expanded, so any additional state, validation, or access constraints should be checked in lower source documents.

## Navigation

- project overview -> ../../overview.md
- epic catalog -> ../../catalog/epics.md
- rules -> br.md
- design -> design.md
- data -> data_dictionary.md
- use cases -> usecases/ucl.md
- API catalog -> ../../catalog/apis.md
- screen catalog -> ../../catalog/screens.md
- graph lookup -> sot resolve --epic _Pnwofz1Iq27Y-rvAkG7q / graph trace
