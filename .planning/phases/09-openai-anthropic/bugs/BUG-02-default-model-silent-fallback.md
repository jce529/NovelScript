---
id: BUG-02
title: 계정 기본 모델을 쓸 수 없을 때 이유 설명 없이 조용히 다른 모델로 대체됨
status: open (서버·UI 수정 완료 2026-10-07 — 남은 항목은 Phase 11 연결 후, /bug-complete 대기)
severity: medium (BYOK→서비스 키 대체는 작가가 거부한 플랫폼 비용을 조용히 쓰게 할 수 있음)
found: 2026-10-07
found_during: Phase 9 옛 CONTEXT(2026-09-19, 삭제본) 결정 D-10c와 현행 코드 대조 중
origin_phase: 09 (09-05 `e32b902` FALLBACK 도입) + 10 (10-03 `38cd7c8` BYOK→서비스 키 무안내 전환)
files:
  - lib/ai/providers/settings.ts
  - lib/ai/providers/selection.ts
  - lib/ai/providers/registry.ts
  - app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanel.tsx
  - app/studio/[workId]/chapters/[chapterId]/actions.ts
  - app/studio/settings/ai-providers/page.tsx
---

# BUG-02: 계정 기본 모델을 쓸 수 없을 때 이유 설명 없이 조용히 대체됨

> 옛 Phase 9 CONTEXT(`git show b908bba^:.planning/phases/09-openai-anthropic-adapters-pricing/09-CONTEXT.md`)의 **D-10c** "기본 모델을 쓸 수 없으면 시스템 기본으로 대체하고 패널에 한 줄 안내, 조용한 대체 금지"가 현행 CONTEXT(2026-09-22)에서 빠졌고 구현되지도 않았다. 이 문서는 그 결정을 한 줄 안내보다 한 단계 더 나아간 방향으로 되살린다.

## 증상

작가의 계정 기본 모델을 쓸 수 없게 되면 코드가 알리지 않고 다른 모델로 바꾼다. AiPanel은 바뀐 결과만 "계정 기본값: …" 박스에 보여줄 뿐 왜 바뀌었는지, 어떻게 되돌리는지 알려주지 않는다.

## 현재 동작 (코드 확인, `lib/ai/providers/settings.ts` `getDefaultProviderModel`)

| 상황 | 현재 결과 | 문제 |
|---|---|---|
| 저장된 기본 모델이 카탈로그에서 사라짐(모델 퇴역·미지원 ID) 또는 값이 비어 있음 | 조용히 `FALLBACK`(Gemini 기본 모델, 서비스 키) | 이유 없음. 비어 있는 경우(미설정)와 구분도 안 됨 |
| 기본이 BYOK인데 키가 삭제됨 / 모델이 연결 목록에서 빠짐 | **같은 모델을 `keySource: 'service'`로** 조용히 전환 | 작가가 자기 키를 쓰려고 했는데 플랫폼 비용으로 호출됨. Phase 11 원칙("서비스 키로의 조용한 폴백 금지", `REQUIREMENTS.md` Out of Scope·BYOK-05)과 충돌 |
| 서비스 키 환경변수 없음(`GEMINI_API_KEY` 등, 서버 설정이며 작가의 BYOK와 무관) | 대체 아님. 모델은 목록에 계속 보이고, 전송 시 `config` 에러(`API_KEY_MISSING`) | 고를 수 없는 모델이 선택지에 남음 → 별도 문서 [BUG-03](BUG-03-service-key-missing-models-listed.md)에서 논의 |
| 키 삭제 시(설정 페이지) | `resolveDeleteReplacement`가 대체 라벨을 설정 화면에서 보여줌 | 삭제 화면에서만 안내됨. AiPanel에서 열었을 때는 없음 |

AiPanel(`AiPanel.tsx`)은 `defaultModel`·`defaultKeySource`를 받아 그대로 표시한다. 대체가 일어났다는 정보 자체가 서버에서 내려오지 않는다(`getDefaultProviderModel`이 `Selection`만 반환).

## 재현

