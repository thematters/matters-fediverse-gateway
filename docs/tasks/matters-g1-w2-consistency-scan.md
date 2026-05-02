---
task_slug: matters-g1-w2-consistency-scan
status: done
goal: 補 followers / inbound object 的一致性掃描工具，產差異報表
dispatcher: human-fallback
executor: codex-local
host: any
branch: task/matters-g1-w2-consistency-scan
latest_commit: codex-local
last_updated: 2026-05-02T10:45:00-04:00
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
next_step: W2 已完成；後續 production drill 預設以 SQLite 為 source of truth，若 scan 出現差異先封存報表，再由 operator 決定是否 repair file state
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
- 2026-05-02 completed by codex-local; `gateway-core/scripts/scan-consistency.mjs` now compares followers, inbound objects, and engagements across file state and SQLite, writes JSON and markdown reports, supports dry-run by default, and supports explicit `--repair --repair-target file|sqlite`

## Validation

- 2026-05-02 `node scripts/scan-consistency.mjs --config ./config/dev.instance.json --label codex-local-w2` completed with 0 diffs and wrote JSON + markdown reports under `gateway-core/runtime/consistency-scans/`
- 2026-05-02 `node --test --test-name-pattern "consistency scan"` passed 2/2 tests
