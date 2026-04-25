---
task_slug: matters-g1-w3-misskey-gotosocial-interop
status: queued
goal: 補 Misskey 與 GoToSocial 的黑箱互通驗證，確保 gateway 不只綁 Mastodon 一家
dispatcher: human-fallback
executor: codex-local
host: any
branch: task/matters-g1-w3-misskey-gotosocial-interop
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
  - gateway-core/scripts/run-mastodon-sandbox-interop.mjs
  - research/matters-fediverse-compat/03-ops/mastodon-sandbox-interop.md
  - research/matters-fediverse-compat/03-ops/mastodon-sandbox-run-20260321.md
  - research/matters-fediverse-compat/01-specs/social-interoperability-spec.md
local_paths:
  - none
start_command: none
stop_command: none
verify_command: cd gateway-core && npm run check:misskey-sandbox && npm run check:gotosocial-sandbox
next_step: 仿 `run-mastodon-sandbox-interop.mjs` 寫兩支 probe，建立 Misskey / GoToSocial 測試帳號，跑互通並封存 run report
blockers: 需要 Misskey 與 GoToSocial 測試 instance（可用公開 instance 或自架）+ 測試帳號 + access token
---

# Task Handoff

## Context

G1 工作項目 W3。目前只在 mastodon.social 完成第一輪黑箱驗證；Fediverse 的另兩個主要實作（Misskey、GoToSocial）行為差異不小，特別是 `Article` 顯示、HTTP signature 變體、followers collection 解析。要各跑一輪，確保互通故事不只綁單一鄰國。

## Acceptance Criteria

- `npm run check:misskey-sandbox` 與 `npm run check:gotosocial-sandbox` 兩支 probe 落地
- 每支至少驗證：actor resolve、follow/accept、入站 Create/Like/Announce、出站 Article post 在對方 timeline 顯示
- 各自產出 `run-<日期>.md` 報告，封存到 03-ops/
- 將顯示差異與相容性問題彙整成 issue 清單，餵回 W4a（長文 Article 系統化）

## Change Log

- 2026-04-25 created from G1 roadmap; not yet started

## Validation

- TBD
