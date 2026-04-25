# Social Interoperability

- Run ID: `20260320_170637`
- Stage ID: `stage04_social_interop`
- 目標: 定義 Matters 與外部 instance 之間的 social loop、事件映射與 acceptance criteria
- Stage 資料夾: `multi_agent/runs/20260320_170637/stages/04_stage04_social_interop`

## 固定 Brief

- `multi_agent/stage_briefs/stage04_social_interop.md`

## 交付項目

- social interoperability spec
- ADR-006 longform object mapping
- social loop review gate

## 使用 Prompt

- 共用底稿: `multi_agent/agents/common_system_prompt.md`
- 總編排: `multi_agent/agents/orchestrator.md`
- `writer`: `multi_agent/agents/writer.md`
- `architect`: `multi_agent/agents/architect.md`
- `implementer`: `multi_agent/agents/implementer.md`
- `reviewer`: `multi_agent/agents/reviewer.md`

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

