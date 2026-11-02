# Codex 실행 환경 조사 (문제 4)

조사일: 2026-11-02 · codex-cli 0.166.0 · 모델 `gpt-6-luna` (reasoning low, 모든 로그 첫머리 `model: gpt-6-luna` 확인) · `~/.codex/config.toml`은 수정하지 않음

## 요약

| 항목 | 결과 |
|---|---|
| (1) `[windows] sandbox="elevated"`가 쉘·apply_patch를 막음 | **오늘은 재현되지 않음.** elevated(설정 기본값)로 쉘 실행·apply_patch 모두 성공, `setup refresh`/`Rejected` 0건 |
| (2) 검증자 Codex가 vitest를 못 돌림 | **재현됨.** 원인은 elevated 문제가 아니라 두 가지 별개 원인 (아래) |
| (3) 한도 초과 폴백 | 스킬에 한 줄 규칙만 있음, 절차 부족 |

## (1) elevated 샌드박스

config.toml 현재 상태(읽기 전용 확인): `model = "gpt-6.1-sol"`, `[windows] sandbox = "elevated"`, `[features] hooks = true`.

5개 변형을 스크래치 폴더에서 실행한 결과 모두 exit 0, `setup refresh` 0, `Rejected` 0, EPERM 0.

| 변형 | 샌드박스 | 작업 | 결과 |
|---|---|---|---|
| A | elevated + read-only | `node -v`, 파일 읽기 | 성공 |
| B | unelevated + read-only | 동일 | 성공 (PowerShell 프로필 `DotSourceNotSupported` 경고만 출력) |
| C | unelevated + workspace-write | 동일 | 성공 |
| D | elevated + workspace-write | apply_patch | 성공 (`patch: completed`) |
| E | unelevated + workspace-write | apply_patch | 성공 |

해석(추정, 미확인): 10-19에 실패한 `setup refresh had errors`는 그 시점의 Codex 버전 또는 샌드박스 사용자(setup) 상태 문제였고, 이후 업데이트나 재설정으로 풀렸을 가능성이 높다. 정확한 해소 시점·원인은 확인하지 못했다.

관찰: 이 세션의 unelevated 실행에서만 PowerShell 프로필 경고(`DotSourceNotSupported`)가 나온다. 동작에는 영향이 없다.

### 선택지
- **A. 현행 유지**: 스킬의 `-c 'windows.sandbox="unelevated"'` 호출 템플릿을 그대로 둔다. 안전하지만 폴더 경계 보호가 약하다.
- **B. 플래그 제거 시험(권장 검토)**: elevated가 오늘 정상이므로, 스킬 템플릿에서 플래그를 빼고 다음 실제 Codex 호출 1~2건(쓰기 포함)으로 확인한다. 실패 시 플래그를 다시 붙이면 된다. 스킬 수정은 이 세션 범위 밖이라 하지 않았다.
- config.toml은 건드릴 필요가 없다.

## (2) 검증자 Codex의 vitest 실패

프로젝트 루트(`C:\Users\MSI\NovelScript`)에서 `tests/admin/action-boundary.test.ts` 하나로 재현했다.

| 실행 | 샌드박스 | 결과 |
|---|---|---|
| `npx vitest run ...` | read-only / workspace-write 공통 | **실패**: `npx.ps1`이 PowerShell 실행 정책(`PSSecurityException / UnauthorizedAccess`)에 막힘 |
| `node node_modules/vitest/vitest.mjs run ...` | read-only | **실패 `EPERM`**: `mkdir 'C:\Users\MSI\AppData\Local\Temp\<id>\ssr'` — vitest가 시스템 Temp에 디렉터리를 만들지 못함 (0 test) |
| 동일 | workspace-write | **성공**: 1 file, 73 tests passed |

