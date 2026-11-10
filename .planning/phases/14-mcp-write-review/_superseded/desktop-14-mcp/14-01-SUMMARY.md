---
phase: 14-mcp
plan: 01
subsystem: tooling
tags: [env-check, migrations, vitest, next-docs]
requires: []
provides:
  - scripts/assert-vitest-json.mjs (DB verify 래퍼)
  - scripts/check-disposable-migrations.mjs (일회용 DB 선행 마이그레이션 read-only 점검)
affects: [14-03, 14-04, 14-12]
tech-stack:
  added: []
  patterns: [vitest JSON reporter 단정, 일회용 ref 가드]
key-files:
  created:
    - scripts/assert-vitest-json.mjs
    - scripts/check-disposable-migrations.mjs
  modified: []
key-decisions:
  - "신규 마이그레이션 번호는 0051/0052 사용 (최신 0050, 충돌 없음)"
requirements-completed: [MCP-05, MCP-06, MCP-07]
duration: 15min
completed: 2026-11-09
---

# Phase 14 Plan 01: 환경·버전 선행 확인 Summary

일회용 DB 경계와 Next 16.3.2 로컬 문서를 확인하고, DB verify용 vitest JSON 단정 래퍼와 선행 마이그레이션 점검 스크립트를 만들었다.

## 확인 결과
- 최신 마이그레이션 0050_feed_public_read_cost.sql. 후속 계획의 0051/0052는 비어 있음.
- Next 16.3.2, `npm ci` 완료. 로컬 문서: `node_modules/next/dist/docs/01-app/`
  - `revalidatePath(path, 'page'|'layout')` (03-api-reference/04-functions/revalidatePath.md): 리터럴 경로 `/studio`에 type 지정 가능.
  - `params`/`searchParams`는 `Promise<...>` (03-file-conventions/page.md).
  - `useSearchParams`는 Suspense 필요 (02-guides/migrating-to-cache-components.md:662, instant-navigation.md:202).
  - `app/studio/[workId]`가 이미 있어 정적 `review` 세그먼트는 동적 세그먼트보다 우선(정적 세그먼트=정확 일치).
- 일회용 DB(ref anzafnzv..., 공유 아님) 선행 마이그레이션 상태: 0037/0038/0039/0040 모두 적용됨. 0050은 함수는 있었으나 `chapters_work_published_idx` 인덱스가 누락(불일치)이어서, 멱등인 0050을 일회용 DB에만 재적용해 해소함. 이후 전부 OK.
- 재적용 명령(일회용 전용): `node scripts/apply-pending-migrations.mjs --env-file .env.disposable --expect-ref anzafnzvnynansrlyclc --from 0050 --to 0050 --execute`
- `tests/mcp/tool-annotations.test.ts` 래퍼 통과 (passed=4, pending=0, failed=0).

## Task Commits
1. Task 1-3 산출 스크립트: 01a5525 (`feat(14-01)`). Task 2는 `npm ci`와 문서 읽기뿐이라 코드 변경 없음.

## Deviations from Plan
- [Rule 3] 0050 일회용 DB 재적용(인덱스 누락 해소). 공유 DB 무접촉.
- 주의: `.env.disposable`에는 `MCP_DISPOSABLE_PROJECT_REF`가 없고 `TEMPLATE_MIGRATION_DISPOSABLE_PROJECT_REF`만 있다. 점검 스크립트는 둘 다 허용하지만, `tests/helpers/disposable-ref.ts`의 `assertDisposableRef`를 쓰는 기존 DB 테스트(14-03/04/12 및 `tests/mcp/*.database.test.ts`)는 `MCP_DISPOSABLE_PROJECT_REF`가 필요하므로 실행 시 이 값을 주입해야 한다 (14-12의 skipped 0 요구와 연관). `.env.disposable`은 수정하지 않았다.

## Known Stubs
None

## Self-Check: PASSED
