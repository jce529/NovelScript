# /traceability-sync

로드맵(`.planning/`) · SSOT(`docs/`) · 그래프(`graphify-out/`) 세 곳이 서로 어긋나지 않게 점검하고 맞춘다. 2026-10-10 점검에서 만든 절차를 그대로 재사용할 수 있게 적어 둔 것이다.

## 언제 쓰나

- "로드맵·SSOT·그래프 연결 안 된 곳 찾아줘", "문서 상태 동기화", "graphify 갱신" 같은 요청.
- phase 상태가 바뀐 직후(실행 완료, 검증 결과 도착, UAT 통과), 또는 마이그레이션·요구사항을 추가한 뒤.

## 세 곳의 역할과 우선순위

1. `.planning/REQUIREMENTS.md` (요구사항·traceability 표) — 가장 먼저 고친다.
2. `.planning/ROADMAP.md` (체크박스·Progress 표·phase별 Plans) → `.planning/STATE.md` (카운터·현재 위치·Next).
3. `docs/SSOT-PLANNING-IMPLEMENTATION.md` (구현 매트릭스) — REQUIREMENTS와 달라지면 REQUIREMENTS가 맞다.
4. `graphify-out/graph.json` — 코드·문서에서 자동 생성되는 산출물. 손으로 고치지 않는다.
- `docs/ssot/`는 Platty가 만든 생성물(Windows 경로 기반)이라 이 절차로 재생성하지 못한다. 낡았으면 SSOT 문서 "근거 문서 레지스트리"에 경고만 유지한다.

## 절차

### 1. 점검 (읽기만)

- 먼저 `.planning/STATE.md`와 `.planning/gaps/`의 최신 점검 문서를 읽는다(점검 문서는 스냅샷이므로 STATE와 어긋나면 STATE를 믿는다).
- 최신 원격 기준으로 본다: `git fetch origin`, 필요하면 shallow clone을 `git fetch --unshallow`로 푼다.
- 대조 항목:
  - **phase 상태**: ROADMAP 체크박스·Progress 표 vs STATE vs 실제 `*-SUMMARY.md`/`*-VERIFICATION.md` 개수·`status`(`find .planning/phases -name '*-SUMMARY.md' | wc -l`).
  - **요구사항**: REQUIREMENTS 체크박스·traceability 상태 vs ROADMAP phase `Requirements:` vs SSOT 매트릭스. ID 집합 차이는 `grep -oE '\b(AUTH|KB|EDIT|CONT|READ|PAY|ADMIN|PROV|BYOK|COST|MCP|AIDOC|STUDIO|BUGFIX|LEGAL)-[0-9]+'`를 파일별로 비교한다.
  - **카운트 문구**: SSOT의 "v1.1 N개" 같은 숫자 vs REQUIREMENTS "Coverage" 절.
  - **마이그레이션**: `supabase/migrations/` 최신 번호 vs SSOT의 번호 안내.
  - **그래프 신선도**: `graphify-out/graph.json`의 `built_at_commit` vs `git rev-parse HEAD`, 그래프에 없는 추적 파일, 그래프에는 있는데 디스크에 없는 파일.
  - **레이어 연결**: planning↔code, planning↔ssot, ssot↔code 간선 수(0이면 끊김. 요구사항 ID 노드가 이를 잇는다 — 아래 3번).
  - **SSOT 생성물**: `docs/ssot/README.md`의 `lastExportAt`·`sourceCommit`, 테이블/화면 카탈로그 vs 실제 마이그레이션·`app/**/page.tsx`.
- 결과는 "문서 / 적힌 내용 / 실제" 표로 사용자에게 보고한다. 발견만 하고 수정은 다음 단계에서 한다.

### 2. 문서 동기화 (REQUIREMENTS → ROADMAP → STATE → SSOT)

