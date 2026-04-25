# Stage Spec

- Run ID: `20260320_170637`
- Stage ID: `stage06_multi_instance_control_plane`
- Title: Multi-Instance Control Plane
- Objective: 定義 instance registry、per-instance config、namespace isolation、policy scope 與 shared service 邊界
- Agents: planner, architect, ops_reviewer, reviewer
- Related paths:
  - `research/matters-fediverse-compat/outputs/multi-instance-control-plane-spec.md`
  - `research/matters-fediverse-compat/outputs/instance-platform-spec.md`
  - `research/matters-fediverse-compat/outputs/moderation-and-ops-spec.md`
  - `research/matters-fediverse-compat/outputs/launch-readiness-checklist.md`

## Decisions To Lock

- registry 是 canonical source
- actor namespace、key scope、policy scope、queue partition、audit partition 都是 per-instance
- shared service 可以共用執行層，但不可共用邏輯狀態
- 不為了多 instance 預留而打破官方 instance 的現有 canonical identity

## Shared Service Boundary

- 可共享
  runtime、worker binary、database cluster、metrics pipeline
- 必須分區
  actor namespace、signing key、followers state、rate limit、dead letter、audit log

## Failure Model

- registry source 遺失或不一致時，不得新增或啟用新 instance
- queue partition 缺失時，不得啟用第二個 instance
- policy bundle 無法按 instance 分開時，不得宣稱 multi-instance ready
- 任何跨 instance 的誤投遞或誤封鎖都視為 blocking defect

## Acceptance

- implementer 與 reviewer 可直接對齊
- reviewer 可用第二個 instance 測試隔離規則
- ops reviewer 可用 queue、audit log、rate limit partition 做 gate
