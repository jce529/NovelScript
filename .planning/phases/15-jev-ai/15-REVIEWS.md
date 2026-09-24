---
phase: 15
reviewers: [codex]
reviewed_at: 2026-09-24T06:07:42Z
codex_model: gpt-5.6-sol
codex_reasoning_effort: medium
plans_reviewed: [15-01, 15-02, 15-03, 15-04, 15-05, 15-06, 15-07, 15-08, 15-09]
---

# Cross-AI Plan Review — Phase 15

## Codex Review (gpt-5.6-sol, medium reasoning)

> gpt-6-sol 모델은 이 ChatGPT 계정의 Codex에서 지원되지 않아(400 invalid_request_error) gpt-5.6-sol로 대체 실행함(사용자 승인).

# 총평

현재 계획은 방향과 문서화 수준은 좋지만, 그대로 실행하기에는 **HIGH 위험**입니다. 특히 다음 네 항목은 실행 전 수정이 필요합니다.

1. Jev→Gemini 경로가 `GenerateResult.usage/refusal/finishReason`을 잃어 기존 과금·멱등 정산을 재사용할 수 없습니다.
2. 템플릿 재생성은 Gemini를 직접 호출하면서 지갑 차감·멱등 키·쓰기 권한 재검사를 우회합니다.
3. 폴더 루트 판별과 중복 루트 처리가 서로 모순되며, 이동된 폴더를 저장 직전에 감지하지 못합니다.
4. 프로덕션 활성화 게이트가 로컬의 gitignored JSON 파일만 확인하고, 정책 승인·그림자 표본·모델 버전을 검증하지 않습니다.

따라서 **15-01, 15-03, 15-04, 15-05, 15-06, 15-08, 15-09를 수정한 뒤 실행**하는 것이 안전합니다.

---

## 15-01 — Jev 온보딩 및 DecisionClient

### Summary

생성 모델과 결정 모델을 분리하고, 실제 문서와 계정 발급을 체크포인트로 둔 접근은 적절합니다. 하지만 API 응답 검증과 활성화 증거 저장 방식이 프로덕션 안전성을 충족하지 못합니다.

### Strengths

- `ProviderClient`와 별도의 `DecisionClient` 계약을 둔 것은 역할 경계가 명확합니다.
- API 키와 원시 벤더 오류를 allowlist 방식으로 차단하려는 설계가 기존 Phase 8 패턴과 일치합니다.
- `jev-latest` 대신 검증된 고정 버전을 요구합니다.
- 공식 문서와 실제 스파이크 성공을 사람 체크포인트로 둔 것이 신생 벤더 위험을 잘 반영합니다.

### Concerns

- **HIGH — 활성화 증거가 프로덕션에 존재하지 않습니다.** `.last-eval-result.json`을 gitignore하면서 런타임에서 로컬 파일로 읽습니다. Vercel 배포에는 파일이 없고 서버리스 파일시스템도 영속 저장소가 아닙니다. 따라서 정상 운영에서는 활성화가 불가능하거나, 수동으로 임의 파일을 넣어 우회하게 됩니다. [15-01-PLAN.md](D:/MyProject/NovelScript/.planning/phases/15-jev-ai/15-01-PLAN.md:182)

- **HIGH — Jev 응답을 신뢰하고 그대로 반환합니다.** `key`가 후보에 속하는지, `confidence`가 유한한 0~1 값인지, 확률 객체가 유효한지 확인하지 않습니다. 이후 15-02에서 임의 문자열을 `KbCategory`로 캐스팅할 수 있습니다. [15-01-PLAN.md](D:/MyProject/NovelScript/.planning/phases/15-jev-ai/15-01-PLAN.md:308)

- **HIGH — `res.json()`과 응답 매핑 오류가 에러 스크러빙 밖에 있습니다.** JSON 파싱 실패나 잘못된 응답 shape가 원시 `SyntaxError`/`TypeError`로 탈출하여 “DecisionCallError만 던진다”는 계약을 위반합니다.

- **MEDIUM — 타임아웃이 없습니다.** `AbortSignal.timeout` 또는 `AbortController` 없이 fetch를 호출하므로 벤더 지연이 요청 수명을 점유할 수 있습니다.

- **MEDIUM — 평가 증거가 모델 버전, 데이터셋 해시, 실제/fixture 여부, 평가기 버전과 결합되지 않습니다.** 과거 모델의 평가 결과를 다른 모델 활성화에 재사용할 수 있습니다.

- **MEDIUM — 체크포인트 상태가 모순적입니다.** must-have는 실제 키와 스파이크 성공을 요구하지만, resume 신호는 계정 발급이 막혀도 스텁으로 후속 계획을 계속할 수 있게 합니다.

### Suggestions

