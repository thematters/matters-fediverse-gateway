# Stage Brief

- Run ID: `20260320_170637`
- Stage ID: `stage06_multi_instance_control_plane`
- Title: Multi-Instance Control Plane
- Objective: 定義 instance registry、per-instance config、namespace isolation、policy scope 與 shared service 邊界
- Agents: planner, architect, ops_reviewer, reviewer
- Owner: `codex-local`
- Outputs scope: `git`

## Inputs

- 固定 brief 參考: `multi_agent/stage_briefs/stage06_multi_instance_control_plane.md`
- 對應 task note、既有 research 與上一輪 handoff
- `outputs/multi-instance-control-plane-spec.md`
- `outputs/instance-platform-spec.md`
- `outputs/moderation-and-ops-spec.md`
- `outputs/launch-readiness-checklist.md`

## Deliverables

- multi-instance control plane spec
- multi-instance isolation review gate
- execution plan update
- stage06 handoff

## Done When

- 目標、邊界、owner 與驗收條件都已鎖定
- registry、namespace、key scope、policy scope、queue partition、audit partition 都已固定
- 下一棒可以直接收斂 stage07 launch readiness
