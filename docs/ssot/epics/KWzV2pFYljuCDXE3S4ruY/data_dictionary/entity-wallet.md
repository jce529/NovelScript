---
id: "item:XDiGTIruq-KSxXnMZUWu7"
name: "Wallet"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "KWzV2pFYljuCDXE3S4ruY"
parentDocumentId: "doc:cRQ5MnQcBsOiDxUynCU6j"
stableKey: "entity:wallet"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:4835eab26aa2d783"]
modelLinks: ["YvT2lTG9SMxvmrmmzTkGu:Wallet","YvT2lTG9SMxvmrmmzTkGu:Wallet#balance","YvT2lTG9SMxvmrmmzTkGu:Wallet#id","YvT2lTG9SMxvmrmmzTkGu:Wallet#updated_at"]
table_name: "wallets"
column_names: "balance, id, updated_at"
---
# Wallet

Referenced wallet record that exposes a balance and profile link, but whose chapter-editor behavior is not confirmed by the provided evidence.

- Table: wallets
- Model links: YvT2lTG9SMxvmrmmzTkGu:Wallet, YvT2lTG9SMxvmrmmzTkGu:Wallet#balance, YvT2lTG9SMxvmrmmzTkGu:Wallet#id, YvT2lTG9SMxvmrmmzTkGu:Wallet#updated_at
- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:4835eab26aa2d783

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| balance | balance | Current stored balance value. |
| id | id | Unique identifier for the wallet record. |
| updated_at | updated_at | Time when the wallet balance was last updated. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| id | Profile | manyToOne |  |  | id | id |
| ledgerEntries | LedgerEntry | oneToMany |  |  |  |  |

_Parent data dictionary: ../data_dictionary.md_
