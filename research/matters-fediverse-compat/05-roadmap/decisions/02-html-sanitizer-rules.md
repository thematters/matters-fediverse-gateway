# Decision 02 · Article HTML Sanitizer 規則

狀態：**待決**
影響範圍：W4a（長文 Article 系統化）動工前必須定案
最後更新：2026-04-25

---

## 問題

Matters 文章原始為 HTML，要對外送出 ActivityPub `Article.content` 時，哪些 tag / attribute 允許保留？

聯邦其他實作（Mastodon / Misskey / GoToSocial）對 HTML 的處理寬鬆度差很大，過於開放會被剝乾淨變成純文字，過於保守又失去長文呈現價值。

---

## 選項

### A · 寬鬆（保留 Matters 編輯器全部能力）
保留：`p / br / a / strong / em / u / s / blockquote / pre / code / ul / ol / li / h2-h6 / img / figure / figcaption / iframe / hr`

**優**：作者編輯體驗 100% 保留。
**劣**：`iframe` 等可能被 Mastodon 拒收或剝除；攻擊面大；跨實作呈現難以保證。

### B · 嚴格（對齊 Mastodon 預設容忍度）
保留：`p / br / a / strong / em / s / blockquote / pre / code / ul / ol / li`

**優**：跨實作行為最一致；安全；維護成本低。
**劣**：作者長文中的標題 (`h2`)、圖片、影片嵌入會被剝除，剩純文字段；長文的視覺結構失真。

### C · 中道（保留結構，剝除嵌入）
保留：`p / br / a / strong / em / s / u / blockquote / pre / code / ul / ol / li / h2 / h3 / h4 / hr`
圖片：透過 `Article.attachment` 附件帶出（不放 inline `img`）
影片 / iframe：完全剝除，留 canonical link 引流

**優**：保留長文骨架（標題、列表、引用）；圖片走 attachment 是 ActivityPub 標準做法；可接受度最高。
**劣**：Matters 編輯器若有複雜嵌入（YouTube 等）會降級為連結；作者得理解這個邊界。

---

## 額外決策題

- **`<a>` 的 `target` / `rel` 屬性**：建議統一強制 `rel="noopener noreferrer ugc"`，`target="_blank"` 由接收端決定
- **IPFS 圖片**：是否轉成 `https://ipfs.io/ipfs/<hash>` gateway URL？或保留 `ipfs://` schema？建議轉 https + 列 hash 在 attachment metadata
- **程式碼塊**：`<pre><code class="language-xxx">` 的 class 是否保留？建議保留（Mastodon 會剝，但 Misskey 會利用）

---

## 建議

**選 C（中道）**：
- 保留長文視覺骨架但去除嵌入物
- 圖片走 `attachment`（`Document` type，含 `mediaType`、`url`、`name`）
- IPFS 圖片轉 https gateway URL，但 attachment 帶 `ipfs:hash` metadata 供進階實作識別
- 程式碼語言 class 保留

---

## 待 mashbean 拍板

- 採 A / B / C 哪個？
- IPFS 圖片轉 https 的 gateway 用 ipfs.io / cloudflare / Matters 自家？
- 是否在文末附「本文於 matters.town 原始連結」一行？這對導流 + 接受度都有幫助
