---
id: "doc:PwxFt1aa00rJGCj4optW2"
name: "Account Closure"
type: "overview"
scope: "epic"
scopeId: "HoBO4rJLao81zsp1RnCM7"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
itemCount: 0
relatedDocs: []
serviceMapNodes: []
---
# Account Closure

Routing overview for the account closure flow: it points to the path where an authenticated user can close their account, clear active profile details, and end the session.

## Summary

Guides questions about closing an account, clearing profile data, and ending the current session.

## Evidence Gaps

- The exact behavior for related cleanup beyond the observed profile soft-delete and sign-out flow is not confirmed in the provided context.
- The precise handling of error branches, redirects, and any follow-up state changes should be verified in the lower source documents before relying on them as project-wide behavior.

## Navigation

- project overview -> ../../overview.md
- epic catalog -> ../../catalog/epics.md
- rules -> br.md
- design -> design.md
- data -> data_dictionary.md
- use cases -> usecases/ucl.md
- API catalog -> ../../catalog/apis.md
- screen catalog -> ../../catalog/screens.md
- graph lookup -> sot resolve --epic HoBO4rJLao81zsp1RnCM7 / graph trace
