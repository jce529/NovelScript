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

**Reopen 개정 (2026-10-19 문구 개정, 근거: 07-CONTEXT.md "Reopen 논의 결정 (2026-10-12)", 최우선).** 아래 Routes/Interaction 중 `[Reopen]` 표시 항목은 2026-09-16 원문을 대체한다. 근거는 같은 결정과 `.planning/design/UI-DESIGN-BACKLOG.md`의 "관리자 탭 구조", "스튜디오·관리자 진입", "숨긴 회차" 행이다. 2026-09-16 승인과 아래 Checker Sign-Off는 역사 기록으로 보존하며, 개정된 UI의 렌더 인수는 07-15 대기(pending)다. 댓글 신고 탭·댓글 숨김·댓글 정지는 댓글 신규 phase 소관이며 이 문서 범위가 아니다.

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

- `/admin` [Reopen]: heading `신고 관리`, 댓글 제외 세 탭 `작품·회차 신고`, `작가 재검토`, `제재 이력`(07-11). 2026-09-16 원문의 2탭(`신고`/`재검토 요청`)은 대체됐다. 댓글 탭은 두지 않는다. Reports use a status select (`미처리`, `처리 완료`, `기각`, `전체`); default open. `전체`는 한 대상의 open/resolved/dismissed 신고를 한 그룹에 묶고 그룹 행에 상태 배지를 모두 표시한다(텍스트 라벨, 색만으로 구분 금지). 탭·필터·페이지·선택 사용자는 URL 상태이며 상세에서 돌아와도 유지된다. No search or advanced filters.
- `제재 이력` 탭 [Reopen]: 사용자(독자·작가) 목록(역할, 이름 또는 `사용자 xxxxxxxx`, 현재 상태, 25명 단위 페이지)과 선택한 사용자의 현재 제재 및 경고·정지 타임라인(25건 단위 별도 페이지). 사용자 선택·이력 페이지·목록 페이지는 서로 다른 URL 축이며 목록 페이지를 바꾸면 선택이 해제된다. 같은 변경 ID의 해제+새 정지는 하나의 `기간 변경`(이전 → 새 종료 시각) 항목으로 합쳐 보인다. 일반 감사 로그 브라우저가 아니며 사용자별 제재 이력만 보여 준다.
- Queue columns: target title/type, report count, category summary, oldest timestamp, status, reporter summary. Detail reveals individual reporters and timestamps. Group by work/chapter target; use stable group pagination, 25 groups per page, previous/next icon buttons with accessible labels.
- `/admin/reports/[reportId]`: anchor report resolves target group. Back link retains tab/status/page. Header identifies target; main body shows complete report details and safe rendered target text; sibling section shows author's report/action history. Action form follows evidence in tab order. At desktop >=1024px use minmax(0, 2fr) and minmax(280px, 1fr), max-width 1280px. Under 1024px stack sections. Do not nest decorative cards.
- `/admin/reviews/[requestId]`: target body, writer request and previous action context; commands `블라인드 해제` and `유지`. Reports remain a separate workflow. No general audit-log browser.
- On 375px/390px screens the queue becomes labeled rows with title first and metadata beneath; no document-wide horizontal overflow. Actions wrap into separate lines. Target text remains selectable and readable.
- No hero or stock illustrations. Where an existing work cover is available, use its real thumbnail with stable 32x48 dimensions and a neutral missing-cover state. Do not fetch or invent decorative media.

## Interaction Contract

Admin controls: action select (resolve, dismiss, blind, warn, suspend, permanent suspension), reason textarea, separate public/user-facing reason where needed, [Reopen] 기간 정지의 종료 시각은 자유 date/time 입력이 아니라 `1일`/`7일`/`30일` 프리셋으로만 고르며, 선택 시점의 기준 시각에 일수를 더한 종료 시각을 UTC와 로컬 시간대로 프리뷰한다(`suspensionPresetEndsAt`, 07-10/07-11). 프리뷰와 전송 종료 시각은 같아야 하고, 이미 지난 값이면 다시 선택하게 한다. Permanent suspension is an explicit distinct selection. Trimmed reason required for blind/warn/suspension; dismissal note optional. Invalid submissions retain input and focus the first error. Display timestamps in local timezone with explicit timezone on sanction expiry; serialize ISO timestamps.

[Reopen] 현재 제재 조정: `제재 이력`에서 선택한 사용자의 **현재(active) 제재 행**에서만 `해제`와 `기간 변경` 버튼을 노출한다(없음·만료·경고만이면 없음). 신고 상세에서는 하지 않는다. 대화상자는 내부 사유(최대 2000자)와 공개 사유(최대 500자)를 모두 필수로 받고, `기간 변경`은 1/7/30일 프리셋(영구→기간 포함)과 새 종료 시각 프리뷰를 보이며 `해제`는 종료 시각이 없다. 확인 후 실행하며 pending 중 중복 제출을 막고, 실패 시 입력과 멱등 키를 유지하고, 입력을 수정하면 새 키를 쓴다. 다른 관리자가 먼저 변경했거나 제재가 이미 끝났으면(stale) 새로고침 안내만 보이고 자동 적용하지 않는다. 성공 시에만 토스트와 새로고침으로 타임라인이 갱신된다. 조정은 기존 `lift` 경로를 재사용하고 `admin_actions`에 기록된다.

[Reopen] 관리자 진입과 공개 알림: 프로필 메뉴(AccountPanel 팝오버)에 관리자 권한자에게만 `관리자` 링크가 보이며 판정은 서버 액션이 불리언만 돌려준다(관리자 writer는 기존 스튜디오 진입도 유지, 비관리자 직접 `/admin`은 404). 작품·회차 블라인드가 해제(직접 해제 또는 재검토 결과 해제)되면 그 작품을 선호작(북마크)에 저장한 독자에게만 기존 AccountNotices 안의 `공개 알림` 구역으로 `{제목} 공개`/`{제목} 회차 공개`가 앱 내 알림으로 뜬다. 구독만 한 독자, 계정 제재 해제, 재검토 유지, 작품 작가 본인은 받지 않는다. 내부 사유·관리자·신고자 정보는 DTO와 DOM에 없고(제목과 링크만), `확인했습니다`는 서버 확인 성공 후에만 사라지며 새로고침 후에도 유지되어야 한다(실검증 pending). 외부(이메일·푸시) 알림은 없다. 조회 실패 시 경고/정지 알림과 읽기는 계속 동작한다.

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
| Write denial | `계정 이용이 제한되어 이 작업을 할 수 없어요. 기존 작품과 구매한 회차는 계속 볼 수 있어요.` (07-08로 통일, `WRITE_SUSPENDED_MESSAGE`) |
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

**Reopen 보완 상태 (2026-10-19):** 위 `[Reopen]` 문구는 07-11/07-12/07-13의 실제 구현(SSR/단위 테스트 수준)에 맞췄다. 다음은 아직 인수되지 않았다(pending, gate 07-15-02): 세 탭·전체 필터·프리셋·현재 행 조정 대화상자의 실제 클릭/포커스/Esc/pending 동작, 프로필 메뉴 키보드·권한 회수 후 동작, 공개 알림 확인 영속성, 1440x900·390x844 light/dark·200% 줌. 단위/정적 마크업 테스트로 승격하지 않는다.
- [ ] Reopen UI 렌더·브라우저 인수 (07-15-02 대기)
