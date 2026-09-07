---
id: "item:vWhKD7doJom5AxiVbaypm"
name: "Callback redirect outcome"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "ddmjKqZQPK1w1e5HiSfvy"
parentDocumentId: "doc:feWe0694mNOv-BaqPo1g9"
stableKey: "callback-redirect-outcome"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:d21928355a0ae298"]
modelLinks: []
table_name: null
column_names: ""
---
# Callback redirect outcome

Derived redirect target produced by the callback handler for success, completion, or error branches.

- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:d21928355a0ae298

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| Destination path |  | The flow redirects to '/auth/complete-email', to the next path, or to '/auth/auth-code-error' based on the callback result. |
| Default destination |  | When no next path is provided, the success destination defaults to '/'. |
| Error fallback |  | Missing code, exchange failure, or missing user all fall back to the auth code error path. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| is determined by callback input | Authentication callback input | determined_by | primary | Redirect construction depends on the presence of the authorization code, the optional next path, and the request origin. |  |  |
| is determined by exchanged user | Callback exchanged user | determined_by | primary | Redirect branching depends on whether a user is returned and whether the user needs email completion. |  |  |

_Parent data dictionary: ../data_dictionary.md_