1. 작가가 BYOK 키로 `Claude …`를 계정 기본으로 설정한다.
2. 설정 페이지 외 경로로 키가 무효화/삭제되거나, DB에서 `profiles.default_model`을 카탈로그에 없는 값으로 바꾼다.
3. 챕터 편집기 AI 패널을 연다.
4. 기대: 이유 안내와 선택 창. 실제: 배지만 `서비스 키`로 바뀌어 있거나 Gemini로 바뀌어 있고 안내 없음.

(코드 읽기로 확인했고 UI 재현은 하지 않았다.)

## 기대 / 실제

- **기대:** 대체가 필요하면 (1) 왜 바뀌는지 원인을 말하고, (2) 원인별로 그 문제를 해결하러 가는 링크를 주고, (3) 대체 모델로 계속 쓸지 작가가 직접 고르는 창을 띄운다. 작가가 고르기 전에는 플랫폼 비용이 드는 대체를 하지 않는다.
- **실제:** 위 표와 같이 조용히 대체된다.

## 원인

`getDefaultProviderModel`이 "쓸 수 없음"을 반환 타입으로 표현하지 못한다. 유효성 검사 실패는 `return FALLBACK`, BYOK 미연결은 `keySource: 'service'`로 값만 바꿔 돌려주고, 대체 이유를 담는 필드가 없다. 그래서 호출자(`actions.ts` `loadChapter`/KB 로더 → AiPanel)가 대체 여부를 알 수 없다.

## 수정 방향 (방향 확정 2026-10-07, 세부는 아래 "사용자 결정 필요")

### 1. 서버: 대체를 값이 아닌 결과로 반환
`getDefaultProviderModel`이 `{ selection, fallback }`을 돌려준다. `fallback`은 대체가 일어났을 때만 있고 다음을 담는다.
- `reason`: `model_retired | byok_key_missing | byok_model_unavailable | service_key_missing | not_set` 중 하나(구체 목록은 구현 시 확정)
- `original`: 작가가 원래 설정한 기본값
- `suggested`: 대체 후보(시스템 기본 모델)

대체 후보는 **서비스 키로 가는 경우 자동 확정하지 않는다**(아래 3번). 서버의 모델 ID 허용 목록 재검증(`actions.ts`)은 그대로 둔다.

### 2. 클라이언트: 원인 설명 + 해결 링크 + 선택 창
AiPanel을 열었을 때 `fallback`이 있으면 선택 창(다이얼로그 또는 패널 상단 배너+창)을 띄운다. 구성:
- **이유 한 줄**: 원인별 한국어 문구. 예: "설정해 둔 Claude … [BYOK] 키가 삭제돼서 이 모델을 쓸 수 없어요."
- **해결 링크**(원인별):

  | 원인 | 링크 |
  |---|---|
  | BYOK 키 삭제·무효·모델 미연결 | `/studio/settings/ai-providers` (BYOK 키 카드로 이동, 가능하면 해당 제공자 앵커) |
  | 모델 퇴역·미지원 | `/studio/settings/ai-providers` (기본 모델 변경) |
  | 기본 모델 미설정 | `/studio/settings/ai-providers` |
  | 서비스 키 미설정(운영 문제) | 링크 없음 — 작가가 해결할 수 없으므로 "지금은 이 모델을 쓸 수 없어요" 안내와 다른 모델 선택만 제공 |

- **선택지**: ① 대체 모델로 계속 쓰기(명시 동의) ② 해결하러 가기(링크) ③ 이번에만 다른 모델 고르기(기존 드롭다운).
- 원인·링크 문구는 `lib/ai/providers/byok-copy.ts` 계열처럼 한곳에 모은다.

### 3. 비용 주체가 바뀌는 대체는 명시 동의 필수
BYOK → 서비스 키 대체는 작가의 지갑 토큰이 쓰인다. 선택 창에서 "서비스 키(지갑 토큰 차감)로 계속"을 눌러야 적용한다. 동의 전에는 전송을 막거나 대체 모델 선택을 강제한다(차단 방식은 결정 필요). 이는 Phase 11의 "자동 폴백 없음, 1탭 명시 동의"(BYOK-05) 원칙과 같다.

