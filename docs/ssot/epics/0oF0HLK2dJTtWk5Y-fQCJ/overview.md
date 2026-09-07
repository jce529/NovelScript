---
id: "doc:HOqybhqWgXcqxgn-ceAoJ"
name: "Account Overview"
type: "overview"
scope: "epic"
scopeId: "0oF0HLK2dJTtWk5Y-fQCJ"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
itemCount: 0
relatedDocs: []
serviceMapNodes: []
---
# Account Overview

Routing card for the signed-in account settings experience. It centers on the current user, profile state, and the next actions shown from one account area.

## Summary

Show signed-in users their account details, profile state, and relevant next actions from one settings area.

## Evidence Gaps

- The exact inactive-account condition and redirect behavior should be confirmed in the lower source documents before treating it as a project-wide rule.
- The precise profile fields and any wallet-related presentation details should be verified in the connected source cards if they matter to downstream work.
- The full set of next-action links is not confirmed from this upper routing context alone.

## Navigation

- project overview -> ../../overview.md
- epic catalog -> ../../catalog/epics.md
- rules -> br.md
- design -> design.md
- data -> data_dictionary.md
- use cases -> usecases/ucl.md
- API catalog -> ../../catalog/apis.md
- screen catalog -> ../../catalog/screens.md
- graph lookup -> sot resolve --epic 0oF0HLK2dJTtWk5Y-fQCJ / graph trace
