---
id: "item:WVmYKzaAOECi9b1paO9fX"
name: "Wallet"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "TPGBVklZxbIBligTLR7ZA"
parentDocumentId: "doc:bMV5WsvNEinEvm-frZQ8t"
stableKey: "entity-wallet"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:f55b2a55c6ec78f9"]
modelLinks: ["YvT2lTG9SMxvmrmmzTkGu:Wallet","YvT2lTG9SMxvmrmmzTkGu:Wallet#balance","YvT2lTG9SMxvmrmmzTkGu:Wallet#id","YvT2lTG9SMxvmrmmzTkGu:Wallet#updated_at"]
table_name: "wallets"
column_names: "balance, id, updated_at"
---
# Wallet

Model-backed wallet record referenced by the write-start screen through a supporting wallet lookup.

- Table: wallets
- Model links: YvT2lTG9SMxvmrmmzTkGu:Wallet, YvT2lTG9SMxvmrmmzTkGu:Wallet#balance, YvT2lTG9SMxvmrmmzTkGu:Wallet#id, YvT2lTG9SMxvmrmmzTkGu:Wallet#updated_at
- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:f55b2a55c6ec78f9

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| balance | balance | Wallet balance value present in the backend model. The provided sources do not confirm how this value affects writer upgrade. |
| id | id | Unique wallet identifier. Backend model evidence maps this field as the primary key. |
| updated_at | updated_at | Wallet update timestamp field present in the backend model evidence. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| id | Profile | manyToOne |  |  | id | id |
| ledgerEntries | LedgerEntry | oneToMany |  |  |  |  |

_Parent data dictionary: ../data_dictionary.md_
