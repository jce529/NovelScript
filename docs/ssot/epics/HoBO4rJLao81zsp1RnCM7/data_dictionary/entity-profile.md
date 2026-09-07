---
id: "item:wpKR4kmdxL2NvNbTGulmN"
name: "Profile"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "HoBO4rJLao81zsp1RnCM7"
parentDocumentId: "doc:p57AR8CKjIH2OyzwlkrUM"
stableKey: "entity:Profile"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:c6012ec2744d8fcf"]
modelLinks: ["YvT2lTG9SMxvmrmmzTkGu:Profile","YvT2lTG9SMxvmrmmzTkGu:Profile#created_at","YvT2lTG9SMxvmrmmzTkGu:Profile#deleted_at","YvT2lTG9SMxvmrmmzTkGu:Profile#id","YvT2lTG9SMxvmrmmzTkGu:Profile#pen_name","YvT2lTG9SMxvmrmmzTkGu:Profile#pen_name_bio"]
modelLinksOmitted: 3
table_name: "profiles"
column_names: "created_at, deleted_at, id, pen_name, pen_name_bio, pen_name_set_at, role, updated_at"
---
# Profile

Represents the user profile row that account closure soft-deletes by clearing profile biography text and setting a deletion timestamp.

- Table: profiles
- Model links: YvT2lTG9SMxvmrmmzTkGu:Profile, YvT2lTG9SMxvmrmmzTkGu:Profile#created_at, YvT2lTG9SMxvmrmmzTkGu:Profile#deleted_at, YvT2lTG9SMxvmrmmzTkGu:Profile#id, YvT2lTG9SMxvmrmmzTkGu:Profile#pen_name, YvT2lTG9SMxvmrmmzTkGu:Profile#pen_name_bio, YvT2lTG9SMxvmrmmzTkGu:Profile#pen_name_set_at, YvT2lTG9SMxvmrmmzTkGu:Profile#role, YvT2lTG9SMxvmrmmzTkGu:Profile#updated_at
- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:c6012ec2744d8fcf

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| created_at | created_at | Timestamp for when the profile row was created. |
| deleted_at | deleted_at | Optional soft-delete timestamp. Account closure evidence shows this value is set when the profile is soft-deleted, but only when it is currently null. |
| id | id | Unique identifier for the profile row and the user-linked profile targeted during account closure. |
| pen_name | pen_name | Optional public writing name stored on the profile. |
| pen_name_bio | pen_name_bio | Optional pen name biography text. Account closure evidence shows this value is cleared to null during soft delete. |
| pen_name_set_at | pen_name_set_at | Optional timestamp for when the pen name was set. |
| role | role | Role value stored on the profile. |
| updated_at | updated_at | Timestamp for the latest profile row update. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| id | User | manyToOne | primary | Links the profile row to the corresponding user record through the shared identifier used by the account closure flow. | id | id |
| kbNodes | KbNode | oneToMany | out_of_scope | Profile can be linked to multiple knowledge-base node records. |  |  |
| readingProgreses | ReadingProgres | oneToMany | out_of_scope | Profile can be linked to multiple reading progress records. |  |  |
| reports | Report | oneToMany | out_of_scope | Profile can be linked to multiple report records. |  |  |
| wallets | Wallet | oneToMany | out_of_scope | Profile can be linked to multiple wallet records. |  |  |
| workBookmarks | WorkBookmark | oneToMany | out_of_scope | Profile can be linked to multiple work bookmark records. |  |  |
| workLikes | WorkLike | oneToMany | out_of_scope | Profile can be linked to multiple work like records. |  |  |
| works | Work | oneToMany | out_of_scope | Profile can be linked to multiple work records. |  |  |
| workSubscriptions | WorkSubscription | oneToMany | out_of_scope | Profile can be linked to multiple work subscription records. |  |  |

_Parent data dictionary: ../data_dictionary.md_
