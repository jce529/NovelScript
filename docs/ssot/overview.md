---
id: "doc:_qzPTWSH_ZGi3j7IvxHgg"
name: "Project overview"
type: "overview"
scope: "project"
scopeId: "qlEXtwsu7YJjMVDZhrC2H"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
itemCount: 0
relatedDocs: []
serviceMapNodes: []
---
# Project overview

Routing overview for the account closure flow: it points to the path where an authenticated user can close their account, clear active profile details, and end the session. Routing card for the signed-in account settings experience. It centers on the current user, profile state, and the next actions shown from one account area. Routing card for the external sign-in callback flow that exchanges an authorization code for a session and sends the user to completion, the requested next step, or an error path. Routing overview for the chapter editing workspace where writers draft, revise, save, and publish chapter content, with AI-assisted drafting support and related chapter management actions. Routing card for chapter creation, chapter listing, and chapter ordering within a work. Routing overview for the chapter reader epic that covers chapter loading, reading navigation, table of contents access, viewing preferences, locked-state handling, and reader report submission. Plus 10 more EPIC areas.

## Summary

Routing overview for the account closure flow: it points to the path where an authenticated user can close their account, clear active profile details, and end the session. Routing card for the signed-in account settings experience. It centers on the current user, profile state, and the next actions shown from one account area. Routing card for the external sign-in callback flow that exchanges an authorization code for a session and sends the user to completion, the requested next step, or an error path. Routing overview for the chapter editing workspace where writers draft, revise, save, and publish chapter content, with AI-assisted drafting support and related chapter management actions. Routing card for chapter creation, chapter listing, and chapter ordering within a work. Routing overview for the chapter reader epic that covers chapter loading, reading navigation, table of contents access, viewing preferences, locked-state handling, and reader report submission. Plus 10 more EPIC areas.

## Epic Routes

| Epic | Route |
| --- | --- |
| Account Closure | epics/HoBO4rJLao81zsp1RnCM7/overview.md |
| Account Overview | epics/0oF0HLK2dJTtWk5Y-fQCJ/overview.md |
| Authentication Callback Handling | epics/ddmjKqZQPK1w1e5HiSfvy/overview.md |
| Chapter Editing and Publishing | epics/KWzV2pFYljuCDXE3S4ruY/overview.md |
| Chapter Planning and Structure | epics/BSRh96OQqVVy-mCmDspWk/overview.md |
| Chapter Reading Experience | epics/DwVdypyCp2wh37VaxYHTU/overview.md |
| Home Discovery | epics/y10ONYsPUsuqDchl5bB47/overview.md |
| Identity Completion | epics/j2LecR7weVGaqetE2Y2R0/overview.md |
| Login Error Recovery | epics/4m8kG11em9A1CUTWJcWoz/overview.md |
| New Work Creation | epics/42aB4zT1F3DTaXtt59Vzh/overview.md |
| Social Sign-In | epics/8v1lQnJKU9IzItheJ79gQ/overview.md |
| Story Knowledge Management | epics/eJ5obXr2iXGhdipaJzFza/overview.md |
| Work Detail and Engagement | epics/sX2ROfqNfCIDxIsGLpv7-/overview.md |
| Work Portfolio Management | epics/yzFrm9l4_RMevijWnGVDf/overview.md |
| Work Workspace | epics/_Pnwofz1Iq27Y-rvAkG7q/overview.md |
| Writer Upgrade | epics/TPGBVklZxbIBligTLR7ZA/overview.md |

## Evidence Gaps

- The exact behavior for related cleanup beyond the observed profile soft-delete and sign-out flow is not confirmed in the provided context.
- The precise handling of error branches, redirects, and any follow-up state changes should be verified in the lower source documents before relying on them as project-wide behavior.
- The exact inactive-account condition and redirect behavior should be confirmed in the lower source documents before treating it as a project-wide rule.
- The precise profile fields and any wallet-related presentation details should be verified in the connected source cards if they matter to downstream work.
- The full set of next-action links is not confirmed from this upper routing context alone.
- The exact redirect decision branches and fallback behavior should be verified in the lower source document and implementation before treating them as complete.
- The session creation and user-resolution details are summarized at the routing level only and need lower-document confirmation for exact behavior.
- The conditions for email completion handling and error routing are not fully confirmed from this upper-level context alone.
- The exact save, publish, and unpublish behavior for each source variant is not fully confirmed from the provided context alone.
- The permission and authorization boundaries for editing, publishing, and AI-assisted actions are not fully established in the provided context.
- The detailed handling of mention suggestions, AI proposal acceptance, and rejection flows is not fully confirmed from the provided context.
- The exact pricing-tier effects on publishing behavior are mentioned in design context but not fully proven by the source cards provided here.

## Navigation

- epic catalog -> catalog/epics.md
- API catalog -> catalog/apis.md
- screen catalog -> catalog/screens.md
- table catalog -> catalog/tables.md
- graph lookup -> sot resolve / graph trace
