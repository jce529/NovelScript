---
id: "item:F2Lx1QICuHOLCv0Sc2crg"
name: "Work"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "DwVdypyCp2wh37VaxYHTU"
parentDocumentId: "doc:KYT3fh2YL-FePA2rTk-8n"
stableKey: "work"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:b105058b84a85955"]
modelLinks: ["YvT2lTG9SMxvmrmmzTkGu:Work","YvT2lTG9SMxvmrmmzTkGu:Work#cover_image_url","YvT2lTG9SMxvmrmmzTkGu:Work#created_at","YvT2lTG9SMxvmrmmzTkGu:Work#deleted_at","YvT2lTG9SMxvmrmmzTkGu:Work#genre","YvT2lTG9SMxvmrmmzTkGu:Work#id"]
modelLinksOmitted: 4
table_name: "works"
column_names: "cover_image_url, created_at, deleted_at, genre, id, owner_id, synopsis, title, updated_at"
---
# Work

Stores the parent work that supplies the title, summary, cover image, and chapter grouping for the reading experience.

- Table: works
- Model links: YvT2lTG9SMxvmrmmzTkGu:Work, YvT2lTG9SMxvmrmmzTkGu:Work#cover_image_url, YvT2lTG9SMxvmrmmzTkGu:Work#created_at, YvT2lTG9SMxvmrmmzTkGu:Work#deleted_at, YvT2lTG9SMxvmrmmzTkGu:Work#genre, YvT2lTG9SMxvmrmmzTkGu:Work#id, YvT2lTG9SMxvmrmmzTkGu:Work#owner_id, YvT2lTG9SMxvmrmmzTkGu:Work#synopsis, YvT2lTG9SMxvmrmmzTkGu:Work#title, YvT2lTG9SMxvmrmmzTkGu:Work#updated_at
- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:b105058b84a85955

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| cover_image_url | cover_image_url | Image location used for the work cover. |
| created_at | created_at | When the work record was created. |
| deleted_at | deleted_at | When the work record was soft-deleted, if applicable. |
| genre | genre | Genre label assigned to the work. |
| id | id | Unique identifier for the work. |
| owner_id | owner_id | Identifier of the profile that owns the work. |
| synopsis | synopsis | Summary text describing the work. |
| title | title | Public title shown for the work. |
| updated_at | updated_at | When the work record was last updated. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| chapters | Chapter | oneToMany | primary | A work can have many chapters, which aligns with the chapter reading and table-of-contents flow. |  |  |
| kbNodes | KbNode | oneToMany | out_of_scope | A work can be linked to many knowledge-base nodes, but this chunk does not confirm how that relation is used in the reading experience. |  |  |
| owner_id | Profile | manyToOne | reference | Each work belongs to one owner profile. | owner_id | id |
| readingProgreses | ReadingProgres | oneToMany | reference | A work can be linked to many reading progress records that support tracking reader progress. |  |  |
| reports | Report | oneToMany | reference | A work can be linked to many reports, which is consistent with the report action available from the reading screen. |  |  |
| workBookmarks | WorkBookmark | oneToMany | out_of_scope | A work can be linked to many bookmark records, but their use is not confirmed by this chunk. |  |  |
| workLikes | WorkLike | oneToMany | out_of_scope | A work can be linked to many like records, but their use is not confirmed by this chunk. |  |  |
| workSubscriptions | WorkSubscription | oneToMany | out_of_scope | A work can be linked to many subscription records, but their use is not confirmed by this chunk. |  |  |

_Parent data dictionary: ../data_dictionary.md_
