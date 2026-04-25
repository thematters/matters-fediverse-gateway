# Launch Readiness Checklist

## Stage01 Platform Baseline

- canonical domain 已固定
- NodeInfo / software identity owner 已固定
- lifecycle mode 可表達 `disabled`、`read_only`、`federating`、`maintenance`
- policy bundle 可表達 public-only boundary、domain block、rate limit、audit log
- instance config schema 可表達第二個 instance 而不需要改 schema

## Discovery

- WebFinger 可解析 `acct:<handle>@<instance-domain>`
- actor、profile、followers、sharedInbox、NodeInfo URL 一致

## Federation Core

- gateway 可完成 follow、accept、公開內容 delivery
- HTTP Signatures 驗章與簽發可觀測
- retry 與 dead letter 可運作

## Social Loop

- 外部 reply、like、announce 可進入 Matters 事件流
- Matters 的 update、delete 可正確對外傳播

## Moderation

- domain block、account suspend、abuse queue、takedown queue 都可操作
- non-public content boundary 有自動化或黑箱驗收

## Multi-Instance

- registry 能表達第二個 instance
- shared service 與 per-instance policy 已分離
- actor namespace、key scope、queue partition、audit partition 不互相污染
- 新增第二個 instance 不需要改 code path 或 schema

## Handoff

- `docs/handoff/current.md` 已更新
- task note 與 active run 狀態一致
- 下一輪工程 task 已列出 verify command
