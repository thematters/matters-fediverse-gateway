# Local Domain Runtime Slice

## Scope

把 `Stage 04` 從 thread metadata 再往前推到 actor-scoped local conversation projection。這一輪的目標，是讓 inbound object / engagement 不只存在 raw state，還能被整理成可查詢、可重建、可 reconciliation 的 local domain summary。

## Landed In This Slice

- store 現在有 actor-scoped `localConversations`
  file store 與 SQLite store 都已接上
- inbound `Create` / `Reply` / `Like` / `Announce` / `Undo`
  在改動 raw social state 後，會同步刷新 local conversation projection
- admin 端新增 `GET /admin/local-domain`
  可查 actor 的 local conversation summary
- admin 端新增 `POST /admin/local-domain/reconcile`
  可做 mention backfill、orphan reply repair 與 conversation rebuild
- social reconcile 現在支援 `dryRun`
  會產生 report，但不會改動 store

## Projection Shape

- `threadId`
- `threadRootId`
- `objectIds`
- `engagementIds`
- `objectCount`
- `replyCount`
- `engagementCount`
- `unresolvedObjectIds`
- `participantActorIds`
- `localParticipantHandles`
- `mentionActorIds`
- `latestObjectId`
- `latestPublishedAt`
- `updatedAt`

## Runtime Surfaces

- `GET /admin/local-domain`
- `POST /admin/local-domain/reconcile`
- `replaceLocalConversations()`
- `getLocalConversation()`
- `getLocalConversations()`

## Verification

- `cd gateway-core && npm test`
  已覆蓋
  inbound social activity 自動同步 local conversation projection
  social reconcile 的 `dryRun`
  orphan reply repair
  mention backfill
- `cd gateway-core && npm run check:local-sandbox`
  既有 discoverability 與 `Follow -> Accept` 鏈路仍正常

## Remaining Gaps

- remote mention 若沒有 actor URL，現在仍不會主動做 discovery
- local conversation projection 還沒有 reply / engagement 的細分類 action matrix
- 還沒把 local conversation 直接映射回 Matters 真正的內容模型或通知模型
