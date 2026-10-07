---
id: BUG-03
title: 서버에 서비스 키(환경변수)가 없는 제공자의 모델이 드롭다운에 그대로 노출됨
status: open (논의 필요 — 사용자가 나중에 논의하기로 함, 2026-10-07. 수정 방향 미정)
severity: low (운영 환경에 세 키가 모두 있으면 작가에게 영향 없음. 키 누락 환경·키 장애 시에만 노출)
found: 2026-10-07
found_during: Phase 9 옛 CONTEXT(2026-09-19, 삭제본) 결정 D-03과 현행 코드 대조 중
origin_phase: 09 (09-03·09-05 모델 카탈로그·선택 UI에 서비스 키 보유 확인이 빠짐)
files:
  - lib/ai/providers/selection.ts
  - lib/ai/providers/catalog.ts
  - lib/ai/providers/registry.ts
  - app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanel.tsx
---

# BUG-03: 서비스 키가 없는 제공자의 모델이 드롭다운에 노출됨

> **이 문서는 논의용 기록이다.** 정책이 정해지지 않았고 사용자가 나중에 논의하기로 했다. 아래 선택지는 결정이 아니다. 논의 전에는 `/bug-execute`로 넘기지 않는다.

## 용어 구분 (혼동 주의)

- **서비스 키(플랫폼 키):** 서버 환경변수 `GEMINI_API_KEY`·`OPENAI_API_KEY`·`ANTHROPIC_API_KEY`. 운영자가 설정하며 작가의 BYOK와 무관하다.
- **BYOK 키:** 작가가 직접 등록한 키. BYOK 모델은 키가 연결·확인된 경우에만 `buildModelChoices`가 목록에 추가하므로 **이 버그의 대상이 아니다**.

## 증상

서버에 특정 제공자의 서비스 키가 없어도, 그 제공자의 `서비스 키` 배지 모델이 AI 패널 드롭다운에 계속 보인다. 작가가 고르고 전송하면 `registry.ts`의 `createPlatformProvider`가 `API_KEY_MISSING`(`kind: 'config'`)을 던진다.

## 재현 (코드 읽기로 확인, UI 재현은 하지 않음)

1. 서버 환경에서 `OPENAI_API_KEY`만 비운다(`AI_PROVIDER_FIXTURE`는 off).
2. 챕터 편집기 AI 패널을 연다.
3. 드롭다운에 OpenAI 모델이 `서비스 키` 배지로 보인다. 선택해 전송하면 `config` 에러 안내가 나온다.

## 기대 / 실제

- **기대(옛 D-03):** 서버가 실제 호출 가능한 모델만 목록에 내려주고 클라이언트는 그것만 렌더링한다. 비활성·"준비 중" 표시도 하지 않는다.
- **실제:** `buildModelChoices(byok)`가 `PROVIDER_MODELS` 전체를 서비스 키 모델로 나열한다. 환경변수 보유 여부를 보지 않는다.

## 원인

- `lib/ai/providers/selection.ts`의 `buildModelChoices`는 카탈로그만 순회한다.
- 이 파일은 클라이언트 컴포넌트(`AiPanel.tsx`)도 import하므로 서버 환경변수를 읽을 수 없다. 서버가 "호출 가능한 제공자 목록"을 내려주는 경로가 없다.
- 키 부재 검사는 호출 직전(`registry.ts`)에만 있다.

## 논의가 필요한 것

1. **어떻게 처리할지**
   - (가) 호출 가능한 제공자만 목록에 내려주고 키 없는 제공자는 숨김(옛 D-03).
   - (나) 목록에는 두되 선택 시 안내(비활성 표시 또는 사전 검증).
   - (다) BUG-02의 기본 모델 대체 창과 합쳐서, "기본 모델이 호출 불가"인 경우만 대체 사유로 다룸.
2. **기본 모델이 호출 불가 제공자일 때**: 숨기면 기본값 자체가 사라진다. BUG-02의 대체 창과 연결할지.
3. **서버가 내려주는 방법**: `loadChapter`/KB 로더(`actions.ts`)가 `byokModels`처럼 `availableServiceProviders`를 함께 반환할지. Phase 11이 같은 로더·AiPanel을 건드리므로 11 이후가 낫다.
4. **BYOK와의 관계**: 서비스 키 없는 제공자라도 작가가 BYOK 키로 같은 모델을 쓰면 목록에 남아야 한다(BYOK 항목만 남기는 규칙).
5. **fixture 모드**: `AI_PROVIDER_FIXTURE`가 켜져 있으면 키 없이도 호출 가능하므로 숨김 규칙에서 예외로 둘지.
6. **우선순위**: 운영 환경에서 실제로 키가 빠지는 상황이 거의 없다면 낮게 두거나 BUG-02와 묶어서 처리.

## 의존·주의

- **BUG-02**의 원인 `service_key_missing`이 이 버그와 같은 상황이다. 두 문서의 처리 방침을 같이 정해야 한다.
- **Phase 11 실행 대기:** AiPanel·`actions.ts`·선택 로직을 같이 수정한다.
- 이 버그는 Haiku 조사 보고(2026-10-07)에서 먼저 지적됐고, `registry.ts`·`selection.ts`는 직접 확인했다. UI 동작은 확인하지 않았다.

## 검증 (방향 확정 후 작성)

- (논의 후 확정. 최소한 키 없는 제공자의 모델이 목록 또는 선택 가능 상태에서 제외/안내되는지, BYOK 모델은 영향이 없는지.)
