# Remote Actor Policy Runtime Slice

## Goal

把 `Stage 05` 剩下的 richer actor-level policy 接進 runtime，先讓 gateway 能對單一遠端 actor 做 inbound / outbound 控制，而不只停在 domain block。

## What Landed

- 新增 remote actor policy persistence
- inbound 現在支援 `allow`、`deny`、`review`
- outbound 現在支援 `allow`、`deny`
- inbound `deny` 會直接擋下遠端 actor
- inbound `review` 會把活動轉成 `queued-review`
- outbound `deny` 會讓 delivery 進 dead letter
- policy decision 會留下 abuse case、audit、trace、evidence
- 新增 admin endpoint  
  `GET /admin/remote-actor-policies`  
  `POST /admin/remote-actor-policies`

## Runtime Shape

- policy key 是遠端 actor `actorId`
- inbound action  
  `allow`  
  `deny`  
  `review`
- outbound action  
  `allow`  
  `deny`

## Verified

- `cd gateway-core && npm test`
  已覆蓋 inbound deny、inbound review、admin policy endpoint、outbound deny
- `cd gateway-core && npm run check:local-sandbox`
  remote actor policy slice 加入後，discoverability 與 signed `Follow` -> `Accept` 仍正常

## Next Step

補 actor policy 的更細粒度 action matrix，並把 moderation review workflow 接進 admin surface。
