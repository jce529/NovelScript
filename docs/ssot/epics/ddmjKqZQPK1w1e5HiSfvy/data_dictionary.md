---
id: "doc:feWe0694mNOv-BaqPo1g9"
name: "Data Dictionary: Authentication Callback Handling"
type: "data_dictionary"
scope: "epic"
scopeId: "ddmjKqZQPK1w1e5HiSfvy"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"authentication-callback-input","title":"Authentication callback input","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:d21928355a0ae298"],"modelLinks":[]},{"stableKey":"callback-exchanged-user","title":"Callback exchanged user","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:d21928355a0ae298"],"modelLinks":[]},{"stableKey":"callback-redirect-outcome","title":"Callback redirect outcome","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:d21928355a0ae298"],"modelLinks":[]}]
relatedDocs: []
serviceMapNodes: []
---
# Data Dictionary: Authentication Callback Handling

Logical data entities observed in the authentication callback flow, including callback inputs, exchanged external user data, and redirect routing outcomes.

## Evidence Gaps

- The provided evidence does not identify any backend model or database table for this epic, so all entities are described as request, external, or derived data only.
- The provided evidence does not confirm the persisted storage identity or field structure of the created user session after the auth code exchange succeeds.
- The provided evidence does not confirm any additional user attributes, session attributes, or redirect validation rules beyond the fields and decisions explicitly described in the callback flow.

## Entities

| Entity | Table | Summary | Detail |
| --- | --- | --- | --- |
| Authentication callback input |  | Request URL data used to process the callback and choose the next route. | data_dictionary/authentication-callback-input.md |
| Callback exchanged user |  | External authenticated user data returned by the auth code exchange and used for routing decisions. | data_dictionary/callback-exchanged-user.md |
| Callback redirect outcome |  | Derived redirect target produced by the callback handler for success, completion, or error branches. | data_dictionary/callback-redirect-outcome.md |

## Retrieval Note

이 문서는 데이터 딕셔너리의 엔티티 목록과 라우팅 색인입니다.
특정 엔티티의 필드, 관계, 모델 링크, 근거 문서가 필요하면 `data_dictionary/<entity>.md` 하위 문서를 읽으세요.
