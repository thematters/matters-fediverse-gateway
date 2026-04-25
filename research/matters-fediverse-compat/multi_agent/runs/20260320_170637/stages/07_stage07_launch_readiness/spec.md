# Stage Spec

- Run ID: `20260320_170637`
- Stage ID: `stage07_launch_readiness`
- Title: Launch Readiness
- Objective: 整合 launch gate、測試矩陣、runbook 與下一輪工程 task，讓後續 agent 可直接進入實作
- Agents: planner, editor, reviewer, ops_reviewer
- Related paths:
  - `research/matters-fediverse-compat/outputs/next-steps.md`
  - `research/matters-fediverse-compat/outputs/engineering-task-seeds.md`
  - `research/matters-fediverse-compat/outputs/launch-readiness-checklist.md`
  - `research/matters-fediverse-compat/outputs/multi-instance-control-plane-spec.md`

## Decisions To Lock

- launch readiness 只涵蓋官方 instance 的 implementation track
- public-only boundary、moderation baseline、multi-instance isolation baseline 都是 blocking gate
- 下一輪工作以工程 task seeds 為主，不再延伸新的研究型 stage
- go / no-go 判斷以黑箱驗收與可觀測性為準，不以文件完備度取代實作驗證

## Blocking Gates

- WebFinger、actor、NodeInfo、follow flow、social loop、boundary、moderation 都有測試入口
- non-public content boundary 不可只靠口頭規則，必須有可重跑驗收
- 第二個測試 instance 的 registry / partition 驗證必須存在
- runbook 必須能描述 dead letter、manual replay、incident trace 與 rollback 基線

## Acceptance

- implementer 與 reviewer 可直接對齊
- 下一輪工作可直接從 task seeds 開始，不需要再重開 delivery workflow 討論