- 응답을 Zod로 검증하고, 선택 키가 요청 후보에 포함되는지 adapter 경계에서 확인하십시오.
- fetch, HTTP 오류, JSON 파싱, schema validation 전체를 하나의 sanitized catch 경계로 감싸십시오.
- 결정 요청에 `decisionType`, `requestId`, timeout을 추가하십시오.
- 평가 승인을 DB나 배포 가능한 서명된 artifact로 저장하십시오. 최소 필드는 다음이 적절합니다.

  `modelVersion`, `datasetHash`, `evaluatorVersion`, `usedRealVendor`, `metrics`, `sampleSize`, `approvedAt`, `policyApprovedAt`.

- 외부 계정 발급 실패 시 `15-01`을 “adapter contract complete / live verification blocked”로 구분하고, 실제 어댑터 완료를 주장하지 마십시오.

### Risk Assessment

**HIGH.** 잘못된 벤더 응답이 타입 경계를 통과할 수 있고, 현재 활성화 증거 저장 방식은 프로덕션 배포와 호환되지 않습니다.

---

## 15-02 — 2단계 계획 오케스트레이션

### Summary

불투명 후보 키, 저확신 clarify, 단일 후보 호출 생략은 좋은 설계입니다. 그러나 후보 무결성, 안정 정렬, 중복 루트 처리가 부족해 잘못된 계획이나 비결정적 평가가 발생할 수 있습니다.

### Strengths

- DB ID 대신 요청별 불투명 키를 전달합니다.
- 카테고리가 정해진 뒤에만 폴더·템플릿 후보를 조회합니다.
- 저확신 task/category는 생성하지 않고 clarify로 전환합니다.
- 폴더·템플릿 실패 시 문서화된 기본 후보로 폴백합니다.
- 후보 순서 교란을 실제 `candidates` 배열에 적용할 수 있게 설계했습니다.

### Concerns

- **HIGH — 알 수 없는 카테고리 키를 강제 캐스팅합니다.** `categoryResult.key as KbCategory`는 벤더 오류나 잘못된 응답을 그대로 앱 타입으로 승격합니다. [15-02-PLAN.md](D:/MyProject/NovelScript/.planning/phases/15-jev-ai/15-02-PLAN.md:212)

- **HIGH — `rootDuplicate`를 무시합니다.** 15-03이 중복 루트를 데이터 이상으로 검출하려 하지만, 이 함수의 인터페이스에는 `rootDuplicate`가 없고 첫 번째 루트로 폴백할 수 있습니다.

- **MEDIUM — 후보 안정 정렬 계약이 구현되지 않았습니다.** 요구에는 폴더를 전체 경로로, 템플릿을 범위+이름으로 안정 정렬한다고 되어 있지만 실제 코드는 조회 순서 그대로 opaque key를 부여합니다. 동일 이름이나 DB 반환 순서 변화가 평가 결과를 바꿀 수 있습니다.

- **MEDIUM — 모든 예외를 폴백으로 삼킵니다.** 벤더 가용성 오류뿐 아니라 프로그래밍 오류·DB 오류도 최상위/기본 템플릿 폴백으로 숨길 수 있습니다.

- **LOW — 테스트 개수가 내부적으로 맞지 않습니다.** Task 1은 5개, Task 2는 7개 behavior를 같은 파일에 추가하지만 acceptance는 “all 7 tests”로 적혀 있습니다. [15-02-PLAN.md](D:/MyProject/NovelScript/.planning/phases/15-jev-ai/15-02-PLAN.md:282)

### Suggestions

- adapter 또는 orchestrator에서 `result.key ∈ candidates`를 강제하십시오.
- `rootDuplicate`면 명시적 `data_integrity_error`를 반환하고 폴백하지 마십시오.
- opaque key 생성 전에 폴더는 `path + id`, 템플릿은 `scope + name + id`로 안정 정렬하십시오.
- `DecisionCallError`만 안전 폴백 대상으로 삼고, DB/불변식 오류는 명시적으로 실패시키십시오.
- task confidence와 category confidence를 별도로 보존하십시오. 현재 하나의 confidence로 합쳐 15-08 지표가 부정확해집니다.

### Risk Assessment

**HIGH.** 벤더의 잘못된 키와 중복 루트가 정상 계획으로 처리될 수 있습니다.

---

## 15-03 — 폴더 후보 및 저장 재검증

### Summary

BUG-01의 `.maybeSingle()` 근본 원인을 해결하려는 방향은 맞습니다. 다만 새 루트 판별 알고리즘이 삭제된 부모·다른 카테고리 부모·고아 노드를 루트로 오인하며, 같은 계획 안에서 중복 루트 정책이 상충합니다.

### Strengths

- 카테고리 폴더를 배열로 조회해 기존 다건 실패를 제거합니다.
- 소유자·작품·scope·카테고리·삭제 상태를 저장 시 재검증합니다.
- 중첩 경로를 별도 `path`로 제공하는 설계가 UI와 프롬프트 양쪽에 유용합니다.
- 삭제되거나 다른 작품의 폴더로 조용히 저장하지 않는 테스트가 포함됩니다.

### Concerns

