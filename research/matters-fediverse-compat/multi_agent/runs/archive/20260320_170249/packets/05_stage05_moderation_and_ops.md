# Moderation And Ops

- Run ID: `20260320_170249`
- Stage ID: `stage05_moderation_and_ops`
- 目標: 定義 moderation、domain policy、abuse handling、delivery retry 與 launch control 面
- Stage 資料夾: `multi_agent/runs/20260320_170249/stages/05_stage05_moderation_and_ops`

## 固定 Brief

- `multi_agent/stage_briefs/stage05_moderation_and_ops.md`

## 交付項目

- moderation and ops spec
- ADR-004 public content boundary
- operations review gate

## 使用 Prompt

- 共用底稿: `multi_agent/agents/common_system_prompt.md`
- 總編排: `multi_agent/agents/orchestrator.md`
- `writer`: `multi_agent/agents/writer.md`
- `ops_reviewer`: `multi_agent/agents/ops_reviewer.md`
- `reviewer`: `multi_agent/agents/reviewer.md`
- `editor`: `multi_agent/agents/editor.md`

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

