---
phase: 14-mcp-write-review
plan: 06
subsystem: proposals-ui
tags: [review-queue, review-detail, server-actions, a11y, mobile-375]
requires: [14-05]
provides:
  - app/studio/[workId]/review/page.tsx
  - app/studio/[workId]/review/[proposalId]/page.tsx
  - app/studio/[workId]/review/[proposalId]/actions.ts
  - components/proposals/proposal-queue.tsx
  - components/proposals/proposal-detail.tsx
affects: [14-07, 14-08, 14-09]
tech-stack:
  added: []
  patterns:
    - server pages await params/searchParams (Next 16); client component only for the interactive detail and tabs
    - thin 'use server' wrappers (createClient + auth.getUser + revalidatePath(`/studio/{workId}`, 'layout')) over lib/proposals/actions
    - pure view-model module (components/proposals/review-model.ts) shared by server and client, unit-tested
    - KST date formatting without ICU (same text on server and browser)
key-files:
  created:
    - app/studio/[workId]/review/page.tsx
    - app/studio/[workId]/review/[proposalId]/page.tsx
    - app/studio/[workId]/review/[proposalId]/actions.ts
    - components/proposals/proposal-queue.tsx
    - components/proposals/queue-client.tsx
    - components/proposals/proposal-detail.tsx
    - components/proposals/review-model.ts
    - tests/proposals/review-ui.test.ts
  modified:
    - .planning/phases/14-mcp-write-review/14-UI-SPEC.md
requirements: [MCP-06, MCP-07]
decisions:
  - New-document folder choice is a native radio fieldset (approved KbNew mockup board), legend `저장할 폴더`, no default; not the Base UI Select named in UI-SPEC D
  - The bottom decision bar is `sticky bottom-0` at all widths (not `fixed` on mobile) because the studio stage <main> is the mobile scroll container and the studio mobile tab bar sits at the bottom
  - Filter tabs are links with tablist/tab roles and arrow-key focus movement; the filter lives only in `?status=`
  - Reject success navigates to `/studio/{workId}/review?notice=rejected`, which renders a focused role=status `제안을 거절했어요.`
  - Dialogs are mounted only when their action is possible (accept/reject while pending, revert while canRevert)
  - Stale results replace the view with the server's fresh detail and clear every selection and 직접 고침 text
metrics:
  duration: ~70min
  completed: 2026-11-06
---

# Phase 14 Plan 06: Review queue + detail UI Summary

Built the work review queue and the proposal review detail on top of the 14-05 lib. The queue shows each proposal's source (client name, host, `연결 해제됨`) and KST arrival time. The detail covers all three proposal kinds. Chapter drafts and document edits get an A안 checkbox per chunk, `직접 고치기`, the stale re-compare banner and blocked states. New documents require an explicit folder choice. All three kinds get accept/reject/revert confirmation dialogs. Every decision goes through thin cookie-session Server Actions to `lib/proposals/actions.ts`.

## What was built

**Routes**
- `/studio/[workId]/review` — queue; `?status=pending` (default) | `done` | `all`; `?notice=rejected` shows the post-reject status message.
- `/studio/[workId]/review/[proposalId]` — detail. It always renders the server's current state: pending, accepted, rejected, superseded, expired or reverted.

**Queue (`components/proposals/proposal-queue.tsx`, `queue-client.tsx`)**
- Header: `h1 리뷰 큐` with the contract description. A back link goes to the work.
- Tabs: `대기 중 n` / `처리됨` / `전체`, with role=tablist and aria-selected. Each tab is at least 44px and the three share equal widths at 375px.
- Card (`<ul aria-label="제안 목록">` > `<li aria-labelledby>`): kind label, status badge (text label, outline+600 for 검토 대기), h3 title (`{회차} 초안` / `{문서} 수정안` / `{제안 제목}`).
  - Meta `<dl>`: client name (600), host plus `연결 해제됨`, `도착 방금 전 | n분 전 | n시간 전 | YYYY. M. D. 오후 h:mm`, and `만료까지 n일` when 7 days or fewer remain.
  - Summary line: `바뀐 부분 n곳` or `카테고리 X`.
  - Link: `검토하기` for pending, otherwise `내용 보기`. The aria-label includes the title, the link is full width on mobile and at least 44px tall.
