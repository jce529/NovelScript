---
id: "doc:Uu-BNPQMB1c1g6dNfzd5G"
name: "Login Error Recovery Business Rules"
type: "br"
scope: "epic"
scopeId: "4m8kG11em9A1CUTWJcWoz"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"br-login-error-screen-static-message","title":"Failed-login screen shows a static recovery message","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:5bc68d3024c8a70a"],"modelLinks":[]},{"stableKey":"br-login-error-screen-return-link","title":"Return link sends the user back to '/login'","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:5bc68d3024c8a70a"],"modelLinks":[]}]
relatedDocs: []
serviceMapNodes: []
---
# Login Error Recovery Business Rules

Source-grounded business rules for Login Error Recovery.

## br-login-error-screen-static-message — Failed-login screen shows a static recovery message

The error screen displays a centered failure message and retry prompt without dynamic content or additional interaction states.

**Rule:** The failed-login error screen must render static recovery copy in a centered layout and must not introduce form, tab, list, or modal interactions on this variant.

**When/Then:** If the user is on the failed-login error screen. The user sees a static failure message and retry prompt with no interactive options beyond the return link.

**Watch:** This screen source shows no form fields, tabs, lists, or modal states. The source does not confirm any dynamic values or contextual error details.

**Next:** screen_spec. code.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:5bc68d3024c8a70a

## br-login-error-screen-return-link — Return link sends the user back to '/login'

The only visible user action on this screen is a link that returns the user to the login page.

**Rule:** The failed-login error screen must provide navigation back to '/login' through the visible '로그인 페이지로 돌아가기' link, and no other user action is confirmed in this variant.

**When/Then:** When the user clicks '로그인 페이지로 돌아가기' on the failed-login error screen. The user is navigated to '/login'.

**Watch:** This source card proves only one visible user action on the screen. The source does not confirm any confirmation step, intermediate handler, or alternate destination.

**Next:** screen_spec. code.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:5bc68d3024c8a70a