- **HIGH — 루트 판별 알고리즘이 잘못되었습니다.** `parent_id`가 같은 결과셋에 없으면 루트로 간주합니다. 삭제된 부모를 가진 고아 폴더나 비정상 부모를 가진 행도 루트가 됩니다. 실제 스키마에서는 구조 루트가 `parent_id IS NULL`이고 Phase 04.1에서 잠긴 구조 폴더로 다시 보정되었습니다. [15-03-PLAN.md](D:/MyProject/NovelScript/.planning/phases/15-jev-ai/15-03-PLAN.md:135), [0004_kb_custom_folders.sql](D:/MyProject/NovelScript/supabase/migrations/0004_kb_custom_folders.sql:9)

- **HIGH — 중복 루트 정책이 자기모순입니다.** Task 1은 중복 시 임의 선택 금지를 요구하지만, Task 2는 이름순 첫 루트를 사용합니다. 이름순도 데이터 무결성 오류를 안전하게 만드는 것은 아닙니다. [15-03-PLAN.md](D:/MyProject/NovelScript/.planning/phases/15-jev-ai/15-03-PLAN.md:206)

- **HIGH — 폴더 이동을 감지하지 못합니다.** 성공 기준은 위치가 바뀐 경우 재선택을 요구하지만 `validateTargetFolder`는 ID와 정적 필드만 확인합니다. 같은 카테고리 내에서 이동·이름 변경된 폴더는 그대로 통과합니다.

- **MEDIUM — DB 조회 오류와 “루트 없음”을 구분하지 않습니다.** Supabase `error`를 무시하고 `data ?? []`로 처리하므로 일시적 DB 실패가 데이터 이상으로 표시됩니다.

- **MEDIUM — 경로 순환 방어가 없습니다.** DB 이상으로 parent cycle이 생기면 `buildPath` 루프가 종료되지 않습니다.

- **MEDIUM — 구조 루트 유일성이 DB 제약으로 보장되지 않습니다.** 애플리케이션에서 중복을 발견하는 것보다 partial unique index로 막는 편이 안전합니다.

### Suggestions

- 구조 루트는 `parent_id IS NULL`, `scope='work'`, 예상 카테고리 및 필요 시 `is_locked=true`로 명시적으로 조회하십시오.
- 카테고리별 활성 루트 유일성을 partial unique index로 보장하십시오.
- 중복/누락 루트는 모두 hard error로 처리하십시오.
- 후보에 `updatedAt` 또는 ancestry/version hash를 포함하고 저장 때 같은 값을 재검증해 이동·이름 변경을 탐지하십시오.
- DB 오류는 `query_failed`로 분리하고 사용자용 메시지만 정규화하십시오.
- 경로 계산에 visited set과 최대 깊이 제한을 추가하십시오.

### Risk Assessment

**HIGH.** 계획의 핵심인 “안전한 실제 폴더 선택”이 잘못된 루트 판별과 중복 처리 때문에 보장되지 않습니다.

---

## 15-04 — Jev→Gemini 생성 연결

### Summary

플래그 뒤에서 새 경로를 추가하고 기존 채팅 회귀 테스트를 유지하는 전략은 좋습니다. 그러나 현재 outcome 타입이 Gemini 사용량·거절·finish reason을 버려 기존 정산 경로와 결합할 수 없기 때문에 계획의 핵심 구현이 성립하지 않습니다.

### Strengths

- 비활성 상태에서 기존 `chat()` 경로를 보존하려는 회귀 기준이 명확합니다.
- clarify 시 Gemini를 호출하지 않는 정책이 비용 측면에서 적절합니다.
- 계획 추천값을 `DocumentProposal`까지 전달하는 핸들이 마련됩니다.
- 중첩 폴더 전체 경로를 생성 프롬프트에 포함합니다.

### Concerns

- **HIGH — `GenerateResult`를 `rawText`로 축소합니다.** 현재 정산 코드는 `usage`, `refusal`, `finishReason`을 사용합니다. 새 outcome에는 이 정보가 없어 실제 사용량 차감, structured refusal, cap 표시를 재사용할 수 없습니다. [15-04-PLAN.md](D:/MyProject/NovelScript/.planning/phases/15-jev-ai/15-04-PLAN.md:223), [chat.ts](D:/MyProject/NovelScript/lib/ai/chat.ts:167)

- **HIGH — 두 번 생성하거나 정산을 우회할 위험이 있습니다.** `planAndGenerateDocument`가 provider를 직접 호출한 뒤 기존 `chat()`이 다시 생성하지 않도록 결과 흐름 전체를 구조적으로 재작성해야 하지만, 계획은 주석으로만 “기존 경로 재사용”을 지시합니다.

- **HIGH — 구체 예시가 현재 `ChatInput`과 맞지 않습니다.** `input.model`, `input.maxOutputTokens`, `input.temperature`는 현재 `ChatInput`에 없습니다. 현재 필드는 `modelTier`이며 model/cap은 `chat()` 내부에서 계산합니다. [chat.ts](D:/MyProject/NovelScript/lib/ai/chat.ts:52)

