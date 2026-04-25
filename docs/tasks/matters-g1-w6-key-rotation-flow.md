---
task_slug: matters-g1-w6-key-rotation-flow
status: queued
goal: 實作 gateway 的金鑰輪替流程，含 overlap window、rotation script 與 runbook
dispatcher: human-fallback
executor: codex-local
host: any
branch: task/matters-g1-w6-key-rotation-flow
latest_commit: UNSET
last_updated: 2026-04-25T00:00:00+08:00
tmux_session: none
host_affinity: none
outputs_scope: gateway-core
shared_paths:
  - $AI_SHARED_ROOT/ai-agent/research/matters-fediverse-compat
related_repos:
  - .
related_paths:
  - gateway-core/src/security/http-signatures.mjs
  - gateway-core/src/lib/remote-actors.mjs
  - research/matters-fediverse-compat/00-research/adr/ADR-003-follower-state-and-key-ownership.md
  - research/matters-fediverse-compat/01-specs/identity-foundation-spec.md
local_paths:
  - none
start_command: none
stop_command: none
verify_command: cd gateway-core && npm test
next_step: 設計 actor 多 publicKey 並存模型，寫 `npm run rotate:key`，補單元測試與 runbook
blockers: none
---

# Task Handoff

## Context

G1 工作項目 W6。目前 gateway actor 只支援單把 publicKey；要支援金鑰輪替，需要：
1. actor 對外宣告兩把 key（current + previous）的 overlap window
2. 簽章驗章接受任一 key
3. 輪替腳本能 generate 新 key、寫 config、broadcast Update Actor、過 N 天後退場舊 key

## Acceptance Criteria

- actor 模型支援 `publicKey` 與 `previousPublicKey` 並存
- 入站簽章驗證能 fallback 到 previous key（在 overlap window 內）
- `npm run rotate:key -- --actor <handle>` 可一鍵執行：產生新 key → 更新 config → 發 Update Actor → 記錄 rotation event
- 單元測試覆蓋 rotation 三階段（pre / overlap / post）
- Runbook：何時輪替、輪替前檢查清單、出錯回滾步驟

## Change Log

- 2026-04-25 created from G1 roadmap; not yet started

## Validation

- TBD
