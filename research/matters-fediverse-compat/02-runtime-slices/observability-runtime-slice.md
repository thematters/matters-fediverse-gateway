# Observability Runtime Slice

## Scope

把 gateway 的營運訊號從單點查詢，往前補成可匯出、可篩選、可路由的 structured metrics / alerting baseline。

## Landed In This Slice

- 新增 `GET /admin/runtime/metrics`
  回傳 runtime、delivery、moderation、activity、gauges 的結構化 metrics
- 新增 `POST /admin/runtime/metrics/dispatch`
  可把 runtime metrics bundle preview、寫到指定檔案，或送到外部 webhook sink
- 新增 `POST /admin/runtime/logs/dispatch`
  可把 audit log + traces bundle preview、寫到指定檔案，或送到外部 webhook sink
- 新增 `GET /admin/runtime/alerts`
  可依 `minimumSeverity` 篩出目前 alerts，並一起帶出 runtime metrics
- 新增 `POST /admin/runtime/alerts/dispatch`
  可把 alerts + metrics bundle preview、寫到指定檔案，或送到外部 webhook sink 與 Slack incoming webhook
- 新增 `npm run dispatch:alerts`
  提供離線 alert bundle 產生腳本，讓 cron / automation 可直接接手，且可直接 dispatch 到 webhook sink 與 Slack incoming webhook
- 新增 `npm run drill:observability`
  提供最小 staging drill runner，可一次產出 alerts、metrics、logs bundle 與 report，並驗證既有 sink 接線
- file store 與 SQLite store 都補上 `getMetricsSnapshot`
  runtime 可在不依賴單一 driver 的前提下輸出結構化 metrics
- `runtime.alerting.dispatch`
  可預載 webhook URL、headers、bearer token、Slack webhook 參數與 timeout，讓排程 alert dispatch 不必每次帶完整參數
- `runtime.metrics.dispatch`
  可預載 metrics webhook URL、headers、bearer token 與 timeout，讓排程 metrics dispatch 不必每次帶完整參數
- `runtime.logs.dispatch`
  可預載 logs webhook URL、headers、bearer token、audit limit、trace limit 與 trace prefix

## Runtime Surfaces

- `GET /admin/runtime/metrics`
- `POST /admin/runtime/metrics/dispatch`
- `POST /admin/runtime/logs/dispatch`
- `GET /admin/runtime/alerts`
- `POST /admin/runtime/alerts/dispatch`
- `scripts/dispatch-runtime-metrics.mjs`
- `scripts/dispatch-runtime-logs.mjs`
- `scripts/dispatch-runtime-alerts.mjs`
- `scripts/run-staging-observability-drill.mjs`

## Signal Coverage

- runtime
  driver、schema version、last backup、last reconcile、last restore
- delivery
  outbound total、pending、processing、dead letter、retry pending、pending age
- moderation
  abuse queue、legal takedown、domain block、actor suspension、remote actor policy、evidence
- actor state
  followers、inbound objects、inbound engagements、remote actor cache
- gauges
  適合後續轉接到外部 metrics / dashboard

## Verification

- `cd gateway-core && npm test`
  已覆蓋 store metrics snapshot、admin runtime metrics endpoint、metrics dispatch route、logs dispatch route、admin Slack alert dispatch、alert dispatch script、metrics dispatch script、logs dispatch script、observability drill script
- `cd gateway-core && npm run check:local-sandbox`
  discoverability 與 signed `Follow` -> `Accept` 仍正常

## Remaining Gaps

- 外部 alert sink 已有 webhook baseline 與 Slack incoming webhook，PagerDuty 類 provider-specific sink 尚未接
- external metrics sink 已先有 webhook baseline，但還沒接 Prometheus / OTLP 類 exporter
- structured logs 也已先有 webhook baseline，但 provider-specific logging pipeline 尚未接
- 真實 staging sink 的 drill 實跑與 artifact retention 還沒完成
- moderation review dashboard 仍待更完整視覺化
