# Architecture Options Comparison

## Static publisher only

- 能力集中在 WebFinger、actor、outbox 與公開文章廣播
- 與現有 IPNS / Meson 路線最接近
- 複雜度最低
- 不足以支撐完整 federation
- 最容易維持「只公開 federate 公開內容，付費 / 加密內容完全不進聯邦」的內容邊界
- 現階段還會直接卡在 `followers.jsonld` 未生成、`publicKey` 沒有 key material、`inbox` 只有宣告沒有處理邏輯

## Static publisher + inbox bridge

- 保留靜態內容與 outbox 發佈
- 另外新增最小動態 bridge，處理 inbox、簽章、followers state、delivery queue、moderation hooks
- 能用最小新增元件補齊完整 federation 的必要核心
- 是本輪最平衡的推薦方向
- 可以把 bridge 的責任限制在公開內容與公開互動，不去承接加密 / 付費內容的解密或散佈
- 也最適合承接 canonical identity、followers collection owner、key lifecycle 這三個目前最明確的 concrete gap

## Full dynamic federation layer

- 建立完整動態 federation server，處理 actor、inbox、outbox、delivery、social graph 與 moderation
- 對完整 federation 最直接
- 變更面與營運成本最高
- 若未先收斂內容邊界，最容易把加密 / 付費內容政策與 federated delivery 綁死在同一個服務裡
- 若產品最終要把 follow、reply、reaction 與治理責任都當成核心能力，長期可能仍會往這裡走

## Recommendation

- 第一輪研究先以 `Static publisher + inbox bridge` 當推薦方向
- 長期是否演進到 `Full dynamic federation layer`，取決於 follow、reply、reaction 與治理負擔的產品優先度
- 不論採哪條路線，第一個 prototype 都應維持一條硬邊界  
  只有公開文章與公開互動能進 federation  
  加密 / 付費 / 私密內容不直接進聯邦
