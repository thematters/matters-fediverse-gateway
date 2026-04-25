# Handoff

## 交付來源

- 階段  
  `stage05_architecture_options`
- 代理人  
  `codex-local`
- 日期  
  `2026-03-20`

## 交付內容摘要

- 三條架構路線已完成比較
- 目前推薦方向是 `Static publisher + inbox bridge`
- 內容邊界已明確收斂  
  只有公開文章與公開互動能進 federation  
  加密 / 付費 / 私密內容不直接進聯邦

## 已確認事項

- `Static publisher only` 最接近現況，但無法跨過完整 federation 的核心缺口
- `Static publisher + inbox bridge` 最適合承接 canonical identity、followers collection、key lifecycle 與 moderation hooks
- `Full dynamic federation layer` 長期可能成立，但第一步成本過高

## 待處理事項

- 把推薦架構拆成最小 prototype backlog
- 把 protocol gap 與 governance 邊界整合成最終決策文件

## 推薦下一手

- 建議接手代理人  
  `synthesis_editor`
- 建議優先處理順序  
  先整理最終 memo  
  再把 backlog 和下一步 task 明文化
