# Matters Instance Interoperability Progress

## Current Status

- branch  
  `codex/matters-gateway-stage03-alert-webhook`
- current engineering focus  
  `gateway-core`
- current next step  
  `Stage 03` production gap 已補 webhook alert sink、Slack incoming webhook alert routing、queue durability baseline、external metrics sink、structured logs、observability staging drill runner、deployment topology baseline artifact、secret layout check、reverse proxy baseline，以及 rollout artifact baseline；本機 staging-style generic webhook drill 已通，下一步是建立 Cloudflare Tunnel / DNS / Access 後用 public hostnames 重跑

## Stage Progress

- `Stage 01 Instance Platform`  
  完成  
  instance domain、brand metadata、policy surface、NodeInfo 規格已定義
- `Stage 02 Identity And Discovery`  
  完成  
  canonical actor URL、WebFinger subject、alias policy、key ownership 規則已定義
- `Stage 03 Gateway Core`  
  進行中  
  已完成 runtime scaffold、WebFinger、actor、followers、NodeInfo、Follow accept/reject、HTTP signature verification、followers state、retry / dead letter、remote actor discovery、key refresh、static outbox bridge、SQLite persistence baseline，以及第一輪真實 Mastodon 黑箱驗證  
  SQLite backup、restore、reconciliation、backfill、queue observability、alerting、structured metrics、alert routing 已有最小切片  
  external alert sink 已先補 webhook dispatch baseline，admin runtime alerts 與離線 dispatch script 都可直接送出 alerts + metrics bundle  
  Slack incoming webhook alert routing 已補 provider-specific baseline，admin runtime alerts 與離線 dispatch script 都可直接送出 Slack payload  
  outbound queue durability 已補 processing lease、stale lease recovery、restart recovery 與 file-store atomic persist baseline  
  external metrics sink 已補 webhook dispatch baseline，admin runtime metrics 與離線 metrics script 都可直接送出 metrics bundle  
  structured logs 已補 webhook dispatch baseline，admin runtime logs 與離線 logs script 都可直接送出 audit / trace bundle  
  observability staging drill runner 已補 baseline，可一次輸出 alerts、metrics、logs bundle 與 report，並驗證各自 sink dispatch  
  deployment topology baseline artifact 已補 staging config 範本與 topology 基線圖  
  secret layout check 與 reverse proxy baseline 已補 `check:secret-layout`、staging secrets layout 範本與 `Caddyfile.example`  
  rollout artifact baseline 已補 systemd unit、rollout env example 與 `check:rollout-artifact`  
  restore / replay drill runbook 已補齊  
  本機 staging-style generic webhook drill 已通；待完成 Cloudflare Tunnel / DNS / Access 後的 public staging drill，以及其餘 provider-specific routing / exporter
