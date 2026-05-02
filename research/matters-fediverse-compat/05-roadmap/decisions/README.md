# 待決策題索引

進入 G1 / G2 各階段前需要拍板的產品與運維決策。每份備忘列出選項、利弊、建議與待確認問題。

01-05 於 **2026-04-25** 由 mashbean（Matters 總經理）拍板；06-07 於 **2026-05-01** 補充 G1 運維與執行決策。

| # | 主題 | 卡哪個工作項目 | 決議 |
|---|---|---|---|
| [01](01-canonical-url.md) | Canonical URL 策略 | G2-B | **A** · `acct:user@matters.town` |
| [02](02-html-sanitizer-rules.md) | Article HTML Sanitizer 規則 | W4a | **C** · 中道 + ipfs.io gateway + 附原始連結 |
| [03](03-paywall-preview-policy.md) | 付費文外部呈現策略 | W5 | **A** · 完全隱形 |
| [04](04-opt-in-vs-opt-out.md) | 既有使用者聯邦化採用模式 | G2-D / G2-E | **C + D** · 階段 opt-in × per-article 細緻度 |
| [05](05-monorepo-vs-sibling.md) | gateway-core 倉庫位置與授權 | G2-A | **C → B** · 個人倉庫先行，G2 啟動後遷移；AGPL-3.0；無 CLA |
| [06](06-runtime-state-source-of-truth.md) | Runtime state source of truth | W2 / G1-B3 | SQLite 為主；file state 為輔助 / migration 檢查 |
| [07](07-g1-human-gates.md) | G1 human gates | G1-A / W1 / W3 / W8 / W6 | G1-A 最小 v1；明確 non-public 才排除；staging / interop / tabletop / production rotation 由真人控管 |
