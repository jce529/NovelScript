---
id: "doc:eGMhyC0aqVV8t7Ap1Aj75"
name: "Account Closure Business Rules"
type: "br"
scope: "epic"
scopeId: "HoBO4rJLao81zsp1RnCM7"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"account-closure-authenticated-user-required","title":"Authenticated user required for account closure","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:c6012ec2744d8fcf"],"modelLinks":[]},{"stableKey":"account-closure-soft-delete-active-profile-only","title":"Profile soft-delete only updates active rows","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:c6012ec2744d8fcf"],"modelLinks":[]},{"stableKey":"account-closure-sign-out-and-redirect","title":"Successful closure signs out the user","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:c6012ec2744d8fcf"],"modelLinks":[]}]
relatedDocs: []
serviceMapNodes: []
---
# Account Closure Business Rules

Source-grounded business rules for Account Closure.

## account-closure-authenticated-user-required — Authenticated user required for account closure

The account closure action only performs deletion work for a current authenticated user.

**Rule:** WHEN POST /account action invokes deleteAccountAction, the handler must read the current user with supabase.auth.getUser() before starting deletion work.

**When/Then:** No current user is returned by supabase.auth.getUser(). The handler redirects to /login and does not proceed to softDeleteAccount.

**Watch:** The shard proves an authentication guard for the current user check, but it does not describe any broader requester authorization model.

**Next:** Go to api_spec for the POST /account action contract and redirect behavior. Go to code for the deleteAccountAction guard and redirect path in source_document_1.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:c6012ec2744d8fcf

## account-closure-soft-delete-active-profile-only — Profile soft-delete only updates active rows

The closure flow soft-deletes the user's profile only when the profile is not already marked deleted.

**Rule:** WHEN deleteAccountAction closes an authenticated user's account, softDeleteAccount must update profiles where id = userId and deleted_at is null.

**When/Then:** A matching profiles row exists for the user and its deleted_at value is null. The handler clears pen_name_bio and sets deleted_at to a new ISO timestamp, and already-deleted rows are not updated again.

**Watch:** The shard proves a soft-delete of the profile row, not hard deletion of profile data or deletion of the auth account.

**Next:** Go to code for the exact profiles update predicate and written fields in source_document_1. Go to data_dictionary for the profiles field definitions if downstream consumers need column semantics.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:c6012ec2744d8fcf

## account-closure-sign-out-and-redirect — Successful closure signs out the user

A successful closure path ends the current session and sends the user to the login page.

**Rule:** WHEN the profile soft-delete completes successfully during account closure, the handler must end the current session.

**When/Then:** softDeleteAccount completes without throwing an error. The handler calls supabase.auth.signOut() and redirects the user to /login.

**Watch:** The shard does not confirm whether sign-out or redirect still occurs if the profile update fails.

**Next:** Go to api_spec for the observable completion behavior of the POST /account action. Go to code for the ordering of softDeleteAccount, supabase.auth.signOut(), and redirect('/login') in source_document_1.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:c6012ec2744d8fcf
