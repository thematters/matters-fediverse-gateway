---
task_slug: matters-g1-w3-misskey-gotosocial-interop
status: in_progress
goal: 補 Misskey 黑箱互通驗證；GoToSocial 依目前決策暫跳過
dispatcher: human-fallback
executor: codex-local
host: any
branch: task/matters-g1-w3-misskey-gotosocial-interop
latest_commit: UNSET
last_updated: 2026-05-02T11:25:00-04:00
tmux_session: none
host_affinity: none
outputs_scope: gateway-core
shared_paths:
  - $AI_SHARED_ROOT/ai-agent/research/matters-fediverse-compat
related_repos:
  - .
related_paths:
  - gateway-core/scripts/run-mastodon-sandbox-interop.mjs
  - gateway-core/scripts/run-misskey-sandbox-interop.mjs
  - gateway-core/scripts/run-gotosocial-sandbox-interop.mjs
  - research/matters-fediverse-compat/03-ops/mastodon-sandbox-interop.md
  - research/matters-fediverse-compat/03-ops/misskey-sandbox-interop.md
  - research/matters-fediverse-compat/03-ops/gotosocial-sandbox-interop.md
  - research/matters-fediverse-compat/03-ops/interop-run-template.md
  - research/matters-fediverse-compat/03-ops/mastodon-sandbox-run-20260321.md
  - research/matters-fediverse-compat/01-specs/social-interoperability-spec.md
local_paths:
  - none
start_command: none
stop_command: none
verify_command: cd gateway-core && npm run check:misskey-sandbox && npm run check:gotosocial-sandbox
next_step: Misskey public resolve / follow / relation probe 已完成。下一步是決定是否補 GoToSocial，或直接轉入 W4a 長文 Article 顯示差異整理。
blockers: GoToSocial 依目前決策暫不執行；full-scope Misskey staging token 應在 W3 證據不再需要後輪替或刪除；Zero Trust 延後處理，暫用本地 admin lockout
---

# Task Handoff

## Context

G1 工作項目 W3。目前已有 `mastodon.social` sandbox 黑箱驗證，以及 `g0v.social` 對 canonical `acct:matters@matters.town` 的 exact discovery 與 inbound follow delivery 驗證。Fediverse 的另兩個主要實作（Misskey、GoToSocial）行為差異不小，特別是 `Article` 顯示、HTTP signature 變體、followers collection 解析。要各跑一輪，確保互通故事不只綁 Mastodon 系列 instance。

## Acceptance Criteria

- `npm run check:misskey-sandbox` 與 `npm run check:gotosocial-sandbox` 兩支 probe 落地
- 每支至少驗證：actor resolve、follow/accept、入站 Create/Like/Announce、出站 Article post 在對方 timeline 顯示
- 各自產出 `run-<日期>.md` 報告，封存到 03-ops/
- 將顯示差異與相容性問題彙整成 issue 清單，餵回 W4a（長文 Article 系統化）

## Change Log

- 2026-04-25 created from G1 roadmap; not yet started
- 2026-05-01 updated current baseline after g0v.social exact discovery and inbound follow delivery against `acct:matters@matters.town`
- 2026-05-01 Decision 07 confirmed public-instance strategy and masking rule; waiting for test accounts and tokens
- 2026-05-01 user provided Misskey public account `https://gyutte.site/@mashbean`; Misskey probe script and local test landed, external run still waits for token and public gateway URL
- 2026-05-01 GoToSocial probe script and local test landed; external run still waits for public instance/account, token, and public gateway URL
- 2026-05-02 added `npm run report:interop` so public interop probe JSON can be converted into a repo-safe markdown report without leaking token-like fields
- 2026-05-02 Misskey public probe completed against `https://gyutte.site/@mashbean` and `https://staging-gateway.matters.town`: resolve succeeded via `users/show` fallback after `ap/show` returned 400; follow / relation converged with `isFollowing: true`; sanitized report archived at `research/matters-fediverse-compat/03-ops/misskey-public-run-20260502T152117Z.md`.
- 2026-05-02 user confirmed Misskey is sufficient for now; GoToSocial public run is skipped until a later decision.

## Validation

- 2026-05-02 `node --test --test-name-pattern "interop report|misskey sandbox|gotosocial sandbox"` passed 4/4
- 2026-05-02 `node scripts/run-gotosocial-sandbox-interop.mjs --dry-run-contract` passed and emitted no secrets
- 2026-05-02 full `runtime/tools/node-local --test` passed 111/111
- 2026-05-02 `runtime/tools/node-local --test --test-name-pattern='misskey sandbox interop' test/gateway-core.test.mjs` passed 3/3 after adding `ap/show` fallback and `ALREADY_FOLLOWING` handling
