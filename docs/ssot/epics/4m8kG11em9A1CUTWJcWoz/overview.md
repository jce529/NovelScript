---
id: "doc:OzFrpWfTw-LXPQG-bbKu-"
name: "Login Error Recovery"
type: "overview"
scope: "epic"
scopeId: "4m8kG11em9A1CUTWJcWoz"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
itemCount: 0
relatedDocs: []
serviceMapNodes: []
---
# Login Error Recovery

Routing card for the flow that helps users recover after a failed or interrupted sign-in attempt and return to the login page.

## Summary

Guide users back into the sign-in flow when authentication fails or is interrupted.

## Evidence Gaps

- The provided context confirms a centered error screen with a single return link, but the exact failure conditions that trigger it are not fully specified.
- The available context does not confirm whether the screen is static, localized, or conditionally rendered across variants.
- The exact navigation behavior after selecting the return link is only partially described, so the login page destination should be verified in lower-level source cards if precise routing matters.

## Navigation

- project overview -> ../../overview.md
- epic catalog -> ../../catalog/epics.md
- rules -> br.md
- design -> design.md
- data -> data_dictionary.md
- use cases -> usecases/ucl.md
- API catalog -> ../../catalog/apis.md
- screen catalog -> ../../catalog/screens.md
- graph lookup -> sot resolve --epic 4m8kG11em9A1CUTWJcWoz / graph trace
