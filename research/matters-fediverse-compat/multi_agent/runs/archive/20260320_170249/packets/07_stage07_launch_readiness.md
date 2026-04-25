# Launch Readiness

- Run ID: `20260320_170249`
- Stage ID: `stage07_launch_readiness`
- 目標: 整合 launch gate、測試矩陣、runbook 與下一輪工程 task，讓後續 agent 可直接進入實作
- Stage 資料夾: `multi_agent/runs/20260320_170249/stages/07_stage07_launch_readiness`

## 固定 Brief

- `multi_agent/stage_briefs/stage07_launch_readiness.md`

## 交付項目

- updated next steps
- engineering task seeds
- launch readiness handoff

## 使用 Prompt

- 共用底稿: `multi_agent/agents/common_system_prompt.md`
- 總編排: `multi_agent/agents/orchestrator.md`
- `planner`: `multi_agent/agents/planner.md`
- `editor`: `multi_agent/agents/editor.md`
- `reviewer`: `multi_agent/agents/reviewer.md`
- `ops_reviewer`: `multi_agent/agents/ops_reviewer.md`

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
- outputs 數量: 10
- multi_agent/stage_briefs 數量: 7
- external/ipns-site-generator/src 數量: 51
- 總數: 90

## 備註

- 完成本階段後，使用 `advance` 推進流程
- 如資料夾新增檔案，先執行 `refresh-sources` 再繼續

