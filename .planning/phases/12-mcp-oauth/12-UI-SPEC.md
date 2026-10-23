---
phase: 12
slug: mcp-oauth
status: approved
reviewed_at: 2026-10-23
shadcn_initialized: true
preset: base-nova
created: 2026-10-23
---

# Phase 12 — UI Design Contract

> OAuth 동의 화면 `/oauth/consent`와 스튜디오 설정 > AI 커넥터 관리 페이지의 시각·상호작용 계약. `12-CONTEXT.md` D-01~D-21을 고정 결정으로 따르고, `10-UI-SPEC.md`·`11-UI-SPEC.md`(토큰, 타이포, 색, 카드, 배지, 다이얼로그 패턴)를 그대로 상속한다. 새로 추가되는 부분만 정의한다.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn (`components.json` 존재, style `base-nova`, baseColor `neutral`) |
| Preset | `base-nova` — 변경 없음 |
| Component library | Base UI (`@base-ui/react`); 기존 `Button`, `Badge`, `Dialog`, `Input`(읽기 전용 URL 표시용), `Label`, `Separator` 재사용. 신규 설치 없음 |
| Icon library | lucide-react (`Plug`/`Link2`, `Copy`, `Check`, `ShieldCheck`, `AlertCircle`, `Info`). 아이콘은 텍스트 보조용이며 항상 `aria-hidden` |
| Font | Geist Sans (`font-sans`) |

**대상 화면 (2곳, 신규):**
1. `/oauth/consent` — `app/oauth/consent/page.tsx` + `actions.ts`. 앱 셸(스튜디오 사이드바·상단바) 없이 중앙 정렬된 단일 카드. 외부 앱(Claude)에서 넘어오는 화면이므로 NovelScript 로고(텍스트 워드마크)만 상단에 둔다.
2. `/studio/settings/mcp-connections` — 설정 허브 'AI' 섹션의 `AI 커넥터` 항목. `ai-providers`와 같은 `main` 레이아웃(`mx-auto flex max-w-2xl flex-col gap-6 p-4 md:p-8`)과 카드 패턴을 쓴다. 허브 좌측 메뉴 이름은 4번 보드의 'MCP 연결' 대신 사용자 대면 문구 `AI 커넥터`로 통일한다(Open Items 1).

새 모달 흐름, 토스트 의존 피드백, 전용 대시보드는 만들지 않는다. 승인 scope 표시와 호출 도구/횟수는 Deferred(D-14).

---

## Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | 배지와 글자, 아이콘-텍스트 간격 |
| sm | 8px | 버튼 간격, 정보 행 간격, 목록 항목 내 행 간격 |
| md | 16px | 카드 내부 요소 간격, 동의 카드 섹션 간격 |
| lg | 24px | 카드 안쪽 여백(`p-6`) |
| xl | 32px | 페이지 바깥 여백(`md:p-8`), 동의 카드 위아래 여백 |
| 2xl | 48px | 동의 화면 상단 워드마크와 카드 사이(데스크톱만) |
| 3xl | 64px | 사용하지 않음 |

Exceptions: 터치 타깃 — 모바일에서 동의 화면 `승인`/`거부` 버튼과 관리 페이지 `연결 해제` 버튼은 `min-h-11`(44px)을 보장한다(기존 `Button size="default"` 사용, `sm` 금지). 그 외 4의 배수만 사용. [출처: Phase 10·11 UI-SPEC]

---

## Typography

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Caption (보조 안내·날짜·URL 힌트) | 12px (`text-xs`) | 400 | 1.5 |
| Body / Label / button | 14px (`text-sm`) | 400 (본문) / 600 (라벨·버튼·클라이언트명) | 1.5 |
| Section heading (카드 제목) | 18px (`text-lg`) | 600 | 1.2 |
| Page heading | 24px (`text-2xl`) | 600 | 1.2 |

