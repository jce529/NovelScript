---
id: "doc:9fg7L39Ihc7-5-AjfsjnA"
name: "Authentication Callback Handling"
type: "overview"
scope: "epic"
scopeId: "ddmjKqZQPK1w1e5HiSfvy"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
itemCount: 0
relatedDocs: []
serviceMapNodes: []
---
# Authentication Callback Handling

Routing card for the external sign-in callback flow that exchanges an authorization code for a session and sends the user to completion, the requested next step, or an error path.

## Summary

Complete the external sign-in flow, create the user session, and route users to the correct next step or error path.

## Evidence Gaps

- The exact redirect decision branches and fallback behavior should be verified in the lower source document and implementation before treating them as complete.
- The session creation and user-resolution details are summarized at the routing level only and need lower-document confirmation for exact behavior.
- The conditions for email completion handling and error routing are not fully confirmed from this upper-level context alone.

## Navigation

- project overview -> ../../overview.md
- epic catalog -> ../../catalog/epics.md
- rules -> br.md
- design -> design.md
- data -> data_dictionary.md
- use cases -> usecases/ucl.md
- API catalog -> ../../catalog/apis.md
- screen catalog -> ../../catalog/screens.md
- graph lookup -> sot resolve --epic ddmjKqZQPK1w1e5HiSfvy / graph trace
