# Phase 2: Studio Core (Writer Loop, No AI) - Research

**Researched:** 2026-08-25
**Domain:** IDE-style file-tree UI (Next.js 16 / React 19), Postgres/Supabase hierarchical KB schema + RLS, chapter publishing/reorder, Obsidian-template substitution
**Confidence:** MEDIUM-HIGH (Next.js/React patterns and npm package versions HIGH via installed docs + live registry; Postgres tree-schema and DnD-for-chapter-reorder patterns MEDIUM — synthesized/cross-verified, not single canonical spec; Korean price-tier/genre conventions MEDIUM — WebSearch cross-verified across 2+ platforms, framed as convention not requirement)

## Summary

Phase 2 is greenfield on top of Phase 1's not-yet-executed auth/wallet foundation (repo is still the bare scaffold — Phase 1 has not landed at research time). This phase adds three independent surfaces: (1) an IDE-style folder/file tree for Studio navigation with a fixed 6-folder skeleton (`template`, `인물`, `장소`, `사건`, `세력`, `아이템`) plus arbitrary nested subfolders/files, (2) a KB document CRUD layer where new documents are seeded verbatim from the five real `docs/Template/*.md` files with `<% tp.file.title %>` substituted for the real title, and (3) a chapter draft/publish/reorder/unpublish flow with a fixed free/paid price-tier system.

For the tree UI, **no third-party tree component is required or recommended** — the scope per D-15/D-16 (create/rename/delete only, no drag-move) is narrow enough that a custom recursive React component over a flat node list is simpler than adopting a general-purpose tree library (`react-arborist`, `react-complex-tree`) whose main value-add (virtualization, drag-reorder-across-parents, keyboard nav) is mostly unused here and adds an API surface to learn. For the one genuinely reorderable list in this phase — 회차 (chapters) — **`@dnd-kit/sortable`** is the correct, purpose-built tool (D-17); it does not touch the file tree at all.

For the data layer, the cleanest fit for Supabase RLS is an **adjacency-list `parent_id` tree with an id-based materialized path and denormalized ownership/category columns on every row** (not `ltree`, not pure recursive-CTE-only) — because every node's ownership is knowable in O(1) without walking the tree (RLS just checks `owner_id = auth.uid()` and, for work-scoped nodes, `work_id` ownership), and because D-16 explicitly rules out drag-move in this phase, the classic "expensive path repair on move" weakness of materialized paths is moot until v2.

For chapter content and KB documents, D-12 and D-19 both explicitly want a **plain `<textarea>`**, not a rich markdown/WYSIWYG editor — this is a deliberate simplicity choice (Phase 4 adds an AI panel alongside the same editor), so no editor library (Tiptap, CodeMirror, Monaco) should be introduced in Phase 2.

**Primary recommendation:** Build the tree as a custom recursive Server-Component-rendered list backed by a single `kb_nodes` adjacency-list table (denormalized `owner_id`/`work_id`/`scope`/`category`/`is_locked` on every row); use `@dnd-kit/sortable` only for the 회차 list; use plain `<textarea>` for both KB and chapter editors; do server-side string substitution (no YAML library needed) to inject the real title into `<% tp.file.title %>` at KB-document-creation time.

## User Constraints

### Locked Decisions (from CONTEXT.md)

**Work (작품) Structure**
- D-01: A writer account can own multiple works — not limited to one.
- D-02: Converting to writer role does NOT auto-create a work. Creating a work is an explicit, separate flow ("새 작품 만들기").
- D-03: Work required field: title only. Optional: synopsis, cover image, genre/tag. Empty synopsis never blocks work creation.
- D-04: Genre/tag is a single-select from a fixed genre list (not free-text) — matches web-novel platform conventions. Planner drafts the concrete list.
- D-05: KB documents belong to exactly one work — never shared/visible across works.
- D-06: Switching between a writer's multiple works happens on a dedicated "작품 목록" page — not a header dropdown.
- D-07: The work itself has no publish/unpublish state; only individual chapters have a publish state.

