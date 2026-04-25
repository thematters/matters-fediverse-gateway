# Notification Model Runtime Slice

## Summary

- `gateway-core` 現在會同步產生 actor-scoped `localNotifications`
- notification projection 目前先聚焦 Matters 應用層最需要的 social event
  `reply`
  `mention`
  `like`
  `announce`
- `localNotifications` 現在不再只是 raw event list，也會做 grouped feed，並保留 `read / unread` state
- admin 端新增 `GET /admin/local-notifications`
  可依 `actorHandle` 查整體通知，也可用 `contentId`、`category`、`notificationId` 查單筆或子集
  同時新增 `POST /admin/local-notifications/read` 供 admin / trace 測試面標記已讀與未讀

## Runtime Shape

- `localNotifications`
  每筆通知目前包含
  - `notificationId`
  - `actorHandle`
  - `primaryCategory`
  - `categories`
  - `contentId`
  - `threadId`
  - `threadRootId`
  - `objectId`
  - `activityId`
  - `remoteActorIds`
  - `headline`
  - `preview`
  - `publishedAt`
  - `receivedAt`
  - `eventCount`
  - `unreadCount`
  - `groupedNotificationIds`
  - `latestEventAt`
  - `state.read`
  - `state.readAt`
  - `state.readBy`
  - `state.readEventCount`
  - `status`
  - `updatedAt`

## Projection Rules

- inbound `Create`
  若為 reply，產生 `reply` notification event
  若內容或 tag 提到 local actor，產生 `mention` notification event
  同一 object 可同時拆成多個 event
- inbound `Like`
  產生 `like` notification event
- inbound `Announce`
  產生 `announce` notification event
- event 會再依 `primaryCategory + content identity` 收斂成 grouped notification
- projection 會把 notification 反向彙總回 `localContents.notifications`
  除了 per-content total counts，也會回寫 unread counts

## Read State

- grouped notification 預設為 unread
- `POST /admin/local-notifications/read`
  預設把指定 notification 標成 read
  傳 `read: false` 可改回 unread
  傳 `all: true` 可一次標整個 actor feed
- rebuild projection 時，會保留既有 read state
- 若同一 group 之後有新 event 進來，該 group 會自動 reopen 成 unread

## Admin Surface

- `GET /admin/local-notifications?actorHandle=<handle>`
  查 actor 全部 notification
- `GET /admin/local-notifications?actorHandle=<handle>&contentId=<contentId>`
  查單一內容的 notification feed
- `GET /admin/local-notifications?actorHandle=<handle>&category=reply`
  查特定類型
- `GET /admin/local-notifications?actorHandle=<handle>&unreadOnly=true`
  只看未讀 grouped notification
- `GET /admin/local-notifications?actorHandle=<handle>&notificationId=<id>`
  查單筆
- `POST /admin/local-notifications/read`
  標記 read / unread

## Why This Matters

- gateway 不再只有協定物件與 thread summary，也開始提供接近 Matters 應用層通知中心的最小資料形狀
- `localNotifications` 和 `localContents.notifications` 使用同一批 inbound records 重建
  降低 thread view、content view、notification view 三者漂移風險
- read state 與 grouping 現在已有穩定落點，後續可以往 digest、collapse copy、真正的應用層 UI 再推

## Current Limits

- 目前 grouping 是 `category + content` 等級，還沒做到更細的 actor-aware collapse copy
- 目前 read state 還沒有 user-facing auth / permission 模型
- 還沒有把 moderation review、mention resolve failure、delivery dead letter 混進同一條 notification feed

## Verification

- `cd gateway-core && npm test`
  已新增 `admin local notifications projects reply, mention, like, and announce events`
  已新增 `admin local notifications preserves read state and reopens grouped notifications on new events`
- `cd gateway-core && npm run check:local-sandbox`
  仍通過 canonical discoverability 與 follow loop 驗證
