# Matters × Fediverse Workspace

在 Matters 站前架一座「大使館」（代號 `gateway-core`），讓長文能以 ActivityPub `Article` 型別雙向對接 Fediverse（Mastodon / Misskey / GoToSocial），同時保護付費/加密/私訊內容不外流。

最後更新：2026-05-01

---

## 現況一眼看

- **完成度**：單實例 gateway 原型可跑，107 tests passing，已與 `mastodon.social` 完成第一輪黑箱互通；canonical `acct:matters@matters.town` 已透過 `g0v.social` 完成 exact discovery 與 inbound follow delivery 驗證，Misskey / GoToSocial probes 已有本地驗證
- **目前階段**：G1 · 官方聯邦化基礎版（3 個月，2026-05 ~ 2026-07）
- **下一步**：真環境值班演習 + 長文 Article 系統化 + Misskey/GoToSocial 互通驗證
- **程式碼**：[`gateway-core/`](../../gateway-core)（sibling repo root）

---

## 目標三層

| 目標 | 一句話 | 時程 | 成本 |
|---|---|---|---|
| **G1** 官方聯邦化基礎版 | 可自架、能跟三家實作互通的 reference release | 3 個月 | €13k–17k |
| **G2** Matters 主站導入 | 把大使館接到 matters.town 前，分階段 rollout | 4–6 個月 | €55k–85k |
| **G3** 多站同源驗證 | 第二個 instance 成功運作，證明可重用 | 2 個月 | €8k–12k |

完整計畫：[05-roadmap/development-plan.md](05-roadmap/development-plan.md)

---

## 資料夾結構

| 資料夾 | 內容 |
|---|---|
| [00-research/](00-research/) | 凍結的研究產物：feasibility memo、ADR × 6、upstream audit |
| [01-specs/](01-specs/) | 工程規格（source of truth）：instance / identity / gateway / social / moderation / multi-instance |
| [02-runtime-slices/](02-runtime-slices/) | 每個工程切片的實作紀錄（content model / notification / evidence / queue durability 等 22 份） |
| [03-ops/](03-ops/) | 部署與營運：topology、runbook、launch checklist、production gaps、sandbox interop report |
| [04-status/](04-status/) | 時間序狀態快照：implementation progress、status summary、next steps、task seeds |
| [05-roadmap/](05-roadmap/) | **往前看：開發藍圖、G1/G2/G3 規劃** |
| [multi_agent/](multi_agent/) | 多代理工作流：活的 run 放 `runs/20260320_170637/`，歷史 run 放 `runs/archive/` |
| [processed/](processed/) | 研究期 gap analysis（已整理但未歸併到 specs 的原始材料） |
| [raw/](raw/) | 原始來源、論文 metadata |

---

## 關鍵決策

- **對外型別**：ActivityPub `Article`（不降級成 `Note`） — 見 [00-research/adr/ADR-006](00-research/adr/ADR-006-longform-object-mapping.md)
- **內容邊界**：僅公開內容進聯邦；付費/加密/私訊僅給 preview + canonical link — 見 [00-research/adr/ADR-004](00-research/adr/ADR-004-public-content-boundary.md)
- **架構選型**：Static publisher + inbox bridge，不是完整 federation server — 見 [00-research/feasibility-memo.md](00-research/feasibility-memo.md)
- **Canonical URL**：以 `@user@matters.town` / `acct:matters@matters.town` 為主；`gateway-demo.matters.town` 只作為隔離 Worker testbed

---

## 相關任務

- 活躍 task：[matters-gateway-core-minimum-slice](../../docs/tasks/matters-gateway-core-minimum-slice.md)
- 最新 interop 紀錄：[mastodon-exact-discovery-run-20260501.md](03-ops/mastodon-exact-discovery-run-20260501.md)
