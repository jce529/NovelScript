# Phase 17: 버그 수정 통합 (Phase 16 UAT 갭 + 누적 미해결 버그) - Context

**Gathered:** 2026-10-02
**Status:** Scoped (not yet planned) — `/gsd:plan-phase 17` 전에 아래 "사용자 결정 필요" 확인

<domain>
## Phase Boundary

새 기능을 만들지 않는다. 이미 구현된 Phase 4·8·15·16 코드에서 확인됐거나 보류 중인 **버그·UI 경고·기준선 문제**를 한 phase에서 정리한다.

버그 추적 규칙(CLAUDE.md "버그 워크플로")은 그대로 따른다. 각 버그는 **원인 phase의 `bugs/` 폴더**에 `BUG-NN-….md`로 문서화(`/bug-plan`) → 수정·커밋(`/bug-execute`) → 검증 후 `.planning/fixed/`로 이동(`/bug-complete`)한다. 이 phase는 그 작업들을 묶는 우산이며, 새 문서 체계를 만들지 않는다.

**범위 밖:** 스트리밍·실시간 토큰 표시 (SEED-002), Phase 11 BYOK 호출 경로, Jev 활성화(AIDOC-04) 정책 결정.
</domain>

<scope>
## 범위 (출처별)

### A. Phase 16 UAT 갭 (`.planning/phases/16-studio-workflow-upload/16-UAT.md`)

| ID(임시) | 내용 | 심각도 | 원인 phase | 요구사항 | 상태 |
|---|---|---|---|---|---|
| G1 | 잔액 10954인데 응답이 요청당 출력 상한(`PER_REQUEST_MAX_OUTPUT_TOKENS=2048`)에서 잘리면 "토큰이 모두 소진됐어요" 배너·토스트가 뜸. `wasCapped = (finishReason === 'max_tokens')`가 잔액 캡/요청당 상한/thinking 소진을 구분 못 함 (`lib/ai/chat.ts:109`, `lib/ai/document-plan.ts:82·87`) | minor | 4/8 | BUGFIX-01 | 확인됨 |
| G2 | 업로드 다이얼로그 Base UI `Select` uncontrolled→controlled 콘솔 경고, Next 오버레이 "1 Issue" (`UploadFilesDialog.tsx`) | cosmetic | 16 | BUGFIX-03 | 확인됨 |
| G3 | 파일 선택 영역에 브라우저 기본 문구("선택된 파일 없음")가 보임 | cosmetic | 16 | BUGFIX-03 | **추가 확인 필요** (시각 노출 여부) |
| G4 | "다시 시도"가 모델 변경을 반영하지 않고 이전 모델(Gemini)로 재전송되는 것으로 보임 (`AiPanel.tsx`) | minor | 16 | BUGFIX-04 | **추가 확인 필요** (재현 확정 전) |

### B. 기존 미해결 버그 문서

| 문서 | 내용 | 심각도 | 요구사항 | 비고 |
|---|---|---|---|---|
| Phase 15 `BUG-04-regenerate-changes-document-name.md` | 템플릿 재생성 시 문서 이름이 바뀌어 저장됨 | medium | BUGFIX-02 | **수정 방향 확정(C안)** — 바로 실행 가능 |
| Phase 15 `BUG-03-template-list-not-filtered-by-category.md` | 템플릿 카테고리 폴더 구조 — 남은 브라우저 UAT(전 항목 재생성, AI 추천, 미분류 표시 등) | — | BUGFIX-02 | 구조·마이그레이션은 완료, UAT만 남음 |
| Phase 8 `BUG-04-thinking-tokens-not-debited.md` | thinking 토큰이 `maxOutputTokens` 예산을 잠식해 본문이 잘림 | low | BUGFIX-01 | **보류 중 — 정책 미결.** G1이 이 문서의 "관찰 항목"에 실사용 근거를 추가함 (아래) |

### C. 테스트·린트 기준선 (Phase 8 `bugs/README.md` "기존 기록" + Phase 16 `16-VERIFICATION.md`)

