---
phase: 15
slug: jev-ai
status: draft
shadcn_initialized: true
preset: base-nova / neutral base / indigo primary (existing components.json, unchanged)
created: 2026-09-23
---

# Phase 15 — UI Design Contract

> Visual and interaction contract for Phase 15: Jev 선계획 기반 AI 문서 생성 · 저장 위치 선택.
> Scope is two additions on top of existing UI — no new pages, no new routes.
> 1. **저장 직전 확인 모달** (신규) — `AiPanel.tsx`의 "문서로 저장하기" 클릭 시.
> 2. **QuickAddDialog 폴더 선택기** (기존 다이얼로그 확장) — `QuickAddDialog.tsx`.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn (already initialized — `components.json` present, unchanged by this phase) |
| Preset | style: `base-nova`, baseColor: `neutral`, cssVariables: true, no third-party registries |
| Component library | base-ui (project convention — `render` prop, not Radix `asChild`; see `AiPanel.tsx`/`QuickAddDialog.tsx` for the established pattern) |
| Icon library | lucide-react |
| Font | `--font-sans` (project default, `app/globals.css`) |

This phase reuses `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogFooter`, `Select`/`SelectTrigger`/`SelectValue`/`SelectContent`/`SelectItem`, `Button`, `Label`, `Badge`, `Input`, `Textarea` — all already installed under `components/ui/`. No new shadcn components need to be added.

---

## Spacing Scale

Declared values (must be multiples of 4), matching existing `AiPanel.tsx`/`QuickAddDialog.tsx` usage:

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon-to-label gaps, badge internal padding |
| sm | 8px | Field-to-field gaps within a form group (`gap-2`) |
| md | 16px | Section-to-section gaps inside dialog body (`gap-4`), dialog content padding |
| lg | 24px | Not used in this phase's dialogs (reserved for page-level layout, unchanged) |
| xl | 32px | Not used in this phase |

Exceptions: none.

---

## Typography

Matches existing AI panel/dialog conventions exactly — do not introduce new sizes.

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body | 14px (`text-sm`) | 400 (regular) | 1.5 |
| Label | 12px (`text-xs`) | 500 (medium) — `text-muted-foreground` for field labels, `font-medium` for emphasis | 1.5 |
| Heading (dialog title) | 18px (`text-lg`, shadcn `DialogTitle` default) | 600 (semibold) | 1.2 |
| Display | not used in this phase | — | — |

Only 3 sizes total (14 / 12 / 18) and 2 weights (400 / 500–600) — consistent with the existing panel's already-shipped type scale. No new declarations needed.

---

## Color

Unchanged from the project's existing indigo-primary / neutral-base token set (`app/globals.css`) — this phase introduces **zero new color tokens**.

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `--background` (neutral, near-white / near-black in dark mode) | Dialog surface, panel background |
| Secondary (30%) | `--secondary` / `--muted` (neutral gray) | Card-style blocks inside the modal (recommended-folder display box, proposal preview), disabled/read-only rows |
| Accent (10%) | `--primary` (indigo-600 light / indigo-500 dark) | Reserved for: the confirm/save button (모달 "저장하기"), the QuickAddDialog "만들기" button, the selected radio/highlighted folder row, focus rings on the folder `Select` |
| Destructive | `--destructive` (existing red oklch token) | Reserved for: the "저장 위치가 변경되었어요" revalidation-failure banner icon/border, the clarify-question dismiss-and-retry affordance if the writer abandons the flow — never used for the neutral "취소" button, which stays `variant="outline"` per existing convention |

Accent reserved for: primary action buttons (저장하기/만들기), the currently-selected folder/template option, and focus rings only. Not applied to informational text, badges, or secondary buttons.

---

## Copywriting Contract

### 1. 저장 직전 확인 모달 (AiPanel — "문서로 저장하기" 클릭 시)

| Element | Copy |
|---------|------|
| Dialog title | `저장 위치 확인` |
| Recommended folder line | `추천 폴더: {카테고리} › {폴더 경로}` (예: `추천 폴더: 인물 › 조연`) — 굵게, `text-sm font-medium` |
| Recommended template line | `추천 템플릿: {템플릿 이름}` — `text-xs text-muted-foreground` |
| Confidence/plan rationale (optional, if Jev returns a short reason) | `Jev가 이렇게 추천했어요: {reason}` — 1줄, `text-xs text-muted-foreground`, 생략 가능(값 없으면 렌더링 안 함) |
| Folder override control label | `저장 폴더 변경` |
| Template override control label | `템플릿 변경` |
| Primary CTA | `이 위치에 저장하기` |
| Secondary (cancel) | `취소` |
| Saving/pending state (button label swap) | `저장 중...` |
| Success toast | `"{문서 이름}" 문서를 저장했어요.` |

### 2. Clarify 전환 시 (확신도 낮음 — AIDOC-01)

