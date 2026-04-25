# Rate Limit Runtime Slice

## Goal

把 `Stage 05` 的 rate limit 從規格落到 runtime，先提供 instance-level 與 actor-level 的最小可執行控制面，讓 gateway 對 inbound / outbound 有基本節流能力。

## What Landed

- 新增 rate limit policy persistence
- 新增 rate limit counter persistence
- inbound 會套用 `instance-inbound`
- inbound 會套用 `actor-inbound`
- outbound `Update` / `Delete` 會套用 `actor-outbound`
- hit limit 時會回 `429`
- inbound rate limit 命中時會留下 abuse case、audit event、trace
- rate limit 命中時也會留下 evidence record
- 新增 admin endpoint  
  `GET /admin/rate-limits`  
  `POST /admin/rate-limits`  
  `GET /admin/rate-limit-state`

## Runtime Shape

- `instance-inbound`
  控制整個 instance 的入站量
- `actor-inbound`
  控制單一 actor 的入站量
- `actor-outbound`
  控制單一 actor 的出站量

## Verified

- `cd gateway-core && npm test`
  已覆蓋 instance inbound rate limit
  已覆蓋 actor outbound rate limit
  已覆蓋 admin policy / counter endpoint
- `cd gateway-core && npm run check:local-sandbox`
  dev config 開啟 rate limit baseline 後，follow loop 仍正常

## Next Step

補 rate limit 的 manual replay control、dashboard visualization，並把 counter / policy 觀測接到 persistence observability。
