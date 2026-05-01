# Restore And Replay Drill Runbook

## Goal

提供一份最小可執行的演練流程，讓 operator 能定期驗證 SQLite backup、restore、dead-letter replay 真的可用。

## Preconditions

- 停用或隔離目前要演練的 gateway runtime
- 確認現有 SQLite 檔與 backup 目錄可存取
- 保留一個 staging 或 drill 用的 target 路徑，避免直接覆蓋 production runtime

## Drill Steps

1. 建立當前快照
   - `cd gateway-core`
   - `npm run backup:sqlite -- --label pre-drill`
2. 確認 backup manifest
   - 檢查 `schemaVersion`
   - 檢查 `sourceFile`、`backupFile`
   - 記錄 `createdAt`
3. 還原到 drill target
   - `npm run restore:sqlite -- --input-file <backup.sqlite> --target-file <drill.sqlite>`
4. 驗證 restore metadata
   - 檢查 `last_restored_at`
   - 檢查 `restored_from_backup`
5. 先跑 consistency scan
   - `npm run scan:consistency`
   - 檢查 JSON 與 markdown 報表中的 followers、inbound objects、engagements 差異
   - 預設只做 dry-run；只有確認來源與目標後才使用 `-- --repair --repair-target <file|sqlite>`
6. 跑 reconciliation
   - 對 drill runtime 執行 `POST /admin/runtime/storage/reconcile`
   - 確認 `backfilledDeadLetters`、`orphanedDeadLetters`
7. 檢查 runtime signals
   - `GET /admin/runtime/storage`
   - `GET /admin/runtime/metrics`
   - `GET /admin/runtime/alerts?minimumSeverity=warn`
8. 驗證 dead-letter replay
   - 找一筆 open dead letter
   - 執行 `POST /admin/dead-letters/replay`
   - 確認 audit、trace、evidence 都有新紀錄
9. 收尾
   - 保存本次 drill bundle 與操作紀錄
   - 清理 drill target
   - 更新 drill 結果與待修事項

## Success Criteria

- restore 可成功產出可讀 SQLite runtime
- `last_restored_at` 與 `restored_from_backup` 正確寫入
- consistency scan 可輸出 JSON 與 markdown 報表，且 operator 已判讀差異是否需要 repair
- reconciliation 可成功完成，且沒有意外新增 orphaned records
- 至少一筆 dead-letter replay 可成功走完
- alerts / metrics 可正常輸出

## Failure Handling

- 如果 restore 失敗，停止 drill，保留 source backup 與錯誤輸出
- 如果 reconciliation 出現異常 orphaned records，先封存 bundle，再回頭分析資料一致性
- 如果 replay 失敗，確認是不是 policy 阻擋、target domain block 或 remote delivery 失敗，不要直接重覆 replay

## Follow-up

- 每次 drill 後補一份簡短紀錄
  演練時間
  使用的 backup
  restore target
  reconciliation summary
  replay 結果
  是否有新缺口

## Observability Drill Extension

在 restore / replay drill 之外，`Stage 03` 現在也有 observability drill runner，可把 alerts、metrics、logs 的外部接線一併驗證。

1. 產出 observability drill artifact
   - `cd gateway-core`
   - `npm run drill:observability`
2. 檢查 output dir
   - 確認 `alerts.json`、`metrics.json`、`logs.json`、`report.json` 都存在
   - 確認 `report.json` 內各 channel 沒有 `errors`
3. 驗證外部 sink
   - alerts 至少命中 generic webhook 或 Slack incoming webhook
   - metrics 命中外部 metrics webhook
   - logs 命中外部 logs webhook
4. 封存 artifact
   - 把 output dir 路徑與 sink response status 記到 drill 紀錄
