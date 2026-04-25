# ADR-005 Instance Governance Surface

## Context

instance 一旦開放 inbox 與外部互動，就會立刻暴露 moderation、abuse、legal 與 operations 風險。

## Decision

instance governance surface 包含 federation policy、domain block、account suspend、rate limit、audit log、legal takedown。

## Consequences

- governance 不是 launch 後再補的附屬功能
- ops reviewer 從 gateway core 起就必須參與
- 多 instance 時這些 policy 必須是 per-instance scope