- **HIGH — 활성 경로가 프리셋·문체·장르·전체 대화 문맥을 잃습니다.** 전용 프롬프트는 baseline만 넣고 기존 `composeSystemInstruction`의 preset/style/genre를 재사용하지 않습니다. `contents`도 마지막 요청 중심의 JSON이라 전체 chat history를 잃습니다.

- **HIGH — 생성 결과 계약 위반을 검사하지 않습니다.** `[DOCUMENT]` 누락, 계획과 다른 카테고리, 필수 섹션 누락, provider refusal을 명시적으로 처리하지 않습니다.

- **MEDIUM — 활성화 assertion 예외가 구조화되지 않습니다.** `assertActivationEligible()`가 던진 일반 Error가 Server Action까지 탈출할 수 있습니다.

- **LOW — 테스트 수가 맞지 않습니다.** Task 1의 4개와 Task 2의 8개 behavior가 있는데 acceptance는 8개라고 적혀 있습니다. [15-04-PLAN.md](D:/MyProject/NovelScript/.planning/phases/15-jev-ai/15-04-PLAN.md:331)

### Suggestions

- `planAndGenerateDocument`는 `rawText`가 아니라 `{ generateResult: GenerateResult, planMetadata }`를 반환하게 하십시오.
- `chat()`을 다음 세 단계로 분리하십시오.

  1. preflight/access/idempotency/balance  
  2. generation strategy 선택  
  3. 공통 postflight/access/debit/refusal/parse

- 기존 `composeSystemInstruction`에 document-plan directive를 추가하는 방식으로 preset/style/genre를 보존하십시오.
- `assembleUserContent` 또는 동등한 전체 대화 입력을 그대로 사용하십시오.
- 파싱 후 category가 계획과 동일한지, 템플릿 필수 heading이 유지됐는지 검증하십시오.
- 활성화 게이트 실패를 sanitized `config` 결과로 변환하십시오.

### Risk Assessment

**HIGH.** 현재 타입 설계로는 Phase 8의 실제 사용량 차감과 refusal 처리를 보존할 수 없습니다.

---

## 15-05 — 오프라인 평가

### Summary

합성 데이터, 분포 검증, ECE, 후보 순서 교란을 한 실행 경로에 묶은 점은 좋습니다. 하지만 평가가 실제 폴더/템플릿 오케스트레이션 경로를 우회하고, 활성화 증거가 런타임과 연결되지 않습니다.

### Strengths

- 실데이터 혼입을 UUID 휴리스틱과 정적 합성 생성으로 방지합니다.
- 100~300건 범위를 명시적으로 검증합니다.
- task/category뿐 아니라 folder/template 정확도와 calibration을 측정합니다.
- fixture 결과가 활성화 승인을 통과하지 않도록 0으로 기록합니다.
- 후보 배열 자체를 교란하는 평가가 포함됩니다.

### Concerns

- **HIGH — folder/template 평가는 실제 `planFolderAndTemplate`을 호출하지 않습니다.** 직접 `client.decide`를 호출하므로 opaque mapping, 안정 정렬, 단일 후보 생략, 폴백, 임계값 처리를 평가하지 않습니다. [15-05-PLAN.md](D:/MyProject/NovelScript/.planning/phases/15-jev-ai/15-05-PLAN.md:264)

- **HIGH — 활성화 임계값이 평가 전에 임의로 고정됩니다.** Context는 평가 데이터로 임계값을 결정한다고 했지만 15-01은 0.85/0.8/0.1을 미리 지정합니다. 기준을 사전 등록하려는 것이라면 근거와 승인 절차가 필요합니다.

- **HIGH — gitignored 로컬 결과 파일은 프로덕션 게이트가 될 수 없습니다.**

- **MEDIUM — golden set이 매우 반복적입니다.** 카테고리별 동일 문장 템플릿에 소재만 바꿔 실제 모호성, 부정문, 복합 요청, 교차 카테고리, typo, prompt injection을 거의 다루지 않습니다.

- **MEDIUM — folder/template 표본 10건으로 0.8 정확도와 calibration을 판단하기에는 작습니다.**

- **MEDIUM — 데이터셋 버전·검수자·판정 근거가 없습니다.** 생성 코드가 바뀌면 정답셋도 조용히 바뀔 수 있습니다.

- **LOW — CI의 `.env.local` 부재 처리 가정이 위험합니다.** 현재 Node에서는 `--env-file`은 파일이 없으면 실패하고 `--env-file-if-exists`만 계속 실행합니다.

### Suggestions

- 후보 조회를 repository 인자로 받는 순수 `planFolderAndTemplateFromCandidates`를 만들고, 운영과 평가가 같은 함수를 사용하게 하십시오.
- golden set을 버전 고정 JSONL로 만들고 각 항목에 `rationale`, `reviewer`, `difficulty`, `tags`를 넣으십시오.
- 모호한 요청, 복합 의도, 적대적 입력, 긴 컨텍스트, 순서 변경을 층화하십시오.
- 실제 평가 결과에는 dataset hash와 pinned model version을 기록하십시오.
- `--env-file-if-exists=.env.local` 또는 명시적인 환경 로더를 사용하십시오.
- 임계값 선정과 최종 평가를 분리해 같은 세트에 과적합되지 않도록 하십시오.

