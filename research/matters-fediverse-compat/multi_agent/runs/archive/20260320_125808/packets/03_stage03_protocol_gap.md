# 協定缺口分析

- Run ID: `20260320_125808`
- Stage ID: `stage03_protocol_gap`
- 目標: 把現況對照完整 federation 所需能力，產出 protocol gap matrix

## 交付項目

- protocol gap matrix
- 最小補強清單

## 使用 Prompt

- 共用底稿: `multi_agent/agents/common_system_prompt.md`
- 總編排: `multi_agent/agents/orchestrator.md`
- `protocol_gap_analyst`: `multi_agent/agents/protocol_gap_analyst.md`

## 輸出模板

- Agent 輸出: `multi_agent/templates/agent_output.md`
- 交接模板: `multi_agent/templates/handoff.md`

## 可用來源

- 來源清單: `multi_agent/state/source_manifest.json`
- raw 數量: 5
- docs 數量: 2
- processed 數量: 7
- external/ipns-site-generator 數量: 94
- 總數: 108

## 備註

- 完成本階段後，使用 `advance` 推進流程
- 如資料夾新增檔案，先執行 `refresh-sources` 再繼續