- phase 상태는 한 단어로 통일한다. 검증이 사람 확인을 기다리면 체크박스는 `[ ]` 유지, Progress 표에 `Code complete (… human_needed …)`를 적고 REQUIREMENTS는 `Code complete (browser UAT pending)`로 쓴다. "코드 완료"와 "검증 완료"를 섞지 않는다.
- STATE.md: `completed_plans`는 SUMMARY 실측, `percent`·`last_activity`·Current Position·Next를 함께 고친다.
- SSOT: v1.1 절은 REQUIREMENTS 총수와 맞추고(LEGAL은 phase가 아닌 출시 게이트로 따로), 새 phase·v2 후보·마이그레이션 번호 안내를 반영한다. 판정 범례(구현됨/부분 구현/미구현/유예/범위 밖)를 그대로 쓴다.
- `gsd-tools.cjs`가 있으면 `roadmap update-plan-progress <phase>`를 먼저 돌린다. 없으면(클라우드 세션 등) 손으로 맞추고 이 사실을 보고한다.
- 코드·검증 근거 없이 상태를 승격하지 않는다. 승격 근거(SUMMARY/VERIFICATION 경로)를 확인한 뒤 올린다.

### 3. 그래프 갱신

```bash
pip install -q "graphifyy[sql]"      # 없을 때만. [sql] 빠지면 마이그레이션이 그래프에서 빠진다
graphify update .                    # AST 전용, 비용 없음
python3 scripts/graph-link-requirements.py
```

- `graph-link-requirements.py`는 v1.1 ID 40개(PROV·BYOK·COST·MCP·AIDOC·STUDIO·BUGFIX)를 노드로 넣고 `implemented_in`/`verified_by`(PLAN `files_modified`, INFERRED), `evidenced_by`(SUMMARY), `tracked_in_ssot`/`scheduled_in`/`defined_in`을 잇는다. 멱등이라 반복 실행해도 된다. `graphify update`가 그래프를 다시 만들면 노드가 사라지므로 **항상 update 직후에 실행**한다.
- PLAN이 없는 phase(예: Phase 16)는 `.planning/req-map.json`에 ID별 파일을 적는다. 새 요구사항 접두사나 v1.0 범위를 넣으려면 스크립트의 `PREFIXES`를 고친다.
- 검증: `graphify explain "BYOK-06"`(구현·테스트·SUMMARY·SSOT·ROADMAP이 나와야 함), `graphify path "BYOK-06" "usage.ts"`. 스크립트 출력의 "implemented_in 없음" 목록은 미구현 ID(MCP, BUGFIX)만 있어야 정상이다. "사라진 파일" 경고는 PLAN이 가리키는 파일이 바뀐 것이니 필요하면 PLAN을 고치거나 무시 사유를 적는다.
- 문서(`.planning/*.md`)의 의미 노드는 AST 갱신으로 바뀌지 않는다. 필요할 때만 `/graphify --update`(LLM 호출)를 쓰고, 쓰기 전에 비용을 사용자에게 알린다.

### 4. 마무리

- `git status`로 untracked 생성물(`graphify-out/converted/` 등)까지 확인한다. 임시 파일(pip 다운로드 `*.whl` 등)은 지운다.
- 작업 브랜치에 커밋하고 push한다(문서 동기화와 그래프 산출물은 한 커밋이어도 되고, 스크립트 변경은 따로 나눠도 된다). PR은 사용자가 요청할 때만 만든다.
- 사용자에게 보고: 고친 문서, 그래프 노드/간선 수, 남은 불일치(특히 `docs/ssot/` 재생성 필요 여부).

## 알려진 한계

- `docs/ssot/`(Platty 생성물)는 이 환경에서 재생성할 수 없다.
- `implemented_in` 간선은 plan 단위라 같은 plan의 ID들은 같은 파일 집합을 가진다. ID 하나만 정확히 가리키려면 `req-map.json`에 수동으로 적는다.
- `docs/ssot/`와 그래프의 SSOT 노드는 요구사항 행 단위가 아니라 문서 단위로만 이어진다(`tracked_in_ssot`에 줄 번호 속성만 있음).
