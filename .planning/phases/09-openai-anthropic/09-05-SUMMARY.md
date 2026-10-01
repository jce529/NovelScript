---
phase: 09-openai-anthropic
plan: 05
subsystem: ai
status: complete_with_environment_verification_gap
completed: 2026-09-29
requirements: [PROV-04]
---

# Phase 9 Plan 05 Summary

Writers can save an account default provider and model at `/studio/settings/ai-providers`. The chapter action reads the saved pair for the authenticated writer and passes it to the AI panel. The panel selects that pair on load and resets to it after a successful send; a failed send retains the selected model. Accounts without a valid saved pair fall back to Gemini's first catalog model. The settings page uses a single-column card layout so Phase 10 can add BYOK management below it.

## Task order and test evidence

1. **Migration and settings data layer:** Added `provider-settings.test.ts` first and confirmed it failed because the settings module did not exist. Added nullable `profiles.default_provider` and `profiles.default_model` columns and catalog-validated get/set functions. The four settings tests then passed, covering fallback, round-trip storage, cross-provider rejection, and unknown stored providers.
2. **Settings UI and AI panel:** Added a failing panel test for a saved OpenAI default and settings link; it showed the hardcoded Gemini selection. Added the settings form with an authenticated server action, passed the saved default through `getChapterAction`, and changed the panel's initial selection and success reset target. Both panel tests then passed. The account default is only written by the settings form action, not by a per-send override.

## Plan deviation

The plan specified `supabase/migrations/0010_ai_provider_defaults.sql`, but `0010_kb_category_root_unique.sql` already exists. The migration was created as `supabase/migrations/0013_ai_provider_defaults.sql` as requested. The chapter editor is an existing Client Component, so the authenticated chapter server action fetches the default and returns it to that client page rather than having the page fetch it as a Server Component. The SQL file was created locally and was not applied to a remote database.

## Verification

- `npx vitest run tests/ai/provider-settings.test.ts tests/ai/ai-panel-model.test.ts`: 6 passed.
- `npx tsc --noEmit`: passed.
- `npx vitest run tests/ai`: 402 passed, 26 skipped; three DB-backed files (`chat.test.ts`, `mention-context.test.ts`, `mention-search.test.ts`) could not create Supabase test users in this offline environment (`AuthRetryableFetchError: fetch failed`). Their teardown errors follow failed setup. No other AI test failed.
- `git diff --check`: passed.
- No dependency installation, commit, remote DB migration, or ROADMAP.md change was made. Existing unrelated dirty files were preserved.

## Human verification remaining

After applying the migration in a connected environment, save an OpenAI model on the settings page, reload a chapter editor, send once with a different model, and confirm the picker returns to the saved OpenAI model. Live UI and DB verification were not available offline.
