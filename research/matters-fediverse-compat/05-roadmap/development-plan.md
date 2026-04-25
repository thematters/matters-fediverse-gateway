# Matters × Fediverse 開發藍圖

最後更新：2026-04-25
決策前提：長文以 `Article` 對外聯邦；Matters 官方主導，不是第三方提案

---

## 一、專案本質（白話版）

Matters 是長文寫作平台。Fediverse 是一張開放的聯邦網（Mastodon、Threads、Misskey 都在上面）。本專案在 Matters 前面架一座「大使館」（代號 `gateway-core`），讓：

- 外部聯邦用戶能追蹤 Matters 作者、看到新文章、留言、按愛心、轉發
- 這些互動能回傳到 Matters 站內
- **長文以 `Article` 格式原樣對外**（不是縮成微網誌摘要）
- 付費文、加密文、私訊**不外流**，只提供導流連結

---

## 二、目標三層

### G1 ── 官方聯邦化基礎版
**一句話**：讓 Matters 官方有一套自己能跑、也能給別人重用的聯邦 gateway 首發。
**可交付成果**：一個可在 staging 環境實跑、能跟 Mastodon / Misskey / GoToSocial 三方雙向互通、含完整海關（moderation）與值班（observability）的 reference release + 使用者應變手冊。
**時程**：3 個月（2026-05 ~ 2026-07）
**工程人力**：1 FTE 後端 + 0.25 FTE ops review
**估計成本**：NT$450k–600k（純工程） ≈ €13k–17k

### G2 ── Matters 主站正式導入
**一句話**：把大使館真的接到 matters.town，讓 26 萬使用者可以被聯邦看見、也能從聯邦看外面。
**可交付成果**：matters.town 的作者帳號可被 `@user@matters.town` 解析；Matters App/Web 顯示來自聯邦的回覆與追蹤；分階段 pilot → beta → GA。
**時程**：4–6 個月（2026-08 ~ 2026-12 / 2027-01）
**工程人力**：1 FTE 後端 + 0.5 FTE 前端 + 0.5 FTE PM/Ops
**估計成本**：NT$2.0M–3.0M ≈ €55k–85k（屬 Matters 自身產品投資，不進 grant 範圍）

### G3 ── 多站同源驗證
**一句話**：證明這套 gateway 真的可以給第二個站用（例如試跑一個中文獨立媒體 pilot 或社群 instance）。
**可交付成果**：第二個 test instance 成功對外聯邦，registry 與命名空間隔離經真機驗收，launch harness 可重跑。
**時程**：2 個月（可與 G2 中後段並行，約 2026-10 ~ 2026-11）
**工程人力**：1 FTE 後端
**估計成本**：NT$300k–400k ≈ €8k–12k

---

## 三、G1 範圍定案（根據「長文 + 官方主導」準則重排）

### ✅ G1 必做（七項）

| # | 工作項目 | 人週 | 白話說明 |
|---|---|---|---|
| W1 | 真環境值班演習 | 1 | 在實際 staging 把 alerts/metrics/logs webhook 全接一次，產 drill report |
| W3 | Misskey + GoToSocial 互通驗證 | 1 | 除 Mastodon 外再驗兩個主要實作，確保不只綁單一鄰國 |
| **W4a** | **長文 Article 系統化** | **2.5** | 定案：對外用 `Article`；實作 HTML sanitizer、summary/excerpt 策略、attachment 對映、canonical URL 引流 |
| W5 | 付費/加密/私密邊界程式化 | 1.5 | 在 static outbox bridge 入口加 visibility gate、補單測、admin 可視化 |
| W6 | 金鑰輪替流程 | 1 | gateway 支援 key overlap window、rotation script、runbook |
| W2 | 資料一致性掃描 | 1 | followers / inbound object 的 reconcile + 差異報表 |
| W8 | 應變手冊 + 桌面演練 | 1 | Launch runbook、incident playbook、rollback plan 三份，跑一次演練 |

**小計：9 人週 ≈ 2.25 個月 工程 + 2 週 review/buffer = 3 個月**

### 🚫 不放 G1

