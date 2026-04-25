# Content Model Runtime Slice

## Summary

- `gateway-core` 現在除了 `localConversations`，也會同步產生 actor-scoped `localContents`
- `localContents` 把 thread 視角再往應用層推一段，整理成可對應 Matters 內容卡片、內容摘要、互動計數與 thread 關聯的最小 projection
- `localContents` 現在也會帶 notification summary、activity-level delivery summary，以及 delivery-aware action matrix
- `localContents` 現在也會納入 outbound-authored `Create` / `Update` / `Delete` object snapshot，純本地 authored content 不再依賴 inbound thread 才能出現在 projection
- admin 端新增 `GET /admin/local-content`，可依 `actorHandle` 查整體內容投影，也可用 `contentId` 或 `threadId` 查單筆
- admin 端新增 `GET /admin/local-content/delivery`
  可對單一 content 往下看 outbound activity drilldown、recipient breakdown、replayable dead-letter recipient
- admin 端新增 `POST /admin/local-content/delivery/replay`
  可直接從 content context 重送 dead-letter recipient，不必先跳到 dead-letter surface
- admin 端新增 `GET /admin/review-queue?surface=content-delivery`
  可列出 content-card 視角的 delivery issue queue
- admin 端的 review queue / dashboard 現在優先走 store-backed snapshot source
  讓 issue summary、replayable items 與 recent replay 可以重用同一條持久化 query path
- review queue、activity index 與 activity replay 現在收斂成 actor-scoped persisted projection bundle
- `GET /admin/dashboard` 現在也會帶 `contentDelivery`
  可看 actor-level content delivery summary、issue count、replayable item count、recent replay
- `GET /admin/review-queue` 與 `GET /admin/dashboard`
  現在都支援 `replayedOnly` 與 `replayableOnly`，可直接切出仍可重送的 backlog 或只看有 replay 歷史的 queue item
  `replayedOnly` 會以 activity recipient 的 queue item 歷史判斷，不會因為 dead-letter 已轉回 pending 而失去 replay 痕跡
- `GET /admin/review-queue`
  現在會把 filter 後的摘要放在 `filteredSummary`
  避免 operator 看到的 item list 已經過濾，但 summary 還停在全量視角
  同時也會回傳 `appliedFilters`
  讓 operator 或上層 UI 可以直接知道這份 queue snapshot 是用哪組 filter 算出來的
  現在也會回傳 `viewSummary` 與 `summaries.current`
  讓新 caller 直接讀目前這份 snapshot 應該使用的 summary
  也會回傳 `canonicalSummaryKey` 與 `summaryAliases`
  明確標示 `summaries.current` 是主用欄位，舊 alias 仍保留供相容性使用
  另外也會回傳 `currentSummaryMode`
  明確標示目前 `summaries.current` 代表 `full` 或 `filtered`
  現在也會回傳 `contractVersion` 與 `legacySummaryKeys`
  讓 caller 能明確辨識目前 contract 版本，以及哪些欄位屬於相容 alias
  現在也會回傳 `contract`
  把 version、canonical key、current mode、legacy 清單、alias map 收進單一子物件
  也會在 `contract.legacyFields` 標示每個 compatibility field 的 replacement path
- review queue item ops 現在明確帶
  - `replayableItems`
  - `replayCount`
  - `lastReplayAt`
  - `staleSince`
- admin 端新增 `GET /admin/local-content/delivery/activities`
  可做跨 content 的 unique activity 檢視，補足 content-context drilldown 之外的去重視角
  現在也支援 `replayedOnly` 與 `replayableOnly`
  可直接切出仍有 replayable recipient 的 unique activity，或只看已經發生 replay 的 activity
- admin 端新增 `POST /admin/local-content/delivery/activities/replay`
  可直接以 unique activity 視角重送 dedupe 後的 dead-letter recipient

## Runtime Shape

- `localConversations`
  保持 thread / conversation 視角
  目前新增 `actionMatrix`
