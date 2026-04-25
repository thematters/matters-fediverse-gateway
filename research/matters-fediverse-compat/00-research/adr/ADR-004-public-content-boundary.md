# ADR-004 Public Content Boundary

## Context

研究已確認 paid、private、encrypted 內容不適合在缺乏 ACL 與授權模型時直接 federation。

## Decision

第一階段只允許 public 內容 federation。

## Consequences

- 非公開內容不得進入 outbox
- reviewer 與 ops reviewer 必須把 boundary 當 launch gate
- 後續若要加入 preview 或授權互通，需另開 ADR
