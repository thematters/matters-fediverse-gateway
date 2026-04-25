# Matters Gateway Production Deployment Gaps

## Current Readiness Snapshot

- 已完成 canonical discoverability、Follow loop、remote actor discovery、static outbox bridge、local sandbox 驗證，以及第一輪 `mastodon.social` 黑箱驗證
- 已完成 inbound public `Create` / `Reply` / `Like` / `Announce` 的最小持久化
- 已完成 SQLite persistence baseline，可切換 file store / SQLite store
- 目前可視為 engineering prototype，可用來持續擴張 social loop

## Still Missing Before Production

- 協定完整度  
  reaction、boost、reply 的最小 fan-out 已有 baseline  
  thread reconstruction、local mention 映射、admin thread query 已有 baseline  
  local conversation projection、social reconcile、mention backfill 已有 baseline  
  remote mention resolution 與最小 action matrix 已有 baseline  
  Matters content model mapping、remote mention error policy、更細的 action matrix 仍未定稿
- 持久化與資料模型  
  SQLite baseline 已落地，backup、restore、migration metadata、reconciliation、backfill、queue observability、alerting、structured metrics、alert routing baseline 也已補上  
  outbound queue durability 已有 processing lease 與 stale recovery baseline  
  replay drill runbook 已有 baseline，但還沒做實際 staging drill  
  followers / inbound object consistency scan 還沒做  
  followers、inbound objects、engagements、delivery queue 仍需 production DB 級的營運工具與觀測能力
- Moderation 與 abuse handling  
  domain block、abuse queue、audit log、account suspend、legal takedown、admin review surface、rate limit 已有 baseline  
  evidence retention 已有 baseline  
  actor-level policy 已有 baseline  
  review dashboard 與更細的 action matrix 還沒落地
- Multi-instance runtime  
  instance registry、per-instance config、namespace isolation 仍停在 spec  
  shared service 與 instance-specific policy 的 runtime 邊界尚未實作
- Deployment 與 SRE  
  正式 public domain、TLS、reverse proxy、secret management、persistent storage、backup、restore 還沒固化  
  webhook 型外部 alert sink、Slack incoming webhook alert routing、external metrics sink、structured logs、observability drill runner、deployment topology baseline artifact、secret layout check、reverse proxy baseline、rollout artifact baseline 已有 baseline，但真實 staging drill、dashboard、delivery observability 與其餘 provider-specific sink / exporter 仍需補齊  
  rate limit、queue monitoring、dead-letter replay tooling 尚未完成
- Security 與內容邊界  
  key rotation、secret rotation、key custody、request throttling 仍需 hardening  
  `paid`、`private`、`encrypted` 內容的 boundary 目前只有原則，還沒做系統化 enforcement
- Launch readiness  
  production staging drill、rollback plan、incident runbook、operator checklist 還沒完成  
  對外 instance policy、moderation policy、support path 還沒定版

## Recommended Next Order

1. 實跑 `Stage 03` 的 staging drill
2. 把 consistency scan 擴到 followers / inbound object
3. 決定是否要補 Prometheus / OTLP / PagerDuty 類 exporter
4. 落 `Stage 06` 的 instance registry 與 namespace isolation
