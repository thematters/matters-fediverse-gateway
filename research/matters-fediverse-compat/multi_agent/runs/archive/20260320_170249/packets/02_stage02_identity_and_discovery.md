# Identity And Discovery

- Run ID: `20260320_170249`
- Stage ID: `stage02_identity_and_discovery`
- 目標: 固定 actor ID、WebFinger、aliases、followers/following 與 key ownership 規則
- Stage 資料夾: `multi_agent/runs/20260320_170249/stages/02_stage02_identity_and_discovery`

## 固定 Brief

- `multi_agent/stage_briefs/stage02_identity_and_discovery.md`

## 交付項目

- identity and discovery spec
- ADR-002 canonical identity and discovery
- ADR-003 follower state and key ownership
- identity review gate

## 使用 Prompt

- 共用底稿: `multi_agent/agents/common_system_prompt.md`
- 總編排: `multi_agent/agents/orchestrator.md`
- `writer`: `multi_agent/agents/writer.md`
- `architect`: `multi_agent/agents/architect.md`
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
- outputs 數量: 10
- multi_agent/stage_briefs 數量: 7
- external/ipns-site-generator/src 數量: 51
- 總數: 90

## 備註

- 完成本階段後，使用 `advance` 推進流程
- 如資料夾新增檔案，先執行 `refresh-sources` 再繼續

