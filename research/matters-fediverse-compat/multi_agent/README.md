# Matters Interoperability Multi-Agent Workspace

這個工作台把 Matters instance 與外部互通的工程交付流程切成可 handoff 的階段，讓不同 agent 可以在不依賴聊天室的情況下持續接手。

## 目錄

- `agents/` 放各角色 prompt
- `config/pipeline.json` 放工程交付流程定義
- `scripts/delivery_flow.py` 放本地 workflow runner
- `scripts/research_flow.py` 保留作為相容入口
- `stage_briefs/` 放每個 stage 的固定 brief
- `state/` 放目前 active run、source manifest、delivery board
- `runs/` 放每一輪 delivery run 的 packets 與 journal
- `templates/` 放 agent output 與 handoff 模板

## 常用指令

```bash
python3 multi_agent/scripts/delivery_flow.py bootstrap --new-run
python3 multi_agent/scripts/delivery_flow.py status
python3 multi_agent/scripts/delivery_flow.py current-stage
python3 multi_agent/scripts/delivery_flow.py advance --note "stage complete"
python3 multi_agent/scripts/delivery_flow.py refresh-sources
python3 multi_agent/scripts/delivery_flow.py list-agents
```

## 角色分工

- `planner`
  維護 stage、owner、成功條件與 next step
- `writer`
  把研究與既有結論轉成 implementation-ready spec
- `architect`
  固定 system boundary、介面、ID 規則與事件流
- `implementer`
  承接可驗證切片、測試與實作說明
- `reviewer`
  檢查 ActivityPub / WebFinger / Mastodon compatibility 與測試缺口
- `editor`
  整理規格、review 與 handoff 成品
- `ops_reviewer`
  檢查 moderation、delivery、abuse 與營運控制面

## 接手規則

- 先看 `state/delivery_board.md`
- 再看 `runs/<run_id>/packets/` 的當前階段封包
- 若要看固定 stage 目標，先讀 `stage_briefs/`
- 每輪輸出至少要補 `brief`、`spec`、`review`、`handoff`
