# Phase 15: Jev 선계획 기반 AI 문서 생성 · 저장 위치 선택 - Context

**Gathered:** 2026-09-22
**Status:** Ready for planning

<domain>
## Phase Boundary

작가가 AI에게 설정 문서를 요청하면, 실제 저장 전에 다음 순서로 처리한다:
1. Jev(결정 모델)가 서버가 제공한 제한된 후보 안에서 작업 종류(`reply`/`draft`/`document`/`clarify`)와 문서 카테고리를 확률과 함께 결정
2. 문서 생성으로 확정되면 Jev가 같은 카테고리의 폴더·템플릿 후보 중 저장 위치와 템플릿을 결정
3. Gemini가 확정된 템플릿의 제목·필수 섹션·순서를 유지해 문서를 생성
4. 작가가 결과와 추천 저장 위치·템플릿을 확인·변경
5. 서버가 저장 직전 `targetFolderId`·템플릿 선택을 소유권·작품·범위·카테고리·삭제 상태 기준으로 재검증한 뒤 저장

@멘션 빠른 추가는 Jev를 호출하지 않고 카테고리별 실제 폴더 선택기를 직접 제공한다.

이 페이즈는 `.planning/phases/04-ai-gateway-mention-based-generation/bugs/BUG-01-proposal-save-nested-category-folder.md`에서 승격되었으며, 그 문서의 "해결 설계" 섹션이 이 페이즈의 1차 설계 입력이다. 새 기능 추가(문서 종류 확장, 검색/필터 등)는 범위 밖이다.

</domain>

<decisions>
## Implementation Decisions

### Jev 벤더 선택
- **D-01:** "Jev"는 이 프로젝트가 붙인 내부 역할 이름이 아니라, TypeSafe AI가 2026-09-15에 공개한 실제 결정 모델(System 1 — 상태+타입 후보를 주면 확률·확신도가 붙은 타입 결정을 70~500ms에 반환)이다. BUG-01 문서의 "후보 중 선택" 설계와 정확히 일치하는 외부 벤더로 확인됨.
- **D-02:** 이 페이즈는 실제 Jev(TypeSafe AI)를 신규 벤더로 온보딩해서 쓴다. Gemini로 같은 역할을 흉내 내는 대체안은 채택하지 않는다.
- **D-03:** Jev는 신생 벤더(출시 1주일 이내)이므로 키 발급·계약·SLA·API 안정성이 아직 검증되지 않은 상태로 이 페이즈를 시작한다. 연구 단계(research-phase)에서 Jev API 문서·요금제·Vercel AI Gateway 경유 가능 여부·데이터 처리 정책 공개 자료를 반드시 확인한다.
- **D-04:** Gemini는 기존과 동일하게 최종 문서 생성(제목·본문)을 담당한다. 역할 분리(Jev=결정, Gemini=생성)는 변경하지 않는다.

### Phase 15 범위 — 실운영까지 포함
- **D-05:** BUG-01의 5단계 도입 경로(오프라인 평가 → 그림자 계획 → 템플릿 생성 비교 → 추천 활성화 → 운영 관측) 전체를 이 페이즈 안에서 구축한다. 메커니즘만 만들고 평가·롤아웃을 후속 페이즈로 미루지 않는다.
- **D-06:** 오프라인 평가(정답셋 100~300건, 후보 순서 교란 평가)와 그림자 계획(실사용자 트래픽에 대해 Jev 판단을 기록만 하고 적용하지 않는 단계)을 반드시 거친 뒤에만 Jev 추천을 실제 Gemini 프롬프트에 반영한다.
- **D-07:** 계획 수락률·폴더/템플릿 변경률·clarify 비율·폴백률·P50/P95 지연시간·호출당 비용·재생성률에 대한 운영 관측을 이 페이즈의 산출물에 포함한다.

### 데이터 처리 정책 검토 전 운영 방식
- **D-08:** AIDOC-04에 따라 작품 데이터 보관·학습 사용·처리 지역·삭제 정책 검토가 끝나기 전에는 실제 작품 본문을 프로덕션 Jev 호출에 보낼 수 없다. 이 페이즈의 개발·오프라인 평가·그림자 계획은 전부 목업(합성) 데이터로만 진행한다.
- **D-09:** 데이터 처리 정책 검토가 완료되기 전까지는 실사용자 트래픽에 대한 Jev 실운영(추천 활성화)을 비활성화 상태로 둔다. 코드·UI·평가 파이프라인은 이 페이즈 안에서 전부 완성하되, 실제 활성화 스위치는 검토 완료 후로 미룰 수 있다 — 단, 검토 완료 자체를 이 페이즈의 완료 조건으로 강제하지는 않는다(외부 승인 프로세스이므로 Phase 5 Toss 심사와 같은 종류의 외부 대기열로 취급).
- **D-10:** 검토 주체(작가 본인/법무 등)와 검토 완료 여부는 STATE.md Blockers에 추적한다. Phase 15 계획 단계에서 검토 요청을 누가 언제 시작할지 명시한다.

