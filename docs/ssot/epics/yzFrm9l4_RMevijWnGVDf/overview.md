---
id: "doc:pURESnJ8kRZYpzA76ZAnn"
name: "Work Portfolio Management"
type: "overview"
scope: "epic"
scopeId: "yzFrm9l4_RMevijWnGVDf"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
itemCount: 0
relatedDocs: []
serviceMapNodes: []
---
# Work Portfolio Management

Routing card for the Studio work list experience where writers can see their works, open an existing title, or start a new one.

## Summary

Use this epic for the Studio screen that helps a writer review their existing works, open a work, or begin a new one.

## Evidence Gaps

- The exact behavior of work loading, empty-state handling, and navigation details should be verified in the lower source document before treating them as implementation guarantees.
- Authorization and ownership rules are not confirmed here and should be checked in the source flow and rule documents if they matter for a decision.
- The creation path and any downstream side effects are routing signals only at this level and need lower-document confirmation for precise behavior.

## Navigation

- project overview -> ../../overview.md
- epic catalog -> ../../catalog/epics.md
- rules -> br.md
- design -> design.md
- data -> data_dictionary.md
- use cases -> usecases/ucl.md
- API catalog -> ../../catalog/apis.md
- screen catalog -> ../../catalog/screens.md
- graph lookup -> sot resolve --epic yzFrm9l4_RMevijWnGVDf / graph trace
