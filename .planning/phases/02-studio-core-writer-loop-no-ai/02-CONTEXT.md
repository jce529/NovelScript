# Phase 2: Studio Core (Writer Loop, No AI) - Context

**Gathered:** 2026-08-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Writers build a knowledge base (5 fixed template types: 인물/장소/사건/세력/아이템) and draft/publish chapters, entirely without AI involvement. Navigation is an IDE-style folder/file tree (a deliberate, founder-directed amendment to the original "flat list" / "no full IDE" scoping — see `<specifics>` and the REQUIREMENTS.md update noted below). No `@`-mention, no AI generation, no wiki-link resolution, no drag-and-drop file movement, and no graph view exist yet in this phase.

</domain>

<decisions>
## Implementation Decisions

### Work (작품) Structure
- **D-01:** A writer account can own multiple works (소설/작품) — not limited to one.
- **D-02:** Converting to writer role via "글쓰기 시작하기" does NOT auto-create a work. Creating a work is an explicit, separate flow ("새 작품 만들기").
- **D-03:** Work required field: title only. Optional fields: synopsis, cover image, genre/tag. If synopsis is left empty, the Phase 3 discovery feed shows an empty string/placeholder — never blocks work creation.
- **D-04:** Genre/tag is a single-select from a fixed genre list (not free-text tags) — matches web-novel platform conventions (로맨스/판타지/무협/현대판타지 등). Planner drafts the concrete list.
- **D-05:** KB documents belong to exactly one work — never shared/visible across works.
- **D-06:** Switching between a writer's multiple works happens on a dedicated "작품 목록" (work list) page — not a header dropdown.
- **D-07:** The work itself has no publish/unpublish state. It exists as soon as created; only individual chapters (not the work) have a publish state that controls reader visibility (READ requirements, Phase 3).

### Template System
- **D-08:** The 5 base templates use the ACTUAL seed files found at `docs/Template/*.md` verbatim as starting content for new KB documents — including their YAML frontmatter and heading structure. Obsidian Templater syntax (`<% tp.file.title %>`) is substituted with the real document title at creation time.
- **D-09:** Two-tier template scope:
  - **Account-level** shared templates, at the top-level `template/` folder — usable across all of this writer's works.
  - **Work-level** local templates, at `{work}/docs/template/` — usable only within that specific work.
- **D-10:** Phase 2 SCOPE EXPANSION (explicit founder decision): base-template editing AND custom-template creation are IN SCOPE for Phase 2, at both tiers (account-level and work-level). This goes beyond REQUIREMENTS.md KB-01's literal "5 templates" wording — see the REQUIREMENTS.md amendment noted in `<specifics>`.
- **D-11:** Editing/creating account-level templates affects only that writer's own account — never shared platform-wide across other writers' accounts.
- **D-12:** The KB document editor is a single markdown textarea covering the ENTIRE file content (frontmatter + body) — no separate structured-field form for frontmatter properties.
- **D-13:** `[[wiki-link]]` syntax that appears throughout the seed templates is left as inert plain text in Phase 2 — no click/navigate/graph-view behavior. Real wiki-linking is v2 (EDIT-06).

### Studio Navigation (File Tree)
- **D-14:** Studio is an IDE-style folder/file tree, not a flat list or tabs. Fixed top-level structure:
  ```
  template/                         (account-level shared templates)
  {work-name}/
    docs/
      template/                     (work-local templates)
      인물/ 장소/ 사건/ 세력/ 아이템/  (KB documents, developed from templates)
    회차/                            (chapter files — has order + publish state)
  ```
- **D-15:** The 6 structural folders (`template`, `인물`, `장소`, `사건`, `세력`, `아이템`) are fixed and cannot be deleted/renamed, but writers can freely create arbitrarily-nested subfolders and files inside them.
- **D-16:** Drag-and-drop file/folder MOVEMENT is explicitly OUT of Phase 2 scope (deferred to v2). Create / rename / delete are supported; moving between folders via drag is not.
- **D-17:** Chapter ORDER (within the 회차 folder specifically, not general file-tree movement) is reorderable via drag-and-drop — this is scoped narrowly to the chapter list's sequencing, distinct from D-16's file-tree-move exclusion.
- **D-18:** Studio is a route within the same app/domain (e.g. `/studio`), NOT a separate subdomain — contra docs/5-2's "별도 서브도메인" vision. Keeps session/token-balance sharing trivial; subdomain infra deferred indefinitely unless revisited.

### Chapter Editor & Publishing
- **D-19:** Chapter body editor is a plain text editor — no markdown rendering/formatting, line breaks only. Chosen because Phase 4 adds an AI panel alongside this same editor; keep the editor itself simple now.
- **D-20:** Publishing a chapter: free/paid toggle; if paid, price is chosen from a FIXED set of price tiers (dropdown), not freeform numeric input. Concrete tier values (e.g. 10/30/50/100 tokens) are Claude's call at planning time.
- **D-21:** Editing a published chapter's content saves and reflects immediately — no unpublish-then-edit requirement (matches standard web-novel platform UX, satisfies CONT-03's "edit... after publishing").
- **D-22:** Unpublishing is a distinct, explicit action separate from editing.

