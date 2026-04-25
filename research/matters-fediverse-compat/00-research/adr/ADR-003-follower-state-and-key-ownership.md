# ADR-003 Follower State And Key Ownership

## Context

followers collection 與 publicKey 若沒有單一 owner，遠端 follow flow 與簽章驗證會不穩定。

## Decision

followers state 與 key lifecycle 由 federation gateway 或其等價 signer service 擁有。

## Consequences

- `ipns-site-generator` 不再假裝自己可獨立承擔 fully federated actor
- gateway 需要提供 follower collection、key material、rotation policy 與 audit path
- implementer 的最小切片要先覆蓋 follow flow 與簽章驗證
