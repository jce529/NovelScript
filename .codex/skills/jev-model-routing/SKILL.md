---
name: jev-model-routing
description: "GSD 워크플로우에서 에이전트 역할·plan·task를 어떤 모델(Claude Opus/Sonnet/Haiku, GPT 6.1 Sol/6 Sol/6 Luna/5.6 Terra/5.6 Luna)에 배정할지 Jev로 분류해 정한다. plan-phase·execute-phase·quick·bug-execute 등 모델을 고르는 모든 순간, 또는 '모델 배정', '어떤 모델로 돌릴까', '토큰 아끼면서' 같은 요청에 사용한다."
---

# jev-model-routing

This skill is a pointer. The canonical instructions live in `.planning/skills/jev-model-routing.md`,
shared across Claude, Codex and other agents so everyone follows one copy.

## How to use this skill

1. Read `.planning/skills/jev-model-routing.md` in full — that is the real skill body.
2. Read `.planning/model-routing/models.md` for the verified model IDs.
3. Follow its procedure: Jev classification → fixed table → record `routing:` in PLAN frontmatter → report in one line → log to `.planning/model-routing/log.md`.
4. A model the user named explicitly always wins; routing steps aside.
