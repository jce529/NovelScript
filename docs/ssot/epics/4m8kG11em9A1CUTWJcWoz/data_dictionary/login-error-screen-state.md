---
id: "item:H6Q7eiRh4A-TM-Lfvls_M"
name: "Login Error Screen State"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "4m8kG11em9A1CUTWJcWoz"
parentDocumentId: "doc:ESz_vWr2WC5viYWb2oFcW"
stableKey: "login-error-screen-state"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:5bc68d3024c8a70a"]
modelLinks: []
table_name: null
column_names: ""
---
# Login Error Screen State

Static UI state for the failed login screen.

- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:5bc68d3024c8a70a

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| failure_message |  | Static text that tells the user the login attempt failed. |
| retry_prompt |  | Static text that prompts the user to try the sign-in flow again. |
| return_to_login_link_label |  | Visible link text that sends the user back to the sign-in flow. |
| return_to_login_link_target |  | Destination opened when the user chooses the return link. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| returns_user_to | Login Page Destination | navigates_to | primary | This screen offers a single path back into the sign-in flow. |  | /login |

_Parent data dictionary: ../data_dictionary.md_
