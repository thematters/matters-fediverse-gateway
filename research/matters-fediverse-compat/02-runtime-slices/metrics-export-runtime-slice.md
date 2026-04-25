# Metrics Export Runtime Slice

## Scope

把 gateway 的 structured metrics 從只有 admin query，往前補成可預設 sink、可離線 dispatch、可直接送 webhook 的 external metrics baseline。

## Landed In This Slice

- 新增 `POST /admin/runtime/metrics/dispatch`
  可把 runtime metrics bundle preview、寫到指定檔案，或送到外部 webhook sink
- 新增 `npm run dispatch:metrics`
  提供離線 metrics bundle 產生腳本，讓 cron / automation 可直接接手
- 新增 `runtime.metrics.dispatch`
  可預載 webhook URL、headers、bearer token 與 timeout
- metrics dispatch 與 alert dispatch 現在共用同一組 file / webhook dispatch helper
- queue durability slice 補進來的 `processing`、`oldestProcessingAt`
  也已同步進 metrics bundle

## Runtime Surfaces

- `GET /admin/runtime/metrics`
- `POST /admin/runtime/metrics/dispatch`
- `scripts/dispatch-runtime-metrics.mjs`

## Verification

- `cd gateway-core && npm test`
  已新增 admin runtime metrics dispatch file + webhook 驗證
  已新增 metrics dispatch script config-driven webhook 驗證
- `cd gateway-core && npm run check:local-sandbox`
  discoverability 與 signed `Follow` -> `Accept` 仍正常

## Remaining Gaps

- 目前 external metrics sink 先落 webhook baseline，尚未接 Prometheus remote write、OTLP 或 provider-specific metrics pipeline
- structured logs 尚未收斂成外部 sink
- provider-specific alert routing 仍待補齊