### Risk Assessment

**HIGH.** 측정값이 실제 운영 경로의 정확도를 대표하지 못하고 활성화 증거도 배포 환경에서 사용할 수 없습니다.

---

## 15-06 — 저장 확인 모달 및 템플릿 재생성

### Summary

D-11 UX와 저장 직전 서버 검증을 충실히 반영하고 있지만, 템플릿 재생성 경로가 현재 비용·권한·멱등 안전장치를 완전히 우회합니다. 이 계획은 실행 전 반드시 재설계해야 합니다.

### Strengths

- 즉시 저장을 제거하고 명시적 확인 모달을 둡니다.
- 폴더와 템플릿을 각각 서버에서 재검증합니다.
- 폴더 변경은 재생성 없이 허용하고 템플릿 변경만 확인 후 재생성합니다.
- 실패 원인별 배너와 재선택 흐름이 상세합니다.
- Jev 추천이 있을 때와 없을 때 모두 초기값을 결정할 수 있습니다.

### Concerns

- **HIGH — 재생성 Gemini 호출이 지갑·멱등·쓰기 제한을 우회합니다.** `createPlatformProvider().generateContent()`를 직접 호출하며 idempotency key도 없습니다. 현재 지갑 정산은 [chat.ts](D:/MyProject/NovelScript/lib/ai/chat.ts:136) 내부에 결합되어 있어 “기존 함수를 재사용”한다는 주석만으로는 구현할 수 없습니다.

- **HIGH — 정지된 사용자도 재생성을 호출할 수 있습니다.** 인증만 확인하고 `checkWriteAccess`와 provider 호출 후 재검사를 하지 않습니다.

- **HIGH — 존재하지 않는 model key를 사용합니다.** `MODEL_TIER_TO_ID.flash`는 현재 매핑에 없고 `lite`/`pro`만 존재합니다. [15-06-PLAN.md](D:/MyProject/NovelScript/.planning/phases/15-jev-ai/15-06-PLAN.md:290), [models.ts](D:/MyProject/NovelScript/lib/ai/providers/models.ts:9)

- **HIGH — 사용자가 선택한 폴더가 재생성 프롬프트에 반영되지 않습니다.** 재생성 액션은 모달의 현재 `folderId`가 아니라 `proposal.recommendedFolderId`를 사용합니다. 사용자가 폴더를 바꾼 경우 “저장 위치는 그대로”라는 카피와 실제 프롬프트가 어긋납니다.

- **MEDIUM — 클라이언트가 임의의 큰 proposal content를 보내 비용을 유발할 수 있습니다.** Server Action 입력 schema와 길이 제한이 없습니다.

- **MEDIUM — create와 content save가 원자적이지 않습니다.** content 저장 실패 시 템플릿 seed만 담긴 고아 문서가 남습니다.

- **MEDIUM — 모달 로딩 Promise에 catch/cancellation이 없습니다.** 한 요청 실패 시 영구 로딩이 가능하고, 빠른 open/close나 proposal 변경 시 오래된 응답이 새 상태를 덮을 수 있습니다.

- **MEDIUM — 선택된 폴더를 “추천 폴더”로 표시합니다.** 사용자가 변경한 뒤에도 추천값 자체가 바뀐 것처럼 보이므로 acceptance/change 지표와 UX가 혼동됩니다.

- **LOW — Base UI는 `null` value를 지원합니다.** canonical 템플릿을 빈 문자열로 인코딩할 필요 없이 `null`을 직접 쓰는 편이 안전합니다.

### Suggestions

- 템플릿 재생성도 공통 paid-generation lifecycle을 호출하게 하십시오.
- 재생성 요청마다 클라이언트에서 안정 UUID를 만들고 retry에 재사용하십시오.
- 액션 시그니처에 `targetFolderId`, `modelTier`, `idempotencyKey`를 추가하고 모두 검증하십시오.
- 재생성 전후 `checkWriteAccess`, balance cap, usage 기반 debit, refusal 처리를 공통화하십시오.
- 문서 생성과 content 저장을 DB RPC/transaction으로 묶으십시오.
- 추천값과 현재 선택값을 별도 상태로 보존하십시오.
- 모달 비동기 로딩에 취소 플래그와 catch/finally를 추가하십시오.

### Risk Assessment

**HIGH.** 비용 남용과 무차감 호출이 가능하며, 현재 예시는 컴파일도 실패합니다.

---

## 15-07 — QuickAdd 폴더 선택

### Summary

Jev를 호출하지 않는 직접 폴더 선택과 서버 재검증은 D-12에 잘 맞습니다. 독립적으로는 가장 실행 가능성이 높은 계획이지만, 15-03의 루트 무결성 문제를 그대로 상속합니다.

