# 모델 ID 확인 기록

확인일: 2026-10-13 · 출처: `~/.codex/models_cache.json` (visibility=list) · 규칙 원본: `.planning/skills/jev-model-routing.md`

| 티어 | Claude (Agent `model`) | Codex `-m` |
|---|---|---|
| T4 | `opus` | `gpt-6.1-sol` |
| T3 | `sonnet` | `gpt-6-sol` |
| T2 | — | `gpt-5.6-terra` |
| T1 | `haiku` | `gpt-6-luna` |
| T0 | — | `gpt-5.6-luna` |

- 추론 강도: Sol/Terra는 low~ultra, Luna는 low~max. 기본 `medium`, T4·위험도 high는 `high`.
- 티어 표에 없는 목록 모델: `gpt-6-astra`, `gpt-5.6-sol` (용도 미정 — 쓰기 전 사용자에게 확인).
- 숨김 모델(`gpt-reserve`, `gpt-5.5`, `codex-auto-review`)은 쓰지 않는다.
- 새 모델이 추가되면 `models_cache.json`을 다시 읽어 이 표를 갱신한다.