Jev가 `clarify`로 전환되면 모달이 아니라 **채팅 응답** 형태로 표시된다 (기존 `ChatMessageBubble` 패턴 재사용 — 새 UI 엘리먼트 아님). 저장 확인 모달은 이 경우 아예 뜨지 않는다.

| Element | Copy |
|---------|------|
| Clarify prompt intro | `어떤 문서로 저장할지 조금 더 알려주시면 정확하게 도와드릴게요.` |
| Clarify question(s) | Jev가 반환한 질문 그대로, 줄바꿈으로 구분 — 가공하지 않는다 |

### 3. 저장 직전 재검증 실패 (AIDOC-03 — 폴더가 삭제/변경된 경우)

| Element | Copy |
|---------|------|
| Error banner (inside the still-open modal, replaces the recommended-folder display) | `저장 위치가 변경되었어요. 다시 선택해주세요.` |
| Banner style | `AiPanelNotice`/기존 오류 배너와 동일한 톤 — `role="alert"`, destructive-tinted icon (`AlertCircle`), 배경은 `bg-muted`/`border-destructive/30` 수준(전체 빨강 채우기 금지) |
| Recovery action | 폴더 선택 컨트롤이 동일 모달 안에서 즉시 재활성화되고, 최상위 폴더가 기본값으로 다시 채워짐. "저장하기" 버튼은 새 선택이 있을 때만 다시 활성화 |
| Do NOT | 조용히 다른 폴더로 대체 저장 — 모달을 닫지 않고 반드시 재선택을 요구한다 (AIDOC-03) |

### 4. QuickAddDialog 폴더 선택기 (신규 필드)

| Element | Copy |
|---------|------|
| New field label | `저장 폴더` (기존 `문서 이름`, `템플릿 종류` 필드 사이, 템플릿 종류 다음) |
| Select placeholder (loading) | `폴더 불러오는 중...` |
| Select default value | 선택한 카테고리의 최상위 폴더 (표시 텍스트: 폴더명 그대로, 최상위는 `{카테고리} (최상위)`로 구분 표시) |
| Empty/no-subfolder case | 최상위 폴더 단일 옵션만 표시 — 드롭다운은 항상 표시하되 옵션이 1개뿐이어도 비활성화하지 않는다 (다른 카테고리로 바꿀 수 있으므로) |
| Error (folder list fetch failed) | `폴더 목록을 불러오지 못했어요. 최상위 폴더에 저장돼요.` — 조용히 실패하지 않고 안내 후 최상위로 폴백 |

### 5. Destructive Actions

이 페이즈에는 파괴적 액션(삭제류)이 없다 — 저장 확인 모달의 "취소"는 데이터를 파괴하지 않으므로(생성 결과 카드는 유지됨) 별도 확인 다이얼로그 불필요. 재검증 실패 시에도 데이터 손실 없음(재선택 요구일 뿐).

---

## Interaction Contract (phase-specific, beyond copy)

| Trigger | Behavior |
|---------|----------|
| AiPanel: "문서로 저장하기" 클릭 (기존 버튼, 라벨 변경 없음) | 즉시 저장하지 않고 확인 모달을 연다. 제안 카드(`ChatMessageBubble`의 proposal 블록) 자체는 변경 없음 (D-11) |
| 확인 모달 열림 | Jev가 추천한 folder/template를 프리필한 채로 뜬다. 로딩 상태가 필요하면(추천 계산이 저장 클릭 이후에 일어나는 설계라면) 모달 내부에 스켈레톤/스피너 — 별도 페이지 전환 없음 |
| 폴더/템플릿 변경 | 모달을 닫지 않고 인라인 `Select`로 변경 (QuickAddDialog와 동일한 컴포넌트 패턴) |
| "이 위치에 저장하기" 클릭 | 서버 재검증(AIDOC-03) 통과 시 저장 + 모달 닫힘 + 토스트. 실패 시 모달은 열린 채로 에러 배너 표시 (섹션 3 참고) |
| "취소" 클릭 / Esc / 배경 클릭 | 모달만 닫힘, 채팅의 제안 카드는 그대로 남아 다시 "문서로 저장하기"를 누를 수 있음 |
| QuickAddDialog: 템플릿 종류(`category`) 변경 | 폴더 `Select`의 옵션 목록이 새 카테고리 기준으로 다시 조회되고, 값은 해당 카테고리의 최상위 폴더로 리셋 |
| QuickAddDialog: 폴더 변경 없이 "만들기" | 최상위 폴더 기본값으로 그대로 저장 (기존 동작과 동일하되 이제 명시적으로 보임) |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | Dialog, Select, Button, Label, Badge (all already installed, no new adds required) | not required |
| third-party | none | not applicable |

No third-party registries are declared for this phase — vetting gate not triggered.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
