---
id: "item:J1eWH5NIghk7JZWtO_rE7"
name: "Callback exchanged user"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "ddmjKqZQPK1w1e5HiSfvy"
parentDocumentId: "doc:feWe0694mNOv-BaqPo1g9"
stableKey: "callback-exchanged-user"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:d21928355a0ae298"]
modelLinks: []
table_name: null
column_names: ""
---
# Callback exchanged user

External authenticated user data returned by the auth code exchange and used for routing decisions.

- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:d21928355a0ae298

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| Resolved user presence |  | A successful callback requires the auth code exchange to return a user; otherwise the flow goes to the error path. |
| Email value |  | The user's email value is checked to decide whether the user must complete the email step. |
| Email completion needed |  | The flow derives whether the user needs the email completion route when the email is missing or blank. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| influences redirect outcome | Callback redirect outcome | influences | primary | The presence of a user and the email completion check determine the success redirect branch. |  |  |
| is resolved from callback input | Authentication callback input | resolved_from | reference | The external user is resolved by exchanging the authorization code from the callback input. |  |  |

_Parent data dictionary: ../data_dictionary.md_
