---
id: 15-04
title: 템플릿 재생성 시 문서 이름·사실이 바뀌어 저장되던 문제와 재생성이 채팅과 다른 provider로 나가던 문제
fixed: 2026-10-02
files:
  - lib/ai/document-regenerate.ts
  - app/studio/[workId]/chapters/[chapterId]/actions.ts
  - app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanel.tsx
  - app/studio/[workId]/chapters/[chapterId]/ai-panel/SaveDocumentPlanModal.tsx
  - app/studio/settings/ai-providers/page.tsx
  - tests/ai/regenerate-document.test.ts
  - tests/ai/save-document-plan-modal.test.ts
  - tests/ai/ai-panel-model.test.ts
---

# 15-04: 재생성 문서 이름 유지와 provider 정렬 수정

## 증상
- "새 인물 강진욱…"으로 만든 제안(이름 "강진욱")을 다른 템플릿으로 재생성·저장하자 문서가 "강시후"라는 다른 이름으로 저장됐고 본문 제목도 `# 👤 강시후`였다. 알림이나 확인이 없었다.
- (후속 발견) 채팅을 Claude로 해도 재생성은 항상 Gemini로 나가, Gemini 무료 티어 429(`rate_limited`)에 막혔다.

## 원인
- `document-regenerate.ts`가 모델 출력의 `parsed.proposal.name`을 그대로 반환하고 모달은 `override.name || proposal.name`으로 재생성 이름을 우선했다. 프롬프트에 이름 유지 지시가 없었고 검증도 이름·본문 제목 일치를 보지 않았다.
- 재생성 액션이 `createPlatformProvider('gemini')`로 고정돼 있었다. 또 AI 패널은 응답 성공 때마다 모델 선택을 계정 기본값으로 되돌려, 모달이 "현재 선택"을 읽으면 항상 기본값(Gemini)이 됐다.

## 수정
- **이름 서버 강제**(`48367dc`): 반환 `name`을 원본 `input.proposal.name`으로 고정, 프롬프트에 이름·본문 제목 유지 지시 추가, 본문 첫 H1이 원본 이름을 포함하지 않으면 `REGENERATION_FAILED`.
- **링크 검증**(`744045c`, 이후 BUG-05 `15-05`로 KB 실존 문서 링크 허용으로 완화): 재생성 본문의 `[[링크]]` 대상 검증.
- **provider 정렬**(`8cfd528`): 재생성 액션·`regenerateDocumentWithTemplate`가 `providerId`+`model`을 받아 같은 provider·모델로 호출·과금한다(`modelTier` 호출도 유지). 응답 메시지에 생성 provider·모델을 저장해 저장 모달이 그 값을 넘긴다. 대화 중에는 모델 선택을 유지하도록 성공 후 리셋을 제거하고 안내 문구를 "이 대화가 끝날 때까지 유지돼요"로 바꿨다.

## 검증
- 단위 테스트: 이름 고정, 본문 제목·링크 불일치 시 `REGENERATION_FAILED`, 프롬프트의 이름 유지 문구, provider·모델 지정 시 그 값으로 과금. `tests/ai` + `tests/studio` 590개, `tsc`·lint 통과.
- 브라우저 UAT(테스트 DB): 링크 없는 템플릿으로 재생성 → 이름 "강진욱"·`# 👤 강진욱` 유지. 링크가 있는 원본(오태성)을 `UAT링크없음`으로 재생성 → 저장본 링크는 KB 실존 문서뿐. Claude Sonnet 5로 만든 제안(서도현·문지후)을 `UAT링크없음`·계정 `인물`로 재생성 → 요청에 `providerId: anthropic`, `model: claude-sonnet-5`, 이름·본문 제목 유지, `regenerated: true`, 새 Gemini 오류 없음.
- **반복 UAT(2026-10-03)**: Claude Sonnet 5로 제안 4건(서도현·문지후·하지안·정재하)을 작품/계정/기본 템플릿으로 재생성 → 4건 모두 성공, 이름·본문 제목 유지. 이름이 바뀐 사례는 한 번도 나오지 않았다.
- **Haiku 거부 원인과 후속 수정**: Claude Haiku 4.5로 재생성하면 4회 모두 거부됐다(`structure` 3, `unknown_link` 1). 임시 진단 로그(커밋 안 함)로 `structure`의 원인을 확인했다 — 모델이 `[DOCUMENT]` 대신 `[REPLY]`로 되묻는 질문(배역·나이·외양 등)을 반환해 `missing_document`가 됐다(이름·템플릿 구조 문제 아님). 재생성 프롬프트에 "질문이나 확인 요청 없이 `[DOCUMENT]` 블록만 출력, 없는 칸은 '미정'" 지시를 추가했고(커밋 `2840bb3`), 수정 후 Haiku 2건(오세린·길민재)이 성공했다. 표본이 작아 Haiku 재생성이 항상 성공한다고는 보장하지 못한다.
- **미검증(사용자 승인하에 이관)**: 모델이 이름을 바꾼 응답의 실패 안내(Sonnet·Haiku 모두 이름을 유지해 유도하지 못함, 단위 테스트로만 커버). 이름 바뀜이 관측되면 `REGENERATION_FAILED` 안내와 잘못된 이름으로 저장되지 않는지 확인할 것. (이전 미검증 항목 "원래 모델 반복 재현"은 위 반복 UAT로 해소.)

## 커밋
- `48367dc` fix(15): BUG-04 keep original document name on template regeneration
- `744045c` fix(15): BUG-04 validate wikilinks on template regeneration
- `8cfd528` fix(15): BUG-04 재생성이 문서를 제안한 채팅과 같은 provider·모델을 쓰도록 수정
- `2840bb3` fix(15): 재생성 프롬프트가 질문 없이 [DOCUMENT] 블록만 출력하도록 지시
