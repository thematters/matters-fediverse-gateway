# Stage Spec

- Run ID: `20260320_170637`
- Stage ID: `stage02_identity_and_discovery`
- Title: Identity And Discovery
- Owner: writer
- Related paths
  - `outputs/identity-discovery-spec.md`
  - `outputs/identity-foundation-spec.md`
  - `docs/adr/ADR-002-canonical-identity-and-discovery.md`
  - `docs/adr/ADR-003-follower-state-and-key-ownership.md`

## Decisions

- actor canonical ID 固定為 `https://<instance-domain>/users/<handle>`
- profile page 固定為 `https://<instance-domain>/@<handle>`
- WebFinger subject 固定為 `acct:<handle>@<instance-domain>`
- `matters.town/@<handle>`、`webfDomain`、IPNS URL 全部只能當 alias
- followers 與 key ownership 固定由 gateway 承接

## State Owner

- canonical identity 與 discovery surface 由 gateway 對外提供
- profile page 可以由前台或靜態頁面呈現，但必須回指 canonical actor
- key material、followers collection、migration guard 屬於 gateway

## Failure Model

- 同時暴露兩個可 follow 的 primary actor 會造成 identity split
- followers collection 若沒有實際 owner，stage03 follow flow 會失真
- key material 若由靜態輸出層假裝存在，簽章驗證會在 stage03 失敗

## Acceptance

- reviewer 可驗證只有單一 primary actor
- implementer 可直接據此設計 gateway endpoint 與 key lifecycle
- stage03 不再需要重開 alias 與 canonical URL 討論