### Strengths

- QuickAdd 경로에서 Jev 의존성을 구조적으로 제거합니다.
- 기본값을 카테고리 최상위 폴더로 설정합니다.
- 선택한 폴더를 서버에서 최종 재검증합니다.
- 기존 호출자가 targetFolderId를 생략할 수 있어 하위호환성이 있습니다.

### Concerns

- **MEDIUM — 카테고리를 빠르게 바꾸면 stale 응답이 최신 선택을 덮을 수 있습니다.** effect 취소 또는 request sequence가 없습니다.

- **MEDIUM — 폴더 조회 실패와 루트 누락/중복을 같은 fallback으로 처리합니다.** 중복 루트는 서버 기본값으로 저장하면 안 됩니다.

- **MEDIUM — UI 동작 테스트가 없습니다.** Server Action 테스트만 있고 카테고리 변경 시 옵션 리셋, 선택값 전송, loading/error 표시를 검증하지 않습니다.

- **LOW — 조회 실패 카피는 “최상위에 저장”을 약속하지만 서버 기본 해석도 실패하면 실제로는 저장되지 않습니다.**

### Suggestions

- effect마다 sequence ID 또는 cancellation flag를 사용하십시오.
- `rootMissing`, `rootDuplicate`, `queryFailed`를 별도 상태로 반환하십시오.
- React Testing Library 또는 최소한 reducer/loader 단위 테스트로 카테고리 전환 race를 검증하십시오.
- 15-03의 루트 유일성 수정 후 실행하십시오.

### Risk Assessment

**MEDIUM.** 설계는 단순하고 적절하지만, 잘못된 루트 기반과 비동기 UI race가 남습니다.

---

## 15-08 — 그림자 계획 및 운영 지표

### Summary

원문을 저장하지 않고 그림자 결과와 사용자 결정을 분리 로깅하는 구조는 좋습니다. 하지만 `'x'` 문자열로 만든 합성 입력은 의미 있는 shadow 품질을 측정하지 못하며, `void promise` 방식은 Vercel 서버리스에서 신뢰할 수 없습니다.

### Strengths

- 실제 요청/챕터 원문 컬럼을 로그 스키마에서 제외합니다.
- shadow 결과를 `applied=false`로 고정합니다.
- 추천 로그와 실제 저장 결정을 분리해 acceptance/change 지표를 계산합니다.
- RLS select 정책과 service-role insert 경계를 명시합니다.
- 빈 데이터에서도 안전한 순수 metrics 함수를 계획했습니다.

### Concerns

- **HIGH — `'x'.repeat(length)` 입력은 의미 있는 shadow 평가가 아닙니다.** intent와 category 정보가 모두 사라져 Jev는 요청 길이와 후보만 보고 판단합니다. 이 결과로 실제 문서 계획 품질을 추정할 수 없습니다. [15-08-PLAN.md](D:/MyProject/NovelScript/.planning/phases/15-jev-ai/15-08-PLAN.md:164)

- **HIGH — `void runShadowPlan()`은 서버리스에서 유실될 수 있습니다.** Next.js 16/Vercel은 응답 후 작업에 `after()`/`waitUntil`을 사용해야 합니다. [Next.js after 문서](D:/MyProject/NovelScript/node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md:247)

- **HIGH — sampling·예산·회로 차단이 없습니다.** 모든 채팅에서 최대 여러 번 Jev를 호출하므로 신생 벤더 장애와 비용이 전체 트래픽에 비례해 증가합니다.

- **HIGH — 호출 수와 지연시간 측정이 부정확합니다.** task/category는 최대 2회, folder/template도 최대 2회인데 `callCount`는 단계당 1로 증가합니다. latency도 folder/template 단계를 제외한 시점에 계산합니다.

- **MEDIUM — task와 category confidence에 같은 값을 기록합니다.** 15-02가 category confidence만 최종 반환하므로 두 컬럼이 실제로 구분되지 않습니다. [15-08-PLAN.md](D:/MyProject/NovelScript/.planning/phases/15-jev-ai/15-08-PLAN.md:218)

- **MEDIUM — regeneration 지표가 기록되지 않습니다.** DB와 함수에는 필드가 있지만 modal 호출은 `regenerated`를 넘기지 않아 항상 false입니다. [15-08-PLAN.md](D:/MyProject/NovelScript/.planning/phases/15-jev-ai/15-08-PLAN.md:308)

- **MEDIUM — decision 로그가 저장 작업과 원자적이지 않습니다.** 클라이언트가 별도 fire-and-forget Server Action을 보내므로 저장 성공 후에도 로그가 손실될 수 있습니다.

- **MEDIUM — service-role 사용 전에 work ownership을 명시적으로 검증하지 않습니다.** admin client는 RLS를 우회하므로 owner/work 조합 무결성을 서버가 직접 확인해야 합니다.

- **MEDIUM — 데이터 보존·계정 삭제 정책이 없습니다.** 행동 로그의 retention, 삭제, FK cascade 또는 account deletion 연계를 정해야 합니다.

