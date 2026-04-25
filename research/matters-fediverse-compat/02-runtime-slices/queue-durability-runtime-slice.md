# Queue Durability Runtime Slice

## Scope

把 outbound delivery queue 從只有 `pending` / `delivered` / `dead-letter` 的最小持久化，往前補成有 processing lease、stale lease recovery、restart recovery 與 file-store atomic persist 的 durability baseline。

## Landed In This Slice

- outbound queue 新增 `processing` 狀態
  delivery worker 會先 claim queue item，再進入實際 delivery
- file store 與 SQLite store 都新增 delivery lease metadata
  queue item 會保留 `deliveryLease`、`processingStartedAt`
- 新增 stale lease recovery
  `/jobs/delivery` 進入處理前，會先把過期 processing item 回收成 `pending`
- file store 改成 temp file 寫入後 rename
  避免 crash 時把整份 state JSON 直接寫壞
- `delivery.processingLeaseTimeoutMs`
  可設定 processing item 在 crash / restart 後多久可被回收
- queue observability 現在會帶 `processing` 與 `oldestProcessingAt`
  structured metrics 也同步帶出 processing queue 狀態

## Runtime Behavior

- `pending -> processing -> delivered`
- `pending -> processing -> pending`
  temporary failure 會回到 pending，保留 attempts 與 last failure metadata
- `pending -> processing -> dead-letter`
  permanent failure 或 retry budget 耗盡時會進 dead letter
- `processing -> pending`
  若 process crash 或 restart，下一次 delivery job 會依 lease timeout 回收 stale item

## Verification

- `cd gateway-core && npm test`
  已新增 file store stale processing recovery
  已新增 SQLite stale processing recovery across reopen
  已新增 `/jobs/delivery` stale processing recovery before dispatch
- `cd gateway-core && npm run check:local-sandbox`
  signed `Follow` -> `Accept` delivery 仍正常

## Remaining Gaps

- 目前 lease recovery 是在 delivery job 入口收斂，尚未有獨立 operator recovery command
- queue durability 已有 baseline，但尚未補 external metrics sink 與 provider-specific alert routing
- followers / inbound object consistency scan 仍待補齊
