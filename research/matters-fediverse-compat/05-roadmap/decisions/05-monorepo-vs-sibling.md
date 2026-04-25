# Decision 05 · gateway-core 倉庫位置

狀態：**待決**
影響範圍：G2-A 啟動前定案；影響工程協作節奏
最後更新：2026-04-25

---

## 問題

gateway-core 是要併進 Matters 既有主 monorepo（如果有），還是維持獨立 sibling repo？

公開化也是這題的延伸：要不要從一開始就把 gateway-core 開源？以什麼授權？

---

## 選項

### A · 併入 Matters 主 monorepo
gateway-core 進入 matters.town 主後端的 repo 結構。

**優**：團隊共用 CI、PR review 流程、版本一致；後端工程師日常工作流不變。
**劣**：主 repo 通常 private；要公開 gateway-core 必須拆出去；外部貢獻者進不來。

### B · 獨立 sibling repo（公開）
`thematters/matters-fediverse-gateway` 獨立倉庫，完全公開，AGPL/MIT 授權。

**優**：可對外貢獻、可做 grant 交付物、可被第三方自架者 fork；符合本案 reference release 性質。
**劣**：與主站工程協作要透過 npm/git submodule/release tag；雙 repo 管理成本。

### C · 個人倉庫先行（mashbean/matters-fediverse-gateway）
先放在個人 namespace，待 Matters Lab 內部對齊後再轉到 thematters org。

**優**：移動最快；不卡組織決策；可立即公開展示與接受外部 PR。
**劣**：法律上的 IP 歸屬模糊（雖然 mashbean 是總經理）；轉移時 URL 改變、歷史 issue/PR 要遷移；對外品牌看起來是個人專案。

---

## 授權選擇

- **AGPL-3.0**：Mastodon、Misskey、GoToSocial 都用，是 federation server 慣例；強 copyleft，自架者修改後若提供服務需開源
- **Apache-2.0**：商業友善，專利條款清楚；可被閉源 fork
- **MIT**：最寬鬆；可被閉源 fork
- **AGPL + Matters CLA**：要求外部貢獻者簽 CLA，保留 Matters 未來商業選項

建議：**AGPL-3.0**，符合 federation 生態慣例與 grant 政治正確；若擔心商業被綁手，補一份 Matters CLA。

---

## 建議

**首發選 C（個人倉庫先行）→ 待 G2 啟動或 grant 通過後轉 B（thematters org）**：
- 立即可動：今天就能 push 到 `mashbean/matters-fediverse-gateway`
- 不卡組織內部 IP 歸屬討論
- 公開即可被 reviewer / 其他自架者看到
- 待 G2 對齊或 grant 通過後，使用 `gh repo transfer` 一鍵轉到 `thematters/matters-fediverse-gateway`，redirect 自動處理

授權建議 **AGPL-3.0**。

---

## 待 mashbean 拍板

- 採 A / B / C 哪個（建議 C，後續轉 B）？
- 授權採 AGPL / Apache / MIT 哪個？
- 是否要求 CLA？建議首發不要（會勸退貢獻者），grant 結案後再評估
- repo 轉移時間點：grant 結案？G2 啟動？還是某個明確里程碑（如 100 stars / 第一個外部 PR merge）？