**Template System**
- D-08: The 5 base templates use the ACTUAL seed files at `docs/Template/*.md` verbatim (including YAML frontmatter and heading structure). `<% tp.file.title %>` is substituted with the real document title at creation time.
- D-09: Two-tier template scope — account-level shared `template/` folder (usable across all of this writer's works), and work-level local `{work}/docs/template/` (usable only within that work).
- D-10: Phase 2 SCOPE EXPANSION: base-template editing AND custom-template creation are IN SCOPE at both tiers.
- D-11: Editing/creating account-level templates affects only that writer's own account — never platform-wide.
- D-12: The KB document editor is a single markdown textarea covering the ENTIRE file content (frontmatter + body) — no separate structured-field form.
- D-13: `[[wiki-link]]` syntax in seed templates is left as inert plain text in Phase 2 — no click/navigate/graph-view. Real wiki-linking is v2 (EDIT-06).

**Studio Navigation (File Tree)**
- D-14: Studio is an IDE-style folder/file tree. Fixed top-level structure:
  ```
  template/                         (account-level shared templates)
  {work-name}/
    docs/
      template/                     (work-local templates)
      인물/ 장소/ 사건/ 세력/ 아이템/  (KB documents, developed from templates)
    회차/                            (chapter files — has order + publish state)
  ```
- D-15: The 6 structural folders (`template`, `인물`, `장소`, `사건`, `세력`, `아이템`) are fixed and cannot be deleted/renamed, but writers can freely create arbitrarily-nested subfolders and files inside them.
- D-16: Drag-and-drop file/folder MOVEMENT is explicitly OUT of Phase 2 scope (deferred to v2). Create / rename / delete are supported; moving between folders via drag is not.
- D-17: Chapter ORDER (within 회차 folder specifically) IS reorderable via drag-and-drop — scoped narrowly to chapter sequencing, distinct from D-16.
- D-18: Studio is a route within the same app/domain (e.g. `/studio`), NOT a separate subdomain.

**Chapter Editor & Publishing**
- D-19: Chapter body editor is a plain text editor — no markdown rendering/formatting, line breaks only.
- D-20: Publishing: free/paid toggle; if paid, price is chosen from a FIXED set of price tiers (dropdown), not freeform numeric input. Concrete tier values are Claude's call.
- D-21: Editing a published chapter's content saves and reflects immediately — no unpublish-then-edit requirement.
- D-22: Unpublishing is a distinct, explicit action separate from editing.

### Claude's Discretion
- Exact visual differentiation between account-level vs. work-level template folders in the tree UI.
- Confirmation dialogs / filename-collision validation on folder/file create/rename/delete.
- Concrete fixed price-tier token values (D-20).
- Concrete fixed genre list values (D-04).
- Whether/how the 6 structural folders visually signal their "cannot delete/rename" status.

### Deferred Ideas (OUT OF SCOPE)
- Drag-and-drop file/folder movement in the tree — v2.
- Wiki-link resolution, click-navigation, graph view — v2 (EDIT-06).
- Work-level publish/unpublish state — not decided as needed.
- Studio on a separate subdomain — deferred indefinitely.
- 3-panel AI co-writing canvas, ghost text, token/cost gauge, AI chat — Phase 4.
- Analytics inspector, Studio Home 통계/경제 관리 menus — out of v1 scope entirely.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| KB-01 | Writer can create, edit, and delete KB documents across 5 templates (인물/장소/사건/세력/아이템) | Standard Stack (schema), Architecture Patterns (template substitution, `kb_nodes` CRUD), Code Examples |
| KB-02 | Writer can browse KB documents in an IDE-style folder/file tree, organized by template type, scoped per work | Architecture Patterns (adjacency-list tree, custom recursive component vs. tree library evaluation), Don't Hand-Roll |
| CONT-01 | Writer can create and save chapter drafts with title and order | Architecture Patterns (`chapters` table, order/resequence strategy) |
| CONT-02 | Writer can publish a chapter, marking it free or paid with a price | Architecture Patterns (price-tier design), State of the Art (Korean platform price-tier conventions) |
| CONT-03 | Writer can edit or unpublish their own chapters after publishing | Architecture Patterns (D-21/D-22 flows), Common Pitfalls |

## Project Constraints (from CLAUDE.md)

- **AGENTS.md (imported by CLAUDE.md):** "This is NOT the Next.js you know" — this repo's installed Next.js has breaking changes vs. training data. MUST read `node_modules/next/dist/docs/` for the installed version's actual APIs before writing code. Verified for this research: `next@16.3.2` is installed; `middleware.ts` is deprecated in favor of `proxy.ts` (already established in Phase 1 research — carries forward to Phase 2's Studio routes, which need the same auth-gating proxy). Server Actions guide (`node_modules/next/dist/docs/01-app/02-guides/server-actions.md`) was read directly for this research (see Architecture Patterns).
- **Language directive (CLAUDE.md):** All conversation with the user must be in Korean. Does not affect code/RESEARCH.md content directly, but UI copy (button labels, error messages, template display) for this phase should default to Korean, consistent with the existing seed templates and D-04's Korean genre list.
- No other actionable CLAUDE.md directives (no forbidden patterns, testing mandates, or security requirements beyond what's already in Phase 1 research).

## Standard Stack

### Core
| Library | Version (verified) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@dnd-kit/core` | 6.3.1 (npm, current) | Drag-and-drop primitives | Purpose-built for the D-17 chapter reorder list; peerDeps `react >=16.8.0` / `react-dom >=16.8.0` — confirmed compatible with installed React 19.2.8 |
| `@dnd-kit/sortable` | 10.0.0 (npm, current) | Sortable-list preset (`useSortable`, `SortableContext`, `arrayMove`) on top of `@dnd-kit/core` | The standard 2026 sortable-list pattern for React; supersedes the now-unmaintained `react-beautiful-dnd` |
| `@dnd-kit/utilities` | 3.2.2 (npm, current) | `CSS.Transform.toString` helper for drag-transform styling | Companion package, always installed alongside sortable |
| `zod` | 4.4.3 (npm, current — same as Phase 1) | Server Action input validation (work title, chapter title, price tier enum, genre enum, node names) | Continuity with Phase 1's stack; Next.js's own Server Actions guide treats untrusted `FormData` validation as mandatory |
| `next` / `react` / `react-dom` | 16.3.2 / 19.2.8 / 19.2.8 (installed) | Framework | Locked by existing scaffold; Phase 2 adds no framework-level dependency |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `nanoid` | 6.0.1 (npm, current) | Short collision-resistant IDs where a UUID is overkill (e.g., client-optimistic temp keys for the tree before server round-trip) | Optional — only if optimistic UI insertion is implemented for tree create; `crypto.randomUUID()` (built into Node 22 / browsers) is sufficient otherwise and requires no dependency |
| `react-textarea-autosize` | 8.5.9 (npm, current) | Auto-growing `<textarea>` for the KB doc editor (D-12) and chapter body editor (D-19) | Optional UX polish only — a plain native `<textarea>` with CSS `resize: vertical` fully satisfies D-12/D-19's "single textarea" requirement without this dependency; recommend deferring unless auto-grow is explicitly wanted, to keep the editor genuinely simple per D-19's stated rationale |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom recursive tree component | `react-arborist` (3.16.0, peerDeps `react >=16.14`) | Ships virtualization, built-in drag-and-drop, and keyboard nav out of the box — attractive if the tree grows to hundreds of nodes per work. But its drag-and-drop is opt-in and would need to be explicitly disabled/ignored to respect D-16 (no file-tree move in Phase 2), and its API (a `Tree` component expecting a specific node-data shape + imperative ref API) adds a real integration surface for a feature (virtualized rendering) unlikely to matter at Phase-2 scale (a single work's KB tree, realistically dozens of docs, not thousands). Recommended only if user testing later reveals real trees exceeding ~200+ nodes causing render lag. |
| Custom recursive tree component | `react-complex-tree` (2.6.4, peerDeps `react >=16.0.0`) | Similar tradeoff to react-arborist — full accessibility (ARIA treeview) and multi-select built in, but its "environment"/"provider" abstraction and item-data-provider pattern is heavier than needed for create/rename/delete-only interactions. A custom component keeps the fixed-6-folder lock-down logic (D-15) simpler to express directly in app code rather than fighting a library's generic "any node can be any shape" model. |
| Adjacency-list + id-based materialized path | Postgres `ltree` extension | `ltree` gives fast subtree queries via GiST/B-tree indexes and pattern matching (`*.Texas.*`), but requires path segments to be label-safe (ltree labels can't contain arbitrary Unicode/spaces without encoding tricks — Korean folder/document names and spaces would need slugification or numeric-id-only labels), and mutating an `ltree` path on rename/move requires care. Since Phase 2 explicitly has no move (D-16) and category-scoped queries (list all 인물 docs) don't need arbitrary-depth pattern matching — they need "all descendants of this one fixed category folder" — a simple denormalized `category` column on every node answers that query directly with a flat `WHERE category = '인물' AND work_id = ?`, without needing `ltree` at all. |
| Fixed integer `order_index` + full resequence on reorder | Fractional/"LexoRank"-style order keys (float or string) | Fractional keys avoid rewriting every row on a single reorder, which matters at very large list sizes or high write concurrency. A single writer's chapter list (realistically tens to low hundreds of chapters) makes a full-resequence transaction (`UPDATE chapters SET order_index = x WHERE id = y`, batched) trivially cheap and avoids float-precision-exhaustion edge cases (repeated inserts between the same two neighbors eventually needs a rebalance pass anyway with fractional keys). Recommended: integer resequence, revisit only if profiling shows it's a bottleneck. |

**Installation:**
```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities zod
```

**Version verification:** All versions checked against the npm registry on 2026-08-25 via `npm view <pkg> version`. `zod@4.4.3` matches the version already verified in Phase 1 research (same date) — no drift. `@dnd-kit/*` packages are pinned to their current major (dnd-kit core 6.x, sortable 10.x) as of this research; re-check before implementation if this research goes stale beyond ~30 days, as dnd-kit ships frequent minor releases.

## Architecture Patterns

### Recommended Project Structure
```
app/
├── studio/
│   ├── layout.tsx                    # writer-role gate (redirect non-writers), Studio shell
│   ├── page.tsx                      # 작품 목록 (work list) — D-06
│   ├── works/
│   │   └── new/page.tsx              # 새 작품 만들기 form (title required; synopsis/cover/genre optional) — D-02/D-03
│   └── [workId]/
│       ├── layout.tsx                 # loads work + renders the tree sidebar (merges account `template/` root + this work's node tree)
│       ├── page.tsx                   # work home / default view
│       ├── kb/
│       │   └── [nodeId]/page.tsx      # KB document editor (single textarea, D-12) or folder listing
│       └── chapters/
│           ├── page.tsx               # 회차 list (drag-reorder, D-17)
│           ├── new/page.tsx           # new chapter draft form
│           └── [chapterId]/page.tsx   # chapter editor (plain textarea, D-19) + publish/unpublish controls
lib/
├── kb/
│   ├── tree.ts                        # tree-shaping helpers: flat rows -> nested structure for rendering
│   ├── templates.ts                   # seed-template loader + `<% tp.file.title %>` substitution
│   └── actions.ts                     # Server Actions: createNode, renameNode, deleteNode, saveNodeContent
├── chapters/
│   └── actions.ts                     # Server Actions: createChapter, saveChapterContent, publishChapter, unpublishChapter, reorderChapters
supabase/
├── migrations/
│   ├── ..._works.sql
│   ├── ..._kb_nodes.sql
│   └── ..._chapters.sql
seed-templates/                         # NOT docs/Template/ itself — Phase 2 should copy or read directly from docs/Template/*.md as the canonical source (see Pattern: Template Substitution)
```

### Pattern 1: Template substitution is plain string replacement, not YAML parsing
**What:** All five seed files use exactly one Templater placeholder, `<% tp.file.title %>`, appearing multiple times per file (verified by reading all 5 files directly — see below). At KB-document-creation time, read the matching template file's raw text and do a global string replace of the literal placeholder with the writer-supplied title. No YAML frontmatter parsing/library (e.g. `gray-matter`) is needed for this substitution — the frontmatter block is just more text in the same string, and D-12 already treats the whole file as one opaque textarea value.
**Verified placeholder occurrences (read directly from `docs/Template/*.md`):**
| Template | Placeholder occurrences |
|----------|--------------------------|
| 인물 템플릿.md | `# 👤 <% tp.file.title %>` (H1) and `**이름**: <% tp.file.title %>` (body) — 2 occurrences |
| 장소 템플릿.md | `# 🗺️ <% tp.file.title %>` — 1 occurrence |
| 사건 템플릿.md | none — no `<% tp.file.title %>` in this file (starts directly at `## 📌 사건 개요`, no H1 title line) |
| 세력 템플릿.md | `# 🛡️ <% tp.file.title %>` — 1 occurrence |
| 아이템 템플릿.md | `# ⚔️ <% tp.file.title %>` — 1 occurrence |
**Important correction to plan around:** 사건 (event) template has NO `<% tp.file.title %>` placeholder at all — it has no H1 heading line, unlike the other four. Substitution logic must not assume every template has a title placeholder to replace; a naive "replace and if zero replacements occurred, warn" check would false-positive on 사건 specifically. Recommend: substitution is a no-op-safe global regex replace (`content.replaceAll(/<%\s*tp\.file\.title\s*%>/g, title)`) that silently does nothing when no match exists — do not treat zero matches as an error.
**Also present in all 5 templates:** `[[wiki-link]]` bracket syntax and Markdown checkbox syntax (`- [ ]`) as literal example content — per D-13, these render as inert plain text (no special handling needed; they're just characters in the textarea value).
**Example:**
```ts
// lib/kb/templates.ts
const TEMPLATE_FILES: Record<KbCategory, string> = {
  '인물': '인물 템플릿.md',
  '장소': '장소 템플릿.md',
  '사건': '사건 템플릿.md',
  '세력': '세력 템플릿.md',
  '아이템': '아이템 템플릿.md',
}

export async function buildSeedContent(category: KbCategory, title: string): Promise<string> {
  const raw = await readTemplateSource(category) // read from account-level template node if customized (D-10/D-11), else fall back to docs/Template/*.md seed
  return raw.replaceAll(/<%\s*tp\.file\.title\s*%>/g, title)
}
```
**Confidence:** HIGH (direct file read of all 5 canonical templates, exact occurrence count verified).

### Pattern 2: `kb_nodes` — adjacency-list tree with denormalized ownership/category for trivial RLS
**What:** One table models both the account-level template tree and every work's KB/회차-adjacent doc tree (회차/chapters is modeled separately, see Pattern 4, because it needs `order_index` + publish state that don't apply to KB docs).
```sql
-- Source: synthesized from materialized-path/adjacency-list tree-modeling writeups (sqlfordevs.com, leonardqmarcq.com, cybertec-postgresql.com) — MEDIUM confidence, cross-verified pattern
create table kb_nodes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id),      -- denormalized on every row: the writer who owns this node (always == the work's owner for work-scoped nodes)
  work_id uuid references works(id),                    -- NULL only for scope='account_template'; NOT NULL for scope='work'
  scope text not null check (scope in ('account_template','work')),
  parent_id uuid references kb_nodes(id),                -- NULL for the 6 fixed top-level folders (and the account-level template root)
  node_type text not null check (node_type in ('folder','file')),
  category text not null check (category in ('template','인물','장소','사건','세력','아이템')),
                                                          -- denormalized DOWN from the top-level folder to every descendant at insert time
                                                          -- (a nested subfolder under 인물/ still carries category='인물')
  is_locked boolean not null default false,              -- true only for the 6 fixed structural folders (D-15) — blocks rename/delete at the app + can be enforced with a check constraint on update
  name text not null,
  content text,                                          -- markdown/frontmatter text for files; NULL for folders
  ancestor_ids uuid[] not null default '{}',             -- id-based materialized path (excludes self), e.g. {root_id, parent_id} — cheap "is X an ancestor of Y" and breadcrumb queries without recursion
  depth integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index kb_nodes_work_category_idx on kb_nodes (work_id, category) where deleted_at is null;
create index kb_nodes_parent_idx on kb_nodes (parent_id) where deleted_at is null;
create index kb_nodes_owner_scope_idx on kb_nodes (owner_id, scope) where deleted_at is null;

-- RLS: ownership is a direct column check, never a recursive path walk
alter table kb_nodes enable row level security;
create policy "owner can manage own kb_nodes"
  on kb_nodes for all
  using (owner_id = auth.uid() and deleted_at is null)
  with check (owner_id = auth.uid());
```
**Why denormalize `category` and `ancestor_ids` instead of computing them via recursive CTE on every read:** The phase's core query patterns are "list all 인물 docs in work X" (flat filter, no recursion) and "render the nested tree under 인물/ for work X" (needs children-of-children, but bounded to one category subtree at a time, not the whole work). A recursive CTE would work but is unnecessary complexity for RLS in particular — Postgres RLS policies that need to evaluate a recursive query on every row-access check are a well-known performance foot-gun; a flat column comparison is not. Since D-16 rules out move in Phase 2, `ancestor_ids` and `category` never need to be rewritten after insert — they're write-once, which is exactly the case materialized-path critiques warn is fine ("your tree rarely changes... source of truth is external / read-mostly").
**Enforcing the 6 fixed folders (D-15):** Seed them once per work (and once per account, for the template root) at work-creation time / writer-conversion time via a Server Action, with `is_locked = true`, `parent_id = null`. Rename/delete Server Actions must check `is_locked = false` before proceeding (return a friendly error otherwise) — this is an app-level check, but can be backed by a DB check constraint or trigger (`raise exception` if `is_locked` and an UPDATE changes `name` or the row is deleted) for defense-in-depth, since Server Actions are POST endpoints reachable outside the UI (per Next.js's own Server Actions security guidance — see Common Pitfalls).
**Confidence:** MEDIUM — the overall pattern (adjacency list + denormalized ownership for RLS) is a well-established Postgres/Supabase community pattern, but no single official Supabase guide covers this exact "two-tier template scope + fixed-folder-lock" shape; this is synthesized for this specific requirement set.

### Pattern 3: Work-level template resolution order (account vs. work-local)
**What:** When creating a new KB document in category X, the "seed content" to use is: (1) if a work-local custom template exists at `{work}/docs/template/` for category X, use it; else (2) if an account-level custom template exists at `template/` for category X, use it; else (3) fall back to the canonical `docs/Template/*.md` file (Pattern 1). This resolution order directly reflects D-09's scoping (work-level is "usable only within that specific work," implying it should take precedence when present) and D-10's "custom-template creation... at both tiers."
**When to use:** Every "새 문서 만들기" action inside a category folder.
**Confidence:** MEDIUM — this precedence order is not explicitly stated in CONTEXT.md D-09/D-10, but is the only resolution order consistent with both decisions; flagged as an Open Question below for planner/user confirmation if ambiguity matters.

### Pattern 4: `chapters` table — separate from `kb_nodes`, with integer order + resequence-on-reorder
**What:**
```sql
create table chapters (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references works(id),
  title text not null,
  content text not null default '',              -- plain text, D-19 — no markdown rendering applied on read
  order_index integer not null,
  is_published boolean not null default false,
  price_tier integer,                             -- NULL = free; non-null = one of the fixed tiers (Pattern 5)
  published_at timestamptz,
  unpublished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index chapters_work_order_idx on chapters (work_id, order_index) where deleted_at is null;

alter table chapters enable row level security;
create policy "owner can manage own chapters"
  on chapters for all
  using (work_id in (select id from works where owner_id = auth.uid() and deleted_at is null))
  with check (work_id in (select id from works where owner_id = auth.uid()));
```
**Reorder pattern (D-17):** On drag-end, the client computes the new full ordering of chapter IDs (via `@dnd-kit/sortable`'s `arrayMove`) and sends the complete ordered ID list to a single Server Action, which resequences `order_index` for all of the work's chapters in one transaction (e.g., `UPDATE chapters SET order_index = v.idx FROM (VALUES (id1,0),(id2,1),...) AS v(id,idx) WHERE chapters.id = v.id`). This avoids partial-failure states (only some rows updated) and sidesteps unique-constraint violations mid-resequence — use `SET CONSTRAINTS chapters_work_order_idx DEFERRABLE INITIALLY DEFERRED` or drop the unique constraint to `DEFERRABLE` so intermediate duplicate order values within the same transaction don't fail before the final state is reached.
**Why `chapters` is a separate table from `kb_nodes` rather than `node_type = 'chapter'`:** Chapters need `order_index`, `is_published`, `price_tier`, and publish/unpublish timestamps that have no analog for KB docs/folders; forcing them into the same polymorphic table would mean most `kb_nodes` columns are null for chapter rows and vice versa, and RLS/query logic for "published chapters visible to readers" (Phase 3) is cleaner against a dedicated table. The 회차/ folder shown in the Studio tree (D-14) is a UI-level grouping, not evidence that chapters must live in the same DB table as KB nodes.
**Confidence:** MEDIUM-HIGH — the separate-table reasoning is a standard schema-design judgment call (HIGH confidence in the reasoning itself); the specific deferred-constraint resequencing technique is a well-known Postgres pattern (MEDIUM-HIGH, standard technique, not project-specific).

### Pattern 5: Fixed price tiers — token values and free/paid toggle
**What:** `price_tier` is an integer column constrained to a fixed set via `CHECK (price_tier is null or price_tier in (10, 30, 50, 100))`, selected via a `<select>` dropdown, never freeform numeric input (D-20). `is_published` and `price_tier` are independent: a chapter can be `is_published = true, price_tier = null` (free) or `is_published = true, price_tier = 30` (paid).
**Tier values, informed by research:** Direct research into Korean web-novel platform per-episode pricing (see State of the Art) shows this project's fake/mock "token" unit does not map to a fixed KRW conversion decided anywhere in CONTEXT.md or PROJECT.md — Phase 1's wallet ledger uses an abstract token unit (admin-grant credits), not real currency. Given that, the concrete tier values are a UX/pricing-policy choice, not a technically-researched fact — CONTEXT.md's own D-20 example (`10/30/50/100`) is a reasonable set (an ascending scale giving writers 4 meaningfully different price points) and is adopted here as the recommendation, with the added convention (cross-verified against real Korean platforms) that most individual episodes cluster at the LOWEST tier, with higher tiers reserved for longer/bonus chapters — i.e., the UI should default the price-tier dropdown to the lowest paid tier (10) rather than the highest, to match observed platform norms.
**Confidence:** MEDIUM — the tier value set itself is a policy/UX choice (not verifiable as "correct"), but the "most episodes priced at the entry tier" convention is cross-verified across 2 independent Korean platforms (see State of the Art).

### Anti-Patterns to Avoid
- **Introducing a rich-text/markdown editor library for the KB or chapter editor:** D-12 and D-19 both explicitly want a plain textarea. Adding Tiptap/CodeMirror/Monaco now works against the phase's own design intent (keep the editor simple ahead of Phase 4's AI panel) and adds migration risk when Phase 4 does modify this editor.
- **Recursive CTE inside an RLS `USING` clause:** evaluated per-row on every access check; use the denormalized `owner_id`/`work_id` columns (Pattern 2) instead.
- **Read-modify-write for chapter reorder (fetch full list client-side, mutate, `UPDATE` one row at a time from separate round trips):** race-prone if two tabs reorder concurrently; do the full resequence server-side in one transaction (Pattern 4).
- **Treating the 사건 template's missing title placeholder as a bug to "fix" by adding an H1 line not in the original file:** D-08 requires using the seed files verbatim; the missing placeholder in 사건 템플릿.md is the source-of-truth content, not an oversight to correct.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Drag-to-reorder chapter list | Custom `mousedown`/`mousemove`/`mouseup` position-tracking + custom keyboard accessibility | `@dnd-kit/sortable` (`useSortable`, `SortableContext`, `arrayMove`) | dnd-kit already handles pointer + keyboard + touch sensors, ARIA live-region announcements for screen readers, and auto-scroll; hand-rolled DnD reliably ships without keyboard/a11y support and has subtle pointer-capture bugs |
| Tree-ownership / RLS authorization for nested nodes | App-level recursive "walk up to root, check owner" logic on every request | Denormalized `owner_id`/`work_id` column + flat RLS policy (Pattern 2) | Avoids N recursive lookups per request and keeps the DB (not app code) as the enforced authorization boundary, consistent with Next.js's own guidance to never treat render-time gating as a security boundary |
| Pen-name-style uniqueness checks (not literally needed here, but the same principle applies to work titles if ever made unique) | App-level "check then insert" | DB unique constraint / index | Carried forward from Phase 1 research — same TOCTOU-race argument applies to any future uniqueness requirement in this phase's tables |
| Concurrent chapter-order resequencing | Optimistic client-side reorder with no server transaction | Single Server Action, single transaction, deferred unique constraint (Pattern 4) | Prevents partial/duplicate order states under concurrent edits (e.g. two browser tabs) |

**Key insight:** Every "don't hand-roll" item here is really the same principle from Phase 1's research restated for tree/list data instead of wallet balances: push correctness-critical invariants (ownership, ordering uniqueness) into the database's transactional/constraint machinery rather than application-level sequential logic, because application-level checks are inherently racy under concurrency and are not a security boundary against direct Server Action calls.

## Common Pitfalls

### Pitfall 1: Server Actions are public POST endpoints — tree/chapter mutations need explicit ownership checks, not just UI gating
**What goes wrong:** A `deleteNode(nodeId)` or `renameNode(nodeId, name)` Server Action that only checks "is the current user logged in" (not "does this user own the work/node") is exploitable by any authenticated user who guesses/enumerates another writer's node ID, because Server Actions are reachable via direct POST regardless of which page rendered the trigger button.
**Why it happens:** It's easy to assume "the button only appears on the writer's own Studio page" is sufficient protection; Next.js's own Server Actions guide explicitly warns against this ("render-time gating... is not a security boundary").
**How to avoid:** Every mutating Server Action for `kb_nodes` and `chapters` must re-derive ownership from the session and re-query with an ownership filter (`WHERE id = $1 AND owner_id = $2`), exactly mirroring the `completeItem` safe-pattern example in the official Next.js docs (read directly from `node_modules/next/dist/docs/01-app/02-guides/server-actions.md` for this research). RLS (Pattern 2/4) provides a second layer of defense at the DB level even if application code has a bug.
**Warning signs:** A code review where a Server Action takes an ID as its only identifying parameter and passes it straight to an `UPDATE`/`DELETE` without a `WHERE owner_id = ...` clause or an RLS-enforcing client.
**Confidence:** HIGH (direct quote/pattern from the installed Next.js 16 docs, not inferred).

### Pitfall 2: Locked folders (D-15) need enforcement at both the UI and the mutation layer
**What goes wrong:** If "cannot rename/delete" for the 6 fixed folders is only enforced by hiding the rename/delete buttons in the tree UI, a direct Server Action call (or a future bug that shows the button conditionally wrong) can still rename/delete a structural folder, silently breaking the fixed-skeleton invariant the rest of the phase's category-based queries depend on (`kb_nodes.category` denormalization assumes the top-level folder for each category always exists and is never renamed).
**How to avoid:** Enforce `is_locked` in the Server Action (reject if `is_locked = true`) in addition to hiding UI affordances; consider a DB trigger that raises on UPDATE/DELETE of a locked row as defense-in-depth, matching the RLS-as-second-layer philosophy established in Phase 1's research.
**Warning signs:** A structural folder (e.g. `인물/`) missing or renamed for one work, breaking that work's category-scoped queries/tree rendering.

### Pitfall 3: `사건` (event) template has no title placeholder — a naive substitution-count check will misfire
**What goes wrong:** If template-substitution code asserts "at least one `<% tp.file.title %>` replacement must have occurred, else throw an error" (a reasonable-sounding sanity check), it will incorrectly fail every time a writer creates a 사건 document, because that specific template has zero occurrences of the placeholder by design (see Pattern 1's verified table).
**How to avoid:** Do not add a "must replace at least once" assertion; a global regex replace that matches zero times is a valid, expected outcome for this one template.
**Warning signs:** New 사건 documents fail to create, or throw an unexpected error, while the other 4 categories work fine.
**Confidence:** HIGH (verified directly from all 5 template files).

### Pitfall 4: Deferrable unique constraint needed for order_index resequencing, or the whole reorder transaction fails mid-way
**What goes wrong:** A naive `UNIQUE (work_id, order_index)` constraint (checked immediately, the Postgres default) will reject an UPDATE statement that temporarily assigns an order value already held by another row within the same batch/transaction, even though the final state after all updates in the transaction is conflict-free.
**How to avoid:** Declare the constraint `DEFERRABLE INITIALLY DEFERRED` so uniqueness is checked at transaction commit, not per-statement, OR perform the resequence with a two-phase update (first shift all affected rows to negative/out-of-range temporary values, then to final values) if deferrable constraints are undesired for other reasons.
**Warning signs:** Chapter reorder works for some drag operations but throws a unique-violation error for others, seemingly at random depending on drag direction/distance.
**Confidence:** MEDIUM-HIGH — standard Postgres technique, not project-specific, but must be explicitly included in the migration (easy to omit and only discover the bug when a specific reorder sequence is attempted).

## Code Examples

### Chapter drag-reorder with @dnd-kit/sortable
```tsx
// Source: @dnd-kit official sortable pattern (dndkit.com/react/presets/sortable), adapted — MEDIUM confidence (docs fetch for exact current example returned 404 at research time; pattern below reflects the stable, long-documented dnd-kit sortable API shape, cross-checked against npm package version 10.0.0's exported hooks)
'use client'
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

function ChapterRow({ id, title }: { id: string; title: string }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <li ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {title}
    </li>
  )
}

export function ChapterList({ chapters }: { chapters: { id: string; title: string }[] }) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const [items, setItems] = useState(chapters)

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={({ active, over }) => {
        if (!over || active.id === over.id) return
        const oldIndex = items.findIndex((c) => c.id === active.id)
        const newIndex = items.findIndex((c) => c.id === over.id)
        const reordered = arrayMove(items, oldIndex, newIndex)
        setItems(reordered)
        reorderChaptersAction(reordered.map((c) => c.id)) // Server Action, resequences order_index server-side (Pattern 4)
      }}
    >
      <SortableContext items={items.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <ul>{items.map((c) => <ChapterRow key={c.id} id={c.id} title={c.title} />)}</ul>
      </SortableContext>
    </DndContext>
  )
}
```

### Recursive tree rendering (custom component, no library)
```tsx
// Source: standard React recursive-component pattern applied to the kb_nodes shape (Pattern 2) — HIGH confidence (no external API to verify against, purely compositional React)
type TreeNode = { id: string; name: string; node_type: 'folder' | 'file'; is_locked: boolean; children: TreeNode[] }

function buildTree(flatNodes: KbNodeRow[]): TreeNode[] {
  const byId = new Map(flatNodes.map((n) => [n.id, { ...n, children: [] as TreeNode[] }]))
  const roots: TreeNode[] = []
  for (const node of byId.values()) {
    if (node.parent_id && byId.has(node.parent_id)) {
      byId.get(node.parent_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

function TreeItem({ node }: { node: TreeNode }) {
  return (
    <li>
      <span>{node.node_type === 'folder' ? '📁' : '📄'} {node.name}</span>
      {node.children.length > 0 && (
        <ul>{node.children.map((child) => <TreeItem key={child.id} node={child} />)}</ul>
      )}
    </li>
  )
}
```

## State of the Art

| Convention | Detail | Source confidence |
|------------|--------|--------------------|
| Korean web-novel per-episode paid pricing | 노벨피아: 1 coin = 100원, most episodes priced at 1 coin (100원); 조아라: "프리미엄" episodes commonly 100원/화; 카카오페이지: cash-based, 1000 cash ≈ 1200원 charge ratio, individual episode prices vary but promotional/free-ticket amounts commonly cluster at 100-300 cash | MEDIUM — cross-verified across 3 independent platforms via WebSearch, no single official pricing-policy page cited, treat as convention not requirement |
| Korean web-novel genre taxonomy | Common fixed genre sets across platforms: 로맨스, 로맨스판타지, 판타지, 현대판타지, 무협, 미스터리/스릴러, 라이트노벨, SF, 드라마/일반 — CONTEXT.md D-04 already specifies 로맨스/판타지/무협/현대판타지 as examples | MEDIUM — this is well-established platform convention (training-data knowledge), not independently re-verified via fresh search this session since D-04 already anchors the direction; recommend the planner finalize the exact list (Claude's discretion per D-04) |
| DnD library ecosystem | `react-beautiful-dnd` (formerly the default choice) is unmaintained; `@dnd-kit` is the current (2026) standard for React sortable lists, cited across multiple current tutorials/comparisons | MEDIUM — consistent WebSearch cross-verification, no single "official" React DnD recommendation exists since DnD isn't part of React core |

**Deprecated/outdated:**
- `react-beautiful-dnd`: unmaintained, do not introduce for the chapter reorder feature even though older tutorials/training data may reference it.
- `middleware.ts`: deprecated in Next.js 16 (carried forward from Phase 1 research) — any Studio-specific route protection (e.g., writer-role gate) must live in `proxy.ts` or in a layout-level server check, not a `middleware.ts` file.

## Open Questions

1. **Work-level vs. account-level template precedence when both exist for the same category**
   - What we know: D-09 establishes both tiers exist and D-10 allows customization at both; Pattern 3 proposes work-level-wins-over-account-level as the only order consistent with both decisions.
   - What's unclear: CONTEXT.md doesn't explicitly state the precedence order for the case where a writer has customized the SAME category (e.g., 인물) at both the account level and a specific work's local level.
   - Recommendation: Adopt Pattern 3's precedence (work-local > account-level > canonical seed file) at planning time; flag this as a one-line confirmation with the user if the planner wants certainty before implementation, but it is a low-risk default since it matches the natural "more specific scope wins" convention.

2. **Genre list — exact fixed values**
   - What we know: D-04 gives 4 example genres (로맨스/판타지/무협/현대판타지) and explicitly leaves the concrete list to Claude's discretion.
   - What's unclear: Whether the planner should ship exactly those 4, or expand to a more complete platform-standard list (e.g., adding 로맨스판타지, 미스터리, SF, 라이트노벨).
   - Recommendation: Ship a list of 6-8 genres covering the platform-standard categories identified in State of the Art (로맨스, 로맨스판타지, 판타지, 현대판타지, 무협, 미스터리/스릴러, 라이트노벨, 기타) as a `CHECK` constraint or small lookup table — a lookup table is preferable to a `CHECK` constraint if the list is expected to grow post-launch (adding a row vs. an `ALTER TABLE`).

3. **Should `kb_nodes.name` collisions within the same parent be blocked?**
   - What we know: CONTEXT.md marks "filename-collision validation on folder/file create/rename" as Claude's discretion, without a decision.
   - What's unclear: Whether two sibling files/folders with the identical name under the same parent should be allowed (most filesystems/IDEs disallow this).
   - Recommendation: Add a partial unique index (`UNIQUE (parent_id, name) WHERE deleted_at IS NULL`) matching standard filesystem/IDE UX expectations — reject with a friendly "이미 같은 이름의 파일/폴더가 있습니다" error on violation. This is a minor addition the planner should make explicit as a task, not leave implicit.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker | Local Supabase dev stack | ✗ | — | Use the same hosted Supabase project established in Phase 1 (inherited, not re-created) |
| Supabase CLI | Local migrations tooling | ✗ | — | Write/run SQL migrations via Supabase Dashboard SQL editor, same as Phase 1's fallback |
| psql | Manual DB inspection | ✗ | — | Supabase Dashboard SQL editor |
| Node.js | Everything | ✓ | v22.14.0 | — |
| npm | Package management | ✓ | 10.9.2 | — |
| Phase 1's `profiles`/`works`-adjacent auth infra | Writer-role gate on `/studio`, `owner_id` foreign keys | ✗ (Phase 1 not yet executed at research time) | — | Phase 2 execution must be sequenced strictly after Phase 1 lands; no code-level fallback exists for "no auth system yet" — this is a hard phase-ordering dependency, not a substitutable tool |

**Missing dependencies with no fallback:**
- Phase 1's auth/profiles/wallet foundation must exist before Phase 2 code can be meaningfully written or tested (writer-role gate, `owner_id` FK target) — this is expected sequencing per the roadmap, not a gap to solve within Phase 2 itself.

**Missing dependencies with fallback:**
- Docker/Supabase CLI/psql → hosted Supabase project + Dashboard SQL editor (same as Phase 1).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (installed as part of Phase 1's Wave 0 — reuse, do not reinstall) |
| Config file | `vitest.config.ts` (created in Phase 1 Wave 0) |
| Quick run command | `npx vitest run tests/kb/` or `tests/chapters/` (scoped to touched files) |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| KB-01 | Writer can create a KB doc in each of the 5 categories, seeded from the correct template with title substituted; can edit content; can delete (soft) | integration (real Postgres via Supabase test project; exercises `buildSeedContent` + `kb_nodes` CRUD Server Actions) | `npx vitest run tests/kb/document-crud.test.ts` | ❌ Wave 0 |
| KB-01 | Substitution correctly handles the 사건 template's absent placeholder (Pitfall 3) without erroring | unit (pure function test on `buildSeedContent`, no DB needed) | `npx vitest run tests/kb/template-substitution.test.ts` | ❌ Wave 0 |
| KB-02 | Tree query returns correct nested structure per category, scoped to one work; account-level `template/` root is merged in for the studio view of any of that owner's works | integration (real Postgres, exercises `kb_nodes` RLS + tree-building query) | `npx vitest run tests/kb/tree-query.test.ts` | ❌ Wave 0 |
| KB-02 | Locked folders (D-15) reject rename/delete Server Action calls even when called directly (not just hidden in UI) | integration (calls the Server Action function directly with a locked node ID, asserts rejection) | `npx vitest run tests/kb/locked-folder-guard.test.ts` | ❌ Wave 0 |
| CONT-01 | Chapter draft create/save persists title + content + default order | integration | `npx vitest run tests/chapters/draft.test.ts` | ❌ Wave 0 |
| CONT-01 | Reorder via full ID list resequences `order_index` correctly under a deferred unique constraint, including a case that would violate the constraint mid-transaction without deferral | integration (real Postgres — this specifically proves Pitfall 4 is handled) | `npx vitest run tests/chapters/reorder.test.ts` | ❌ Wave 0 |
| CONT-02 | Publish sets `is_published = true` + valid `price_tier` (free = null, paid = one of the fixed set); rejects an out-of-set price_tier value at the DB constraint level | integration | `npx vitest run tests/chapters/publish.test.ts` | ❌ Wave 0 |
| CONT-03 | Editing a published chapter's content updates immediately without requiring unpublish first (D-21); unpublish is a distinct action that doesn't alter content (D-22) | integration | `npx vitest run tests/chapters/edit-unpublish.test.ts` | ❌ Wave 0 |
| CONT-03 / general | Ownership check: a Server Action call for another writer's node/chapter is rejected (Pitfall 1) | integration (two seeded writer accounts, cross-ownership attempt) | `npx vitest run tests/security/ownership-guard.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** run the specific test file(s) touched by that task.
- **Per wave merge:** `npx vitest run` (full suite, including Phase 1's carried-forward auth/wallet tests to catch regressions).
- **Phase gate:** Full suite green, plus at least one manual QA pass through the actual Studio UI (tree create/rename/delete, KB doc create-from-template, chapter draft → publish → edit → unpublish) before `/gsd:verify-work`, since some interaction affordances (drag-and-drop feel, locked-folder visual cues) aren't meaningfully covered by integration tests alone.

### Wave 0 Gaps
- [ ] `tests/kb/document-crud.test.ts`, `template-substitution.test.ts`, `tree-query.test.ts`, `locked-folder-guard.test.ts`
- [ ] `tests/chapters/draft.test.ts`, `reorder.test.ts`, `publish.test.ts`, `edit-unpublish.test.ts`
- [ ] `tests/security/ownership-guard.test.ts`
- [ ] `supabase/migrations/..._works.sql`, `..._kb_nodes.sql`, `..._chapters.sql` (including the deferred unique constraint from Pitfall 4 and the partial unique index from Open Question 3)
- [ ] A seed/fixture helper that provisions the 6 fixed structural folders (account-level `template/` + per-work `docs/template/`, `인물/`, `장소/`, `사건/`, `세력/`, `아이템/`, `회차/`) for test setup, mirroring the real work-creation Server Action so tests don't diverge from production seeding logic
- [ ] Install `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` (not yet in `package.json`)

## Sources

### Primary (HIGH confidence)
- `docs/Template/인물 템플릿.md`, `장소 템플릿.md`, `사건 템플릿.md`, `세력 템플릿.md`, `아이템 템플릿.md` — read directly and in full for this research; exact placeholder-occurrence table in Pattern 1 is derived from these reads.
- `node_modules/next/dist/docs/01-app/02-guides/server-actions.md` (installed Next.js 16.3.2 in this repo) — Server Actions security model, ownership-check pattern, sequential-dispatch behavior.
- npm registry (`npm view <pkg> version/peerDependencies`, checked 2026-08-25) — `@dnd-kit/core@6.3.1`, `@dnd-kit/sortable@10.0.0`, `@dnd-kit/utilities@3.2.2`, `react-arborist@3.16.0`, `react-complex-tree@2.6.4`, `@headless-tree/react@1.7.0`, `zod@4.4.3` (unchanged from Phase 1), `nanoid@6.0.1`, `slugify@1.6.9`, `gray-matter@4.0.3`, `react-textarea-autosize@8.5.9`.
- Direct machine probe (`command -v docker/supabase/psql`) — confirms no local Docker/Supabase CLI/psql, consistent with Phase 1's finding.
- `.planning/phases/01-foundation-wallet-infrastructure/01-RESEARCH.md`, `01-CONTEXT.md` — Supabase Auth/backend choice, soft-delete convention, `proxy.ts` pitfall, carried forward as constraints for this phase.

### Secondary (MEDIUM confidence)
- `sqlfordevs.com/tree-as-materialized-path`, `cybertec-postgresql.com/en/postgresql-ltree-vs-with-recursive`, `leonardqmarcq.com/posts/modeling-hierarchical-tree-data` and `.../dos-and-donts-of-modeling-hierarchical-trees-in-postgres` — materialized-path vs. ltree vs. recursive-CTE tradeoffs informing Pattern 2/the Alternatives Considered table.
- dndkit.com documentation site (sortable preset page returned 404 at fetch time; pattern used reflects the stable, long-documented API shape cross-checked against the installed package's version) — Code Examples section.
- WebSearch results on 노벨피아/조아라/카카오페이지 pricing conventions — State of the Art price-tier table.

### Tertiary (LOW confidence — flagged for validation)
- General "which React tree library is most popular in 2026" framing from WebSearch summaries (viprasol.com, joemore.com blog posts) — used only to corroborate that `@dnd-kit` is the current ecosystem default, not as the basis for any specific technical claim; the actual recommendation (custom tree component, no tree library) is a judgment call for this phase's narrow scope, not a claim about what's most popular.

## Metadata

**Confidence breakdown:**
- Standard stack (dnd-kit versions/peer-deps, Next.js Server Actions security model): HIGH — verified against live npm registry and the installed Next.js docs directly.
- Architecture (kb_nodes/chapters schema, template resolution precedence, reorder resequencing): MEDIUM — internally consistent and cross-verified against multiple independent Postgres tree-modeling sources, but synthesized for this project's specific two-tier-template + fixed-folder-lock requirements rather than copied from one canonical spec.
- Pitfalls (Server Action ownership checks, locked-folder enforcement, 사건-template placeholder gap, deferred unique constraint): HIGH for the Server Actions security pattern (direct docs quote) and the 사건-template gap (direct file read); MEDIUM-HIGH for the deferred-constraint technique (standard Postgres pattern).
- Korean price-tier/genre conventions: MEDIUM — cross-verified across multiple platforms via WebSearch, explicitly framed as convention informing a discretionary decision, not a hard technical requirement.

**Research date:** 2026-08-25
**Valid until:** ~2026-09-24 (30 days) for the schema/architecture content; re-check `@dnd-kit/*` package versions before implementation since the ecosystem ships frequent minor releases; the Korean platform pricing figures are informational/convention-only and don't need re-verification unless the planner treats them as more than a starting default.
