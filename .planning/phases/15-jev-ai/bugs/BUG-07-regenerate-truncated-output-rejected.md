---
id: BUG-07
title: 문서 재생성이 응답 잘림을 "structure" 거부로 처리해 일반 실패 문구만 보임
status: open (수정 방향 정책 결정 대기 — 아래 "수정 방향" 옵션 참고)
severity: medium (재생성 성공을 한 번도 못 봄 — 과금은 안 되지만 기능이 사실상 막힘)
found: 2026-10-08
found_during: UAT 브랜치(uat/pending-verification) Phase 15-09 Task 2 브라우저 UAT — 템플릿 변경 재생성
origin_phase: 15 (15-06 7674e20 재생성 도입) · 근본 원인은 Phase 8 BUG-04(사고 토큰이 출력 상한 잠식)와 같은 계열
files:
  - lib/ai/document-regenerate.ts
  - lib/ai/document-contract.ts
  - lib/ai/providers/gemini.ts
  - lib/ai/cost.ts
  - app/studio/[workId]/chapters/[chapterId]/ai-panel/SaveDocumentPlanModal.tsx
related:
  - .planning/phases/08-provider-adapter-idempotent-debit/bugs/BUG-04-thinking-tokens-not-debited.md
---

# BUG-07: 문서 재생성이 응답 잘림을 "structure" 거부로 처리함

## 증상
저장 확인 모달에서 템플릿을 바꾸고 "다시 생성하기"를 누르면 "문서를 다시 생성하지 못했어요. 다시 시도해주세요."만 뜨고 템플릿이 추천값으로 돌아간다. 같은 흐름을 템플릿을 바꿔 3회 시도했고 3회 모두 실패했다(서비스 장애 아님 — 같은 시각 일반 채팅·생성은 성공). 서버 로그에는 `[ai] output rejected { reason: 'structure' }`만 남아 원인을 알 수 없다.

## 재현
1. 새작가 계정, "버그 재현용 작품" 설정 문서 페이지에서 AI 채팅으로 "새 인물 OOO에 대한 인물 설정 문서를 만들어줘" 요청.
2. "문서로 저장하기" → 템플릿 변경 → "기본 인물 템플릿" → "이 위치에 저장하기" → "다시 생성하기".
3. 모델 Gemini 3.5 Flash(서비스 키), 문체 간결체, 장르 로맨스. 응답 약 10~16초 뒤 실패 배너.

## 기대 / 실제
- 기대: 선택한 템플릿 구조로 문서가 다시 생성되어 저장되거나, 실패하면 원인(응답이 길어서 잘림 등)과 대처가 안내된다.
- 실제: 위 일반 실패 문구. 과금은 되지 않는다(BUG-06 수정이 유효, 잔액 10862 불변).

## 원인
임시 디버그 로그로 `validateRegeneratedDocument` 입력을 떠서 확인했다(로그는 확인 후 되돌림, 코드 변경 없음).

- 검증 결과 `{ ok: false, reason: 'missing_document' }`, `parsed.proposal === null`. 템플릿 제목 누락(`missing_headings`)이 아니다.
- 응답 원문: `[REPLY]…[/REPLY]` 뒤 `[DOCUMENT]`가 정상으로 시작하고 필요한 `##` 제목 4개 중 3개까지 충실히 나온 뒤, 네 번째 `## 📜 연관된 사건 (타임라인`에서 끊긴다. 닫는 `)`와 `[/DOCUMENT]`가 없다. 응답 길이는 약 1,100자.
- 파서(`parseChatResponse`)는 닫는 태그가 없으면 `proposal`을 null로 만들고, `document-regenerate.ts:67-69`는 어떤 검증 실패든 `reject('structure')` 한 가지로 묶는다. 잘림과 모델의 형식 오류가 구분되지 않는다.
- 잘린 이유는 출력 토큰 상한으로 추정한다: 서비스 키 호출 상한은 `min(잔액 환산, PER_REQUEST_MAX_OUTPUT_TOKENS=2048)`(`lib/ai/cost.ts`)이고 Gemini의 `maxOutputTokens`는 사고 토큰 + 본문 합계라서 사고가 길면 본문이 짧아진다. 응답이 1,100자뿐인 점이 이 설명과 맞지만, 이번에는 `finishReason`/사고 토큰 수를 로그에 넣지 않아 `MAX_TOKENS`임을 **직접 확인하지는 못했다.**

## 수정 방향
**정책 결정 대기.** Phase 8 BUG-04의 확정 사항(단계 A: 원인별 안내 문구 + 상한 소폭 상향, 단계 B: T/B 분리는 Phase 11 이후·관측 먼저)과 겹치므로 아래 옵션 중 사용자 확정이 필요하다.

- **옵션 1 — 잘림 감지·안내만 (BUG-04 단계 A와 정합).** 재생성 콜백에서 `generated.finishReason === 'max_tokens'`이면 `structure`가 아닌 별도 사유(예: `truncated`)로 거부하고, 모달 배너에 "문서가 길어 중간에 잘렸어요. 다시 시도해주세요" 같은 원인별 문구를 보인다. 과금 없음 유지. 성공률은 그대로.
- **옵션 2 — 옵션 1 + 재생성 호출 상한 상향.** 재생성은 문서 전체를 다시 쓰는 호출이라 일반 채팅보다 출력이 길다. 재생성 경로에만 더 큰 `maxOutputTokens`를 쓴다(잔액이 허용하는 범위, BYOK는 이미 8192). 차감액이 늘 수 있다.
- **옵션 3 — BUG-04 단계 B(T/B 분리)를 기다림.** 코드 변경 없이 관측 로그만 먼저 추가한다. 이 버그는 단계 B 구현 때 같이 해소. 그때까지 재생성은 사실상 사용 불가.
- (제안) 어느 옵션이든 **관측 로그에 `finishReason`·사고 토큰 수를 남긴다** — 원인 확정에 필요하다.

문구 확정 시 앱 어조("~어요")와 맞춘다.

## 검증
- `tests/ai/regenerate-document.test.ts`에 `finishReason: 'max_tokens'` 응답이 `structure`가 아닌 잘림 사유로 처리되고 무과금임을 확인하는 케이스 추가.
- 브라우저: 템플릿 변경 재생성을 5회 이상 시도해 성공/실패 비율을 기록하고, 실패 시 원인 문구가 뜨는지 확인. (이번 UAT에서 재생성 **성공**은 미확인)
- 로그에 `finishReason`이 찍혀 잘림 가설을 직접 확인.

## 부수 관찰 (이 버그 범위 밖)
- 첫 생성은 구조 검증 없이 저장되어 "오지후" 문서 본문에 템플릿 제목이 없었다(불릿만). 재생성만 제목을 엄격히 검증하는 불일치 가능성 — 별도 확인 필요.
- race 상황(모달을 연 채 선택 폴더 삭제) 후 저장 시 서버는 거절하고 폴더 선택을 최상위로 되돌렸지만 "저장 위치가 변경되었어요" 배너는 3초 뒤 화면에서 확인되지 않았다 — 별도 버그 후보.
