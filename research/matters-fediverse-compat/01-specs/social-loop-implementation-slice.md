# Social Loop Implementation Slice

## Goal

把 `Stage 04` 切成最小可驗證工程切片，先讓外部 `Create` / `Reply` / `Like` / `Announce` / `Undo` 進到 Matters gateway 後不只被收下，也讓本地 actor 能對 followers 發出最小 `Update` / `Delete`。

## Scope

- inbound `Create`
- inbound `Reply`
- inbound `Like`
- inbound `Announce`
- inbound `Undo`
- outbound `Update`
- outbound `Delete`
- public-only boundary
- 最小 state persistence
- trace 記錄

## Current Implementation

- gateway 目前接受 signed `Create` 到 `/users/<handle>/inbox`
- gateway 目前也接受 signed `Like` 與 `Announce` 到 `/users/<handle>/inbox`
- gateway 目前也接受 signed `Undo` 到 `/users/<handle>/inbox`
- 只處理 public audience 的 `Create`
- `Create.object.inReplyTo` 存在時會映射成 `reply`
- 其他 public `Create` 會映射成一般 `create`
- inbound object 會落到 actor state 的 `inboundObjects`
- inbound `Like` / `Announce` 會落到 actor state 的 `inboundEngagements`
- `Undo Follow` 會移除 follower state，`Undo Like` / `Undo Announce` 會移除 engagement state
- `/users/<handle>/outbox/update` 會對 accepted followers fan-out `Update`
- `/users/<handle>/outbox/delete` 會對 accepted followers fan-out `Delete`

## Persisted Fields

- `objectId`
- `activityId`
- `remoteActorId`
- `objectType`
- `mapping`
- `content`
- `summary`
- `url`
- `inReplyTo`
- `publishedAt`
- `tags`
- `visibility`
- `receivedAt`

## Persisted Engagement Fields

- `activityId`
- `actorHandle`
- `remoteActorId`
- `activityType`
- `mapping`
- `objectId`
- `receivedAt`

## Out Of Scope

- outbound `Create` fan-out
- remote mention fan-out
- reply thread materialization UI

## Verification

- `cd gateway-core && npm test`
  已覆蓋 public `Create` reply persistence
- `cd gateway-core && npm test`
  已覆蓋 non-public `Create` boundary ignore
- `cd gateway-core && npm test`
  已覆蓋 inbound `Like` / `Announce` persistence
- `cd gateway-core && npm test`
  已覆蓋 inbound `Undo` 與 outbound `Update` / `Delete`
- `cd gateway-core && npm run check:local-sandbox`
  仍可通過 discoverability 與 follow-loop 黑箱驗證

## Next Step

下一個最值得做的切片是 production persistence、reply / reaction fan-out、mention mapping，讓 social loop 從最小控制面擴展到可部署的互通 runtime。
