# Phase 09 — 발견된 버그

Phase 9(OpenAI·Anthropic 어댑터) 코드/절차에서 원인이 발생한 버그를 모은다.

| ID | 제목 | 심각도 | 발견 | 상태 |
|---|---|---|---|---|
| [BUG-01](BUG-01-uat-accounts-not-deletable.md) | UAT용 일회용 계정이 원장 FK 때문에 삭제되지 않고 남는다 | low | 2026-09-29 | open (방향 확정: 테스트 프로젝트 전용 정리 CLI A안, 실제 삭제는 대상 승인 후) |

## 템플릿

새 버그는 `BUG-NN-짧은-슬러그.md`로 추가하고 위 표에 한 줄 넣는다. 완전히 고쳐지면 이 폴더에서 삭제하고 `.planning/fixed/{phase}-{번호} 간단한 정리.md`로 옮긴다.