크기 4종(12/14/18/24), 굵기 2종(400/600). 기존 `ai-providers`가 쓰는 `font-medium`(500)은 신규 요소에 쓰지 않는다. 날짜·시각은 `tabular-nums`. 한국어 줄바꿈은 `break-keep`을 본문·제목에 적용하고, 긴 URL·클라이언트명에는 `break-all`/`min-w-0`을 쓴다. 동의 화면 제목은 24px, 클라이언트명 강조는 같은 본문 크기에서 600. [출처: `ai-providers/page.tsx`, 11-UI-SPEC]

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `bg-background` | 페이지 바탕 |
| Secondary (30%) | `bg-card`/`bg-muted`, `border-border` | 동의 카드, 연결 항목 카드, 접근 범위 박스(`bg-muted`), URL 표시 박스 |
| Accent (10%) | `bg-primary`(indigo-600)/`ring` | 아래 reserved 목록만 |
| Destructive | `text-destructive`, `border-destructive/40`, `variant="destructive"` | 연결 해제 확정 버튼, 실패 알림 제목·아이콘·테두리, 허용되지 않은 redirect 경고 |

Accent reserved for: 동의 화면 `승인하고 연결` 기본 버튼, 빈 상태의 `주소 복사` 기본 버튼, 상태 화면의 단일 진행 버튼(`로그인하고 계속`, `작가로 활성화하기`), 키보드 포커스 링. 그 외(클라이언트명, 링크, 연결일, 안내 박스)에는 accent를 쓰지 않는다.

- `거부`는 `variant="outline"`이다. 거부는 파괴적 행동이 아니므로 destructive 색을 쓰지 않는다. `승인하고 연결`과 `거부`는 시각 위계가 달라야 하나, 거부를 숨기지 않는다(같은 줄, 같은 크기).
- 관리 페이지 목록의 `연결 해제` 버튼은 `variant="outline"`(목록에 destructive가 반복되면 소음). 다이얼로그 안의 `연결 해제` 확정 버튼만 `variant="destructive"`(Phase 10 `키 삭제` 패턴과 동일).
- 상태 배지: `마지막 사용`이 없는 항목의 `아직 사용 안 함`은 `Badge variant="secondary"`. 색만으로 상태를 전달하지 않는다(문자 라벨 필수).
- 새 색 토큰 추가 없음. 경고(허용되지 않은 redirect)는 destructive 톤 알림 카드를 쓰고 노란색 등 신규 시맨틱 색은 만들지 않는다. [출처: 10·11 UI-SPEC, `ByokKeyCards.tsx`]

---

## Copywriting Contract

모든 문구는 해요체. 사용자 입력(클라이언트명)은 React 텍스트로만 렌더링하며 HTML로 해석하지 않는다. 토큰·authorization_id·client_id·내부 오류 원문은 어디에도 표시하지 않는다.

### A. 동의 화면 `/oauth/consent`

**공통 구조 (정상 상태):**

| Element | Copy |
|---------|------|
| 워드마크 | `NovelScript` |
| 제목 (h1) | `{클라이언트명}에서 NovelScript 계정 연결을 요청했어요` |
| 연결 대상 계정 한 줄 | `{작가명} 님 계정으로 연결돼요` (작가 필명. 없으면 로그인 이메일 앞부분 금지, 필명이 필수이므로 항상 존재) |
| 접근 범위 소제목 (h2) | `이 연결로 할 수 있는 일` |
| 범위 항목 1 (600) + 설명 | `읽기` — `내 작품과 설정집을 읽어요.` |
| 범위 항목 2 (600) + 설명 | `초안 제안 저장` — `AI가 만든 글을 제안된 초안으로 저장해요. 내가 스튜디오에서 수락해야 본문에 반영돼요.` |
| 범위 한계 한 줄 (caption, 재량: 포함) | `내 계정이 아닌 다른 사람의 데이터와 결제·지갑 정보에는 접근하지 않아요.` |
| 해제 안내 | `언제든 스튜디오 > 설정 > AI 커넥터에서 연결을 해제할 수 있어요. 해제하면 다음 호출부터 차단돼요.` |
| 승인 연결 출처 (caption) | `연결 요청 출처: {redirect 호스트}` (호스트를 `font-semibold`로 크게 표시, 예 `claude.ai`) |
| Primary CTA | `승인하고 연결` |
| Secondary | `거부` |