- `localContents`
  以 content card 為主鍵的內容視角
  remote thread 內容仍以 thread root 為主
  local authored content 則以 authored object id 為主
  每筆內容包含
  - `contentId`
  - `threadId`
  - `threadRootId`
  - `rootObjectId`
  - `headline`
  - `preview`
  - `metrics.objects`
  - `metrics.replies`
  - `metrics.likes`
  - `metrics.announces`
  - `actionMatrix`
  - `notifications`
  - `delivery`
  - `relations.replyObjectIds`
  - `relations.engagementIds`

## Action Matrix

- `actionMatrix.inbound.create`
  thread 內 root / create object 數量
- `actionMatrix.inbound.reply`
  reply object 數量
- `actionMatrix.inbound.like`
  inbound Like 數量
- `actionMatrix.inbound.announce`
  inbound Announce 數量
- `actionMatrix.notifications`
  以應用層 notification 視角整理 `reply`、`mention`、`like`、`announce`
  並帶 `unreadTotal` 與各類型 unread count
- `actionMatrix.outbound`
  以 distinct outbound activity 視角整理 `create`、`reply`、`like`、`announce`、`update`、`delete`
- `actionMatrix.delivery`
  以 outbound activity 視角整理 `total`、`delivered`、`pending`、`retryPending`、`deadLetter`、`partial`
- `delivery.recipients`
  保留 recipient delivery item 視角整理 `total`、`delivered`、`pending`、`retryPending`、`deadLetter`
- `delivery.activities`
  目前不直接回寫在 `localContents` record 本體
  改由 `GET /admin/local-content/delivery` 做 drilldown
- `actionMatrix.participation`
  參與 actor、local participant、mention、未解 thread object 的計數
- `actionMatrix.state`
  `hasReplies`、`hasEngagements`、`threadResolved`

## Why This Matters

- 這一層讓 gateway 不只停在協定物件收發，開始能提供 Matters 應用層要看的內容摘要
- 內容卡片、通知聚合、作者後台 thread 檢視，之後都可以建立在 `localContents` 上
- 同一份內容 projection 現在也能回答
  這篇內容收到哪些通知型事件
  這篇內容的 outbound activity 整體是否已完成
  以及還有多少 recipient 卡在 pending / retry / dead letter
- notification read state 現在也會回寫到 `localContents.notifications`
  讓內容卡片可直接知道未讀互動還有多少
- local authored content 現在也會進 `localContents`
  所以作者自己發的 root post、reply，以及後續 update / delete，都能在同一個 admin surface 查到
- local reply content 會維持自己的 identity 邊界
  不會把 parent thread 的 like / announce 誤投到 reply card
- content delivery 現在有兩層視角
  `localContents.delivery` 提供 activity-level summary
  `/admin/local-content/delivery` 提供 activity 與 recipient drilldown
- ops dashboard 現在有第三層視角
  `/admin/review-queue` 與 `/admin/dashboard` 會把 content delivery 問題整理成營運可直接操作的 queue / summary
- review queue 與 dashboard 現在會先從 store-backed snapshot source 組裝
  不再只靠 route handler runtime 全掃重建
- queue / dashboard summary 現在同時帶兩組計數
  `activities`
  以 content-context 視角聚合
  `uniqueActivities`
  以 unique activity id 去重後聚合
- cross-content activity index 現在可由 `/admin/local-content/delivery/activities` 取得
  讓 operators 能先看去重後的 activity 視角，再回到 content card drilldown
- manual replay 現在除了 `/admin/dead-letters/replay`
  也可直接從 content context 觸發，讓內容卡片更容易接營運操作
- activity index 現在也可直接做 activity-level replay
  operator 不必先展開 per-content drilldown 再找 replayable queue item
- review queue、activity index 與 activity replay 現在共用同一組 store-backed projection source
  file store 與 SQLite store 都能從持久化資料重建相同語意
