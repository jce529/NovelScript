---
id: "doc:GZUk8gFV3t05jLRPYJx6y"
name: "Writer Upgrade"
type: "ucl"
scope: "epic"
scopeId: "TPGBVklZxbIBligTLR7ZA"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"use-case-authenticated-reader-starts-writer-onboarding","title":"Authenticated reader starts writer onboarding","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:881e24b5984c6f29","doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:f55b2a55c6ec78f9"],"modelLinks":[]}]
relatedDocs: []
serviceMapNodes: []
---
# Writer Upgrade

Routing index for the authenticated reader flow that starts writer onboarding with a pen name and optional bio.

## Use Case Index

| Use case | Actor | Goal | Linked specs |
| --- | --- | --- | --- |
| use-case-authenticated-reader-starts-writer-onboarding | authenticated reader | Become a writer account with the minimum required profile setup. | 2 docs |

## use-case-authenticated-reader-starts-writer-onboarding — Authenticated reader starts writer onboarding

An authenticated reader begins writer account setup with a pen name and optional bio.

Actor: authenticated reader

Goal: Become a writer account with the minimum required profile setup.

Claim: An authenticated user whose current profile is still a reader can begin writer onboarding by entering a pen name and optional bio, then submitting the upgrade flow. The pen name must trim to 2-20 characters, an empty bio is stored as null, duplicate pen names return a fixed in-use error, and unauthenticated access redirects to /login.

Cautions:
- The provided context only confirms the authenticated start flow and profile update constraint; stronger role or ownership rules are not proven.
- Successful post-upgrade destination and any additional writer onboarding steps are not confirmed in the provided context.
