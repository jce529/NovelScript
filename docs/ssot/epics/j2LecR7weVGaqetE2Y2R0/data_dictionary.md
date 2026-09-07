---
id: "doc:Q_zpcYVl_qHiPdFOclN-Y"
name: "Identity Completion Data Dictionary"
type: "data_dictionary"
scope: "epic"
scopeId: "j2LecR7weVGaqetE2Y2R0"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"identity-completion-email-submission","title":"Email submission","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:b1691adca3c4cb20","doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:c05b800246f420f4"],"modelLinks":[]},{"stableKey":"identity-completion-account-email","title":"Account email","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:b1691adca3c4cb20","doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:c05b800246f420f4"],"modelLinks":[]}]
relatedDocs: []
serviceMapNodes: []
---
# Identity Completion Data Dictionary

Data dictionary draft for the Identity Completion epic, covering the observed email submission payload and the external account email value updated during completion.

## Evidence Gaps

- No backend model_evidence is provided, so no project-owned database model or table can be confirmed for this epic.
- The internal storage structure behind the Supabase account email update is not shown in the provided context, so only an external account value can be documented.
- No explicit relationship cardinality or persistence contract is shown between the submitted email value and the updated account email value.

## Entities

| Entity | Table | Summary | Detail |
| --- | --- | --- | --- |
| Email submission |  | A submitted email value used to complete missing identity details before the user continues to their account. | data_dictionary/identity-completion-email-submission.md |
| Account email |  | The signed-in user's account email value that is updated in the external authentication system after successful validation. | data_dictionary/identity-completion-account-email.md |

## Retrieval Note

이 문서는 데이터 딕셔너리의 엔티티 목록과 라우팅 색인입니다.
특정 엔티티의 필드, 관계, 모델 링크, 근거 문서가 필요하면 `data_dictionary/<entity>.md` 하위 문서를 읽으세요.
