---
id: "doc:kw8aOEYQN9s3dkJWS_urF"
name: "Writer Upgrade System Design"
type: "design"
scope: "epic"
scopeId: "TPGBVklZxbIBligTLR7ZA"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
itemCount: 7
relatedDocs: []
serviceMapNodes: []
---
# Writer Upgrade System Design

Routing map for the reader-to-writer upgrade flow centered on the Write Start screen and the submitWriterUpgrade action.

## Primary Flows

### Write Start entry screen

flowKey: writer-upgrade-write-start-screen

User-facing writer onboarding entry point with authentication gate, form rendering, error display, and handoff to the upgrade action.

```mermaid
sequenceDiagram
  participant User
  participant System
  User->>System: Create the Supabase client during screen execution.
  User->>System: Read the current user from Supabase auth.
  User->>System: Redirect to `/login` when no user is returned.
  User->>System: Await `searchParams` and read any `error` value.
  User->>System: Render the writer-upgrade form with required `penName` and optional `bio`.
  User->>System: Submit the form to `submitWriterUpgrade`.
  User->>System: After action completion, rely on redirects to either `/write/start?error=...` or `/account`.
```

### submitWriterUpgrade action

flowKey: writer-upgrade-submit-action

Authenticated form action that normalizes input, checks the user, and dispatches the writer upgrade mutation.

```mermaid
sequenceDiagram
  participant User
  participant System
  User->>System: Create the Supabase client in the action.
  User->>System: Read the current user with `supabase.auth.getUser()`.
  User->>System: Redirect to `/login` when no authenticated user is present.
  User->>System: Read `penName` and `bio` from `FormData` with string coercion.
  User->>System: Call `upgradeToWriter(supabase, { userId: user.id, penName, bio })`.
  User->>System: On validation or database failure, redirect back to `/write/start?error=...`.
  User->>System: On success, redirect to `/account`.
```

### Writer profile mutation rules

flowKey: writer-upgrade-profile-mutation-rules

Observed business and persistence rules for turning a reader profile into a writer profile.

```mermaid
sequenceDiagram
  participant User
  participant System
  User->>System: Trim `penName` before validation.
  User->>System: Reject when trimmed `penName` length is less than 2 or greater than 20.
  User->>System: Persist empty trimmed `bio` as `null` in `pen_name_bio`.
  User->>System: Constrain the `profiles` mutation to `id = user.id` and `role = 'reader'`.
  User->>System: Map duplicate-key code `23505` to the fixed Korean conflict message.
  User->>System: Treat a zero-row match as an already-upgraded account condition rather than a newly created writer state.
```

## Routing Hints

- Write Start entry screen: The Write Start screen is the user-facing entry point for writer onboarding. It checks the current Supabase user, redirects unauthenticated visitors to `/login`, renders the form, and shows any error returned through the query string before submission to the upgrade action.; next: submitWriterUpgrade action, Account Overview epic; flowKey: writer-upgrade-write-start-screen; resolve: `sot resolve --item doc:kw8aOEYQN9s3dkJWS_urF#writer-upgrade-write-start-screen`; sourceRefs: source_document_2
- submitWriterUpgrade action: The form action behind `POST /write/start` reads `penName` and `bio` from `FormData`, gets the current Supabase user, redirects unauthenticated requests to `/login`, and calls `upgradeToWriter(supabase, { userId, penName, bio })` to perform the account-role transition.; next: profiles table update, Account Overview epic; flowKey: writer-upgrade-submit-action; resolve: `sot resolve --item doc:kw8aOEYQN9s3dkJWS_urF#writer-upgrade-submit-action`; sourceRefs: source_document_1
- Writer profile mutation rules: The upgrade logic is implemented as a constrained `profiles` update for the signed-in user. It trims `penName`, requires a 2 to 20 character length, stores `pen_name_bio` as `null` when the trimmed bio is empty, maps duplicate-key error `23505` to a fixed Korean pen-name conflict message, and treats no matched row as an already-upgraded account.; next: profiles table, Source spec for `upgradeToWriter`; flowKey: writer-upgrade-profile-mutation-rules; resolve: `sot resolve --item doc:kw8aOEYQN9s3dkJWS_urF#writer-upgrade-profile-mutation-rules`; sourceRefs: source_document_1, source_document_2

## Evidence Gaps

- The provided sources do not confirm how `wallets` data is used on the Write Start screen, even though a `tables:select wallets` relation is listed.
- The provided sources do not show the exact success payload or persisted record returned by `upgradeToWriter`; they only confirm redirect outcomes at the screen and action level.
- The provided sources do not confirm any requester authorization beyond checking the signed-in user and constraining the `profiles` update to `id = user.id` and `role = 'reader'`.

## Graph Lookup

- Related APIs, screens, tables, and relation traces are not dumped in this Markdown file.
- Use `sot resolve --document doc:kw8aOEYQN9s3dkJWS_urF` for linked specs and graph seeds.
- Use `sot resolve --epic TPGBVklZxbIBligTLR7ZA` or catalog `traceId` values with `graph trace` for relation/source paths.
