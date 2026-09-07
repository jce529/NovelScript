---
id: "doc:QmAMJlA0BwN99_00PQqVW"
name: "Social Sign-In Data Dictionary"
type: "data_dictionary"
scope: "epic"
scopeId: "8v1lQnJKU9IzItheJ79gQ"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"social-sign-in-option","title":"Social sign-in option","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:8769f48b92cad45f"],"modelLinks":[]},{"stableKey":"social-sign-in-request","title":"Social sign-in request","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:8769f48b92cad45f"],"modelLinks":[]}]
relatedDocs: []
serviceMapNodes: []
---
# Social Sign-In Data Dictionary

Data dictionary draft for the Social Sign-In epic based on the provided login screen evidence. The available evidence describes UI-level social sign-in options and the sign-in request initiated from `/login`, but it does not confirm backend models or persisted storage.

## Evidence Gaps

- No backend model evidence was provided, so this draft cannot confirm any persisted tables, columns, or server-side records for social sign-in.
- The provided evidence only covers the `/login` screen and its OAuth initiation flow, so callback handling, session persistence, and user record updates are not confirmed here.

## Entities

| Entity | Table | Summary | Detail |
| --- | --- | --- | --- |
| Social sign-in option |  | A user-facing sign-in choice shown on the login screen for a supported OAuth provider. | data_dictionary/social-sign-in-option.md |
| Social sign-in request |  | A UI-triggered authentication request that sends the user into the external provider flow and returns to the configured callback location. | data_dictionary/social-sign-in-request.md |

## Retrieval Note

이 문서는 데이터 딕셔너리의 엔티티 목록과 라우팅 색인입니다.
특정 엔티티의 필드, 관계, 모델 링크, 근거 문서가 필요하면 `data_dictionary/<entity>.md` 하위 문서를 읽으세요.
