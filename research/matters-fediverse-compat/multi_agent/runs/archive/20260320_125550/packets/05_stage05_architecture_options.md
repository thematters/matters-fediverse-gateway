# 架構選項比較

- Run ID: `20260320_125550`
- Stage ID: `stage05_architecture_options`
- 目標: 比較 Static publisher only、Static publisher + inbox bridge、Full dynamic federation layer

## 交付項目

- 架構比較表
- 推薦路線草案

## 使用 Prompt

- 共用底稿: `multi_agent/agents/common_system_prompt.md`
- 總編排: `multi_agent/agents/orchestrator.md`
- `architecture_analyst`: `multi_agent/agents/architecture_analyst.md`

## 輸出模板

- Agent 輸出: `multi_agent/templates/agent_output.md`
- 交接模板: `multi_agent/templates/handoff.md`

## 可用來源

- 來源清單: `multi_agent/state/source_manifest.json`
- docs 數量: 2
- raw 數量: 5
- upstream inventory 數量: 1
- 總數: 8

## 備註

- 完成本階段後，使用 `advance` 推進流程
- 如資料夾新增檔案，先執行 `refresh-sources` 再繼續

