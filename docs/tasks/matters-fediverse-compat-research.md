---
task_slug: matters-fediverse-compat-research
status: handoff
goal: 研究 Matters.town 兼容 fediverse 的完整 federation 可行性，建立 upstream inventory、protocol gap、治理風險與架構選項的可交接研究基線
dispatcher: human-fallback
owner: codex-local
host: huangdounideiMac
branch: task/matters-fediverse-compat-research--codex-local
latest_commit: 8bd9e93
last_updated: 2026-03-20T13:48:21+08:00
tmux_session: none
host_affinity: imac
outputs_scope: mixed
shared_paths:
  - $AI_SHARED_ROOT/ai-agent/research/matters-fediverse-compat
related_repos:
  - .
  - external/ipns-site-generator
related_paths:
  - research/matters-fediverse-compat
  - docs/handoff/current.md
local_paths:
  - /Users/mashbean/Documents/AI Agent/worktrees/matters-fediverse-compat-research
start_command: python3 research/matters-fediverse-compat/multi_agent/scripts/research_flow.py bootstrap
stop_command: none
verify_command: python3 research/matters-fediverse-compat/multi_agent/scripts/research_flow.py status
next_step: 依 `research/matters-fediverse-compat/04-status/engineering-task-seeds.md` 開下一輪工程 task，優先做 identity foundation、followers collection 與 key material、最小 inbox bridge
blockers: none
---

# Task Handoff

## Context

這個 task 是為了讓 Matters.town 的 fediverse 兼容性研究能沿正式工作區流程被持續接手。協調層已完成 task branch、actor branch、current pointer、project scaffold 與 multi-agent workflow 建置。run `20260320_125854` 已全階段完成。第一輪研究已完成 upstream inventory、protocol gap、governance risk、architecture comparison，以及 bridge-first 的最終整合建議。

## Change Log

- 2026-03-20 codex-local on huangdounideiMac created the task branch, actor branch, current handoff pointer, research project scaffold, and initial research baseline
- 2026-03-20 codex-local on huangdounideiMac cloned `external/ipns-site-generator` for upstream audit and experiment planning
- 2026-03-20 codex-local on huangdounideiMac bootstrapped multi-agent runs `20260320_125550` and `20260320_125743`, with the latter set as the current active run
- 2026-03-20 codex-local on huangdounideiMac completed the first research run end to end, verified the upstream generator locally, tied encrypted article-page behavior back to governance boundaries, and selected a bridge-first architecture direction

## Validation

- `./scripts/start-task.sh matters-fediverse-compat-research codex-local codex/matters-fediverse-compat-bootstrap` created the task branch, actor branch, and task note
- `python3 research/matters-fediverse-compat/multi_agent/scripts/research_flow.py bootstrap` reused run `20260320_125550`
- `python3 research/matters-fediverse-compat/multi_agent/scripts/research_flow.py bootstrap --new-run` created run `20260320_125743`
- `python3 research/matters-fediverse-compat/multi_agent/scripts/research_flow.py advance --note "stage01 baseline established with source inventory, README, raw metadata, and initial outputs"` moved the run to `stage02_upstream_inventory`
- `npm ci` completed in `external/ipns-site-generator`
- `npm run build` completed in `external/ipns-site-generator`
- local Node execution of `makeActivityPubBundles(MOCK_HOMEPAGE('matters.news'))` confirmed only three bundles are generated and exposed missing follower collection plus missing key material
- `npx jest --config jestconfig.json --runTestsByPath dist/__tests__/makeHomepage.test.js` passed, confirming the current test coverage only asserts WebFinger inside the ActivityPub path
- `python3 research/matters-fediverse-compat/multi_agent/scripts/research_flow.py advance --note "stage02 completed with code, build, bundle inspection, and targeted jest verification"` moved the active run from `stage03_protocol_gap` to `stage04_governance_ops`
- `python3 research/matters-fediverse-compat/multi_agent/scripts/research_flow.py advance --note "stage05 architecture comparison completed with bridge-first recommendation and explicit content boundary"` moved the active run to `stage06_recommendation`
- `python3 research/matters-fediverse-compat/multi_agent/scripts/research_flow.py advance --note "stage06 synthesis completed with feasibility memo, next steps, prototype backlog, and engineering task seeds"` completed the final stage and closed the run
