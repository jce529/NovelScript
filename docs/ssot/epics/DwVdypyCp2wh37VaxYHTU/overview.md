---
id: "doc:y1bwH4LnR_nckIP4a2K20"
name: "Chapter Reading Experience"
type: "overview"
scope: "epic"
scopeId: "DwVdypyCp2wh37VaxYHTU"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
itemCount: 0
relatedDocs: []
serviceMapNodes: []
---
# Chapter Reading Experience

Routing overview for the chapter reader epic that covers chapter loading, reading navigation, table of contents access, viewing preferences, locked-state handling, and reader report submission.

## Summary

Supports the chapter consumption experience for a public work chapter, including navigation, reading preferences, table of contents, locked-state presentation, chapter-open tracking, and reader reporting.

## Evidence Gaps

- The detailed business rules behind access state handling are only summarized in the provided context, so exact gating behavior should be verified in lower-level source documents.
- The report submission flow is mentioned in the use case summary, but the exact authenticated reader conditions and response behavior are not confirmed here.
- The reading progress write path is referenced in the optional design summary, but the precise persistence conditions and update semantics are not confirmed in this upper-level overview.

## Navigation

- project overview -> ../../overview.md
- epic catalog -> ../../catalog/epics.md
- rules -> br.md
- design -> design.md
- data -> data_dictionary.md
- use cases -> usecases/ucl.md
- API catalog -> ../../catalog/apis.md
- screen catalog -> ../../catalog/screens.md
- graph lookup -> sot resolve --epic DwVdypyCp2wh37VaxYHTU / graph trace
