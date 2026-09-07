---
id: "doc:WeYoRQa4eWEFzzN612OGX"
name: "Home Discovery Business Rules"
type: "br"
scope: "epic"
scopeId: "y10ONYsPUsuqDchl5bB47"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"home-discovery-filter-fallbacks","title":"Home discovery uses constrained filter values","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:406184af4ba83897"],"modelLinks":[]},{"stableKey":"home-discovery-signed-in-recently-read","title":"Recently read is only for signed-in users","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:406184af4ba83897"],"modelLinks":[]},{"stableKey":"home-discovery-recently-read-empty-cta","title":"Empty recently read state routes readers to weekly ranking","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:406184af4ba83897"],"modelLinks":[]},{"stableKey":"home-discovery-filter-navigation-anchor","title":"Filter navigation preserves the weekly ranking anchor","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:406184af4ba83897"],"modelLinks":[]},{"stableKey":"home-discovery-popular-mode-basis-selector","title":"Ranking basis selector is limited to popular mode","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:406184af4ba83897"],"modelLinks":[]},{"stableKey":"home-discovery-feed-empty-vs-grid","title":"The feed renders either an empty state or linked cards","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:406184af4ba83897"],"modelLinks":[]}]
relatedDocs: []
serviceMapNodes: []
---
# Home Discovery Business Rules

Source-grounded business rules for Home Discovery.

## home-discovery-filter-fallbacks — Home discovery uses constrained filter values

The home screen accepts only supported sort parameters and falls back to default values when inputs are missing or invalid.

**Rule:** The home discovery screen must derive `sortMode` as `latest` or `popular`, derive `sortBasis` as one of `trending`, `views`, `likes`, or `ctr`, and fall back to `popular` and `trending` for unsupported values. The filte…

**When/Then:** While rendering `/` from `searchParams`. The page renders with a valid filter state even when the incoming query string is missing or unsupported.

**Watch:** The shard proves UI-level fallback behavior but does not confirm whether deeper feed queries enforce the same constraints.

**Next:** screen_spec. code.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:406184af4ba83897

## home-discovery-signed-in-recently-read — Recently read is only for signed-in users

The home screen conditionally loads and renders recently read content based on the current authenticated user.

**Rule:** The home screen must call `supabase.auth.getUser()` to determine the current user, call `listRecentlyRead(supabase, { userId: user.id, limit: 10 })` only when a `user` exists, and render `RecentlyReadSection` only when …

**When/Then:** While the visitor is signed in on `/`. Signed-in users receive a recently read section, and signed-out users do not see that section.

**Watch:** The shard confirms `supabase.auth.getUser()` gating and the `listRecentlyRead` call, but not the persistence or freshness rules of the underlying reading-progress data.

**Next:** screen_spec. code.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:406184af4ba83897

## home-discovery-recently-read-empty-cta — Empty recently read state routes readers to weekly ranking

When a signed-in user has no recently read items, the continuation area provides an anchored jump to the ranking section.

**Rule:** When `RecentlyReadSection` has no items, the screen must show the empty copy and the anchor button `작품 둘러보기` that jumps to `#weekly-ranking`.

**When/Then:** If a signed-in user has an empty `RecentlyReadSection`. The user is offered a direct path from the empty continuation area to the weekly ranking section.

**Watch:** The shard confirms the anchor target and button label, but it does not confirm analytics, tracking, or alternate behaviors for this CTA.

**Next:** screen_spec. code.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:406184af4ba83897

## home-discovery-filter-navigation-anchor — Filter navigation preserves the weekly ranking anchor

Changing discovery filters updates the URL query state and keeps navigation focused on the ranking section.

**Rule:** `FeedFilters` must render with the current genre and sort state, and changing genre or sort must push a new route that preserves `#weekly-ranking`. On genre change, the route must update the `genre` query. On click `최신`…

**When/Then:** When the reader changes genre or sort controls on the home screen. The page updates filter state in the URL and returns focus to the weekly ranking section.

**Watch:** The shard proves client navigation behavior, but it does not confirm browser history policy, debouncing, or whether all query permutations are preserved.

**Next:** screen_spec. code.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:406184af4ba83897

## home-discovery-popular-mode-basis-selector — Ranking basis selector is limited to popular mode

The ranking-basis selector is a mode-specific control that appears only for popular sorting.

**Rule:** `FeedFilters` must show the ranking-basis select only when `sortMode` is `popular`, and when shown it must update `sortBasis` from the selected supported value.

**When/Then:** While `sortMode === popular` on the home screen. Readers can refine popular rankings by basis, and that control is absent in other sort modes.

**Watch:** The shard confirms visibility and update behavior for the selector, but not whether unsupported selections are blocked again inside `listFeed`.

**Next:** screen_spec. code.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:406184af4ba83897

## home-discovery-feed-empty-vs-grid — The feed renders either an empty state or linked cards

After loading feed data, the home screen switches between an empty state and a card grid with fixed destination paths and display fallbacks.

**Rule:** The home screen must show the centered empty state copy when `works.length === 0`. Otherwise it must render the feed as cards in a 2-column grid on small screens and a 3-column grid on `sm` screens, with every `FeedCard…

**When/Then:** When feed data has been loaded for the current filter state. Readers either see a no-results message or a grid of work links with consistent presentation and metric formatting.

**Watch:** The shard confirms rendering rules for visible fields, but it does not confirm whether `work.id`, `title`, metrics, or images are always present in feed responses.

**Next:** screen_spec. code.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:406184af4ba83897