### Suggestions

- privacy 검토 전 shadow는 실트래픽별 `'x'` 호출 대신, 승인된 합성 시나리오를 실제 트래픽 분포 bucket에 따라 샘플링하는 방식으로 명확히 정의하십시오.
- Next.js `after(() => runShadowPlan(...))` 또는 durable queue를 사용하십시오.
- 1~5% sampling, 일일 비용 한도, concurrency 제한, timeout, circuit breaker를 추가하십시오.
- DecisionClient 결과에 실제 call count, latency, model version, usage/cost metadata를 포함하십시오.
- 저장 action 내부에서 `recordDocumentSaveDecision`을 실행하거나 `after()`로 연결하십시오.
- `regenerated`를 실제 모달 상태에서 전달하십시오.
- migration에 retention 및 계정 삭제 전략을 추가하십시오.

### Risk Assessment

**HIGH.** 현재 shadow 데이터는 품질 판단에 유효하지 않고, 실행 신뢰성 및 비용 통제도 부족합니다.

---

## 15-09 — 전체 게이트 및 완료 처리

### Summary

fixture 평가와 실제 벤더 기준 충족을 구분한 점은 정직합니다. 그러나 실제 평가·그림자 기준·정책 승인이 없어도 Phase를 9/9 완료로 표시하며, 활성화가 두 번의 수동 코드 수정에 의존합니다.

### Strengths

- 전체 Vitest/TypeScript/lint 회귀 게이트를 둡니다.
- fixture 성공과 실제 Jev 품질 승인을 명확히 구분합니다.
- 브라우저에서 QuickAdd와 저장 모달을 직접 확인합니다.
- 외부 정책 검토를 STATE blocker로 남깁니다.

### Concerns

- **HIGH — 실제 품질 검증 없이 Phase를 완료 처리합니다.** 실제 키 평가, 최소 shadow 표본, shadow 기준 충족 없이 “평가·그림자 파이프라인 완성”만으로 9/9 완료가 됩니다.

- **HIGH — 활성화 게이트가 완전하지 않습니다.** `assertActivationEligible`은 오프라인 eval만 확인하고 정책 승인과 shadow sample/metrics를 확인하지 않습니다.

- **HIGH — 활성화에 두 개의 수동 코드 변경이 필요합니다.** flag를 true로 바꾸고 별도로 `chatAction`이 `decisionClient`를 넘기게 해야 합니다. 하나만 바뀌면 무효 상태가 됩니다. [15-09-PLAN.md](D:/MyProject/NovelScript/.planning/phases/15-jev-ai/15-09-PLAN.md:129)

- **HIGH — Chrome Network 탭으로 서버 측 Jev 호출 부재를 증명할 수 없습니다.** 브라우저에는 Server Action 요청만 보이며 서버의 TypeSafe outbound 요청은 나타나지 않습니다. [15-09-PLAN.md](D:/MyProject/NovelScript/.planning/phases/15-jev-ai/15-09-PLAN.md:111)

- **HIGH — 브라우저 UAT에 템플릿 변경 재생성 흐름이 빠져 있습니다.** 새 템플릿 적용, 재생성 취소, 실패 복구, 실제 저장 content 검증이 체크리스트에 없습니다.

- **MEDIUM — Roadmap과 plan wave가 불일치합니다.** Roadmap은 5 waves인데 계획 파일은 wave 6까지 있고, 15-07/15-08의 위치도 다릅니다.

- **LOW — `grep -c "\[x\]" ROADMAP.md`는 Phase 15 완료를 검증하지 않습니다.** 다른 phase의 체크박스만 있어도 통과합니다.

- **LOW — 계획 날짜가 2026-09-23으로 고정되어 현재 날짜와 어긋납니다.**

### Suggestions

- 단일 `getAiDocPlanningMode()`를 두고 다음을 모두 통과해야 `active`를 반환하게 하십시오.

  - 정책 승인
  - pinned model 일치
  - 실제 벤더 eval 통과
  - golden-set hash 일치
  - 최소 shadow sample
  - shadow 오류율/지연/비용 기준 충족

- `chatAction`은 항상 이 mode resolver를 통해 client를 주입하도록 만들어 수동 이중 변경을 제거하십시오.
- phase status를 `Code complete / Activation blocked`와 `Production active`로 분리하십시오.
- 서버 측 호출 부재는 mock/integration test, server logs 또는 TypeSafe vendor usage log로 검증하십시오.
- UAT에 템플릿 변경 재생성, 취소, 실패, 저장 content 확인, 이동·삭제 race를 추가하십시오.
- Roadmap wave와 실제 `depends_on`을 동기화하십시오.

### Risk Assessment

**HIGH.** 현재 완료 게이트는 “안전하게 활성화 가능”을 증명하지 않으며, 브라우저 검증 일부도 기술적으로 증거가 되지 않습니다.

---

# 우선 수정 순서

