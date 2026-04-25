# Multi-Instance Control Plane Spec

## Goal

在不先開放第三方自助架設的前提下，先把未來多 instance 所需的控制面切清楚，避免官方 instance 的單站假設被寫死。

## Required Capabilities

- instance registry
- per-instance config
- actor namespace isolation
- key scope isolation
- policy scope isolation
- shared service 與 instance-specific policy 的責任切分

## Registry Draft

```yaml
instances:
  - instance_id: matters-official
    canonical_domain: social.matters.town
    federation_enabled: true
    actor_namespace_prefix: matters-official
    key_scope: matters-official
    policy_bundle_id: matters-official-default
    queue_partition: matters-official
    audit_partition: matters-official
```

## Isolation Rules

- actor namespace
  `acct:<handle>@<instance-domain>` 只在該 instance domain 內唯一，不可跨 instance 重用同一 actor ID
- key scope
  actor signing key、sharedInbox signing key、rotation log 都要能按 instance 分區
- policy scope
  domain block、allowlist、rate limit、moderation mode、federation enable switch 都要是 per-instance
- queue scope
  inbound queue、outbound queue、retry、dead letter 至少要能依 instance partition 查詢與回放
- audit scope
  request trace、moderation action、legal action、manual replay 都要帶 instance_id

## Shared Service Boundary

- 可共享
  gateway runtime、worker binary、database cluster、metrics pipeline、object storage
- 不可共享為單一全域狀態
  actor namespace、signing key、followers state、policy bundle、rate limit counter、audit log partition
- 可共享但必須帶分區鍵
  queue、dead letter、delivery log、NodeInfo template、runbook template

## Control Plane Responsibilities

- 註冊新 instance
- 下發 per-instance config 與 policy bundle
- 控管 federation enable switch
- 提供 instance-level secret / key scope 對應
- 對外輸出 launch readiness 與 go / no-go 資訊

## Blocking Gates

- reviewer 能證明第二個 instance 不會污染第一個 instance 的 actor namespace
- ops reviewer 能證明 queue、rate limit、audit log 有分區鍵
- implementer 不需要改 schema 就能新增第二個 instance
- control plane 與 gateway 的 policy owner 不會互相覆寫
- 任何 shared service 故障都不能造成跨 instance 的誤封鎖或誤投遞

## Decisions

- 第一階段只有官方 instance，但 config schema 不能把 domain、policy、key、queue scope 寫死
- gateway 可共享執行層，但 state 與 policy 必須以 instance 為隔離單位
- followers state、audit log、block policy、rate limit 至少要能按 instance 分區
- instance registry 是 canonical source，其他服務不得自行生成新的 instance id
- NodeInfo 與 software identity 可共用模板，但每個 instance 的 capability 宣告仍以自己的 config 為準
- multi-instance 預留不等於立刻開放第三方架站，這一階段只處理隔離與控制面

## Acceptance

- reviewer 可檢查兩個 instance 共用 gateway 時不互相污染
- architect 可依這份 spec 定義 namespace、key owner 與 shared resource 邊界
- planner 可把多 instance 延伸工作拆成獨立 stage 與 task
