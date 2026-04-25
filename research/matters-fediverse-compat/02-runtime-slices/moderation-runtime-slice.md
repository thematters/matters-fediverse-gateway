# Moderation Runtime Slice

## Goal

把 `Stage 05` 從純規格推進到第一個可執行 runtime，先落 `domain block`、`abuse queue`、`audit log` 三條基線，讓 gateway 對外互通時已有基本防線。

## What Landed

- inbound activity 進站前會先檢查 remote actor domain
- 被 block 的 domain 會收到 `403`
- 被 block 的入站活動會自動寫入 abuse queue
- 相關 decision 會寫入 audit log 與 trace
- outbound delivery 也會套用 domain block，blocked recipient 會轉成 dead letter
- actor suspend 會阻止本地 actor 處理 inbound inbox 與 outbound update
- legal takedown 可建立 case、觸發 delete propagation，並阻止後續 update
- instance-level / actor-level rate limit 會在 inbound 與 outbound surface 直接回 `429`
- evidence retention 會把 blocked inbound、rate limit、legal takedown、dead letter 留成獨立 evidence record
- dead letter 現在可由 admin surface 查詢並人工 replay
- remote actor policy 現在可對單一遠端 actor 做 inbound deny / review 與 outbound deny
- 新增最小 dashboard summary
- 新增最小 admin endpoint  
  `GET /admin/domain-blocks`  
  `POST /admin/domain-blocks`  
  `GET /admin/actor-suspensions`  
  `POST /admin/actor-suspensions`  
  `GET /admin/remote-actor-policies`  
  `POST /admin/remote-actor-policies`  
  `GET /admin/abuse-queue`  
  `POST /admin/abuse-queue/resolve`  
  `GET /admin/rate-limits`  
  `POST /admin/rate-limits`  
  `GET /admin/rate-limit-state`  
  `GET /admin/legal-takedowns`  
  `POST /admin/legal-takedowns`  
  `POST /admin/legal-takedowns/resolve`  
  `GET /admin/audit-log`  
  `GET /admin/evidence`  
  `GET /admin/dead-letters`  
  `POST /admin/dead-letters/replay`  
  `GET /admin/dashboard`

## Runtime Scope

- instance-level domain block
- actor suspension
- remote actor policy
- legal takedown propagation
- instance-level / actor-level rate limit
- automatic abuse case creation
- audit event persistence
- evidence retention persistence
- manual replay control
- outbound delivery block enforcement

## Not Yet Covered

- dashboard UI surface

## Verified

- `cd gateway-core && npm test`
  已覆蓋 blocked inbound、actor suspension、remote actor policy、legal takedown propagation、instance inbound rate limit、actor outbound rate limit、admin moderation endpoint、blocked outbound delivery、evidence retention、manual replay
- `cd gateway-core && npm run check:local-sandbox`
  moderation baseline 加入後，discoverability 與 follow loop 仍正常

## Next Step

補 review dashboard，並把 moderation 與 SQLite persistence 的 observability 串起來。
