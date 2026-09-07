---
id: "item:GRl3JTl7A9nF4Wb32iUN0"
name: "Wallet"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "y10ONYsPUsuqDchl5bB47"
parentDocumentId: "doc:i8nz5cyThMV-9swf3Coac"
stableKey: "entity-wallet"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:406184af4ba83897"]
modelLinks: ["YvT2lTG9SMxvmrmmzTkGu:Wallet","YvT2lTG9SMxvmrmmzTkGu:Wallet#balance","YvT2lTG9SMxvmrmmzTkGu:Wallet#id","YvT2lTG9SMxvmrmmzTkGu:Wallet#updated_at"]
table_name: "wallets"
column_names: "balance, id, updated_at"
---
# Wallet

Supporting account balance data linked to a profile.

- Table: wallets
- Model links: YvT2lTG9SMxvmrmmzTkGu:Wallet, YvT2lTG9SMxvmrmmzTkGu:Wallet#balance, YvT2lTG9SMxvmrmmzTkGu:Wallet#id, YvT2lTG9SMxvmrmmzTkGu:Wallet#updated_at
- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:406184af4ba83897

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| balance | balance | Stored balance amount for the wallet. |
| id | id | Unique identifier for the wallet record. |
| updated_at | updated_at | Timestamp for the latest wallet update. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| id | Profile | manyToOne |  |  | id | id |
| ledgerEntries | LedgerEntry | oneToMany |  |  |  |  |

_Parent data dictionary: ../data_dictionary.md_
