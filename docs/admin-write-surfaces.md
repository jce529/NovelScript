# Write surfaces and suspension enforcement (ADMIN-03)

Runbook for plan 07-03. It lists every user-initiated mutation, where suspension (D-07) is enforced, and which test proves the refusal. Update this file whenever a new write path is added.

## Model

- **Source of truth:** `user_sanctions` history. `profiles.sanction_kind` / `sanctioned_until` are a cache that only `apply_user_sanction` writes (0006).
- **Decision:** `user_can_write(user)` in `0008_sanction_enforcement.sql`. The user may write when the profile is not deleted and either `sanction_kind = 'none'` or it is a timed `suspension` with `sanctioned_until <= now()`. The expiry is evaluated at DB time, so an expiry equal to `now()` counts as expired and no cron or cleanup job is needed. `permanent_suspension` is its own kind.
- **Layer 1, database (authoritative):**
  - RESTRICTIVE `INSERT` / `UPDATE` / `DELETE` policies (`<table>_write_access_*`) call `current_user_can_write()`.
  - Restrictive policies are AND-ed with every permissive policy, so the older `FOR ALL` owner policies (`works_owner_all`, `chapters_owner_all`, `kb_nodes_owner_all`, `work_likes_owner_write`, `reading_progress_owner_all`, `work_subscriptions_owner_all`, `work_bookmarks_owner_all`) cannot OR around them.
  - `SELECT` is untouched.
  - SECURITY DEFINER write RPCs check `user_can_write` explicitly.
- **Layer 2, server:** `lib/auth/write-access.ts`.
  - `checkWriteAccess(client, userId)` calls `get_write_access(p_user_id)`.
  - A session client can only ask about `auth.uid()`; any other ID returns `forbidden`. The service role asks about the user ID the Server Action took from the session.
  - Every error, exception or malformed payload denies the write (`write_unavailable`), so writes fail closed.
  - Denials return `{ ok: false, error, code }` with a fixed Korean message and never include DB details.
- **Unchanged:** `isAccountActive` still models soft deletion only. Suspension never logs a user out and never blocks reads.

## Mutation inventory

"Wrapper" is the `'use server'` entry point. "Domain" is the checked function it routes through. Test IDs:
- **U:** `tests/admin/sanctions.test.ts`
- **D:** `tests/admin/sanctions.database.test.ts`

| Mutation | Wrapper | Domain (server guard) | DB enforcement | Negative tests |
|---|---|---|---|---|
| Work create | `app/studio/works/new/actions.ts` `submitCreateWork` | `lib/works/actions.ts` `createWork` (before `create_work` RPC and template seeding) | `works`/`kb_nodes` restrictive INSERT (`create_work` is SECURITY INVOKER) | U "work create"; D "work insert", "create_work rpc" |
| Chapter create | `app/studio/[workId]/chapters/new/actions.ts` | `lib/chapters/actions.ts` `createChapter` | `chapters` INSERT | U "chapter create"; D "chapter insert" |
| Chapter save | `app/studio/[workId]/chapters/[chapterId]/actions.ts` `saveChapterContentAction` | `saveChapterContent` | `chapters` UPDATE | U "chapter save"; D "chapter save" |
| Chapter publish | same file, `publishChapterAction` | `publishChapter` | `chapters` UPDATE | U / D "chapter publish" |
| Chapter unpublish | same file, `unpublishChapterAction` | `unpublishChapter` | `chapters` UPDATE | U / D "chapter unpublish" |
| Chapter reorder | `app/studio/[workId]/chapters/actions.ts` | `reorderChapters` (before `reorder_chapters`) | `chapters` UPDATE (`reorder_chapters` is INVOKER) | U / D "chapter reorder" |
| KB file create | `app/studio/[workId]/kb/[nodeId]/actions.ts` `createNodeAction` | `lib/kb/actions.ts` `createNode` | `kb_nodes` INSERT | U "kb create file"; D "kb file insert" |
| KB folder create | same file, `createFolderAction` | `createFolder` | `kb_nodes` INSERT | U "kb create folder"; D "kb folder insert" |
| KB rename | same file, `renameNodeAction` | `renameNode` | `kb_nodes` UPDATE | U / D "kb rename" |
| KB delete | same file, `deleteNodeAction` | `deleteNode` | `soft_delete_kb_node` (DEFINER) raises `write_access_denied`, and also rejects cross-owner and anonymous callers | U "kb delete"; D "kb delete rpc", "scopes the write-access RPCs" |
| KB save | same file `saveNodeContentAction`; chapter editor `saveDocumentProposalAction` | `saveNodeContent` | `kb_nodes` UPDATE | U / D "kb save" |
| Mention quick-add / AI proposal save | chapter editor `quickAddMentionAction`, `saveDocumentProposalAction` | `lib/ai/mentions.ts` `quickAddMentionNode` → `createNode` (checked) | `kb_nodes` INSERT | covered through `createNode` (U "kb create file") |
| Account template seed | `app/studio/layout.tsx` (render-time) | `checkWriteAccess` before `ensure_account_template_root` + `seedTemplateFiles`. **Skipped, not failed**, so a suspended writer can still open the studio | `kb_nodes` INSERT | D "account template root" |
| Writer upgrade | `app/write/start/actions.ts` | `lib/auth/writer.ts` `upgradeToWriter` | `profiles` UPDATE | U / D "writer upgrade" |
| Report | `app/works/[workId]/actions.ts` and chapter viewer `submitReportAction` | `lib/reader/reports.ts` `submitReport` | `reports` INSERT | U / D "report" |
| Like / bookmark / subscription toggle | `app/works/[workId]/actions.ts` toggles (return `ok: false` + unchanged state on denial) | `toggleLike` / `toggleBookmark` / `toggleSubscription`: the check runs **before both** the insert and delete branch | restrictive INSERT **and** DELETE on `work_likes`, `work_bookmarks`, `work_subscriptions` | U "reader toggles cannot bypass suspension by un-toggling"; D "like", "bookmark", "subscription", un-toggle delete in "keeps entitled…" |
| Reading progress | chapter viewer `trackChapterOpenAction` | `lib/reader/progress.ts` `upsertReadingProgress`: **no-op** when denied or the lookup fails | `reading_progress` INSERT/UPDATE | U "progress upsert no-ops"; D "progress upsert" |
| View count | chapter viewer `trackChapterOpenAction` | `lib/reader/views.ts` `incrementChapterView({ userId })`: **no-op** for a suspended signed-in reader; anonymous opens still count | `increment_chapter_view` (DEFINER) returns silently for a suspended/deleted session | U "view increment no-ops"; D view count in "keeps entitled…" |
| Purchase order create | chapter viewer `purchaseChapterAction` | `lib/commerce/actions.ts` `createPurchaseOrder(…, { userId })` pre-check | `create_purchase_order` raises `write_access_denied` while holding the profile share lock | U "purchase order"; D "purchase order" |
| Purchase payment | same | `payPurchaseOrder(…, { userId })` pre-check; DB refusal mapped to the same message | `pay_purchase_order` raises before any wallet debit | U "purchase payment", "maps the database-side purchase refusal"; D "denies payment of an order created before suspension" |
| AI generation (chat) | chapter editor `chatAction` | `lib/ai/chat.ts` `chat`: check with the session client **before** the wallet read, `countTokens` and `generateContent`; re-check with the service role **before** `apply_wallet_delta` | wallet debit is service-role only; guarded in the server | U "AI generation checks write access…" |
| Re-review request (07-06) | not yet built | 07-06 must call `checkWriteAccess` in its action | `moderation_review_requests` restrictive INSERT/UPDATE/DELETE | D "declares restrictive policies…" |

