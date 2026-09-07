---
id: "item:gnNCq7BBvvoNJvdp7nB6l"
name: "WorkSubscription"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "sX2ROfqNfCIDxIsGLpv7-"
parentDocumentId: "doc:PHFPilcIyeRFlYeJ6GmPw"
stableKey: "dd-worksubscription"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:a22b016c31220d75"]
modelLinks: ["YvT2lTG9SMxvmrmmzTkGu:WorkSubscription","YvT2lTG9SMxvmrmmzTkGu:WorkSubscription#created_at","YvT2lTG9SMxvmrmmzTkGu:WorkSubscription#user_id","YvT2lTG9SMxvmrmmzTkGu:WorkSubscription#work_id"]
table_name: "work_subscriptions"
column_names: "created_at, user_id, work_id"
---
# WorkSubscription

Stores reader subscription records for works.

- Table: work_subscriptions
- Model links: YvT2lTG9SMxvmrmmzTkGu:WorkSubscription, YvT2lTG9SMxvmrmmzTkGu:WorkSubscription#created_at, YvT2lTG9SMxvmrmmzTkGu:WorkSubscription#user_id, YvT2lTG9SMxvmrmmzTkGu:WorkSubscription#work_id
- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:a22b016c31220d75

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| created_at | created_at | Timestamp when the subscription record was created. |
| user_id | user_id | Identifier of the reader who subscribed to the work. |
| work_id | work_id | Identifier of the subscribed work. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| user_id | Profile | manyToOne | reference | Links each subscription record to the profile that created the subscription. | user_id | id |
| work_id | Work | manyToOne | primary | Links each subscription record to the subscribed work. | work_id | id |

_Parent data dictionary: ../data_dictionary.md_
