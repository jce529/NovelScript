# Phase 08 Deferred Items

- **08-09: `npm run build` fails at static prerender of `/admin`** with `Error: admin_authorization_unavailable` (lib/admin/auth.ts:105 via app/admin/layout.tsx:9). Compile and TypeScript steps succeed. Files last touched in 07-01/07-05; not caused by phase 8. The admin layout needs to opt out of static prerender (e.g. dynamic rendering) or handle unavailable auth at build time.
- Pre-existing eslint errors: react-hooks/set-state-in-effect in MentionAutocomplete.tsx and QuickAddDialog.tsx (not phase 8).
- Pre-existing test failure: tests/auth/writer-upgrade.test.ts "rejects a second conversion attempt" (not phase 8).
