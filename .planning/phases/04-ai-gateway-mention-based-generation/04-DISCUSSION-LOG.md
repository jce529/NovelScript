# Phase 4: AI Gateway (Mention-Based Generation) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-30
**Phase:** 04-ai-gateway-mention-based-generation
**Areas discussed:** AI 패널 배치 & 멘션 컨텍스트 표시, 톤 프리셋 & 자유형 지시어 UI, 생성 결과 삽입 & 재생성 흐름, 비용 추정 & 지출 가드레일 UX, 기본 시스템 프롬프트, AI 모델 티어 & 장르 컨트롤 (user-initiated addition)

---

## Area Selection (multiSelect)

| Option | Description | Selected |
|--------|-------------|----------|
| AI 패널 배치 & 멘션 컨텍스트 표시 | Where the AI panel sits relative to the plain-textarea editor; how mention autocomplete overlays it | ✓ |
| 톤 프리셋 & 자유형 지시어 UI | Preset switch UI; custom-instruction textarea placement | ✓ |
| 생성 결과 삽입 & 재생성 흐름 | How generated text enters the canvas; regenerate flow | ✓ |
| 비용 추정 & 지출 가드레일 UX | Pre-generation estimate format; overage behavior | ✓ |
| 가장 기본적인 시스템 프롬프트 (user free-text "Other") | Baseline system prompt content | ✓ |

---

## AI 패널 배치 & 멘션 컨텍스트 표시

| Option | Description | Selected |
|--------|-------------|----------|
| 우측 고정 사이드패널 | Docs/5-2-style fixed panel, always visible | ✓ |
| 토글 가능한 사이드패널 | Hidden by default, toggled via button | |
| 하단 확장 패널 (시트/드로어) | Hidden, expands from bottom on invocation | |

**User's choice:** 우측 고정 사이드패널 (recommended option)

| Option | Description | Selected |
|--------|-------------|----------|
| 타이핑 위치 근처 오버레이 드롭다운 | Inline overlay near caret, matches docs/5-2 | ✓ |
| AI 패널 내 검색창으로만 | Separate search box inside panel, `@` just types literally in textarea | |

**User's choice:** 타이핑 위치 근처 오버레이 드롭다운 (recommended option)

| Option | Description | Selected |
|--------|-------------|----------|
| 칩 형태, 개별 삭제 가능 | docs/5-2 `[주인공 ✕]` chip concept | ✓ |
| 단순 리스트 (삭제 불가) | Plain list, must delete the `@mention` text itself to remove | |

**User's choice:** 칩 형태, 개별 삭제 가능 (recommended option)

| Option | Description | Selected |
|--------|-------------|----------|
| 미포함 — 기존 문서만 검색 | Matches EDIT-01's literal wording | |
| 포함 — 타이핑 중 즉석 생성 | docs/5-2 quick-add overlay concept, expands scope | ✓ |

**User's choice:** 포함 — 타이핑 중 즉석 생성 (NOT the recommended option — user chose the scope-expanding option)
**Notes:** Captured as D-04, explicit "SCOPE EXPANSION" in CONTEXT.md, flagged for planner re: possible new REQUIREMENTS.md line item.

---

## 톤 프리셋 & 자유형 지시어 UI

| Option | Description | Selected |
|--------|-------------|----------|
| 상단 버튼 그룹 3개 | One-click switch, matches docs/5-2 vision, fits a narrow sidebar | |
| 드롭다운 셀렉트 | Not a single click, but more compact | ✓ |

**User's choice:** 드롭다운 셀렉트 (NOT the recommended option)

| Option | Description | Selected |
|--------|-------------|----------|
| 프리셋 버튼 바로 아래에 인라인 확장 | No separate modal, appears in place | ✓ |
| 별도 모달/팝업으로 설정 | Closer to docs/5-2's "⚙️ 시스템 프롬프트 설정 모달", but REQUIREMENTS.md already excludes a dedicated modal | |

**User's choice:** 프리셋 버튼 바로 아래에 인라인 확장 (recommended option)

---

## 생성 결과 삽입 & 재생성 흐름

| Option | Description | Selected |
|--------|-------------|----------|
| 바로 삽입 (커서 위치에 이어쓰기) | Simplest, most textarea-native | |
| 미리보기 후 수락/거절 | AI panel shows result first, "삽입" button required | ✓ |

**User's choice:** 미리보기 후 수락/거절 (NOT the recommended option)

