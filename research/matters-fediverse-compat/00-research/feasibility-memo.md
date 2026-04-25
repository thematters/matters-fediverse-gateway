# Matters.town Fediverse Feasibility Memo

## Executive Summary

- Matters 已有 ActivityPub 入口證據，因為 `ipns-site-generator` 會輸出 WebFinger、actor 與 outbox
- 現況仍偏向靜態發佈與可發現性，尚不足以支撐完整 federation
- 若目標是完整 federation，最小還需要補動態 inbox、followers state、簽章驗證、互動活動映射、內容協商、刪改傳播與治理掛點
- 目前最平衡的推薦架構是 `Static publisher + inbox bridge`

## Current State

- Matters 的 Meson 敘事強調去中心化內容與社交圖譜，也強調內容取用路徑的去中心化
- `ipns-site-generator` 在本地 clone commit `f860a4c` 已能產生 `.well-known/webfinger`、`about.jsonld`、`outbox.jsonld`
- actor 類型是 `Person`
- 文章 object 目前使用 `Note`
- actor ID 與 object URL 都偏向 `webfDomain`，不是 `matters.town/@user` 或 `sourceUri`
- `inbox` 目前僅見靜態路徑字串，未見完整 server-side handling
- outbox 會引用 `followers.jsonld`，但 bundle 本身沒有產出 followers collection
- article page 已支援 `encrypted` 輸出，代表付費 / 加密 / 受限內容邊界是現存需求，不適合被直接 federation

## Minimum Additions For Full Federation

- 動態 inbox service
- followers / following collections 與 social graph state
- outbound signing 與 inbound verification
- `Update`、`Delete`、`Undo` 與 delivery retry
- `Reply`、`Mention`、`Like`、`Announce` 的映射與儲存
- content negotiation
- NodeInfo / software identity
- moderation、domain policy、abuse handling hooks
- 公開內容與付費 / 加密 / 私密內容的明確邊界

## Recommendation

- 短中期以 `Static publisher + inbox bridge` 做 prototype
- 長期是否演進到 `Full dynamic federation layer`，取決於產品是否真的要承接完整社交互動與治理責任

## Decision Summary

- 第一個可執行方向不是重寫成完整 fediverse server
- 第一個可執行方向是保留既有靜態發佈，外加最小 inbox bridge
- bridge 的責任應先限縮在公開內容與公開互動
- 加密 / 付費 / 私密內容不直接 federation，只允許 preview 或 canonical link

## Immediate Engineering Targets

- 明確定義 canonical actor URL、WebFinger subject 與 aliases
- 生成或提供真正可用的 followers collection 與 key material
- 建立最小 inbox、驗章、delivery queue 與 moderation hooks
- 把 `Note` / `Article` 的選型轉成實測案例，而不是只靠靜態判斷
