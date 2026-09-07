---
id: "doc:p57AR8CKjIH2OyzwlkrUM"
name: "Account Closure Data Dictionary"
type: "data_dictionary"
scope: "epic"
scopeId: "HoBO4rJLao81zsp1RnCM7"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"entity:Profile","title":"Profile","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:c6012ec2744d8fcf"],"modelLinks":["YvT2lTG9SMxvmrmmzTkGu:Profile","YvT2lTG9SMxvmrmmzTkGu:Profile#created_at","YvT2lTG9SMxvmrmmzTkGu:Profile#deleted_at","YvT2lTG9SMxvmrmmzTkGu:Profile#id","YvT2lTG9SMxvmrmmzTkGu:Profile#pen_name","YvT2lTG9SMxvmrmmzTkGu:Profile#pen_name_bio"],"modelLinksOmitted":3,"table_name":"profiles","column_names":"created_at, deleted_at, id, pen_name, pen_name_bio, pen_name_set_at, role, updated_at"}]
relatedDocs: []
serviceMapNodes: []
---
# Account Closure Data Dictionary

Data dictionary for the model-backed profile data touched by the Account Closure epic.

## Evidence Gaps

- The provided evidence confirms updates to `profiles` during account closure, but it does not confirm backend model details for the authentication user record or session storage that are also affected by sign-out and redirect.
- The provided evidence does not confirm whether related profile-linked records such as `KbNode`, `ReadingProgres`, `Report`, `Wallet`, `WorkBookmark`, `WorkLike`, `WorkSubscription`, or `Work` are changed as part of account closure.

## Entities

| Entity | Table | Summary | Detail |
| --- | --- | --- | --- |
| Profile | profiles | Represents the user profile row that account closure soft-deletes by clearing profile biography text and setting a deletion timestamp. | data_dictionary/entity-profile.md |

## Retrieval Note

이 문서는 데이터 딕셔너리의 엔티티 목록과 라우팅 색인입니다.
특정 엔티티의 필드, 관계, 모델 링크, 근거 문서가 필요하면 `data_dictionary/<entity>.md` 하위 문서를 읽으세요.