### Claude's Discretion
- Exact visual differentiation between account-level vs. work-level template folders in the tree UI.
- Confirmation dialogs / filename-collision validation on folder/file create/rename/delete.
- Concrete fixed price-tier token values (D-20).
- Concrete fixed genre list values (D-04).
- Whether/how the 6 structural folders visually signal their "cannot delete/rename" status.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### KB Document Templates (seed content — MANDATORY, use verbatim per D-08)
- `docs/Template/인물 템플릿.md` — Character template: frontmatter (tags, 배역, 나이) + headings (기본 정보/성격 및 배경/인물 및 세력 관계도/연관된 사건)
- `docs/Template/장소 템플릿.md` — Location template: frontmatter (tags, 통치세력) + headings (기본 정보/외형 및 묘사/획득 가능한 아이템/얽힌 서사)
- `docs/Template/사건 템플릿.md` — Event template: frontmatter (tags, 발생회차) + headings (사건 개요/얽힌 인물 및 사물/전개 타임라인/사건의 여파)
- `docs/Template/세력 템플릿.md` — Faction template: frontmatter (tags, 지도자) + headings (기본 정보/영토 및 자산/관계도 및 소속 인물/연관된 사건)
- `docs/Template/아이템 템플릿.md` — Item template: frontmatter (tags, 현재소유자) + headings (기본 정보/능력과 한계/소유자 및 서사 타임라인)

### Requirements / Scope
- `.planning/REQUIREMENTS.md` — KB-01, KB-02, CONT-01, CONT-02, CONT-03 (this phase's literal v1 requirements). **NOTE:** KB-02's "flat, filterable list" wording and the Out-of-Scope table's "3패널 풀 IDE (드래그앤드롭 파일트리...)" exclusion are being amended per D-14/D-15/D-16 in this same commit — see the diff on REQUIREMENTS.md for the precise carve-out (folder-tree navigation now in scope; drag-and-drop file movement, system-prompt modal, and graph view remain out of scope).
- `.planning/PROJECT.md` — Stack continuity (Next.js/React/Tailwind/Supabase), community-beta low-friction principle.

### Prior Phase (dependency)
- `.planning/phases/01-foundation-wallet-infrastructure/01-CONTEXT.md` — Dual-role account model (single account, writer-upgrade flow), soft-delete principle. Phase 2's writer-role gate and account model builds directly on this.
- `.planning/phases/01-foundation-wallet-infrastructure/01-RESEARCH.md` — Confirms Supabase Auth + Supabase/Postgres backend choice, Next.js 16 `proxy.ts` (not `middleware.ts`) pitfall, soft-delete pattern via `profiles.deleted_at`. Phase 2's data layer (works, KB documents, chapters) should follow the same Supabase/Postgres backend and RLS conventions established there.

### Background / Full-Vision Docs (reference only — most content is OUT of Phase 2 scope)
- `docs/2. 핵심 기능 요구사항.md` §2.1 — Origin of "템플릿 자유도 보장 + 커스텀 템플릿" concept (informs D-10). §2.2–2.5 (mention injection, AI chat, async filtering, BYOK) are Phase 4+/out-of-scope — do not implement.
- `docs/5-2 집필 공간 UI,UX 설계 및 명세.md` — Full-vision Studio/Web IDE design (3-panel canvas, `@`-mention, ghost text, AI co-worker panel, token gauge). Only the "작가 대시보드" work-list concept and general Studio framing are relevant to Phase 2; the 3-panel AI editor, analytics inspector, and token/cash-out menus are explicitly out of scope here.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None yet. Phase 1 has not been executed (only planned/researched) — repository is still the bare `create-next-app` scaffold (Next.js 16 / React 19 / Tailwind 4). Phase 2 planning should assume Phase 1's auth/account/Supabase setup exists by the time Phase 2 executes, but no code exists to read from yet.

### Established Patterns
- None yet — see Phase 1 research (`01-RESEARCH.md`) for the backend conventions (Supabase Auth, `proxy.ts` middleware rename, soft-delete via `deleted_at`) Phase 2 should follow once Phase 1 lands.

### Integration Points
- Studio (`/studio` route per D-18) will need to gate access on the writer-role flag established in Phase 1's account model.
- Wallet balance display (if any) in Studio nav is Phase 1's concern, not built here — Phase 2 has no token spending/display UI of its own.

</code_context>

<specifics>
## Specific Ideas

- The user explicitly directed that this phase reuse `docs/Template/*.md` verbatim as seed content for new KB documents — these are real Obsidian Templater files, not files this session should regenerate or approximate.
- **REQUIREMENTS.md amendment (founder decision, this session):** KB-02 ("flat, filterable list") and the Out-of-Scope row for "3패널 풀 IDE (드래그앤드롭 파일트리, 전용 시스템프롬프트 모달, KB 그래프 뷰)" are being updated in this same session to reflect that folder-tree navigation is now explicitly in scope for Phase 2, while drag-and-drop movement, the system-prompt modal, and the KB graph view remain out of scope. See the REQUIREMENTS.md diff.
- "IDE 환경처럼" was the user's own framing for the file tree — the intent is a lightweight, functional tree (create/rename/delete, arbitrary nested subfolders), not the fully-featured 3-panel IDE described in docs/5-2.

</specifics>

<deferred>
## Deferred Ideas

- Drag-and-drop file/folder movement in the tree — v2.
- Wiki-link resolution, click-navigation, graph view — v2 (EDIT-06 already tracks wiki-linking).
- Work-level publish/unpublish state (the work itself, as opposed to individual chapters) — not decided as needed; revisit only if a concrete need surfaces.
- Studio on a separate subdomain — deferred indefinitely per D-18; revisit only if infra needs force it.
- 3-panel AI co-writing canvas, ghost text, token/cost gauge, AI chat — Phase 4 (EDIT-01..05).
- Analytics inspector (스크롤 심도 완독률 그래프), Studio Home 통계/경제 관리 menus (충전/환전/BYOK) — out of v1 scope entirely per PROJECT.md/REQUIREMENTS.md Out of Scope table.

### Reviewed Todos (not folded)
None — no pending todos matched this phase.

</deferred>

---

*Phase: 02-studio-core-writer-loop-no-ai*
*Context gathered: 2026-08-25*
