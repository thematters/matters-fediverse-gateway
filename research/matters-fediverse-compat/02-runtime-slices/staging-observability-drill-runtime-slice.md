# Staging Observability Drill Runtime Slice

## Scope

補一個可執行的 `Stage 03` observability drill runner，讓 operator 能一次驗證 alerts、metrics、logs 的 bundle 產出與外部 sink 接線。

## Landed In This Slice

- 新增 `scripts/run-staging-observability-drill.mjs`
  會依既有 config 產出 `alerts.json`、`metrics.json`、`logs.json`
- 新增 `npm run drill:observability`
  預設以 `--require-sinks` 模式執行，確保 staging drill 不會默默跳過外部 sink
- drill runner 會輸出 `report.json`
  回報每個 channel 的 `status`、`sinkTypes`、`sinkResults`、`errors`
- alert channel 會沿用 generic webhook 與 Slack incoming webhook
- metrics 與 logs channel 會沿用既有 webhook dispatch baseline

## Verification

- `cd gateway-core && npm test`
  已覆蓋 observability drill script 對 alerts、metrics、logs 的 bundle 與 sink dispatch
- `cd gateway-core && npm run check:local-sandbox`
  local sandbox 互通驗證仍正常

## Remaining Gaps

- drill runner 已落地，但還沒對真實 staging sink 做一次正式 drill
- deployment topology、secret management、artifact retention 還沒固化
