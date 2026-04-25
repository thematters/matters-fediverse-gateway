# Production Persistence Slice

## Goal

把 `gateway-core` 的 state 層從只靠 file-based JSON，提升成可切換的 runtime persistence driver，先提供 SQLite baseline，讓後續的 moderation、multi-instance、delivery observability 有穩定底座。

## What Landed

- 新增 `SqliteStateStore`
- 新增 `createStateStore` factory
- `server.mjs` 改為依 `runtime.storeDriver` 建立 store
- `dev.instance.json` 預設切到 `sqlite`
- 保留 `FileStateStore`，方便本地比對與回退

## Runtime Contract

- `runtime.storeDriver`
  `file` 或 `sqlite`
- `runtime.stateFile`
  file store 路徑
- `runtime.sqliteFile`
  SQLite DB 路徑

## Coverage

- remote actors
- processed activities
- followers
- inbound objects
- inbound engagements
- outbound queue
- dead letters
- traces

## Verified

- `cd gateway-core && npm test`
  已新增 SQLite reopen persistence 測試
- `cd gateway-core && npm run check:local-sandbox`
  目前 dev config 走 SQLite driver，sandbox 仍可完成 discoverability 與 follow loop

## Next Step

補 backup / restore、migration、replay、queue observability，讓 SQLite baseline 從開發型 persistence 走向可營運 persistence。
