---
id: "item:g0QiGnizJq8mu8RzQp2AF"
name: "Email submission"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "j2LecR7weVGaqetE2Y2R0"
parentDocumentId: "doc:Q_zpcYVl_qHiPdFOclN-Y"
stableKey: "identity-completion-email-submission"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:b1691adca3c4cb20","doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:c05b800246f420f4"]
modelLinks: []
table_name: null
column_names: ""
---
# Email submission

A submitted email value used to complete missing identity details before the user continues to their account.

- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:b1691adca3c4cb20, doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:c05b800246f420f4

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| email |  | The email address entered by the user and trimmed before validation and account update. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| updates account email | Account email | updates | primary | A valid submitted email is used to update the signed-in user's account email value. |  |  |

_Parent data dictionary: ../data_dictionary.md_
