# Stage Brief

- Run ID: `20260320_170637`
- Stage ID: `stage05_moderation_and_ops`
- Title: Moderation And Ops
- Objective: 定義 moderation、domain policy、abuse handling、delivery retry 與 launch control 面
- Agents: writer, ops_reviewer, reviewer, editor
- Owner: `codex-local`
- Outputs scope: `git`

## Inputs

- 固定 brief 參考: `multi_agent/stage_briefs/stage05_moderation_and_ops.md`
- 對應 task note、既有 research 與上一輪 handoff
- `outputs/moderation-and-ops-spec.md`
- `outputs/launch-readiness-checklist.md`
- `processed/governance-risk/memo.md`
- `docs/adr/ADR-004-public-content-boundary.md`

## Deliverables

- moderation and ops spec
- ADR-004 public content boundary
- operations review gate
- stage05 handoff

## Done When

- 目標、邊界、owner 與驗收條件都已鎖定
- blocklist、rate limit、audit log、dead letter、legal takedown 的基線已明確
- 下一棒可直接進 stage06 multi-instance control plane，不需重談 policy source