| 이슈 | 요구사항 |
|---|---|
| eslint `react-hooks/set-state-in-effect` 2건: `MentionAutocomplete.tsx`, `QuickAddDialog.tsx` | BUGFIX-05 |
| `tests/auth/writer-upgrade.test.ts` "rejects a second conversion attempt" 단독 실행에서도 실패 | BUGFIX-05 |
| 전체 `npx vitest run`에서 DB 통합 테스트가 파일 병렬 실행으로 교착 — `--no-file-parallelism`이면 통과 | BUGFIX-05 |
| Phase 16 기준선: 전체 tests 36개 파일 실패. `tests/ai`는 변경 전에도 4개 파일이 `supabaseUrl` 환경변수로 실패. 나머지 폴더 실패 원인 미확인 | BUGFIX-05 |

### D. 수정 후 이어서 확인할 UAT (버그는 아님, 막혔던 검증)

- Phase 16 UAT: 3번(새 이름으로 저장 성공·본문 삽입), 5번(대화 첨부 응답 반영), 7번(드래그앤드롭 — 실제 마우스·터치), 6번의 실패 보고 경로 — Gemini 503 해소 후
- Phase 15 HUMAN-UAT item 2: 재생성 성공/실패 문구, 이동·삭제 race 재검증 배너
- Phase 4 HUMAN-UAT 3번(실제 차감액 대조)은 SEED-002 이후라 이 phase 범위 밖
</scope>

<evidence>
## G1 ↔ Phase 8 BUG-04 근거 (2026-10-02 UAT)

Phase 8 BUG-04는 "실사용에서 `wasCapped` 발생 빈도"와 "thinking 예산을 줄였을 때 품질 차이"를 데이터로 확보한 뒤 재논의하기로 보류됐다. 오늘 UAT에서 얻은 근거:

- 설정 문서 AI 패널에서 **"이 인물의 성격을 한 문장으로 제안해줘."** 같은 짧은 요청의 응답이, 잔액 10954·서비스 키 Gemini 3.5 Flash 조건에서 `max_tokens`로 끝나 "토큰이 모두 소진됐어요 / 남은 토큰 범위까지만 응답했어요."가 표시됐다 (원장 차감 -4, 응답 본문은 일부만 생성).
- 즉 정상 사용에서도 요청당 상한(2048)이 thinking 토큰과 본문을 함께 소진할 수 있고, 현재 UI는 이를 잔액 소진으로 **오표시**한다.
- 이 근거는 BUG-04의 "보류" 조건(실사용 빈도 확인)을 부분적으로 충족하지만, 단일 관찰이라 대표성은 낮다. 정책(사고 예산 제한 / 상한 상향 / 현행 유지)은 사용자 결정이 필요하다.
</evidence>

<decisions>
## 사용자 결정 필요 (planning 전)

1. **G1/BUG-04 방향** — (a) UI 문구만 원인별로 정확하게(잔액 캡 vs 요청당 상한), 정책은 유지 / (b) 사고 예산(`thinkingBudget`) 제한 또는 요청당 상한 상향까지 포함. 권장: **(a)를 이 phase에서, (b)는 데이터 더 모은 뒤 별도 결정.**
2. **G3·G4 확정 방식** — 재현이 확정되기 전에는 BUG 문서를 만들지 않고 먼저 재현 확인(스크린샷·로그)부터 한다.
3. **BUGFIX-05 범위** — 린트 2건·테스트 분류까지만 할지, 36개 파일 실패의 근본 원인(환경 변수 포함)까지 고칠지.
</decisions>

<notes>
## 진행 메모

- 이 phase 번호(17)는 v1.1 트랙의 마지막에 붙었다. 로드맵 순서 제약(Phase 11 → 하드 경계 → 12~14)과 무관한 정리 phase이므로 Phase 11 실행과 병행해도 된다. 단, Phase 11이 `AiPanel.tsx`·`chat.ts`·`paid-generation.ts`를 수정하므로 같은 파일을 건드리는 BUGFIX-01/04는 **충돌에 주의**한다 (세션 간 동시 편집 시 파일이 깨진 사례: 2026-10-02 `kb/[nodeId]/actions.ts`).
- Gemini 3.5 Flash가 큰 요청에 503(고수요)을 자주 반환해 UAT 재검증이 막힐 수 있다 — D 항목은 Gemini 상태를 보고 진행한다.
- SEED-002(스트리밍·실시간 토큰)가 구현되면 G1의 `wasCapped` 의미와 안내 UI가 바뀌므로, BUGFIX-01을 먼저 하면 SEED-002에서 재작업이 생길 수 있다. 문구 정정은 얇게(최소 변경) 한다.
</notes>
