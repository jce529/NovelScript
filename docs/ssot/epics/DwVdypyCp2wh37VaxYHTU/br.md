---
id: "doc:Is-UoHvE5p0T6K0LjbX90"
name: "Chapter Reading Experience Business Rules"
type: "br"
scope: "epic"
scopeId: "DwVdypyCp2wh37VaxYHTU"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"chapter-reader-requires-public-work-and-chapter","title":"Chapter Reader Requires Public Work And Chapter","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:b105058b84a85955"],"modelLinks":[]},{"stableKey":"locked-chapters-hide-content","title":"Locked Chapters Hide Content","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:b105058b84a85955"],"modelLinks":[]},{"stableKey":"chapter-open-tracking-and-progress-write-conditions","title":"Chapter Open Tracking And Progress Write Conditions","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:b105058b84a85955"],"modelLinks":[]},{"stableKey":"adjacent-navigation-disabled-at-boundaries","title":"Adjacent Navigation Disabled At Boundaries","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:b105058b84a85955"],"modelLinks":[]},{"stableKey":"viewing-settings-are-limited-to-listed-options","title":"Viewing Settings Are Limited To Listed Options","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:b105058b84a85955"],"modelLinks":[]},{"stableKey":"report-access-and-other-reason-validation-are-delegated","title":"Report Access And Other Reason Validation Are Delegated","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:b105058b84a85955"],"modelLinks":[]}]
relatedDocs: []
serviceMapNodes: []
---
# Chapter Reading Experience Business Rules

Source-grounded business rules for Chapter Reading Experience.

## chapter-reader-requires-public-work-and-chapter — Chapter Reader Requires Public Work And Chapter

The screen only serves the chapter reader when both the public work and current public chapter exist.

**Rule:** The screen must fall through to notFound() when either the public work or the public chapter is missing.

**When/Then:** If the reader route resolves without a public work or without a public chapter. The chapter reading experience is not rendered and the request falls through to notFound().

**Watch:** This shard does not show the exact source queries or the notFound() destination behavior.

**Next:** code. screen_spec.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:b105058b84a85955

## locked-chapters-hide-content — Locked Chapters Hide Content

Locked chapters do not show chapter content in the reader.

**Rule:** The reader must render the centered payment-preparation message instead of chapter.content when the chapter is locked.

**When/Then:** While chapter.locked is true. Readers see the locked-state message rather than the chapter body.

**Watch:** This shard confirms the locked-state message but does not confirm any purchase or unlock flow.

**Next:** code. screen_spec.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:b105058b84a85955

## chapter-open-tracking-and-progress-write-conditions — Chapter Open Tracking And Progress Write Conditions

Opening a chapter always tracks a view, but reading progress writes only under narrower conditions.

**Rule:** On mount, the reader must call chapter-open tracking for every open, and it must upsert reading_progress only when the chapter is not locked and a user exists.

**When/Then:** When the chapter reader mounts for a chapter open. Every open increments chapter views, while reading progress is written only for unlocked chapters with an authenticated user.

**Watch:** This shard names incrementChapterView and reading_progress but does not expose the exact table fields, conflict keys, or retry behavior.

**Next:** code.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:b105058b84a85955

## adjacent-navigation-disabled-at-boundaries — Adjacent Navigation Disabled At Boundaries

Prev and next chapter navigation depends on adjacent chapters existing in the TOC.

**Rule:** The previous and next chapter links must navigate to the neighboring chapter only when that adjacent chapter is available; otherwise the corresponding link must be disabled.

**When/Then:** While the current chapter has no previous chapter or no next chapter in the TOC. Readers cannot navigate past the available chapter boundaries.

**Watch:** This shard confirms disabled navigation at the UI level but does not show any alternate keyboard or gesture navigation behavior.

**Next:** code. screen_spec.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:b105058b84a85955

## viewing-settings-are-limited-to-listed-options — Viewing Settings Are Limited To Listed Options

The reader exposes only the listed font sizes and themes in its viewing settings.

**Rule:** Font size changes must stay within 17, 19, 21, and 24, and theme changes must stay within light, sepia, and dark.

**When/Then:** Readers can choose only the supported reading presentation options.

**Watch:** This shard does not confirm whether these preferences persist across sessions or devices.

**Next:** code. screen_spec.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:b105058b84a85955

## report-access-and-other-reason-validation-are-delegated — Report Access And Other Reason Validation Are Delegated

The chapter reader exposes reporting, but login gating and the extra-detail requirement are enforced through the reporting flow.

**Rule:** When the reader opens or submits 신고, the reporting flow must enforce login checks, and it must reject submissions that choose 기타 without detailed content.

**When/Then:** When a reader opens or submits a report from the 보기 설정 flow. Reporting stays gated behind authentication and requires extra detail for the 기타 reason.

**Watch:** This shard confirms the screen-level requirement and validation rule signals, but it does not include the exact ReportDialog implementation, submission endpoint, or error handling.

**Next:** screen_spec. code.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:b105058b84a85955
