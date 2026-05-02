---
task_slug: matters-g1-w1-staging-observability-drill
status: review
goal: 在真實 staging 環境把 alerts / metrics / logs webhook sink 全接一次，產出 drill report 並歸檔
dispatcher: human-fallback
executor: codex-local
host: any
branch: task/matters-g1-w1-staging-observability-drill
latest_commit: UNSET
last_updated: 2026-05-02T10:02:00-04:00
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
  - research/matters-fediverse-compat/03-ops/staging-observability-drill-template.md
  - research/matters-fediverse-compat/02-runtime-slices/staging-observability-drill-runtime-slice.md
  - research/matters-fediverse-compat/03-ops/restore-replay-drill-runbook.md
  - research/matters-fediverse-compat/05-roadmap/development-plan.md
local_paths:
  - none
start_command: none
stop_command: none
verify_command: cd gateway-core && npm run drill:observability
next_step: Cloudflare Tunnel transport smoke 與 staging-style observability drill 已通並封存；建議 staging 先長駐在既有 Mac + Cloudflare Tunnel，不新增費用。下一步需 action-time confirm 後套用 Cloudflare Access 到 staging-admin。
blockers: 需要真人確認 Cloudflare Access 允許的身分邊界（指定 email 清單或 Google Workspace domain）；安裝 cloudflared/gateway/webhook/proxy 為長駐服務也需要操作層確認
---

# Task Handoff

## Context

G1 工作項目 W1。Stage 03 的最後一步：本機 drill 已通，但所有外部 sink dispatch 還沒在真實 staging 跑過一次。要在像樣的測試環境把 webhook 全接一次、產出 drill report、歸檔到 03-ops/。

## Acceptance Criteria

- staging 環境啟動 gateway-core（container 或 systemd），TLS / Cloudflare Tunnel / reverse proxy 都到位
- `npm run drill:observability` 能把 alerts / metrics / logs 三組 bundle 送到實際 webhook receiver
- generic webhook receiver 收到三組 payload；Slack incoming webhook 只有在既有免費入口可用時才列入必測
- drill report 連同 bundle 封存到 `research/matters-fediverse-compat/03-ops/staging-observability-drill-YYYYMMDD.md`
- 列出觀察到的告警延遲、payload 格式問題或 sink 退場條件

## Change Log

- 2026-04-25 created from G1 roadmap; not yet started
- 2026-05-01 Decision 07 confirmed staging ownership and no-cost webhook preference; still waiting for staging host and secret material
- 2026-05-01 added Cloudflare Tunnel staging runbook, generic webhook receiver, and staging config template updates; still waiting for real Cloudflare/DNS/secret provisioning
- 2026-05-01 user delegated hostname and retention decisions; selected staging-gateway/admin/hooks.matters.town, local Mac or small VM through Cloudflare Tunnel, and 14-day payload retention
- 2026-05-01 local staging-style observability drill passed with generic webhook receiver, SQLite runtime state, ignored secret files, and archived report `research/matters-fediverse-compat/03-ops/staging-observability-drill-20260501-local.md`
- 2026-05-02 created Cloudflare Tunnel routes for `staging-gateway.matters.town`, `staging-admin.matters.town`, and `staging-hooks.matters.town`; started ephemeral connector/local services; public smoke returned HTTP 200; archived report `research/matters-fediverse-compat/03-ops/staging-observability-drill-20260502-cloudflare.md`
- 2026-05-02 researched no-new-cost staging options and selected existing Mac + Cloudflare Tunnel as the recommended next runtime; documented Access split and Misskey token scopes in `research/matters-fediverse-compat/03-ops/staging-hosting-access-plan-20260502.md`

## Validation

- 2026-05-01 `node scripts/check-secret-layout.mjs --config ./config/staging.local.instance.json`：pass，5 file refs checked，0 missing
- 2026-05-01 `node scripts/run-staging-observability-drill.mjs --config ./config/staging.local.instance.json --output-dir ./runtime/drills/staging-observability-20260501-local --require-sinks`：pass，alerts / metrics / logs all dispatched to local webhook receiver with HTTP 202
- 2026-05-02 Cloudflare Tunnel public smoke：`staging-gateway.matters.town`、`staging-admin.matters.town`、`staging-hooks.matters.town` all returned HTTP 200 after connector propagation
- 2026-05-02 `node scripts/run-staging-observability-drill.mjs --config ./config/staging.local.instance.json --output-dir ./runtime/drills/staging-observability-20260502-cloudflare --require-sinks`：pass，alerts / metrics / logs all dispatched to generic webhook receiver with HTTP 202
- 2026-05-02 `node --test` with primary runtime Node：pass，107 tests passing after test child processes were pinned to `process.execPath`
