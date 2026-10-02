---
status: partial
phase: 15-jev-ai
source: [15-VERIFICATION.md]
started: 2026-09-27T20:15:00Z
updated: 2026-09-28T00:00:00Z
---

## Current Test

[blocked — see item 2]

## Tests

### 1. QuickAddDialog 폴더 선택기 (D-12)
expected: `@`로 KB 문서를 멘션하다 매칭 없는 이름을 입력하면 "새 문서 만들기: '<이름>'" 옵션이 뜨고, QuickAddDialog에서 템플릿 종류(인물)를 고르면 저장 폴더가 그 카테고리의 실제 폴더 목록(최상위 + 하위 폴더, 예: "인물 (최상위)"/"서브인물")을 보여주며, 선택한 하위 폴더에 문서가 실제로 생성된다.
result: PASS — 로그인된 실사용자 계정("버그 재현용 작품")으로 직접 조작. 회차 본문에 `@인물테스트2`(매칭 없음) 입력 → "새 문서 만들기: '인물테스트2'" 버튼 노출 → QuickAddDialog에서 템플릿 종류 "인물" 선택 시 저장 폴더가 "인물 (최상위)"/"서브인물" 두 옵션을 보여줌 → "서브인물" 선택 후 "만들기" → KB 트리에서 인물 > 서브인물 > 인물테스트2로 정확히 생성됨을 확인. 테스트 후 생성한 문서는 삭제해 원상 복구함. 회차 본문 자체는 저장(회차 저장)하지 않아 변경 없이 원래 길이(1039자)로 복원됨.

### 2. SaveDocumentPlanModal — 저장 확인 모달·템플릿 재생성·이동/삭제 race
expected: AI 채팅으로 문서 생성 요청 → 저장 확인 모달에서 추천/선택 분리, 폴더 변경, 템플릿 변경 시 재생성 확인(성공/취소/실패), 이동·삭제 race 시 재검증 배너 확인.
result: BLOCKED (환경 요인, Phase 15 코드 문제 아님) — AI 채팅 요청(`새 인물 강진욱에 대한 인물 설정 문서를 만들어줘`, 라이트/프로 모델 모두 시도, 총 8회 재시도에 걸쳐)이 매번 서버 로그에서 `[ai] provider call failed { provider: 'gemini', status: 503, kind: 'unavailable' }`로 실패. `curl`로 Gemini API에 동일 모델(`gemini-3.5-flash`)을 직접 호출해 재현: `{"error":{"code":503,"message":"This model is currently experiencing high demand...","status":"UNAVAILABLE"}}` — Google 쪽 일시적 용량 문제로 확인, 앱/Phase 15 코드의 결함이 아님. 재시도 시 idempotencyKey가 매번 동일하게 재사용됨을 로그로 확인(Phase 8의 안정적 reference_id 수정이 올바르게 동작 중이라는 부수 증거). 추가 관찰: 이후 단순 `curl` 요청("hi")은 성공했지만, 앱이 보내는 무거운 요청(시스템 프롬프트 + Phase 8 도입 잔액 전체 기준 출력 토큰 상한 포함)은 계속 503을 받음 — Google 쪽에서 가벼운 요청만 우선 처리하는 부분 복구 상태로 추정. 사용자가 나중에 직접 `npm run dev` → `http://localhost:3000`에서 재확인하기로 함(Gemini가 완전히 안정화된 뒤).
why_human: 시각적 UI 상호작용과 비동기 race 조건의 실사용 흐름은 자동 테스트만으로 확증할 수 없음. Item 1은 사람(이번 세션의 실행자)이 직접 조작해 확인 완료. Item 2는 사람의 조작 자체는 진행했으나 외부 서비스(Gemini) 가용성 문제로 최종 결과를 확인하지 못함 — 재시도 필요.

**2026-10-02 재시도 (Gemini 정상 응답, 브라우저 실사용 계정 "버그 재현용 작품")**
- PASS: AI 채팅 문서 생성 요청 → "문서로 저장하기" → 저장 확인 모달에서 추천(폴더 "인물"/템플릿 "인물")과 선택 컨트롤이 분리 표시됨.
- PASS: 저장 폴더를 "서브인물"로 변경해도 추천값은 유지되고, 저장 후 DB에서 문서("박도현")의 parent가 "서브인물"임을 확인. 저장된 content는 안내 문구 없이 본문만.
- PASS: 템플릿 변경 후 저장 → "템플릿을 바꾸면 문서를 다시 생성해야 해요… 저장 위치는 그대로 유지돼요" 확인 단계 노출, "취소" 시 템플릿이 원래 값으로 복귀하고 폴더 선택은 유지.
- PASS: QuickAddDialog 재확인 — 카테고리 "장소"로 바꾸면 폴더 목록이 "장소 (최상위)"로 갱신, 저장 후 DB에서 parent="장소" 확인 (item 1 재검증).
- 미확인: 재생성 "다시 생성하기" 성공/실패 문구(Gemini 추가 호출 필요), 이동·삭제 race 재검증 배너.
- 참고: 다른 세션이 AiPanel/chat.ts/paid-generation.ts를 수정 중인 작업 트리에서 수행. 테스트 문서 "박도현"(서브인물), "UAT없는이름"(장소)이 남아 있음.

## Summary

total: 2
passed: 1
issues: 0
pending: 0
skipped: 0
blocked: 0
partial: 1 (item 2 — 재생성 성공/실패, race 미확인)

## Gaps

- Item 2 (SaveDocumentPlanModal 저장/재생성/race 흐름)는 Gemini API의 일시적 503(고수요)으로 미완료. Phase 15 코드 결함이 아니며, Gemini 서비스 정상화 후 재시도로 닫을 수 있다. `AI_PROVIDER_FIXTURE`(Phase 8 dev fixture)는 `[REPLY]/[DRAFT]`만 지원해 문서 생성 플로우 재현에는 쓸 수 없다 — 재확인은 반드시 실제 Gemini 호출로 해야 한다.