- 범위 두 항목은 `승인`이 하나로 묶여 있음을 보이기 위해 분리 체크박스 없이 정적 목록(`<ul>`, 각 항목 아이콘 `ShieldCheck` + 텍스트)으로 보여준다(D-06 단일 승인). 개별 선택 UI 금지.
- 'AI가 본문을 직접 수정하지 않음'은 필수 아님(D-07). 위 `초안 제안 저장` 설명이 같은 의미를 자연스럽게 전달하므로 별도 강조 문구·배너는 추가하지 않는다. 플래너가 삭제해도 계약 위반 아님(Open Items 3).
- 클라이언트명은 공격자 입력이므로 최대 60자에서 말줄임(`line-clamp-2`)하고, 제목 아래 `연결 요청 출처` 호스트를 항상 함께 보여 사칭을 식별하게 한다(MCP 스펙 MUST).

**상태별 문구:**

| 상태 | 제목 | 본문 | 버튼 |
|------|------|------|------|
| 로그인 필요 (비로그인 접근) | `로그인이 필요해요` | `{클라이언트명}의 연결을 승인하려면 NovelScript에 먼저 로그인해 주세요. 로그인하면 이 화면으로 돌아와요.` | `로그인하고 계속` (→ `/login?next=/oauth/consent?authorization_id=…`, accent 기본 버튼) |
| 독자 전용 계정 (D-05) | `작가 계정만 연결할 수 있어요` | `AI 커넥터는 작가 계정에서만 사용할 수 있어요. 작가로 활성화한 뒤 다시 연결해 주세요. 지금은 연결이 만들어지지 않았어요.` | `작가로 활성화하기` (→ `/write/start`, 기본 버튼), `돌아가기` (outline, POST로 `denyAuthorization` 실행 후 `redirect_url`로 이동) |
| 만료·잘못된 authorization_id | `연결 요청을 찾을 수 없어요` | `요청이 만료됐거나 이미 처리됐어요. Claude로 돌아가 커넥터 연결을 처음부터 다시 시도해 주세요.` | `NovelScript 홈으로` (outline 링크 → `/`). 승인·거부 버튼 없음 |
| 허용되지 않은 redirect | `안전하지 않은 연결 요청이에요` | `이 요청의 연결 대상({redirect 호스트})은 NovelScript가 허용하지 않아요. 연결하지 않았어요. 직접 만든 앱이 아니라면 이 요청을 무시해 주세요.` | `NovelScript 홈으로` (outline 링크). 승인 버튼 없음. 호스트는 `font-semibold break-all` |
| 처리 중 (승인 클릭 후) | (정상 화면 유지) | 버튼 `연결하는 중…`(`승인하고 연결` 대체, `role="status"`), 두 버튼 모두 `disabled` | — |
| 승인·거부 실패 | (정상 화면 위에 알림 카드) | `연결을 완료하지 못했어요. 잠시 뒤 다시 시도해 주세요. 계속되면 Claude에서 커넥터를 다시 추가해 주세요.` (`role="alert"`, destructive 톤) | `승인하고 연결`, `거부` 다시 활성화 |
| 거부 완료 | (Claude로 redirect. 앱 내 별도 화면 없음) | — | — |
| 이미 동의된 클라이언트 | (화면 없음: Supabase가 `redirect_url`을 주면 즉시 이동) | — | — |

- 허용 호스트(`claude.ai`, `claude.com`, 루프백 `localhost`/`127.0.0.1`) 밖은 위 '허용되지 않은 redirect'로 거절한다(D-18). 루프백 호스트는 정상 화면에 `연결 요청 출처: localhost` 로 표시한다.
- 승인 성공 후에는 Supabase가 반환한 URL(Claude)로 이동하므로 NovelScript 성공 화면은 없다. 이동 직전 짧은 `연결하는 중…` 상태만 보인다.

