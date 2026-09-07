---
id: "doc:WOiRk5BM8mEg6rsdVkvAV"
name: "Work Workspace Data Dictionary"
type: "data_dictionary"
scope: "epic"
scopeId: "_Pnwofz1Iq27Y-rvAkG7q"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"entity:work","title":"Work","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:b1016d8fb207d897"],"modelLinks":["YvT2lTG9SMxvmrmmzTkGu:Work","YvT2lTG9SMxvmrmmzTkGu:Work#cover_image_url","YvT2lTG9SMxvmrmmzTkGu:Work#created_at","YvT2lTG9SMxvmrmmzTkGu:Work#deleted_at","YvT2lTG9SMxvmrmmzTkGu:Work#genre","YvT2lTG9SMxvmrmmzTkGu:Work#id"],"modelLinksOmitted":4,"table_name":"works","column_names":"cover_image_url, created_at, deleted_at, genre, id, owner_id, synopsis, title, updated_at"}]
relatedDocs: []
serviceMapNodes: []
---
# Work Workspace Data Dictionary

Data dictionary for the Work entity used by the Work Workspace landing page, with model-backed storage details and observed screen usage.

## Evidence Gaps

- The provided screen evidence confirms reading a work record and showing title and synopsis, but it does not confirm how cover_image_url, genre, created_at, updated_at, or deleted_at are used on this epic screen.
- The provided context names several related entities through model relations, but it does not include model-backed definitions for Profile, Chapter, KbNode, ReadingProgres, Report, WorkBookmark, WorkLike, or WorkSubscription in this task.
- The provided context shows a chapter-list navigation path from the workspace, but it does not prove how chapter records are loaded or constrained within this epic beyond the Work-to-Chapter relation label.

## Entities

| Entity | Table | Summary | Detail |
| --- | --- | --- | --- |
| Work | works | Model-backed work record scoped to the current user and loaded for the Work Workspace landing page. | data_dictionary/entity-work.md |

## Retrieval Note

이 문서는 데이터 딕셔너리의 엔티티 목록과 라우팅 색인입니다.
특정 엔티티의 필드, 관계, 모델 링크, 근거 문서가 필요하면 `data_dictionary/<entity>.md` 하위 문서를 읽으세요.
