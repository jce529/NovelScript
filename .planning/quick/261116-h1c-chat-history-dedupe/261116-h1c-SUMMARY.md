# 채팅 기록 중복 제거 및 서버 검증 결과

## 바꾼 파일

- `lib/ai/prompt.ts`: 순수 함수 `compactChatHistory`와 기록 40턴·턴당 40,000자 상수를 추가했다. 앞뒤 공백을 뺀 AI 초안이 현재 본문에 포함되면 초안 본문 대신 `(제시한 본문 초안 — 본문에 반영됨)`을 넣는다. 작가 메시지와 설정 문서 제안은 보존하고, 기존 세 함수의 출력은 변경하지 않았다.
- `app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanel.tsx`: 유일한 전송 경로 `runAttempt`에서 고정된 `p.precedingText`를 기준으로 전송 기록을 축약한다. 화면의 `messages`는 유지한다.
- `app/studio/[workId]/chapters/[chapterId]/actions.ts`: 본문·기록의 타입, 길이, 역할, 마지막 작가 턴을 조회 전에 검증한다. `chat()`에는 본문과 기록의 파싱된 값을 넘긴다. 나머지 원시 입력 필드의 동작과 기존 `invalid_input` 응답은 유지했다.
- `tests/ai/prompt.test.ts`: 반영·미반영 초안, 설정 문서 보존, 41턴 축소, 결정성, 빈 초안과 null을 검증한다. 구현 전 4개 실패를 확인했다.
- `tests/ai/chat-action.test.ts`: 41턴, 40,001자 턴, 200,001자 본문, 잘못된 역할, assistant 종료, 빈 기록의 사전 거절과 파싱 결과 전달을 검증한다. 구현 전 7개 실패를 확인했다.
- `.planning/quick/261116-h1c-chat-history-dedupe/261116-h1c-SUMMARY.md`: 변경 근거와 검사 결과를 기록했다.

## 본문 길이 상한

`PRECEDING_TEXT_MAX_CHARS = 200_000`으로 정했다. 일반 회차 저장 함수 `lib/chapters/actions.ts`의 `saveChapterContent`, 설정 문서 저장 함수 `lib/kb/actions.ts`의 `saveNodeContent`에는 길이 검사 없이 본문을 저장한다. `supabase/migrations/0002_studio.sql`의 `chapters.content`와 `kb_nodes.content`는 `text`이며 길이 CHECK가 없다. 따라서 저장 상한을 찾지 못한 경우의 계획 기본값을 적용했다. MCP 제안 경로의 100,000·50,000자 제한은 일반 편집기 저장 상한이 아니다.

## 경로 확인

- 패널의 비용 안내는 `promptTokenCount: 1000`, `candidatesTokenCount: 1000`을 사용하는 고정 예시다. 대화 기록을 입력에 넣은 추정식이 없어 변경하지 않았다.
- 재생성은 `handleRegenerate`에서 `runAttempt`를 다시 호출한다. 설정 문서 편집기의 `nodeId` 경로도 같은 `AiPanel`과 `runAttempt`를 사용한다. 별도 기록 조립 경로는 없다.
- `lib/ai/document-plan.ts`는 `chat()`에 전달된 기록으로 프롬프트를 조립하므로 서버 액션에서 파싱된 기록을 받는다. `lib/mcp/tools/writing-context.ts`는 읽기만 했고 변경하지 않았다.

## 검사 결과

- `node node_modules/vitest/vitest.mjs run tests/ai/prompt.test.ts tests/ai/chat-action.test.ts`: 2파일, 51개 통과, 0개 실패.
- `node node_modules/vitest/vitest.mjs run tests/ai tests/mcp`: 82파일 통과, 7파일 실패, 8파일 건너뜀. 1,511개 통과, 37개 실패, 91개 건너뜀. 실패 로그에는 로컬 Supabase 인증 API 연결의 `AuthRetryableFetchError: fetch failed`가 나타났다. 이 환경의 DB 연결 실패는 이번 변경과 무관하여 수정하지 않았다.
- `node node_modules/typescript/bin/tsc --noEmit`: 통과, 오류 0개.
- `node node_modules/eslint/bin/eslint.js lib/ai/prompt.ts "app/studio/[workId]/chapters/[chapterId]/actions.ts" "app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanel.tsx"`: 통과, 오류 0개.
- `git diff --check`: 통과.

## 범위 밖 수정

없음. `graphify update .`와 요구사항 연결 스크립트는 사용자가 `graphify-out/` 수정을 금지했으므로 실행하지 않았다.

## 못 한 것·확신이 없는 것

브라우저에서 초안 수락 후 다음 메시지를 보내는 수동 검사는 실행하지 않았다. Supabase 연결이 없어 전체 AI·MCP DB 테스트의 실제 통과 여부는 확인하지 못했다.
