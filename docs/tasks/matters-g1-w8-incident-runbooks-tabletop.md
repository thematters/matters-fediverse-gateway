---
task_slug: matters-g1-w8-incident-runbooks-tabletop
status: blocked
goal: 完成 launch / incident / rollback 三份 runbook，並跑一次桌面演練
dispatcher: human-fallback
executor: codex-local
host: any
branch: task/matters-g1-w8-incident-runbooks-tabletop
latest_commit: codex-local
last_updated: 2026-05-02T10:50:00-04:00
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
next_step: 三份 runbook 與 repo-safe tabletop record template 已完成；下一步需要至少 2 位參與者進行 60 分鐘內部演練，優先跑簽章大量失敗與隊列積壓
blockers: 需要真人安排並參與 tabletop；演練紀錄放內部文件，不公開進 repo，除非另行核准
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
- 2026-05-01 Decision 07 confirmed first tabletop scenarios and internal-record policy
- 2026-05-02 runbook draft completed by codex-local: `launch-runbook.md`, `incident-playbook.md`, `rollback-plan.md`, and repo-safe `tabletop-drill-record-template.md`

## Validation

- Local document validation pending full repo checks
- W8 remains blocked on real 2+ participant tabletop execution; no completed tabletop result is claimed
