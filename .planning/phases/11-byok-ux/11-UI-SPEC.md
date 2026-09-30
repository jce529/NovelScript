---
phase: 11
slug: byok-ux
status: approved
shadcn_initialized: true
preset: base-nova
created: 2026-09-30
---

# Phase 11 — UI Design Contract

> BYOK 실제 호출 시의 AI 패널 표시, 4종 실패 안내·명시 대체 동의, 제공자 카드 내 이번 달 사용량을 위한 시각·상호작용 계약. `11-CONTEXT.md` D-01~D-14를 고정 결정으로 따르고, `10-UI-SPEC.md`(토큰·타이포·색·배지·카드 구조)를 그대로 상속한다. 이 문서는 새로 추가·변경되는 부분만 정의한다.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn (`components.json` 존재, style `base-nova`, baseColor `neutral`) |
| Preset | `base-nova` — 신규 preset 변경 없음 |
| Component library | Base UI (`@base-ui/react`); 기존 `Button`, `Badge`, `Select`, `Dialog` 재사용 (신규 컴포넌트 설치 없음) |
| Icon library | lucide-react (`AlertCircle`, `RotateCw`, `ChevronDown`, `Info` 등 기존 사용분); 아이콘은 텍스트 보조용 |
| Font | Geist Sans (`font-sans`) |

**변경 대상 화면 (2곳):**
1. AI 패널 (`app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanel.tsx`, `AiPanelNotice.tsx`) — 게이지·예시 비용 대체, [보내기] 활성화, 실패 알림 카드 확장.
2. `/studio/settings/ai-providers`의 `ByokKeyCards.tsx` — 제공자 카드 안 사용량 행 추가.

새 대화 로그 말풍선·전용 사용량 페이지·모달은 만들지 않는다 (D-04, Deferred).

---

## Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | 배지와 글자, 사용량 라벨-값 간격 |
| sm | 8px | 알림 카드 버튼 간격, 사용량 행 간격, 카드 내 정보 행 |
| md | 16px | 카드 내부 요소 간격 |
| lg | 24px | 카드 안쪽 여백(`p-6`) |
| xl | 32px | 페이지 여백(변경 없음) |
| 2xl | 48px | 사용하지 않음 |
| 3xl | 64px | 사용하지 않음 |

Exceptions: AI 패널 알림 카드는 기존 `p-3`(12px)·`gap-1`/`pt-2`를 그대로 유지한다(기존 구현 준수, 이 phase에서 수정하지 않음). 신규 요소는 위 4의 배수만 쓴다. 모델별 상세 펼침 행은 좌측 들여쓰기 없이 `border-t border-border pt-2`로 구분한다. [출처: Phase 10 UI-SPEC, `AiPanelNotice.tsx`]

---

## Typography

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Caption (패널 보조·안내 한 줄) | 12px (`text-xs`) | 400 | 1.5 |
| Body / Label / button | 14px (`text-sm`) | 400 (본문) / 600 (라벨·버튼·제공자명·알림 제목) | 1.5 |
| Section heading (카드 제목) | 18px (`text-lg`) | 600 | 1.2 |

3개 크기(12/14/18px), 2개 굵기(400/600)만 신규 요소에 사용한다. 패널의 기존 `text-xs`(안내·게이지 자리)와 `text-sm`(알림 카드)을 그대로 따르며, 신규 문구에 `font-medium`(500)을 추가하지 않는다(기존 알림 제목의 `font-medium`은 그대로 두되 신규 요소는 600). 사용량 숫자는 `tabular-nums`를 적용한다. [출처: `AiPanel.tsx`, `AiPanelNotice.tsx`, Phase 10 UI-SPEC]

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `bg-background` | 패널·페이지 바탕 |
| Secondary (30%) | `bg-card` / `bg-muted`, `border-border` | 알림 카드(`bg-muted`), 제공자 카드, 사용량 행 구분선 |
| Accent (10%) | `bg-primary` / `text-primary` / `ring` | 아래 reserved 목록만 |
| Destructive | `text-destructive`, `border-destructive/40` | 실패 알림 제목·아이콘·테두리, 무효 키 `검증 실패` 배지 |