### B. 관리 페이지 `/studio/settings/mcp-connections`

| Element | Copy |
|---------|------|
| 페이지 제목 (h1, 24px) | `AI 커넥터` |
| 페이지 설명 (14px muted) | `Claude 같은 외부 AI가 내 NovelScript 계정에 연결된 목록이에요. 연결을 해제하면 다음 호출부터 차단돼요.` |
| 섹션 제목 (h2, 18px) | `연결된 커넥터` |
| MCP 주소 소제목 (h2, 18px) | `커넥터 주소` |
| 주소 안내 | `Claude의 설정 > 커넥터에서 커스텀 커넥터를 추가할 때 이 주소를 입력해요.` |
| 주소 복사 버튼 | `주소 복사` → 복사 직후 2초간 `복사했어요` (`role="status"`) |
| 주소 복사 실패 | `복사하지 못했어요. 주소를 직접 선택해 복사해 주세요.` (`role="alert"`, 주소 입력칸은 `readOnly`·선택 가능 유지) |

**빈 상태 (연결 0건):**

| Element | Copy |
|---------|------|
| Empty heading | `연결된 커넥터가 없어요` |
| Empty body | `Claude에서 NovelScript를 커스텀 커넥터로 추가하면 이곳에 표시돼요. 아래 순서를 따라 해보세요.` |
| 안내 순서 (`<ol>`) | 1. `Claude에서 설정 > 커넥터를 열어요.` 2. `커스텀 커넥터 추가를 선택하고 아래 주소를 붙여넣어요.` 3. `NovelScript 승인 화면이 열리면 승인하고 연결을 눌러요.` |
| 주소 박스 | 읽기 전용 `Input`에 MCP URL(예: `https://novelscript.example/mcp`), 오른쪽에 `주소 복사`(accent 기본 버튼). 빈 상태가 아닐 때도 같은 `커넥터 주소` 카드를 목록 아래에 노출(복사 버튼은 `outline`) |
| 지원 범위 한 줄 (caption) | `Claude 웹·데스크톱·모바일에서 연결할 수 있어요. ChatGPT 등 다른 앱은 아직 공식 지원하지 않아요.` |

**목록 항목 (연결 1건 이상, 카드 1개 = 연결 1건):**

| Element | Copy |
|---------|------|
| 클라이언트명 (h3, 18px, 600) | `{클라이언트명}` |
| 출처 (caption) | `{redirect 호스트}` (예 `claude.ai`) — 같은 이름 연결 구분용(Pitfall 5) |
| 연결일 | `연결일 {YYYY. M. D.}` (`Intl.DateTimeFormat('ko-KR')`, KST) |
| 마지막 사용 | `마지막 사용 {YYYY. M. D. 오후 h:mm}` (KST). 1분 이내는 `방금 전`, 그 외 절대 시각 |
| 마지막 사용 없음 | 배지 `아직 사용 안 함` (`secondary`) — `마지막 사용` 행은 숨김 |
| 항목 액션 | `연결 해제` (`variant="outline"`, `aria-label="{클라이언트명} 연결 해제"`) |

- 정렬: 마지막 사용 최신순, 사용 기록 없으면 연결일 최신순. 해제된(revoked) 연결은 목록에 표시하지 않는다.
- 같은 클라이언트로 재연결하면 기존 연결은 자동 해제되어 목록에 한 줄만 남는다(D-20). 별도 안내 문구는 없다.
- 승인 scope(읽기/초안 제안 저장) 표시, 호출 횟수·도구는 표시하지 않는다(D-14, Deferred).

**해제 확인 대화상자 (Dialog, `ByokKeyCards` 삭제 다이얼로그 패턴):**

