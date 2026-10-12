---
id: BUG-01
title: loadConnectedByokModels가 failed 키 하나만 있어도 다른 제공자의 connected 키 모델까지 모두 숨김
status: open
severity: medium
found: 2026-10-12
found_during: 청사진 대비 phase 정합성 점검(Haiku 조사 → Sonnet 코드 검증이 `return {}` 동작을 확인)
origin_phase: 10 (10-03-PLAN Task 1 `byok-models.ts`, 구현 커밋은 이력이 스냅샷으로 합쳐져 추적 불가)
files:
  - lib/ai/providers/byok-models.ts
  - lib/ai/providers/settings.ts
  - lib/ai/providers/selection.ts
  - app/studio/[workId]/chapters/[chapterId]/actions.ts
  - app/studio/settings/ai-providers/page.tsx
  - app/studio/settings/ai-providers/actions.ts
  - tests/ai/byok-settings-actions.test.ts
  - tests/ai/byok-settings-ui.test.ts
---

# BUG-01: failed 키 하나가 모든 BYOK 모델을 숨긴다

## 증상
작가가 제공자 둘 이상(예: OpenAI 연결됨, Anthropic 검증 실패)의 BYOK 키를 갖고 있을 때, 실패한 키 하나 때문에 정상 연결된 키의 모델도 AI 패널 모델 피커와 설정 화면에서 사라진다. 기본 모델이 정상 연결된 BYOK 모델이어도 `byok_key_missing` 대체 안내(동의 필요)가 뜨고, 설정 화면에서 그 모델을 기본값으로 저장하면 "연결된 BYOK 키에서 확인된 모델이 아니에요."로 거부된다.

## 재현
1. OpenAI 키를 등록해 `connected`로 만든다.
2. Anthropic 키를 등록한 뒤 무효 키로 재확인해 `failed`로 만든다(또는 DB에서 `set_byok_status(..., 'failed', ...)`).
3. 에디터 AI 패널 모델 피커를 연다 → OpenAI BYOK 모델이 없다. 계정 기본값이 OpenAI BYOK 모델이면 대체 안내가 뜬다.
4. 단위 수준 재현: `loadConnectedByokModels`에 `byok_keys` 행 `[{provider:'openai',status:'connected',model_ids:['gpt-…']}, {provider:'anthropic',status:'failed',model_ids:[]}]`를 주는 mock 클라이언트를 넘기면 `{}`가 반환된다(기대: `{openai: [...]}`). 행 순서와 무관하다(failed가 뒤에 있어도 앞서 쌓은 결과가 버려진다).

## 기대 / 실제
- 기대: connected 키의 모델만 맵에 들어가고 failed 키는 건너뛴다. 10-03-PLAN은 "`status==='connected'`만 **골라** 각 `model_ids`를 교집합"이라고 적었다. "조회 오류/타입 불일치는 빈 맵(fail closed)"은 데이터가 깨졌을 때의 규칙이다.
- 실제: `byok-models.ts` for 루프의 조건문이 `row.status !== 'connected'`를 provider 유효성·`model_ids` 타입 검사와 한 조건에 묶고 `return {}`로 함수를 끝낸다. failed 행은 정상 상태인데 오류 취급을 받는다.

## 원인
`lib/ai/providers/byok-models.ts` 루프(약 11행):
```ts
if (!row || !['gemini','openai','anthropic'].includes(row.provider) || row.status !== 'connected' || !Array.isArray(row.model_ids) || !row.model_ids.every(...)) return {};
```
`status !== 'connected'`(failed 등 정상적인 비연결 상태)가 데이터 이상과 같은 분기에 있어 `continue` 대신 `return {}`가 된다. 계획의 "connected만 고른다"를 구현하면서 필터와 fail-closed가 섞였다. 이 로더는 피커(`AiPanel`), 기본값 해석(`settings.ts` `resolveDefaultProviderModel`), 기본값 저장 검증(`setDefaultProviderModel`), 설정 페이지(`buildModelChoices`)가 공유한다. 이 함수를 직접 검증하는 테스트가 없고 소비처 테스트는 로더를 mock으로 대체한다(`tests/ai/byok-settings-actions.test.ts`, `byok-settings-ui.test.ts`).

영향 범위: 조용한 과금은 없다. 대체 경로는 동의 게이트(`requiresConsent`)를 지나고 서비스 키 모델 선택지는 독립적으로 남는다. 다만 작가가 자기 키로 호출할 수 있는 모델을 쓰지 못하고, 서비스 키로 바뀌는 대체 안내를 불필요하게 보게 된다.

## 수정 방향
정책 결정이 필요 없는 구현 정정이다(10-03-PLAN이 이미 규칙을 적었다).
1. 정상적인 비연결 상태는 건너뛴다: `row.status !== 'connected'` 행은 `continue`.
2. 나머지(행이 비었거나 provider 미지원, `model_ids`가 문자열 배열이 아님)는 계획대로 fail closed(`{}`)를 유지한다. 한 행의 데이터 이상이 다른 제공자의 정상 행까지 숨기는 것이 맞는지는 실행 시 한 번 더 판단한다(대안: 이상 행만 건너뛰기). 계획 문구상 기본안은 fail closed 유지.
3. `tests/ai/byok-models.test.ts`를 새로 추가: (a) connected+failed 혼합 → connected만, 순서 두 가지, (b) failed만 → `{}`, (c) 이상 데이터 행 → `{}`, (d) 조회 오류 → `{}`, (e) 카탈로그에 없는 모델 id는 교집합으로 제거.
4. 소비처 회귀 확인: `resolveDefaultProviderModel`에서 혼합 상태일 때 `byok_key_missing`이 나오지 않는 케이스를 `tests/ai/provider-settings.test.ts`에 추가.

## 검증
- 새 단위 테스트가 수정 전에는 실패하고 수정 후 통과(`npx vitest run tests/ai/byok-models.test.ts tests/ai/provider-settings.test.ts`).
- `npx tsc --noEmit`, `eslint`가 깨끗해야 한다.
- 브라우저: connected 1개 + failed 1개 상태에서 모델 피커에 connected 제공자 BYOK 모델이 보이고, 기본 모델 대체 안내가 뜨지 않는지 확인(Phase 10 잔여 UAT 10·11 항목과 함께).
- 관련: PROV-05는 별개 결함(09 BUG-03, 서비스 키 미확인 노출)으로 아직 open이므로 이 버그를 고쳐도 PROV-05는 완결되지 않는다.
