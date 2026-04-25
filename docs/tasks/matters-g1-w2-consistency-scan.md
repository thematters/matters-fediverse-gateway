---
task_slug: matters-g1-w2-consistency-scan
status: queued
goal: 補 followers / inbound object 的一致性掃描工具，產差異報表
dispatcher: human-fallback
executor: codex-local
host: any
branch: task/matters-g1-w2-consistency-scan
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
  - gateway-core/src/store/sqlite-state-store.mjs
  - gateway-core/src/store/file-state-store.mjs
  - research/matters-fediverse-compat/02-runtime-slices/sqlite-recovery-runtime-slice.md
  - research/matters-fediverse-compat/03-ops/production-deployment-gaps.md
local_paths:
  - none
start_command: none
stop_command: none
verify_command: cd gateway-core && npm run scan:consistency
next_step: 寫 cross-store reconcile：file store vs SQLite store 各 dump、比對 followers / inbound objects / engagements，輸出差異報表
blockers: none
---

# Task Handoff

## Context

G1 工作項目 W2。目前已有 SQLite backup/restore/reconcile 基線，但缺一支「主動掃描差異」的工具。當運維懷疑資料異常時，要能跑一次掃描就知道哪些 followers / objects / engagements 有 drift。

## Acceptance Criteria

- `npm run scan:consistency` 跑出差異報表（JSON + markdown 雙格式）
- 涵蓋三類 entity：followers、inbound objects、engagements
- 報表能標記：missing in store A、missing in store B、value mismatch
- 包含 `--repair` 旗標可選擇性回填（預設 dry-run）
- 整合到既有 `restore-replay-drill-runbook` 的流程作為 step 1

## Change Log

- 2026-04-25 created from G1 roadmap; not yet started

## Validation

- TBD