- Empty states per filter, with the `AI 커넥터 관리` link on the pending tab. A load error shows a role=alert card with the fixed copy and a `다시 불러오기` button (router.refresh). The suspended caption comes from `checkWriteAccess(...).code === 'write_suspended'`.

**Detail (`components/proposals/proposal-detail.tsx`, client)**
- Header: back link `리뷰 큐로 돌아가기`, h1 (`… 초안 검토` / `… 수정안 검토` / `… 새 설정집 문서 검토`) focused on entry, status badge (`일부 반영됨` when only some chunks were accepted), source line `{client} · {host}에서 {도착}에 보냈어요`.
- Chunks (chapter_draft, kb_edit):
  - Structure: `<ol>`, with each `<li aria-label="{n}번째 변경, {바뀜|추가|삭제|적용할 수 없음}">`.
  - Selection: a 44px `<label>` around a native checkbox (`accent-primary size-5`) with text `{n}번째 변경 반영`. The `반영함`/`반영 안 함` state is written out as text, and the checkbox's `aria-describedby` points at the comparison body.
  - Panels: `지금 본문`/`AI 초안` (or `지금 내용`/`수정안`). They sit side by side from md up and stack vertically below md. One-sided chunks drop the missing panel on mobile and show a placeholder sentence on desktop.
  - Folding: long `바뀜` chunks fold with `max-md:line-clamp-6` and get a `전체 보기`/`접기` button (aria-expanded, md:hidden).
  - `직접 고치기`/`고치기 닫기` (aria-expanded) appears only on applicable 추가/바뀜 chunks. The textarea is labelled `반영할 내용을 직접 고쳐요` and pre-filled with `hunk.after`, trailing newlines included. It also shows `고친 내용이 AI 초안 대신 본문에 들어가요.`, an `AI 초안으로 되돌리기` button, and a `직접 고침` badge once the text differs.
  - Bulk controls: `전체 선택`/`전체 해제`, which skip non-applicable chunks. The `n/m개 선택` count has role=status.
  - Stale: a role=alert card `원본이 바뀌었어요` with body copy per kind and the `선택을 처음부터 다시` caption. Non-applicable chunks get a destructive `적용할 수 없음` label and explanation, and their checkbox is disabled with aria-disabled. When nothing is applicable, the detail shows `반영할 수 있는 부분이 없어요…`.
  - Locked document (Lock card, bg-muted) and deleted chapter or document: checkboxes and CTA are disabled, `이 제안 거절하기` stays enabled. A deleted target shows only the proposal text.
- kb_create:
  - Content area: category row (`카테고리` + outline badge + `AI가 정한 카테고리예요.`), then `AI가 제안한 내용`.
  - Folder choice: fieldset `저장할 폴더` with radios for the category root (`최상위`) and its subfolders, no default. `설정집에 저장하기` stays disabled until a folder is chosen.
  - No folder available: notice plus `설정집 열기`.
  - Errors: `folder_changed` clears the choice and shows an alert. `mcp_name_collision` shows the alert copy from UI-SPEC D.
- Bottom bar: sticky, with `border-t bg-card` and safe-area bottom padding.
  - Left side: `선택한 변경 n개` plus `체크하지 않은 변경은 반영되지 않아요.`. When 0 chunks are chosen it also shows `반영할 부분을 하나 이상 골라 주세요.`.
  - Buttons: in the DOM, reject comes first and the accent CTA `선택한 n개 반영하기` second. Mobile uses `flex-col-reverse` so the CTA sits on top, both full width and at least 44px tall.
