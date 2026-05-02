---
task_slug: matters-g1-w1-staging-observability-drill
status: queued
goal: 在真實 staging 環境把 alerts / metrics / logs webhook sink 全接一次，產出 drill report 並歸檔
dispatcher: human-fallback
executor: codex-local
host: any
branch: task/matters-g1-w1-staging-observability-drill
latest_commit: UNSET
last_updated: 2026-04-25T00:00:00+08:00
tmux_session: none
host_affinity: none
outputs_scope: gateway-core
shared_paths:
  - $AI_SHARED_ROOT/ai-agent/research/matters-fediverse-compat
related_repos:
  - .
related_paths:
  - gateway-core/
  - gateway-core/scripts/run-staging-observability-drill.mjs
  - research/matters-fediverse-compat/02-runtime-slices/staging-observability-drill-runtime-slice.md
  - research/matters-fediverse-compat/03-ops/restore-replay-drill-runbook.md
  - research/matters-fediverse-compat/05-roadmap/development-plan.md
local_paths:
  - none
start_command: none
stop_command: none
verify_command: cd gateway-core && npm run drill:observability
next_step: 依 Decision 07 準備小型 VM/container + Caddy/TLS + SQLite persistent volume；優先用免費自架 generic webhook receiver，跑 drill 後封存 staging-observability-drill-YYYYMMDD.md
blockers: 需要 mashbean 提供 staging host / DNS 或 Cloudflare Tunnel / secret files / webhook receiver URL
---

# Task Handoff

## Context

G1 工作項目 W1。Stage 03 的最後一步：本機 drill 已通，但所有外部 sink dispatch 還沒在真實 staging 跑過一次。要在像樣的測試環境把 webhook 全接一次、產出 drill report、歸檔到 03-ops/。

## Acceptance Criteria

- staging 環境啟動 gateway-core（container 或 systemd），TLS、reverse proxy 都到位
- `npm run drill:observability` 能把 alerts / metrics / logs 三組 bundle 送到實際 webhook receiver
- Slack incoming webhook 至少接一次成功
- drill report 連同 bundle 封存到 `research/matters-fediverse-compat/03-ops/staging-drill-<日期>.md`
- 列出觀察到的告警延遲、payload 格式問題或 sink 退場條件

## Change Log

- 2026-04-25 created from G1 roadmap; not yet started
- 2026-05-01 Decision 07 confirmed staging ownership and no-cost webhook preference; still waiting for staging host and secret material

## Validation

- TBD
