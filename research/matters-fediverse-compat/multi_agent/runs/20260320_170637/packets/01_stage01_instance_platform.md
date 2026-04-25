# Instance Platform

- Run ID: `20260320_170637`
- Stage ID: `stage01_instance_platform`
- 目標: 定義 Matters 官方 instance 的平台邊界、對外身分、policy 與 launch baseline
- Stage 資料夾: `multi_agent/runs/20260320_170637/stages/01_stage01_instance_platform`

## 固定 Brief

- `multi_agent/stage_briefs/stage01_instance_platform.md`

## 交付項目

- stage brief
- instance platform spec
- ADR-001 federation architecture
- ADR-005 instance governance surface

## 使用 Prompt

- 共用底稿: `multi_agent/agents/common_system_prompt.md`
- 總編排: `multi_agent/agents/orchestrator.md`
- `planner`: `multi_agent/agents/planner.md`
- `writer`: `multi_agent/agents/writer.md`
- `architect`: `multi_agent/agents/architect.md`

## 輸出模板

- Agent 輸出: `multi_agent/templates/agent_output.md`
- 交接模板: `multi_agent/templates/handoff.md`

## Stage 文件

- `brief.md`
- `spec.md`
- `review.md`
- `handoff.md`

## 可用來源

- 來源清單: `multi_agent/state/source_manifest.json`
- raw 數量: 5
- docs 數量: 8
- processed 數量: 9
- outputs 數量: 13
- multi_agent/stage_briefs 數量: 7
- external/ipns-site-generator/src 數量: 51
- 總數: 93

## 備註

- 完成本階段後，使用 `advance` 推進流程
- 如資料夾新增檔案，先執行 `refresh-sources` 再繼續

