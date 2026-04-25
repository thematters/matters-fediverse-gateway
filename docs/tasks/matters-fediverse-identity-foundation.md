---
task_slug: matters-fediverse-identity-foundation
status: handoff
goal: 定義 Matters fediverse identity foundation，明確 canonical actor URL、WebFinger subject、aliases、`webfDomain` 驗證規則與實作驗收條件
dispatcher: human-fallback
owner: codex-local
host: huangdounideiMac
branch: task/matters-fediverse-identity-foundation--codex-local
latest_commit: 0e1ef28
last_updated: 2026-03-20T16:51:15+08:00
tmux_session: none
host_affinity: imac
outputs_scope: git
shared_paths:
  - $AI_SHARED_ROOT/ai-agent/research/matters-fediverse-compat
related_repos:
  - .
  - external/ipns-site-generator
related_paths:
  - research/matters-fediverse-compat/01-specs/identity-foundation-spec.md
  - research/matters-fediverse-compat/04-status/engineering-task-seeds.md
local_paths:
  - /Users/mashbean/Documents/AI Agent/worktrees/matters-fediverse-compat-research
start_command: none
stop_command: none
verify_command: sed -n '1,220p' research/matters-fediverse-compat/01-specs/identity-foundation-spec.md
next_step: 把這份 spec 併入更大的 instance interoperability delivery task，作為 stage02 identity and discovery 的既有基線
blockers: none
---

# Task Handoff

## Context

這個 task 已完成，產出 `identity-foundation-spec.md` 作為後續 instance interoperability delivery 的 stage02 基線。現階段不再把它當成唯一 active task，而是作為後續 gateway、social interop 與 multi-instance 控制面的前置決策。

## Change Log

- 2026-03-20 codex-local on huangdounideiMac created the engineering task branch and actor branch from the completed research baseline
- 2026-03-20 codex-local on huangdounideiMac initialized the identity foundation task note and linked it back to the research outputs
- 2026-03-20 codex-local on huangdounideiMac completed the identity foundation spec and handed it over to the broader instance interoperability delivery task

## Validation

- `./scripts/start-task.sh matters-fediverse-identity-foundation codex-local task/matters-fediverse-compat-research--codex-local` created the task branch, actor branch, and task note