- Dialogs (Base UI, `initialFocus` = safe button, closing is blocked while a request is in progress):
  - Accept: `선택한 n개를 본문에 반영할까요?` with the per-kind body. Buttons `취소`/`반영하기`; shows `반영하는 중…` while running.
  - Reject: `이 제안을 거절할까요?`. Buttons `제안 유지하기`/`거절하기` (destructive, `aria-label="{카드 제목} 거절 확인"`). Errors show role=alert inside the dialog.
  - Revert: `반영을 되돌릴까요?`. Buttons `닫기`/`반영 되돌리기` (destructive).
    - If the RPC returns `confirm_required`, the dialog stays open and shows the alert `반영한 뒤 본문이 다시 바뀌었어요. 되돌리면 그 수정도 사라져요.`. The next click sends `{confirm: true, seenHash: confirmHash}` unchanged; a second `confirm_required` updates the hash.
- Results:
  - Accept success (`n개를 본문에 반영했어요.` / `n개를 설정집에 반영했어요.` / `{폴더} 폴더에 새 문서를 저장했어요.`) and revert success (`이 제안을 반영하기 전 본문으로 되돌렸어요.`) appear in a focused role=status region.
  - Errors appear in a focused role=alert region using the fixed copy from `PROPOSAL_ERROR_COPY` via `result.error`.
  - Accepted view: `회차 열기`/`문서 열기`, `반영 되돌리기` while revert is still possible, `{YYYY. M. D.}까지 되돌릴 수 있어요.`, or `되돌릴 수 있는 기간이 지났어요.`. Chunks are listed read-only with `반영함`/`반영 안 함`/`직접 고침`.

**Server Actions (`app/studio/[workId]/review/[proposalId]/actions.ts`, `'use server'`)**
- `acceptProposalAction(input)`, `rejectProposalAction({workId, proposalId})` and `revertProposalAction({workId, proposalId, confirm?, seenHash?})`.
- Each one: `createClient()` → `auth.getUser()`. With no user it returns `forbidden` and never calls lib. Otherwise it calls the lib function with the session user ID. On `ok` only, it calls `revalidatePath('/studio/{workId}', 'layout')`. Exceptions are turned into the fixed `*_failed` copy.
- No admin client, no bearer path. The client sends only proposal ID, seenHash, chosen indexes plus optional editedText, or folderId+folderVersion (`buildAcceptInput`).

**UI-SPEC (Task 3)**: added one row to section D: `이름 충돌 (mcp_name_collision 응답)` → `같은 이름의 문서가 있어요. 다른 폴더를 선택하거나 제안을 거절해 주세요.`. No other contract text changed.

## Commits

| Task | Commit | Message |
|---|---|---|
| 1 RED | 1c6148e | test(14-06): add failing tests for review queue and selection helpers |
| 1 GREEN | 27fea9e | feat(14-06): work review queue with filter tabs, source and empty/error states |
| 2 | df2f2d5 | feat(14-06): proposal review detail with chunk selection, direct edit and decision dialogs |
| 3 | 1d4572d | docs(14-06): add name-collision copy to the kb_create UI contract |

## Verification (run directly in this session)

- `node node_modules/vitest/vitest.mjs run tests/proposals/review-ui.test.ts tests/proposals/actions.test.ts --project unit`: 2 files, **79 passed, 0 failed, 0 skipped**. `review-ui` is 38 tests.
- `node node_modules/vitest/vitest.mjs run tests/proposals tests/mcp --project unit`: 18 files, **499 passed, 0 failed, 0 skipped**. That is 461 from 14-05 plus 38 new.
- eslint on `app/studio/[workId]/review/**`, `components/proposals/**` and the new test file: clean.
- `tsc --noEmit`: only the known `app/layout.tsx` `LayoutProps` error.
- No DB tests were run (no DB code changed, no migrations).
- Plan acceptance strings:
  - `page.tsx` has `await params` and the `status` filter.
  - The queue has `제안 목록`, `검토하기`, `연결 해제됨` and `role="alert"`.
  - The detail has `원본이 바뀌었어요`, `직접 고치기`, `AI 초안으로 되돌리기`, `선택한`, `반영 되돌리기` and `저장할 폴더`.
  - `actions.ts` has `'use server'` and calls `acceptProposal`/`rejectProposal`/`revertProposal`.
  - The UI-SPEC check (`node -e …`) prints ok.