### 원인
1. **`npx`가 막힘**: Codex 쉘(PowerShell)에서 `npx`는 `npx.ps1`로 해석되고 실행 정책이 스크립트를 막는다. 샌드박스와 무관하다.
2. **read-only에서 EPERM**: vitest(vite-node SSR)는 실행 중 시스템 Temp(`C:\Users\MSI\AppData\Local\Temp`)에 디렉터리를 만든다. read-only 샌드박스는 이 쓰기를 거부한다. workspace-write는 같은 호출이 통과하므로 Temp 쓰기가 허용된다.
3. 10-25 로그의 "검증자 Codex는 샌드박스 EPERM으로 vitest 실행 불가"는 검증자를 read-only로 돌려서 생긴 것으로 보는 게 맞다(이번 재현과 일치. 당시 샌드박스 모드를 로그에서 확인하지는 못했다).

### 우회·해결안
- **A. 검증자는 workspace-write + 테스트 호출을 `node node_modules/vitest/vitest.mjs run <파일>`로 고정** (가장 간단). 검증자 프롬프트에 "수정 금지, 허용 파일 없음"을 명시해 쓰기 위험을 막고, 끝난 뒤 `git status`로 변경 없음을 확인한다.
- **B. 오케스트레이터(Claude)가 테스트를 직접 실행**하고 검증자는 diff·로그만 읽는다. 10-25에 실제로 쓴 방식. read-only를 유지해야 할 때 적합.
- **C. 코드를 프롬프트에 직접 넣는다**: 테스트 실행이 필요 없는 정적 리뷰에만 적합.
- read-only를 쓰면서 vitest를 돌리려면 `TEMP`/`TMP`를 허용된 폴더로 돌리는 방법을 생각할 수 있으나, 이번에 시험하지 않았다(미검증).
- 참고: 이번 재현에서 프로젝트 파일은 변경되지 않았다(`git status`에서 이 세션이 만든 변경 없음).

## (3) 한도 초과 폴백

스킬(`.planning/skills/jev-model-routing.md` §1 채널 선택, 전역 SKILL.md 같은 구간)에는 한 줄만 있다: "ChatGPT 사용 한도 초과 → Claude로 폴백하고 해제 시각을 사용자에게 알림".

부족한 점:
- 한도 초과를 어떻게 감지하는지(어떤 오류 문구인지)가 없다.
- 진행 중이던 task의 상태(어디까지 적용됐는지)를 어떻게 확인할지가 없다. 10-25 로그의 12-05-2는 수정 도중 한도가 걸려 SUMMARY 기록 직전에 중단됐다.
- 폴백 후 로그 기록 형식이 없다.

제안(스킬 수정은 이 세션 범위 밖): ① 오류 메시지의 "해제 시각" 문구를 그대로 사용자에게 전달, ② 폴백 전 `git status`/`git diff --stat`으로 중단 지점 확인, ③ 로그 비고에 `codex 한도 → claude 폴백, 해제 시각` 기록.

## 사용자가 정할 것
1. 호출 템플릿에서 `unelevated` 플래그를 제거해 시험할지 (선택지 B).
2. 검증자 샌드박스를 workspace-write로 바꿀지, 아니면 read-only 유지 + 오케스트레이터가 테스트를 돌릴지.
3. 한도 폴백 절차를 스킬에 추가할지.

## 결정 반영 (2026-11-02, 사용자 승인)
- `unelevated` 플래그 제거 시험: 플래그 없이(elevated 기본값) `-s workspace-write`로 프로젝트 폴더에 `apply_patch` 생성·삭제 + `node node_modules/vitest/vitest.mjs run` 실행 → 73 passed, `setup refresh`/`Rejected`/`EPERM` 0건, 작업 후 `git status` 변화 없음.
- 검증자도 `read-only` 대신 `workspace-write`로 통일 (수정 금지는 프롬프트로 명시).
- 한도 초과 폴백 절차를 스킬 §1에 추가.
- 반영 파일: `.planning/skills/jev-model-routing.md`, `~/.claude/skills/jev-model-routing/SKILL.md`, `~/.codex/skills/jev-model-routing/SKILL.md` (전역 두 사본은 동일).
