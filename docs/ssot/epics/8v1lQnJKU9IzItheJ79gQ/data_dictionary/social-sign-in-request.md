---
id: "item:hDn3BF7nV7HMR2_CH96Ea"
name: "Social sign-in request"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "8v1lQnJKU9IzItheJ79gQ"
parentDocumentId: "doc:QmAMJlA0BwN99_00PQqVW"
stableKey: "social-sign-in-request"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:8769f48b92cad45f"]
modelLinks: []
table_name: null
column_names: ""
---
# Social sign-in request

A UI-triggered authentication request that sends the user into the external provider flow and returns to the configured callback location.

- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:8769f48b92cad45f

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| provider |  | The external provider used for the authentication request. |
| redirect_target |  | The callback destination configured for the return from the provider flow. |
| origin_scope |  | The current browser origin used to build the callback destination. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| originates_from_login_option | Social sign-in option | originates_from | primary | Each request is started from one of the supported login screen sign-in options. |  |  |

_Parent data dictionary: ../data_dictionary.md_
