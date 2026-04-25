# Protocol Gap Matrix

`ipns-site-generator` 目前比較像「靜態發佈與可發現性層」，已跨進 ActivityPub 入口，但距離完整 federation 仍缺最小動態 inbox、social graph state、簽章驗證、互動活動映射、更新刪除傳播與治理能力。

| Capability | Current evidence | Gap | Minimum addition |
| --- | --- | --- | --- |
| WebFinger | repo 會產出 `.well-known/webfinger`，已有靜態 actor discovery 入口 | 尚未證明完整 subject alias policy、domain canonical 規則、跨網域一致性測試 | 明確定義 `acct:` subject、canonical actor URL、alias 規則，補跨 instance discovery 測試 |
| Actor | 會產出 `about.jsonld`，actor 類型是 `Person`，actor ID 綁定 `https://<webfDomain>/about.jsonld` | 缺 public key lifecycle、實際 key material、followers / following collections、shared inbox、instance metadata 關聯 | 補完整 actor 欄位策略，至少包含 key material、followers / following collections、shared inbox 與 canonical URL 規則 |
| Outbox | 會產出 `outbox.jsonld`，每篇文章包成 `Create`，object 目前偏 `Note` | 對長文平台的 `Article` / `Note` 選型、更新刪除語義、thread 關聯都不足 | 定義文章物件映射規範，補 `Article` 評估、canonical URL、summary / content 策略與更新刪除流程 |
| Inbox | `about.jsonld` 內有 `inbox` 路徑字串 | 未見 server 端接收、驗證、處理 `Follow` / `Undo` / `Like` / `Announce` / `Reply` | 新增最小動態 inbox service，能接收、驗證、排隊、記錄與回應 inbound activities |
| Followers / Following | outbox 會引用 `https://<webfDomain>/followers.jsonld`，但 bundle 沒有產出對應 collection 檔案 | 沒有 social graph state，就無法支援追蹤關係、授權、回推播與互動治理 | 新增 follower graph storage、collection endpoints、同步與去重策略 |
| HTTP Signatures | repo 是靜態輸出工具，未見簽章與驗證流程 | 沒有 outbound signing 與 inbound verification，無法實作完整 federation | 導入 actor key 管理、HTTP Signatures 或相容機制、key rotation 與失敗重試流程 |
| Content negotiation | 現有證據集中在靜態 JSON-LD 檔案產出 | 尚未證明有 `Accept: application/activity+json` 等協商處理，也不清楚 HTML 與 ActivityPub representation 如何分流 | 補 server 或 gateway 層的 content negotiation，明確定義 HTML 與 ActivityPub 回應規則 |
| Delete / Update | 現有 evidence 只看到靜態 `Create` / outbox 輸出 | 缺刪文、改文、撤回與遠端同步傳播能力，快取失效也未解 | 補 `Update`、`Delete`、`Undo` 活動策略，外加遠端投遞、重試、快取失效與 tombstone 規則 |
| Reply / Mention / Like / Announce | 目前未看到對互動物件或活動的映射 | 缺少雙向互動核心能力，無法稱為完整 federation | 定義互動活動映射與儲存模型，補 inbound handling、thread linking、mention parsing、reaction state |
| NodeInfo / software identity | repo 內未見 NodeInfo 或 instance-level metadata | 遠端服務難以辨識這是什麼軟體、支援哪些能力、聯邦範圍到哪裡 | 補 NodeInfo 與 software identity endpoint，公開能力邊界與 instance metadata |
| Moderation hooks | 靜態發佈模型未顯示 moderation integration | 缺 abuse report、domain block、delete propagation、policy enforcement 掛點 | 在 bridge 或 federation layer 加入 moderation pipeline、domain policy、audit log 與 takedown hooks |
| Paid / encrypted / private content | 現有 object 選型偏公開內容輸出，未見特殊可見性處理 | Matters 若有付費文、加密文、限定可見內容，fediverse 不一定有等價映射 | 明確排除或特別標記不可 federation 內容，先限定公開文章，其他內容另立策略 |
