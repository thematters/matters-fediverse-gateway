# ADR-006 Longform Object Mapping

狀態：已定
最後更新：2026-05-01

## Context

Matters 內容以長文為主，`Note`、`Article` 或混合策略會直接影響 Mastodon 顯示與互通品質。

## Decision

公開長文對外 canonical object type 固定使用 `Article`，並以黑箱相容性驗證確認顯示與 thread 行為。

`gateway-core` 的靜態 outbox bridge 與 outbound Create/Update 必須共用同一條 Article normalization path：

- `type`：公開長文固定輸出 `Article`；既有靜態 seed 若仍是 root `Note`，gateway 對外回應時正規化為 `Article`
- `name`：保留原始標題；缺值時以 summary 或 canonical URL 補齊
- `summary`：優先使用原始 summary 的純文字；缺值時由 content 純文字產生；長度上限 280 字元，超過以 `...` 截斷
- `content`：依 Decision 02 的 C 規則保留安全 HTML 骨架，剝除影片、iframe、script 與非白名單屬性
- `attachment`：inline 圖片移到 `Article.attachment`，使用 `Document`，保留 `mediaType`、`url`、`name`
- IPFS 圖片：`ipfs://<hash>` 與 ipfs.io gateway URL 正規化為 `https://ipfs.io/ipfs/<hash>`，並保留 `ipfs:hash`
- canonical link：保留 `url`，並在 content 末尾附原始 Matters 連結，供聯邦讀者回到原站閱讀
- `<a>`：只允許 http/https/IPFS 轉換後 URL，並強制 `rel="noopener noreferrer ugc"`
- 程式碼塊：保留 `<pre><code class="language-xxx">` 的語言 class，其餘 class 與事件屬性剝除

## Consequences

- writer 與 architect 必須提供 object mapping 決策表
- implementer 不得再把長文預設輸出成 `Note`
- reviewer 必須以真實 Mastodon 行為驗證 `Article` 的顯示與 thread 表現
- 後續 Misskey / GoToSocial 互通報告需記錄 `Article` 顯示、summary、attachment 與 canonical link 的差異
