---
id: "doc:ESz_vWr2WC5viYWb2oFcW"
name: "Data Dictionary: Login Error Recovery"
type: "data_dictionary"
scope: "epic"
scopeId: "4m8kG11em9A1CUTWJcWoz"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"login-error-screen-state","title":"Login Error Screen State","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:5bc68d3024c8a70a"],"modelLinks":[]},{"stableKey":"login-page-destination","title":"Login Page Destination","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:5bc68d3024c8a70a"],"modelLinks":[]},{"stableKey":"missing-model-evidence","title":"Missing Model Evidence","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:5bc68d3024c8a70a"],"modelLinks":[]}]
relatedDocs: []
serviceMapNodes: []
---
# Data Dictionary: Login Error Recovery

Logical data entries observed for the login error recovery screen and its return-to-login destination.

## Evidence Gaps

- No backend model evidence is provided for this epic, so persistent storage and database column mappings are not confirmed.
- The source confirms static screen content and a return navigation target, but it does not confirm any API payload, session mutation, or error-code-specific data structure.

## Entities

| Entity | Table | Summary | Detail |
| --- | --- | --- | --- |
| Login Error Screen State |  | Static UI state for the failed login screen. | data_dictionary/login-error-screen-state.md |
| Login Page Destination |  | External destination used by the recovery screen. | data_dictionary/login-page-destination.md |
| Missing Model Evidence |  | Persistent storage is not confirmed for this epic. | data_dictionary/missing-model-evidence.md |

## Retrieval Note

이 문서는 데이터 딕셔너리의 엔티티 목록과 라우팅 색인입니다.
특정 엔티티의 필드, 관계, 모델 링크, 근거 문서가 필요하면 `data_dictionary/<entity>.md` 하위 문서를 읽으세요.
