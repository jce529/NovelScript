# Phase 17 기준선 재측정 (2026-10-23)

worktree `claude/festive-swanson-cc07cc`, 선행 커밋 `4c518c6`(테스트 수정 4건: provider-fixture, tree-query, payment-flow.database, schema-source) 반영 확인. 17-02/03이 병렬로 작업 트리를 수정 중이라 unit 결과에는 그 미커밋 변경이 섞여 있다.

## 명령과 결과

| 명령 | 결과 (수정 전 -> 후) |
|------|------|
| `npx eslint .` | 경고 9 -> 1 (`AiPanel.tsx:192`, 17-04 소유), 오류 0 |
| `npx tsc --noEmit` | `app/layout.tsx(23)` `LayoutProps` 1건만 (`.next/types` 미생성, 환경). 수정 중 생긴 `webhook-credit.test.ts` 타입 오류는 toss mock 제네릭으로 해결 |
| `npx vitest run --project unit` | 4 파일 / 7 테스트 실패 (아래 분류) |
| 소유 파일 테스트 (`tests/payments tests/studio tests/ai/wallet-refresh`) | 22 파일 207 테스트 통과 |

## 실패 분류

| 항목 | 분류 | 증거 |
|------|------|------|
| `numbering.test.ts` duplicate 0022 (`0022_account_deletion_purge.sql`, `0022_template_readonly_backfill.sql`) | 잔여 결함 | 파일 2개 실제 존재. 이미 적용된 마이그레이션이라 개명 영향 검토 필요 (후속 plan) |
| `upload-files-dialog.test.ts` 3건, `regenerate-document.test.ts`(파일 로드 실패), `document-plan-generation` capped 1건, `provider-fixture` 2건 | 병렬 plan 미커밋 변경 영향 의심 (`UploadFilesDialog.tsx`, `lib/ai/document-regenerate.ts`, `paid-generation.ts` 수정 중). 이 plan 변경과 무관 | `git status`에 해당 파일이 M. provider-fixture는 `failureKind: config`로 실패 -> 선행 수정 대상 테스트인데 코드 쪽 수정이 진행 중인 파일과 맞물림. 병렬 plan 종료 후 재측정 필요 |
| DB 프로젝트 `supabaseUrl is required` | 환경 (`.env` 없음) | 일회용 DB env 없는 전체 run은 합격 기준 아님 |
| `.next/types` 부재 -> `LayoutProps` TS2304 | 환경 | `next build`/`next typegen` 전에는 재현 |
| writer-upgrade 테스트, 병렬 DB 교착 | 이미 해결 | `4e1b081`, `fixed/07-06` |
| 정리 스크립트 vs 0023 잠금 트리거 7건 (DB) | 잔여 결함 (DB env 필요, 이번엔 미측정) | 17-RESEARCH 기록 |

## 재측정 명령
```
npx eslint .
npx tsc --noEmit
npx vitest run --project unit
```
