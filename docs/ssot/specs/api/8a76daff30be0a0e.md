---
id: "doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:d21928355a0ae298"
name: "GET /auth/callback"
type: "api_spec"
scope: "route"
scopeId: "YvT2lTG9SMxvmrmmzTkGu:nextjs:api:GET:/auth/callback:YvT2lTG9SMxvmrmmzTkGu:app/auth/callback/route.ts:GET"
validity: "fresh"
status: "passed"
sourceCommit: "190fc89c8fe6c6a38d95e54f07ab60538960ae30"
items: []
relatedDocs: []
serviceMapNodes: ["YvT2lTG9SMxvmrmmzTkGu:nextjs:api:GET:/auth/callback:YvT2lTG9SMxvmrmmzTkGu:app/auth/callback/route.ts:GET"]
---
# GET /auth/callback

GET callback handler that reads `code` and optional `next` from the request URL, exchanges the auth code for a Supabase session, and redirects either to `/auth/complete-email`, to the `next` path, or to `/auth/auth-code-error` when the exchange fails or no code is present.

## Source files

- app/auth/callback/route.ts
  - GET kind=function depth=0 line=5
  - supabase kind=variable depth=1 line=11
- lib/auth/email-guard.ts
  - needsEmailCompletion kind=function depth=1 line=7
- lib/supabase/server.ts
  - createClient kind=function depth=1 line=4
  - createClient.callback@11 kind=function depth=2 line=11
  - createClient.callback@12 kind=function depth=2 line=12
  - createClient.callback@12.callback@14 kind=function depth=3 line=14
