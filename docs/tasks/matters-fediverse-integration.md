---
task_slug: matters-fediverse-integration
status: active
goal: 推進 Matters 接入 Fediverse 的專案建置與整體設計收斂
dispatcher: openclaw-main
owner: Mixed
executor: Codex
priority: ❗️
project_status: In Progress
host: none
branch: task/matters-fediverse-integration
latest_commit: UNSET
last_updated: 2026-03-20T18:25:00+08:00
tmux_session: none
host_affinity: none
outputs_scope: git
shared_paths:
  - $AI_SHARED_ROOT/matters-fediverse-integration
related_repos:
  - .
related_paths:
  - external
local_paths:
  - none
start_command: ./scripts/start-task.sh matters-fediverse-integration openclaw-main
stop_command: none
verify_command: test -f docs/handoff/tasks/matters-fediverse-integration.md
next_step: 盤點目前需求、架構邊界與依賴，切出第一階段 scope
blockers: none
---

# Task Handoff

## Context

這是 Matters 的平台型主線之一，範圍可能較廣，需先從需求、邊界與 integration 路徑收斂再往前做。

## Change Log

- 2026-03-20 openclaw-main 建立 task note

## Validation

- task 已納入 `docs/handoff/task-registry-2026-03-20.md`
