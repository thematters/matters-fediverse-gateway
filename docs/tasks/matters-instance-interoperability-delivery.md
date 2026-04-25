---
task_slug: matters-instance-interoperability-delivery
status: handoff
goal: 建立 Matters 官方 instance 與外部互通的工程交付控制面，完成多代理 workflow、stage brief、核心規格、ADR 與驗收基線
dispatcher: human-fallback
owner: codex-local
host: huangdounideiMac
branch: task/matters-instance-interoperability-delivery--codex-local
latest_commit: 7179f78
last_updated: 2026-03-20T17:35:58+08:00
tmux_session: none
host_affinity: imac
outputs_scope: mixed
shared_paths:
  - $AI_SHARED_ROOT/ai-agent/research/matters-fediverse-compat
related_repos:
  - .
  - external/ipns-site-generator
related_paths:
  - research/matters-fediverse-compat/multi_agent/config/pipeline.json
  - research/matters-fediverse-compat/01-specs/instance-platform-spec.md
  - research/matters-fediverse-compat/01-specs/federation-gateway-spec.md
  - research/matters-fediverse-compat/01-specs/social-interoperability-spec.md
local_paths:
  - /Users/mashbean/Documents/AI Agent/worktrees/matters-fediverse-compat-research
start_command: python3 research/matters-fediverse-compat/multi_agent/scripts/delivery_flow.py bootstrap --new-run
stop_command: none
verify_command: python3 research/matters-fediverse-compat/multi_agent/scripts/delivery_flow.py status
next_step: 以 `gateway-core-minimum-slice` 作為下一個 engineering task，直接開始實作 follow / accept / reject、signature verification、followers state、retry 與 dead letter
blockers: none
---

# Task Handoff

## Context

這個 task 承接 Matters fediverse feasibility research、identity foundation spec 與 bridge-first 技術結論，目標是把整個主題正式推進到工程交付模式。第一個落地產品鎖定為 Matters 官方營運的 instance，但規格與 workflow 從一開始就要預留多 instance 擴充能力，並以完整社交互通作為終態方向。

## Change Log

- 2026-03-20 codex-local on huangdounideiMac created the task branch and actor branch from the completed identity foundation work
- 2026-03-20 codex-local on huangdounideiMac shifted the project from research pipeline to engineering delivery pipeline
- 2026-03-20 codex-local on huangdounideiMac initialized stage briefs, implementation specs, reviewer-ready acceptance criteria, and repo-level handoff pointers
- 2026-03-20 codex-local on huangdounideiMac bootstrapped delivery runs `20260320_170249` and `20260320_170637`, and generated stage packets plus per-stage artifact stubs
- 2026-03-20 codex-local on huangdounideiMac completed stage01 platform baseline and stage02 identity baseline artifacts inside run `20260320_170637`
- 2026-03-20 codex-local on huangdounideiMac completed the delivery run through stage07 launch readiness and prepared the next engineering seed handoff

## Validation

- `./scripts/start-task.sh matters-instance-interoperability-delivery codex-local task/matters-fediverse-identity-foundation--codex-local` created the task branch, actor branch, and task note
- `python3 research/matters-fediverse-compat/multi_agent/scripts/delivery_flow.py bootstrap --new-run` created run `20260320_170249`
- `python3 research/matters-fediverse-compat/multi_agent/scripts/delivery_flow.py status` returned `status=active`, `current_stage=Instance Platform`, `progress=0/7`
- `python3 research/matters-fediverse-compat/multi_agent/scripts/delivery_flow.py status` later confirmed active run `20260320_170637`
- `python3 - <<'PY' ... run.json ... PY` confirms run `20260320_170637` is `completed`