### 4. 설정 페이지와의 일관성
`resolveDeleteReplacement`(키 삭제 시 대체 안내)와 이번 `fallback.reason`을 같은 원인 코드·문구 체계로 통일한다.

## 사용자 결정 필요

1. **선택 창이 뜨는 동안 전송을 막을지**, 아니면 배너만 띄우고 전송 시점에 막을지.
2. **동의 결과의 수명**: "이번 패널 세션만"인지, 작가의 계정 기본값을 대체 모델로 **저장**할지(저장하면 다음에 창이 다시 안 뜸). 원래 기본값을 보존할지 여부.
3. **서비스 키 → 서비스 키 대체**(퇴역 모델 → Gemini 기본 등 비용 주체가 같은 경우)도 선택 창을 띄울지, 안내 배너만으로 충분한지.
4. **`service_key_missing`**(서버 환경변수 누락)을 대체 대상으로 볼지, 목록에서 숨길지(옛 D-03)는 [BUG-03](BUG-03-service-key-missing-models-listed.md)에서 논의한다(사용자가 나중에 논의하기로 함, 2026-10-07). 그때까지 위 원인 표와 링크 표의 해당 행은 잠정안이다.
5. 창을 **Phase 11 실패 UX**(`11-UI-SPEC.md`의 알림 슬롯·1탭 재시도)와 같은 컴포넌트로 만들지 — Phase 11이 실행 전이라 UI 패턴 확정 전이다.

## 사용자 결정 (2026-10-07) 및 적용 내용

결정: ① 선택 창이 뜨면 전송 차단 ② 동의 결과는 이번 패널 세션만(계정 기본값 보존) ③ 서비스→서비스 대체는 안내 배너만 ④ 서버 부분만 먼저, UI는 Phase 11 이후. `service_key_missing`은 BUG-03 논의 후.

**적용(서버 부분):**
- `lib/ai/providers/settings.ts`: `resolveDefaultProviderModel`이 `{ selection, fallback? }` 반환. `fallback.reason`은 `not_set | model_retired | byok_key_missing | byok_model_unavailable`, `original`/`suggested`/`requiresConsent`(BYOK→서비스 키일 때만 true). `getDefaultProviderModel`은 기존 시그니처 유지(selection만 반환)해 설정 페이지·`byok.ts` 호출부는 그대로.
- `actions.ts`: `loadChapter`·`getNodeAiContextAction`이 `defaultFallback`을 함께 내려보냄(클라이언트는 아직 미사용).
- 테스트: `tests/ai/provider-settings.test.ts`에 원인별 5건 추가.

### 사전 리서치 (2026-10-07, Haiku 서브에이전트 조사 — 구현 전 코드·문서 대조 필요)

- **Phase 11과 겹침:** `11-CONTEXT.md` D-06 / `11-UI-SPEC.md`의 "대체 동의" 카드(제목·본문·"서비스 키로 보내기 (지갑 토큰 차감)"/"취소", 초기 포커스 취소, 보조 링크 "설정에서 키 확인")가 BYOK→서비스 키 선택 창과 같은 UI다. 별도 컴포넌트를 만들지 말고 Phase 11 카드를 재사용한다(결정 5).
- **Phase 11이 다루지 않는 부분(BUG-02 몫):** `not_set`·`model_retired` 이유 배너, 서비스→서비스 대체 안내 배너, AiPanel "계정 기본값" 박스(`AiPanel.tsx` ~318행)의 대체 이유 표시, `defaultFallback` props 전달.
- **키 무효:** `loadConnectedByokModels`는 `status === 'connected'`만 포함하므로 무효 키는 연결 목록에서 빠지고 `byok_key_missing`으로 분류된다. 삭제와 무효를 구분하려면 별도 조회가 필요하다(현재는 구분하지 않음).
- **테스트 패턴:** `tests/ai/ai-panel-model.test.ts`(`renderToStaticMarkup` 기반), `ai-panel-notice.test.ts`.
- **상태:** Phase 11은 Planned(0/8, 실행 전).

