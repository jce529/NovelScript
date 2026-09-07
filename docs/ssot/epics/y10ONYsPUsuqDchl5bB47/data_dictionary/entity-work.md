---
id: "item:ffEj_FMIxoTDxaPb-r6on"
name: "Work"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "y10ONYsPUsuqDchl5bB47"
parentDocumentId: "doc:i8nz5cyThMV-9swf3Coac"
stableKey: "entity-work"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:406184af4ba83897"]
modelLinks: ["YvT2lTG9SMxvmrmmzTkGu:Work","YvT2lTG9SMxvmrmmzTkGu:Work#cover_image_url","YvT2lTG9SMxvmrmmzTkGu:Work#created_at","YvT2lTG9SMxvmrmmzTkGu:Work#deleted_at","YvT2lTG9SMxvmrmmzTkGu:Work#genre","YvT2lTG9SMxvmrmmzTkGu:Work#id"]
modelLinksOmitted: 4
table_name: "works"
column_names: "cover_image_url, created_at, deleted_at, genre, id, owner_id, synopsis, title, updated_at"
---
# Work

Core discoverable content item presented on the home experience.

- Table: works
- Model links: YvT2lTG9SMxvmrmmzTkGu:Work, YvT2lTG9SMxvmrmmzTkGu:Work#cover_image_url, YvT2lTG9SMxvmrmmzTkGu:Work#created_at, YvT2lTG9SMxvmrmmzTkGu:Work#deleted_at, YvT2lTG9SMxvmrmmzTkGu:Work#genre, YvT2lTG9SMxvmrmmzTkGu:Work#id, YvT2lTG9SMxvmrmmzTkGu:Work#owner_id, YvT2lTG9SMxvmrmmzTkGu:Work#synopsis, YvT2lTG9SMxvmrmmzTkGu:Work#title, YvT2lTG9SMxvmrmmzTkGu:Work#updated_at
- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:406184af4ba83897

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| cover_image_url | cover_image_url | Optional image location used to display the work cover. |
| created_at | created_at | Time when the work record was created. |
| deleted_at | deleted_at | Optional time marking when the work was deleted or soft-deleted. |
| genre | genre | Optional genre value used for discovery filtering and presentation. |
| id | id | Unique identifier for the work. |
| owner_id | owner_id | Identifier of the profile that owns the work. |
| synopsis | synopsis | Optional summary text shown for the work. |
| title | title | Reader-facing title of the work. |
| updated_at | updated_at | Time when the work record was last updated. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| chapters | Chapter | oneToMany | out_of_scope | A work can have multiple chapter records. |  |  |
| kbNodes | KbNode | oneToMany | out_of_scope | A work can be linked to multiple knowledge records. |  |  |
| owner_id | Profile | manyToOne |  |  | owner_id | id |
| readingProgreses | ReadingProgres | oneToMany | reference | A work can have multiple reader progress records. |  |  |
| reports | Report | oneToMany | out_of_scope | A work can have multiple report records. |  |  |
| workBookmarks | WorkBookmark | oneToMany | out_of_scope | A work can have multiple bookmark records. |  |  |
| workLikes | WorkLike | oneToMany | reference | A work can have multiple like records from readers. |  |  |
| workSubscriptions | WorkSubscription | oneToMany | out_of_scope | A work can have multiple subscription records. |  |  |

_Parent data dictionary: ../data_dictionary.md_
