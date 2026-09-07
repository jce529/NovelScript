---
id: "item:rK0kZ3cglAmpU-MpMSZZ2"
name: "Wallet"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "sX2ROfqNfCIDxIsGLpv7-"
parentDocumentId: "doc:PHFPilcIyeRFlYeJ6GmPw"
stableKey: "dd-wallet"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:a22b016c31220d75"]
modelLinks: ["YvT2lTG9SMxvmrmmzTkGu:Wallet","YvT2lTG9SMxvmrmmzTkGu:Wallet#balance","YvT2lTG9SMxvmrmmzTkGu:Wallet#id","YvT2lTG9SMxvmrmmzTkGu:Wallet#updated_at"]
table_name: "wallets"
column_names: "balance, id, updated_at"
---
# Wallet

Stores wallet balance data linked by identifier to a profile.

- Table: wallets
- Model links: YvT2lTG9SMxvmrmmzTkGu:Wallet, YvT2lTG9SMxvmrmmzTkGu:Wallet#balance, YvT2lTG9SMxvmrmmzTkGu:Wallet#id, YvT2lTG9SMxvmrmmzTkGu:Wallet#updated_at
- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:a22b016c31220d75

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| balance | balance | Current stored wallet balance. |
| id | id | Identifier used for the wallet record. |
| updated_at | updated_at | Stores when the wallet was last updated. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| id | Profile | manyToOne | reference | The wallet record is linked to one profile by identifier. | id | id |
| ledgerEntries | LedgerEntry | oneToMany | out_of_scope | A wallet can have multiple ledger entry records associated with it. |  |  |

_Parent data dictionary: ../data_dictionary.md_
