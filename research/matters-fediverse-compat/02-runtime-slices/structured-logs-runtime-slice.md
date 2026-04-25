# Structured Logs Runtime Slice

## Scope

把 gateway 的 audit log 與 trace 從只有內部查詢 surface，往前補成可組成穩定 bundle、可離線 dispatch、可直接送 webhook 的 structured logs baseline。

## Landed In This Slice

- 新增 `POST /admin/runtime/logs/dispatch`
  可把 audit log + traces bundle preview、寫到指定檔案，或送到外部 webhook sink
- 新增 `npm run dispatch:logs`
  提供離線 structured logs bundle 產生腳本，讓 cron / automation 可直接接手
- 新增 `runtime.logs.dispatch`
  可預載 webhook URL、headers、bearer token、audit limit、trace limit 與 trace prefix
- logs dispatch 與 metrics / alerts dispatch 現在共用同一組 file / webhook dispatch helper
- structured logs bundle 現在有穩定 envelope
  `generatedAt`
  `appliedFilters`
  `audit`
  `traces`

## Runtime Surfaces

- `GET /admin/audit-log`
- `POST /admin/runtime/logs/dispatch`
- `scripts/dispatch-runtime-logs.mjs`

## Verification

- `cd gateway-core && npm test`
  已新增 admin runtime logs dispatch file + webhook 驗證
  已新增 logs dispatch script config-driven webhook 驗證
- `cd gateway-core && npm run check:local-sandbox`
  discoverability 與 signed `Follow` -> `Accept` 仍正常

## Remaining Gaps

- 目前 structured logs 先落 webhook baseline，尚未接 provider-specific logging pipeline
- staging drill 仍未把 logs / metrics / alerts 外部接線一起實跑
- provider-specific alert routing 仍待補齊
