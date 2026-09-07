---
id: "item:5BgXlPj2rQM7_Y9FKK7DX"
name: "Wallet"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "0oF0HLK2dJTtWk5Y-fQCJ"
parentDocumentId: "doc:CCK9oxqDMF58gsQ1ImfiM"
stableKey: "entity-wallet"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:ad11cb91be5b493f"]
modelLinks: ["YvT2lTG9SMxvmrmmzTkGu:Wallet","YvT2lTG9SMxvmrmmzTkGu:Wallet#balance","YvT2lTG9SMxvmrmmzTkGu:Wallet#id","YvT2lTG9SMxvmrmmzTkGu:Wallet#updated_at"]
table_name: "wallets"
column_names: "balance, id, updated_at"
---
# Wallet

Represents a wallet record linked to a profile and referenced by account settings evidence, with balance and update time stored on the model.

- Table: wallets
- Model links: YvT2lTG9SMxvmrmmzTkGu:Wallet, YvT2lTG9SMxvmrmmzTkGu:Wallet#balance, YvT2lTG9SMxvmrmmzTkGu:Wallet#id, YvT2lTG9SMxvmrmmzTkGu:Wallet#updated_at
- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:ad11cb91be5b493f

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| balance | balance | Stored wallet balance value; the account settings evidence does not confirm whether this value is displayed. |
| id | id | Unique identifier for the wallet record and its link back to the profile. |
| updated_at | updated_at | Timestamp recording the latest wallet update; the account settings evidence does not confirm user-facing display behavior. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| id | Profile | manyToOne |  |  | id | id |
| ledgerEntries | LedgerEntry | oneToMany |  |  |  |  |

_Parent data dictionary: ../data_dictionary.md_