Accent reserved for: `보내기` 기본 버튼, 알림 카드의 `서비스 키로 보내기` 버튼(단, 아래 규칙 참고), 키보드 포커스 링. 그 외 사용량 숫자·안내 한 줄·`다시 시도`·`설정에서 키 확인`에는 accent를 쓰지 않는다.

- `다시 시도`, `취소`는 기존 `variant="outline"`/`ghost`. `서비스 키로 보내기(지갑 토큰 차감)`는 사용자가 비용 주체를 바꾸는 동의 행동이므로 `variant="default"`(accent) 하나만 강조하고, `취소`는 `outline`. `설정에서 키 확인`은 `variant="outline"`의 링크(`Link`) 버튼.
- BYOK 안내 한 줄은 `text-muted-foreground`. 배지는 기존 `[BYOK]`=`secondary`, `[서비스 키]`=`outline`을 유지한다. 색만으로 결제 주체를 전달하지 않는다(문자 라벨 필수).
- 새 색 토큰·브랜드 색 추가 없음. 크레딧 소진·레이트리밋 등 4종 모두 동일한 error 변형(destructive 톤)을 쓰고 색으로 원인을 구분하지 않는다 — 원인은 제목 문구로 구분한다. [출처: Phase 10 UI-SPEC, `AiPanelNotice.tsx`]

---

## Copywriting Contract

### AI 패널 — 표시 (D-01, D-03)

| Element | Copy |
|---------|------|
| BYOK 안내 한 줄 (게이지·예시 비용 자리에 대체, `role` 없음 정적 텍스트 `text-xs text-muted-foreground`) | `내 키로 호출해요 · 지갑 토큰은 차감되지 않아요` |
| 서비스 키 선택 시 | 기존 게이지·`입력 1,000 + 출력 1,000 토큰 기준 약 {N} 지갑 토큰 · 실제 비용은 사용량에 따라 달라져요` 그대로 |
| Primary CTA | `보내기` (BYOK 선택 시에도 활성; 입력이 비었거나 생성 중일 때만 비활성) |
| 제거 | `BYOK_COPY.sendBoundary`(`BYOK 모델 호출은 아직 준비 중이에요…`)와 `CHAT_COPY.byokPending`, `keySource === 'byok'` 비활성 조건·상태 문구 |

BYOK 선택 시 지갑 잔액 0이어도 [보내기]는 잠기지 않으며 잔액 부족 안내를 표시하지 않는다.

### AI 패널 — 실패 알림 카드 (D-04, D-05, D-06)

기존 `AiPanelNotice`(`variant: 'error'`)를 재사용한다. 제목(`title`)은 원인, 본문(`body`)은 다음 행동이다. 제공자 표시명은 `PROVIDER_LABEL`(`OpenAI` / `Anthropic` / `Gemini`)로 채운다. 원문 키, 제공자 응답 본문, HTTP 상태, 멱등 키는 어디에도 표시하지 않는다.

| 원인 (kind) | 제목 | 본문 | 버튼 |
|-------------|------|------|------|
| 무효·폐기 키 | `{제공자} 키를 사용할 수 없어요` | `키가 유효하지 않거나 폐기됐어요. 설정에서 키를 확인하고 다시 등록해 주세요. 이 키는 검증 실패로 표시했어요.` | `설정에서 키 확인` (→ `/studio/settings/ai-providers`); `다시 시도` 없음 |
| 레이트리밋 | `{제공자} 요청 한도에 도달했어요` | `잠시 뒤 다시 시도해 주세요. 키 상태는 그대로예요.` | `다시 시도` |
| 크레딧 소진 | `{제공자} 크레딧이 부족해요` | `{제공자}에서 크레딧을 충전한 뒤 다시 시도해 주세요. 키 상태는 그대로예요.` | `다시 시도` |
| 타임아웃·장애 | `{제공자}에 연결할 수 없어요` | `잠시 뒤 다시 시도해 주세요. 키 상태는 그대로예요.` | `다시 시도` |