- W7 舊欄位清理：技術債，放 G2 清
- Prometheus / OTLP / PagerDuty exporter：webhook 已夠，staging drill 跑完再判斷
- Multi-instance registry：留 G3
- 對接真實 matters.town 前端：留 G2

### ⚠️ G1 隱性前提（影響成本）

- Matters 需提供：staging 環境（1 台 VM、一個 subdomain、TLS）、`ipns-site-generator` 測試 bundle
- 一個「測試 Matters 作者」身分，開放 2–3 位真人作者試跑 W3 互通

---

## 四、G2 工作拆解（先列，細節在進入 G2 階段再定）

| 階段 | 工作 | 工程週 |
|---|---|---|
| G2-A | 對接真實 IPNS 輸出（取代 fixture） | 2–3 |
| G2-B | **canonical URL 策略定案** + 帳號系統打通 | 4–6 |
| G2-C | Matters App / Web 的聯邦互動顯示（前端工程） | 8–12 |
| G2-D | Pilot alpha（50–100 位邀請作者試跑） | 4–6 |
| G2-E | Beta → GA rollout + 使用者遷移溝通 | 4–8 |

**關鍵產品決策（G2-B）**：
- 選項 A：`acct:user@matters.town`（品牌一致、對外認知高；需改動主站 WebFinger 入口）
- 選項 B：`acct:user@webf.matters.town`（降低主站改動、可獨立開關；但品牌拆裂）
- **建議**：長期走 A；G2-B 分兩階段，先 B 後 A

---

## 五、G3 工作拆解

| 階段 | 工作 | 工程週 |
|---|---|---|
| G3-A | Stage 06 規格落地：instance registry / per-instance config / namespace isolation | 3 |
| G3-B | 第二個 test instance 架設 + 黑箱驗收 | 2 |
| G3-C | Launch harness 可重跑（discovery / follow / social / boundary / moderation 五類） | 2 |
| G3-D | 文件與 reference deployment package | 1 |

**小計：8 人週 ≈ 2 個月**

---

## 六、時間軸總覽

```
2026  │ May │ Jun │ Jul │ Aug │ Sep │ Oct │ Nov │ Dec │ Jan27 │
G1    │████████████████████│                                   │
G2    │                    │█████████████████████████████████  │
G3    │                                │█████████████          │
```

**關鍵里程碑**：
- 2026-05 月底：W1 + W3 完成，對外可宣告「三方互通驗證通過」
- 2026-07 月底：G1 完工，reference release 發佈；grant 期中交付節點
- 2026-10：G2 pilot alpha（首批作者試跑）
- 2026-11：G3 完工，第二 instance 驗收
- 2026-12 ~ 2027-01：G2 GA；grant 結案

---

## 七、總成本估計

| 項目 | 工程週 | 成本（NT$） | 成本（EUR） | 資金來源 |
|---|---|---|---|---|
| G1 | 9 + buffer | 450k–600k | €13k–17k | Grant + Matters 自籌 |
| G2 | 22–35 | 2.0M–3.0M | €55k–85k | Matters 產品投資 |
| G3 | 8 | 300k–400k | €8k–12k | Grant + Matters 自籌 |
| **合計** | **39–52** | **NT$2.8M–4.0M** | **€76k–114k** | |

**Grant 可申請範圍（G1 + G3 + 文件/釋出）**：約 €30k–35k，仍在 NLnet NGI Fediversity / Commons 常見核銷範圍內。

---

## 八、風險與需要的產品決策

1. **canonical URL 決策（G2-B）**：影響品牌、既有 URL 路由、使用者遷移，需儘早定案
2. **付費文邊界外部呈現**：對聯邦讀者顯示幾段 preview？完全不顯示？需產品 + 法務雙決
3. **使用者 opt-in vs opt-out**：預設把 26 萬帳號全部推上聯邦，還是作者自行開啟？隱私與 GDPR 影響
4. **Article HTML sanitizer 規則**：哪些 tag 允許？嵌入 IPFS 圖片怎麼處理？
5. **與 Matters 既有工程團隊整合**：gateway-core 要不要併入主 monorepo？還是維持 sibling repo？

這五題建議在 G1 執行期間（2026-05 ~ 07）逐步定案，最晚 G2 啟動前收斂。
