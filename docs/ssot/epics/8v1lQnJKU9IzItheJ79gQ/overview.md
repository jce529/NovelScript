---
id: "doc:mBxOE5vIfXbKdm-6HEKQu"
name: "Social Sign-In"
type: "overview"
scope: "epic"
scopeId: "8v1lQnJKU9IzItheJ79gQ"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
itemCount: 0
relatedDocs: []
serviceMapNodes: []
---
# Social Sign-In

Routing card for the epic that covers starting an authenticated session through supported social login providers.

## Summary

Routes users to the sign-in flow for supported OAuth providers and into the authentication callback path.

## Evidence Gaps

- The exact end-to-end session behavior after provider return is not confirmed in the provided context.
- The accepted provider set is only confirmed here for Google and Kakao.
- Any validation, error handling, or authorization boundaries beyond the login screen flow are not confirmed in the provided context.

## Navigation

- project overview -> ../../overview.md
- epic catalog -> ../../catalog/epics.md
- rules -> br.md
- design -> design.md
- data -> data_dictionary.md
- use cases -> usecases/ucl.md
- API catalog -> ../../catalog/apis.md
- screen catalog -> ../../catalog/screens.md
- graph lookup -> sot resolve --epic 8v1lQnJKU9IzItheJ79gQ / graph trace
