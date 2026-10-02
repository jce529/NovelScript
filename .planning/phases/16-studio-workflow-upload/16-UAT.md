---
status: partial
phase: 16-studio-workflow-upload
source: [16-SUMMARY.md, 16-VERIFICATION.md]
started: 2026-10-02T03:00:00.000Z
updated: 2026-10-02T03:40:00.000Z
---

## Current Test

[testing paused — 3번 저장 성공/5번은 Gemini 503 해소 후, 7번은 실제 마우스·터치 필요]

## Tests

### 1. 계정 페이지 BYOK 연결 상태 요약 (STUDIO-01)
expected: /account(작가)에 OpenAI·Anthropic·Gemini 연결 상태와 키 끝 4자리 요약이 보이고 설정 페이지 링크가 동작한다.
result: PASS (2026-10-02) — "내 API 키" 섹션에 OpenAI "등록 안 됨", Anthropic "등록 안 됨", Gemini "연결됨 · •••• g5bg" 표시, "관리하기" 링크가 /studio/settings/ai-providers로 이동하고 페이지 정상 렌더링.

### 2. 설정 문서 페이지에서 AI 대화 (STUDIO-02)
expected: 설정 문서(KB 노드) 페이지에 AI 패널이 보이고, 메시지를 보내면 실제 응답이 오며 원장에 reason `kb:<nodeId>`로 차감이 기록된다.
result: PASS (2026-10-02) — 설정 문서(UAT인물A) 페이지에 AI 어시스턴트 패널 표시, 실제 Gemini 응답 수신(첫 시도 503 후 재시도 성공), 원장에 reason `kb:dd0eeb32-…`, delta -4, reference_type `ai_generation` 기록 확인.

### 3. 설정 문서에서 초안 삽입·문서 제안 저장 (STUDIO-02)
expected: 설정 문서 AI 응답의 "본문에 삽입하기"가 문서에 반영되고, 문서 제안은 저장 확인 모달을 거쳐 저장된다(회차 화면과 동일).
result: partial
reported: "문서 제안 → '문서로 저장하기' → 저장 확인 모달(추천 폴더/템플릿, 폴더·템플릿 변경, 저장)은 설정 문서 페이지에서도 동일하게 뜸. 같은 이름 문서가 이미 있어 '이미 같은 이름의 파일/폴더가 있어요. 다른 이름을 사용해주세요.' 오류로 정상 차단(조용한 대체 없음). 이름이 다른 문서로 저장 성공 및 '본문에 삽입하기'는 Gemini 503 지속으로 미확인."

### 4. 파일 업로드 — 저장 방식 (STUDIO-03)
expected: 업로드 다이얼로그에서 md/txt를 "저장"으로 올리면 선택한 폴더에 문서가 생성되고 성공 안내가 뜬다.
result: PASS (2026-10-02) — "설정 문서로 저장" 모드에서 md·txt 2개 선택 → "2개 저장" → 토스트 "2개 문서를 인물 폴더에 저장했어요." DB에서 UAT업로드인물(42자)/UAT업로드인물B(26자)가 category=인물, parent=인물 폴더로 생성됨(내용 길이 일치).

### 5. 파일 업로드 — 대화 첨부 방식 (STUDIO-03)
expected: "대화 첨부"로 올린 파일이 저장되지 않고 AI 대화 컨텍스트로만 쓰인다(응답에 파일 내용이 반영됨).
result: blocked
blocked_by: third-party
reason: "첨부 단계는 확인(칩 표시, '1개 파일을 이번 대화에 첨부했어요.' 안내, 저장 안 됨). 응답에 파일 내용이 반영되는지는 Gemini 503이 계속되어 확인 못함. 다른 서비스 키 모델(Claude Haiku)로 바꿔 재시도했으나 '다시 시도'가 동일 요청을 재전송해 Gemini 로그만 남음."

### 6. 파일 업로드 — AI 자동 분류와 승인 저장 (STUDIO-03)
expected: "AI 자동 분류"가 파일을 카테고리 트리에 배치 제안하고(저장 없음), 승인하면 제안대로 저장되며, 미분류·폴더 변경 시 실패가 보고된다.
result: PASS (2026-10-02, 실패 보고 경로는 미확인) — 인물/장소/사건 성격의 md 3개를 올리자 Jev가 한서진_인물→인물/서브인물, 안개항구_장소→장소, 대화재_사건→사건으로 배치 제안, 트리·"모든 문서가 배치됐어요" 표시, 승인 전 저장 없음. "승인하고 3개 저장" → 토스트 "3개 문서를 승인한 위치에 저장했어요." DB에서 3개 모두 제안한 폴더·카테고리로 생성됨. 미분류/폴더 변경 시 실패 보고는 시도하지 않음.

