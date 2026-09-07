---
id: "item:3wYHWSPnYZaiAcecFVSgh"
name: "Profile"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "y10ONYsPUsuqDchl5bB47"
parentDocumentId: "doc:i8nz5cyThMV-9swf3Coac"
stableKey: "entity-profile"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:406184af4ba83897"]
modelLinks: ["YvT2lTG9SMxvmrmmzTkGu:Profile","YvT2lTG9SMxvmrmmzTkGu:Profile#created_at","YvT2lTG9SMxvmrmmzTkGu:Profile#deleted_at","YvT2lTG9SMxvmrmmzTkGu:Profile#id","YvT2lTG9SMxvmrmmzTkGu:Profile#pen_name","YvT2lTG9SMxvmrmmzTkGu:Profile#pen_name_bio"]
modelLinksOmitted: 3
table_name: "profiles"
column_names: "created_at, deleted_at, id, pen_name, pen_name_bio, pen_name_set_at, role, updated_at"
---
# Profile

Reader or writer profile data used as the anchor for home personalization and related discovery records.

- Table: profiles
- Model links: YvT2lTG9SMxvmrmmzTkGu:Profile, YvT2lTG9SMxvmrmmzTkGu:Profile#created_at, YvT2lTG9SMxvmrmmzTkGu:Profile#deleted_at, YvT2lTG9SMxvmrmmzTkGu:Profile#id, YvT2lTG9SMxvmrmmzTkGu:Profile#pen_name, YvT2lTG9SMxvmrmmzTkGu:Profile#pen_name_bio, YvT2lTG9SMxvmrmmzTkGu:Profile#pen_name_set_at, YvT2lTG9SMxvmrmmzTkGu:Profile#role, YvT2lTG9SMxvmrmmzTkGu:Profile#updated_at
- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:406184af4ba83897

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| created_at | created_at | Timestamp for when the profile record was created. |
| deleted_at | deleted_at | Timestamp marking soft deletion when present. |
| id | id | Unique identifier for the profile record. |
| pen_name | pen_name | Displayed writer name stored on the profile when present. |
| pen_name_bio | pen_name_bio | Short biography text attached to the pen name when present. |
| pen_name_set_at | pen_name_set_at | Timestamp for when the pen name was set, when available. |
| role | role | Role value stored for the profile. |
| updated_at | updated_at | Timestamp for the latest profile update. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| id | User | manyToOne |  |  | id | id |
| kbNodes | KbNode | oneToMany |  |  |  |  |
| readingProgreses | ReadingProgres | oneToMany |  |  |  |  |
| reports | Report | oneToMany |  |  |  |  |
| wallets | Wallet | oneToMany |  |  |  |  |
| workBookmarks | WorkBookmark | oneToMany |  |  |  |  |
| workLikes | WorkLike | oneToMany |  |  |  |  |
| works | Work | oneToMany |  |  |  |  |
| workSubscriptions | WorkSubscription | oneToMany |  |  |  |  |

_Parent data dictionary: ../data_dictionary.md_
