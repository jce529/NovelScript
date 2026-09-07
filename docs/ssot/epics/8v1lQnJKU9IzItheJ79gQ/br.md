---
id: "doc:jXsQtbCtD6Df_l1J_fGDH"
name: "Social Sign-In Business Rules"
type: "br"
scope: "epic"
scopeId: "8v1lQnJKU9IzItheJ79gQ"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"social-sign-in-supported-oauth-actions-login-screen","title":"`/login` supports only Google and Kakao OAuth sign-in actions","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:8769f48b92cad45f"],"modelLinks":[]},{"stableKey":"social-sign-in-oauth-redirect-target-login-screen","title":"OAuth sign-in from `/login` redirects back to `/auth/callback` on the current origin","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:8769f48b92cad45f"],"modelLinks":[]},{"stableKey":"social-sign-in-login-screen-no-observed-feedback-states","title":"No feedback states are evidenced on the provided login screen variant","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:8769f48b92cad45f"],"modelLinks":[]}]
relatedDocs: []
serviceMapNodes: []
---
# Social Sign-In Business Rules

Source-grounded business rules for Social Sign-In.

## social-sign-in-supported-oauth-actions-login-screen — `/login` supports only Google and Kakao OAuth sign-in actions

On the provided login screen, users can start sign-in only through Google or Kakao, and both actions use Supabase OAuth.

**Rule:** When a user starts sign-in from `/login`, the screen must offer only the Google and Kakao OAuth actions shown in the source and must start sign-in through `supabase.auth.signInWithOAuth` for the selected provider.

**When/Then:** WHEN the user clicks either sign-in button on `/login`. The selected OAuth provider flow is initiated through Supabase.

**Watch:** No additional providers are proven in this source shard. No loading, empty, or error UI is shown in the provided source.

**Next:** code. screen_spec.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:8769f48b92cad45f

## social-sign-in-oauth-redirect-target-login-screen — OAuth sign-in from `/login` redirects back to `/auth/callback` on the current origin

The login screen passes a redirect target built from `window.location.origin` with the path `/auth/callback` for both supported providers.

**Rule:** When the `/login` screen initiates Supabase OAuth for either supported provider, it must set the redirect target to `/auth/callback` under the current window origin.

**When/Then:** WHEN `handleLogin` calls `supabase.auth.signInWithOAuth` for Google or Kakao. After provider handoff, the configured return path is `/auth/callback` on the current origin.

**Watch:** This source proves the redirect target passed into the browser OAuth call, not successful callback processing. The callback handling implementation belongs to a neighboring epic and is not confirmed here.

**Next:** code. screen_spec.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:8769f48b92cad45f

## social-sign-in-login-screen-no-observed-feedback-states — No feedback states are evidenced on the provided login screen variant

The provided source shows no loading, empty, or error UI for the OAuth sign-in actions on `/login`.

**Rule:** If the provided `/login` screen variant is implemented exactly as shown, the sign-in UI does not present separate loading, empty, or error states in the visible source.

**When/Then:** WHILE the user is using the `/login` screen variant shown in the source. Only the two OAuth sign-in actions are evidenced in the UI.

**Watch:** This is a source-limited observation, not proof that feedback states are forbidden elsewhere. Failure behavior for `signInWithOAuth` is not confirmed in the shard.

**Next:** screen_spec. code.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:8769f48b92cad45f
