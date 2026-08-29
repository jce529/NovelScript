# Phase 3: Reader Core (Reading Loop, No Payment) - Context

**Gathered:** 2026-08-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Readers can discover published works, view a work's detail page, read chapters in a viewer (font/theme control, prev/next navigation, table of contents), have their last-read position remembered and resumed (이어보기), and report problem content — all end-to-end with zero payment code. Chapters that a writer marked "paid" in Phase 2 exist in the data model but are locked/unreadable in this phase (no unlock mechanism until Phase 6). No AI generation exists yet.

</domain>

<decisions>
## Implementation Decisions

### Discovery Feed & Ranking Signal
- **D-01:** Main discovery feed cards show a single combined "trending score" badge (not three raw numbers) — a simplified stand-in for docs/5-1's "연독률 92%" badge concept. This is NOT the precise scroll-depth algorithm from docs/4 §4.3 (that's explicitly out of v1 scope per PROJECT.md) — it's a v1-simplified combination of views/likes/next-chapter click-through per REQUIREMENTS.md READ-01. Exact weighting formula is Claude's/researcher's call.
- **D-02:** A separate ranking view lets the user switch the sort basis between the individual raw metrics (조회수/좋아요/다음화 이동률) rather than only the combined score — this is in addition to D-01's combined badge on the main feed, not instead of it.
- **D-03:** Feed card layout is a grid (2-3 columns, cover-image-centric) — standard Korean web-novel platform convention (Naver Series/Ridi style), not a list.
- **D-04:** Feed supports genre filter + sort toggle (최신/인기). Genre filter reuses the single-select genre field from Phase 2's work model (see `02-CONTEXT.md` D-04).
- **D-05:** docs/5-1's "루키 쿼터존" (minimum-10-chapter gate before main-feed exposure, new-author protection) is explicitly OUT of v1 scope. All works are exposed equally in all feeds/rankings regardless of chapter count.
- **D-20 (new 2026-08-29):** A promotional banner sits at the top of the home/discovery screen, above the "최근 읽은 작품" section — a static content slot (no scheduling/targeting system implied). Backed by **READ-09** (see "Scope Note" below).
- **D-21 (new 2026-08-29):** The ranking/feed grid section carries an explicit section title ("Weekly Ranking" eyebrow + Korean heading) with a divider above it, so it reads as clearly distinct from the "최근 읽은 작품" section rather than blending into one continuous scroll.

