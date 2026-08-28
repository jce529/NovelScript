# Phase 3: Reader Core (Reading Loop, No Payment) - Research

**Researched:** 2026-08-28
**Domain:** Next.js 16 (App Router, non-Cache-Components) reader-facing UI + Supabase Postgres/RLS schema extension
**Confidence:** HIGH (schema/RLS/Next.js findings verified against live migration + installed `node_modules/next/dist/docs`); MEDIUM (trending-score weighting, UI-detail choices — these are explicitly Claude's discretion)

## Summary

Phase 3 adds a reader-facing surface on top of the `works`/`chapters` schema Phase 2 just landed (`supabase/migrations/0002_studio.sql`). The single most important finding is a **schema/RLS gap**: the current RLS policies (`works_owner_all`, `chapters_owner_all`) restrict `SELECT` to the row's owner only. There is currently no way for a reader (anonymous or logged-in-but-not-owner) to read a `work` or `chapter` row at all — every reader-facing query in this phase will return zero rows until new, additive `SELECT` policies are added. This must be the first migration task in the phase plan.

Four new tables are needed: `chapters.view_count` (column, not a table — incremented via a `SECURITY DEFINER` RPC so anonymous readers can bump it despite restrictive RLS), `work_likes` (toggleable like, login-gated), `reading_progress` (이어보기, login-gated, one row per user+work), and `reports` (login-gated, reason categories fixed per D-16, shaped for Phase 7's ADMIN-01 queue). All four follow the established codebase pattern: RLS as a permissive backstop, real business-rule enforcement (ownership, login, category validation) in a `lib/<domain>/actions.ts` file called from a Server Action, exactly like `lib/chapters/actions.ts` today.

On the Next.js side, this project has **not** enabled Cache Components (`cacheComponents` is absent from `next.config.ts`), so the "previous model" of caching applies: `fetch` is uncached by default, Server Components read live via the Supabase SSR client, and `revalidatePath`/`router.refresh()` are the tools for showing fresh data after a mutation. The official Next.js docs bundled with this exact installed version (`node_modules/next/dist/docs`) contain a literal "view count" example (`useEffect` + Server Action + `useState`) that matches D-09's per-open, no-dedup increment requirement almost verbatim — that pattern should be used directly for the viewer's view-count bump. `middleware.ts` has been renamed to `proxy.ts` in this Next.js version (the project already has one for session refresh); do not reintroduce a `middleware.ts` file.

**Primary recommendation:** Before any reader UI work, land a migration that (1) adds public `SELECT` RLS policies for published/non-deleted `works` and `chapters`, (2) adds `chapters.view_count`, (3) creates `work_likes`, `reading_progress`, `reports` tables with their own RLS, and (4) adds a `SECURITY DEFINER` `increment_chapter_view(uuid)` RPC. Build reader queries in a new `lib/reader/actions.ts` (or split `lib/discovery`, `lib/viewer`, `lib/reports` — planner's call) using the same SSR-client-in-Server-Action pattern as `lib/chapters/actions.ts`, and explicitly exclude `content` from any query touching a paid (`price_tier IS NOT NULL`) chapter, since Phase 3 has no unlock mechanism and must not leak paid prose to the client bundle.

## User Constraints

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Discovery Feed & Ranking Signal**
- D-01: Main discovery feed cards show a single combined "trending score" badge (not three raw numbers) — a simplified stand-in for docs/5-1's "연독률 92%" badge concept. NOT the precise scroll-depth algorithm from docs/4 §4.3 (out of v1 scope) — a v1-simplified combination of views/likes/next-chapter click-through per READ-01. Exact weighting formula is Claude's/researcher's call.
- D-02: A separate ranking view lets the user switch the sort basis between the individual raw metrics (조회수/좋아요/다음화 이동률) rather than only the combined score — in addition to D-01's combined badge, not instead of it.
- D-03: Feed card layout is a grid (2-3 columns, cover-image-centric) — Naver Series/Ridi style, not a list.
- D-04: Feed supports genre filter + sort toggle (최신/인기). Genre filter reuses the single-select genre field from Phase 2's work model.
- D-05: docs/5-1's "루키 쿼터존" (minimum-10-chapter gate) is OUT of v1 scope. All works are exposed equally regardless of chapter count.

**Work Detail Page & Paid Chapter Handling**
- D-06: A "paid" chapter shows a lock badge in the chapter list/TOC but is not readable — clicking shows "결제 기능 준비중" rather than content. Interim behavior until Phase 6.
- D-07: Work detail page uses a tab structure: [소개] (intro/synopsis) + [회차] (chapter list) — 2 tabs. 세계관(Lore/Wiki) tab is deferred to v2 (READ-06); report action is a persistent button, not a tab.
- D-08: Like (좋아요) button requires login and is toggleable (press again to un-like) — prevents duplicate-count gaming.
- D-09: View count increments by 1 every time a reader opens a chapter in the viewer — no per-user dedup logic in v1.

**Viewer UX**
- D-10: Viewer's base reading mode is vertical scroll only (no paging/pagination mode).
- D-11: Font size and theme (dark/alt) controls live behind a fixed top toolbar icon (⚙️) that opens a settings panel — always reachable.
- D-12: Table of contents (TOC) is an in-viewer panel (overlay/side panel reachable from the toolbar).
- D-13: A persistent bottom bar with "이전화 / 다음화" buttons is always visible at the bottom of the viewer — not a scroll-triggered bottom-sheet popup. Since all chapters are free in Phase 3, "다음화" is always active when a next chapter exists.

**Resume Reading (이어보기) & Report**
- D-14: 이어보기 (READ-04) is supported for logged-in users only, persisted server-side (last-read-chapter-per-work). No localStorage guest support in v1.
- D-15: Resume reading surfaces in two places: (a) a "이어보기" button on the work detail page (replaces "읽기 시작" once the reader has read at least one chapter), and (b) a consolidated "최근 읽은 작품" list on the homepage/마이페이지 across all works read.
- D-16: Report reasons are a fixed category set (내용 불일치/표절, 혐오·유해 콘텐츠, 스팸/광고, 기타) with a free-text field shown when "기타" is selected. Categories must map 1:1 to the `reason category` field ADMIN-01 (Phase 7) needs.
- D-17: Report button is available in both the work detail page and the viewer, and requires login.

### Claude's Discretion
- Exact trending-score weighting formula (D-01).
- Ranking-view UI details — separate screen vs. tab vs. dropdown sort control (D-02).
- Locked-chapter click interaction — modal vs. inline message copy (D-06).
- Resume-reading data schema (which table/columns track last-read chapter per work per user) (D-14).
- TOC panel exact UI — modal vs. slide-in side panel (D-12).

### Deferred Ideas (OUT OF SCOPE)
- 세계관(Lore/Wiki) 탭, opt-in KB doc showcase on the work detail page — v2 (READ-06).
- AI-generated character/location illustration assets in the lore tab — not scoped anywhere.
- 진도별 스포일러 자동 잠금 — depends on the lore tab (v2); not tracked further.
- 명예의 전당 (우수 리뷰 매거진) — depends on a nonexistent review system; not tracked.
- 루키 쿼터존 — explicitly excluded from v1 per D-05.
- 정밀 스크롤 심도 기반 유효완독 트래커 — out-of-scope in PROJECT.md; D-01's simplified signal is the substitute.
</user_constraints>

## Phase Requirements

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| READ-01 | Discovery feed: cover, title, synopsis, simplified ranking signal | Standard Stack (feed query pattern), Architecture Pattern 1 (trending score), Runtime State / RLS section, Code Examples |
| READ-02 | Viewer: prev/next navigation + TOC | Architecture Pattern 2 (viewer route/layout), Don't Hand-Roll (scroll/nav), Code Examples |
| READ-03 | Viewer: font size + dark/alt theme toggle | Architecture Pattern 3 (viewer settings, client-side, no next-themes dependency needed), Pitfalls (no ThemeProvider wired yet) |
| READ-04 | 이어보기 (resume reading, remembered + resumed) | Architecture Pattern 4 (`reading_progress` table + upsert), Code Examples |
| READ-05 | Report novel/chapter for review | Architecture Pattern 5 (`reports` table), Don't Hand-Roll (category validation), Code Examples |
</phase_requirements>

## Standard Stack

### Core (already installed — no new packages required for data/logic layer)
| Library | Version (installed) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.3.2 | App Router, Server Actions, routing | Already the project framework; this Next.js build ships its own docs at `node_modules/next/dist/docs` — **treat those as the authoritative reference over training data**, this version has confirmed breaking changes (see State of the Art below) |
| @supabase/ssr | ^0.12.5 | Cookie-bound Supabase client for Server Components/Actions | Existing pattern (`lib/supabase/server.ts`) — reader queries must use this, not the admin client, so RLS is actually exercised in production |
| @supabase/supabase-js | ^2.112.4 | Supabase client typing, `SupabaseClient` type | Existing dependency |
| zod | ^4.4.3 | Input validation (report category/detail, etc.) | Matches existing pattern in `lib/chapters/actions.ts` (`publishSchema`) |
| sonner | ^2.0.8 | Toast notifications (report submitted, like toggled) | Already installed, already used in Phase 2 UI |
| lucide-react | ^1.34.0 | Icons (settings gear, lock badge, report flag) | Already installed |

### Supporting — shadcn components to add this phase
| Component | Purpose | When to Use |
|-----------|---------|-------------|
| `tabs` | Work detail page [소개]/[회차] tabs (D-07) | Not yet installed — run `npx shadcn add tabs` |
| `sheet` | TOC slide-in side panel (D-12), viewer settings panel (D-11) | Not yet installed — run `npx shadcn add sheet`. Alternative: reuse existing `dialog` for a modal-style TOC if the planner prefers D-12's "modal" option over "slide-in panel" |
| `slider` or plain buttons | Font size control (D-11) | `npx shadcn add slider`, or a simple 3-step button group (A- / A / A+) — button group is simpler and matches Korean web-novel viewer conventions more closely than a continuous slider |
| `badge` | Trending score badge, lock badge, genre tag | **Already installed** |
| `select` / `dropdown-menu` | Genre filter, ranking sort toggle, report reason dropdown | **Already installed** |
| `scroll-area` | TOC panel scroll region | **Already installed** |
| `dialog` | Report form, locked-chapter interaction (if modal chosen over inline message) | **Already installed** |
| `tooltip` | Settings/TOC toolbar icon labels | **Already installed** |

**CRITICAL pitfall for any new shadcn component:** this project's `components.json` uses `"style": "base-nova"`, and installed components (`tooltip.tsx`, `select.tsx`) are built on `@base-ui/react` primitives, **not Radix**. Training data for shadcn/ui overwhelmingly assumes Radix (`asChild` prop). This project's own Plan 02-05 note confirms: *"base-ui Tooltip/Select use render prop not asChild (this Next.js/base-ui version has no Radix asChild support)"*. When adding `tabs`/`sheet`/`slider`, verify the generated component against this same render-prop convention before using `asChild`-style composition from memory.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Denormalized `works.view_count`/`works.like_count` columns maintained by triggers | Compute aggregates at query time (`SUM`/`COUNT` via join, or app-layer reduction over per-chapter counts) | Trigger-maintained counters are faster at scale but add migration/trigger complexity for a beta-stage feed with a small number of works. Recommend query-time aggregation for v1 (see Architecture Pattern 1) — revisit if the feed becomes slow. |
| `next/image` for cover thumbnails | Plain `<img>` with fixed aspect-ratio container | `cover_image_url` is arbitrary external user input (Phase 2 doesn't validate/restrict the host). `next/image` requires a known `images.remotePatterns` allowlist in `next.config.ts`; an unconfigured host throws a runtime error. Since covers can point anywhere, plain `<img>` (lazy-loaded, `loading="lazy"`) avoids this footgun for v1. Revisit if covers move to a single trusted storage bucket. |
| RLS-only report-queue access for admins | Service-role (admin) client for Phase 7's ADMIN-01 queue reads | Out of this phase's scope, but the `reports` table shape must not paint Phase 7 into a corner — see Architecture Pattern 5. |

**Installation:**
```bash
npx shadcn add tabs sheet
# slider optional — a 3-step button group may be simpler for D-11's font-size control
```

**Version verification:** No new npm packages required this phase (all data-layer dependencies already pinned in `package.json` from Phases 1-2). shadcn components are generated locally into `components/ui/`, not versioned npm installs — verify each generated file against the `base-nova`/`@base-ui/react` convention already established, not against upstream shadcn/Radix examples.

## Architecture Patterns

### Recommended Project Structure
```
supabase/migrations/
└── 0003_reader.sql          # RLS additions, view_count column, work_likes/reading_progress/reports tables, increment_chapter_view RPC

lib/
├── discovery/actions.ts     # listFeed (grid, genre filter, sort), trending score computation
├── works/actions.ts         # (existing) — add getPublicWork (no ownerId gate, published-only)
├── chapters/actions.ts      # (existing) — add getPublicChapter / listPublicChapters (content excluded for paid chapters)
├── reader/
│   ├── likes.ts             # toggleLike
│   ├── progress.ts          # upsertReadingProgress, getReadingProgress, listRecentlyRead
│   └── reports.ts           # submitReport (zod-validated categories)

app/
├── page.tsx                 # discovery feed (READ-01) — or app/(reader)/page.tsx if a route group is preferred
├── works/[workId]/
│   ├── page.tsx              # work detail — [소개]/[회차] tabs (D-07)
│   └── actions.ts            # like toggle, report submit Server Actions bound to this route
└── works/[workId]/chapters/[chapterId]/
    ├── page.tsx               # viewer (READ-02/03), reads chapter + increments view_count
    └── actions.ts              # incrementViewAction, reading-progress upsert, report submit
```

Note: `app/studio/...` already owns the writer-side routes at `/studio/[workId]/...`. Reader-side routes should live outside `/studio` (e.g., `/works/[workId]/...` or a root-level `/[workId]/...` if a shorter reader URL is desired) to keep the two loops visually and structurally separate, consistent with how Phase 2 scoped writer routes under `/studio`.

### Pattern 1: RLS gap — additive public-read policies (must land first)

**What:** The current RLS (`0002_studio.sql`) only allows the row owner to `SELECT` from `works`/`chapters`. Reader routes using the SSR client (per the project's established pattern of using `createClient()`, not the admin client, in production Server Actions — see `app/studio/[workId]/chapters/[chapterId]/actions.ts`) will get zero rows back for any non-owner, including anonymous visitors, until new policies are added.

**When to use:** First migration task of this phase, before any reader query code is written.

**Example:**
```sql
-- Source: supabase/migrations/0002_studio.sql (existing owner policy, for contrast)
-- create policy "works_owner_all" on works for all
--   using (owner_id = auth.uid() and deleted_at is null)
--   with check (owner_id = auth.uid());

-- New, additive (Postgres RLS policies are OR'd — this does not replace the owner policy):
create policy "works_public_read" on works for select
  using (deleted_at is null);

create policy "chapters_public_read" on chapters for select
  using (is_published = true and deleted_at is null);
```

**Content-leak guard:** even with `chapters_public_read` in place, a `select *` on a paid, unpublished-for-payment chapter still returns the full `content` column to any caller — Phase 3 has no unlock mechanism, so that content must never reach the client. Enforce this at the query layer, not RLS (RLS is row-level, not column-level, in this Postgres version without extra view/column-grant machinery):

```ts
// lib/chapters/actions.ts (new function) — Source: existing codebase pattern
export async function getPublicChapter(supabase: SupabaseClient, chapterId: string) {
  const { data } = await supabase
    .from('chapters')
    .select('id, work_id, title, order_index, is_published, price_tier, content')
    .eq('id', chapterId)
    .eq('is_published', true)
    .is('deleted_at', null)
    .maybeSingle();
  if (!data) return null;
  // D-06: paid chapters are locked in v1 — never return content for them.
  if (data.price_tier !== null) return { ...data, content: null, locked: true };
  return { ...data, locked: false };
}
```

### Pattern 2: View-count increment as a public RPC (login not required to read)

**What:** D-09 requires every chapter open to increment `view_count`, with no per-user dedup, and reading itself is not login-gated anywhere in this phase's requirements (only likes/reports/resume are). A direct `UPDATE chapters SET view_count = view_count + 1` from the anon/authenticated SSR client would be blocked by RLS (no owner match) unless a public UPDATE policy is added — which is riskier (opens the whole row to arbitrary column writes from any caller shape). The established, safer pattern (and one this codebase already uses for `handle_new_user` in `0001_init.sql`) is a `SECURITY DEFINER` function scoped to exactly one operation, with `EXECUTE` granted to `anon`/`authenticated`.

**When to use:** Any reader-facing counter mutation that must work for anonymous users.

**Example:**
```sql
-- Source: pattern precedent — supabase/migrations/0001_init.sql's handle_new_user()
create or replace function increment_chapter_view(p_chapter_id uuid) returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update chapters
  set view_count = view_count + 1
  where id = p_chapter_id and is_published = true and deleted_at is null;
end;
$$;

grant execute on function increment_chapter_view(uuid) to anon, authenticated;
```

Pair this with the official Next.js "update a view count" pattern, which matches D-09 exactly (per-mount increment, no dedup):
```tsx
// Source: node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md
'use client'
import { incrementViews } from './actions'
import { useState, useEffect, useTransition } from 'react'

export default function ViewCount({ initialViews }: { initialViews: number }) {
  const [views, setViews] = useState(initialViews)
  const [, startTransition] = useTransition()
  useEffect(() => {
    startTransition(async () => {
      const updatedViews = await incrementViews()
      setViews(updatedViews)
    })
  }, [])
  return <p>Total Views: {views}</p>
}
```

### Pattern 3: Trending score — computed at query time, not stored

**What:** D-01 requires a single combined badge; D-02 requires switching the sort basis to raw metrics. Rather than maintaining denormalized/triggered counters, compute per-work aggregates in the feed query (or in the TS layer over a small result set), consistent with this codebase's existing style of putting business logic in `lib/*/actions.ts` rather than in triggers.

**When to use:** Discovery feed (READ-01) and the ranking view (D-02).

**Example (recommended shape, Claude's discretion for exact weights):**
```ts
// lib/discovery/actions.ts — sketch
interface WorkFeedRow {
  workId: string; totalViews: number; likeCount: number; nextChapterCtr: number;
}

// next-chapter CTR proxy (no click-tracking table needed): ratio of chapter[i+1]
// views to chapter[i] views, averaged across consecutive published chapters.
// This avoids inventing a separate clicks table for a v1-simplified signal (D-01).
function averageNextChapterCtr(viewCountsInOrder: number[]): number {
  if (viewCountsInOrder.length < 2) return 0;
  const ratios = viewCountsInOrder.slice(1).map((v, i) => {
    const prev = viewCountsInOrder[i];
    return prev > 0 ? Math.min(v / prev, 1) : 0;
  });
  return ratios.reduce((a, b) => a + b, 0) / ratios.length;
}

// Trending score: normalize each signal to [0,1] across the current feed page,
// then weight. Suggested starting weights (adjust after real data): views 0.4,
// likes 0.3, next-chapter CTR 0.3 — CTR weighted high because it's the strongest
// "readers are hooked" signal, matching docs/5-1's 연독률 framing.
```

Likes count via a dedicated read path (see Pattern 5) rather than exposing raw `work_likes` rows broadly.

### Pattern 4: Resume reading (이어보기) — upsert on every chapter open

**What:** D-14 requires server-side, login-gated, one-row-per-user-per-work state.

**Example:**
```sql
create table if not exists reading_progress (
  user_id uuid not null references profiles(id),
  work_id uuid not null references works(id),
  chapter_id uuid not null references chapters(id),
  updated_at timestamptz not null default now(),
  primary key (user_id, work_id)
);

alter table reading_progress enable row level security;
create policy "reading_progress_owner_all" on reading_progress for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
```

```ts
// lib/reader/progress.ts — sketch, called from the viewer's Server Action on chapter open
export async function upsertReadingProgress(supabase: SupabaseClient, { userId, workId, chapterId }: {...}) {
  return supabase.from('reading_progress')
    .upsert({ user_id: userId, work_id: workId, chapter_id: chapterId, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,work_id' });
}
```

D-15's two surfaces read this same table: work-detail-page lookup (`eq('work_id', workId).eq('user_id', userId)`) for the "이어보기" button, and a `order('updated_at', desc)` list across all rows for a given `user_id` for "최근 읽은 작품".

### Pattern 5: Reports — fixed categories, shaped for Phase 7's admin queue

**What:** D-16 fixes the category set and requires free text only for "기타"; D-17 requires login. ADMIN-01 (Phase 7) needs reporter, target content, reason category, timestamp, status — the table shape below satisfies that without Phase 3 building any admin UI.

**Example:**
```sql
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles(id),
  work_id uuid not null references works(id),
  chapter_id uuid references chapters(id), -- null = report is about the whole work
  reason_category text not null check (reason_category in (
    '내용 불일치/표절', '혐오·유해 콘텐츠', '스팸/광고', '기타'
  )),
  detail text, -- required only when reason_category = '기타' (enforce in zod, not DB)
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolution_note text,
  resolved_by uuid references profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table reports enable row level security;
create policy "reports_reporter_insert" on reports for insert with check (reporter_id = auth.uid());
create policy "reports_reporter_select_own" on reports for select using (reporter_id = auth.uid());
-- Phase 7 (ADMIN-01..04) will need a broader read/update policy (e.g., role-based) or the
-- admin service-role client — deliberately not added here; out of this phase's scope.
```

```ts
// lib/reader/reports.ts — zod mirrors the publishSchema pattern in lib/chapters/actions.ts
const reportSchema = z.object({
  workId: z.string().uuid(),
  chapterId: z.string().uuid().nullable(),
  reasonCategory: z.enum(['내용 불일치/표절', '혐오·유해 콘텐츠', '스팸/광고', '기타']),
  detail: z.string().trim().optional().nullable(),
}).refine((v) => v.reasonCategory !== '기타' || (v.detail && v.detail.length > 0), {
  message: '기타 사유는 상세 내용을 입력해주세요.',
  path: ['detail'],
});
```

### Pattern 6: Likes — toggleable, login-gated, count readable by everyone

**Example:**
```sql
create table if not exists work_likes (
  work_id uuid not null references works(id),
  user_id uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  primary key (work_id, user_id)
);

alter table work_likes enable row level security;
create policy "work_likes_owner_write" on work_likes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Public read so anonymous feed visitors and the ranking view can see like counts.
-- Exposes only (work_id, user_id, created_at) — acceptable for v1; revisit if a
-- "who liked this" list is ever surfaced (it isn't, per D-08).
create policy "work_likes_public_read" on work_likes for select using (true);
```

```ts
// lib/reader/likes.ts — toggle: insert if absent, delete if present (D-08)
export async function toggleLike(supabase: SupabaseClient, { workId, userId }: { workId: string; userId: string }) {
  const { data: existing } = await supabase.from('work_likes').select('work_id')
    .eq('work_id', workId).eq('user_id', userId).maybeSingle();
  if (existing) {
    await supabase.from('work_likes').delete().eq('work_id', workId).eq('user_id', userId);
    return { liked: false };
  }
  await supabase.from('work_likes').insert({ work_id: workId, user_id: userId });
  return { liked: true };
}
```

### Anti-Patterns to Avoid
- **Using `lib/supabase/admin.ts` (service-role client) for reader queries:** the codebase's established pattern (`app/studio/.../actions.ts`) uses the SSR-cookie client (`createClient()` from `lib/supabase/server.ts`) even for authenticated mutations, relying on RLS as the real gate. Reader routes should follow the same convention — this is also why the RLS gap (Pattern 1) must be fixed, rather than worked around by quietly switching reader reads to the admin client (which would silently bypass RLS and make future admin/reporting logic harder to reason about).
- **Relying on UI-only locking for paid chapters:** hiding paid content with CSS/conditional rendering while still shipping `content` in the RSC payload/API response is a real content leak. Exclude it at the query layer (Pattern 1).
- **A `middleware.ts` file:** this Next.js version calls it Proxy (`proxy.ts`, already present in the repo root). Do not create `middleware.ts` — it will not run.
- **`next/image` for `cover_image_url`:** will throw at runtime for any host not in `images.remotePatterns`; the field is unrestricted user input.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Public/anon counter increment under restrictive RLS | A public `UPDATE` RLS policy on `chapters` | `SECURITY DEFINER` RPC scoped to one column/condition (Pattern 2) | Matches existing `handle_new_user()` precedent in this repo; avoids opening the whole `chapters` row to arbitrary writes from unauthenticated callers |
| Next-chapter click-through tracking | A dedicated `chapter_clicks` table with client-side click event logging | Ratio of consecutive chapters' `view_count` (Pattern 3) | D-01 explicitly calls for a v1-*simplified* signal; a full click-tracking pipeline is the precise-algorithm territory PROJECT.md defers |
| Dark/alt theme toggle for the viewer | A new global theming system | The existing `.dark` Tailwind variant (`@custom-variant dark (&:is(.dark *))` in `app/globals.css`) scoped to the viewer's root container via a local `useState`-driven class, OR `next-themes` if the planner wants persistence across sessions — but note `next-themes`' `ThemeProvider` is **not yet wired into `app/layout.tsx`** (only `components/ui/sonner.tsx` calls `useTheme()`, which will silently no-op without a provider) | Avoids inventing new CSS variables; D-11 scopes theme to "the viewer," not the whole site, so a viewer-local class toggle (no global provider needed) is the simplest correct option unless persistence-across-visits for theme (not just font) is desired |
| Report category validation | Free-text reason field with app-side "guessing" of category | Fixed `check` constraint + zod enum matching D-16's four categories verbatim | Must map 1:1 to what Phase 7's ADMIN-01 queue will filter/display on |

**Key insight:** almost everything reader-facing in this phase is a straightforward CRUD/RLS extension of Phase 2's schema — the risk is not "what library to use" but "will this query return any rows at all" (RLS) and "does this leak paid content" (column-level care within a row-level-only RLS system).

## Common Pitfalls

### Pitfall 1: RLS silently returns empty arrays, not errors
**What goes wrong:** A reader-facing Server Component queries `chapters` via the SSR client and gets `data: []` with no error — looks like "no published chapters" when it's actually "RLS blocked everything."
**Why it happens:** Supabase/Postgres RLS filters rows before the query even considers them a permission failure; the client sees a successful, empty response.
**How to avoid:** Land Pattern 1's policies first, then write one throwaway integration test (mirroring `tests/chapters/ownership-guard.test.ts`'s style, but asserting a **non-owner, anon-key** client *can* read a published chapter) before building UI on top.
**Warning signs:** Feed/detail/viewer pages render correctly when tested as the work's own owner but show empty state for a second test account or logged-out browser.

### Pitfall 2: Testing exclusively with the admin client masks RLS gaps
**What goes wrong:** Following the existing test pattern exactly (`tests/chapters/publish.test.ts` etc. all use `adminClient()`, which bypasses RLS) for reader-facing tests would make Pitfall 1 invisible in CI — tests would pass even if RLS blocks real readers.
**Why it happens:** The admin client is the established pattern for *business-logic* tests (ownership checks are enforced in TS, not relied on RLS for correctness) — but reader read-paths in this phase *do* rely on RLS for correctness (there's no app-layer ownership check for "can this anon user read this chapter" — RLS is the only gate).
**How to avoid:** At least one test per new public-read policy should use an anon-key (`createClient` with `NEXT_PUBLIC_SUPABASE_ANON_KEY`) or a second non-owner authenticated client, not the service-role admin client, to prove RLS actually permits the read.
**Warning signs:** All-green test suite, but manual browser testing as an anonymous visitor shows an empty feed.

### Pitfall 3: Paid-chapter content leak via `select('*')`
**What goes wrong:** A chapter query that does `select('*')` on a published-but-paid chapter (price_tier not null) ships the full `content` field to the client even though the UI shows a lock icon — visible via browser devtools/Network tab regardless of what the rendered page shows.
**Why it happens:** RLS in this schema is row-level (`is_published = true`), not column-level; a paid chapter that's published *is* readable at the row level, and Phase 3 has no unlock mechanism to gate `content` specifically.
**How to avoid:** Never `select('*')` on chapters in reader-facing code; explicitly select columns and null out `content` server-side for `price_tier IS NOT NULL` rows before returning from the Server Action/Server Component data function (Pattern 1's `getPublicChapter` example).
**Warning signs:** Network tab (or RSC payload) shows chapter prose for a chapter the UI displays as locked.

### Pitfall 4: `next/image` throwing on arbitrary cover-image hosts
**What goes wrong:** A writer pastes a cover image URL from an arbitrary host (Phase 2 doesn't restrict this); rendering it with `next/image` throws `Invalid src prop ... hostname ... is not configured under images in your next.config.js`.
**Why it happens:** `next/image` requires all remote hosts to be explicitly allow-listed via `images.remotePatterns`; the project's `next.config.ts` currently has no `images` config at all.
**How to avoid:** Use a plain `<img>` tag for cover thumbnails in this phase (see Alternatives Considered), or add a broad-but-documented `remotePatterns` wildcard and accept the security tradeoff — planner's call, but must be an explicit decision, not an oversight discovered at runtime.
**Warning signs:** Feed/detail page crashes or shows a broken image only for works whose cover URL host wasn't anticipated during dev testing.

### Pitfall 5: Assuming Cache Components / `use cache` semantics from newer Next.js docs sections
**What goes wrong:** Copying a `'use cache'`/`cacheLife()` example from the docs (or from training data about "Next.js 15/16 caching") into this project, where `cacheComponents` is **not** enabled in `next.config.ts`.
**Why it happens:** The bundled docs (`node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md`) *lead with* the Cache Components model since it's the new default developer story for Next 16, but this project hasn't opted in.
**How to avoid:** Follow `node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md` instead — plain `fetch` is uncached by default, use `revalidatePath`/`revalidateTag` after mutations, `unstable_cache` for non-fetch data if caching is ever needed. For this phase, most reader data (view counts, likes) changes on every interaction, so no caching is needed at all beyond React's automatic request-level dedup for `fetch`; for direct Supabase-js calls (not `fetch`), there's no automatic memoization — call once per request and pass down props rather than re-querying in nested components.
**Warning signs:** `'use cache'` directive causing build errors or being silently ignored; stale trending scores that don't update on refresh.

### Pitfall 6: `middleware.ts` vs `proxy.ts`
**What goes wrong:** Creating a new `middleware.ts` for reader-route auth gating (e.g., gating `/works/[id]/like` or resume-reading routes) based on Next.js training-data conventions.
**Why it happens:** Next.js renamed Middleware to Proxy in v16 (`node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`: *"Starting with Next.js 16, Middleware is now called Proxy... functionality remains the same"*). The project already has a `proxy.ts` at the repo root for session refresh.
**How to avoid:** Extend the existing `proxy.ts` if route-level gating is needed, or (preferred, matching Phase 1/2 convention) do the auth check inside the page/layout/Server Action itself (as `app/studio/layout.tsx` does with `redirect('/login')`), since login-gating in this phase is per-action (like/report/resume), not per-route.

## Runtime State Inventory

Not applicable — this is a greenfield additive phase (new tables/columns/routes), not a rename/refactor/migration. No existing runtime state references strings that are changing.

## Code Examples

### Discovery feed query shape (READ-01)
```ts
// Source: pattern derived from existing lib/works/actions.ts (listWorks) + Pattern 1/3 above
export async function listFeed(supabase: SupabaseClient, { genre, sort }: { genre?: string; sort: 'latest' | 'popular' }) {
  let query = supabase
    .from('works')
    .select('id, title, synopsis, cover_image_url, genre, created_at, chapters!inner(id, view_count, price_tier, order_index, is_published)')
    .eq('chapters.is_published', true) // only surface works with >=1 published chapter
    .is('deleted_at', null);
  if (genre) query = query.eq('genre', genre);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  // Aggregate per-work (views sum, chapter count, next-chapter CTR) and combine with
  // like counts (separate query against work_likes/work-like-counts) in TS — see Pattern 3.
  return data ?? [];
}
```

### Viewer page reading params/chapter (Next.js 16 async params — already the codebase convention)
```tsx
// Source: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md
// + existing app/studio/[workId]/chapters/[chapterId]/page.tsx convention (Promise<params>, use())
export default async function ViewerPage({
  params,
}: {
  params: Promise<{ workId: string; chapterId: string }>;
}) {
  const { workId, chapterId } = await params;
  // fetch chapter via getPublicChapter (Pattern 1), fetch TOC via listPublicChapters
  // increment view via a client-side useEffect + Server Action (Pattern 2), not here —
  // doing it in the Server Component itself would double-count on every RSC re-render
  // and would run during prerendering (irrelevant here since cacheComponents is off,
  // but still not "one increment per open" semantically for a streamed/re-rendered tree).
}
```

## State of the Art

| Old Approach (training data) | Current Approach (this Next.js 16 build) | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `middleware.ts` | `proxy.ts` (`export function proxy(request)`) | Next.js 16 | Any auth-gating code must extend `proxy.ts`, not create `middleware.ts` |
| `params`/`searchParams` as sync props | Both are `Promise<...>`, must `await` or `use()` | Next.js 15.0.0-RC (confirmed still true in 16) | Already the codebase convention; feed's genre-filter/sort `searchParams` must be awaited |
| shadcn/ui on Radix (`asChild`) | This project's shadcn install (`base-nova` style) is on `@base-ui/react` (render props, no `asChild`) | Project-specific choice, not a Next.js version change | New components (tabs/sheet) must be checked against this convention post-generation |
| Cache Components / `'use cache'` as the default caching story in docs | Not enabled here (`cacheComponents` absent from `next.config.ts`) — "previous model" (`fetch` uncached by default) applies | Next 16.0.0 introduced Cache Components as opt-in | Do not copy `'use cache'`/`cacheLife` examples from the getting-started caching doc; use the "Caching (Previous Model)" guide instead |

**Deprecated/outdated:**
- Synchronous `params`/`searchParams` access — deprecated since 15, this project is already on the async convention throughout Phase 2 code.

## Open Questions

1. **Exact trending-score weighting formula (D-01, explicitly Claude's/planner's discretion)**
   - What we know: signal inputs are views, likes, next-chapter CTR; docs/5-1 frames the badge as a "연독률"-style single number.
   - What's unclear: exact weights and whether to normalize per-feed-page or globally.
   - Recommendation: start with the weights sketched in Pattern 3 (views 0.4 / likes 0.3 / CTR 0.3), ship it, and treat as tunable — this is explicitly not meant to be precise per PROJECT.md.

2. **Reader route URL shape (`/works/[workId]/...` vs. a shorter top-level slug)**
   - What we know: writer routes live under `/studio/[workId]/...`.
   - What's unclear: whether reader-facing URLs should be `/works/[workId]` or something more SEO-friendly (e.g., slug-based).
   - Recommendation: `/works/[workId]/...` (uuid-based, matching the writer side's convention) is sufficient for v1; slugs are a v2 SEO concern, not blocking.

3. **Whether `reading_progress` needs a `last_read_at` distinct from `updated_at`, and whether partial-scroll position (not just chapter) should be tracked**
   - What we know: D-14 only requires "last-read chapter," not a scroll-position/paragraph-level bookmark.
   - What's unclear: nothing blocking — D-14's scope is explicit and narrow.
   - Recommendation: chapter-level granularity only (Pattern 4), as decided.

## Environment Availability

Skipped — this phase has no new external service dependencies beyond the already-configured Supabase project (verified working via Phase 1/2's live migrations and passing test suite) and the already-installed Next.js/npm toolchain. No new API keys, CLIs, or runtimes are introduced.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.11 |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npm test -- tests/reader` (once new test dir exists) |
| Full suite command | `npm test` |

Existing tests are **integration tests against a live Supabase project** (using `tests/helpers/db.ts`'s `adminClient()`/`createTestUser()`), not mocks. Reader-phase tests should follow the same convention, with the addition noted in Pitfall 2 (at least one non-admin-client test per new public RLS policy).

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| READ-01 | Feed returns published works with cover/title/synopsis/trending signal, filterable by genre | integration | `npx vitest run tests/discovery/feed.test.ts` | ❌ Wave 0 |
| READ-01 | Anon (non-owner) client can read published works/chapters (RLS gap fix) | integration | `npx vitest run tests/discovery/public-read-rls.test.ts` | ❌ Wave 0 |
| READ-02 | Viewer returns chapter content for published free chapters; TOC lists all published chapters in order | integration | `npx vitest run tests/viewer/chapter-read.test.ts` | ❌ Wave 0 |
| READ-02 | Paid chapter content is never returned (locked) | integration | `npx vitest run tests/viewer/paid-lock.test.ts` | ❌ Wave 0 |
| READ-03 | Font size / theme are client-only UI state — not a server-testable requirement; cover via manual/UI verification | manual | — | n/a |
| READ-04 | `upsertReadingProgress` sets/updates last-read chapter per user+work; resume surfaces correct chapter | integration | `npx vitest run tests/reader/reading-progress.test.ts` | ❌ Wave 0 |
| READ-05 | Report submission validates fixed categories, requires detail text for "기타", requires login | integration | `npx vitest run tests/reader/reports.test.ts` | ❌ Wave 0 |
| D-08 | Like toggle: insert then delete on second call, requires login | integration | `npx vitest run tests/reader/likes.test.ts` | ❌ Wave 0 |
| D-09 | `increment_chapter_view` RPC increments regardless of caller identity (incl. anon) | integration | `npx vitest run tests/viewer/view-count.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** targeted `npx vitest run <new test file>`
- **Per wave merge:** `npm test` (full suite, matches existing Phase 1/2 convention)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/discovery/feed.test.ts` — covers READ-01
- [ ] `tests/discovery/public-read-rls.test.ts` — covers READ-01 (anon-client RLS proof, Pitfall 1/2)
- [ ] `tests/viewer/chapter-read.test.ts` — covers READ-02
- [ ] `tests/viewer/paid-lock.test.ts` — covers READ-02, D-06 content-leak guard
- [ ] `tests/viewer/view-count.test.ts` — covers D-09
- [ ] `tests/reader/reading-progress.test.ts` — covers READ-04
- [ ] `tests/reader/reports.test.ts` — covers READ-05
- [ ] `tests/reader/likes.test.ts` — covers D-08
- [ ] No new fixtures needed beyond extending `tests/helpers/db.ts` with an anon-key client factory (`anonClient()`) for the RLS-proof tests — currently only `adminClient()` exists there.

## Sources

### Primary (HIGH confidence)
- `supabase/migrations/0001_init.sql`, `0002_studio.sql` — live schema, RLS policies, existing `security definer` precedent (`handle_new_user`)
- `lib/chapters/actions.ts`, `lib/works/actions.ts`, `app/studio/[workId]/chapters/[chapterId]/actions.ts` — established app-layer pattern (SSR client, ownership checks in TS, zod validation)
- `tests/chapters/publish.test.ts`, `tests/chapters/ownership-guard.test.ts`, `tests/helpers/db.ts` — established test pattern (admin client, live integration tests)
- `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md` — Server Actions, view-count example (matches D-09 verbatim)
- `node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md`, `.../02-guides/caching-without-cache-components.md` — confirmed via `next.config.ts` that Cache Components is off; previous-model caching applies
- `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`, existing `proxy.ts` — Middleware→Proxy rename confirmed
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` — async `params`/`searchParams`, `PageProps` helper
- `node_modules/next/dist/docs/01-app/01-getting-started/12-images.md` — `remotePatterns` requirement for `next/image`
- `components.json`, `components/ui/tooltip.tsx` — confirmed `base-nova`/`@base-ui/react` (not Radix) shadcn style
- `docs/5-1.독자 공간 UI,UX 설계 및 운영 시스템.md` — canonical reader-UX vision (partially adopted per CONTEXT.md)
- `.planning/phases/03-reader-core-reading-loop-no-payment/03-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/ROADMAP.md` — phase scope, decisions, prior-phase state

### Secondary (MEDIUM confidence)
- Trending-score weighting values in Pattern 3 — reasoned recommendation, not sourced from any external authority (explicitly Claude's discretion per CONTEXT.md D-01)

### Tertiary (LOW confidence)
- None — no unverified WebSearch findings were needed; all findings were resolvable against the live repo and the bundled Next.js docs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new npm packages; shadcn components are locally generated and their convention (`base-nova`) is directly observable in the repo
- Architecture (schema/RLS): HIGH — verified against live migration files and existing RLS precedent in the same repo
- Architecture (Next.js rendering/caching): HIGH — verified against the exact installed `node_modules/next/dist/docs` for this project's Next.js version, plus `next.config.ts` confirming Cache Components is off
- Pitfalls: HIGH for RLS/content-leak/proxy-rename (directly verified against repo state); MEDIUM for the exact trending-score formula (explicitly a judgment call, not a fact to verify)

**Research date:** 2026-08-28
**Valid until:** 30 days (stable — no fast-moving external dependency; the schema/RLS findings are valid until the next migration changes `works`/`chapters`, which only this phase's own plans would do)
