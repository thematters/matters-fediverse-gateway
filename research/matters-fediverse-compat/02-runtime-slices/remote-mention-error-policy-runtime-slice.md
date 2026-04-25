# Remote Mention Error Policy Runtime Slice

## Summary

- `gateway-core` 現在把 remote acct mention resolution failure 明確分成 `resolved`、`retryable_error`、`permanent_error`
- outbound `Create` / `Like` / `Announce` / `engagement` 不會因單一 remote mention 失敗而整體中止
- mention failure 會落到持久化 state、structured trace、evidence，以及最小 admin query surface

## Failure Policy

- `resolved`
  mention account 成功轉成 canonical actor URL
  會把 account -> actorId 關聯寫進 `mentionResolutions`
- `retryable_error`
  用在 WebFinger 暫時失敗、actor document 5xx / 429、網路錯誤
  當前 outbound 會跳過該 mention，不會拖垮其他 recipients
  record 會寫入 `nextRetryAt`
- `permanent_error`
  用在 invalid account、WebFinger 缺 actor link、actor document JSON / shape 不合法、actor ID mismatch
  當前 outbound 同樣跳過該 mention
  不會自動 retry，等待後續人工檢查或實作進一步 reconcile

## Cache And Retry Boundary

- 成功 resolve 後，`mentionResolutions` 會保存 `account -> actorId`
- 後續同帳號 mention 會優先走 actorId cache，不必每次重打 WebFinger
- 若先前已有 `resolved` 記錄，但 refresh 遇到暫時性失敗，runtime 會回退到既有 stale remote actor record，避免單次網路抖動中斷 fan-out
- `retryable_error` 會以 `remoteDiscovery.mentionFailureRetryMs` 控制 retry 冷卻
  預設為 `5` 分鐘
- 冷卻期間同一 account 會直接使用 cached failure，不再重複打遠端
- `permanent_error` 目前視為 cached hard failure，不自動重試

## Outbound Behavior

- remote mention resolve 失敗時
  該 mention 不會被加入 recipient list
  response 會帶 `mentionResolution.skipped`
- `Create` 仍會保留最小 unresolved `Mention` tag
  `tag.name` 會保留原本的 `@handle@domain`
  不會捏造 `href`
- 若還有 followers 或其他 explicit targets，activity 仍會照常排送
- 若 mention 原本是唯一可送達 recipient，API 仍會回 `422`
  但 response 會把 `mentionResolution` 一起回傳，讓失敗原因可見

## Persistence And Admin Surface

- file store 與 SQLite 都新增 `mentionResolutions`
- 每筆 record 目前至少包含
  `account`
  `status`
  `actorId`
  `failure`
  `lastAttemptAt`
  `lastSuccessAt`
  `lastFailureAt`
  `nextRetryAt`
  `actorHandle`
  `surface`
  `objectId`
- admin 端新增 `GET /admin/remote-mentions`
  可依 `status`、`actorHandle`、`surface`、`account` 查詢

## Observability

- trace 事件
  `mention-resolution.resolved`
  `mention-resolution.skipped`
- failure 也會記到 audit log
  `mention-resolution.failed`
- evidence 類別新增 `mention-resolution`
  會保留 account、分類結果、failure code、reason 與 retry 時間

## Verification

- `cd gateway-core && npm test`
  已新增 retryable mention failure cache、permanent failure fallback tag、SQLite persistence 覆蓋
- `cd gateway-core && npm run check:local-sandbox`
  仍通過 canonical discoverability 與 follow loop 驗證
