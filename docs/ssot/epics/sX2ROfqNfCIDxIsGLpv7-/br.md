---
id: "doc:LvmlTDAFKhF8eh4aYZqlA"
name: "Work Detail and Engagement Business Rules"
type: "br"
scope: "epic"
scopeId: "sX2ROfqNfCIDxIsGLpv7-"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"work-detail-unavailable-when-work-missing","title":"Work detail requires a resolvable public work","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:a22b016c31220d75"],"modelLinks":[]},{"stableKey":"work-detail-engagement-actions-require-authentication","title":"Engagement actions require authentication","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:a22b016c31220d75"],"modelLinks":[]},{"stableKey":"work-report-detail-required-only-for-gita","title":"Report detail is required only for `기타`","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:a22b016c31220d75"],"modelLinks":[]},{"stableKey":"work-chapters-primary-action-depends-on-progress-and-public-chapters","title":"Chapter entry actions depend on public chapters and progress","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:a22b016c31220d75"],"modelLinks":[]}]
relatedDocs: []
serviceMapNodes: []
---
# Work Detail and Engagement Business Rules

Source-grounded business rules for Work Detail and Engagement.

## work-detail-unavailable-when-work-missing — Work detail requires a resolvable public work

The work detail screen is only available when the route `workId` resolves to a public work; otherwise rendering stops with `notFound()`.

**Rule:** When the screen loads, it uses the route `workId` to fetch the public work, and the screen is unavailable if no work is returned.

**When/Then:** WHEN `/works/:workId` mounts and `getPublicWork` returns no work for the route id. The screen calls `notFound()` and stops rendering the work detail experience.

**Watch:** This shard does not define whether missing access and nonexistent work are distinguished before `notFound()` is triggered.

**Next:** code. api_spec.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:a22b016c31220d75

## work-detail-engagement-actions-require-authentication — Engagement actions require authentication

Like, report, bookmark, and subscription actions are blocked for unauthenticated readers and instead show a login-required toast with navigation to `/login`.

**Rule:** The screen must require authentication before it allows `toggleSubscriptionAction(workId)`, `toggleBookmarkAction(workId)`, `toggleLikeAction(workId)`, or opening the report flow.

**When/Then:** WHEN a reader clicks subscription, bookmark, `좋아요`, or `신고` without being logged in. The screen shows a login-required toast with a `로그인하기` action that navigates to `/login`, and the requested engagement action does not…

**Watch:** This shard confirms client-side gating and user feedback, but it does not prove server-side enforcement inside the action handlers.

**Next:** code. api_spec.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:a22b016c31220d75

## work-report-detail-required-only-for-gita — Report detail is required only for `기타`

The report dialog conditionally requires detailed text only when the selected report category is `기타`.

**Rule:** The report form must show and require `상세 내용` only when `신고 사유` is set to `기타`.

**When/Then:** WHILE the report dialog is open and the selected category is evaluated. `상세 내용` is conditionally displayed for `기타`, the submitted detail is trimmed, and the report payload includes `{ workId, chapterId, reasonCategory,…

**Watch:** This shard does not confirm any minimum or maximum length rules for the trimmed detail text.

**Next:** code.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:a22b016c31220d75

## work-chapters-primary-action-depends-on-progress-and-public-chapters — Chapter entry actions depend on public chapters and progress

The chapters tab disables its primary action when no public chapters exist, otherwise it routes readers to the first readable destination and adapts the label to progress.

**Rule:** The chapters tab must disable the main reading action when there are no public chapters; otherwise it must route to the progress chapter when `progress` exists or to the first chapter when it does not.

**When/Then:** WHILE the chapters tab is rendered for a loaded work. Readers see a disabled primary action when no public chapters exist, `이어보기 · {n}화부터` when progress exists, `읽기 시작` otherwise, and chapter rows marked `유료 회차` when `c…

**Watch:** This shard defines locked presentation as `price_tier !== null` with the `유료 회차` label, but it does not confirm any purchase or access resolution after navigation.

**Next:** code.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:a22b016c31220d75