## Browser check guide (for the orchestrator; not done here: no browser)

Sign in as the work's owner (writer). To create proposals, use the MCP tools (`save_draft`, `propose_kb_document`) against the disposable DB, or seed rows the way `tests/helpers/proposals-db.ts` does. Check desktop and 375px.

| Screen / state | How to reach it |
|---|---|
| Queue, pending | `/studio/{workId}/review` once at least one pending proposal exists |
| Queue, empty | same URL with no pending proposals; `?status=done` with no decided proposals shows the other empty copy |
| Queue, 처리됨 / 전체 | `?status=done`, `?status=all` (expired = pending past `expires_at`; superseded = second `save_draft` for the same chapter) |
| `연결 해제됨` | disconnect the connector in `/studio/settings/mcp-connections` after a proposal arrived |
| Suspended caption | writer with an active sanction (`get_write_access` → suspended) |
| Detail, chapter draft | `검토하기` on a `회차 초안` card |
| Stale banner + `적용할 수 없음` | after the proposal arrives, edit the chapter in the editor (change or delete a paragraph a chunk touches), then open or reload the detail. Submitting with an old page after another-tab edit returns stale and re-renders with selections cleared |
| Direct edit | `직접 고치기` on a 바뀜/추가 chunk, type, then `AI 초안으로 되돌리기` |
| kb_edit, locked / deleted | lock the target document (or delete it) before opening the `설정집 수정안` detail |
| kb_create, folder radios / none | `설정집 새 문서` detail; for the "no folder" copy use a category without a root folder in the work |
| Name collision | create a document with the proposed name in the chosen folder before clicking `설정집에 저장하기` |
| Accepted + revert, confirm flow | accept, then edit the chapter, then `반영 되돌리기`; the first click shows the in-dialog warning, the second click reverts |
| Reject → queue notice | `이 제안 거절하기` → `거절하기`; it lands on `/studio/{workId}/review?notice=rejected` |

## Deviations from Plan

### Auto-fixed / adjusted

**1. [Rule 3 - Blocking] Test file is `tests/proposals/review-ui.test.ts`, not `.tsx`**
- `vitest.config.ts` `listTestFiles` collects only `*.test.ts`, so a `.tsx` file would never run. Components are rendered with `React.createElement` + `renderToStaticMarkup`, the same way as the existing UI tests.

**2. [Rule 2 - Testability] Extra files `components/proposals/review-model.ts` and `components/proposals/queue-client.tsx`**
- `review-model.ts` holds pure helpers: labels, KST formatting, the selection rules, and the accept payload builder (no chunk text).
- `queue-client.tsx` holds the client-only tabs, notice and reload button, so `proposal-queue.tsx` stays server-renderable.

**3. Folder picker = radio fieldset (approved KbNew mockup) instead of `Select`**
- The contract invariants still hold: label/legend `저장할 폴더`, no default, only folders of the proposed category in this work, full width on mobile, 44px rows.

**4. Bottom bar `sticky` instead of mobile `fixed`**
- In the studio layout the stage `<main>` is the mobile scroll container and the studio's mobile tab bar is at the bottom. A `fixed` bar would cover that nav, while a sticky bar at the end of the flow never covers content.

**5. Arrival label `n분 전` under one hour**
- The spec only defines `방금 전` (< 1 minute) and `n시간 전`. Without a minutes step it would read `0시간 전`.