### 7. 배치 트리 드래그앤드롭 수정 (STUDIO-03)
expected: PlacementTree에서 파일을 다른 카테고리/폴더로 드래그(데스크탑 마우스, 모바일 터치 핸들)해 배치를 수정할 수 있다.
result: skipped
reason: "브라우저 자동화의 합성 드래그/포인터 이벤트로는 dnd-kit이 이동을 완료하지 못함(드래그 핸들과 'Draggable item … was dropped' 접근성 안내는 동작하나 항목 위치 불변). 도구 한계일 수 있어 실제 마우스·터치로 사람이 확인 필요."

### 8. 모바일 세로 화면 사용성 (STUDIO-04)
expected: md 미만 폭에서 사이드바가 접이식이고, AiPanel이 세로 스택이며, 여백이 줄고 업로드 다이얼로그가 스크롤된다.
result: PASS (2026-10-02, 375px 에뮬레이션) — 사이드바가 "버그 재현용 작품 · 문서 목록 / 열기" 접이식으로 동작, 가로 오버플로 없음(scrollWidth 375), AI 패널이 에디터 아래로 세로 스택, 업로드 다이얼로그 폭 343px·overflow-y auto. 실제 기기 터치는 미확인.

## Summary

total: 8
passed: 5
issues: 0
pending: 0
skipped: 1
blocked: 1
partial: 1

## Gaps

- truth: "AI 패널의 '토큰이 모두 소진됐어요 / 남은 토큰 범위까지만 응답했어요' 안내는 지갑 잔액이 소진됐을 때만 나타난다."
  status: failed
  reason: "잔액 10954인데도 응답이 요청당 출력 상한(PER_REQUEST_MAX_OUTPUT_TOKENS=2048)에서 잘리면 해당 배너와 토스트 '보유 토큰을 모두 사용해서 여기까지만 응답했어요.'가 표시됨. 원인: lib/ai/chat.ts:109, lib/ai/document-plan.ts:82·87의 wasCapped = (finishReason === 'max_tokens')가 잔액 캡과 요청당 상한(또는 thinking 토큰 소진)을 구분하지 않음. Phase 16 신규 코드 경로가 아니라 Phase 4/8 기존 동작이 설정 문서 AI에서도 드러남."
  severity: minor
  test: 2
  artifacts: [lib/ai/chat.ts, lib/ai/document-plan.ts, lib/ai/paid-generation.ts]
  missing: ["잔액 캡으로 잘린 경우와 요청당 상한으로 잘린 경우를 구분해 문구를 달리하거나, 잔액이 충분하면 '소진' 문구를 쓰지 않음"]

- truth: "파일 업로드 다이얼로그가 콘솔 경고 없이 동작한다."
  status: failed
  reason: "개발 서버 콘솔에 'Base UI: A component is changing the uncontrolled value state of Select to be controlled.' 경고가 반복되고 Next 오버레이에 '1 Issue' 배지가 뜸. 업로드 다이얼로그의 템플릿 종류/저장 폴더 Select가 value를 undefined에서 값으로 바꿔 쓰는 것으로 추정(UploadFilesDialog.tsx). 동작에는 영향 없음."
  severity: cosmetic
  test: 4
  artifacts: [app/studio/[workId]/chapters/[chapterId]/ai-panel/UploadFilesDialog.tsx]
  missing: ["Select를 처음부터 controlled(빈 문자열/null 초기값)로 통일"]

- truth: "업로드 다이얼로그의 파일 선택 UI가 스타일된 버튼으로만 보인다."
  status: failed
  reason: "AI 자동 분류 화면 스크린샷에서 '파일 선택 선택된 파일 없음', '또는 폴더째 선택 선택된 파일 없음'처럼 브라우저 기본 파일 입력 문구가 라벨과 함께 노출됨(sr-only 입력의 기본 문구가 접근성 텍스트로 섞여 보이는지, 실제 시각 노출인지는 추가 확인 필요)."
  severity: cosmetic
  test: 6
  artifacts: [app/studio/[workId]/chapters/[chapterId]/ai-panel/UploadFilesDialog.tsx]
  missing: ["파일 입력 기본 문구가 시각적으로 보이지 않는지 확인하고 숨김 처리"]

- truth: "Gemini 서비스 503(고수요)일 때 사용자가 다른 모델로 바로 재시도할 수 있다."
  status: failed
  reason: "'다시 시도'는 직전 요청(Gemini)을 그대로 재전송한다. 이번 UAT 중 Gemini 503이 길게 이어졌고, 모델 드롭다운을 Claude Haiku로 바꾼 뒤 '다시 시도'를 눌러도 Gemini 호출만 반복됨(서버 로그). 모델 변경이 재시도에 반영되는지는 추가 확인 필요."
  severity: minor
  test: 5
  artifacts: [app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanel.tsx]
  missing: ["재시도 시 현재 선택된 모델을 사용하거나, 장애 시 모델 변경 안내"]