**적용(UI, 같은 날 사용자 요청으로 Phase 11 전에 진행):**
- `DefaultFallbackNotice.tsx`(신규): 원인 문구 + "설정에서 확인" 링크(`/studio/settings/ai-providers`) + 선택지. `requiresConsent`이면 동의 카드("서비스 키로 계속 (지갑 토큰 차감)" / "다른 모델 고르기"), 아니면 닫을 수 있는 안내 배너.
- `AiPanel.tsx`: `defaultFallback` props. 동의 대기 중에는 입력·보내기·재시도·재생성 차단. 동의·다른 모델 선택·배너 닫기 중 하나로 해소(패널 세션 한정, 계정 기본값은 저장하지 않음). 두 페이지(`chapters/[chapterId]/page.tsx`, `kb/[nodeId]/page.tsx`)가 `defaultFallback`을 전달.
- `byok-copy.ts`: `FALLBACK_COPY` 문구 모음.
- 테스트 3건(`tests/ai/ai-panel-model.test.ts`). 전체 1172건 통과, `tsc`·`eslint` 통과. 임시 미리보기 페이지(mock props, 커밋 안 함)에서 동의 카드·배너·차단/해제 동작을 브라우저로 확인했다(동의 클릭, 다른 모델 선택, 배너 닫기). 실제 `/studio` 챕터 편집기에서도 확인했다(2026-10-07, 사용자가 `profiles`를 openai/gpt-4o-mini/byok로 임시 변경): 서버 `byok_key_missing` → 동의 카드 표시, 입력 차단, 동의 후 해제. **발견:** 이때 "계정 기본값" 박스가 원래 설정(BYOK)이 아니라 대체된 값(`OpenAI GPT-4o mini 서비스 키`)을 표시한다 — `fallback.original`을 보여 주도록 후속 수정 필요.

**남은 부분:** Phase 11에서 AiPanel의 `keySource === 'byok'` 차단이 제거되고 알림 슬롯이 확장될 때 `DefaultFallbackNotice`를 11-UI-SPEC 대체 동의 카드와 통합(중복 문구·포커스 규칙 정리), `resolveDeleteReplacement`와 원인 코드 통일, 동의 전 BYOK→서비스 호출 차단 서버 테스트(`chatAction`에 BYOK 경로가 붙은 뒤), 키 삭제 vs 무효 구분 여부 결정, "계정 기본값" 박스가 `fallback.original`(원래 설정)을 표시하도록 수정.

## 의존·주의

- **Phase 11 실행 대기:** AiPanel·`actions.ts`·알림 슬롯을 같이 수정하므로 11과 겹친다. 11 이후에 구현하면 두 번 고치지 않는다(BUG-04와 같은 이유). 11-UI-SPEC과 충돌 여부 확인 필요.
- `chatAction`은 현재 `keySource === 'byok'`일 때 `byokPending` 에러를 반환한다(`actions.ts:174`, Phase 11 연결 전). 이 상태에서는 BYOK 기본값 작가의 실제 호출 경로가 없다. 대체 창 설계는 11 연결 후 흐름을 기준으로 해야 한다.
- 미구현·미확인: UI는 재현해 보지 않았다. `loadConnectedByokModels`가 "무효(검증 실패)" 키를 연결 목록에서 빼는지(= `byok_key_missing`과 `byok_key_invalid`를 구분해야 하는지)는 확인하지 않았다.
- 이 버그는 BUG-04 후보 5와 무관하다. 사고·본문 한도 UI와 같은 화면(AiPanel)을 건드리므로 일정만 조율한다.

## 검증

- `getDefaultProviderModel` 단위 테스트: 원인별 입력(퇴역 모델 ID / BYOK 미연결 / 미설정 / 서비스 키 없음)에서 `fallback.reason`과 `suggested`가 기대대로 나온다.
- BYOK→서비스 키 대체가 **동의 전에는 호출 경로로 가지 않는다**는 서버 테스트(조용한 전환 회귀 방지).
- AiPanel 컴포넌트 테스트: `fallback`이 있으면 원인 문구·링크·선택지가 표시되고, 없으면 창이 뜨지 않는다.
- 수동 확인: 키 삭제 후 패널 진입, 링크가 설정 페이지의 올바른 위치로 이동, 선택 후 전송 시 의도한 모델·키 소스로 호출되는지.
