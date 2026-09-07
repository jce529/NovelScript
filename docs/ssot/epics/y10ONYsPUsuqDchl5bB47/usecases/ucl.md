---
id: "doc:AwCJ9e2ky5j9ek3Volw7i"
name: "Home Discovery Use Case List"
type: "ucl"
scope: "epic"
scopeId: "y10ONYsPUsuqDchl5bB47"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"use-case-browse-home-discovery-feed","title":"Browse the home discovery feed","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:406184af4ba83897"],"modelLinks":[]},{"stableKey":"use-case-continue-reading-from-home","title":"Continue reading from the home screen","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:406184af4ba83897"],"modelLinks":[]}]
relatedDocs: []
serviceMapNodes: []
---
# Home Discovery Use Case List

Searchable routing index for the home discovery experience backed by the provided home screen source.

## Use Case Index

| Use case | Actor | Goal | Linked specs |
| --- | --- | --- | --- |
| use-case-browse-home-discovery-feed | visitor | Browse ranked and filtered works from the home discovery screen. | 1 doc |
| use-case-continue-reading-from-home | authenticated user | Resume reading from recent activity while browsing the home discovery screen. | 1 doc |

## use-case-browse-home-discovery-feed — Browse the home discovery feed

A visitor browses the main home discovery experience with ranking and genre filters.

Actor: visitor

Goal: Browse ranked and filtered works from the home discovery screen.

Claim: A visitor can open the home discovery screen to browse promoted and ranked works, use genre and ranking filters with defined fallback behavior, and see either a filtered grid or an empty state when no works match.

Cautions:
- Unsupported ranking mode values fall back to a default instead of creating a separate behavior path.
- The source proves screen rendering and filter fallback rules, not the underlying ranking formula.
- Empty-state behavior is confirmed only when no feed rows remain after filtering and sorting.

## use-case-continue-reading-from-home — Continue reading from the home screen

An authenticated user resumes discovery with a recently read continuation section on the home screen.

Actor: authenticated user

Goal: Resume reading from recent activity while browsing the home discovery screen.

Claim: An authenticated user can return to the home discovery screen and receive a recently read section that surfaces continuation cues alongside the general discovery content.

Cautions:
- This continuation experience is only evidenced for signed-in users.
- The source confirms a limit on recently read items, but not the full business rule for which reading records qualify.
- Broader personalized recommendations are not proven by this source.
