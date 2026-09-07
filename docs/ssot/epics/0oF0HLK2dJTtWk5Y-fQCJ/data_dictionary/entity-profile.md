---
id: "item:rl_aU6WbZ7qG8vyXrtZ4M"
name: "Profile"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "0oF0HLK2dJTtWk5Y-fQCJ"
parentDocumentId: "doc:CCK9oxqDMF58gsQ1ImfiM"
stableKey: "entity-profile"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:ad11cb91be5b493f"]
modelLinks: ["YvT2lTG9SMxvmrmmzTkGu:Profile","YvT2lTG9SMxvmrmmzTkGu:Profile#created_at","YvT2lTG9SMxvmrmmzTkGu:Profile#deleted_at","YvT2lTG9SMxvmrmmzTkGu:Profile#id","YvT2lTG9SMxvmrmmzTkGu:Profile#pen_name","YvT2lTG9SMxvmrmmzTkGu:Profile#pen_name_bio"]
modelLinksOmitted: 3
table_name: "profiles"
column_names: "created_at, deleted_at, id, pen_name, pen_name_bio, pen_name_set_at, role, updated_at"
---
# Profile

Represents the signed-in person's account profile state for the account settings area, including role, pen name visibility, and inactive account soft-delete status.

- Table: profiles
- Model links: YvT2lTG9SMxvmrmmzTkGu:Profile, YvT2lTG9SMxvmrmmzTkGu:Profile#created_at, YvT2lTG9SMxvmrmmzTkGu:Profile#deleted_at, YvT2lTG9SMxvmrmmzTkGu:Profile#id, YvT2lTG9SMxvmrmmzTkGu:Profile#pen_name, YvT2lTG9SMxvmrmmzTkGu:Profile#pen_name_bio, YvT2lTG9SMxvmrmmzTkGu:Profile#pen_name_set_at, YvT2lTG9SMxvmrmmzTkGu:Profile#role, YvT2lTG9SMxvmrmmzTkGu:Profile#updated_at
- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:ad11cb91be5b493f

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| created_at | created_at | Timestamp recording when the profile record was created; this epic does not confirm user-facing display behavior. |
| deleted_at | deleted_at | Inactive-account marker; when not null, the account is treated as inactive and the person is signed out and redirected to login. |
| id | id | Unique identifier for the profile record and the linked signed-in person. |
| pen_name | pen_name | Writer-facing pen name shown only when the profile role is writer. |
| pen_name_bio | pen_name_bio | Profile pen name biography value stored for the profile; this epic does not confirm user-facing display behavior. |
| pen_name_set_at | pen_name_set_at | Timestamp recording when the pen name was set; this epic does not confirm user-facing display behavior. |
| role | role | Profile role that decides whether the account settings area shows a pen name or a writing-start link. |
| updated_at | updated_at | Timestamp recording the latest profile update; this epic does not confirm user-facing display behavior. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| id | User | manyToOne |  |  | id | id |
| kbNodes | KbNode | oneToMany |  |  |  |  |
| readingProgreses | ReadingProgres | oneToMany |  |  |  |  |
| reports | Report | oneToMany | out_of_scope | Model evidence shows linked report records, but this epic does not confirm their use. |  |  |
| wallets | Wallet | oneToMany | reference | Links the profile to wallet records that are selected in account settings evidence, although the screen behavior for wallet values is not confirmed. |  |  |
| workBookmarks | WorkBookmark | oneToMany |  |  |  |  |
| workLikes | WorkLike | oneToMany |  |  |  |  |
| works | Work | oneToMany | out_of_scope | Model evidence shows linked work records, but this epic does not confirm their use. |  |  |
| workSubscriptions | WorkSubscription | oneToMany |  |  |  |  |

_Parent data dictionary: ../data_dictionary.md_
