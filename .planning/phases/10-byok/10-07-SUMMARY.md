---
phase: 10-byok
plan: "07"
subsystem: ai-providers
tags: [byok, provider-selection, service-key, fixture, bug-03, gap-closure]
requirements: [PROV-05]
requires: []
provides:
  - ServiceAvailability 타입과 ModelChoice.disabled/unavailableReason (lib/ai/providers/selection.ts)
  - getServiceAvailability / assertServiceKeyAvailable (server-only, lib/ai/providers/service-availability.ts)
  - getServiceAvailabilityAction (app/studio/settings/ai-providers/model-availability-actions.ts)
  - createPlatformProvider 키 부재 선거부(registry.ts)
affects: [10-08, 10-09, 04-10, 04-12, 15-09]
tech-stack:
  added: []
  patterns: [fail-closed availability DTO, server-only env snapshot, sanitized ok:false server action]
key-files:
  created:
    - lib/ai/providers/service-availability.ts
    - app/studio/settings/ai-providers/model-availability-actions.ts
    - tests/ai/service-availability.test.ts
    - tests/ai/model-availability-action.test.ts
  modified:
    - lib/ai/providers/selection.ts
    - lib/ai/providers/registry.ts
    - tests/ai/provider-selection.test.ts
    - tests/ai/provider-fixture.test.ts
    - .env.example
decisions:
  - "buildModelChoices의 serviceAvailability 미제공은 모든 service 비활성(fail closed); service 행은 숨기지 않고 고정 안내문을 단다."
  - "서비스 키 판정은 실제 env(공백 제거 후 비어 있지 않음)만 쓰며 NODE_ENV/AI_PROVIDER_FIXTURE는 무관하다."
  - "createPlatformProvider는 fixture 분기 전에 assertServiceKeyAvailable로 API_KEY_MISSING을 던진다."
  - "가용성 서버 액션은 인자를 받지 않고, 인증·profile 조회 실패/throw를 모두 { ok: false }로 정제한다."
metrics:
  duration: ~20min
  completed: 2026-10-17
  tasks: 2
  files: 9
---

# Phase 10 Plan 07: 서비스 키 가용성 계약과 registry 키 가드 Summary

서비스 키 없는 모델을 숨기지 않고 비활성+안내로 남기는 순수 피커 계약(`ServiceAvailability`, `disabled`/`unavailableReason`)과, fixture에 영향받지 않는 server-only 가용성 스냅샷·API_KEY_MISSING 가드, 인증된 writer 전용 가용성 Server Action을 추가했다. BUG-03 Reopen 정책을 테스트 가능한 단일 계약으로 만든 것이다.

## Tasks

| # | Task | Commits |
|---|------|---------|
| 1 | 순수 선택 계약과 서버 키 검사 RED→GREEN | 311dfbb (test RED), ab1d8fc (feat GREEN) |
| 2 | registry fixture 우회 제거와 공용 조회 서버 액션 | 480092d (test RED), 69f75b2 (feat GREEN) |

## What was built

- `buildModelChoices(byok, serviceAvailability?)`: 카탈로그 순서 그대로 service 5행을 항상 만든다. `serviceAvailability?.[provider] === true`일 때만 활성이고, 그 외엔 `disabled: true`, `unavailableReason: '서비스 키가 설정되지 않았어요. 내 API 키를 등록하면 사용 가능해요.'`(`SERVICE_KEY_UNAVAILABLE_REASON`)이다. BYOK 행은 기존 `intersectWithCatalog` 교집합에서만 만들고 항상 `disabled: false`. 코덱·`resolveDeleteReplacement`는 그대로다.
- `service-availability.ts` (`import 'server-only'`): GEMINI/OPENAI/ANTHROPIC_API_KEY를 매핑한다. `getServiceAvailability(env)`는 boolean 3개만 반환하고, `assertServiceKeyAvailable(providerId, env)`는 `ProviderCallError({ provider, status: null, kind: 'config', providerErrorCode: 'API_KEY_MISSING' })`를 던진다. 로그는 남기지 않는다.
- **실제 registry guard 연결:** `createPlatformProvider` 첫 줄에서 `assertServiceKeyAvailable(providerId, env)`를 호출하므로 `readProviderFixture`·fixture warn보다 먼저 거부된다. `createProviderWithApiKey`와 BYOK 키 경로는 바꾸지 않았다. `byok.ts`의 service 경로(`createPlatformProvider(selection.providerId, deps.env ?? process.env)`)도 이 가드를 그대로 탄다.
- `getServiceAvailabilityAction()` ('use server', async export만 둠): auth.getUser → profiles(role, deleted_at) → isAccountActive → writer 순으로 확인한다. 실패나 예외는 모두 `{ ok: false }`, 성공하면 `{ ok: true, availability: {gemini, openai, anthropic} }`를 명시 필드로만 돌려준다. 클라이언트 인자는 없다.
- `.env.example`: OPENAI_API_KEY/ANTHROPIC_API_KEY 빈 항목을 추가하고, 서비스 키 정책과 "fixture만 켜서는 service 호출이 허용되지 않는다"는 안내를 넣었다.

