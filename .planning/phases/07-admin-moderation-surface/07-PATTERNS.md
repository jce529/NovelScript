# Phase 7 - Existing Patterns

Inspected 2026-09-16. These are source analogs, not implementations of moderation.

| Planned surface | Closest source | Reuse and constraint |
| --- | --- | --- |
| lib/admin authorization and commands | lib/supabase/admin.ts; app/account/actions.ts | server-only client, session identity before privileged access |
| Domain input/result types | lib/reader/reports.ts; lib/commerce/actions.ts | Zod, camelCase inputs, snake_case RPC args, safe `{ok,error}` |
| Atomic admin operations | supabase/migrations/0005_commerce.sql | SQL transaction, row locking, idempotent request identity, explicit grants |
| Write guards | lib/auth/account.ts; lib/auth/writer.ts | Keep deletion, writer identity and suspension separate |
| Protected reader body | lib/access/actions.ts; lib/chapters/actions.ts | Existing RPC boundary, explicit column privileges |
| Reader/writer UI | components/reader/viewer-shell.tsx; app/studio/[workId]/chapters/[chapterId]/page.tsx | Extend existing data paths; preserve editor correction access |
| Admin forms | components/ui/dialog.tsx; components/ui/select.tsx; components/ui/textarea.tsx | Base UI-backed installed components, controlled pending/error states |
| Unit tests | tests/commerce/actions.test.ts | Inject SupabaseClient; assert exact RPC arguments and safe errors |
| SQL tests | tests/commerce/database.test.ts | Isolated schema/rollback and real roles; add separate connections for races |

Concrete existing excerpts:

```ts
// lib/access/actions.ts
const { data, error } = await supabase.rpc('can_view', {
  p_work_id: workId, p_chapter_id: chapterId ?? null,
});
```

```ts
// lib/auth/account.ts: do not turn this into a suspension gate for reads.
export function isAccountActive(profile: ProfileActiveCheck): boolean {
  return profile.deleted_at === null;
}
```

```sql
-- 0005_commerce.sql: protect body columns independently of metadata visibility.
revoke select(content) on chapters from anon, authenticated;
```

Do not copy the existing SQL test's max:1 connection as a concurrency test. Do not assume a new moderation column is protected just because the table has owner RLS. Do not use a global layout check as the only authorization for exported Server Actions.
