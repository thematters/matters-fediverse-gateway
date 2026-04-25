# 整合建議與後續 task

- Run ID: `20260320_125808`
- Stage ID: `stage06_recommendation`
- 目標: 整合研究結果，形成 feasibility memo、next steps 與 prototype backlog

## 交付項目

- feasibility memo
- next steps
- prototype backlog

## 使用 Prompt

- 共用底稿: `multi_agent/agents/common_system_prompt.md`
- 總編排: `multi_agent/agents/orchestrator.md`
- `synthesis_editor`: `multi_agent/agents/synthesis_editor.md`

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

