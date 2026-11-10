---
phase: 14-mcp-write-review
plan: 13
subsystem: mcp / proposals
tags: [patch-edits, contentHash, migration-0044]
requires: [14-10, 14-11]
provides: [패치 형식 제안(replace / replace_range / replaceAll), 읽기 도구 contentHash, 0044 원자적 패치 적용]
affects: [lib/mcp/tools/kb.ts, lib/mcp/tools/works.ts, lib/mcp/tools/proposals.ts, lib/mcp/tool-runtime.ts, supabase/migrations/0044_mcp_proposal_patches.sql]
requirements: [MCP-05, MCP-06]
key-decisions:
  - "패치는 제안 RPC 안(SQL)에서 원본을 FOR UPDATE로 잠근 같은 트랜잭션에서 적용해 전체 제안본으로 풀어 저장한다. 수락·되돌리기·덩어리 비교(0042)는 바뀌지 않는다."
  - "base_hash 불일치는 재탐색 없이 거절하고 최신 해시를 돌려준다(D-PATCH-03)."
  - "기존 content 입력은 replaceAll 하나로 흡수한다. 신규 생성안은 content 유지."
metrics:
  completed: 2026-11-10
---

# 14-13 요약 — 패치 형식 (사용자 호칭 "14-10")

세션 `claude/phase14-patch`(기반 `claude/phase14-merge` `2e7a6a0`). 푸시·master 병합·공유 DB 적용은 하지 않았다.

## 만든 것

| 영역 | 내용 |
|---|---|
| 읽기 | `get_kb_document`, `get_chapter`에 `contentHash`(원문 전체의 SHA-256 소문자 hex, 정규화 없음, 페이지와 무관). 설정집 null은 빈 문자열의 해시 |
| 제안 입력 | `save_draft`, `propose_kb_document`(edit)는 `baseHash` + `edits` 1~20개. 연산 3종: `replace{find,replace}`, `replace_range{start_text,end_text,replace}`, `replaceAll{content}`. 기존 `content`는 `replaceAll`로 변환. `edits`와 `content` 동시 입력, `replaceAll`과 다른 연산 혼용은 거절. 신규 생성안은 `content` 유지 |
| 오류 | 허용 목록에 있는 message + SQLSTATE일 때만 DETAIL JSON을 파싱해 새 객체로 재구성(stale/no_match/ambiguous/overlap/limit/invalid). 후보는 최대 3곳, 앞뒤 20자. 임의 SQL 메시지·토큰은 전달하지 않는다 |
| SQL (0044) | 제안 RPC 두 개를 새 시그니처 `(uuid, uuid, text, jsonb)`로 교체(옛 3-인자 시그니처 제거, `authenticated` 전용). 내부 helper 6개는 어느 API 역할도 EXECUTE 불가. 원본 행 `FOR UPDATE` → raw 해시 비교 → 패치 적용 → 정규화 → no-change 판정 → 중복 제거 → 상한 → INSERT. LF 사본에서 `strpos` 리터럴 매칭(정규식 없음, 겹친 출현 포함), 좌표는 원본 LF 사본 기준, 입력 순서 오름차순·비겹침. 성공 응답에 변경 구간 앞뒤 최대 2문단 미리보기(문단 240자 한도) |

## 커밋

| 해시 | 내용 |
|---|---|
| `2b4a5e2` | 읽기 도구 `contentHash` |
| `50372f9` | 제안 입력 계약 + 구조화 패치 오류 |
| `f95157a` | 0044 + DB 테스트 |
| `e1d9b1b` | Codex 지적 3건 반영(코드포인트 한도, SQL의 `hint_para` 재검사, `replaceAll` 정규화 전 길이 제한) |

## 직접 재실행한 수치 (일회용 DB `anzafn…`만)

