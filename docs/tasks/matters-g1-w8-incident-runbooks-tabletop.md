---
task_slug: matters-g1-w8-incident-runbooks-tabletop
status: queued
goal: 完成 launch / incident / rollback 三份 runbook，並跑一次桌面演練
dispatcher: human-fallback
executor: codex-local
host: any
branch: task/matters-g1-w8-incident-runbooks-tabletop
latest_commit: UNSET
last_updated: 2026-04-25T00:00:00+08:00
tmux_session: none
host_affinity: none
outputs_scope: docs
shared_paths:
  - $AI_SHARED_ROOT/ai-agent/research/matters-fediverse-compat
related_repos:
  - .
related_paths:
  - research/matters-fediverse-compat/03-ops/launch-readiness-checklist.md
  - research/matters-fediverse-compat/03-ops/restore-replay-drill-runbook.md
  - research/matters-fediverse-compat/05-roadmap/development-plan.md
local_paths:
  - none
start_command: none
stop_command: none
verify_command: 桌面演練錄音逐字稿與決策時間戳
next_step: 寫 launch runbook、incident playbook（含五種典型情境）、rollback plan；安排一次 60 分鐘桌面演練
blockers: 需要至少 2 位參與者進行演練
---

# Task Handoff

## Context

G1 工作項目 W8，是 G1 的最後一哩。三份 runbook 是「交得出去」的最後門檻：

- **Launch runbook**：上線當天 step-by-step（pre-flight check → cutover → post-cutover smoke → 回報）
- **Incident playbook**：五種典型情境（簽章大量失敗 / 隊列積壓 / SQLite corruption / 對外實作不再回應 / 法律下架請求）的處置流程
- **Rollback plan**：cutover 失敗時的回滾路徑（時間視窗 / 資料保全 / 對外通告）

## Acceptance Criteria

- 三份 runbook 落地到 `research/matters-fediverse-compat/03-ops/`
- 桌面演練至少跑 2 個情境（建議：簽章大量失敗 + 隊列積壓）
- 演練紀錄：發現的 gap、決策延遲點、需要補的工具或文件
- 將 gap 餵回對應 task（W1 / W2 / W6 等）

## Change Log

- 2026-04-25 created from G1 roadmap; not yet started

## Validation

- TBD
