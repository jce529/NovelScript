# Phase 08 — 발견된 버그

Phase 8 실행과 08-09 체크포인트 검증(2026-09-18, Chrome + 실제 Gemini + fixture) 중 발견한 버그와 미결 이슈를 모았다.
**Phase 8 회귀는 없다.** 발견된 문제는 대부분 이전 phase에서 생긴 것이고, BUG-04만 Phase 8에서 정해야 할 과금 정책 문제였다.

완전히 고쳐진 버그는 이 폴더에서 지우고 `.planning/fixed/`로 옮긴다 — 현재: [`08-04 사고 토큰 차감 누락 수정.md`](../../../fixed/08-04%20사고%20토큰%20차감%20누락%20수정.md).

| ID | 제목 | 심각도 | 발생 phase | Phase 8 회귀 | 상태 |
|---|---|---|---|---|---|
| [BUG-01](BUG-01-proposal-save-nested-category-folder.md) | 하위 폴더가 있는 카테고리에서 AI 문서 제안 저장·빠른 추가 실패 | High | 04 | 아니오 | open (작업 칩 생성됨) |
| [BUG-02](BUG-02-mention-enter-inserts-newline.md) | @멘션 자동완성에서 Enter가 선택 대신 줄바꿈 | Medium | 04 | 아니오 | open |
| [BUG-03](BUG-03-admin-prerender-build-failure.md) | `npm run build`가 `/admin` 정적 프리렌더에서 실패 | High | 07 | 아니오 | open (deferred) |
| [BUG-04](BUG-04-thinking-tokens-not-debited.md) | 사고(thinking) 토큰이 maxOutputTokens 예산을 잠식해 본문이 잘림 | Low | 08 | 해당 없음 | open (보류 — 실사용 데이터 확보 후 재논의) |
| [BUG-05](BUG-05-fixture-env-requires-restart.md) | fixture 값을 지워도 실행 중인 dev 서버에 남음 | Low (개발 전용) | 08 | 아니오 | open |
| [BUG-06](BUG-06-editor-horizontal-overflow.md) | 창 폭 약 958px에서 챕터 편집기 가로 스크롤 발생 | Low | 미상 | 확인 필요 | needs-repro |

## 기존 기록 (deferred-items.md 참조)

- eslint `react-hooks/set-state-in-effect` 오류 2건: `MentionAutocomplete.tsx`, `QuickAddDialog.tsx`
- `tests/auth/writer-upgrade.test.ts` "rejects a second conversion attempt" 단독 실행에서도 실패
- 전체 `npx vitest run`에서 DB 통합 테스트가 파일 병렬 실행 때문에 교착(deadlock)으로 실패 — `--no-file-parallelism`으로 돌리면 통과

## 템플릿

새 버그는 `BUG-NN-짧은-슬러그.md`로 추가하고 위 표에 한 줄 넣는다. 필드: 상태·심각도·발견일·발생 phase / 재현 / 기대 / 실제 / 원인 / 수정 방향 / 검증 방법.
