# SQLite Recovery Runtime Slice

## Scope

把 SQLite persistence 從只有 backup 與 queue observability，往前補成有 restore、reconciliation、backfill、alerting 的最小可營運切片。

## Landed In This Slice

- 新增 `npm run restore:sqlite`
  可從既有 SQLite backup 還原 runtime，並在 target DB 寫入 `last_restored_at` 與 `restored_from_backup`
- 新增 `POST /admin/runtime/storage/reconcile`
  會掃描 outbound queue 與 dead letter 狀態，把缺漏的 dead letter record backfill 回來，並更新 `last_reconciled_at`
- `GET /admin/runtime/storage`
  現在除了 runtime metadata，也會回傳 storage alerts
- file store 與 SQLite store 都補上 `getStorageAlerts` / `reconcileStorage`
  讓 admin surface 不會綁死單一 driver
- alert baseline 目前涵蓋
  missing backup
  stale backup
  pending queue age
  pending queue volume
  open dead letter

## Runtime Surfaces

- `GET /admin/runtime/storage`
  回傳 runtime metadata 與 alerts
- `POST /admin/runtime/storage/reconcile`
  body 可帶 `dryRun` 與 `requestedBy`
- `POST /admin/runtime/storage/backup`
  保留既有 backup 建立路徑
- `scripts/restore-sqlite.mjs`
  離線 restore 工具

## Verification

- `cd gateway-core && npm test`
  已覆蓋 SQLite dead letter backfill、storage alerts、admin reconcile endpoint、restore script
- `cd gateway-core && npm run check:local-sandbox`
  仍可完成 canonical discoverability 與 signed `Follow` -> `Accept`

## Remaining Gaps

- 外部 metrics sink 與 alert sink 仍未接上
- staging drill 仍待實際執行
- reconciliation 目前先聚焦 outbound queue / dead letter，還沒擴到 followers、inbound objects、engagements 的 consistency scan