- `Stage 04 Social Interop`  
  進行中  
  inbound public `Create` / `Reply` 已可驗章並持久化  
  inbound `Like` / `Announce` 已可驗章並落 engagement state  
  inbound `Undo` 與 outbound `Update` / `Delete` 已有最小切片  
  outbound reply / reaction fan-out、mention mapping 已有最小切片  
  thread reconstruction、local mention mapping、admin thread query 已有最小切片  
  local conversation projection、mention backfill、orphan reply reconciliation、social reconcile `dryRun` 已有最小切片  
  remote mention resolution、error policy、failure cache / retry boundary、admin mention query 已有切片  
  local content projection、conversation action matrix、delivery-aware action matrix、admin local content query 已有切片  
  notification model projection、admin local notification query、read state、grouping 已有切片  
  outbound-authored content projection 已有切片  
  delivery activity-level collapse 已有切片
  content delivery drilldown 與 content-context replay 已有切片
  content delivery review queue 與 richer dashboard summary 已有切片
  review queue / dashboard 的 unique activity summary 已有切片
  review queue / dashboard 已有 store-backed snapshot source
  review queue / dashboard / activity index / activity replay 已收斂成 actor-scoped persisted projection bundle
  content delivery activity index 已有切片
  content delivery activity replay 已有切片
  review queue item ops 已補 replayableItems、replayCount、lastReplayAt、staleSince
  review queue / dashboard 已補最小 ops filter，包含 actorHandle、status、replayedOnly、replayableOnly
  activity drilldown 已補 actorHandle、status、activityId filter
  activity index 已補 replayedOnly、replayableOnly filter
  replayedOnly 已改為依 activity recipient queue item 歷史判斷，不會因 replay 後轉成 pending 就失去命中
  review queue response 已補 `filteredSummary`，filter 後的 item list 與摘要視角已對齊
  review queue / dashboard 的 content delivery snapshot 已補 `appliedFilters`
  review queue / dashboard 的 content delivery snapshot 已補 `viewSummary` 與 `summaries.current`
  review queue / dashboard 的 content delivery snapshot 已補 `canonicalSummaryKey` 與 `summaryAliases`
  review queue / dashboard 的 content delivery snapshot 已補 `currentSummaryMode`
  review queue / dashboard 的 content delivery snapshot 已補 `contractVersion` 與 `legacySummaryKeys`
  review queue / dashboard 現在共用 content delivery summary contract normalization helper
  review queue / dashboard 的 content delivery snapshot 已補 `contract` 子物件
  review queue / dashboard 的 content delivery snapshot 已補 `contract.legacyFields`
- `Stage 05 Moderation And Ops`  
  進行中  
  domain block、abuse queue、audit log 已有最小 runtime  
  account suspend、legal takedown、admin dashboard 已有最小 runtime  
  instance-level / actor-level rate limit 已有最小 runtime  
  evidence retention 已有最小 runtime  
  manual replay control 已有最小 runtime  
  richer actor-level policy 已有最小 runtime
- `Stage 06 Multi-Instance Control Plane`  
  規格完成  
  runtime 還沒落 instance registry、per-instance config、namespace isolation
- `Stage 07 Launch Readiness`  
  規格完成  
  真實互通驗收、營運演練與 launch checklist 還沒跑

## Engineering Milestones

- `M1` 研究 baseline 與 multi-agent workflow  
  完成
- `M2` gateway core minimum slice 第一版  
  完成
- `M3` remote actor discovery 與 key refresh boundary  
  完成
- `M4` static outbox bridge  
  完成
- `M5a` local sandbox interop harness  
  完成
- `M5` Mastodon sandbox interop  
  第一輪黑箱驗證已完成
- `M6` inbound `Create` / `Reply` persistence  
  完成
- `M6b` inbound `Like` / `Announce` persistence  
  完成
- `M6c` inbound `Undo` 與 outbound `Update` / `Delete`  
  完成
- `M6d` outbound reply / reaction fan-out 與 mention mapping  
  完成
- `M6e` thread reconstruction 與 richer local mention mapping  
  完成
- `M6f` local conversation projection 與 social reconcile baseline  
  完成
- `M6g` remote mention resolution 與 engagement action matrix baseline  
  完成
- `M6h` local content projection 與 content model baseline  
  完成
- `M6i` remote mention error policy、failure cache 與 admin query  
  完成
- `M6j` notification model projection 與 delivery-aware content action matrix  
  完成
- `M6k` notification read state 與 grouped feed  
  完成
- `M6l` outbound-authored content projection  
  完成
- `M6m` delivery activity-level collapse  
  完成
- `M6n` content delivery drilldown 與 content-context replay  
  完成
- `M6o` content delivery review queue 與 richer dashboard summary  
  完成
- `M7` SQLite persistence baseline  
  完成
- `M7b` SQLite ops baseline  
  完成
- `M8` moderation baseline runtime  
  完成
- `M8b` actor suspend、legal takedown、admin dashboard baseline  
  完成
- `M8c` rate limit baseline runtime  
  完成