- review queue 與 dashboard 的 content delivery queue 現在支援最小 ops filter
  可依 `actorHandle`、`status`、`replayedOnly`、`replayableOnly` 查詢
- review queue response 現在會同時帶
  `summary`
  全量 queue 摘要
  `filteredSummary`
  套用目前 filter 後的摘要
- review queue / dashboard 的 content delivery snapshot 現在也會帶 `appliedFilters`
  可直接回顧 `actorHandle`、`status`、`replayedOnly`、`replayableOnly`、`limit`
- review queue / dashboard 的 content delivery snapshot 現在也會帶
  `canonicalSummaryKey`
  固定指向 `summaries.current`
  `summaryAliases`
  用來標示 `summary`、`fullSummary`、`filteredSummary`、`viewSummary` 對應到哪個 canonical summary path
- review queue / dashboard 的 content delivery snapshot 現在也會帶
  `currentSummaryMode`
  用來標示 `summaries.current` 目前代表 `full` 或 `filtered`
- review queue / dashboard 的 content delivery snapshot 現在也會帶
  `contractVersion`
  目前固定為 `1`
  `legacySummaryKeys`
  目前列出 `summary`、`fullSummary`、`filteredSummary`、`viewSummary`
- review queue / dashboard 的 content delivery snapshot 現在也會帶
  `contract`
  新 caller 可直接從這個子物件讀 version、canonical summary path、current mode、legacy keys、alias map
  `contract.legacyFields`
  可直接查 `summary`、`fullSummary`、`filteredSummary`、`viewSummary` 各自應該換讀哪個 path
- dashboard 與 review queue 現在共用同一條 content delivery summary contract normalization helper
  route 不再各自維護 fallback 邏輯
- activity drilldown 仍保留 `actorHandle`、`status`、`activityId` filter
- `localConversations` 和 `localContents` 共用同一條 reconcile 流程，降低 projection 漂移風險

## Current Limits

- 目前仍是 gateway projection，不是完整 Matters domain model
- content delivery drilldown 現在已建立在 actor-scoped persisted projection bundle 上，但 query surface 仍是 admin read model
- review queue、activity index 與 activity replay 已有 actor-scoped persisted projection bundle，drilldown 與去重視角共用同一份資料
- `uniqueActivities`、`/admin/local-content/delivery/activities` 與 activity-level replay 已提供 cross-content 去重視角，且與 content card drilldown 共用同一份 persisted projection bundle

## Verification

- `cd gateway-core && npm test`
  已新增 `admin local content exposes content projection and action matrix`
  已新增 `admin local content projects outbound-authored root content`
  已新增 `admin local content keeps outbound-authored reply identity separate from parent thread notifications`
  已更新 `admin local content includes delivery-aware outbound action matrix`
  改為驗證 activity-level summary 與 recipient breakdown 同時存在
  已新增 `admin local content delivery drilldown exposes activity summaries and filters`
  已新增 `admin local content delivery replay replays dead-letter recipients for a content`
  已新增 `admin queue and content delivery surfaces expose dead letters and recent replay traces`
  已新增 `admin review queue lists content delivery issues and replayable items`
  已新增 `admin local content delivery activities dedupes cross-content activity context`
  已新增 `admin local content delivery activity replay replays dead-letter recipients once per unique activity`
  已新增 `sqlite state store exposes content delivery activity index`
- `cd gateway-core && npm test`
  已新增 `file state store exposes content delivery review snapshot`
  已新增 `sqlite state store persists follower and outbound state across reopen`
  已更新 `sqlite state store exposes content delivery review snapshot`
  已更新 `sqlite state store exposes runtime metadata and queue snapshot`
- `cd gateway-core && npm test`
  已新增 `admin local notifications preserves read state and reopens grouped notifications on new events`
- `cd gateway-core && npm run check:local-sandbox`
  仍通過 canonical discoverability 與 follow loop 驗證
