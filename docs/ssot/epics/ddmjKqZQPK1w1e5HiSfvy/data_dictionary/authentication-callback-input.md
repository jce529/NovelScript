---
id: "item:vr9INor1hNGZealzNaKtA"
name: "Authentication callback input"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "ddmjKqZQPK1w1e5HiSfvy"
parentDocumentId: "doc:feWe0694mNOv-BaqPo1g9"
stableKey: "authentication-callback-input"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:d21928355a0ae298"]
modelLinks: []
table_name: null
column_names: ""
---
# Authentication callback input

Request URL data used to process the callback and choose the next route.

- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:d21928355a0ae298

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| Authorization code |  | The callback includes an authorization code value that is required to attempt the sign-in completion step. |
| Next path |  | The callback may include a next path value, and when it is absent the flow uses '/' as the default destination. |
| Request origin |  | The request origin is used to build the final redirect URL for success and error outcomes. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| drives redirect outcome | Callback redirect outcome | drives | primary | The callback input determines whether the flow can continue and which redirect target is constructed. |  |  |
| requests external user resolution | Callback exchanged user | requests | primary | The authorization code is exchanged to resolve an authenticated external user for this callback. |  |  |

_Parent data dictionary: ../data_dictionary.md_
