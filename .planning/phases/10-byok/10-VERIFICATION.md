---
phase: 10-byok
verified: 2026-09-30T00:00:00Z
documented: 2026-10-04
status: passed
score: 4/4 success criteria verified (코드 + 라이브 프로브 + 브라우저 UAT 1~9단계)
residual:
  - item: "UAT 10단계 — 검증 실패 상태 화면"
    status: "미확인 (선택 항목)"
  - item: "UAT 11단계 — 등록·피커 키보드 조작"
    status: "일부 확인 (다이얼로그 포커스·Esc만). 등록·피커 키보드 조작 미확인"
  - item: "0015·UI 수정 이후 전체 게이트 재실행"
    status: "npm test 전체·tsc·lint를 다시 돌리지 못함 (10-06 Known gaps). 관련 테스트(byok-db 14/14, byok-settings-ui 16/16)만 확인"
source: "이 문서는 10-06-SUMMARY.md, 10-VALIDATION.md 실행 결과·UAT 기록, 10-VAULT-PROBE.md를 근거로 2026-10-04에 정리했다. 이 정리 시점에 테스트를 다시 실행하지는 않았다."
---

# Phase 10 검증 보고서

**목표:** 작가가 자신의 API 키를 플랫폼에 맡기고, 키 검증이 돌려준 모델 목록이 곧 피커가 보여주는 "실제 쓸 수 있는 모델"이 된다 — 누가 비용을 내는지가 선택 시점에 보인다.
**상태:** passed (4/4 성공 기준 충족). 잔여 3건은 위 frontmatter 참조 — 기준 충족을 막는 갭은 아니다.

## 자동 검증 (2026-09-30, Plan 06 Task 1)
| 게이트 | 결과 |
|---|---|
| `npx tsc --noEmit` | 통과 |
| `npm run lint` | 오류 0 |
| `tests/ai/byok-db.test.ts` | 13 passed / skipped 0 (0015 이후 cascade 케이스 추가, 14/14) |
| `npm test` 전체 | 96 files / 996 tests 통과 (UAT 이전 시점) |
| 평문 누출 정적 검사 | `console.`(byok*.ts, ai-providers), `getByokSecret`/`get_byok_secret`·`secret_id`(app, components) 모두 무매치 |

## 라이브 검증
| 검증 | 결과 |
|---|---|
| Vault 프로브 (`10-VAULT-PROBE.md`, 2026-09-30) | `supabase_vault` 0.3.1, `create_secret` 시그니처·ACL이 가정과 일치. SQL 조정 불필요. 0014 원격 적용 2회(멱등) |
| `scripts/verify-byok-live.mjs` | 유효 키 3사 ok(openai 2, anthropic 1, gemini 1 모델), 임의 키 3사 `invalid` |

## 브라우저 UAT (2026-09-30)
| 단계 | 결과 |
|---|---|
| 1 라이브 프로브 | 통과 |
| 2 카드 3장·미등록 | 통과 |
| 3 무효 키·형식 오류 | 통과 (role=alert, 입력 비움, 미등록 유지) |
| 4 유효 키 등록 (Gemini) | 통과 — `연결됨`, 끝 4자리·등록일, 폼 제거, 페이지 HTML에 키 형태 문자열·`secret_id` 없음 |
| 5 다시 확인 | 통과 — `role=status`, 상태 유지 |
| 6 BYOK 기본값 | 통과 — DB `default_key_source=byok` |
| 7 피커·전송 차단 | 통과 — `서비스 키`→`BYOK` 배지, BYOK 선택 시 [보내기] 비활성+안내 |
| 8 삭제 다이얼로그·기본값 대체 | 통과 — DB `byok_keys` 0건, `default_key_source=service`로 대체 |
| 9 Vault 잔존 | 통과 (고아 시크릿 결함 발견 → 0015로 수정) |
| 10 검증 실패 상태 | **미확인 (선택)** |
| 11 키보드 조작 | **일부** — 다이얼로그 포커스·Esc만 |

## Success Criteria
| # | 기준 | 상태 | 근거 |
|---|---|---|---|
| 1 | 제공자별 키 1개 등록, 저장 전 models-list로 유효성·소유권 검증, 실패 키는 활성 저장 안 됨 | VERIFIED | byok-validation 단위 테스트, 라이브 프로브(유효 3사 ok/임의 키 invalid), UAT 3·4 |
| 2 | 제공자·끝 4자리·등록일·`연결됨/검증 실패/미등록`만 표시, 평문은 화면·응답·로그에 없음 | VERIFIED | UAT 4(페이지 HTML에 키·secret_id 없음), 정적 누출 검사 무매치. ※ `검증 실패` 상태의 화면은 UAT 10 미확인 |
| 3 | 삭제 시 영향 안내, 기본 선택이면 자동 대체 | VERIFIED | UAT 8·9, byok-db 14/14 (원자적 삭제·대체·고아 시크릿 금지) |
| 4 | 피커에 호출 가능한 모델만, `BYOK`/`서비스 키` 배지, 전역 토글 없음 | VERIFIED | UAT 7, ai-panel-model 테스트 7개 (그룹 헤더·항목 분리·키 없으면 BYOK 항목 없음) |

## 요구사항
BYOK-01, BYOK-02, BYOK-03, BYOK-04, PROV-05: 충족. (BYOK 모델 **호출**은 범위 밖 — 현재 BYOK 선택 시 전송 차단, Phase 11.)

## 실행 중 발견·수정한 결함
1. 계정 삭제(cascade) 시 Vault 시크릿이 고아로 남음 → `0015_byok_secret_cleanup.sql`(byok_keys 삭제 트리거) 원격 적용, 기존 고아 64개 정리 (`fac4dbb`).
2. 키 삭제 다이얼로그 [삭제] 버튼이 좁은 폭에서 작게 보임 (`8988076`).
3. AI 패널 모델/장르 칸이 배지로 넘침 (`fc4f0de`).
4. 설정 페이지 SiteHeader 중복 렌더링 (`af6264d`).
5. Phase 10 밖의 기존 테스트 실패 4건(writer-upgrade, work-crud, schema-smoke) 함께 정리.

## 알려진 한계 (10-06 Known gaps)
- 서비스 키 모델 가용성은 정적 카탈로그(Phase 9 운영 게이트)이며 실시간 권한 확인은 범위 밖.
- 0015·UI 수정 이후 전체 게이트 재실행 없음 → Phase 11 착수 전 `npx tsc --noEmit && npm run lint && npm test` 한 번 돌려 기준선을 확인할 것.

## 후속
- 잔여 3건을 처리하면 이 문서의 `residual`을 지우고 갱신한다.