| Element | Copy |
|---------|------|
| 제목 | `{클라이언트명} 연결 해제` |
| 본문 1 | `연결을 해제하면 다음 호출부터 이 커넥터의 접근이 차단돼요.` |
| 본문 2 | `다시 사용하려면 Claude에서 커넥터를 새로 연결해야 해요.` |
| 본문 3 (caption) | `이미 Claude에 보낸 내용은 NovelScript에서 되돌릴 수 없어요.` (재량; 과장 금지 원칙상 '즉시/완전 삭제' 표현은 쓰지 않는다) |
| 취소 버튼 | `취소` (`outline`, 초기 포커스) |
| 확정 버튼 | `연결 해제` (`destructive`, `aria-label="{클라이언트명} 연결 해제 확인"`) |
| 진행 중 | 확정 버튼 `해제하는 중…` (`role="status"`), 두 버튼 `disabled` |

**해제 결과:**

| 상태 | Copy |
|------|------|
| 성공 | 다이얼로그를 닫고 목록에서 해당 카드를 제거. 목록 상단 영역에 `연결을 해제했어요. 다음 호출부터 차단돼요.` (`role="status"`, `text-sm`) 표시. 마지막 연결이었다면 빈 상태로 전환 |
| 실패 | 다이얼로그를 열어 둔 채 본문 아래 `연결을 해제하지 못했어요. 잠시 뒤 다시 시도해 주세요.` (`role="alert"`, destructive 톤). 항목은 목록에 그대로 남고 확정 버튼 재활성화 |
| 목록 로딩 실패 | 섹션 안 `연결 목록을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.` (`role="alert"`). `커넥터 주소` 카드는 그대로 동작 |
| 독자 전용 계정이 직접 URL 접근 | 기존 설정 페이지와 동일하게 `/studio`로 redirect (별도 문구 없음) |

### 요약 표 (checker용)

| Element | Copy |
|---------|------|
| Primary CTA | 동의 화면 `승인하고 연결` / 관리 페이지(빈 상태) `주소 복사` |
| Empty state heading | `연결된 커넥터가 없어요` |
| Empty state body | `Claude에서 NovelScript를 커스텀 커넥터로 추가하면 이곳에 표시돼요. 아래 순서를 따라 해보세요.` (+ 3단계 순서·주소 복사) |
| Error state | 위 상태별 표(만료 ID, 허용되지 않은 redirect, 승인 실패, 해제 실패, 목록 로딩 실패)는 모두 '문제 + 다음 행동' 구조 |
| Destructive confirmation | `연결 해제`: `{클라이언트명} 연결 해제` — `연결을 해제하면 다음 호출부터 이 커넥터의 접근이 차단돼요. 다시 사용하려면 Claude에서 커넥터를 새로 연결해야 해요.` |

---

## Interaction Contract

**동의 화면**
1. **GET 렌더는 부작용이 없다.** `denyAuthorization`·`approveAuthorization`은 버튼 제출(Server Action)에서만 실행한다. 독자 전용 안내 화면도 `돌아가기`를 눌러야 deny가 실행된다.
2. **판정 순서 (서버, RSC):** `authorization_id` 없음/조회 실패 → '찾을 수 없음' 화면 → 비로그인 → '로그인 필요' → 탈퇴·비활성 계정 → 별도 문구 없이 로그인 화면으로 이동 → 독자 전용 → '작가 계정만 연결할 수 있어요' → redirect 호스트 허용목록 밖 → '안전하지 않은 연결 요청' → 정상 화면. 승인 Server Action은 UI를 신뢰하지 않고 같은 검사를 다시 수행한다.
3. **로그인 복귀:** `로그인하고 계속`은 `next`에 `/oauth/consent?authorization_id=…`를 담아 `/login`으로 보내고, 로그인 후 같은 화면으로 돌아온다. `next`는 `/`로 시작하고 `//`·`@`를 포함하지 않는 오리진 상대 경로만 허용(Pitfall 7).
4. **버튼 배치:** 데스크톱은 우측 정렬로 `거부`(outline) → `승인하고 연결`(accent) 순, 모바일은 세로로 쌓아 `승인하고 연결`을 위, `거부`를 아래에 둔다. 두 환경 모두 DOM 순서는 `거부` → `승인하고 연결`이며, 모바일의 시각 순서 뒤집기는 `flex-col-reverse sm:flex-row`로 처리한다. 키보드 포커스는 DOM 순서(거부 먼저)를 따르므로 모바일에서 시각 순서와 달라지는 점을 구현 시 확인한다. 두 버튼은 같은 높이·같은 폭 비율.
5. **중복 제출 방지:** 제출 중 두 버튼 `disabled`, 승인 후 이동이 끝날 때까지 유지. 실패 시에만 복구.
6. **보안 헤더:** `/oauth/consent`는 `Content-Security-Policy: frame-ancestors 'none'`, `X-Frame-Options: DENY`(클릭재킹 방지). 화면 안에 iframe·외부 이미지·외부 링크는 넣지 않는다.
7. **포커스:** 정상 화면 진입 시 `h1`에 `tabIndex={-1}` 포커스. 상태 화면(오류·로그인 필요·독자 전용)도 `h1` 포커스. 승인 실패 알림이 뜨면 알림 카드로 포커스 이동(`role="alert"`).

