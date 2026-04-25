# Decision 01 · Canonical URL 策略

狀態：**已定 · A**
拍板人：mashbean（總經理）
拍板日期：2026-04-25
影響範圍：G2-B 啟動前必須定案
最後更新：2026-04-25

---

## 決議

**選 A**：`acct:user@matters.town`，由主站 `/.well-known/webfinger` 直接回應、背後路由到 gateway。

**理由**：品牌一致最重要；Matters 是長期投資，不接受聯邦上的 actor ID 拆裂成 `webf.matters.town`。一次到位、不分階段。

**實作衝擊**：
- 主站 nginx / CDN 必須能將 `/.well-known/webfinger`、`/.well-known/host-meta`、`/.well-known/nodeinfo` 與 actor 路徑（如 `/users/<handle>`、`/users/<handle>/inbox`）反代到 gateway-core
- gateway-core config 中的 `instance.canonicalDomain` 與 actor URL 設為 `matters.town`，不使用 subdomain
- 既有 `webfDomain` 的實作路線需重新評估或移除
- G2-A（IPNS 對接）與 G2-B（帳號系統打通）合併視為一次主站 cutover，rollback 方案要更謹慎

**前置條件**：
- 主站架構審查（nginx 路由、TLS、health check）
- 與 Matters 主站工程團隊協調 cutover 視窗

---

---

## 問題

聯邦上 Matters 作者的 canonical actor URL 要長什麼樣？

候選格式會直接出現在外部聯邦使用者搜尋作者、追蹤、提及（@-mention）時看到的字串裡，等於是 Matters 在聯邦上的「品牌外觀」。

---

## 選項

### A · `acct:user@matters.town`
在地化、品牌一致、外部認知度最高。

**做法**：在 matters.town 主站 `/.well-known/webfinger` 直接回應，背後解析到 gateway。
**改動**：主站需改 nginx/CDN 規則接 `/.well-known/*` 與 actor 路由；DNS 不動。
**優**：聯邦上看起來就是 Matters，不分裂；長期最自然。
**劣**：主站架構動到、cutover 風險集中在主站；rollback 窗口窄。

### B · `acct:user@webf.matters.town`
拆出 subdomain 給 gateway 獨立運作。

**做法**：DNS 加 `webf.matters.town` 指向 gateway-core，主站不動。
**優**：完全解耦，gateway 出事不影響主站；可獨立開關；降低首發風險。
**劣**：聯邦上的作者 ID 看起來不是 matters.town，品牌拆裂；長期使用者會覺得「這不是 Matters 本家」。

### C · 兩階段（B → A）
**做法**：G1/G2 早期先上 B，等穩定 + 觀察 6 個月後切到 A。期間以 alias 機制保留 B 的可達性。
**優**：兼顧低風險首發 + 長期品牌正名。
**劣**：要做兩次 cutover、要實作 actor alias / move 流程、使用者改用新 ID 的溝通成本。

---

## 既有規格參考

- `research/matters-fediverse-compat/00-research/adr/ADR-002-canonical-identity-and-discovery.md`
- `research/matters-fediverse-compat/01-specs/identity-foundation-spec.md`

兩份文件目前以「canonical actor URL via `webfDomain`」描述，等於是選項 B 的方向，但未對 A/C 拍板。

---

## 建議

**選 C（兩階段 B→A）**，理由：
1. G1 reference release 與 G2 早期需要安全可回滾；B 可獨立關閉
2. Matters 是長期投資，品牌正名值得多做一次 cutover
3. ActivityPub 有 actor `Move` 活動可做帳號搬遷，技術上不至於從零造輪子

**前置條件**：
- ActivityPub `Move` 與 `Tombstone` 流程要先在 G1/G2 驗過（可放 G2-B）
- 對外通告與作者教育文件要備齊

---

## 待 mashbean 拍板

- 採 A / B / C 哪個？
- 若選 C，B → A 的時間點以什麼條件觸發（時間 / 用戶數 / Matters Lab 內部準備度）？