1. **15-04/15-06:** 공통 paid-generation lifecycle을 먼저 추출해 모든 Gemini 호출이 동일한 권한·지갑·멱등·refusal 경로를 지나게 합니다.
2. **15-03:** 구조 루트 판별, 중복 루트 hard failure, 이동 감지, DB 유일성 제약을 고칩니다.
3. **15-01/15-05/15-09:** 로컬 JSON 게이트를 버리고 버전 결합된 영속 activation evidence를 설계합니다.
4. **15-02:** 후보 membership 검증과 안정 정렬을 추가합니다.
5. **15-08:** 의미 있는 합성 shadow 전략, `after()`, sampling·budget·retention을 설계합니다.
6. 이후 15-07과 UI 배선을 실행합니다.

# 최종 Risk Assessment

**Overall risk: HIGH**

계획은 요구사항 추적, UI 계약, 안전 기본값, 데이터 비노출 의도 면에서는 강합니다. 하지만 과금과 활성화가 핵심 비즈니스 안전 경계인 프로젝트에서 새 생성 경로가 사용량을 버리고, 재생성이 무차감으로 호출되며, 활성화 증거가 배포되지 않는 로컬 파일에 의존합니다. 이 세 가지가 해결되기 전에는 실행 승인을 권하지 않습니다.

이번 검토는 현재 코드와 그래프를 읽기 전용으로 대조했으며 파일은 수정하지 않았습니다. Phase 8의 안정 idempotency key, structured refusal 선처리, sanitized error 경계를 Phase 15에서도 유지해야 한다는 점은 이전 프로젝트 기록과도 일치합니다.



---

## Consensus Summary

단일 리뷰어(Codex)만 실행되어 합의 종합은 생략한다. 이전 gsd-plan-checker(Opus, 3차 패스 통과) 결과와 비교하면, Codex는 구조적 완결성(요구사항 매핑, task 필드, 의존성 그래프)을 넘어 **실제 런타임 계약 위반**을 다수 발견했다 — 특히 다음은 gsd-plan-checker가 잡지 못한 신규 발견이다:

### Codex가 새로 발견한 HIGH 이슈 (gsd-plan-checker 3차 패스에서 미검출)
- **15-04:** `GenerateResult`를 `rawText`로 축소해 기존 `usage`/`refusal`/`finishReason` 기반 정산·거절 처리를 재사용할 수 없음. `ChatInput`에 없는 필드(`input.model`, `input.maxOutputTokens`, `input.temperature`)를 예시에 사용. preset/style/genre/대화 history를 프롬프트에서 누락.
- **15-06:** 템플릿 재생성이 `createPlatformProvider().generateContent()`를 직접 호출해 지갑 차감·멱등 키·쓰기 권한 재검사를 완전히 우회. 존재하지 않는 model key(`MODEL_TIER_TO_ID.flash`, 실제는 `lite`/`pro`만 존재) 사용.
- **15-03:** 루트 폴더 판별이 `parent_id`가 조회 결과셋에 없으면 루트로 간주 — 삭제된 부모를 가진 고아 폴더도 루트로 오인. 실제로는 `parent_id IS NULL`이 구조 루트 기준(Phase 04.1 migration 참고). 폴더 이동/이름 변경 감지 안 됨.
- **15-01/15-05/15-09:** 활성화 증거가 gitignore된 로컬 JSON 파일(`.last-eval-result.json`)에만 저장되어 Vercel 서버리스 배포 환경에서 영속되지 않음 — 프로덕션 게이트로 작동 불가.
- **15-08:** shadow 입력이 `'x'.repeat(length)`로만 채워져 카테고리·의도 정보가 전부 소실, 품질 측정이 무의미. `void runShadowPlan()`은 Next.js/Vercel 서버리스에서 응답 후 유실 가능 — `after()`/`waitUntil` 필요. sampling/budget/circuit-breaker 없이 전체 트래픽에 비례해 신생 벤더 호출.
- **15-09:** Roadmap은 5 wave인데 plan은 wave 6까지 존재 — 동기화 안 됨.

### 우선 수정 순서 (Codex 제안)
1. 15-04/15-06 — 공통 paid-generation lifecycle 추출(권한·지갑·멱등·refusal 공유)
2. 15-03 — 구조 루트 판별 수정, 중복 루트 hard failure, 이동 감지, DB 유일성 제약
3. 15-01/15-05/15-09 — 로컬 JSON 게이트 폐기, 버전 결합된 영속 activation evidence로 교체
4. 15-02 — 후보 membership 검증 및 안정 정렬 추가
5. 15-08 — 의미 있는 합성 shadow 전략 + `after()` + sampling/budget/retention
6. 이후 15-07 및 UI 배선 실행

### Overall Risk
**HIGH** (Codex 판정). gsd-plan-checker의 3차 통과는 구조적 검증에 국한되며, Codex가 지적한 과금 우회·활성화 게이트 미영속화·루트 판별 오류는 실행 전 반드시 재검토가 필요하다.