- `M8d` evidence retention runtime  
  完成
- `M8e` manual replay control runtime  
  完成
- `M8f` remote actor policy runtime  
  完成
- `M7c` SQLite recovery / alerting runtime  
  完成
- `M7d` observability runtime baseline  
  完成
- `M7e` external alert webhook sink  
  完成
- `M7f` outbound queue durability baseline  
  完成
- `M7g` external metrics sink baseline  
  完成
- `M7h` structured logs baseline  
  完成
- `M7i` Slack incoming webhook alert routing  
  完成
- `M7j` observability staging drill runner  
  完成
- `M7k` deployment topology baseline artifact  
  完成
- `M7l` secret layout and reverse proxy baselines  
  完成
- `M7m` rollout artifact baseline  
  完成
- `M6` full social loop  
  進行中

## Verification Snapshot

- `cd gateway-core && npm test`  
  107 tests passing
  local conversation projection 與 social reconcile `dryRun` 已覆蓋
  remote acct mention resolution 已覆蓋
  remote mention retryable / permanent failure policy、failure cache、admin mention query 已覆蓋
  notification projection、read state、grouped feed、delivery-aware content action matrix、activity-level delivery collapse、content delivery drilldown、review queue / dashboard summary、unique activity summary、activity-level replay 與 local notification query 已覆蓋
  Misskey / GoToSocial sandbox probes 已有本地 fake-server 驗證，外部 run 等待 public instance token 與 staging gateway URL
  local content projection、outbound-authored content projection、stable partial content key、richer action matrix、review queue store-backed snapshot、cross-content activity index 與 activity index persistence 已覆蓋
  review queue item ops read model 的 replayableItems、replayCount、lastReplayAt、staleSince 已覆蓋
  review queue / dashboard 的 replayedOnly、replayableOnly filter、review queue `filteredSummary`、`appliedFilters`、activity index replay filter 與 activity drilldown 的 activityId filter 已覆蓋
  runtime alert webhook dispatch、config-driven webhook sink、admin dispatch sink audit、CLI webhook dispatch、Slack provider payload shaping、CLI Slack dispatch、observability drill runner、drill report、secret layout checker script 已覆蓋
  2026-05-01 本機 staging-style observability drill 已用 ignored secret files、SQLite runtime state 與 generic webhook receiver 跑通；alerts / metrics / logs 三組 sink 皆回 202
  `cd gateway-core && npm run check:secret-layout` 已可驗證 dev config 內的 key file 參考
  `cd gateway-core && npm run check:rollout-artifact` 已可驗證 rollout env example
  outbound queue processing lease、stale lease recovery、restart recovery 與 delivery job pre-dispatch recovery 已覆蓋
  runtime metrics webhook dispatch、config-driven metrics sink、admin metrics dispatch audit 與 CLI metrics dispatch 已覆蓋
  runtime logs webhook dispatch、config-driven logs sink、admin logs dispatch audit 與 CLI logs dispatch 已覆蓋
- 本地 smoke test  
  `/.well-known/webfinger` 可正常回應 canonical actor
  `/users/alice/outbox` 可回應由靜態 `outbox.jsonld` 橋接而來的公開文章集合
- `cd gateway-core && npm run check:local-sandbox`  
  可完成 canonical discoverability、bridged outbox 與 signed `Follow` -> `Accept` 驗證
- `cd gateway-core && npm run check:mastodon-sandbox`  
  已在 `mastodon.social` 對公開 trycloudflare gateway 跑過第一輪黑箱驗證，結果 `ok: true`
- 2026-05-01 補充  
  canonical `acct:matters@matters.town` 已透過 Cloudflare Worker routes 上線，並由 `g0v.social` 完成 exact discovery 與 inbound follow delivery；`mastodon.social` exact discovery 仍保留為 instance-side cache / remote-resolution retest
- 正式部署缺口清單  
  見 `production-deployment-gaps.md`
