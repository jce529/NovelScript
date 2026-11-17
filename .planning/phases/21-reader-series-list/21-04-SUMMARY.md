# Phase 21 구현 요약 (21-01~04)

브랜치 `refs/heads/phase21-series-list` (master 병합·push 안 함). 구현: agy(Gemini 4 Argon, 파일 편집 도구만) + Claude 검수·수정.

## 커밋
- 556ef05 docs: UI-SPEC·CONTEXT·PLAN
- d187bb8 21-03 공통 SeriesCard·WorkGrid·ListFilterBar
- 380d863 21-01 lib/discovery/work-list.ts (분류·정렬·가격 문구·24×page)
- e819107 21-02 0056_works_serial_status.sql·/studio/[workId]/settings·SerialStatusField
- 40e0916 21-04 /series/free|paid·헤더 서브 행·활성 탭 `ReaderMainTab | null`

## 검증한 것
- unit 프로젝트 관련 스위트 통과(reader/discovery/studio/works/migrations/world-tree entrypoints), eslint 클린.
- `tsc --noEmit`: 새 오류 없음(기존 `app/layout.tsx LayoutProps`는 .next 생성 타입 부재로 인한 것).
- `next build --webpack` 통과(Turbopack은 워크트리 node_modules 정션 때문에 불가). 새 라우트 3개 생성 확인.

## 검증하지 않은 것 (필수 후속)
- **일회용 DB 검증 미실행**: 0056 이중 적용, author A/B/anon UPDATE RLS 결과. `tests/discovery/serial-status-schema.test.ts`는 SQL 원문 점검(unit)만이며 DB 테스트는 작성만 하고 돌리지 않았다. 병합 후 총괄 세션이 누적 검증.
- 실제 화면(브라우저)·모바일 3열·접근성 수동 점검, 시드 데이터 기반 목록 확인.
- 공유 DB에 0056 적용(사용자가 직접).

## 계획 대비 변경
- 테스트 파일 확장자: vitest가 `*.test.ts`만 수집해 `.tsx` → `.ts`.
- `app/studio/[workId]/settings/sections.tsx` 추가: page 파일은 허용되지 않은 export(SETTINGS_SECTIONS)를 가질 수 없어 분리(27·29는 이 파일에 한 줄 추가).
- 헤더 `useSearchParams`는 무조건 호출로 정리(lint rules-of-hooks).