### Work Detail Page & Paid Chapter Handling
- **D-06:** A chapter marked "paid" by the writer in Phase 2 shows a lock badge in the chapter list/TOC in Phase 3, but is not readable — clicking shows a "결제 기능 준비중" (payment coming soon) message rather than the content. This is the interim behavior until Phase 6 wires the real unlock flow onto the same UI.
- **D-07 (revised 2026-08-29):** Work detail page uses a tab structure: **[소개]** (intro/synopsis) + **[작품설정]** (work settings, new) + **[회차]** (chapter list) — 3 tabs. Originally 2 tabs (소개/회차, matching the in-scope subset of docs/5-1's 4-tab vision); **작품설정** was added per the user's mockup-review request to hold per-work settings, separate from the 알림/선호작 icons which live in the header instead (see D-18/D-19). The 세계관(Lore/Wiki) tab remains deferred to v2 (READ-06); the report action remains a persistent button, not a tab (see D-17).
- **D-08:** Like (좋아요) button requires login and is toggleable (press again to un-like) — prevents duplicate-count gaming.
- **D-09:** View count increments by 1 every time a reader opens a chapter in the viewer — no per-user dedup logic in v1 (kept simple; precision left for later).
- **D-18 (new 2026-08-29):** A notification (알림) bell icon sits in the work detail page's top header row, on the same line as the back button (right side, paired with D-19's favorite icon) — toggles new-chapter alerts for this work. Login-gated like other write actions (D-08/D-14/D-17 precedent). Backed by **READ-07** (see "Scope Note" below).
- **D-19 (new 2026-08-29):** A favorite/bookmark (선호작) icon sits next to the notification bell in the same header row — saves the work to the reader's personal list, distinct from the 좋아요 (D-08) like-count action. Backed by **READ-08** (see "Scope Note" below).
- **D-22 (new 2026-08-29, Claude's discretion):** The new 작품설정 tab (D-07) ships in Phase 3 as a structural placeholder only — its content/settings have not been decided by the user yet. It renders an empty/"준비 중" state, reusing the same established pattern as D-06's locked-chapter message, rather than inventing unreviewed settings. Revisit once the user defines what belongs in this tab.

### Viewer UX
- **D-10:** Viewer's base reading mode is vertical scroll only (no paging/pagination mode) — matches Korean web-novel-platform convention and is the primary mode docs/5-1 references.
- **D-11:** Font size and theme (dark/alt) controls live behind a fixed top toolbar icon (⚙️) that opens a settings panel — always reachable without leaving the reading flow.
- **D-12:** Table of contents (TOC) is an in-viewer panel (overlay/side panel reachable from the toolbar) — readers jump to another chapter without leaving the viewer for the detail page.
- **D-13:** A persistent bottom bar with "이전화 / 다음화" (prev/next chapter) buttons is always visible at the bottom of the viewer — not a scroll-triggered bottom-sheet popup (docs/5-1's bottom-sheet concept was adapted since, unlike the original vision, Phase 3 has no paid-unlock CTA to reserve that moment for). Since all chapters are free in Phase 3, "다음화" is always active when a next chapter exists.

### Resume Reading (이어보기) & Report
- **D-14:** 이어보기 (READ-04) is supported for logged-in users only, persisted to the account (server-side last-read-chapter-per-work). No localStorage-based guest support in v1.
- **D-15:** Resume reading surfaces in two places: (a) a "이어보기" button on the work detail page (replaces "읽기 시작" once the reader has read at least one chapter of that work), and (b) a consolidated "최근 읽은 작품" list on the homepage/마이페이지 across all works the reader has read.
- **D-16:** Report reasons are a fixed category set (내용 불일치/표절, 혐오·유해 콘텐츠, 스팸/광고, 기타) with a free-text field shown when "기타" is selected. Categories must map 1:1 to the `reason category` field ADMIN-01 (Phase 7) needs to display in the report queue.
- **D-17:** Report button is available in both the work detail page and the viewer, and requires login (prevents anonymous spam/abuse of the report queue).

### Claude's Discretion
- Exact trending-score weighting formula (D-01).
- Ranking-view UI details — separate screen vs. tab vs. dropdown sort control (D-02).
- Locked-chapter click interaction — modal vs. inline message copy (D-06).
- Resume-reading data schema (which table/columns track last-read chapter per work per user) (D-14).
- TOC panel exact UI — modal vs. slide-in side panel (D-12).
- 작품설정 tab's actual content, deferred to a future decision (D-22).

</decisions>

<scope_note>
## Scope Note — features added 2026-08-29, now backed by requirements (resolved same day)

The user reviewed a mockup of this phase's UI and asked to formalize three additions beyond the phase's original READ-01~05 requirements: the 알림 bell (D-18), the 선호작 bookmark (D-19), and the promotional banner (D-20). These were initially captured as structural/visual decisions only, with no backing requirement ID.

**Resolved:** `.planning/REQUIREMENTS.md` now has READ-07 (알림), READ-08 (선호작), READ-09 (promotional banner), all mapped to Phase 3 in the Traceability table. `.planning/ROADMAP.md`'s Phase 3 section now lists READ-01~05, 07, 08, 09 as requirements, with matching success criteria 6-8. These are confirmed, buildable Phase 3 scope.
</scope_note>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Reader UX Vision (primary reference — partial adoption, see notes)
- `docs/5-1.독자 공간 UI,UX 설계 및 운영 시스템.md` §1 (플랫폼 메인 홈) — discovery feed ranking-badge concept (informs D-01/D-02); "명예의 전당"(우수 리뷰 매거진) and "루키 쿼터존" sections are OUT of v1 scope (no review system exists; D-05 explicitly excludes the rookie quota).
- Same doc §2 (작품 상세 페이지) — 4-tab detail page vision; [소개]/[작품설정]/[회차] tabs and the report button are in v1 scope (D-07, revised to 3 tabs 2026-08-29 — 작품설정 is new, not from docs/5-1); [세계관(Lore/Wiki)] tab is v2 (READ-06); spoiler auto-lock-by-progress feature is out of scope entirely.
- Same doc §3 (웹소설 뷰어) — dark mode/font-adjust/scroll-reading conventions inform D-10/D-11; the "스크롤 심도 트래커" (valid-read detection) and bottom-sheet-on-scroll-end pattern are NOT implemented as specified — Phase 3 uses a persistent bottom bar instead (D-13) since there's no paid-unlock moment to gate.
- Same doc §4 (서버 측 AI 사전 검수) — entirely OUT of v1 scope; ADMIN-01~04 (Phase 7, manual review) replaces this per PROJECT.md.

### Algorithm Precision (explicitly deferred)
- `docs/4. 시스템 아키텍처 및 기술 스택.md` §4.3 — the precise scroll-depth-based 완독률/연독률 algorithm. NOT used in v1; REQUIREMENTS.md READ-01 and PROJECT.md's "랭킹/큐레이션은 간소화 지표로 시작" decision explicitly replace it with the simplified views/likes/next-chapter-CTR signal (D-01).

### Requirements / Scope
- `.planning/REQUIREMENTS.md` — READ-01, READ-02, READ-03, READ-04, READ-05 (this phase's literal v1 requirements); ADMIN-01's `reason category` field, which D-16's report categories must match.
- `.planning/PROJECT.md` — Out of Scope table: precise scroll-depth algorithm, 3-Strike auto-sanction, SLM pre-screening pipeline — all excluded from this phase too.

### Prior Phase (dependency)
- `.planning/phases/01-foundation-wallet-infrastructure/01-CONTEXT.md` — auth/session model (dual-role account, Supabase Auth) that login-gated features (likes, reports, resume-reading) build on.
- `.planning/phases/02-studio-core-writer-loop-no-ai/02-CONTEXT.md` — work fields (title/synopsis/genre/cover — D-03/D-04), chapter free/paid+price-tier model (D-20), chapter publish/unpublish state (D-21/D-22). Phase 3's feed, detail page, and paid-chapter lock UI (D-06) all read this same data model.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `components/ui/*` — shadcn components already installed (badge, dialog, dropdown-menu, input, label, scroll-area, select, separator, sonner, textarea, tooltip) as of this session, ahead of Phase 2 UI plans landing. Directly useful for Phase 3: `badge` (trending-score/lock badges), `dialog` (locked-chapter modal, report form), `select`/`dropdown-menu` (genre filter, ranking sort toggle), `scroll-area` (TOC panel), `sonner` (report-submitted toast), `tooltip` (settings icons).
- `supabase/migrations/0002_studio.sql` (landed mid-session via Phase 2 plan 02-01 execution) — defines `works`, `kb_nodes`, `chapters` tables. Phase 3's feed/detail/viewer queries read directly from `works` and `chapters`; no reader-specific tables exist yet (views, likes, resume-position, reports are all new for this phase).

### Established Patterns
- `lib/supabase/{client,server,admin}.ts` — Supabase client wrapper conventions from Phase 1, to be reused for Phase 3's read queries and any reader-side mutations (likes, view increments, resume-position writes, report submissions).
- Soft-delete (`deleted_at`) convention established in Phase 1 — relevant if unpublished/deleted works or chapters need to disappear from reader-facing feeds/viewer without hard deletion.

### Integration Points
- Reader routes (feed, detail page, viewer) query the `works`/`chapters` schema Phase 2 just landed — Phase 3 planning should confirm the exact `chapters` schema (free/paid flag, price, publish state, order) against the live migration rather than assuming field names.
- Wallet balance display and any spend UI remain out of Phase 3 — this phase only reads the paid/free flag to decide lock-vs-unlocked display (D-06); no wallet interaction.
- Report submissions need a new table/queue that Phase 7's ADMIN-01 will read — Phase 3 creates the write path, Phase 7 builds the read/action UI.

</code_context>

<specifics>
## Specific Ideas

- The user wants the discovery feed to show one combined "trending" badge per card (matching docs/5-1's "연독률 92%" badge framing) AND a separate way to view/sort by the individual raw metrics — both, not either/or (D-01 + D-02).
- Resume reading should appear in two places at once: on the specific work's detail page AND as a cross-work "recently read" list — the user explicitly chose "둘 다" (both) rather than picking one (D-15).
- The bottom-sheet-on-scroll-end pattern from docs/5-1 was intentionally NOT carried over as-is; the user's choice (D-13) reflects that in Phase 3 there's no paid-unlock moment to reserve for a popup, so a persistent bottom bar is simpler and always visible.

</specifics>

<deferred>
## Deferred Ideas

- 세계관(Lore/Wiki) 탭, opt-in KB doc showcase on the work detail page — v2 (READ-06 already tracks this).
- AI-generated character/location illustration assets in the lore tab — full-vision doc feature, not scoped in REQUIREMENTS.md v1 or v2; not tracked further.
- 진도별 스포일러 자동 잠금 (progress-based spoiler redaction in the lore tab) — depends on the lore tab itself being v2; not tracked further.
- 명예의 전당 (우수 리뷰 매거진 / curated review highlights) — depends on a review-writing system that doesn't exist in v1 REQUIREMENTS.md; not raised as its own backlog item since no review feature is currently planned anywhere in the roadmap.
- 루키 쿼터존 (new-author exposure quota / cold-start protection) — explicitly excluded from v1 per D-05; revisit only if beta scale creates a real cold-start fairness problem.
- 정밀 스크롤 심도 기반 유효완독 트래커 — already tracked as out-of-scope in PROJECT.md; D-01's simplified signal is the v1 substitute.

### Reviewed Todos (not folded)
None — no pending todos matched this phase.

</deferred>

---

*Phase: 03-reader-core-reading-loop-no-payment*
*Context gathered: 2026-08-28*
