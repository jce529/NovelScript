---
id: "item:sQ9qG6fb0_TYrGfbGetnX"
name: "Login Page Destination"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "4m8kG11em9A1CUTWJcWoz"
parentDocumentId: "doc:ESz_vWr2WC5viYWb2oFcW"
stableKey: "login-page-destination"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:5bc68d3024c8a70a"]
modelLinks: []
table_name: null
column_names: ""
---
# Login Page Destination

External destination used by the recovery screen.

- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:5bc68d3024c8a70a

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| route_path |  | Route used as the return destination for the user. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| is_target_of | Login Error Screen State | navigation_target_for | reference | This destination is reached from the error recovery screen link. |  | /login |

_Parent data dictionary: ../data_dictionary.md_
