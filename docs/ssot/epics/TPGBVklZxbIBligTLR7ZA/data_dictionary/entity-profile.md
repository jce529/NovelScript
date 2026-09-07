---
id: "item:fcYI4qaWGYqWvvj7QpUwq"
name: "Profile"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "TPGBVklZxbIBligTLR7ZA"
parentDocumentId: "doc:bMV5WsvNEinEvm-frZQ8t"
stableKey: "entity-profile"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:881e24b5984c6f29","doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:f55b2a55c6ec78f9"]
modelLinks: ["YvT2lTG9SMxvmrmmzTkGu:Profile","YvT2lTG9SMxvmrmmzTkGu:Profile#created_at","YvT2lTG9SMxvmrmmzTkGu:Profile#deleted_at","YvT2lTG9SMxvmrmmzTkGu:Profile#id","YvT2lTG9SMxvmrmmzTkGu:Profile#pen_name","YvT2lTG9SMxvmrmmzTkGu:Profile#pen_name_bio"]
modelLinksOmitted: 3
table_name: "profiles"
column_names: "created_at, deleted_at, id, pen_name, pen_name_bio, pen_name_set_at, role, updated_at"
---
# Profile

Model-backed profile record used to verify reader status and store writer-upgrade pen name data.

- Table: profiles
- Model links: YvT2lTG9SMxvmrmmzTkGu:Profile, YvT2lTG9SMxvmrmmzTkGu:Profile#created_at, YvT2lTG9SMxvmrmmzTkGu:Profile#deleted_at, YvT2lTG9SMxvmrmmzTkGu:Profile#id, YvT2lTG9SMxvmrmmzTkGu:Profile#pen_name, YvT2lTG9SMxvmrmmzTkGu:Profile#pen_name_bio, YvT2lTG9SMxvmrmmzTkGu:Profile#pen_name_set_at, YvT2lTG9SMxvmrmmzTkGu:Profile#role, YvT2lTG9SMxvmrmmzTkGu:Profile#updated_at
- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:881e24b5984c6f29, doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:f55b2a55c6ec78f9

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| created_at | created_at | Profile creation timestamp field present in the backend model evidence. |
| deleted_at | deleted_at | Profile deletion timestamp field present in the backend model evidence. |
| id | id | Unique profile identifier. In this flow, the profile row is matched to the authenticated user and updated only when the row is still a reader profile. |
| pen_name | pen_name | Writer pen name entered during onboarding. The submitted value is trimmed and must be 2 to 20 characters before the upgrade is allowed. |
| pen_name_bio | pen_name_bio | Optional writer bio stored during onboarding. An empty trimmed bio is stored as null. |
| pen_name_set_at | pen_name_set_at | Timestamp recorded when the writer pen name is set during successful upgrade. |
| role | role | Current account role. The writer-upgrade action only updates a profile when role is 'reader' and writes role 'writer' on success. |
| updated_at | updated_at | Profile update timestamp field present in the backend model evidence. |

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