| 항목 | 결과 |
|---|---|
| 전체 단위 (`--project unit`) | 203개 파일 **3396/3396** |
| `npx eslint .` | 경고·오류 0 |
| `npx tsc --noEmit` | 기존 `LayoutProps` 1건뿐 |
| DB `patch-edits` (신규) | **26/26**, 건너뜀 0 (수정 후 총괄이 직접 재실행) |
| DB `read-boundary`, `accept-revert` | 20/20, 27/27 (Task 3 직후 총괄 직접 재실행) |
| DB `draft-tools`, `kb-tools`, `tools.proposals.cross-user` | 14/14, 10/10, 5/5 (구현 에이전트 보고, 수정 후 재실행분) |
| DB `tools.cross-user`, `source-snapshot` | 12/12, 4/4 (구현 에이전트 첫 실행 보고. Codex 수정 뒤에는 다시 돌리지 않았다) |

RED(0044 적용 전, 에이전트 기록): `patch-edits` 24/24 실패, `draft-tools` 14/14 실패, `kb-tools` 6/10 실패, `read-boundary` 3/20, `source-snapshot` 3/4, `accept-revert` 1/27, `tools.cross-user` 1/12, `tools.proposals.cross-user` 4/5. 원인은 모두 새 시그니처 부재. 수정분 RED: 단위 1건(이모지 경계), DB 2건(`hint_para`, 원시 길이).

## 교차 검증 (Codex `gpt-6-sol`, 추론 high, 읽기 전용)
블로커 1 / 경고 2, 세 건 모두 고침.
- [블로커] zod `max()`가 UTF-16 단위라 SQL의 코드포인트 한도보다 작았다 → 코드포인트 기준 검사로 교체(`boundedString`).
- [경고] SQL이 `hint_para` 형식·범위를 재검사하지 않았다 → 정수 1~100,000이 아니면 `mcp_patch_invalid`.
- [경고] `replaceAll.content`의 정규화 전 길이를 제한하지 않아 제어문자를 붙여 한도를 우회할 수 있었다 → SQL에서 원시 길이도 제한.
첫 호출은 출력이 36줄에서 끊겨 검증으로 세지 않고 같은 설정으로 한 번 재시도했다.

## PLAN과 다르거나 판단한 점
1. `replaceAll`의 길이·빈 본문 검사는 기존대로 `mcp_invalid_content`(기존 단정 유지). 패치 연산의 결과 초과는 `mcp_patch_limit/result_length`.
2. `replace_range`에서 끝 앵커가 시작 앵커와 겹치면 `range_reversed`.
3. 빈 앵커는 `limit/anchor_length`.
4. no-change는 raw 원본과 비교한다. CRLF 원본에 실질 변화 없는 패치를 보내면 줄바꿈만 다른 제안이 생긴다(기존 전체 content 경로와 같은 동작).
5. TS 쪽 JSON 스키마의 `maxLength`가 실제 한도의 2배(UTF-16 상한)로 광고된다. 실제 한도는 도구 설명에 적혀 있다.

## 남은 위험·한계
- 정규화가 원본 중 바뀌지 않은 부분의 제어 문자·BOM·양방향 제어 문자까지 지운다. 그런 문자가 있는 원본이면 수정하지 않은 문단도 diff에 나온다(기존 `replaceAll`과 같음).
- 후보 위치는 LF 사본 기준 코드포인트라 읽기 도구의 offset(UTF-16, raw)과 기준이 다르다. 의도된 동작이고 테스트로 고정했다.
- 제안이 진행되는 동안 같은 회차·문서를 저장하는 쪽이 잠깐 기다린다(`FOR UPDATE`).
- **토큰 절감 효과는 측정하지 않았다.** PLAN 위험 7의 실제 사용 로그 계측은 14-09 인수 때 해야 한다. CONTEXT의 절감 수치는 가정치다.
- 실제 Claude 커넥터로 `edits` 호출이 동작하는지(도구 스키마가 클라이언트에서 어떻게 보이는지)는 확인하지 않았다. 14-09 항목.
- 공유 DB는 읽지도 쓰지도 않았다. 0044는 일회용에만 적용했다.
