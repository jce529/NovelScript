---
id: "item:WZErYO_H0EnS8A7Oa7I9s"
name: "Profile"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "sX2ROfqNfCIDxIsGLpv7-"
parentDocumentId: "doc:PHFPilcIyeRFlYeJ6GmPw"
stableKey: "dd-profile"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:a22b016c31220d75"]
modelLinks: ["YvT2lTG9SMxvmrmmzTkGu:Profile","YvT2lTG9SMxvmrmmzTkGu:Profile#created_at","YvT2lTG9SMxvmrmmzTkGu:Profile#deleted_at","YvT2lTG9SMxvmrmmzTkGu:Profile#id","YvT2lTG9SMxvmrmmzTkGu:Profile#pen_name","YvT2lTG9SMxvmrmmzTkGu:Profile#pen_name_bio"]
modelLinksOmitted: 3
table_name: "profiles"
column_names: "created_at, deleted_at, id, pen_name, pen_name_bio, pen_name_set_at, role, updated_at"
---
# Profile

Stores the reader or author profile identity used across work ownership, reading progress, and engagement relationships.

- Table: profiles
- Model links: YvT2lTG9SMxvmrmmzTkGu:Profile, YvT2lTG9SMxvmrmmzTkGu:Profile#created_at, YvT2lTG9SMxvmrmmzTkGu:Profile#deleted_at, YvT2lTG9SMxvmrmmzTkGu:Profile#id, YvT2lTG9SMxvmrmmzTkGu:Profile#pen_name, YvT2lTG9SMxvmrmmzTkGu:Profile#pen_name_bio, YvT2lTG9SMxvmrmmzTkGu:Profile#pen_name_set_at, YvT2lTG9SMxvmrmmzTkGu:Profile#role, YvT2lTG9SMxvmrmmzTkGu:Profile#updated_at
- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:a22b016c31220d75

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| created_at | created_at | Timestamp when the profile record was created. |
| deleted_at | deleted_at | Timestamp used for soft deletion when the profile is no longer active. |
| id | id | Unique identifier for the profile record. |
| pen_name | pen_name | Optional public-facing pen name for the profile. |
| pen_name_bio | pen_name_bio | Optional biography text associated with the pen name. |
| pen_name_set_at | pen_name_set_at | Timestamp when the pen name was set, if one has been established. |
| role | role | Account role stored for the profile. |
| updated_at | updated_at | Timestamp when the profile record was last updated. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| id | User | manyToOne | out_of_scope | Each profile is linked to one user account through the same identifier. | id | id |
| kbNodes | KbNode | oneToMany | out_of_scope | A profile can be linked to multiple knowledge base nodes. |  |  |
| readingProgreses | ReadingProgres | oneToMany | primary | A profile can have multiple reading progress records. |  |  |
| reports | Report | oneToMany | out_of_scope | A profile can be linked to multiple report records. |  |  |
| wallets | Wallet | oneToMany | out_of_scope | A profile can be linked to multiple wallet records. |  |  |
| workBookmarks | WorkBookmark | oneToMany | out_of_scope | A profile can own multiple bookmarked work records. |  |  |
| workLikes | WorkLike | oneToMany | out_of_scope | A profile can own multiple liked work records. |  |  |
| works | Work | oneToMany | reference | A profile can own multiple work records. |  |  |
| workSubscriptions | WorkSubscription | oneToMany | out_of_scope | A profile can own multiple work subscription records. |  |  |

_Parent data dictionary: ../data_dictionary.md_
