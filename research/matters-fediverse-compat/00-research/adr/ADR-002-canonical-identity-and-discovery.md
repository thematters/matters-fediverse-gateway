# ADR-002 Canonical Identity And Discovery

## Context

研究已確認 actor URL、WebFinger subject、aliases 若不先固定，後續 gateway 與 follower state 會漂移。既有 `webfDomain` 導向的靜態 surface 不足以支撐官方 instance 與多 instance 規格。

## Decision

採用 `identity-discovery-spec.md` 的 instance-first 規則。

- canonical actor ID 固定為 `https://<instance-domain>/users/<handle>`
- WebFinger subject 固定為 `acct:<handle>@<instance-domain>`
- `webfDomain`、`matters.town/@user`、IPNS URL 只作 alias

## Consequences

- 對外正式 discoverability 改由 instance domain 承擔
- legacy static JSON-LD 只能保留為 transition artifact
- reviewer 可提前在 stage02 阻擋雙主身分問題
