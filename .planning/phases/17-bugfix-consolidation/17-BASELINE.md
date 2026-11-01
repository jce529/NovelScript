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

## 17-05 일회용 DB 전체 suite (2026-10-23)

환경: 사용자 허용 `env.disposable`(저장소 밖 아님, 미추적)을 프로세스 env로만 주입. 값 비출력 비교로 URL ref, DB URL ref, 선언된 ref가 서로 일치하고 공유 프로젝트(`.env.local`)와 다름을 확인. 게이트 3개(`READING_STATE_DB_TEST`, `COMPLETION_DB_TEST`, `WTREE_BRANCH_RACE_SCHEMA_COMMIT`) on. 공유 DB에는 어떤 적용도 하지 않았고, 일회용 DB에도 마이그레이션을 적용하지 않았다(개명만 했고 이력 테이블이 없음).

| 시점 | 파일 | 테스트 |
|------|------|------|
| 수정 전 (`--project db`) | 4 실패 / 61 통과 / 1 skip | 6 실패 / 516 통과 / 5 skip (locked_node_immutable 5건 + world_branch_confirmed_immutable 1건 외 reports.test.ts afterAll) |
| 수정 후 (전체, unit+db) | 1 실패 / 227 통과 / 1 skip (229) | 1 실패 / 3052 통과 / 5 skip (3058) |

### 결정과 수정
- 0022 중복: 사용자 결정으로 `0022_account_deletion_purge.sql` -> `0028_account_deletion_purge.sql`. backfill 0022는 유지, `numbering.test.ts` 가드는 엄격 그대로(통과).
- 정리 7건: 원인은 `delete from kb_nodes`가 `create_work`의 잠금 폴더를 직접 지우려 한 것. `works -> kb_nodes` FK는 cascade가 아니고 제품에 작품 삭제 경로가 없어 트리거 약화 없이는 잠긴 노드를 지울 수 없다. 해법: fixture를 `tests/helpers/work-fixture.ts`(works + 비잠금 폴더 직접 insert)로 바꾸고, 정리 스크립트는 잠금 노드/확정 가지가 있는 작품을 `locked_kb_nodes`/`confirmed_world_branch`로 사전 거부한다. 0023/0034 불변식, GUC, trigger disable 변경 없음. 회귀: 롤백 트랜잭션에서 직접 DELETE가 여전히 `locked_node_immutable`로 거부됨.
- BUGFIX-05 테스트 결함: `tests/ai/provider-fixture.test.ts`의 chatAction 2건이 Supabase env 없이 실패 -> 더미 env 스텁으로 hermetic화(env 없이 24/24 통과).

### 남은 실패 1건 (목표 0 미달)
`tests/kb/template-policy-migration.test.ts > historical: 0004 backfills ...`가 `world_branch_confirmed_immutable`로 실패. 이 테스트는 0004/0012를 DB 전체에 재실행하는데, 일회용 DB에 수동 UAT가 남긴 확정 가지 작품 3개(`UAT If Branch`, `UAT 확장 가지 작품`, `UAT 손자 가지`)가 있어 0034 불변식에 걸린다. 코드 결함이 아니라 DB 잔여물이다. 확정 가지는 불변식상 정리 경로가 없으므로 일회용 DB를 재생성하거나 해당 작품을 DB 소유자가 정리해야 한다(결정 필요). 그 밖에 일회용 DB에 과거 실행이 남긴 locked 작품 약 540개가 있다(새 fixture는 잔여물을 남기지 않음).
skip 5건: `work-instructions.database.test.ts`(별도 opt-in 게이트) 등 환경 게이트.
`tsc`: `LayoutProps` 1건만(환경). lint는 AiPanel 1경고(17-04 소유).
