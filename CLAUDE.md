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

# 버그 문서화 규칙

버그를 발견하면 해당 phase 폴더 안의 `bugs/` 폴더에 `BUG-NN-짧은-슬러그.md`로 기록한다 (`.planning/phases/{padded_phase}-{slug}/bugs/BUG-NN-....md`). `bugs/README.md` 인덱스 표에도 한 줄 추가한다. 이미 있는 phase의 `bugs/` 폴더·템플릿 형식을 그대로 따른다.

버그가 **완전히 고쳐지면**:

1. 해당 `bugs/BUG-NN-....md` 파일을 그 phase의 `bugs/` 폴더에서 삭제하고, `bugs/README.md` 표에서도 해당 행을 지운다.
2. `.planning/fixed/` 폴더(없으면 생성)에 `{padded_phase}-{NN} 간단한 정리.md` 이름으로 새 문서를 만든다 — 예: `08-04 사고 토큰 차감 누락 수정.md`. 내용은 원래 버그 문서를 그대로 옮기지 않고, 증상·원인·수정 내용·관련 커밋을 간단히 정리한다.
3. 일부만 고쳐지고 나머지가 보류/분리된 경우(예: 정책 결정이 반반 나뉜 경우) 고쳐진 부분만 `fixed/`로 옮기고, 남은 부분은 원래 `bugs/BUG-NN-....md`에 남겨 상태를 갱신한다(파일을 통째로 삭제하지 않는다).
