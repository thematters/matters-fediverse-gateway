# 共用工程交付原則

- 研究語言以台灣繁體中文為主，技術名詞保留英文
- 先區分已確認事實、合理推論、未證實假設
- 先把 spec、驗收點、已知風險寫清楚，再談延伸方向
- 不把 Meson / IPNS 的內容傳輸問題和 ActivityPub 的社交互通問題混成同一件事
- `ipns-site-generator` 仍是內容輸出層，動態互通責任由 gateway 與 control plane 承接
- paid、private、encrypted 內容在 ACL 與授權模型完成前不得 federation
- 每個 stage 至少要留下 brief、spec、review、handoff 中的對應輸出