| Option | Description | Selected |
|--------|-------------|----------|
| 가능 — 동일 멘션/프리셋으로 다시 호출 | Each call is separately billed | |
| 불가 — v1은 1회성 생성만 | Simplest | |

**User's choice:** [No preference] — left as Claude's Discretion (D-11), recommendation: allow regeneration.

---

## 비용 추정 & 지출 가드레일 UX

| Option | Description | Selected |
|--------|-------------|----------|
| 예상 토큰 수치 + 대략적인 원화 환산치 | e.g. "약 1,200 토큰 (≈120원)" | |
| 토큰 수치만 | Just "약 1,200 토큰" | ✓ |

**User's choice:** 토큰 수치만 (NOT the recommended option)

| Option | Description | Selected |
|--------|-------------|----------|
| 생성 버튼 비활성화 + 안내 메시지 | Blocks the call entirely before it fires | |
| 호출은 허용하되 경고만 표시 | Call proceeds, generation continues regardless | |
| (user free-text) 잔여 토큰까지만 생성 후 중단 | Partial generation capped to remaining balance, then stop + notify | ✓ |

**User's choice:** Free-text answer — "잔여 토큰까지만 생성. 이후 토큰이 전부 소모됐더고 알리고 작업 중단." Captured verbatim as D-13.

---

## 가장 기본적인 시스템 프롬프트 (multiSelect)

| Option | Description | Selected |
|--------|-------------|----------|
| 웹소설 작가 보조라는 역할 규정 | Base persona/frame — implies genre/style conventions | |
| 콘텐츠 정책 가드레일 | Minimal safety guard against illegal/harmful content | ✓ |
| 기존 설정(KB 문서) 내용과 모순되지 않게 유지하라는 지시 | Explicit non-contradiction instruction | ✓ |
| 본문과 자연스럽게 이어지는 문체 유지 | Style-continuity instruction | ✓ |

**User's choice:** Content-policy guardrails + non-contradiction with KB docs + style continuity (3 of 4 selected; role-framing option not selected). Captured as D-14.

---

## AI 모델 티어 & 장르 컨트롤 (user-initiated addition, not from the original gray-area menu)

User's original message: "톤 프리셋 버튼 옆에 추가할 버튼이 2개 있어. 일단 프리셋의 왼쪽에 어떤 AI모델을 사용할지 정하는 버튼 마찬가지로 드롭다운 버튼이고, 오른쪽에 어떤 장르의 소설을 쓸 것인지(판타지, 로맨스, 현대 등 그리고 사용자 지정) 이렇게 두 가지 버튼을 추가하고 싶어"

Clarifying question 1:

| Option | Description | Selected |
|--------|-------------|----------|
| Gemini 계열 내 모델 티어 선택 | Stays inside PROJECT.md's single-vendor constraint | ✓ |
| 여러 벤더(타 LLM API) 중 선택 | Would reopen the "1 vendor only, BYOK is v2" decision | |

**User's choice:** Gemini 계열 내 모델 티어 선택 (recommended option). Captured as D-06.

Clarifying question 2:

| Option | Description | Selected |
|--------|-------------|----------|
| 작품 장르를 기본값으로 보여주고, 생성 시만 다르게 상향 가능 | Defaults to Phase 2 D-04's work genre, overridable per generation | ✓ |
| 작품 장르와 무관한 별개 생성-전용 설정 | Fully independent from work metadata | |

**User's choice:** 작품 장르를 기본값으로 보여주고, 생성 시만 다르게 상향 가능 (recommended option). Captured as D-07.

Layout placement (from user's original message, not a separate AskUserQuestion): AI 모델 티어 (left) — 톤 프리셋 (center) — 장르 (right), all dropdown selects in one row. Captured as D-05.

---

## Claude's Discretion

- Exact model-tier names/count and pricing mapping to the EDIT-05 cost estimate.
- Quick-add (D-04) overlay's exact fields/validation.
- Preview/accept-reject (D-10) exact UI (inline diff vs. plain block).
- Regeneration UX details if implemented (D-11).
- Exact wording of the D-14 baseline system prompt.
- Concrete per-request/per-user spend cap numeric values.

## Deferred Ideas

- Multi-vendor/BYOK AI provider selection — already v2, not reopened (D-06 confirms).
- 3-panel full canvas, ghost-text, dedicated system-prompt modal, KB graph view, real-time cost gauge, beginner prompt chips — already excluded from v1, not reopened.
- Whether D-04/D-05/D-06/D-07 warrant new REQUIREMENTS.md line items — flagged, not resolved this session.
