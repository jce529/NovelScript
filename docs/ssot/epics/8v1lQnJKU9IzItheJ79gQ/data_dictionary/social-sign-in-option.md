---
id: "item:lfXQsi65xNgH31gqWHLe5"
name: "Social sign-in option"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "8v1lQnJKU9IzItheJ79gQ"
parentDocumentId: "doc:QmAMJlA0BwN99_00PQqVW"
stableKey: "social-sign-in-option"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:8769f48b92cad45f"]
modelLinks: []
table_name: null
column_names: ""
---
# Social sign-in option

A user-facing sign-in choice shown on the login screen for a supported OAuth provider.

- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:8769f48b92cad45f

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| provider |  | The supported social provider selected by the user. Observed values are Google and Kakao. |
| button_label |  | The user-facing label displayed for the sign-in action. |
| redirect_target |  | The return destination used after the external provider flow completes. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| starts_sign_in_request | Social sign-in request | initiates | primary | Choosing a sign-in option starts a sign-in request for the selected provider. |  |  |

_Parent data dictionary: ../data_dictionary.md_