### Service-role writes (bypass RLS, reviewed)

| Write | Why it is not user-blocked |
|---|---|
| `softDeleteAccount` (`app/account/actions.ts`) | Account-control exception. It only sets `profiles.deleted_at` / `pen_name_bio` and never touches `user_sanctions`, `wallets`, `ledger_entries` or `entitlements` (D "keeps self-deletion available…") |
| AI wallet debit in `chat` | Guarded by the re-check immediately before the debit |
| Admin moderation RPCs (0007, `lib/admin/*`) | Operator actions, authorized by `withAdminAction`, not user writes |
| `apply_user_sanction` → `refresh_sanction_cache` | The single cache writer (D-06) |

No other `createAdminClient()` write exists outside `lib/admin` / `app/admin`. Recheck with `grep -rn "createAdminClient" app lib`.

## Account-control exceptions (never guarded)

- Login, logout (`lib/auth/actions.ts` `signOutAction`) and email completion. These are auth schema operations, not app tables.
- `acknowledge_warning(sanction_id)`: only the recipient can call it, it is idempotent, and it writes only `warning_acknowledgements` (D-09). D "lets a suspended recipient acknowledge a warning…"
- Account self-deletion (see above).

## AI generation racing a suspension

1. Session check fails: return the denial. No wallet read, no provider call, no charge.
2. The suspension commits while the provider call is in flight: the service-role re-check before the debit fails. The completed text is **discarded** and not returned, and `apply_wallet_delta` is never called, so denied output is never charged.
3. The suspension commits after the re-check: the generation is treated like any write that finished just before the sanction. It is charged once and returned. No other persistence happens in `chat`. Saving a draft or proposal afterwards is a separate checked write.

## Reads that must keep working while suspended

All of these are verified in D "keeps entitled, free and wallet reads…" and "never hides a suspended author's published works":
- Free chapters and entitled paid chapters (`read_chapter_content`, `can_view`, `list_chapter_access`)
- Own wallet balance, ledger, orders and entitlements
- Own likes and other SELECTs
- A suspended author's own drafts/KB in the studio
- Published works of a suspended author, for everyone (D-10)

Reading bookkeeping (progress, view count) is skipped silently and never throws into the viewer.

## Verification

```bash
npx vitest run tests/admin/sanctions.test.ts tests/commerce/actions.test.ts --passWithNoTests=false
SUPABASE_DB_URL=... npx vitest run tests/admin/sanctions.database.test.ts --passWithNoTests=false
```

The DB suite skips without `SUPABASE_DB_URL`. A skip is **unverified** and must be cleared by 07-07 against a real Supabase target.