**관리 페이지**
8. **해제 흐름:** `연결 해제` → Dialog 열림(초기 포커스 `취소`, 닫힐 때 포커스는 트리거로 복귀 — `ByokKeyCards`와 동일한 `initialFocus`/`finalFocus`) → 확정 시 Server Action(우리 행 `revoked_at` 설정 → `revokeGrant`). 성공하면 다이얼로그 닫힘 + 해당 카드 제거 + 포커스를 `h1` 다음의 상태 메시지 영역(`tabIndex={-1}`)으로 이동. 마지막 카드를 제거해 포커스 대상이 사라지는 경우도 같은 영역으로 이동.
9. **주소 복사:** `navigator.clipboard.writeText` 사용. 성공 시 버튼 라벨이 `복사했어요`로 2초간 바뀌고 `Check` 아이콘 표시(`motion-reduce` 영향 없음). 실패 시 위 문구. 입력칸은 포커스 시 전체 선택.
10. **목록은 서버 렌더**로 항상 최신 `last_used_at`을 보여 주며 자동 폴링은 하지 않는다. 마지막 사용 시각은 호출 직후 최대 약 60초 지연될 수 있다(스로틀). 별도 설명 문구는 두지 않는다.
11. **접근성:** 목록은 `<ul>` + 카드 `<li>`, 각 카드 `aria-labelledby`로 클라이언트명 연결. 연결일·마지막 사용은 `<dl>`/`<dt>`·`<dd>`로 의미를 부여한다(중간점 구분 금지). `연결 해제` 버튼은 카드가 반복되므로 클라이언트명을 포함한 `aria-label`. 해제 성공 메시지는 `role="status"`, 실패는 `role="alert"`. 키보드만으로 주소 복사·연결 해제·취소·확정이 가능해야 하며, Esc로 다이얼로그를 닫는다.
12. **모바일 세로 폭 (≤ 375px):** 페이지 `p-4`. 연결 카드는 `flex-col`로 쌓이고 `연결 해제` 버튼은 카드 하단 전폭(`w-full sm:w-auto`, 최소 높이 44px). 주소 박스는 `Input`(읽기 전용, `min-w-0`) 아래에 `주소 복사` 버튼을 전폭으로 배치. 클라이언트명·호스트·URL은 `break-all`/`min-w-0`로 가로 스크롤 금지. 해제 다이얼로그는 기존 `DialogContent` 반응형 동작을 쓰고 푸터 버튼은 세로로 쌓는다(`flex-col-reverse` 허용. 초기 포커스는 `취소`).
13. **동의 화면 모바일:** 카드 `p-6` → `p-4`, 외곽 `px-4`, 범위 목록과 해제 안내가 접힘 없이 모두 보인다. 버튼은 전폭 세로.
14. **모션:** 장식 애니메이션 없음. 다이얼로그 전환은 기존 컴포넌트 기본값, 별도 추가 시 `motion-reduce:transition-none`.

