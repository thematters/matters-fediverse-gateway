# Stage Handoff

- Run ID: `20260320_170637`
- Stage ID: `stage06_multi_instance_control_plane`
- Title: Multi-Instance Control Plane
- Objective: 定義 instance registry、per-instance config、namespace isolation、policy scope 與 shared service 邊界
- Agents: planner, architect, ops_reviewer, reviewer
- branch: `task/matters-instance-interoperability-delivery--codex-local`
- outputs_scope: `git`

## Summary

- 已把 multi-instance 從抽象原則收斂成 registry、namespace、key scope、policy scope、queue partition、audit partition 的具體規則
- 已固定 shared service 可共享什麼，哪些狀態絕對不能全域共用
- 已把第二個 instance 的準備定義成 schema 與 control plane readiness，不等於立刻開放第三方自助架站
- 對應輸出已更新在 `outputs/multi-instance-control-plane-spec.md` 與 stage06 spec/review 文件

## Next Owner

- 建議下一棒角色是 `planner`、`editor`、`reviewer`、`ops_reviewer`
- 建議優先處理 `stage07_launch_readiness`
- verify command
  `python3 research/matters-fediverse-compat/multi_agent/scripts/delivery_flow.py current-stage`
