---
id: "doc:l-ZbS2nTBMru7GM5pyIXm"
name: "Account Overview Business Rules"
type: "br"
scope: "epic"
scopeId: "0oF0HLK2dJTtWk5Y-fQCJ"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"account-overview-authenticated-user-redirect","title":"Authenticated User Is Required","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:ad11cb91be5b493f"],"modelLinks":[]},{"stableKey":"account-overview-inactive-profile-signout","title":"Missing Or Inactive Profiles Are Logged Out","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:ad11cb91be5b493f"],"modelLinks":[]},{"stableKey":"account-overview-role-based-profile-display","title":"Account Details Are Role-Specific","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:ad11cb91be5b493f"],"modelLinks":[]},{"stableKey":"account-overview-soft-delete-and-signout","title":"Account Deletion Soft-Deletes The Profile","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:ad11cb91be5b493f"],"modelLinks":[]}]
relatedDocs: []
serviceMapNodes: []
---
# Account Overview Business Rules

Source-grounded business rules for Account Overview.

## account-overview-authenticated-user-redirect — Authenticated User Is Required

The account settings screen redirects to /login when no authenticated user is present.

**Rule:** A missing authenticated user must be redirected to /login.

**When/Then:** If supabase.auth.getUser() returns no user on initial screen load or during deleteAccountAction. The requester is redirected to /login.

**Watch:** This shard does not identify the screen's exact route path.

**Next:** Inspect the connected source spec or code for the exact route and redirect implementation.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:ad11cb91be5b493f

## account-overview-inactive-profile-signout — Missing Or Inactive Profiles Are Logged Out

The screen signs out and redirects when the profile is missing or treated as inactive.

**Rule:** A profile that is missing or not active must be signed out before redirecting to /login.

**When/Then:** If the profile lookup returns no profile, or if isAccountActive(profile) is false. The current Supabase session is signed out and the requester is redirected to /login.

**Watch:** The shard proves that deleted_at other than null makes a profile inactive. The shard does not distinguish every possible cause of a missing profile lookup result.

**Next:** Inspect the connected source spec or code for the exact isAccountActive(profile) logic and sign-out sequencing.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:ad11cb91be5b493f

## account-overview-role-based-profile-display — Account Details Are Role-Specific

The screen always shows email, shows 필명 only for writers, and otherwise shows the writer-start link.

**Rule:** The screen must show 이메일 with user.email, show 필명 with profile.pen_name only for writer profiles, and otherwise show the /write/start link labeled 글쓰기 시작하기.

**When/Then:** While an authenticated user has an active profile and the account settings screen is rendered. Writers see their pen name, and non-writers are directed to /write/start instead of seeing 필명.

**Watch:** This shard confirms rendering for writer versus non-writer profiles only. It does not define broader authorization or entitlement rules for profile roles.

**Next:** Inspect the connected screen spec or code for exact labels and presentation details.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:ad11cb91be5b493f

## account-overview-soft-delete-and-signout — Account Deletion Soft-Deletes The Profile

Submitting account deletion soft-deletes the profile if it is not already deleted, then signs out the session and redirects to /login.

**Rule:** When 계정 탈퇴하기 submits deleteAccountAction for an authenticated user, the system must call softDeleteAccount(admin, user.id), clear pen_name_bio, set deleted_at only if deleted_at is null, sign out the current session, an…

**When/Then:** When the user submits the account deletion form and supabase.auth.getUser() returns a current user. The profile is soft-deleted if it was not already deleted, and the user is logged out to /login.

**Watch:** The shard proves profiles is updated by setting pen_name_bio to null and deleted_at to a new ISO timestamp where deleted_at is null. The shard does not confirm any additional downstream side effects beyond the shown pro…

**Next:** Inspect the connected source spec or code for the exact server action, admin client usage, and persistence details.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:ad11cb91be5b493f
