@AGENTS.md

# Language

사용자와의 모든 대화는 한국어로 진행한다.

# GSD 실행 후 로드맵 동기화

executor(gsd-executor, `/gsd:execute-phase` 등)가 plan 실행을 끝낼 때마다, 반드시 `.planning/ROADMAP.md`를 실제 완료 상태와 일치시킨다:

1. 해당 phase에 대해 다음을 실행한다: `node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" roadmap update-plan-progress <phase-number>`
2. 결과를 확인해 ROADMAP.md 상단 phase 체크박스(`- [ ]` → `- [x]`)와 하단 Progress 표의 `Plans Complete`/`Status`/`Completed` 열이 실제 SUMMARY.md 개수·완료일과 일치하는지 검증한다.
3. 자동 갱신이 안 됐거나 phase가 실행기 밖(수동 버그 수정 등)에서 완료 처리된 경우, 위 값을 직접 수정해 어긋난 상태로 남겨두지 않는다.

이 확인은 executor 세션이 끝날 때마다 매번 수행한다 — plan 하나만 끝났을 때도, phase 전체가 끝났을 때도 동일하게 적용한다.

# UI phase 완료 후 예시 목업 제공

UI 관련 phase(`/gsd:ui-phase` 등)에서 UI-SPEC.md 작성/검증이 끝나면, 문서만 전달하지 말고 사용자가 브라우저에서 직접 볼 수 있는 예시 목업도 함께 제공한다:

1. `design` 스킬을 사용해 UI-SPEC.md에 정의된 주요 화면(들)을 아트보드로 목업한다.
2. Artifact로 발행해 링크를 전달한다 — 사용자가 클릭해서 바로 확인할 수 있어야 한다.
3. UI-SPEC.md 승인만으로 phase의 UI 산출물을 끝냈다고 보지 않는다 — 목업 제공까지가 완료 조건이다.
