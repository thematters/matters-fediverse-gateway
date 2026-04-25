# Social Thread Runtime Slice

## Scope

把 `Stage 04` 從 outbound social fan-out 再往前推到最小 thread reconstruction 與 richer mention mapping。這一輪的目標，是讓 inbound / outbound social object 不只可收送，還能保留 thread root、reply depth、mention actor 與 local participant 線索。

## Landed In This Slice

- inbound `Create` / `Reply` 現在會在持久化前補 thread metadata
  包含 `threadId`
  `threadRootId`
  `threadResolved`
  `replyDepth`
  `participantActorIds`
  `localParticipantHandles`
- inbound object 現在會把 `Mention` tag 與內容中的本地 acct mention 正規化到 `mentions`
- inbound `Like` / `Announce` 現在會補 `threadRootId`
  若 target object 已知，會繼承該 object 的 root
  若 target object 未知，會先把 object id 當成 thread root
- outbound `Create` 現在會把 `payload.mentions`
  object `tag`
  object `content` 內的本地 acct mention
  一起收斂成 canonical mention tag
- local actor mention 目前可用
  actor URL
  `@handle`
  `@handle@instance-domain`
  `acct:handle@instance-domain`
- admin 端新增 `GET /admin/threads`
  可依 `actorHandle`
  `threadId`
  `objectId`
  查 thread summary 或單一 thread 詳情

## Runtime Surfaces

- `POST /users/<handle>/inbox`
- `POST /users/<handle>/outbox/create`
- `POST /users/<handle>/outbox/like`
- `POST /users/<handle>/outbox/announce`
- `POST /users/<handle>/outbox/engagement`
- `GET /admin/threads`

## Verification

- `cd gateway-core && npm test`
  已覆蓋
  nested reply thread reconstruction
  orphan reply unresolved thread root
  engagement thread root inheritance
  local mention mapping
  admin thread summary query
- `cd gateway-core && npm run check:local-sandbox`
  既有 discoverability 與 `Follow -> Accept` 鏈路仍正常

## Remaining Gaps

- thread state 目前仍是從 inbound object record 重建，尚未回寫成真正的 Matters local domain model
- remote mention 若只有 content acct，現在不會主動做 WebFinger / actor lookup
- mention backfill 與 orphan reply reconciliation 還沒接定期修補流程
- outbound thread state 目前主要體現在 activity payload，尚未有 local object persistence
