---
phase: 07
slug: admin-moderation-surface
status: approved
shadcn_initialized: true
preset: base-nova
created: 2026-09-16
---

# Phase 7 - UI Design Contract

Design inferred from existing app conventions and D-01 through D-20, with user's instruction to continue. Approval below is an inline contract review, not user acceptance of rendered screens.

## Design System

| Property | Value |
| --- | --- |
| Tool / preset | Existing shadcn, base-nova, components.json |
| Components | Existing Base UI-backed button, tabs, badge, dialog, select, textarea, input, label, tooltip, sonner, scroll-area |
| Icons | lucide-react: ArrowLeft, ChevronLeft, ChevronRight, EyeOff, ShieldAlert, Check, X, LoaderCircle |
| Font | Existing Geist sans with system Korean fallback; no new font request |
| Theme | Existing CSS semantic tokens, light and dark; no global palette changes |

## Spacing Scale

4px icon/label gap; 8px compact spacing; 16px control groups and mobile page padding; 24px desktop page padding and section gaps; 32px major separation; 48px page header region. No other spacing scale is needed. Borders are 1px; these are not layout spacing. Dialog radius follows existing system; no decorative page cards.

## Typography

| Role | Size | Weight | Line height |
| --- | --- | --- | --- |
| Body | 16px | 400 | 1.5 |
| Label / table metadata | 14px | 500 | 1.5 |
| Section heading | 20px | 600 | 1.4 |
| Page heading | 24px | 600 | 1.3 |

No display/hero text. Letter spacing 0. Long titles wrap; long IDs/URLs use overflow-wrap anywhere. No viewport-scaled fonts. Text and icons cannot change row/control dimensions on hover or during loading.

## Color

| Role | Token | Use |
| --- | --- | --- |
| Dominant | background / foreground | Neutral reading and list surfaces |
| Secondary | muted / border / muted-foreground | Headers, separators, metadata |
| Accent | primary / primary-foreground | Selected tab, primary submit, focused control |
| Destructive | destructive | Suspension and blind confirmations only |
| Status | Text + existing badge variants | Open, resolved, dismissed, reviewing; never color alone |

Reuse current token values from app/globals.css, including dark mode; indigo remains a small existing accent rather than a full-page color. Validate text contrast in rendered states, including disabled controls and badges.

## Routes and Layout

- `/admin`: heading `신고 관리`, tabs `신고` and `재검토 요청`. Reports use a status select (`미처리`, `처리 완료`, `기각`); default open. No search or advanced filters.
- Queue columns: target title/type, report count, category summary, oldest timestamp, status, reporter summary. Detail reveals individual reporters and timestamps. Group by work/chapter target; use stable group pagination, 25 groups per page, previous/next icon buttons with accessible labels.
- `/admin/reports/[reportId]`: anchor report resolves target group. Back link retains tab/status/page. Header identifies target; main body shows complete report details and safe rendered target text; sibling section shows author's report/action history. Action form follows evidence in tab order. At desktop >=1024px use minmax(0, 2fr) and minmax(280px, 1fr), max-width 1280px. Under 1024px stack sections. Do not nest decorative cards.
- `/admin/reviews/[requestId]`: target body, writer request and previous action context; commands `블라인드 해제` and `유지`. Reports remain a separate workflow. No general audit-log browser.
- On 375px/390px screens the queue becomes labeled rows with title first and metadata beneath; no document-wide horizontal overflow. Actions wrap into separate lines. Target text remains selectable and readable.
- No hero or stock illustrations. Where an existing work cover is available, use its real thumbnail with stable 32x48 dimensions and a neutral missing-cover state. Do not fetch or invent decorative media.

## Interaction Contract

Admin controls: action select (resolve, dismiss, blind, warn, suspend, permanent suspension), reason textarea, separate public/user-facing reason where needed, and expiry date/time for timed suspension with visible timezone. Permanent suspension is an explicit distinct selection. Trimmed reason required for blind/warn/suspension; dismissal note optional. Invalid submissions retain input and focus the first error. Display timestamps in local timezone with explicit timezone on sanction expiry; serialize ISO timestamps.

Confirm blind/suspension with target name, effect and entered reason. Pending state disables duplicate submit and reserves spinner space. Success refreshes state and shows toast; failure keeps entered data with retry. Stale action says the item changed and offers refresh, without silently applying to new reports.

Reader: blinded chapters remain in TOC as `검토 중` with EyeOff and locked state; direct viewer displays safe reason and `회차 목록` navigation. Do not show purchase CTA for a blind or delete the existing entitlement. Unblinding reveals already-owned content without another purchase. Work blind has a direct-entry unavailable state and is absent from discovery.

Writer: studio work/chapter context shows `검토 중` and a `재검토 요청` command after correction. Open request becomes `검토 요청됨` and cannot duplicate. Saving/re-publishing never clears admin_blinded. Suspension shows write denial while keeping existing content readable.

Warning: authenticated shared notice shows `운영 알림`, safe reason and `확인했습니다`. Confirmation persists per warning and only for its recipient. No dismiss-on-navigation or automatic acknowledgement. Multiple warnings remain individually acknowledgeable. Preserve reading and logout even if notice retrieval fails; show retry state without exposing internal notes.

## Copywriting Contract

| Element | Copy |
| --- | --- |
| Primary action | `처리 완료` / `기각` / `블라인드 적용` / `경고 전달` / `정지 적용` |
| Empty report queue | `미처리 신고가 없습니다` |
| Empty review tab | `재검토 요청이 없습니다` |
| Load error + recovery | `목록을 불러오지 못했습니다. 다시 시도해 주세요.` + `다시 시도` |
| Required reason | `조치 사유를 입력해 주세요.` |
| Blind confirmation | `이 콘텐츠의 본문을 차단합니다. 기존 구매 내역은 유지됩니다.` |
| Suspension confirmation | `이 사용자의 쓰기 활동을 제한합니다. 기존 구매 콘텐츠 열람은 유지됩니다.` |
| Conflict | `다른 관리자가 이 항목을 변경했습니다. 새로고침 후 확인해 주세요.` |
| Write denial | `계정 정지로 이 작업을 수행할 수 없습니다.` |
| Blinded viewer | `검토 중인 콘텐츠입니다` + safe public reason |

Empty states need no instructional filler. Page text describes actual data/state, not design, keyboard shortcuts, or feature marketing.

## Accessibility and States

Named icon buttons at least 44x44px, explicit labels for inputs, visible focus rings, semantic headings and tables/lists, aria-live result/error messages. Use installed dialog primitives for focus trapping/return and Escape-to-cancel before submission. No unsanitized HTML rendering of report or chapter content. Loading rows preserve approximate list geometry. Check keyboard-only confirmation, 200% zoom, light/dark, long Korean titles/reasons, empty/failure/stale states at 390x844 and 1440x900.

## Registry Safety

Only installed local components from the official shadcn setup are used. No third-party blocks, registry installation, new design dependency or network asset is required.

## Checker Sign-Off

- [x] Copywriting: explicit operational commands and recovery/error states.
- [x] Visuals: data-first responsive layout, real optional cover thumbnails, no decorative hero.
- [x] Color: existing semantic palette with restrained accent and non-color status labels.
- [x] Typography: fixed scale, wrap behavior and hierarchy specified.
- [x] Spacing: declared scale and stable targets; no nested cards.
- [x] Registry Safety: existing local components only.

**Approval:** Inline design-contract review passed 2026-09-16. Rendered implementation acceptance remains pending.
