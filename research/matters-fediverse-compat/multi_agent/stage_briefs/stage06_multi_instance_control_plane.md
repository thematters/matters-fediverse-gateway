# Stage 06 Multi-Instance Control Plane

## Objective

在官方單一 instance 的前提下，先把未來多 instance 的 registry、namespace 與 policy scope 隔離固定下來。

## Inputs

- `outputs/multi-instance-control-plane-spec.md`
- `outputs/instance-platform-spec.md`
- `outputs/federation-gateway-spec.md`

## Outputs

- multi-instance isolation review gate
- execution plan update
- control plane handoff

## Completion Gate

- reviewer 可說明兩個 instance 共用 gateway 時如何避免 state 污染
- planner 可把後續多 instance 任務拆分為獨立工程包