- 재시도는 사용자가 직접 누를 때만 동작한다. 같은 멱등 키·같은 스냅샷을 재사용하며(기존 `handleRetry`, `failedAttemptRef`) 자동 재시도는 없다. 재시도 중에는 기존처럼 `disabled={isGenerating}`. 알림이 나타나면 `다시 시도`로 포커스가 이동한다(기존 동작). 무효·폐기 키는 `다시 시도`가 없으므로 포커스를 `설정에서 키 확인`으로 이동한다.
- 무효·폐기 키에서만 해당 키 상태를 `검증 실패`로 전환하고, 이후 피커에서 그 제공자 BYOK 항목이 사라진다. 나머지 3종은 상태를 바꾸지 않는다(BYOK-05).

### AI 패널 — 대체 동의 (D-06, PROV-06)

선택한 BYOK 키를 쓸 수 없을 때(이미 `검증 실패`이거나 전송 직전 삭제) 서버는 전송하지 않고 아래 알림 카드를 반환한다. 서비스 키로의 조용한 전환은 없다.

| Element | Copy |
|---------|------|
| 제목 | `선택한 {제공자} 키를 사용할 수 없어요` |
| 본문 (같은 모델의 서비스 키가 있음) | `{모델명} [서비스 키]로 대신 보낼 수 있어요. 이 경우 지갑 토큰이 차감돼요.` |
| 본문 (서비스 키 미제공 모델 → Gemini 기본값, Phase 10 D-09) | `{모델명}은 서비스 키로 제공되지 않아요. Gemini 3.5 Flash [서비스 키]로 대신 보낼 수 있고, 이 경우 지갑 토큰이 차감돼요.` |
| 동의 버튼 | `서비스 키로 보내기 (지갑 토큰 차감)` |
| 취소 버튼 | `취소` (알림 닫기, 입력 내용과 선택은 유지) |
| 보조 링크 | `설정에서 키 확인` (텍스트 링크, 카드 하단) |

- 버튼 순서: `서비스 키로 보내기 (지갑 토큰 차감)` → `취소`. 좁은 폭에서는 `flex-wrap`으로 줄바꿈하며 버튼 텍스트는 잘라내지 않는다.
- 카드 등장 시 초기 포커스는 `취소`에 둔다(과금 주체를 바꾸는 동작이 실수로 실행되지 않도록). 알림 영역은 `role="alert"`로 읽힌다.
- 동의 시에만 해당 한 번의 전송이 서비스 키 항목으로 나가며, 패널의 선택값은 서비스 키 항목으로 바뀌고 기존 서비스 키 비용 게이지가 다시 표시된다.

### 설정 — 이번 달 사용량 (D-08, D-09, D-10)

각 제공자 카드의 등록된 상태에서만 표시한다(미등록 카드는 표시하지 않음).

| Element | Copy |
|---------|------|
| 사용량 소제목 | `이번 달 사용량` (KST 기준 매월 1일 00시부터) |
| 사용량 한 줄 요약 | `{N}회 · 입력 {X} · 출력 {Y} 토큰` (숫자는 `toLocaleString('ko-KR')`, 예: `12회 · 입력 34,500 · 출력 8,200 토큰`) |
| 기준 안내 (`text-xs text-muted-foreground`) | `매월 1일 00시(한국 시간)부터 집계해요.` |
| 펼침 토글 (닫힘 / 열림) | `모델별 보기` / `모델별 접기` |
| 모델 행 | `{모델명}` (`600`) + `{N}회 · 입력 {X} · 출력 {Y} 토큰` |
| 빈 상태 (사용 기록 없음) | 소제목 `이번 달 사용량` 아래 `이번 달에는 아직 사용 기록이 없어요.` (펼침 토글 숨김) |
| 로딩 실패 | `사용량을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.` (`role="alert"`, 카드의 나머지 기능은 그대로 동작) |

금액·예상 비용·원화/USD 표기는 어디에도 넣지 않는다(D-09). `검증 실패` 카드도 사용량은 그대로 표시한다.

### 일반

| Element | Copy |
|---------|------|
| Empty state heading | `미등록` (기존 카드 상태) / 사용량 없음은 위 빈 상태 |
| Empty state body | `이번 달에는 아직 사용 기록이 없어요.` |
| Error state | 위 4종 실패 표 (원인 + 다음 행동) |
| Destructive confirmation | 이 phase에 새 파괴적 행동 없음. 기존 `키 삭제` 다이얼로그(Phase 10) 유지. 단, `서비스 키로 보내기 (지갑 토큰 차감)`는 비용 주체를 바꾸는 명시 동의 행동으로 취급하며 본문에 차감 사실을 함께 표시한다. |

