# Matters Gateway Status Summary

## Snapshot

- date  
  `2026-03-25`
- active task  
  `matters-gateway-core-minimum-slice`
- active branch  
  `codex/matters-gateway-stage03-alert-webhook`
- latest feature commits  
  `ca691ab`
  `49b4b3f`
  `63fc2d5`
  `6965223`
  `147ae5f`
  `ca39d9c`
  `dc193d4`
  `79e4c9f`
  `0a41d4c`
  `aa28064`
  `4401c10`
  `3ebed70`
  `37582d4`
  `f8ca2fd`
  `f5422ad`
  `44cfa8b`
  `dccd93d`
  `504c1f5`
  `20cf52f`
  `be21def`
  `a5164d5`
  `6176eab`

## Current Progress

- gateway core runtime 已具備 canonical discoverability、Follow loop、signature verification、followers state、retry、dead letter
- 已完成 static outbox bridge 與第一輪 `mastodon.social` 黑箱驗證
- 2026-05-01 補充：canonical `acct:matters@matters.town` 已透過 Cloudflare Worker routes 上線，並由 `g0v.social` 完成 exact discovery 與 inbound follow delivery；完整 production follow loop 仍需 Worker inbox 接上 `gateway-core`
- social loop 已有 inbound `Create` / `Reply` / `Like` / `Announce` / `Undo`
- outbound 已有 `Create`、`Like`、`Announce`、`Update`、`Delete`
- moderation / ops 已有 domain block、actor suspend、legal takedown、rate limit、evidence、manual replay、remote actor policy
- persistence / recovery 已有 SQLite baseline、backup、restore、reconcile、alerting、observability
- `Stage 03` 已補 webhook 型 external alert sink，`/admin/runtime/alerts/dispatch` 與 `npm run dispatch:alerts` 都可直接送 webhook
- `Stage 03` 已補 Slack incoming webhook alert routing，`/admin/runtime/alerts/dispatch` 與 `npm run dispatch:alerts` 都可直接送 provider-specific Slack payload
- `Stage 03` 已補 queue durability baseline，outbound queue 現在有 processing lease、stale recovery 與 restart recovery
- `Stage 03` 已補 external metrics sink，`/admin/runtime/metrics/dispatch` 與 `npm run dispatch:metrics` 都可直接送 webhook 或檔案 sink
- `Stage 03` 已補 structured logs，`/admin/runtime/logs/dispatch` 與 `npm run dispatch:logs` 都可直接送 webhook 或檔案 sink
- `Stage 03` 已補 observability staging drill runner，`npm run drill:observability` 可一次產出 alerts、metrics、logs bundle 與 report
- `Stage 03` 已補 deployment topology baseline artifact，repo 內已有 staging config 範本與 topology 基線圖
- `Stage 03` 已補 secret layout check 與 reverse proxy baseline，repo 內已有 `npm run check:secret-layout`、staging secrets layout 範本與 `Caddyfile.example`
- `Stage 03` 已補 rollout artifact baseline，repo 內已有 `matters-gateway-core.env.example`、`matters-gateway-core.service.example` 與 `npm run check:rollout-artifact`
- social layer 已有 thread reconstruction、local conversation projection、social reconcile `dryRun`
- remote acct mention 已能透過 WebFinger 型 `resolveAccount()` 轉成 canonical actor URL
- remote mention error policy 已落地，現在有 failure cache、retry boundary、evidence、trace 與 `/admin/remote-mentions`
- local content projection 已落地，`/admin/local-content` 可回傳內容摘要、notification summary、delivery summary、action matrix 與 partial thread 狀態
- notification projection 已落地，`/admin/local-notifications` 可回傳 `reply`、`mention`、`like`、`announce` feed，且已有 read state / grouping
- outbound-authored content projection 已落地，local root post / reply / update / delete 現在會進 `localContents`
- delivery summary 已收斂到 activity-level，`localContents.delivery` 現在可同時看整體 activity outcome 與 recipient breakdown
- content delivery drilldown 已落地，`/admin/local-content/delivery` 可往下查 activity / recipient 明細，並從 content context 直接 replay dead-letter recipient
- content delivery review queue 已落地，`/admin/review-queue` 與 `/admin/dashboard.contentDelivery` 可直接看 issue summary、replayable items 與 recent replay
- content delivery review queue 現在優先走 store-backed snapshot source，review queue / dashboard 不再只靠 runtime 全掃重建
- review queue / dashboard 已補 unique activity summary，可分辨 content-context 計數與 unique activity 去重計數
- content delivery activity index 已落地，`/admin/local-content/delivery/activities` 可做跨 content 的 unique activity 檢視
- review queue / dashboard 已補 recent replay list，可直接從 content delivery 入口追 replay 歷史
- content delivery activity replay 已落地，`/admin/local-content/delivery/activities/replay` 可直接以 unique activity 視角重送 dead-letter recipient
- review queue、activity index 與 activity replay 現在共用 actor-scoped persisted projection bundle，file store 與 SQLite store 都可從持久化資料重建相同語意
- review queue item ops read model 已補 `replayableItems`、`replayCount`、`lastReplayAt`、`staleSince`
- review queue / dashboard 已補最小 ops filter，包含 `actorHandle`、`status`、`replayedOnly`、`replayableOnly`
- `replayedOnly` 現在會依 activity recipient queue item 歷史命中，不會因 replay 後轉回 pending 就失去 replay 痕跡
- review queue response 已補 `filteredSummary`，filter 後的 item list 與 summary 視角已對齊
- review queue / dashboard 的 content delivery snapshot 已補 `appliedFilters`
- review queue / dashboard 的 content delivery snapshot 已補 `viewSummary` 與 `summaries.current`
- review queue / dashboard 的 content delivery snapshot 已補 `canonicalSummaryKey` 與 `summaryAliases`
- review queue / dashboard 的 content delivery snapshot 已補 `currentSummaryMode`
- review queue / dashboard 的 content delivery snapshot 已補 `contractVersion` 與 `legacySummaryKeys`
- dashboard 與 review queue 現在共用 content delivery summary normalization helper
- review queue / dashboard 的 content delivery snapshot 已補 `contract` 子物件
- review queue / dashboard 的 content delivery snapshot 已補 `contract.legacyFields`
- activity drilldown 保留 `actorHandle`、`status`、`activityId` filter
- activity index 也已補 `replayedOnly`、`replayableOnly` filter

## Verification Snapshot

- `cd gateway-core && npm test`
  `85` tests passing
- `cd gateway-core && npm run check:local-sandbox`
  `ok: true`

## Current Gaps

- `Stage 03` 仍缺真實 staging drill，以及其餘 provider-specific sink / exporter
- content delivery drilldown、activity index 與 activity replay 已收斂成 actor-scoped persisted projection bundle，summary contract 已有 canonical path、current mode、version 與 legacy 清單，但 legacy alias 仍待逐步退場
- review queue、activity index 與 activity replay 已共用 store-backed projection source，下一個可再補的是更完整的 ops read model 與 dashboard drilldown

## Immediate Next Step

- 先實跑 staging drill，把 alerts / metrics / logs 外部接線驗證一次
- 再決定是否補 Prometheus / OTLP / PagerDuty 類 exporter
