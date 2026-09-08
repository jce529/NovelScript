---
type: "query"
date: "2026-09-08T06:31:18.610313+00:00"
question: "06-CONTEXT.md의 Unresolved 섹션 3개 질문과 D-12 영향만 좁혀서 06-RESEARCH.md 재조사"
contributor: "graphify"
outcome: "useful"
source_nodes: ["Authentication Callback Overview", "getChapterAction()", "lib/chapters/actions.ts", "public-read-rls.test.ts", "login/page.tsx"]
---

# Q: 06-CONTEXT.md의 Unresolved 섹션 3개 질문과 D-12 영향만 좁혀서 06-RESEARCH.md 재조사

## Answer

Expanded via graph vocab: chapter, content, draft, studio, reader, rls, policy, auth, login, callback, view, public. A안은 column grants 회수와 독자/Studio 전용 read RPC로 최소 변경, B안은 chapter_bodies 분리와 RLS로 장기 모델 명료성, C의 security_invoker view 단독안은 base content 권한 문제로 제외. D-12는 login, auth callback, complete-email page/action, error retry, 공용 return-path validator, unlock coordinator에 영향을 주며 로그인 후 자동 구매가 아니라 확인 모달로 복귀해야 한다. 06-RESEARCH.md에 선택 checkpoint와 테스트 범위를 반영했다.

## Outcome

- Signal: useful

## Source Nodes

- Authentication Callback Overview
- getChapterAction()
- lib/chapters/actions.ts
- public-read-rls.test.ts
- login/page.tsx