---

## Layout Notes

- **동의 화면:** `min-h-dvh bg-muted/30` 배경 위 `max-w-md` 단일 카드(`rounded-lg border border-border bg-card p-6`), 세로 순서 `워드마크 → h1 → 계정 한 줄 → 이 연결로 할 수 있는 일(범위 박스 `bg-muted rounded-md p-4`) → 해제 안내(caption) → 출처 → 버튼`.
- **관리 페이지:** `h1/설명 → 연결된 커넥터(카드 목록 또는 빈 상태) → 커넥터 주소 카드`. 빈 상태에서는 `커넥터 주소` 카드가 3단계 안내와 하나의 카드로 합쳐진다(중복 노출 금지). 연결이 있을 때만 별도의 `커넥터 주소` 카드를 목록 아래에 둔다.
- 허브 좌측 메뉴(29번 보드 'AI' 그룹): `키 관리 · 기본 모델 · AI 커넥터 · 이번 달 사용량` 순서. 현재 구현은 허브 없이 페이지가 분리되어 있으므로 `ai-providers` 페이지 하단에 `AI 커넥터 관리` 링크 한 줄을 추가하는 것을 권장(Open Items 2).

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official (기존 로컬 컴포넌트) | `Button`, `Badge`, `Dialog`, `Input`, `Label`, `Separator` | 기존 로컬 소스 사용, 신규 설치 없음 — 2026-10-23 |
| Third-party | 없음 | 해당 없음 — `components.json`의 `registries: {}` — 2026-10-23 |

---

## Open Items

1. **메뉴 명칭 불일치:** 4번 보드와 허브 백로그는 'MCP 연결', CONTEXT D-13은 'AI 커넥터'. 사용자 대면 문구는 `AI 커넥터`로 확정(Claude의 '커넥터' 용어와 일치). 허브 보드 갱신은 별도 UI 설계 작업에서 한다.
2. **허브 진입점:** 통합 설정 허브(29번 보드)가 아직 구현되지 않아 `ai-providers` 페이지에 연결 링크를 둘지, 신규 페이지에 `AI 제공자 설정` 되돌아가기 링크를 둘지는 플래너가 결정. 라우트는 RESEARCH 기준 `/studio/settings/mcp-connections`로 가정.
3. **'AI가 본문을 직접 수정하지 않음' 문구:** 필수 아님(D-07). 본 계약은 `초안 제안 저장` 설명과 `내가 스튜디오에서 수락해야 본문에 반영돼요`로 같은 의미를 전달한다. 별도 강조 문구는 추가하지 않음.
4. **탈퇴·비활성 계정이 동의 화면에 접근:** 별도 문구 없이 로그인 화면으로 보낸다고 가정. 필요하면 `연결할 수 없는 계정이에요` 상태를 추가.
5. **제재(정지) 계정(D-21):** 읽기는 허용이므로 동의 화면은 정상 표시한다. 쓰기 제한 안내는 Phase 14 UI에서 다룬다.
6. **Claude 클라이언트명 신뢰:** DCR 클라이언트명은 공격자 입력이므로 이름 옆에 항상 출처 호스트를 표시. 허용 호스트 목록(`claude.ai`, `claude.com`, 루프백)은 스파이크 결과에 맞춰 확정 필요. Claude Code 루프백 포트(#2703)는 best-effort.
7. **DB 장애 시 문구:** 동의 화면과 관리 페이지의 일시 오류는 '문제 + 다시 시도' 문구로 처리. MCP 호출 자체의 401/503 구분(OQ-5/6)은 UI 범위 밖.
8. **목업 제공:** 프로젝트 규칙상 UI-SPEC 검증 후 `design` 스킬로 2개 화면 아트보드(동의 화면 상태 6종, 관리 페이지 빈 상태·목록·해제 대화상자·모바일)를 Artifact로 발행해야 phase UI 산출물이 완료된다. 이 연구 에이전트는 목업을 만들지 않았다.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
