---
id: "item:x1yfjJjeXqws_t-JZ5dPk"
name: "Account email"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "j2LecR7weVGaqetE2Y2R0"
parentDocumentId: "doc:Q_zpcYVl_qHiPdFOclN-Y"
stableKey: "identity-completion-account-email"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:b1691adca3c4cb20","doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:c05b800246f420f4"]
modelLinks: []
table_name: null
column_names: ""
---
# Account email

The signed-in user's account email value that is updated in the external authentication system after successful validation.

- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:b1691adca3c4cb20, doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:c05b800246f420f4

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| email |  | The account email value that receives the validated submitted address. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| is updated from submission | Email submission | updated_from | primary | This account email value is changed from the submitted email during identity completion. |  |  |

_Parent data dictionary: ../data_dictionary.md_
