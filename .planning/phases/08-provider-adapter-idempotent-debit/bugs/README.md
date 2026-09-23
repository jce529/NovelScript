# Phase 08 — 발견된 버그

Phase 8 실행과 08-09 체크포인트 검증(2026-09-18, Chrome + 실제 Gemini + fixture) 중 발견한 버그와 미결 이슈를 모았다. 이 폴더에는 **코드 원인이 Phase 8에 있는 버그만** 남긴다 — 원인이 다른 phase에 있는 버그는 그 phase의 `bugs/` 폴더로 옮겼다(2026-09-22, CLAUDE.md "버그 문서화 규칙").

완전히 고쳐진 버그는 이 폴더에서 지우고 `.planning/fixed/`로 옮긴다 — 현재: [`08-04 사고 토큰 차감 누락 수정.md`](../../../fixed/08-04%20사고%20토큰%20차감%20누락%20수정.md).

| ID | 제목 | 심각도 | 상태 |
|---|---|---|---|
| [BUG-04](BUG-04-thinking-tokens-not-debited.md) | 사고(thinking) 토큰이 maxOutputTokens 예산을 잠식해 본문이 잘림 | Low | open (보류 — 실사용 데이터 확보 후 재논의) |
| [BUG-05](BUG-05-fixture-env-requires-restart.md) | fixture 값을 지워도 실행 중인 dev 서버에 남음 | Low (개발 전용) | open |
| [BUG-06](BUG-06-editor-horizontal-overflow.md) | 창 폭 약 958px에서 챕터 편집기 가로 스크롤 발생 (원인 phase 미상) | Low | needs-repro |

## 다른 phase로 옮긴 버그

08-09 체크포인트에서 발견됐지만 코드 원인이 이전 phase에 있어 이동함:

- BUG-01 (문서 제안 저장 실패, 하위 폴더 카테고리) → [`04-ai-gateway-mention-based-generation/bugs/BUG-01-proposal-save-nested-category-folder.md`](../../04-ai-gateway-mention-based-generation/bugs/BUG-01-proposal-save-nested-category-folder.md)
- BUG-02 (@멘션 Enter 줄바꿈) → [`04-ai-gateway-mention-based-generation/bugs/BUG-02-mention-enter-inserts-newline.md`](../../04-ai-gateway-mention-based-generation/bugs/BUG-02-mention-enter-inserts-newline.md)
- BUG-03 (`/admin` 빌드 실패) → 수정 완료, [`.planning/fixed/07-03 admin 빌드 프리렌더 실패 수정.md`](../../../fixed/07-03%20admin%20빌드%20프리렌더%20실패%20수정.md)

## 기존 기록 (deferred-items.md 참조)

- eslint `react-hooks/set-state-in-effect` 오류 2건: `MentionAutocomplete.tsx`, `QuickAddDialog.tsx`
- `tests/auth/writer-upgrade.test.ts` "rejects a second conversion attempt" 단독 실행에서도 실패
- 전체 `npx vitest run`에서 DB 통합 테스트가 파일 병렬 실행 때문에 교착(deadlock)으로 실패 — `--no-file-parallelism`으로 돌리면 통과

## 템플릿

새 버그는 `BUG-NN-짧은-슬러그.md`로 추가하고 위 표에 한 줄 넣는다. 필드: 상태·심각도·발견일·발생 phase / 재현 / 기대 / 실제 / 원인 / 수정 방향 / 검증 방법.
