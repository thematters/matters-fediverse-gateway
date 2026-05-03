---
task_slug: matters-g1-w5-paid-private-boundary-enforcement
status: done
goal: 在程式碼層級嚴格執行付費 / 加密 / 私訊內容不外流，並提供 admin 可視化驗收
dispatcher: human-fallback
executor: codex-local
host: any
branch: task/matters-g1-w5-paid-private-boundary-enforcement
latest_commit: 627f8ff
last_updated: 2026-05-01T18:12:00-04:00
tmux_session: none
host_affinity: none
outputs_scope: gateway-core
shared_paths:
  - $AI_SHARED_ROOT/ai-agent/research/matters-fediverse-compat
related_repos:
  - .
  - external/ipns-site-generator
related_paths:
  - gateway-core/src/lib/static-outbox-bridge.mjs
  - research/matters-fediverse-compat/00-research/adr/ADR-004-public-content-boundary.md
  - research/matters-fediverse-compat/05-roadmap/decisions/03-paywall-preview-policy.md
local_paths:
  - none
start_command: none
stop_command: none
verify_command: cd gateway-core && npm test
next_step: 若要延伸到 dynamic outbound create / update / delete routes，先確認 payload contract 與 non-public 錯誤語意
blockers: none
---

# Task Handoff

## Context

G1 工作項目 W5。目前付費/加密/私訊邊界靠原則與規格文件，沒有程式碼層強制。Matters 商業模式繫於這條邊界，不能靠自律。

## Acceptance Criteria

- `static-outbox-bridge` 入口 visibility gate：non-public visibility 直接 drop，不可繞過
- 單元測試覆蓋 visibility 矩陣（public / paid / encrypted / private / mixed thread）
- `/admin/visibility-audit` 端點可列出近 N 筆對外 fan-out 的 visibility 標記，供人工抽查
- 整合測試：偽造 paid article 經 bridge，斷言不出現在 outbox / Create activity
- 文件補上：作者操作 UI 端如何把錯誤標記內容回收

## Change Log

- 2026-04-25 created from G1 roadmap; not yet started
- 2026-05-01 completed by codex-local in `627f8ff`; added static outbox public-only visibility gate, visibility audit endpoint, and visibility matrix tests

## Validation

- 2026-05-01 `node --test --test-name-pattern "visibility audit|outbox bridge" test/gateway-core.test.mjs`：2 pass / 0 fail
- 2026-05-01 `node --test`：96 pass / 0 fail
- 2026-05-01 `git diff --check`：pass
