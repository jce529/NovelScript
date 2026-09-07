---
id: "doc:3dGKTJqRgdQ9olSg12DyA"
name: "Chapter Editing and Publishing Business Rules"
type: "br"
scope: "epic"
scopeId: "KWzV2pFYljuCDXE3S4ruY"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"br-chapter-editor-disabled-until-load","title":"Editor stays disabled until chapter data finishes loading","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:4835eab26aa2d783"],"modelLinks":[]},{"stableKey":"br-chapter-save-feedback","title":"Saving chapter content triggers save action and toast feedback","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:4835eab26aa2d783"],"modelLinks":[]},{"stableKey":"br-chapter-publish-price-tier","title":"Publishing uses free or paid price-tier rules","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:4835eab26aa2d783"],"modelLinks":[]},{"stableKey":"br-chapter-unpublish-confirmation","title":"Unpublishing requires confirmation before the action runs","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:4835eab26aa2d783"],"modelLinks":[]},{"stableKey":"br-chapter-unpublish-feedback","title":"Unpublish completion updates published state and toast feedback","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:4835eab26aa2d783"],"modelLinks":[]},{"stableKey":"br-mentions-and-ai-input-guards","title":"Mentioning and AI proposal actions are gated by client-side interaction rules","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:4835eab26aa2d783"],"modelLinks":[]}]
relatedDocs: []
serviceMapNodes: []
---
# Chapter Editing and Publishing Business Rules

Source-grounded business rules for Chapter Editing and Publishing.

## br-chapter-editor-disabled-until-load — Editor stays disabled until chapter data finishes loading

The text editor cannot be used until the chapter fetch completes.

**Rule:** WHEN the chapter editor screen has not finished loading the chapter record, the textarea must remain disabled.

**When/Then:** The screen has mounted and the chapter load has not completed. Editing is blocked until loaded becomes true after the fetch completes.

**Watch:** The shard does not show a fallback UI for load failure or missing chapter.

**Next:** code. screen_spec.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:4835eab26aa2d783

## br-chapter-save-feedback — Saving chapter content triggers save action and toast feedback

The save control submits chapter content and reports success or failure with a toast.

**Rule:** WHEN the user clicks 회차 저장, the screen must submit the current content through saveChapterContentAction(workId, chapterId, content) and show toast.success('저장했어요.') on success or toast.error(result.error ?? '저장하지 못했어요. …

**When/Then:** The user activates the save control from the chapter editor screen. The current chapter content is submitted and the UI gives success or failure feedback by toast.

**Watch:** This shard does not confirm any server-side validation or what data is returned beyond the error field used by the UI.

**Next:** code. screen_spec.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:4835eab26aa2d783

## br-chapter-publish-price-tier — Publishing uses free or paid price-tier rules

Publishing passes null for free chapters and a selected price tier for paid chapters.

**Rule:** WHEN the user clicks 발행하기, the screen must call publishChapterAction(workId, chapterId, isPaid ? (priceTier ?? PRICE_TIERS[0]) : null), using null for a free chapter and a paid tier selected from PRICE_TIERS when paid.

**When/Then:** The user initiates publishing from the chapter editor screen. The publish request carries either no price tier for free publication or one of the allowed paid tiers for paid publication.

**Watch:** The shard does not confirm whether the server revalidates the selected price tier. The exact defaulting behavior of PRICE_TIERS[0] is only visible as a client-side call argument.

**Next:** code. screen_spec.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:4835eab26aa2d783

## br-chapter-unpublish-confirmation — Unpublishing requires confirmation before the action runs

The screen requires a confirmation dialog before it will unpublish a chapter.

**Rule:** WHEN the user clicks 발행 취소, the screen must require confirmation in a dialog before calling unpublishChapterAction(workId, chapterId).

**When/Then:** The user attempts to unpublish a chapter from the editor screen. The chapter is not unpublished unless the user confirms, after which the dialog closes and the unpublish action runs.

**Watch:** The visible explanation text is referenced but not reproduced in this shard. This shard does not prove any server-side guard for unpublishing.

**Next:** code. screen_spec.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:4835eab26aa2d783

## br-chapter-unpublish-feedback — Unpublish completion updates published state and toast feedback

A successful unpublish clears the published state, and failures show an error toast.

**Rule:** WHEN unpublishChapterAction(workId, chapterId) completes, the screen must set isPublished to false and show a success toast on success, or show the error toast fallback on failure.

**When/Then:** The user confirmed 발행 취소 and the unpublish request returns. The UI reflects unpublish success or failure through published-state update and toast feedback.

**Watch:** The shard does not confirm whether any additional state or cache is refreshed after unpublishing.

**Next:** code. screen_spec.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:4835eab26aa2d783

## br-mentions-and-ai-input-guards — Mentioning and AI proposal actions are gated by client-side interaction rules

Mentions are deduplicated, autocomplete depends on caret context, and AI actions are limited by generation and proposal state.

**Rule:** WHEN the user interacts with mentions or the AI panel, the screen must apply the visible client-side guards for mention deduplication, caret-based autocomplete, blocked sends during active generation or empty trimmed in…

**When/Then:** The user is using mention insertion or AI proposal controls in the chapter editor screen. The UI limits mention and AI actions to the states explicitly allowed by the screen rules.

**Watch:** This shard only proves client-side interaction rules in the editor screen. The exact AI backend behavior for generate, regenerate, reject, and save proposals is not confirmed here.

**Next:** code. screen_spec.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:4835eab26aa2d783
