# Social Fan-Out Runtime Slice

## Scope

把 `Stage 04` 從只收 inbound social activity，再往前補到最小可用的 outbound social fan-out。這一輪先補 public reply / create、Like、Announce 的出站活動，以及 mention mapping baseline。

## Landed In This Slice

- 新增 `POST /users/<handle>/outbox/create`
  可發送 public `Create`
  若 `object.inReplyTo` 存在，會以 `reply` 路徑 fan-out
- 新增 `POST /users/<handle>/outbox/engagement`
  目前支援 `Like` 與 `Announce`
- mention mapping baseline 已接進 `Create`
  `payload.mentions` 會被轉成 ActivityStreams `Mention`
  mention target 也會併入 recipient 集合
- recipient 收斂規則目前如下
  `Create` 預設包含 accepted followers，再加 `targetActorIds` 與 mention targets
  `Like` 走明確 `targetActorIds`
  `Announce` 預設包含 accepted followers，再加 `targetActorIds`

## Runtime Surfaces

- `POST /users/<handle>/outbox/create`
- `POST /users/<handle>/outbox/engagement`
- `buildCreateActivity`
- `buildLikeActivity`
- `buildAnnounceActivity`

## Verification

- `cd gateway-core && npm test`
  已覆蓋
  outbox reply fan-out
  mention mapping
  Like fan-out
  Announce fan-out
- `cd gateway-core && npm run check:local-sandbox`
  既有 discoverability 與 `Follow -> Accept` 鏈路未被打壞

## Remaining Gaps

- thread reconstruction 還沒接進 local domain model
- mention mapping 目前先吃顯式 `payload.mentions`
- social fan-out 還沒把 reply / reaction 回寫到真正的 Matters 內容模型
