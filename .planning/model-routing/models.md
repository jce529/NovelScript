# 모델 ID 확인 기록

확인일: 2026-11-02 · 출처: `~/.codex/models_cache.json` (visibility=list) + `codex exec` 실제 호출(codex-cli 0.166.0, effort=low, unelevated, read-only) · 규칙 원본: `.planning/skills/jev-model-routing.md`

표의 5개 ID는 모두 호출 성공(로그 `model:` 줄이 요청 모델과 일치, 응답 `OK`). 10-25에 `model_not_found`였던 `gpt-6.1-sol`도 이번엔 통과 — 계정 상태가 바뀌었을 수 있으니 실패하면 다시 확인한다.

| 티어 | Claude (Agent `model`) | Codex `-m` |
|---|---|---|
| T4 | `opus` | `gpt-6.1-sol` |
| T3 | `sonnet` | `gpt-6-sol` |
| T2 | — | `gpt-6.1-terra` |
| T1 | `haiku` | `gpt-6-luna` |
| T0 | — | `gpt-5.6-luna` |

- 추론 강도: Sol/Terra는 low~ultra, Luna는 low~max. 기본 `medium`, T4·위험도 high는 `high`.
- 티어 표에 없는 목록 모델: `gpt-6-astra`, `gpt-5.6-sol`, `gpt-5.6-terra` (호출 확인은 하지 않음, 용도 미정 — 쓰기 전 사용자에게 확인). `gpt-5.6-terra`는 T2가 `gpt-6.1-terra`로 바뀌면서 표에서 빠졌다.
- 숨김 모델(`gpt-reserve`, `gpt-5.5`, `codex-auto-review`)은 쓰지 않는다.
- 새 모델이 추가되면 `models_cache.json`을 다시 읽어 이 표를 갱신한다.

## Antigravity CLI (agy) 채널 — Gemini 4 Argon

확인일: 2026-11-02 · 확인 방법: `agy models`(계정 로그인 기준) + `agy -p` 스모크 테스트 · agy 버전 1.4.12 · 설치 경로 `C:\Users\MSI\AppData\Local\agy\bin\agy.exe` (Antigravity App 2.28.2 설치 확인)

| 티어(가설) | agy `--model` | 표시 이름 |
|---|---|---|
| T4 | `gemini-4-argon-high` | Gemini 4 Argon (High) |
| T3 | `gemini-4-argon-medium` | Gemini 4 Argon (Medium) |
| T2 | `gemini-4-argon-low` | Gemini 4 Argon (Low) |

- 티어 배치는 공개 벤치마크 보도만 보고 한 가설이다. 로그로 보정하기 전까지 고정 사실로 쓰지 않는다.
- 같은 목록의 `gemini-3.8-flash-*`, `gpt-oss-120b-medium`은 라우터 대상이 아니다(사용자 요청 시 추가).
- Claude 5.5(`claude-opus-5-5-*`, `claude-sonnet-5-5-*`)도 agy에서 보이지만, Claude는 Agent 도구 채널을 그대로 쓴다.
- 호출 템플릿(읽기 전용 기본):
  ```
  agy -p "<프롬프트>" --model gemini-4-argon-<강도> --mode plan --output-format text
  ```
  - 파일 수정을 맡길 때만 `--mode accept-edits`, 작업 폴더는 `--add-dir`로 좁힌다. `--dangerously-skip-permissions`는 쓰지 않는다.
  - `--print-timeout`으로 시간 상한을 둔다(기본 0 = 턴이 끝날 때까지 대기).
  - 호출 후 출력이 비었거나 로그인 오류면 실패로 보고 Claude로 폴백한다.
- 계정 로그인은 사용자가 Antigravity 앱에서 직접 한다. agy는 그 세션을 빌려 쓴다.
- API 키 과금과 구독은 별개다. agy 호출은 구독 한도 안에서 처리되는 것으로 보이지만, 한도 소진 시 동작은 아직 확인하지 않았다.
