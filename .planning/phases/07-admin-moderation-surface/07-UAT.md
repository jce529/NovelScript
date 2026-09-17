---
phase: 07
plan: 07-07
type: uat
status: partial   # 2 items pending manual acceptance (see §4)
date: 2026-09-17
---

# Phase 7 UAT — browser acceptance (07-07 task 3)

## Setup

| Item | Value |
|------|-------|
| App | `next dev` via `.claude/launch.json` (`next-dev`), http://localhost:3000 |
| Browser | Claude desktop in-app browser pane; viewports 1440x900 and 390x844 (emulated), light + dark (`.dark` class) |
| DB | Test Supabase project (see `docs/admin-moderation.md` §1) |
| Admin account | User's own Kakao OAuth account (pen name 노벨스크립트데모), logged in by the user. Admin granted via `grant_admin` per `docs/admin-bootstrap.md` (operator label `claude-code (07-07 UAT)`); temporarily revoked and re-granted for the non-admin check; **currently active** |
| Fixtures | Test users created through the service-role admin API (`uat-0707-*@novelscript.test`): writer "UAT검수작가", readers ×3. Work "[UAT] 운영 검수용 작품 — 아주 긴 제목…" with free chapter 1 (long Korean body) and paid chapter 2 (10 tokens). 5 reports on it (3 on ch1 incl. a long detail, 1 work-wide, 1 on ch2) + 1 report on the user's own "달빛 아래 검객" ch1. 50 test tokens granted to the admin account's wallet (`UAT_GRANT`, ref `07-07-uat`) |

Evidence is DOM text/network state captured through the browser tools plus DB queries; screenshots were viewed in-session (the pane tool does not write image files), so evidence below is recorded as observed values.

## Results

| # | Journey | Result | Evidence |
|---|---------|--------|----------|
| 1 | Anonymous `/admin`, `/admin/reports`, `/admin/reviews` | PASS | HTTP 404, Next 404 page |
| 2 | Logged-in **non-admin** (admin revoked) `/admin`, `?tab=reviews`, report detail, review detail | PASS | All 4 → 404; response HTML contains no fixture names or internal reasons |
| 3 | Non-existent report id as admin | PASS | 404 |
| 4 | Grouped queue (desktop 1440) | PASS | ch1 group = "3건 · 기타, 스팸/광고, 혐오·유해 콘텐츠 · 신고자 3명"; work-wide and ch2 as separate groups; oldest-first; no horizontal overflow; long title wraps |
| 5 | Queue at 390x844 | PASS | Table hidden, `dl` label/value rows (5), `scrollWidth == 390`; pagination buttons visible |
| 6 | Status filter (처리 완료) | PASS | `?status=resolved` lists resolved groups with 블라인드됨 badge where applicable |
| 7 | Report detail | PASS | All 3 reports with reporter/time/long detail (wraps), chapter body as plain text, author history ("다른 신고", "과거 조치"), action form scoped to "검토한 미처리 신고 3건" |
| 8 | Reason validation | PASS | Blind with empty reasons: submit blocked, `moderation-reason`/`moderation-reason-public` invalid, no dialog |
| 9 | Confirmation dialog keyboard | PASS | Blind/suspend dialog shows target + effect + public reason; initial focus on 취소; Escape closes without any DB change (verified: 0 new actions/sanctions after Escape) |
| 10 | Chapter blind on purchased paid chapter | PASS | 1 `chapter_blind` action, report resolved, `admin_blinded=true` |
| 11 | Reader view of blinded purchased chapter (390x844) | PASS | "검토 중인 콘텐츠입니다 / 공개 사유 / 이미 소장한 회차예요…" ; body text absent from DOM **and** from a fresh SSR/RSC fetch; internal reason absent |
| 12 | Timed suspension (7 days, KST input 2026-09-24 17:00) | PASS | `user_suspend` action; `user_sanctions` suspension `ends_at=2026-09-24T08:00Z` (correct Asia/Seoul conversion); profile cache `suspension` |
| 13 | Warning while suspended (second tab) | PASS | `user_warn` recorded; profile cache stays `suspension` |
| 14 | Stale conflict | PASS | Tab A (old version) submits 기각 after tab B warned → "다른 관리자가 이 항목을 변경했습니다. 새로고침 후 확인해 주세요." + 새로고침; after refresh "미처리 신고가 없습니다"; no extra action |
| 15 | Self-sanction guard | PASS (UX note) | Warn on own work rejected server-side (`self_sanction_forbidden` → `validation_failed`); UI shows generic "입력 내용을 확인해 주세요." — see finding F-2 |
| 16 | Writer blind notice in studio (own chapter) | PASS after fix | Notice with public reason + "재검토 요청"; copy bug F-1 fixed |
| 17 | Writer re-review request | PASS | Button → "검토 요청됨" (disabled); request appears in admin 재검토 요청 tab |
| 18 | Admin resolves review → 블라인드 해제 | PASS | `review_unblind` action, request `unblinded`, chapter unblinded, detail shows "처리된 요청입니다" |
| 19 | Admin direct unblind of purchased ch2 | PASS | `chapter_unblind` action |
| 20 | Purchased reader restoration + wallet | PASS | Body "유료 본문 — …" readable again without purchase prompt; wallet 40 (50 grant − 10 once); ledger exactly 2 rows; order PAID; 1 entitlement |
| 21 | Dark mode (queue, 390) | PASS | bg lab(2.7) / text lab(98); badges legible |
| 22 | Home feed hydration | PASS after fix | Hydration mismatch on trending badge fixed in 23ffc54; no hydration error after reload |

Final DB snapshot after UAT: 0 open UAT reports, 0 blinded UAT targets, writer "UAT검수작가" suspension until 2026-09-24T08:00Z + 1 warning, 1 review request `unblinded`.

Note: two earlier actions in the audit log (07:34 `report_dismiss` and `work_blind` with reason "ㅁㄴㅇㄹ" on a leftover "테스트 작품") were performed manually by the user in the pane, not by the UAT script.

## Findings

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| F-1 | Low (copy) | `components/moderation/review-request.tsx` rendered "이 회차은" | Fixed e605d3a |
| F-2 | Low (UX) | Self-sanction attempt shows generic validation copy instead of a specific message | Open — not blocking |
| F-3 | Low (hygiene) | Existing reader DB tests leave "테스트 작품" reports in the shared test DB (12 open reports appeared from today's runs) | Open — pre-Phase-7 test hygiene |

## 4. Pending manual acceptance (blocks Phase 7 completion)

Both require logging in as the *sanctioned* user, which the single OAuth admin account cannot be (self-sanction is forbidden by design). Automated coverage exists (`tests/admin/user-flows.test.ts`, `sanctions*.test.ts`), but browser acceptance is not yet observed:

1. **Warning acknowledgement survives reload** — log in with a second account, have the admin warn it, confirm the notice appears, acknowledge, reload, confirm it stays acknowledged.
2. **Suspended user UI** — same second account suspended: write actions (studio save, like, report, purchase) show the suspension copy; purchased chapters and wallet balance remain visible.
