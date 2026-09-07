---
id: "doc:MhslKRH9b8otdwhdjz8ni"
name: "Identity Completion"
type: "overview"
scope: "epic"
scopeId: "j2LecR7weVGaqetE2Y2R0"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
itemCount: 0
relatedDocs: []
serviceMapNodes: []
---
# Identity Completion

Routing overview for the flow that helps a signed-in user complete missing identity details, especially an email address, before continuing account use.

## Summary

This epic covers the user-facing path for completing incomplete account identity information so a signed-in user can proceed with a valid email on record.

## Evidence Gaps

- The exact authorization boundary for who can reach this flow is not fully confirmed from the provided context alone.
- The full set of validation and redirect branches is not completely confirmed beyond the basic invalid-email handling described in the source cards.
- The downstream account update outcome after submission is only partially evidenced here, so persistence and post-submit behavior should be verified in the lower-level source documents.

## Navigation

- project overview -> ../../overview.md
- epic catalog -> ../../catalog/epics.md
- rules -> br.md
- design -> design.md
- data -> data_dictionary.md
- use cases -> usecases/ucl.md
- API catalog -> ../../catalog/apis.md
- screen catalog -> ../../catalog/screens.md
- graph lookup -> sot resolve --epic j2LecR7weVGaqetE2Y2R0 / graph trace