## Verification

- `npx vitest run --project unit tests/ai/provider-selection.test.ts tests/ai/service-availability.test.ts tests/ai/byok-models.test.ts`: 47/47 통과.
- `npx vitest run --project unit tests/ai/model-availability-action.test.ts tests/ai/byok-settings-actions.test.ts tests/ai/provider-fixture.test.ts` (+ 위 3개): 6 files, 93/93 통과.
- 회귀 확인(createPlatformProvider/AI_PROVIDER_FIXTURE 사용 테스트): chat-planning-mode, jev-off-path, jev-shadow-wiring, provider-gemini, provider-registry 64/64 통과. byok-generation, byok-actions 22/22 통과.
- `tsc --noEmit`: 이 plan 파일들에서 새 오류 없음.
- RED 단계: Task 1은 5개 실패 + 모듈 없음, Task 2는 9개 실패 + 모듈 없음을 확인한 뒤 GREEN으로 넘어갔다.
- provider-fixture의 drop-response chatAction 테스트에는 `GEMINI_API_KEY='test-key'`를 명시 주입했다. 이번 실행에서 planning/admin mock baseline 실패는 나타나지 않았다.

## Deviations from Plan

None - plan executed exactly as written. 참고로 `ServiceAvailabilityResult` 타입을 'use server' 파일에서 export했다. 타입은 런타임에 지워지므로 "async 함수만 export" 규칙에 저촉되지 않는다.

## 필수 인계 계약 (04-12 · 15-09 UAT 문서 소유자)

이 plan은 타 phase UAT 문서를 직접 수정하지 않았다. 아래 내용을 각 소유자가 반영해야 한다.

- **04-12** → `.planning/phases/04-ai-gateway-mention-based-generation/04-HUMAN-UAT.md`
- **15-09** → `.planning/phases/15-jev-ai/15-HUMAN-UAT.md`

반영할 내용(fixture를 쓰는 UAT 준비 절):
1. `AI_PROVIDER_FIXTURE`(어떤 모드든)만 켜서는 service 호출이 허용되지 않는다. 선택한 제공자의 실제 서버 키(GEMINI_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY)가 먼저 있어야 한다.
2. 키가 없는 제공자는 fixture 모드에서도 피커에 비활성(안내문)으로 표시되고, 호출하면 `API_KEY_MISSING`(config)이다. 이 경우 해당 UAT 항목은 fail이 아니라 **pending(키 부재)**으로 기록한다.
3. `DECISION_FIXTURE`도 생성 제공자의 키 조건을 우회하지 않는다.
4. 연결된 BYOK 모델은 서비스 키 유무와 무관하게 선택·호출할 수 있다.

## Gaps / Known Stubs

- **패널·설정 페이지 미연결(의도된 중간 상태):** `AiPanel.tsx`와 `settings/ai-providers/page.tsx`는 아직 `buildModelChoices(byok)`를 availability 없이 호출한다. 그래서 지금은 모든 service 행이 `disabled: true`로 계산된다. 다만 현재 UI가 `disabled`를 렌더링하지 않아 화면상 차이는 없다. 공용 hook은 10-08, 패널 연결과 ai-panel-model 테스트 갱신은 04-10 Task 3 소유이며, 그 전까지 패널 통합 완료로 보지 않는다.
- BUG-03 전체 완료는 10-09의 실제 registry 계약 테스트를 통과한 뒤 선언한다.
- 라이브 DB·브라우저·실제 키 검증은 이 환경에서 하지 않았다. 단위 테스트만 명시 env와 sentinel로 돌렸다.
- graphify update / graph-link-requirements.py는 오케스트레이터 지시에 따라 실행하지 않았다. STATE/ROADMAP도 갱신하지 않았다.

## Self-Check: PASSED