### 저장 위치·템플릿 확인 UI
- **D-11:** 추천 저장 위치·템플릿 확인 UI는 제안 카드에 인라인으로 붙이지 않고, "문서로 저장하기" 클릭 시 뜨는 별도 확인 모달(저장 직전 단계)로 구현한다. 모달에서 추천 폴더·템플릿을 보여주고 변경할 수 있게 하며, 확정 버튼을 눌러야 실제 저장이 일어난다.
- **D-12:** @멘션 빠른 추가의 폴더 선택기는 Jev를 거치지 않고 QuickAddDialog 안에 카테고리별 실제 폴더 선택 UI로 직접 넣는다(모달 분리 없음). 기본값은 해당 카테고리 최상위 폴더.

### Claude's Discretion
- 확신도 임계값의 구체적 수치는 사용자가 정하지 않는다 — 오프라인 평가 데이터로 결정하고 설정값으로 관리한다(BUG-01 문서 원칙 유지).
- 저장 직전 확인 모달의 정확한 레이아웃·카피는 UI-SPEC 단계(`/gsd:ui-phase 15`)에서 구체화한다.
- Jev 호출 실패·타임아웃 시 폴백 동작(최상위 폴더/기본 템플릿 추천)은 BUG-01 문서의 규칙을 그대로 따른다.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 원인 분석 · 해결 설계 (1차 입력)
- `.planning/phases/04-ai-gateway-mention-based-generation/bugs/BUG-01-proposal-save-nested-category-folder.md` — Jev 선계획 흐름, 역할 경계, Jev 입력 계약, Gemini 생성 계약, 후보·예외 처리 규칙, 단계적 도입 절차의 전체 원본 설계

### 요구사항
- `.planning/REQUIREMENTS.md` AIDOC-01~04 (섹션 "AI 문서 계획 · 저장")

### 로드맵
- `.planning/ROADMAP.md` "Phase 15" 섹션 — Depends on Phase 14, Phase 4, Phase 04.1

### 관련 기존 코드 (BUG-01에서 식별됨 — research-phase에서 재확인)
- `lib/ai/mentions.ts` — `resolveCategoryFolderId` 단일 폴더 가정 버그 위치
- `lib/ai/prompt.ts` — 프롬프트 조립
- `lib/kb/actions.ts` — `listTemplateOptions`, `createNode` (템플릿 재사용 대상)
- `lib/kb/templates.ts`
- `app/studio/[workId]/chapters/[chapterId]/actions.ts`
- `app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanel.tsx`
- `app/studio/[workId]/chapters/[chapterId]/ai-panel/QuickAddDialog.tsx`

### 외부 벤더 (research-phase에서 신규 확인 필요)
- Jev(TypeSafe AI) 공식 문서·API 스펙·요금제·데이터 처리 정책 — 출시 직후(2026-09-15)라 공식 자료를 research-phase에서 새로 찾아야 함. 이 CONTEXT.md 작성 시점의 웹 검색 결과(Medium/Wavect/MindStudio/Simon Willison/Startup Fortune/ETV Bharat/Substack/the-ai-corner 기사)는 참고용이며 1차 소스가 아니다.

[프로젝트 내부에 별도 스펙/ADR 문서 없음 — 위 BUG-01 문서가 사실상의 설계 원본]

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/ai/gemini.ts`의 `GeminiClient` — Phase 8 어댑터 추상화로 DI 가능, 목업 데이터 기반 개발/테스트에 재사용
- `lib/kb/actions.ts`의 `listTemplateOptions` — 작품 전용/계정 공유/기본 템플릿 후보 조회, 새 템플릿 저장소 불필요
- `lib/ai/mentions.ts`의 `quickAddMentionNode` — @멘션 빠른 추가 경로, 폴더 선택 UI만 추가하면 됨

### Established Patterns
- Server Action 계층에서 소유권/스코프 검증 (Phase 2 D-10, Phase 7 authorize-before-validate 패턴)과 동일하게 Jev가 반환한 불투명 후보 키도 저장 직전 서버 재검증 필요
- Phase 8의 프로바이더 어댑터 DI 패턴을 Jev 클라이언트에도 동일하게 적용 가능

### Integration Points
- AI 패널(`AiPanel.tsx`)의 "문서로 저장하기" 버튼 → 신규 확인 모달 → 저장 액션
- `QuickAddDialog.tsx` → 폴더 선택 드롭다운 추가

</code_context>

<specifics>
## Specific Ideas

- 확인 모달은 저장 버튼 클릭 시점에만 뜨고, 생성 결과 카드 자체는 기존 UI를 그대로 유지한다(D-11).
- Jev 온보딩은 Phase 8~9의 벤더 어댑터 확장 패턴과 동일한 모양으로 접근하되, Jev는 텍스트 생성이 아닌 결정 반환 전용이므로 기존 `ProviderClient` 인터페이스를 그대로 재사용하지 않고 별도 클라이언트로 둔다(연구 단계에서 API 형태 확인 후 확정).

</specifics>

<deferred>
## Deferred Ideas

- 확신도 임계값 조정을 위한 관리자 설정 화면 — 이번 페이즈는 설정값(config)으로만 관리하고 UI는 만들지 않는다. 필요성이 확인되면 이후 페이즈로.
- Jev를 다른 결정 계층(예: 신고 우선순위 분류, 추천 랭킹)에 재사용하는 것 — 이번 페이즈는 AI 문서 생성 흐름에만 한정.

None — 논의는 페이즈 범위 안에서 유지되었다.

</deferred>

---

*Phase: 15-jev-ai*
*Context gathered: 2026-09-22*