---

## Interaction Contract

1. **모델 선택 → 표시 전환:** 피커에서 `[BYOK]` 항목을 선택하면 지갑 토큰 비용 게이지와 예시 비용 문구를 즉시 숨기고 같은 자리에 BYOK 안내 한 줄을 표시한다. `[서비스 키]` 항목으로 돌아오면 원래 게이지·예시 비용이 복원된다. 자리 높이가 크게 변하지 않도록 한 줄(`text-xs`)로 유지하고 줄바꿈이 필요하면 `break-keep`.
2. **보내기:** BYOK 선택 시 [보내기]는 서비스 키와 동일하게 입력이 있고 생성 중이 아닐 때 활성. 생성 중에는 기존 `isGenerating` 상태(입력·버튼 비활성)를 그대로 쓴다. 클라이언트가 보낸 `keySource`는 참고 값일 뿐 서버가 매 호출 결제 주체를 재도출한다(D-07) — UI는 서버가 반환한 결과(성공/실패 종류)에 맞춰 알림만 표시한다.
3. **실패 표시:** 4종 실패는 기존 알림 카드 영역(입력창 위, `role="alert"` `aria-live="assertive"`, `max-h-48 overflow-y-auto`)에 표시된다. 알림 카드에는 `알림 닫기` 아이콘 버튼이 항상 있고 닫아도 입력 내용은 유지된다.
4. **대체 동의:** 위 대체 동의 카드에서 사용자가 `서비스 키로 보내기 (지갑 토큰 차감)`를 누를 때만 서비스 키로 전송한다. `취소` 또는 닫기는 아무것도 전송하지 않고 선택한 BYOK 항목을 유지한다(사용 불가 상태이므로 피커에서는 목록 갱신 후 사라질 수 있으며, 그 경우 계정 기본값으로 복원 + `이번 전송에만 적용돼요` 안내는 기존 규칙을 따른다). 지갑 잔액이 부족하면 기존 `insufficient_balance` 알림을 표시한다.
5. **사용량 카드:** 카드 안 정보 순서는 `제공자명 → 끝 4자리·등록일·상태 배지 → 이번 달 사용량(요약 + 기준 안내 + 모델별 보기 토글) → 키 교체 안내 → 다시 확인/삭제`. `모델별 보기`는 `aria-expanded`/`aria-controls`를 가진 `ghost` `sm` 버튼이며 `ChevronDown`이 열릴 때 180도 회전(`motion-reduce:transition-none`)한다(기존 `AiPanelNotice` 패턴). 기본은 접힘. 열면 모델 행이 카탈로그 순서가 아니라 호출 수 내림차순으로 나열되고, 호출 수가 같으면 모델명 오름차순.
6. **접근성:** 알림은 `role="alert"`, BYOK 안내 한 줄은 피커 아래의 정적 텍스트이며 모델 변경 시 `aria-live="polite"` 영역으로 읽어준다(`role="status"`). 사용량 요약은 `이번 달 사용량 {N}회, 입력 {X}토큰, 출력 {Y}토큰`으로 읽히도록 구조를 잡는다(중간점 `·`만으로 의미가 끊기지 않게). 카드가 3개 반복되므로 토글 버튼에 제공자명을 포함한 `aria-label`(예: `OpenAI 모델별 사용량 보기`)을 부여한다. 키보드만으로 재시도·대체 동의·취소·설정 이동·펼침 토글을 수행할 수 있어야 한다. 터치 타깃은 기존 `Button size="sm"` 이상을 유지한다.
7. **모바일/좁은 폭:** 사용량 요약은 카드 내에서 줄바꿈되며 가로 스크롤이 생기지 않는다. 알림 카드 버튼은 `flex-wrap gap-2`.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official (기존 로컬 컴포넌트) | `Button`, `Badge`, `Select`, `Dialog`(기존) | 기존 로컬 소스 사용, 신규 설치 없음 — 2026-09-30 |
| Third-party | 없음 | 해당 없음 — `components.json`의 `registries: {}` — 2026-09-30 |

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-09-30 (FLAG 3건은 비차단 권고)
