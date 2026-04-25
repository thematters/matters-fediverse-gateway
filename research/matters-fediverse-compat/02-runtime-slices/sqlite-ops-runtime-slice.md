# SQLite Ops Runtime Slice

## Goal

把 `Stage 03` 和 SQLite persistence 的營運能力往前推一段，先補 backup baseline、migration metadata、queue observability，讓目前的 runtime 不只可跑，也可被營運端看懂與備份。

## What Landed

- SQLite store 現在會保留 `runtime_meta`
- 新增 runtime storage metadata query
- 新增 outbound queue observability query
- 新增 SQLite backup script  
  `npm run backup:sqlite`
- backup 會輸出 `.sqlite` 與對應 manifest JSON

## Runtime Shape

- `GET /admin/runtime/storage`
  回傳 store driver、schema version、journal mode、initializedAt、lastMigratedAt
- `GET /admin/queues/outbound`
  回傳 outbound queue summary、dead letter status、recent dead letters、recent delivery traces
- `scripts/backup-sqlite.mjs`
  以 `better-sqlite3` backup 建立一致性備份
  可指定 config、output dir、label

## Verified

- `cd gateway-core && npm test`
  已覆蓋 SQLite runtime metadata、runtime storage endpoint、queue snapshot、admin queue endpoint、backup script
- `cd gateway-core && npm run check:local-sandbox`
  SQLite ops slice 加入後，discoverability 與 signed `Follow` -> `Accept` 仍正常

## Next Step

補 structured metrics / alert routing、restore / replay drill runbook，並把 consistency scan 擴到 followers / inbound object。