**6. Copy added where the contract was silent**
- Deleted chapter: `삭제된 회차라 반영할 수 없어요` / `이 제안이 가리키는 회차가 삭제됐어요. 제안을 거절해서 정리해 주세요.`
- kb_create accept dialog: title `설정집에 새 문서를 저장할까요?`, body `{폴더} 폴더에 새 문서 {제목}을(를) 만들어요.`
- kb_edit revert warning: `반영한 뒤 문서가 다시 바뀌었어요…`
- Error copy otherwise comes from 14-05's `PROPOSAL_ERROR_COPY`.

## Known gaps / follow-ups (not stubs; the plan's goal is met)

- **`변경 없는 문단 {k}개` collapsed context rows (UI-SPEC B) are not rendered.** The approved mockup boards do not show them. Only changed chunks are listed. Candidate for 14-08 or a polish task.
- **The `대기 상한 도달` caption (50 pending per writer) is not shown.** It needs a writer-wide pending count that 14-05 does not expose. `countPendingProposalsByWork` would need the writer's work list.
- **Mobile `전체 보기` folding uses a length/line heuristic** (more than 240 characters or more than 6 lines) instead of measuring rendered height.
- 14-05 carry-overs still apply:
  - A proposal that only changes trailing whitespace has 0 chunks. It shows `반영할 수 있는 부분이 없어요`, and only reject is possible.
  - The `처리됨` ordering caveat.
  - The editor in another tab can overwrite an accepted chapter.
- `AI와 다듬기` (14-08) is not built. The chunk header leaves room next to `직접 고치기`.
- High-risk plan: a Codex read-only cross-review of 14-06 is recommended (14-HANDOVER §5).

## Codex cross-review follow-up (gpt-6-sol: PASS, 0 blockers, 3 warnings fixed)

Commit **0a1acbf** `fix(14-06): completed view matches applied chunks, shows 직접 고침 text, focuses dialog alerts`

1. **Completed view vs. applied chunks after a stale refresh.**
   - Before: on accept success the view fell back to the original server detail, which did not match the indexes the writer submitted against the refreshed hunks.
   - Fix: the new pure `acceptedOutcome(shown, chosen, edits, result, folderName)` freezes the detail that was on screen (including the stale re-compare). It keeps only the indexes actually submitted (non-applicable ones are never reported as applied), the edited indexes and the submitted 직접 고침 texts.
   - The component renders `outcome.snapshot` after accept, and after a revert that follows an accept in the same session.
2. **직접 고침 text in the read-only result.**
   - Same session: `completedChunkText(hunk, decision, submittedTexts)` shows the submitted text, with panel label `직접 고친 내용` and the `직접 고침` badge.
   - After a reload: the server keeps only `edited_indexes`, not the per-chunk text. The view shows the AI text with the note `직접 고친 내용으로 반영했어요. 반영된 글은 원문에서 확인해 주세요.`
3. **Focus for in-dialog alerts.**
   - The reject error, revert error and revert `confirm_required` warning are now `tabIndex={-1}` with refs.
   - A tick counter, together with the pure `dialogAlertTarget(dialog, error, warning)`, moves focus to whichever of them appeared, including the same message appearing again.

**Tests:**
- `review-ui` grew from 38 to 43 tests. New coverage: stale-snapshot outcome, submitted/reload text, reload note render, the focus-target helper, and a source check that the three alerts are focusable `role="alert"` elements.
- `tests/proposals tests/mcp --project unit`: 18 files, **504 passed, 0 failed, 0 skipped**.
- eslint on the changed files: clean. `tsc`: only the known `LayoutProps` error.
- Focus movement itself was not exercised in a browser. It needs the 14-09 / orchestrator browser check.

## Self-Check: PASSED

- Files exist:
  - app/studio/[workId]/review/page.tsx
  - app/studio/[workId]/review/[proposalId]/page.tsx
  - app/studio/[workId]/review/[proposalId]/actions.ts
  - components/proposals/{proposal-queue,queue-client,proposal-detail}.tsx
  - components/proposals/review-model.ts
  - tests/proposals/review-ui.test.ts
- Commits exist: 1c6148e, 27fea9e, df2f2d5, 1d4572d.
